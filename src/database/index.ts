import { DatabaseSync } from 'node:sqlite'

/**
 * Schema migrations, applied in order and tracked with PRAGMA user_version.
 * Never edit a shipped migration; append a new one.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE accounts (
    id            TEXT PRIMARY KEY,
    uuid          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    skin_url      TEXT,
    -- safeStorage-encrypted JSON: Microsoft refresh token + Minecraft access token
    secrets       BLOB NOT NULL,
    mc_expires_at INTEGER NOT NULL,
    needs_reauth  INTEGER NOT NULL DEFAULT 0,
    active        INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE instances (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    minecraft      TEXT NOT NULL,
    loader         TEXT NOT NULL,
    loader_version TEXT,
    version_id     TEXT,
    installed      INTEGER NOT NULL DEFAULT 0,
    game_dir       TEXT NOT NULL,
    java_path      TEXT,
    min_memory     INTEGER,
    max_memory     INTEGER,
    jvm_args       TEXT NOT NULL DEFAULT '',
    game_args      TEXT NOT NULL DEFAULT '',
    icon           TEXT,
    created_at     INTEGER NOT NULL,
    last_played_at INTEGER,
    play_time      INTEGER NOT NULL DEFAULT 0
  );

  -- Metadata for content installed from Modrinth/CurseForge. Files on disk stay the source of truth.
  CREATE TABLE instance_content (
    instance_id    TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    kind           TEXT NOT NULL,
    file_name      TEXT NOT NULL,
    source         TEXT NOT NULL,
    project_id     TEXT NOT NULL,
    version_id     TEXT NOT NULL,
    version_number TEXT,
    title          TEXT,
    icon_url       TEXT,
    PRIMARY KEY (instance_id, kind, file_name)
  );

  CREATE TABLE activity (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    at          INTEGER NOT NULL,
    kind        TEXT NOT NULL,
    message     TEXT NOT NULL,
    instance_id TEXT
  );
  CREATE INDEX activity_at ON activity(at DESC);
  `,
]

let handle: DatabaseSync | null = null

export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')
  migrate(db)
  handle = db
  return db
}

export function migrate(db: DatabaseSync): void {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number }
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN')
    try {
      db.exec(MIGRATIONS[v]!)
      db.exec(`PRAGMA user_version = ${v + 1}`)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw new Error(`Database migration ${v + 1} failed: ${(e as Error).message}`)
    }
  }
}

export function db(): DatabaseSync {
  if (!handle) throw new Error('Database not opened')
  return handle
}

export function transaction<T>(fn: () => T): T {
  const d = db()
  d.exec('BEGIN')
  try {
    const result = fn()
    d.exec('COMMIT')
    return result
  } catch (e) {
    d.exec('ROLLBACK')
    throw e
  }
}
