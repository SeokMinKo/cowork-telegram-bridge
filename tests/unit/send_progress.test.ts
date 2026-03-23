import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSessionMap, getSession, isSessionActive } from "../../src/store/session_map";
import { createSendProgress } from "../../src/tools/send_progress";

describe("send_progress", () => {
  let db: Database;
  const sentMessages: any[] = [];

  const mockTg = {
    sendText: async (opts: any) => {
      const msg = { message_id: sentMessages.length + 2000 };
      sentMessages.push({ ...opts, result: msg });
      return msg;
    },
  };

  beforeEach(() => {
    db = new Database(":memory:");
    initSessionMap(db);
    sentMessages.length = 0;
  });

  afterEach(() => {
    db.close();
  });

  test("start phase: registers + activates session, sends initial message", async () => {
    const sendProgress = createSendProgress(mockTg as any);
    const result = await sendProgress({
      project_id: "myproj",
      chat_id: 12345,
      thread_id: null,
      message_id: 555,
      status: "시작",
      phase: "thinking",
    });

    expect(result.success).toBe(true);
    expect(result.tg_message_id).toBe(2000);

    // Session should be active
    const sessionId = result.session_id;
    expect(isSessionActive(sessionId)).toBe(true);

    const session = getSession(sessionId)!;
    expect(session.chat_id).toBe(12345);
    expect(session.project_id).toBe("myproj");
    expect(session.tg_message_id).toBe(2000);

    // Should have sent a Telegram message
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].text).toContain("작업 시작");
  });

  test("tool phase: updates tool log in existing session", async () => {
    const sendProgress = createSendProgress(mockTg as any);

    // First call: start
    const startResult = await sendProgress({
      project_id: "proj2",
      chat_id: 999,
      thread_id: null,
      message_id: 100,
      status: "시작",
      phase: "thinking",
    });

    // Second call: tool update
    const toolResult = await sendProgress({
      project_id: "proj2",
      chat_id: 999,
      thread_id: null,
      message_id: 100,
      status: "파일 분석 중",
      phase: "tool",
      session_id: startResult.session_id,
    });

    expect(toolResult.success).toBe(true);
  });

  test("done phase: deactivates session", async () => {
    const sendProgress = createSendProgress(mockTg as any);

    const startResult = await sendProgress({
      project_id: "proj3",
      chat_id: 111,
      thread_id: null,
      message_id: 200,
      status: "시작",
      phase: "thinking",
    });

    const sessionId = startResult.session_id;
    expect(isSessionActive(sessionId)).toBe(true);

    await sendProgress({
      project_id: "proj3",
      chat_id: 111,
      thread_id: null,
      message_id: 200,
      status: "완료",
      phase: "done",
      session_id: sessionId,
    });

    expect(isSessionActive(sessionId)).toBe(false);
  });

  test("uses provided session_id when available", async () => {
    const sendProgress = createSendProgress(mockTg as any);

    const result = await sendProgress({
      project_id: "proj4",
      chat_id: 222,
      thread_id: 42,
      message_id: 300,
      status: "시작",
      phase: "thinking",
      session_id: "custom-session-id",
    });

    expect(result.session_id).toBe("custom-session-id");
    expect(isSessionActive("custom-session-id")).toBe(true);
  });
});
