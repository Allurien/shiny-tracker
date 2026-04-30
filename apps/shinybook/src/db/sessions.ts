import type { Session } from "../types/session";
import { getDb, newId, nowIso } from "./client";

interface SessionRow {
  id: string;
  paintingId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function rowToSession(r: SessionRow): Session {
  return {
    id: r.id,
    paintingId: r.paintingId,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    durationSeconds: r.durationSeconds,
    notes: r.notes ?? undefined,
  };
}

export async function startSession(paintingId: string): Promise<Session> {
  const db = await getDb();
  // Auto-close any open session on this painting (defensive).
  const open = await db.getFirstAsync<SessionRow>(
    "SELECT * FROM sessions WHERE paintingId = ? AND endedAt IS NULL AND deletedAt IS NULL",
    [paintingId],
  );
  if (open) await endSession(open.id);

  const now = nowIso();
  const session: Session = {
    id: newId(),
    paintingId,
    startedAt: now,
    endedAt: null,
    durationSeconds: 0,
  };
  await db.runAsync(
    `INSERT INTO sessions
       (id, paintingId, startedAt, endedAt, durationSeconds, createdAt, updatedAt)
     VALUES (?, ?, ?, NULL, 0, ?, ?)`,
    [session.id, session.paintingId, session.startedAt, now, now],
  );
  return session;
}

export async function endSession(id: string, notes?: string): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<SessionRow>(
    "SELECT * FROM sessions WHERE id = ? AND deletedAt IS NULL",
    [id],
  );
  if (!row || row.endedAt) return;
  const endedAt = nowIso();
  const duration = Math.max(
    0,
    Math.floor((Date.parse(endedAt) - Date.parse(row.startedAt)) / 1000),
  );
  await db.runAsync(
    "UPDATE sessions SET endedAt = ?, durationSeconds = ?, notes = ?, updatedAt = ? WHERE id = ?",
    [endedAt, duration, notes ?? null, endedAt, id],
  );

  // Update painting's cached hoursWorked.
  const total = await db.getFirstAsync<{ total: number }>(
    "SELECT COALESCE(SUM(durationSeconds), 0) AS total FROM sessions WHERE paintingId = ? AND deletedAt IS NULL",
    [row.paintingId],
  );
  await db.runAsync(
    "UPDATE paintings SET hoursWorked = ?, updatedAt = ? WHERE id = ?",
    [(total?.total ?? 0) / 3600, nowIso(), row.paintingId],
  );
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.runAsync(
    "UPDATE sessions SET deletedAt = ?, updatedAt = ? WHERE id = ?",
    [now, now, id],
  );
}

export async function getSessionById(id: string): Promise<Session | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<SessionRow>(
    "SELECT * FROM sessions WHERE id = ? AND deletedAt IS NULL",
    [id],
  );
  return r ? rowToSession(r) : null;
}

export async function getActiveSession(paintingId: string): Promise<Session | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<SessionRow>(
    "SELECT * FROM sessions WHERE paintingId = ? AND endedAt IS NULL AND deletedAt IS NULL",
    [paintingId],
  );
  return r ? rowToSession(r) : null;
}

export async function listSessions(paintingId: string): Promise<Session[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SessionRow>(
    "SELECT * FROM sessions WHERE paintingId = ? AND deletedAt IS NULL ORDER BY startedAt DESC",
    [paintingId],
  );
  return rows.map(rowToSession);
}

// Sync write-through. The server's full row replaces ours verbatim.
export async function applyRemoteSession(
  remote: Session & { createdAt: string; updatedAt: string; deletedAt?: string },
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO sessions
       (id, paintingId, startedAt, endedAt, durationSeconds, notes,
        createdAt, updatedAt, deletedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      remote.id,
      remote.paintingId,
      remote.startedAt,
      remote.endedAt ?? null,
      remote.durationSeconds,
      remote.notes ?? null,
      remote.createdAt,
      remote.updatedAt,
      remote.deletedAt ?? null,
    ],
  );
}
