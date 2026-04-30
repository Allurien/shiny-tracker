// Paintings repo — offline-first wrapper around the local DB. Every mutation
// writes to SQLite first (so the UI sees it immediately), then enqueues an
// outbox row for the sync manager to flush to the server. Reads are pure
// passthroughs to the DB layer; the sync manager keeps the DB current with
// remote changes via /sync.
//
// Signatures mirror src/db/paintings.ts so call sites can swap import paths
// without behavior changes (modulo the kick-after-write side effect).

import * as db from "../db/paintings";
import * as outbox from "../db/outbox";
import { isPersistableRef } from "../photos/url";
import { kick } from "../sync/manager";
import type { Painting, PaintingPatch, PaintingStatus } from "../types/painting";

// Strip device-local photo refs (file://, blob:, content://, data:) from a
// payload before sync. They stay in the local DB so the originating device
// keeps showing them while uploads complete; once each upload swaps the
// local URI for an S3 key, a follow-up update pushes the persistable form
// to the server. `null` is preserved — it's the "clear this field" sentinel.
function sanitizePhotoRefs<T extends PaintingPatch>(payload: T): T {
  const out: PaintingPatch = { ...payload };
  if (
    "coverImage" in out
    && typeof out.coverImage === "string"
    && !isPersistableRef(out.coverImage)
  ) {
    delete out.coverImage;
  }
  if ("progressPhotos" in out && Array.isArray(out.progressPhotos)) {
    out.progressPhotos = out.progressPhotos.filter(isPersistableRef);
  }
  return out as T;
}

// Title-case a SHOUTED brand. Only triggers when the input is uniformly
// upper- or lower-cased AND contains a space — short single-word inputs are
// almost always intentional (acronyms like "DAC", "OOAK", or stylized names
// like "iPhone"), so leave those alone. "DIAMOND ART CLUB" → "Diamond Art
// Club"; "DAC" stays "DAC"; "Diamond Art Club" stays unchanged.
function titleCaseBrand(raw: string): string {
  if (!raw.includes(" ")) return raw;
  const hasUpper = /[A-Z]/.test(raw);
  const hasLower = /[a-z]/.test(raw);
  if (hasUpper && hasLower) return raw; // mixed case → user's choice, leave it
  return raw
    .toLowerCase()
    .split(/(\s+)/)
    .map((part) => (/^\s+$/.test(part) ? part : part[0]?.toUpperCase() + part.slice(1)))
    .join("");
}

// Snap an incoming brand to a normalized form, then to whatever casing
// already exists in the collection for the same lowercase form. Two layers:
//
//   1. Title-case shouted/whispered inputs (DIAMOND ART CLUB → Diamond Art
//      Club). New brand-new entries get a clean form on first import.
//   2. Match existing brands case-insensitively so further imports converge
//      on whatever's already there. Avoids DAC product-page imports
//      ("Diamond Art Club") and Amazon imports ("DIAMOND ART CLUB") landing
//      as two separate brand chips.
//
// If the existing match is itself all-caps and the title-cased input is
// "better" (mixed case), we use the title-cased input so the data heals
// toward the cleaner form over time.
async function canonicalizeBrand(
  brand: string | undefined,
): Promise<string | undefined> {
  if (typeof brand !== "string") return brand;
  const trimmed = brand.trim();
  if (!trimmed) return undefined;
  const normalized = titleCaseBrand(trimmed);
  const existing = await db.listDistinctBrands();
  const lc = normalized.toLowerCase();
  const match = existing.find((b) => b.trim().toLowerCase() === lc);
  if (!match) return normalized;
  // Prefer the better-cased of (existing match, normalized input). A match
  // that's all-uppercase loses to a mixed-case normalized form; otherwise
  // existing wins so we don't churn the canonical name on every import.
  const matchIsShouted =
    /[A-Z]/.test(match) && !/[a-z]/.test(match) && match.includes(" ");
  return matchIsShouted ? normalized : match;
}

export async function createPainting(
  input: Omit<Painting, "id" | "createdAt" | "updatedAt">,
): Promise<Painting> {
  const canonicalBrand = await canonicalizeBrand(input.brand);
  const painting = await db.createPainting({ ...input, brand: canonicalBrand });
  // Send the full row on create so the server stores everything we have.
  // Server will reuse our id (validate.ts accepts optionalId).
  const { createdAt, updatedAt, ...rest } = painting;
  void createdAt; void updatedAt;
  await outbox.enqueue({
    entity: "painting",
    op: "create",
    targetId: painting.id,
    payload: sanitizePhotoRefs(rest),
  });
  kick();
  return painting;
}

export async function updatePainting(
  id: string,
  patch: PaintingPatch,
): Promise<void> {
  // Only canonicalize when brand is in the patch — leave it alone otherwise.
  // null is preserved as the clear-sentinel; canonicalizeBrand returns the
  // input as-is for non-string values, so we just spread the result through.
  const normalizedPatch: PaintingPatch = "brand" in patch
    ? { ...patch, brand: await canonicalizeBrand(patch.brand) }
    : patch;
  await db.updatePainting(id, normalizedPatch);
  // updatedAt isn't part of the patch payload — server stamps it on its end.
  const { updatedAt, ...rest } = normalizedPatch;
  void updatedAt;
  await outbox.enqueue({
    entity: "painting",
    op: "update",
    targetId: id,
    payload: sanitizePhotoRefs(rest),
  });
  kick();
}

export async function deletePainting(id: string): Promise<void> {
  await db.deletePainting(id);
  await outbox.enqueue({
    entity: "painting",
    op: "delete",
    targetId: id,
    payload: null,
  });
  kick();
}

// Bump quantity by 1 and stamp updatedAt. Enqueues a patch for sync.
export async function incrementQuantity(id: string): Promise<Painting | null> {
  const existing = await db.getPainting(id);
  if (!existing) return null;
  const next = (existing.quantity ?? 1) + 1;
  await updatePainting(id, { quantity: next });
  return { ...existing, quantity: next };
}

// Reads — passthroughs.
export const getPainting = db.getPainting;
export const listPaintings = db.listPaintings;
export const countByStatus = db.countByStatus;
export const findDuplicate = db.findDuplicate;

export type { Painting, PaintingStatus };
