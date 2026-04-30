import type { Drill } from "../types/drill";
import { getDb, newId, nowIso } from "./client";

export async function createDrill(
  input: Omit<Drill, "id" | "createdAt" | "updatedAt">
): Promise<Drill> {
  const db = await getDb();
  const now = nowIso();
  const drill: Drill = { ...input, id: newId(), createdAt: now, updatedAt: now };
  await db.runAsync(
    `INSERT INTO drills (id, drillNumber, brand, shape, approximateCount, colorName, colorHex, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      drill.id, drill.drillNumber, drill.brand, drill.shape, drill.approximateCount,
      drill.colorName ?? null, drill.colorHex ?? null, drill.notes ?? null,
      drill.createdAt, drill.updatedAt,
    ]
  );
  return drill;
}

export async function updateDrill(
  id: string,
  patch: Partial<Omit<Drill, "id" | "createdAt">>
): Promise<void> {
  const db = await getDb();
  const fields = Object.keys(patch).filter((k) => k !== "id" && k !== "createdAt");
  if (fields.length === 0) return;
  const setClause = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => (patch as any)[f] ?? null);
  await db.runAsync(
    `UPDATE drills SET ${setClause}, updatedAt = ? WHERE id = ?`,
    [...values, nowIso(), id]
  );
}

export async function deleteDrill(id: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE drills SET deletedAt = ?, updatedAt = ? WHERE id = ?",
    [now, now, id],
  );
}

export async function getDrill(id: string): Promise<Drill | null> {
  const db = await getDb();
  return db.getFirstAsync<Drill>(
    "SELECT * FROM drills WHERE id = ? AND deletedAt IS NULL",
    [id],
  );
}

export async function listDrills(opts: {
  brand?: string;
  shape?: string;
  search?: string;
} = {}): Promise<Drill[]> {
  const where: string[] = ["deletedAt IS NULL"];
  const args: any[] = [];

  if (opts.brand) { where.push("brand = ?"); args.push(opts.brand); }
  if (opts.shape) { where.push("shape = ?"); args.push(opts.shape); }
  if (opts.search) {
    where.push("(drillNumber LIKE ? OR colorName LIKE ?)");
    const q = `%${opts.search}%`;
    args.push(q, q);
  }

  const sql = `SELECT * FROM drills WHERE ${where.join(" AND ")} ORDER BY brand, drillNumber`;

  const db = await getDb();
  return db.getAllAsync<Drill>(sql, args);
}

// Sync write-through. Bypasses upsert-by-natural-key — server already
// resolved the right row id and we mirror it verbatim.
export async function applyRemoteDrill(
  remote: Drill & { deletedAt?: string },
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO drills
       (id, drillNumber, brand, shape, approximateCount, colorName, colorHex,
        notes, createdAt, updatedAt, deletedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      remote.id,
      remote.drillNumber,
      remote.brand,
      remote.shape,
      remote.approximateCount,
      remote.colorName ?? null,
      remote.colorHex ?? null,
      remote.notes ?? null,
      remote.createdAt,
      remote.updatedAt,
      remote.deletedAt ?? null,
    ],
  );
}

// Bulk-add or increment counts (used by the "log leftover drills" flow on
// painting completion). If the drill already exists, count is added.
export async function upsertDrills(
  items: Array<Omit<Drill, "id" | "createdAt" | "updatedAt">>
): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  for (const item of items) {
    const existing = await db.getFirstAsync<Drill>(
      "SELECT * FROM drills WHERE brand = ? AND drillNumber = ? AND deletedAt IS NULL",
      [item.brand, item.drillNumber]
    );
    if (existing) {
      await db.runAsync(
        "UPDATE drills SET approximateCount = approximateCount + ?, updatedAt = ? WHERE id = ?",
        [item.approximateCount, now, existing.id]
      );
    } else {
      await createDrill(item);
    }
  }
}
