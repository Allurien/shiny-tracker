// Photo upload/view flow via pre-signed S3 URLs.
//
// Upload:
//   1. Call `signUpload` with paintingId + contentType → returns { key, url }.
//   2. PUT the file bytes directly to `url`.
//   3. Persist `key` on the painting (coverImage / progressPhotos).
//
// View:
//   1. Call `signView` with the stored key → returns { url } valid ~1h.
//
// Phase 5 will wire this into PhotoGrid / cover image flows. For phase 2 we
// only expose the transport primitives.

import { requestJson } from "./client";

interface SignUploadResponse {
  key: string;
  url: string;
}
interface SignViewResponse {
  url: string;
}

export async function signUpload(args: {
  paintingId: string;
  contentType: string;
  extension: string;
}): Promise<SignUploadResponse> {
  return requestJson<SignUploadResponse>("/photos/sign-upload", {
    method: "POST",
    body: args,
  });
}

export async function signView(key: string): Promise<string> {
  const { url } = await requestJson<SignViewResponse>("/photos/sign-view", {
    method: "POST",
    body: { key },
  });
  return url;
}

// Convenience wrapper: take a local file URI + metadata, sign + PUT it, and
// return the stored S3 key. Callers store the key in the painting record.
export async function uploadPhoto(args: {
  paintingId: string;
  localUri: string;
  contentType: string;
  extension: string;
}): Promise<string> {
  const { key, url } = await signUpload({
    paintingId: args.paintingId,
    contentType: args.contentType,
    extension: args.extension,
  });
  const blob = await fetch(args.localUri).then((r) => r.blob());
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": args.contentType },
    body: blob,
  });
  if (!res.ok) throw new Error(`photo upload failed: HTTP ${res.status}`);
  return key;
}
