import { listTopicsByProject } from "../store/conversation_topics";

export interface ListConversationTopicsInput {
  project_id: string;
  status?: "open" | "closed";
}

export async function listConversationTopics(input: ListConversationTopicsInput) {
  const topics = listTopicsByProject(input.project_id, input.status);
  return { topics, count: topics.length };
}
