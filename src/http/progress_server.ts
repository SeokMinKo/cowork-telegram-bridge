import { getSession, isSessionActive, deactivateSession } from "../store/session_map";
import { formatToolEvent, formatCompleteEvent } from "../hooks/format_event";
import { MessageTracker } from "./message_tracker";

export interface TgAdapter {
  sendText: (opts: { chat_id: number; text: string; thread_id?: number }) => Promise<{ message_id: number }>;
  editMessage: (opts: { chat_id: number; message_id: number; text: string }) => Promise<{ message_id: number }>;
}

export interface ProgressServerOptions {
  port: number;
  hookSecret: string;
  tracker: MessageTracker;
  tg: TgAdapter;
}

const DEBOUNCE_MS = 100;

export function createProgressServer(opts: ProgressServerOptions) {
  const { hookSecret, tracker, tg } = opts;

  const server = Bun.serve({
    port: opts.port,
    fetch: async (req) => {
      const url = new URL(req.url);

      // Health check
      if (url.pathname === "/health") {
        return Response.json({ status: "ok", time: new Date().toISOString() });
      }

      // Auth check for all other endpoints
      const secret = req.headers.get("X-Hook-Secret");
      if (secret !== hookSecret) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }

      if (req.method !== "POST") {
        return Response.json({ error: "method not allowed" }, { status: 405 });
      }

      try {
        if (url.pathname === "/progress") {
          return await handleProgress(req);
        }
        if (url.pathname === "/complete") {
          return await handleComplete(req);
        }
        return Response.json({ error: "not found" }, { status: 404 });
      } catch (err) {
        console.error("[progress_server] 오류:", err);
        return Response.json({ error: String(err) }, { status: 500 });
      }
    },
  });

  async function handleProgress(req: Request): Promise<Response> {
    const body = await req.json() as {
      session_id: string;
      event_type: string;
      tool_name?: string;
      tool_input?: Record<string, any>;
    };

    const { session_id } = body;

    // Check if session is active
    if (!isSessionActive(session_id)) {
      return Response.json({ skipped: true, reason: "inactive_session" });
    }

    const session = getSession(session_id)!;

    // Format the tool event
    if (body.tool_name) {
      const formatted = formatToolEvent({
        tool_name: body.tool_name,
        tool_input: body.tool_input ?? {},
      });
      tracker.addToolLog(session_id, formatted);
    }

    // Debounced edit of the progress message
    tracker.debouncedEdit(session_id, DEBOUNCE_MS, async () => {
      const logs = tracker.getToolLog(session_id);
      const lines = [
        `🧠 ${session.project_id} 작업 중`,
        ...logs.map(l => `├ ${l}`),
        "└ ⏳ 진행 중...",
      ];
      const text = lines.join("\n");

      if (session.tg_message_id) {
        await tg.editMessage({
          chat_id: session.chat_id,
          message_id: session.tg_message_id,
          text,
        });
      }
    });

    return Response.json({ ok: true });
  }

  async function handleComplete(req: Request): Promise<Response> {
    const body = await req.json() as {
      session_id: string;
      duration_sec: number;
      thinking_summary?: string | null;
    };

    const { session_id } = body;

    if (!isSessionActive(session_id)) {
      return Response.json({ skipped: true, reason: "inactive_session" });
    }

    const session = getSession(session_id)!;
    const toolLog = tracker.getToolLog(session_id);

    const text = formatCompleteEvent({
      project_id: session.project_id,
      tool_log: toolLog,
      duration_sec: body.duration_sec,
      thinking_summary: body.thinking_summary ?? null,
    });

    // Send a new final message (not edit) for push notification
    await tg.sendText({
      chat_id: session.chat_id,
      text,
      thread_id: session.thread_id ?? undefined,
    });

    // Cleanup
    deactivateSession(session_id);
    tracker.clearSession(session_id);

    return Response.json({ ok: true });
  }

  return server;
}
