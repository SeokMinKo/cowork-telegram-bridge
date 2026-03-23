import { getConfig } from "../config/loader";
import { sendText } from "../telegram/client";
import { sendFile } from "./send_file";

export type AlertLevel = "info" | "success" | "warning" | "error";
export interface RunAlertInput { project_id: string; title: string; body: string; level?: AlertLevel; file_path?: string; }

const EMOJI: Record<AlertLevel, string> = { info: "ℹ️", success: "✅", warning: "⚠️", error: "❌" };

export async function runAlert(input: RunAlertInput) {
  const cfg     = getConfig();
  const project = cfg.projects.find(p => p.project_id === input.project_id);
  if (!project) throw new Error(`프로젝트를 찾을 수 없습니다: ${input.project_id}`);
  const level = input.level ?? "info";
  const text  = `${EMOJI[level]} <b>${input.title}</b>\n\n${input.body}`;
  const res = await sendText({ chat_id: project.chat_id, text, thread_id: project.thread_id ?? undefined });
  if (input.file_path) await sendFile({ chat_id: project.chat_id, file_path: input.file_path, thread_id: project.thread_id ?? undefined });
  return { message_id: res.message_id, success: true };
}
