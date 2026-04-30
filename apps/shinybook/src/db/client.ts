// SQLite client + initialization. Uses the async expo-sqlite API so the
// same code path works on iOS, Android, and web (web's sync API requires
// SharedArrayBuffer + cross-origin isolation and still hangs on some
// platforms — async sidesteps both issues).

import * as SQLite from "expo-sqlite";

const DB_NAME = "shinybook.db";

let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!_dbPromise) _dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  return _dbPromise;
}

// Generates a short, sortable-ish id without pulling in uuid as a dep.
// Format: 8 hex chars of timestamp + 6 random hex chars.
export function newId(): string {
  const ts = Date.now().toString(16).padStart(8, "0").slice(-8);
  const rand = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
  return `${ts}${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
