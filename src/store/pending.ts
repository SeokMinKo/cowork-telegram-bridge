import { getDb } from "./db";

export interface PendingMessage {
  id: number; message_id: number; chat_id: number;
  thread_id: number | null; from_id: number | null;
  from_name: string | null; text: string | null;
  has_file: boolean; file_path: string | null;
  project_id: string | null; received_at: string;
}

export interface GetPendingOptions {
  project_id?: string; limit?: number; since_min?: number;
}

export function insertPending(msg: Omit<PendingMessage, "id" | "received_at">): void {
  getDb().run(
    `INSERT OR IGNORE INTO pending_messages
       (message_id, chat_id, thread_id, from_id, from_name, text, has_file, file_path, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [msg.message_id, msg.chat_id, msg.thread_id ?? null, msg.from_id ?? null,
     msg.from_name ?? null, msg.text ?? null, msg.has_file ? 1 : 0,
     msg.file_path ?? null, msg.project_id ?? null]
  );
}

export function getPending(opts: GetPendingOptions): PendingMessage[] {
  const { project_id, limit = 100, since_min } = opts;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (project_id !== undefined) { conditions.push("project_id = ?"); params.push(project_id); }
  if (since_min !== undefined) { conditions.push("received_at >= datetime('now', ?)"); params.push(`-${since_min} minutes`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);
  const rows = getDb().query(`SELECT * FROM pending_messages ${where} ORDER BY received_at ASC LIMIT ?`).all(...params) as any[];
  return rows.map(r => ({ ...r, has_file: r.has_file === 1 }));
}

export function deletePending(message_id: number, chat_id: number): void {
  getDb().run("DELETE FROM pending_messages WHERE message_id = ? AND chat_id = ?", [message_id, chat_id]);
}

export function countPending(project_id?: string): number {
  const row = project_id
    ? getDb().query("SELECT COUNT(*) as cnt FROM pending_messages WHERE project_id = ?").get(project_id) as { cnt: number }
    : getDb().query("SELECT COUNT(*) as cnt FROM pending_messages").get() as { cnt: number };
  return row?.cnt ?? 0;
}
