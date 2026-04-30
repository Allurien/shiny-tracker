// Sessions repo. Sessions compose multiple writes:
//   - startSession may auto-close an existing open session (two outbox rows
//     in that case: an update for the closed one + a create for the new one).
//   - endSession writes the session itself AND the painting's cached
//     hoursWorked. Both must reach the server, so both get enqueued.
//
// The DB layer already does the local writes and rolls up hoursWorked. We
// read the resulting state and enqueue precise patches matching what
// happened locally — no duplication of business logic.

import * as paintingsDb from "../db/paintings";
import * as outbox from "../db/outbox";
import * as db from "../db/sessions";
import { kick } from "../sync/manager";
import type { Session } from "../types/session";

export async function startSession(paintingId: string): Promise<Session> {
  // Capture the soon-to-be-closed open session (if any) before db.startSession
  // auto-closes it, so we can enqueue the update with accurate after-state.
  const openBefore = await db.getActiveSession(paintingId);
  const session = await db.startSession(paintingId);

  if (openBefore && openBefore.id !== session.id) {
    const closed = await db.getSessionById(openBefore.id);
    if (closed) {
      await outbox.enqueue({
        entity: "session",
        op: "update",
        targetId: closed.id,
        payload: {
          endedAt: closed.endedAt,
          durationSeconds: closed.durationSeconds,
        },
      });
      // hoursWorked also got rolled up server-side equivalent — enqueue it.
      const painting = await paintingsDb.getPainting(paintingId);
      if (painting) {
        await outbox.enqueue({
          entity: "painting",
          op: "update",
          targetId: painting.id,
          payload: { hoursWorked: painting.hoursWorked },
        });
      }
    }
  }

  await outbox.enqueue({
    entity: "session",
    op: "create",
    targetId: session.id,
    payload: {
      id: session.id,
      paintingId: session.paintingId,
      startedAt: session.startedAt,
      endedAt: null,
      durationSeconds: 0,
    },
  });
  kick();
  return session;
}

export async function endSession(id: string, notes?: string): Promise<void> {
  const before = await db.getSessionById(id);
  if (!before || before.endedAt) return;

  await db.endSession(id, notes);

  const after = await db.getSessionById(id);
  if (!after) return;

  await outbox.enqueue({
    entity: "session",
    op: "update",
    targetId: id,
    payload: {
      endedAt: after.endedAt,
      durationSeconds: after.durationSeconds,
      notes: notes ?? null,
    },
  });

  const painting = await paintingsDb.getPainting(before.paintingId);
  if (painting) {
    await outbox.enqueue({
      entity: "painting",
      op: "update",
      targetId: painting.id,
      payload: { hoursWorked: painting.hoursWorked },
    });
  }
  kick();
}

export async function deleteSession(id: string): Promise<void> {
  // Capture the painting before delete so we can enqueue the hoursWorked
  // recalc in the same order it'll be applied locally.
  const before = await db.getSessionById(id);
  await db.deleteSession(id);

  await outbox.enqueue({
    entity: "session",
    op: "delete",
    targetId: id,
    payload: null,
  });

  // Note: db.deleteSession doesn't currently recompute the painting's
  // hoursWorked. If we add that, mirror it here with a painting outbox row.
  void before;
  kick();
}

// Reads — passthroughs.
export const getSessionById = db.getSessionById;
export const getActiveSession = db.getActiveSession;
export const listSessions = db.listSessions;

export type { Session };
