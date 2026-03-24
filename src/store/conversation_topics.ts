import { getDb } from "./db";

export interface ConversationTopic {
  id: number;
  conversation_id: string;
  project_id: string;
  chat_id: number;
  thread_id: number;
  topic_name: string;
  status: "open" | "closed";
  created_at: string;
  closed_at: string | null;
}

export interface InsertTopicInput {
  conversation_id: string;
  project_id: string;
  chat_id: number;
  thread_id: number;
  topic_name: string;
}

export function insertConversationTopic(input: InsertTopicInput): void {
  getDb().run(
    `INSERT OR IGNORE INTO conversation_topics
       (conversation_id, project_id, chat_id, thread_id, topic_name)
     VALUES (?, ?, ?, ?, ?)`,
    [input.conversation_id, input.project_id, input.chat_id, input.thread_id, input.topic_name],
  );
}

export function getTopicByConversation(conversationId: string, projectId: string): ConversationTopic | null {
  const row = getDb()
    .query("SELECT * FROM conversation_topics WHERE conversation_id = ? AND project_id = ?")
    .get(conversationId, projectId) as ConversationTopic | null;
  return row ?? null;
}

export function getTopicByThread(chatId: number, threadId: number): ConversationTopic | null {
  const row = getDb()
    .query("SELECT * FROM conversation_topics WHERE chat_id = ? AND thread_id = ? AND status = 'open'")
    .get(chatId, threadId) as ConversationTopic | null;
  return row ?? null;
}

export function listTopicsByProject(projectId: string, status?: string): ConversationTopic[] {
  if (status) {
    return getDb()
      .query("SELECT * FROM conversation_topics WHERE project_id = ? AND status = ? ORDER BY created_at DESC")
      .all(projectId, status) as ConversationTopic[];
  }
  return getDb()
    .query("SELECT * FROM conversation_topics WHERE project_id = ? ORDER BY created_at DESC")
    .all(projectId) as ConversationTopic[];
}

export function updateTopicStatus(
  conversationId: string,
  projectId: string,
  status: "open" | "closed",
  closedAt?: string | null,
): void {
  getDb().run(
    "UPDATE conversation_topics SET status = ?, closed_at = ? WHERE conversation_id = ? AND project_id = ?",
    [status, closedAt ?? null, conversationId, projectId],
  );
}
