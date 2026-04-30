// JSON snapshot of the whole database — paintings, drills, sessions.
// Local-only app, so this is the user's only backup mechanism.

import { listDrills } from "./drills";
import { listPaintings } from "./paintings";
import { getDb } from "./client";
import type { Drill } from "../types/drill";
import type { Painting } from "../types/painting";
import type { Session } from "../types/session";

export interface Backup {
  schemaVersion: number;
  exportedAt: string;
  paintings: Painting[];
  drills: Drill[];
  sessions: Session[];
}

export async function buildBackup(): Promise<Backup> {
  const db = await getDb();
  const versionRow = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key = 'schemaVersion'"
  );
  const sessions = await db.getAllAsync<Session>(
    "SELECT * FROM sessions ORDER BY startedAt DESC"
  );
  const [paintings, drills] = await Promise.all([listPaintings(), listDrills()]);
  return {
    schemaVersion: versionRow ? parseInt(versionRow.value, 10) : 0,
    exportedAt: new Date().toISOString(),
    paintings,
    drills,
    sessions,
  };
}
