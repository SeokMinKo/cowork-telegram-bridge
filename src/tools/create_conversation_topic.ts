import { getConfig } from "../config/loader";
import { createForumTopic, reopenForumTopic } from "../telegram/client";
import {
  getTopicByConversation,
  insertConversationTopic,
  updateTopicStatus,
} from "../store/conversation_topics";

export interface CreateConversationTopicInput {
  project_id: string;
  conversation_id: string;
  topic_name: string;
  icon_color?: number;
}

export async function createConversationTopic(input: CreateConversationTopicInput) {
  const cfg = getConfig();
  const project = cfg.projects.find(p => p.project_id === input.project_id);
  if (!project) throw new Error(`프로젝트를 찾을 수 없습니다: ${input.project_id}`);
  if (!project.topic_sync) throw new Error(`이 프로젝트는 topic_sync가 활성화되지 않았습니다: ${input.project_id}`);

  // 멱등: 이미 존재하는 토픽 확인
  const existing = getTopicByConversation(input.conversation_id, input.project_id);
  if (existing) {
    if (existing.status === "open") {
      if (process.env.DEBUG) console.error(`[topic-sync] 기존 토픽 반환: ${input.project_id}/${input.conversation_id} → thread:${existing.thread_id}`);
      return { thread_id: existing.thread_id, topic_name: existing.topic_name, conversation_id: input.conversation_id, created: false, reopened: false };
    }
    // closed → reopen
    await reopenForumTopic(project.chat_id, existing.thread_id);
    updateTopicStatus(input.conversation_id, input.project_id, "open", null);
    if (process.env.DEBUG) console.error(`[topic-sync] 토픽 재개: ${input.project_id}/${input.conversation_id} → thread:${existing.thread_id}`);
    return { thread_id: existing.thread_id, topic_name: existing.topic_name, conversation_id: input.conversation_id, created: false, reopened: true };
  }

  // 새 토픽 생성
  const iconColor = input.icon_color ?? project.topic_icon_color;
  const result = await createForumTopic({ chat_id: project.chat_id, name: input.topic_name, icon_color: iconColor });

  insertConversationTopic({
    conversation_id: input.conversation_id,
    project_id: input.project_id,
    chat_id: project.chat_id,
    thread_id: result.message_thread_id,
    topic_name: input.topic_name,
  });

  if (process.env.DEBUG) console.error(`[topic-sync] 토픽 생성: ${input.project_id}/${input.conversation_id} → thread:${result.message_thread_id}`);
  return { thread_id: result.message_thread_id, topic_name: input.topic_name, conversation_id: input.conversation_id, created: true, reopened: false };
}
