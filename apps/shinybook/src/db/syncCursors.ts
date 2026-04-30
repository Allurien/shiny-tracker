// Per-entity sync cursors. Tracks the last server `updatedAt` we've seen so
// the next /sync call only returns deltas. Stored in a dedicated table
// (rather than meta) so future enhancements can carry per-entity metadata
// like lastSyncedAt or pull errors.

import { getDb, nowIso } from "./client";
import type { OutboxEntity } from "./outbox";

export interface SyncCursor {
  entity: OutboxEntity;
  cursor: string | null;
  lastSyncedAt: string | null;
}

export async function getCursor(entity: OutboxEntity): Promise<string | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ cursor: string | null }>(
    "SELECT cursor FROM sync_cursors WHERE entity = ?",
    [entity],
  );
  return r?.cursor ?? null;
}

export async function setCursor(
  entity: OutboxEntity,
  cursor: string | null,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO sync_cursors (entity, cursor, lastSyncedAt)
     VALUES (?, ?, ?)
     ON CONFLICT(entity) DO UPDATE SET cursor = excluded.cursor,
                                       lastSyncedAt = excluded.lastSyncedAt`,
    [entity, cursor, nowIso()],
  );
}

export async function listCursors(): Promise<SyncCursor[]> {
  const db = await getDb();
  return db.getAllAsync<SyncCursor>(
    "SELECT entity, cursor, lastSyncedAt FROM sync_cursors",
  );
}

export async function clearAllCursors(): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM sync_cursors");
}
