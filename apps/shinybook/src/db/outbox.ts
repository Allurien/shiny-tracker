// Outbox for offline writes. Each row represents a single intended server
// operation (create / update / delete / upsert). The sync processor drains
// these in order, removing rows on success and incrementing `attempts`
// (with exponential backoff via `nextAttemptAt`) on transient failure.

import { getDb, nowIso } from "./client";

export type OutboxEntity = "painting" | "drill" | "session";
export type OutboxOp = "create" | "update" | "delete" | "upsert";

export interface OutboxRow {
  id: number;
  entity: OutboxEntity;
  op: OutboxOp;
  targetId: string | null;
  payload: unknown;
  createdAt: string;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
}

interface OutboxRowSql extends Omit<OutboxRow, "payload"> {
  payload: string;
}

export async function enqueue(args: {
  entity: OutboxEntity;
  op: OutboxOp;
  targetId: string | null;
  payload: unknown;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO outbox (entity, op, targetId, payload, createdAt, attempts, nextAttemptAt)
     VALUES (?, ?, ?, ?, ?, 0, NULL)`,
    [args.entity, args.op, args.targetId, JSON.stringify(args.payload), nowIso()],
  );
}

// Pending = no nextAttemptAt set, OR backoff has elapsed.
export async function listReady(limit = 50): Promise<OutboxRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<OutboxRowSql>(
    `SELECT * FROM outbox
     WHERE nextAttemptAt IS NULL OR nextAttemptAt <= ?
     ORDER BY id ASC
     LIMIT ?`,
    [nowIso(), limit],
  );
  return rows.map(parseRow);
}

export async function ack(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM outbox WHERE id = ?", [id]);
}

// Compute the next attempt time using exponential backoff (capped at 5 min).
export async function bump(id: number, error: string): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<OutboxRowSql>(
    "SELECT * FROM outbox WHERE id = ?",
    [id],
  );
  if (!row) return;
  const attempts = row.attempts + 1;
  const delayMs = Math.min(5 * 60 * 1000, 1000 * 2 ** Math.min(attempts, 8));
  const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
  await db.runAsync(
    "UPDATE outbox SET attempts = ?, nextAttemptAt = ?, lastError = ? WHERE id = ?",
    [attempts, nextAttemptAt, error.slice(0, 500), id],
  );
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM outbox",
  );
  return r?.n ?? 0;
}

export async function clearAll(): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM outbox");
}

function parseRow(r: OutboxRowSql): OutboxRow {
  return { ...r, payload: JSON.parse(r.payload) };
}
