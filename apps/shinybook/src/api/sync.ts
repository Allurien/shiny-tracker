// Delta-sync endpoint. Phase 4's sync manager will call this per entity on
// reconnect with a stored `since` cursor, merge the response into local
// SQLite, and then flush the outbox. For phase 2 we only expose the wire.

import type { Drill } from "../types/drill";
import type { Painting } from "../types/painting";
import type { Session } from "../types/session";
import { requestJson } from "./client";

export type Entity = "painting" | "drill" | "session";

type ItemFor<E extends Entity> = E extends "painting"
  ? Painting
  : E extends "drill"
    ? Drill
    : Session;

interface ChangesResponse<T> {
  items: (T & { deletedAt?: string })[];
  cursor: string | null;
}

export async function fetchChanges<E extends Entity>(
  entity: E,
  opts: { since?: string; limit?: number } = {},
): Promise<ChangesResponse<ItemFor<E>>> {
  return requestJson<ChangesResponse<ItemFor<E>>>("/sync", {
    query: { entity, since: opts.since, limit: opts.limit },
  });
}
