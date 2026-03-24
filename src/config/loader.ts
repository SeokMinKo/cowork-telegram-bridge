import { readFileSync, watchFile, unwatchFile } from "fs";
import { resolve } from "path";

export interface ProjectConfig {
  project_id: string; description: string; chat_id: number;
  thread_id: number | null; folder_path: string;
  keywords: string[]; alert_on_schedule: boolean;
  topic_sync?: boolean;
  topic_icon_color?: number;
}
export interface SecurityConfig {
  allowed_sender_ids: number[]; unknown_sender_policy: "silent_drop" | "reply_reject";
}
export interface BridgeConfig {
  version: number; security: SecurityConfig;
  default_dm_chat_id: number; projects: ProjectConfig[];
}

let _config: BridgeConfig | null = null;
let _watchedPath: string | null = null;

function resolveConfigPath(): string {
  const raw = process.env.CHATS_CONFIG_PATH || "./config/chats.json";
  if (!raw) return "./config/chats.json";
  return resolve(raw.replace(/^~/, process.env.HOME ?? ""));
}

function validate(raw: unknown): BridgeConfig {
  if (typeof raw !== "object" || raw === null) throw new Error("설정 파일이 올바른 JSON 객체가 아닙니다");
  const obj = raw as Record<string, unknown>;
  if (obj["version"] === undefined) throw new Error("설정 파일에 version 필드가 없습니다");
  if (!Array.isArray(obj["projects"])) throw new Error("설정 파일에 projects 배열이 없습니다");
  const security: SecurityConfig = {
    allowed_sender_ids: [], unknown_sender_policy: "silent_drop",
    ...(typeof obj["security"] === "object" && obj["security"] !== null ? obj["security"] : {}),
  };
  if (security.allowed_sender_ids.length === 0)
    console.warn("[cowork-telegram-bridge] ⚠️  allowed_sender_ids가 비어있습니다. chats.json에 허용할 sender ID를 추가하세요.");
  const projects = obj["projects"] as ProjectConfig[];
  const syncChatIds = new Set<number>();
  for (const p of projects) {
    if (p.topic_sync) {
      if (p.thread_id != null)
        console.warn(`[config] ⚠️ ${p.project_id}: topic_sync=true이면 thread_id는 null이어야 합니다`);
      if (syncChatIds.has(p.chat_id))
        console.warn(`[config] ⚠️ chat_id ${p.chat_id}에 topic_sync 프로젝트가 2개 이상입니다`);
      syncChatIds.add(p.chat_id);
    }
  }
  return { version: obj["version"] as number, security, default_dm_chat_id: (obj["default_dm_chat_id"] as number) ?? 0, projects };
}

export function loadConfig(): BridgeConfig {
  const path = resolveConfigPath();
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { throw new Error(`설정 파일을 읽을 수 없습니다 (${path}): ${e}`); }
  _config = validate(raw);
  if (_watchedPath !== path) {
    if (_watchedPath) unwatchFile(_watchedPath);
    _watchedPath = path;
    watchFile(path, { interval: 2000 }, () => {
      try { loadConfig(); console.info("[cowork-telegram-bridge] 설정 파일이 리로드되었습니다."); }
      catch (e) { console.error("[cowork-telegram-bridge] 설정 리로드 실패:", e); }
    });
  }
  return _config;
}

export function getConfig(): BridgeConfig {
  if (!_config) throw new Error("설정이 로드되지 않았습니다. loadConfig()를 먼저 호출하세요.");
  return _config;
}

export function findProjectByChatAndThread(chat_id: number, thread_id: number | null): ProjectConfig | null {
  const { projects } = getConfig();
  if (thread_id !== null) return projects.find(p => p.chat_id === chat_id && p.thread_id === thread_id) ?? null;
  return projects.find(p => p.chat_id === chat_id && p.thread_id === null) ?? null;
}

export function findTopicSyncProject(chat_id: number): ProjectConfig | null {
  const { projects } = getConfig();
  return projects.find(p => p.chat_id === chat_id && p.topic_sync === true) ?? null;
}

export function findProjectByKeyword(text: string): ProjectConfig | null {
  const lower = text.toLowerCase();
  const { projects } = getConfig();
  return projects.find(p => p.keywords.some(kw => lower.includes(kw.toLowerCase()))) ?? null;
}
