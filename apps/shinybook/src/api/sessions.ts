// Sessions API — the local DB version exposes `startSession`/`endSession`
// helpers that do more than one write (start also auto-closes an open
// session on the same painting; end also rolls the painting's cached
// hoursWorked). We mirror that behavior here by composing CRUD calls.

import type { Painting } from "../types/painting";
import type { Session } from "../types/session";
import { requestJson, requestNoBody } from "./client";

interface SessionListResponse {
  items: Session[];
}

export async function listSessions(paintingId: string): Promise<Session[]> {
  const { items } = await requestJson<SessionListResponse>("/sessions", {
    query: { paintingId },
  });
  return [...items].sort((a, b) =>
    a.startedAt > b.startedAt ? -1 : a.startedAt < b.startedAt ? 1 : 0,
  );
}

export async function getActiveSession(paintingId: string): Promise<Session | null> {
  const items = await listSessions(paintingId);
  return items.find((s) => !s.endedAt) ?? null;
}

export async function startSession(paintingId: string): Promise<Session> {
  // Close any already-open session for this painting (defensive parity with
  // the local DB helper).
  const open = await getActiveSession(paintingId);
  if (open) await endSession(open.id);

  const startedAt = new Date().toISOString();
  return requestJson<Session>("/sessions", {
    method: "POST",
    body: { paintingId, startedAt, endedAt: null, durationSeconds: 0 },
  });
}

export async function endSession(id: string, notes?: string): Promise<void> {
  // Fetch all sessions for the painting (so we can find this one + recompute
  // the total). The server doesn't maintain painting.hoursWorked for us, so
  // we roll it up client-side to preserve the cached-value UX.
  const allRecent = await requestJson<SessionListResponse>("/sessions");
  const session = allRecent.items.find((s) => s.id === id);
  if (!session || session.endedAt) return;

  const endedAt = new Date().toISOString();
  const duration = Math.max(
    0,
    Math.floor((Date.parse(endedAt) - Date.parse(session.startedAt)) / 1000),
  );

  await requestJson<Session>(`/sessions/${id}`, {
    method: "PATCH",
    body: { endedAt, durationSeconds: duration, notes: notes ?? null },
  });

  const paintingSessions = allRecent.items
    .filter((s) => s.paintingId === session.paintingId)
    .map((s) =>
      s.id === id ? { ...s, endedAt, durationSeconds: duration } : s,
    );
  const totalSeconds = paintingSessions.reduce(
    (acc, s) => acc + (s.durationSeconds ?? 0),
    0,
  );

  await requestJson<Painting>(`/paintings/${session.paintingId}`, {
    method: "PATCH",
    body: { hoursWorked: totalSeconds / 3600 },
  });
}

export async function deleteSession(id: string): Promise<void> {
  await requestNoBody(`/sessions/${id}`, { method: "DELETE" });
}
