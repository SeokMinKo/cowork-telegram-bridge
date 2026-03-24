import { getTopicByConversation } from "../store/conversation_topics";

export interface GetConversationTopicInput {
  project_id: string;
  conversation_id: string;
}

export async function getConversationTopic(input: GetConversationTopicInput) {
  const topic = getTopicByConversation(input.conversation_id, input.project_id);
  if (!topic) return { found: false };
  return { found: true, ...topic };
}
