import { statSync } from "fs";
import { sendDocument } from "../telegram/client";

export interface SendFileInput { chat_id: number; file_path: string; caption?: string; thread_id?: number; }

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

export async function sendFile(input: SendFileInput) {
  let stat: ReturnType<typeof statSync>;
  try { stat = statSync(input.file_path); }
  catch { throw new Error(`파일을 찾을 수 없습니다: ${input.file_path}`); }
  if (stat.size > 50 * 1024 * 1024) throw new Error(`파일 크기 초과: ${(stat.size/1024/1024).toFixed(1)}MB`);
  const ext    = "." + (input.file_path.split(".").pop() ?? "").toLowerCase();
  const sentAs = IMAGE_EXTS.has(ext) ? "photo" : "document";
  const res = await sendDocument({ chat_id: input.chat_id, file_path: input.file_path, caption: input.caption, thread_id: input.thread_id });
  return { message_id: res.message_id, success: true, file_size_kb: Math.round(stat.size / 1024), sent_as: sentAs };
}
