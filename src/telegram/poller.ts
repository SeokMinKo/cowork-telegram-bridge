import { getUpdates } from "./client";
import { insertPending } from "../store/pending";
import { getPollOffset, setPollOffset, setMeta } from "../store/meta";
import { findProjectByChatAndThread, findProjectByKeyword, findTopicSyncProject, getConfig } from "../config/loader";
import { getTopicByThread } from "../store/conversation_topics";
import { filterAllowed } from "../security/allowlist";

let _timer: ReturnType<typeof setInterval> | null = null;
let _backoff = 30_000;
const MAX_BACKOFF = 5 * 60_000;

interface TgUpdate { update_id: number; message?: any; }

export async function pollOnce(): Promise<void> {
  const offset  = getPollOffset();
  const updates = (await getUpdates(offset)) as TgUpdate[];
  if (!updates.length) return;
  const maxId = Math.max(...updates.map(u => u.update_id));
  setPollOffset(maxId + 1);
  setMeta("last_poll_at", new Date().toISOString());
  const messages = updates.map(u => u.message).filter((m): m is any => m !== undefined);
  if (!messages.length) return;
  const cfg     = getConfig();
  const allowed = cfg.security.allowed_sender_ids;
  const permitted = filterAllowed(messages.map(m => ({ ...m, from_id: m.from?.id ?? null })), allowed);
  for (const msg of permitted) {
    const threadId = msg.message_thread_id ?? null;
    const text     = msg.text ?? msg.caption ?? null;
    const hasFile  = !!(msg.photo || msg.document);
    let projectId: string;
    // 1단계: 정적 매핑
    const byThread = findProjectByChatAndThread(msg.chat.id, threadId);
    if (byThread) {
      projectId = byThread.project_id;
      if (process.env.DEBUG) console.error(`[poller] 정적 매핑: chat=${msg.chat.id} thread=${threadId} → ${projectId}`);
    }
    // 2단계: 동적 토픽 DB 조회
    else if (threadId !== null) {
      const topicRecord = getTopicByThread(msg.chat.id, threadId);
      if (topicRecord) {
        projectId = topicRecord.project_id;
        if (process.env.DEBUG) console.error(`[poller] 동적 토픽: chat=${msg.chat.id} thread=${threadId} → ${projectId} (conv: ${topicRecord.conversation_id})`);
      } else {
        // 3단계: topic_sync 그룹 폴백
        const syncProject = findTopicSyncProject(msg.chat.id);
        if (syncProject) {
          projectId = syncProject.project_id;
          if (process.env.DEBUG) console.error(`[poller] topic_sync 폴백: chat=${msg.chat.id} thread=${threadId} → ${projectId}`);
        } else if (text) {
          const byKw = findProjectByKeyword(text); projectId = byKw?.project_id ?? "unknown";
        } else { projectId = "unknown"; }
      }
    }
    else if (text) { const byKw = findProjectByKeyword(text); projectId = byKw?.project_id ?? "unknown"; }
    else { projectId = "unknown"; }
    insertPending({
      message_id: msg.message_id, chat_id: msg.chat.id, thread_id: threadId,
      from_id: msg.from?.id ?? null, from_name: msg.from?.first_name ?? msg.from?.username ?? null,
      text, has_file: hasFile, file_path: null, project_id: projectId,
    });
  }
}

export function startPoller(intervalMs = 30_000): void {
  stopPoller();
  _timer = setInterval(async () => {
    try { await pollOnce(); _backoff = 30_000; }
    catch (err) {
      console.error("[poller] 폴링 오류:", err);
      _backoff = Math.min(_backoff * 2, MAX_BACKOFF);
      stopPoller();
      setTimeout(() => startPoller(intervalMs), _backoff);
    }
  }, intervalMs);
}

export function stopPoller(): void {
  if (_timer !== null) { clearInterval(_timer); _timer = null; }
}
