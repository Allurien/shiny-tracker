// Sync processors. Two responsibilities:
//   1. PULL — for each entity, fetch deltas since the stored cursor and write
//      them through to the local DB via applyRemoteX. Save the new cursor.
//   2. FLUSH — drain ready outbox rows in id order, dispatching each by
//      (entity, op) to the appropriate api.* call. Ack on success, bump on
//      transient failure.
//
// Pull runs before flush so that any server-side changes that landed since
// last sync are reflected locally before our queued local mutations replay.
// Last-writer-wins resolution is server-side: the server's row is what its
// own create/update calls return, so flushing after pull keeps the local
// state coherent if a remote tombstone races a local edit.

import * as drillsApi from "../api/drills";
import * as paintingsApi from "../api/paintings";
import * as sessionsApi from "../api/sessions";
import { ApiError } from "../api/client";
import * as syncApi from "../api/sync";
import { getToken } from "../api/token";
import * as drillsDb from "../db/drills";
import * as outbox from "../db/outbox";
import * as paintingsDb from "../db/paintings";
import * as sessionsDb from "../db/sessions";
import * as cursors from "../db/syncCursors";
import type { Drill } from "../types/drill";
import type { Painting } from "../types/painting";
import type { Session } from "../types/session";

const ENTITIES: outbox.OutboxEntity[] = ["painting", "drill", "session"];

export async function tick(): Promise<void> {
  if (!getToken()) return;
  await pullAll();
  await flushOutbox();
}

// -------- PULL --------

export async function pullAll(): Promise<void> {
  for (const entity of ENTITIES) {
    try {
      await pullEntity(entity);
    } catch (err) {
      // One entity's pull failure shouldn't block the others.
      console.warn(`[sync] pull ${entity} failed`, err);
    }
  }
}

async function pullEntity(entity: outbox.OutboxEntity): Promise<void> {
  const since = (await cursors.getCursor(entity)) ?? undefined;
  const { items, cursor } = await syncApi.fetchChanges(entity, { since });
  for (const item of items) {
    await applyRemote(entity, item);
  }
  if (cursor) await cursors.setCursor(entity, cursor);
}

async function applyRemote(
  entity: outbox.OutboxEntity,
  item: (Painting | Drill | Session) & { deletedAt?: string },
): Promise<void> {
  switch (entity) {
    case "painting":
      return paintingsDb.applyRemotePainting(item as Painting & { deletedAt?: string });
    case "drill":
      return drillsDb.applyRemoteDrill(item as Drill & { deletedAt?: string });
    case "session":
      return sessionsDb.applyRemoteSession(
        item as Session & { createdAt: string; updatedAt: string; deletedAt?: string },
      );
  }
}

// -------- FLUSH --------

export async function flushOutbox(): Promise<void> {
  // Drain in batches. Each batch is up to 50 rows; we loop until listReady
  // returns nothing new (or stops shrinking — protects against an unsuccessful
  // batch where every row got bumped to a future nextAttemptAt).
  for (let safety = 0; safety < 20; safety++) {
    const rows = await outbox.listReady(50);
    if (rows.length === 0) return;
    let progressed = false;
    for (const row of rows) {
      try {
        await dispatch(row);
        await outbox.ack(row.id);
        progressed = true;
      } catch (err) {
        const transient = isTransient(err);
        if (transient) {
          await outbox.bump(row.id, errorMessage(err));
          // Stop draining this batch on transient failure to avoid hammering
          // a flaky server. The next tick will retry once backoff elapses.
          return;
        }
        // Permanent failure — log and ack so a poisoned row doesn't block
        // the queue forever. The local DB still has the user's data; this
        // just means the server didn't accept it.
        console.warn("[sync] dropping outbox row after permanent error", {
          id: row.id,
          entity: row.entity,
          op: row.op,
          err: errorMessage(err),
        });
        await outbox.ack(row.id);
        progressed = true;
      }
    }
    if (!progressed) return;
  }
}

async function dispatch(row: outbox.OutboxRow): Promise<void> {
  switch (row.entity) {
    case "painting":
      return dispatchPainting(row);
    case "drill":
      return dispatchDrill(row);
    case "session":
      return dispatchSession(row);
  }
}

async function dispatchPainting(row: outbox.OutboxRow): Promise<void> {
  switch (row.op) {
    case "create":
      await paintingsApi.createPainting(row.payload as Parameters<typeof paintingsApi.createPainting>[0]);
      return;
    case "update":
      if (!row.targetId) return;
      await paintingsApi.updatePainting(row.targetId, row.payload as Parameters<typeof paintingsApi.updatePainting>[1]);
      return;
    case "delete":
      if (!row.targetId) return;
      await paintingsApi.deletePainting(row.targetId);
      return;
    default:
      throw new Error(`unsupported op for painting: ${row.op}`);
  }
}

async function dispatchDrill(row: outbox.OutboxRow): Promise<void> {
  switch (row.op) {
    case "create":
      await drillsApi.createDrill(row.payload as Parameters<typeof drillsApi.createDrill>[0]);
      return;
    case "update":
      if (!row.targetId) return;
      await drillsApi.updateDrill(row.targetId, row.payload as Parameters<typeof drillsApi.updateDrill>[1]);
      return;
    case "delete":
      if (!row.targetId) return;
      await drillsApi.deleteDrill(row.targetId);
      return;
    case "upsert":
      await drillsApi.upsertDrills(row.payload as Parameters<typeof drillsApi.upsertDrills>[0]);
      return;
    default:
      throw new Error(`unsupported op for drill: ${row.op}`);
  }
}

async function dispatchSession(row: outbox.OutboxRow): Promise<void> {
  switch (row.op) {
    case "create":
      await sessionsApi.startSession(
        (row.payload as { paintingId: string }).paintingId,
      );
      return;
    case "update":
      if (!row.targetId) return;
      // Session updates from the repo carry { endedAt, durationSeconds, notes }.
      // The server's PATCH /sessions/:id is the right wire for this.
      await dispatchSessionUpdate(row);
      return;
    case "delete":
      if (!row.targetId) return;
      await sessionsApi.deleteSession(row.targetId);
      return;
    default:
      throw new Error(`unsupported op for session: ${row.op}`);
  }
}

async function dispatchSessionUpdate(row: outbox.OutboxRow): Promise<void> {
  // Bypass api/sessions.ts endSession (which composes its own
  // get-then-patch-then-rollup). The repo layer already computed everything;
  // we just need a direct PATCH. Use the same wire by calling requestJson via
  // the api client through a thin helper would be cleaner, but we can also
  // just do the PATCH inline with createSessionPatch on the server.
  const { requestJson } = await import("../api/client");
  await requestJson(`/sessions/${row.targetId}`, {
    method: "PATCH",
    body: row.payload,
  });
}

// -------- helpers --------

function isTransient(err: unknown): boolean {
  if (err instanceof ApiError) {
    // 4xx (except 408 / 429) means the server rejected the payload — retrying
    // won't help and would block the queue. Treat 5xx and rate-limit as transient.
    if (err.status === 408 || err.status === 429) return true;
    if (err.status >= 500) return true;
    return false;
  }
  // Network errors, fetch failures, etc. are transient.
  return true;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
