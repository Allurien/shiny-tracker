// Drills repo — see paintings.ts for the offline-first pattern.
//
// upsertDrills is special: it batches into a single outbox row using the
// "upsert" op so the server's POST /drills/upsert handler does the
// add-or-increment in one round trip (matches local DB semantics).

import * as db from "../db/drills";
import * as outbox from "../db/outbox";
import { kick } from "../sync/manager";
import type { Drill } from "../types/drill";

type DrillInput = Omit<Drill, "id" | "createdAt" | "updatedAt">;

export async function createDrill(input: DrillInput): Promise<Drill> {
  const drill = await db.createDrill(input);
  const { createdAt, updatedAt, ...rest } = drill;
  void createdAt; void updatedAt;
  await outbox.enqueue({
    entity: "drill",
    op: "create",
    targetId: drill.id,
    payload: rest,
  });
  kick();
  return drill;
}

export async function updateDrill(
  id: string,
  patch: Partial<Omit<Drill, "id" | "createdAt">>,
): Promise<void> {
  await db.updateDrill(id, patch);
  const { updatedAt, ...rest } = patch as Partial<Drill>;
  void updatedAt;
  await outbox.enqueue({
    entity: "drill",
    op: "update",
    targetId: id,
    payload: rest,
  });
  kick();
}

export async function deleteDrill(id: string): Promise<void> {
  await db.deleteDrill(id);
  await outbox.enqueue({
    entity: "drill",
    op: "delete",
    targetId: id,
    payload: null,
  });
  kick();
}

// Bulk add-or-increment by (brand, drillNumber). Server mirrors with the
// same merge logic via POST /drills/upsert. Note: local id assignment for
// brand-new rows is independent of the server's — but the natural-key index
// makes the server resolve to the same logical row, and the next /sync pull
// will reconcile any id divergence by storing the server's row.
export async function upsertDrills(items: DrillInput[]): Promise<void> {
  await db.upsertDrills(items);
  await outbox.enqueue({
    entity: "drill",
    op: "upsert",
    targetId: null,
    payload: { items },
  });
  kick();
}

// Reads — passthroughs.
export const getDrill = db.getDrill;
export const listDrills = db.listDrills;

export type { Drill };
