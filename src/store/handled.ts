import { getDb } from "./db";

export interface MarkHandledOptions {
  message_id: number; chat_id: number; project_id?: string; result?: string;
}

export function markHandled(opts: MarkHandledOptions): void {
  getDb().run(
    `INSERT OR IGNORE INTO handled_messages (message_id, chat_id, project_id, result) VALUES (?, ?, ?, ?)`,
    [opts.message_id, opts.chat_id, opts.project_id ?? null, opts.result ?? null]
  );
}

export function isHandled(message_id: number, chat_id: number): boolean {
  return getDb().query(`SELECT 1 FROM handled_messages WHERE message_id = ? AND chat_id = ? LIMIT 1`).get(message_id, chat_id) !== null;
}

export function getHandledCount(project_id?: string): number {
  const row = project_id
    ? getDb().query("SELECT COUNT(*) as cnt FROM handled_messages WHERE project_id = ?").get(project_id) as { cnt: number }
    : getDb().query("SELECT COUNT(*) as cnt FROM handled_messages").get() as { cnt: number };
  return row?.cnt ?? 0;
}
