import { registerSession, activateSession, deactivateSession, getSession } from "../store/session_map";
import { formatStartEvent } from "../hooks/format_event";

export interface SendProgressInput {
  project_id: string;
  chat_id: number;
  thread_id: number | null;
  message_id: number;
  status: string;
  phase: "thinking" | "tool" | "done";
  session_id?: string;
}

export interface SendProgressResult {
  success: boolean;
  session_id: string;
  tg_message_id: number | null;
}

interface TgSender {
  sendText: (opts: { chat_id: number; text: string; thread_id?: number }) => Promise<{ message_id: number }>;
}

export function createSendProgress(tg: TgSender) {
  return async function sendProgress(input: SendProgressInput): Promise<SendProgressResult> {
    // Resolve session_id: use provided, env var, or generate
    const sessionId = input.session_id
      ?? process.env.CLAUDE_SESSION_ID
      ?? `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (input.phase === "thinking") {
      // Register + activate session, send initial Telegram message
      registerSession({
        session_id: sessionId,
        chat_id: input.chat_id,
        thread_id: input.thread_id,
        project_id: input.project_id,
      });

      const text = formatStartEvent(input.project_id);
      const msg = await tg.sendText({
        chat_id: input.chat_id,
        text,
        thread_id: input.thread_id ?? undefined,
      });

      activateSession(sessionId, msg.message_id);

      return { success: true, session_id: sessionId, tg_message_id: msg.message_id };
    }

    if (input.phase === "done") {
      deactivateSession(sessionId);
      return { success: true, session_id: sessionId, tg_message_id: null };
    }

    // phase === "tool": session should already exist
    return { success: true, session_id: sessionId, tg_message_id: null };
  };
}
