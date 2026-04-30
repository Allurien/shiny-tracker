// Photo reference resolver.
//
// A "photo ref" stored on a Painting can be one of three things:
//   1. An S3 key (e.g. "<sub>/<paintingId>/<uuid>.jpg") — uploaded to our
//      bucket. Needs a signed GET URL to render.
//   2. A local file URI (file://, blob:, data:) — picked from the device,
//      not yet uploaded (or upload pending). Renders directly.
//   3. A public HTTP(s) URL (e.g. shopify CDN cover from scraper). Renders
//      directly.
//
// Discriminator: refs containing "://" are renderable as-is. Everything else
// is treated as an S3 key and resolved via the /photos/sign-view endpoint.
//
// Signed URLs are cached in-memory with a TTL slightly under the server's
// 1h expiry so we don't burn a round trip per render.

import * as photosApi from "../api/photos";

interface CacheEntry {
  url: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 50 * 60 * 1000; // server signs for 1h; refresh ~10min early
const cache = new Map<string, CacheEntry>();

// Pending sign-view promises so concurrent callers for the same key share
// a single network request.
const inflight = new Map<string, Promise<string>>();

export function isRemoteKey(ref: string): boolean {
  return !ref.includes("://");
}

// True for refs that other devices can render: S3 keys (no scheme) and
// public HTTP(S) URLs. False for device-local schemes (file://, blob:,
// content://, data:) which are meaningless off the originating device.
//
// Used by the sync layer to strip in-flight uploads from outbound payloads
// so the server never stores an unrenderable ref.
export function isPersistableRef(ref: string): boolean {
  if (isRemoteKey(ref)) return true;
  return /^https?:\/\//i.test(ref);
}

// Pass-through if the ref is already renderable, else sign + cache.
export async function resolvePhotoUrl(ref: string): Promise<string> {
  if (!isRemoteKey(ref)) return ref;

  const cached = cache.get(ref);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  let pending = inflight.get(ref);
  if (!pending) {
    pending = (async () => {
      try {
        const url = await photosApi.signView(ref);
        cache.set(ref, { url, expiresAt: Date.now() + CACHE_TTL_MS });
        return url;
      } finally {
        inflight.delete(ref);
      }
    })();
    inflight.set(ref, pending);
  }
  return pending;
}

// Drop a key from the cache (e.g. after deletion) so a subsequent resolve
// doesn't return a stale signed URL.
export function invalidatePhotoUrl(ref: string): void {
  cache.delete(ref);
}

export function clearPhotoCache(): void {
  cache.clear();
  inflight.clear();
}
