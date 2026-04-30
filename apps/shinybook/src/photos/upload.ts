// Upload helper for picked-from-device photos. Wraps the api/photos
// uploadPhoto with the metadata derivation expected by the server schema
// (extension regex + content-type whitelist).
//
// Phase 5 calls this synchronously after picking — local URI in, S3 key out.
// Offline behavior: if the upload fails, callers keep the local URI in place
// and a future retry can call this again.

import * as photosApi from "../api/photos";

const ALLOWED_EXT_TO_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

interface UploadInput {
  paintingId: string;
  localUri: string;
  // From expo-image-picker asset (preferred when present).
  mimeType?: string;
  fileName?: string;
}

export async function uploadPickedPhoto(input: UploadInput): Promise<string> {
  const { contentType, extension } = deriveTypeAndExt(input);
  return photosApi.uploadPhoto({
    paintingId: input.paintingId,
    localUri: input.localUri,
    contentType,
    extension,
  });
}

function deriveTypeAndExt(input: UploadInput): {
  contentType: string;
  extension: string;
} {
  // Prefer the picker's mimeType when it's in our allow-list.
  if (input.mimeType && /^image\/(png|jpe?g|webp|heic|heif)$/i.test(input.mimeType)) {
    const ext = mimeToExt(input.mimeType);
    return { contentType: input.mimeType.toLowerCase(), extension: ext };
  }

  // Fall back to extracting an extension from fileName or URI.
  const candidate =
    extFromName(input.fileName) ?? extFromName(input.localUri) ?? "jpg";
  const normalized = candidate.toLowerCase();
  const contentType = ALLOWED_EXT_TO_TYPE[normalized] ?? "image/jpeg";
  const extension = normalized in ALLOWED_EXT_TO_TYPE ? normalized : "jpg";
  return { contentType, extension };
}

function mimeToExt(mime: string): string {
  const lower = mime.toLowerCase();
  if (lower === "image/jpeg") return "jpg";
  if (lower === "image/png") return "png";
  if (lower === "image/webp") return "webp";
  if (lower === "image/heic") return "heic";
  if (lower === "image/heif") return "heif";
  return "jpg";
}

function extFromName(name: string | undefined): string | null {
  if (!name) return null;
  const m = /\.([a-z0-9]{1,8})(?:\?|#|$)/i.exec(name);
  return m ? m[1] : null;
}
