import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSessionMap, registerSession, activateSession, getSession } from "../../src/store/session_map";
import { createProgressServer } from "../../src/http/progress_server";
import { MessageTracker } from "../../src/http/message_tracker";

describe("progress_server", () => {
  let db: Database;
  let tracker: MessageTracker;
  let server: ReturnType<typeof createProgressServer>;
  let baseUrl: string;

  // Mock Telegram calls
  const sentMessages: any[] = [];
  const editedMessages: any[] = [];

  const mockTg = {
    sendText: async (opts: any) => {
      const msg = { message_id: sentMessages.length + 1000 };
      sentMessages.push({ ...opts, result: msg });
      return msg;
    },
    editMessage: async (opts: any) => {
      editedMessages.push(opts);
      return { message_id: opts.message_id };
    },
  };

  beforeEach(() => {
    db = new Database(":memory:");
    initSessionMap(db);
    tracker = new MessageTracker();
    sentMessages.length = 0;
    editedMessages.length = 0;

    server = createProgressServer({
      port: 0, // random port
      hookSecret: "test-secret",
      tracker,
      tg: mockTg as any,
    });
    baseUrl = `http://localhost:${server.port}`;
  });

  afterEach(() => {
    server.stop();
    db.close();
  });

  test("rejects request without valid hook secret", async () => {
    const res = await fetch(`${baseUrl}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "s1", event_type: "PostToolUse" }),
    });
    expect(res.status).toBe(401);
  });

  test("rejects request with wrong hook secret", async () => {
    const res = await fetch(`${baseUrl}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hook-Secret": "wrong" },
      body: JSON.stringify({ session_id: "s1", event_type: "PostToolUse" }),
    });
    expect(res.status).toBe(401);
  });

  test("ignores events for inactive sessions", async () => {
    registerSession({ session_id: "s-inactive", chat_id: 123, thread_id: null, project_id: "proj" });
    // session is registered but NOT activated

    const res = await fetch(`${baseUrl}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hook-Secret": "test-secret" },
      body: JSON.stringify({
        session_id: "s-inactive",
        event_type: "PostToolUse",
        tool_name: "Read",
        tool_input: { file_path: "/test.ts" },
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.skipped).toBe(true);
    expect(editedMessages.length).toBe(0);
  });

  test("processes PostToolUse for active session", async () => {
    registerSession({ session_id: "s-active", chat_id: 456, thread_id: null, project_id: "proj" });
    activateSession("s-active", 9999);

    const res = await fetch(`${baseUrl}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hook-Secret": "test-secret" },
      body: JSON.stringify({
        session_id: "s-active",
        event_type: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "bun test" },
      }),
    });
    expect(res.status).toBe(200);

    // Wait for debounced edit
    await Bun.sleep(200);

    expect(tracker.getToolLog("s-active").length).toBe(1);
    expect(tracker.getToolLog("s-active")[0]).toContain("bun test");
  });

  test("processes Stop event for active session", async () => {
    registerSession({ session_id: "s-stop", chat_id: 789, thread_id: null, project_id: "myproj" });
    activateSession("s-stop", 8888);
    tracker.addToolLog("s-stop", "📖 file.ts");

    const res = await fetch(`${baseUrl}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hook-Secret": "test-secret" },
      body: JSON.stringify({
        session_id: "s-stop",
        duration_sec: 15,
        thinking_summary: "분석 완료",
      }),
    });
    expect(res.status).toBe(200);

    // Wait for async processing
    await Bun.sleep(100);

    // Should have sent a new final message
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].text).toContain("myproj");
    expect(sentMessages[0].text).toContain("15초");
    expect(sentMessages[0].text).toContain("📖 file.ts");
  });

  test("health endpoint returns ok", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.status).toBe("ok");
  });
});
