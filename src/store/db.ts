import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";
import { dirname, resolve } from "path";

let _db: Database | null = null;

function resolveDbPath(): string {
  const raw = process.env.DB_PATH ?? "./data/bridge.db";
  return resolve(raw.replace(/^~/, process.env.HOME ?? ""));
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS pending_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id   INTEGER NOT NULL,
  chat_id      INTEGER NOT NULL,
  thread_id    INTEGER,
  from_id      INTEGER,
  from_name    TEXT,
  text         TEXT,
  has_file     INTEGER NOT NULL DEFAULT 0,
  file_path    TEXT,
  project_id   TEXT,
  received_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(message_id, chat_id)
);
CREATE TABLE IF NOT EXISTS handled_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id   INTEGER NOT NULL,
  chat_id      INTEGER NOT NULL,
  project_id   TEXT,
  result       TEXT,
  handled_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(message_id, chat_id)
);
CREATE TABLE IF NOT EXISTS sent_messages (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_message_id INTEGER NOT NULL,
  chat_id             INTEGER NOT NULL,
  thread_id           INTEGER,
  project_id          TEXT,
  content_summary     TEXT,
  sent_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);`;

const SEED_SQL = `
INSERT OR IGNORE INTO meta (key, value) VALUES ('poll_offset',    '0');
INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1');
INSERT OR IGNORE INTO meta (key, value) VALUES ('server_start',   datetime('now'));`;

export function initDb(): Database {
  if (_db) return _db;
  const dbPath = resolveDbPath();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const db = new Database(dbPath, { create: true });
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA foreign_keys = ON;");
  db.run(SCHEMA_SQL);
  db.run(SEED_SQL);
  _db = db;
  return _db;
}

export function getDb(): Database {
  if (!_db) throw new Error("DB가 초기화되지 않았습니다");
  return _db;
}

export function closeDb(): void {
  if (_db) { _db.close(); _db = null; }
}
