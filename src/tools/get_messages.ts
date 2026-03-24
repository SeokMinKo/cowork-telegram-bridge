import { getPending } from "../store/pending";
import { getTopicByThread } from "../store/conversation_topics";

export interface GetMessagesInput { project_id?: string; limit?: number; since_min?: number; }

export async function getMessages(input: GetMessagesInput) {
  const rows = getPending({ project_id: input.project_id, limit: input.limit ?? 20, since_min: input.since_min });
  const enriched = rows.map(r => {
    if (r.thread_id != null) {
      const topic = getTopicByThread(r.chat_id, r.thread_id);
      return { ...r, conversation_id: topic?.conversation_id ?? null };
    }
    return { ...r, conversation_id: null };
  });
  return { messages: enriched, count: enriched.length, fetched_at: new Date().toISOString() };
}
