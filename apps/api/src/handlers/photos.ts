// Pre-signed URL endpoints for the S3 photo bucket.
//
// Upload flow:
//   1. Client calls POST /photos/sign-upload with paintingId + contentType.
//   2. We return { key, url } — client PUTs the file directly to S3.
//   3. Client persists `key` on the Painting (coverImage / progressPhotos).
//
// View flow:
//   1. Client calls POST /photos/sign-view with a stored key.
//   2. We return { url } — a pre-signed GET valid for ~1 hour.
//
// Keys are namespaced `<sub>/<paintingId>/<uuid>.<ext>` so a user can never
// sign an upload into another user's prefix.

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { Resource } from "sst";
import { requireUserId } from "../lib/auth";
import { wrap } from "../lib/handler";
import { badRequest, ok } from "../lib/response";
import { parseJson, signUploadSchema, signViewSchema } from "../lib/validate";

const s3 = new S3Client({});
const BUCKET = Resource.Photos.name;

export const signUpload = wrap(async (event) => {
  const sub = requireUserId(event);
  const { paintingId, contentType, extension } = signUploadSchema.parse(
    parseJson(event.body),
  );
  const key = `${sub}/${paintingId}/${randomUUID()}.${extension.toLowerCase()}`;
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 60 * 5 },
  );
  return ok({ key, url });
});

export const signView = wrap(async (event) => {
  const sub = requireUserId(event);
  const { key } = signViewSchema.parse(parseJson(event.body));
  if (!key.startsWith(`${sub}/`)) return badRequest("key not owned by caller");
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 60 * 60 },
  );
  return ok({ url });
});
