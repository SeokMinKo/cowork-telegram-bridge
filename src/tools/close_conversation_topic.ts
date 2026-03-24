import { closeForumTopic } from "../telegram/client";
import { getTopicByConversation, updateTopicStatus } from "../store/conversation_topics";

export interface CloseConversationTopicInput {
  project_id: string;
  conversation_id: string;
}

export async function closeConversationTopic(input: CloseConversationTopicInput) {
  const topic = getTopicByConversation(input.conversation_id, input.project_id);
  if (!topic) throw new Error(`토픽을 찾을 수 없습니다: ${input.project_id}/${input.conversation_id}`);

  if (topic.status === "closed") {
    return { success: true, already_closed: true, closed_at: topic.closed_at };
  }

  await closeForumTopic(topic.chat_id, topic.thread_id);
  const closedAt = new Date().toISOString();
  updateTopicStatus(input.conversation_id, input.project_id, "closed", closedAt);

  if (process.env.DEBUG) console.error(`[topic-sync] 토픽 닫기: ${input.project_id}/${input.conversation_id} → thread:${topic.thread_id}`);
  return { success: true, already_closed: false, closed_at: closedAt };
}
