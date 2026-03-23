import { Database } from "bun:sqlite";

export interface SessionRecord {
  session_id: string;
  chat_id: number;
  thread_id: number | null;
  project_id: string;
  tg_message_id: number | null;
  is_active: boolean;
  started_at: string;
  expires_at: string;
}

export interface RegisterSessionInput {
  session_id: string;
  chat_id: number;
  thread_id: number | null;
  project_id: string;
}

let _db: Database | null = null;

const SESSION_SCHEMA = `
CREATE TABLE IF NOT EXISTS session_map (
  session_id    TEXT PRIMARY KEY,
  chat_id       INTEGER NOT NULL,
  thread_id     INTEGER,
  project_id    TEXT NOT NULL,
  tg_message_id INTEGER,
  is_active     INTEGER NOT NULL DEFAULT 0,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL DEFAULT (datetime('now', '+2 hours'))
);`;

export function initSessionMap(db: Database): void {
  _db = db;
  _db.run(SESSION_SCHEMA);
}

function db(): Database {
  if (!_db) throw new Error("session_map이 초기화되지 않았습니다");
  return _db;
}

export function registerSession(input: RegisterSessionInput): void {
  db().run(
    `INSERT INTO session_map (session_id, chat_id, thread_id, project_id, is_active, tg_message_id)
     VALUES (?, ?, ?, ?, 0, NULL)
     ON CONFLICT(session_id) DO UPDATE SET
       chat_id = excluded.chat_id,
       thread_id = excluded.thread_id,
       project_id = excluded.project_id,
       started_at = datetime('now'),
       expires_at = datetime('now', '+2 hours')`,
    [input.session_id, input.chat_id, input.thread_id, input.project_id]
  );
}

export function activateSession(sessionId: string, tgMessageId: number): void {
  db().run(
    "UPDATE session_map SET is_active = 1, tg_message_id = ? WHERE session_id = ?",
    [tgMessageId, sessionId]
  );
}

export function deactivateSession(sessionId: string): void {
  db().run("UPDATE session_map SET is_active = 0 WHERE session_id = ?", [sessionId]);
}

export function getSession(sessionId: string): SessionRecord | null {
  const row = db()
    .query("SELECT * FROM session_map WHERE session_id = ?")
    .get(sessionId) as any;
  if (!row) return null;
  return { ...row, is_active: row.is_active === 1 };
}

export function isSessionActive(sessionId: string): boolean {
  const session = getSession(sessionId);
  return session?.is_active ?? false;
}

export function cleanExpiredSessions(): void {
  db().run("DELETE FROM session_map WHERE expires_at < datetime('now')");
}
