import { existsSync, statSync, readFileSync } from "fs";
import { basename } from "path";
import { chunkText } from "./chunker";

let _token = "";
let _apiBase = "https://api.telegram.org";

export function initClient(): void {
  _token   = process.env.TELEGRAM_BOT_TOKEN ?? "";
  _apiBase = process.env.TELEGRAM_API_BASE  ?? "https://api.telegram.org";
  if (!_token) throw new Error("TELEGRAM_BOT_TOKEN이 설정되지 않았습니다");
}

function apiUrl(method: string): string { return `${_apiBase}/bot${_token}/${method}`; }

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(apiUrl(method), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json() as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`Telegram API 오류 [${method}]: ${json.description}`);
  return json.result;
}

export interface BotInfo { id: number; username: string; is_bot: boolean; }
export interface SendTextOptions { chat_id: number; text: string; thread_id?: number; reply_to?: number; }
export interface SendDocumentOptions { chat_id: number; file_path: string; caption?: string; thread_id?: number; }
export interface TgMessage { message_id: number; }

export async function getBotInfo(): Promise<BotInfo> { return call<BotInfo>("getMe", {}); }

export async function sendText(opts: SendTextOptions): Promise<TgMessage> {
  const chunks = chunkText(opts.text);
  let last: TgMessage = { message_id: 0 };
  for (const chunk of chunks) {
    const body: Record<string, unknown> = { chat_id: opts.chat_id, text: chunk, parse_mode: "HTML" };
    if (opts.thread_id != null) body["message_thread_id"]   = opts.thread_id;
    if (opts.reply_to  != null) body["reply_to_message_id"] = opts.reply_to;
    last = await call<TgMessage>("sendMessage", body);
  }
  return last;
}

export async function sendDocument(opts: SendDocumentOptions): Promise<TgMessage> {
  if (!existsSync(opts.file_path)) throw new Error(`파일을 찾을 수 없습니다: ${opts.file_path}`);
  const stat = statSync(opts.file_path);
  if (stat.size > 50 * 1024 * 1024) throw new Error(`파일 크기 초과: ${(stat.size/1024/1024).toFixed(1)}MB (최대 50MB)`);
  const fileData = readFileSync(opts.file_path);
  const fileName = basename(opts.file_path);
  const isPhoto  = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
  const form = new FormData();
  form.set("chat_id", String(opts.chat_id));
  form.set(isPhoto ? "photo" : "document", new Blob([fileData]), fileName);
  if (opts.caption)   form.set("caption", opts.caption);
  if (opts.thread_id) form.set("message_thread_id", String(opts.thread_id));
  const res  = await fetch(apiUrl(isPhoto ? "sendPhoto" : "sendDocument"), { method: "POST", body: form });
  const json = await res.json() as { ok: boolean; result: TgMessage; description?: string };
  if (!json.ok) throw new Error(`Telegram 파일 전송 오류: ${json.description}`);
  return json.result;
}

export async function editMessage(opts: { chat_id: number; message_id: number; text: string }): Promise<TgMessage> {
  try {
    return await call<TgMessage>("editMessageText", {
      chat_id: opts.chat_id,
      message_id: opts.message_id,
      text: opts.text,
      parse_mode: "HTML",
    });
  } catch (err) {
    // "message is not modified" is expected when content is identical
    if (String(err).includes("message is not modified")) {
      return { message_id: opts.message_id };
    }
    throw err;
  }
}

export async function getUpdates(offset: number): Promise<unknown[]> {
  return call<unknown[]>("getUpdates", { offset, timeout: 5 });
}
