import type {
  Painting,
  PaintingPatch,
  PaintingSource,
  PaintingStatus,
} from "../types/painting";
import { getDb, newId, nowIso } from "./client";

// SQLite row shape — JSON columns are still strings here.
interface PaintingRow {
  id: string;
  title: string;
  brand: string | null;
  artist: string | null;
  status: PaintingStatus;
  source: PaintingSource | null;
  sourceUrl: string | null;
  canvasSize: string | null;
  drillShape: string | null;
  drillCount: number | null;
  colorCount: number | null;
  price: number | null;
  currency: string | null;
  purchasedAt: string | null;
  receivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  hoursWorked: number | null;
  rating: number | null;
  quantity: number | null;
  eventName: string | null;
  coverImage: string | null;
  progressPhotos: string | null;
  description: string | null;
  notes: string | null;
  tags: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToPainting(r: PaintingRow): Painting {
  return {
    id: r.id,
    title: r.title,
    brand: r.brand ?? undefined,
    artist: r.artist ?? undefined,
    status: r.status,
    source: r.source ?? undefined,
    sourceUrl: r.sourceUrl ?? undefined,
    canvasSize: r.canvasSize ?? undefined,
    drillShape: (r.drillShape as Painting["drillShape"]) ?? undefined,
    drillCount: r.drillCount ?? undefined,
    colorCount: r.colorCount ?? undefined,
    price: r.price ?? undefined,
    currency: r.currency ?? undefined,
    purchasedAt: r.purchasedAt ?? undefined,
    receivedAt: r.receivedAt ?? undefined,
    startedAt: r.startedAt ?? undefined,
    completedAt: r.completedAt ?? undefined,
    hoursWorked: r.hoursWorked ?? undefined,
    rating: r.rating ?? undefined,
    quantity: r.quantity ?? undefined,
    eventName: r.eventName ?? undefined,
    coverImage: r.coverImage ?? undefined,
    progressPhotos: r.progressPhotos ? JSON.parse(r.progressPhotos) : undefined,
    description: r.description ?? undefined,
    notes: r.notes ?? undefined,
    tags: r.tags ? JSON.parse(r.tags) : undefined,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const COLUMNS = [
  "id", "title", "brand", "artist", "status", "source", "sourceUrl",
  "canvasSize", "drillShape", "drillCount", "colorCount",
  "price", "currency", "purchasedAt", "receivedAt",
  "startedAt", "completedAt", "hoursWorked", "rating",
  "quantity", "eventName", "coverImage", "progressPhotos", "description",
  "notes", "tags", "createdAt", "updatedAt",
] as const;

export async function createPainting(
  input: Omit<Painting, "id" | "createdAt" | "updatedAt">
): Promise<Painting> {
  const db = await getDb();
  const now = nowIso();
  const painting: Painting = {
    ...input,
    id: newId(),
    createdAt: now,
    updatedAt: now,
  };
  const placeholders = COLUMNS.map(() => "?").join(", ");
  const values = COLUMNS.map((c) => serializeField(c, painting));
  await db.runAsync(
    `INSERT INTO paintings (${COLUMNS.join(", ")}) VALUES (${placeholders})`,
    values
  );
  return painting;
}

export async function updatePainting(
  id: string,
  patch: PaintingPatch,
): Promise<void> {
  const db = await getDb();
  const fields = Object.keys(patch).filter((k) => k !== "id" && k !== "createdAt");
  if (fields.length === 0) return;
  const setClause = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => serializeField(f, { ...patch, updatedAt: nowIso() }));
  await db.runAsync(
    `UPDATE paintings SET ${setClause}, updatedAt = ? WHERE id = ?`,
    [...values, nowIso(), id]
  );
}

// Soft delete: keep the row, set deletedAt + bump updatedAt so the sync
// cursor picks it up. Reads filter on `deletedAt IS NULL`.
export async function deletePainting(id: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE paintings SET deletedAt = ?, updatedAt = ? WHERE id = ?",
    [now, now, id],
  );
}

export async function getPainting(id: string): Promise<Painting | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<PaintingRow>(
    "SELECT * FROM paintings WHERE id = ? AND deletedAt IS NULL",
    [id]
  );
  return r ? rowToPainting(r) : null;
}

// Sync write-through: insert-or-replace honoring server timestamps and
// deletedAt. Caller (sync layer) owns the row contents — no local stamping.
export async function applyRemotePainting(
  remote: Painting & { deletedAt?: string },
): Promise<void> {
  const db = await getDb();
  const cols = [...COLUMNS, "deletedAt"];
  const placeholders = cols.map(() => "?").join(", ");
  const values = cols.map((c) => serializeField(c, remote));
  await db.runAsync(
    `INSERT OR REPLACE INTO paintings (${cols.join(", ")}) VALUES (${placeholders})`,
    values,
  );
}

export async function listPaintings(opts: {
  status?: PaintingStatus | PaintingStatus[];
  brand?: string;
  drillShape?: string;
  search?: string;
  orderBy?: "createdAt" | "updatedAt" | "completedAt" | "title";
  direction?: "ASC" | "DESC";
} = {}): Promise<Painting[]> {
  const where: string[] = ["deletedAt IS NULL"];
  const args: any[] = [];

  if (opts.status) {
    const arr = Array.isArray(opts.status) ? opts.status : [opts.status];
    where.push(`status IN (${arr.map(() => "?").join(", ")})`);
    args.push(...arr);
  }
  if (opts.brand) {
    where.push("brand = ?");
    args.push(opts.brand);
  }
  if (opts.drillShape) {
    where.push("drillShape = ?");
    args.push(opts.drillShape);
  }
  if (opts.search) {
    where.push("(title LIKE ? OR artist LIKE ? OR notes LIKE ?)");
    const q = `%${opts.search}%`;
    args.push(q, q, q);
  }

  const order = opts.orderBy ?? "updatedAt";
  const dir = opts.direction ?? "DESC";
  const sql =
    `SELECT * FROM paintings WHERE ${where.join(" AND ")} ORDER BY ${order} ${dir}`;

  const db = await getDb();
  const rows = await db.getAllAsync<PaintingRow>(sql, args);
  return rows.map(rowToPainting);
}

// Find an existing (non-deleted) painting that matches the given identity.
// Preference order:
//   1. sourceUrl (if provided) — strongest signal for re-imported URLs
//   2. case-insensitive (title, brand) match
// Returns null if no duplicate is found.
export async function findDuplicate(key: {
  sourceUrl?: string;
  title: string;
  brand?: string;
}): Promise<Painting | null> {
  const db = await getDb();
  if (key.sourceUrl) {
    const row = await db.getFirstAsync<PaintingRow>(
      "SELECT * FROM paintings WHERE sourceUrl = ? AND deletedAt IS NULL LIMIT 1",
      [key.sourceUrl]
    );
    if (row) return rowToPainting(row);
  }
  const title = key.title.trim();
  if (!title) return null;
  const row = await db.getFirstAsync<PaintingRow>(
    `SELECT * FROM paintings
     WHERE deletedAt IS NULL
       AND LOWER(title) = LOWER(?)
       AND (
         (brand IS NULL AND ? IS NULL)
         OR LOWER(brand) = LOWER(?)
       )
     LIMIT 1`,
    [title, key.brand ?? null, key.brand ?? ""]
  );
  return row ? rowToPainting(row) : null;
}

// Distinct, non-deleted brands. Used by the repo to canonicalize new entries
// case-insensitively (e.g. amazon serves "DIAMOND ART CLUB" but DAC's own
// pages serve "Diamond Art Club" — store one form).
export async function listDistinctBrands(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ brand: string }>(
    "SELECT DISTINCT brand FROM paintings WHERE brand IS NOT NULL AND deletedAt IS NULL",
  );
  return rows.map((r) => r.brand).filter((b): b is string => !!b);
}

export async function countByStatus(): Promise<Record<PaintingStatus, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ status: PaintingStatus; n: number }>(
    "SELECT status, COUNT(*) AS n FROM paintings WHERE deletedAt IS NULL GROUP BY status"
  );
  const out: Record<PaintingStatus, number> = {
    wishlist: 0, ordered: 0, stash: 0, in_progress: 0, completed: 0,
  };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

// Serialize a single field to its DB representation. JSON columns get stringified.
function serializeField(field: string, source: any): any {
  const v = source[field];
  if (v === undefined) return null;
  if (field === "progressPhotos" || field === "tags") {
    return v == null ? null : JSON.stringify(v);
  }
  return v;
}
