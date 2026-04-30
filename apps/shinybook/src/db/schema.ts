// Schema initialization. Uses a `meta` table to track applied migrations
// so future schema changes don't require wiping local data.

import { getDb } from "./client";

const MIGRATIONS: Array<{ version: number; up: string }> = [
  {
    version: 1,
    up: `
      CREATE TABLE IF NOT EXISTS paintings (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        brand TEXT,
        artist TEXT,
        status TEXT NOT NULL,
        sourceUrl TEXT,
        canvasSize TEXT,
        drillShape TEXT,
        drillCount INTEGER,
        colorCount INTEGER,
        price REAL,
        currency TEXT,
        purchasedAt TEXT,
        receivedAt TEXT,
        startedAt TEXT,
        completedAt TEXT,
        hoursWorked REAL DEFAULT 0,
        rating INTEGER,
        coverImage TEXT,
        progressPhotos TEXT,    -- JSON array of URIs
        description TEXT,
        notes TEXT,
        tags TEXT,              -- JSON array
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_paintings_status ON paintings(status);
      CREATE INDEX IF NOT EXISTS idx_paintings_brand ON paintings(brand);
      CREATE INDEX IF NOT EXISTS idx_paintings_completedAt ON paintings(completedAt);

      CREATE TABLE IF NOT EXISTS drills (
        id TEXT PRIMARY KEY,
        drillNumber TEXT NOT NULL,
        brand TEXT NOT NULL,
        shape TEXT NOT NULL,
        approximateCount INTEGER NOT NULL DEFAULT 0,
        colorName TEXT,
        colorHex TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        UNIQUE(brand, drillNumber)
      );
      CREATE INDEX IF NOT EXISTS idx_drills_brand ON drills(brand);

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        paintingId TEXT NOT NULL,
        startedAt TEXT NOT NULL,
        endedAt TEXT,
        durationSeconds INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        FOREIGN KEY (paintingId) REFERENCES paintings(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_paintingId ON sessions(paintingId);
    `,
  },
  {
    // v2: cloud-sync support.
    //   - deletedAt on all entities (soft-delete so the server can replay
    //     the removal to other devices via the /sync delta cursor).
    //   - sessions get createdAt/updatedAt to participate in the same sync
    //     cursor mechanism (other entities already have them).
    //   - outbox queues local writes that haven't been confirmed by the
    //     server yet. Cleared on flush, retained on transient failure.
    //   - sync_cursors stores the last server updatedAt seen per entity.
    version: 2,
    up: `
      ALTER TABLE paintings ADD COLUMN deletedAt TEXT;
      ALTER TABLE drills ADD COLUMN deletedAt TEXT;
      ALTER TABLE sessions ADD COLUMN createdAt TEXT;
      ALTER TABLE sessions ADD COLUMN updatedAt TEXT;
      ALTER TABLE sessions ADD COLUMN deletedAt TEXT;
      UPDATE sessions SET createdAt = COALESCE(createdAt, startedAt),
                          updatedAt = COALESCE(updatedAt, startedAt);

      CREATE INDEX IF NOT EXISTS idx_paintings_deletedAt ON paintings(deletedAt);
      CREATE INDEX IF NOT EXISTS idx_drills_deletedAt ON drills(deletedAt);
      CREATE INDEX IF NOT EXISTS idx_sessions_deletedAt ON sessions(deletedAt);
      CREATE INDEX IF NOT EXISTS idx_sessions_updatedAt ON sessions(updatedAt);

      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL,             -- 'painting' | 'drill' | 'session'
        op TEXT NOT NULL,                 -- 'create' | 'update' | 'delete' | 'upsert'
        targetId TEXT,                    -- entity id, NULL for bulk upsert
        payload TEXT NOT NULL,            -- JSON
        createdAt TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        nextAttemptAt TEXT,               -- backoff scheduling
        lastError TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_nextAttempt ON outbox(nextAttemptAt);

      CREATE TABLE IF NOT EXISTS sync_cursors (
        entity TEXT PRIMARY KEY,
        cursor TEXT,
        lastSyncedAt TEXT
      );
    `,
  },
  {
    // v3: per-painting quantity. Defaults to 1; UI only surfaces it when > 1.
    // Used by the import dedup flow to bump an existing row instead of
    // inserting a duplicate when the same painting is re-registered.
    version: 3,
    up: `
      ALTER TABLE paintings ADD COLUMN quantity INTEGER;
      UPDATE paintings SET quantity = 1 WHERE quantity IS NULL;
    `,
  },
  {
    // v4: acquisition source — 'purchase' (default) or 'destash'. Left NULL
    // for pre-existing rows so we can tell "unspecified" from "explicitly
    // purchase"; UI treats NULL as purchase.
    version: 4,
    up: `
      ALTER TABLE paintings ADD COLUMN source TEXT;
    `,
  },
  {
    // v5: optional event/release the painting was acquired at. NULL when not
    // tied to an event. Form's "Event" checkbox toggles presence.
    version: 5,
    up: `
      ALTER TABLE paintings ADD COLUMN eventName TEXT;
    `,
  },
  {
    // v6: drill specialty type (finish coating applied on top of shape).
    // NULL means "standard" for pre-existing rows.
    version: 6,
    up: `
      ALTER TABLE drills ADD COLUMN specialtyType TEXT;
    `,
  },
];

export async function initDb(): Promise<void> {
  const db = await getDb();
  await db.execAsync("PRAGMA foreign_keys = ON;");
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key = ?",
    ["schemaVersion"]
  );
  const current = row ? parseInt(row.value, 10) : 0;

  for (const { version, up } of MIGRATIONS) {
    if (version > current) {
      await db.execAsync(up);
      await db.runAsync(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
        ["schemaVersion", String(version)]
      );
    }
  }
}
