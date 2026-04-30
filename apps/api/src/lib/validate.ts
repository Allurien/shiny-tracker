import { z } from "zod";

const iso = z.string().datetime({ offset: true });

// Client-generated id, optional on create. The repo layer (offline-first)
// generates ids locally so writes can queue before reaching the server.
const optionalId = z.string().min(1).max(100).optional();

// ---------- Painting ----------
const paintingStatus = z.enum([
  "wishlist",
  "ordered",
  "stash",
  "in_progress",
  "completed",
]);

const drillShape = z.enum(["round", "square", "specialty", "unknown"]);

const paintingSource = z.enum(["purchase", "destash"]);

const paintingBase = z.object({
  title: z.string().min(1).max(500),
  brand: z.string().max(200).optional(),
  artist: z.string().max(200).optional(),
  status: paintingStatus,
  source: paintingSource.optional(),
  sourceUrl: z.string().url().max(2000).optional(),
  canvasSize: z.string().max(100).optional(),
  drillShape: drillShape.optional(),
  drillCount: z.number().int().nonnegative().optional(),
  colorCount: z.number().int().nonnegative().optional(),
  price: z.number().nonnegative().optional(),
  currency: z.string().max(10).optional(),
  purchasedAt: iso.optional(),
  receivedAt: iso.optional(),
  startedAt: iso.optional(),
  completedAt: iso.optional(),
  hoursWorked: z.number().nonnegative().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  quantity: z.number().int().positive().max(999).optional(),
  eventName: z.string().max(200).optional(),
  coverImage: z.string().max(2000).optional(),
  progressPhotos: z.array(z.string().max(2000)).max(100).optional(),
  description: z.string().max(20000).optional(),
  notes: z.string().max(20000).optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
});

export const paintingCreateSchema = paintingBase.extend({ id: optionalId });
// Updates accept `null` on clearable fields as an explicit "remove this"
// sentinel — the handler drops them before writing back. This is needed
// because JSON.stringify omits `undefined`, which would otherwise reach the
// server as "field not present" and silently preserve the prior value.
export const paintingUpdateSchema = paintingBase.partial().extend({
  coverImage: z.string().max(2000).nullable().optional(),
  progressPhotos: z.array(z.string().max(2000)).max(100).nullable().optional(),
});

// ---------- Drill ----------
const drillBase = z.object({
  drillNumber: z.string().min(1).max(100),
  brand: z.string().min(1).max(200),
  shape: z.enum(["round", "square", "specialty"]),
  specialtyType: z.enum(["standard", "ab", "fairy_dust", "electro_diamond"]).optional(),
  approximateCount: z.number().int().nonnegative(),
  colorName: z.string().max(200).optional(),
  colorHex: z.string().max(20).optional(),
  notes: z.string().max(5000).optional(),
});

export const drillCreateSchema = drillBase.extend({ id: optionalId });
export const drillUpdateSchema = drillBase.partial();
export const drillUpsertSchema = z.object({
  items: z.array(drillBase).min(1).max(200),
});

// ---------- Session ----------
const sessionBase = z.object({
  paintingId: z.string().min(1).max(100),
  startedAt: iso,
  endedAt: iso.nullable().optional(),
  durationSeconds: z.number().int().nonnegative(),
  notes: z.string().max(5000).optional(),
});

export const sessionCreateSchema = sessionBase.extend({ id: optionalId });
export const sessionUpdateSchema = sessionBase.partial();

// ---------- Photos ----------
export const signUploadSchema = z.object({
  paintingId: z.string().min(1).max(100),
  contentType: z
    .string()
    .regex(/^image\/(png|jpe?g|webp|heic|heif)$/i),
  extension: z.string().regex(/^[a-z0-9]{1,8}$/i),
});

export const signViewSchema = z.object({
  key: z.string().min(1).max(1000),
});

// ---------- Wishlist source ----------
// id = DAC's "lid" UUID — the sk uses it directly so an upsert by id naturally
// dedupes the same DAC list across import attempts.
const wishlistSourceBase = z.object({
  id: z.string().min(1).max(100),
  url: z.string().url().max(2000),
  name: z.string().min(1).max(200),
  snapshotHandles: z.array(z.string().min(1).max(200)).max(500),
});

export const wishlistSourceCreateSchema = wishlistSourceBase;
export const wishlistSourceUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  snapshotHandles: z.array(z.string().min(1).max(200)).max(500).optional(),
});

// ---------- Restock subscription ----------
// expoPushToken format: "ExponentPushToken[xxx]" or "ExpoPushToken[xxx]". We
// don't validate the inner shape — Expo's push API will reject malformed
// tokens and we surface that out-of-band. Length cap protects against abuse.
export const restockSubscriptionSchema = z.object({
  enabled: z.boolean(),
  expoPushToken: z.string().min(1).max(200).nullable(),
});

// ---------- Sync ----------
export const syncQuerySchema = z.object({
  entity: z.enum(["painting", "drill", "session"]),
  since: iso.optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

// Helper: parse JSON body safely.
export function parseJson(body: string | undefined | null): unknown {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("invalid JSON body");
  }
}
