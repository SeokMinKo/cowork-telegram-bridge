import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

// We need to set up an in-memory DB before importing session_map
// So we mock the db module
let db: Database;

import {
  initSessionMap,
  registerSession,
  activateSession,
  getSession,
  isSessionActive,
  deactivateSession,
  cleanExpiredSessions,
} from "../../src/store/session_map";

describe("session_map", () => {
  beforeEach(() => {
    db = new Database(":memory:");
    initSessionMap(db);
  });

  afterEach(() => {
    db.close();
  });

  test("registerSession creates inactive session", () => {
    registerSession({
      session_id: "sess-1",
      chat_id: 12345,
      thread_id: null,
      project_id: "my-project",
    });
    const session = getSession("sess-1");
    expect(session).not.toBeNull();
    expect(session!.is_active).toBe(false);
    expect(session!.tg_message_id).toBeNull();
    expect(session!.chat_id).toBe(12345);
    expect(session!.project_id).toBe("my-project");
  });

  test("activateSession sets is_active and tg_message_id", () => {
    registerSession({
      session_id: "sess-2",
      chat_id: 12345,
      thread_id: null,
      project_id: "proj",
    });
    activateSession("sess-2", 999);
    const session = getSession("sess-2");
    expect(session!.is_active).toBe(true);
    expect(session!.tg_message_id).toBe(999);
  });

  test("isSessionActive returns false for unregistered session", () => {
    expect(isSessionActive("nonexistent")).toBe(false);
  });

  test("isSessionActive returns false for inactive session", () => {
    registerSession({
      session_id: "sess-3",
      chat_id: 12345,
      thread_id: null,
      project_id: "proj",
    });
    expect(isSessionActive("sess-3")).toBe(false);
  });

  test("isSessionActive returns true for active session", () => {
    registerSession({
      session_id: "sess-4",
      chat_id: 12345,
      thread_id: null,
      project_id: "proj",
    });
    activateSession("sess-4", 100);
    expect(isSessionActive("sess-4")).toBe(true);
  });

  test("deactivateSession sets is_active to false", () => {
    registerSession({
      session_id: "sess-5",
      chat_id: 12345,
      thread_id: null,
      project_id: "proj",
    });
    activateSession("sess-5", 100);
    expect(isSessionActive("sess-5")).toBe(true);
    deactivateSession("sess-5");
    expect(isSessionActive("sess-5")).toBe(false);
  });

  test("registerSession with thread_id", () => {
    registerSession({
      session_id: "sess-6",
      chat_id: 12345,
      thread_id: 42,
      project_id: "proj",
    });
    const session = getSession("sess-6");
    expect(session!.thread_id).toBe(42);
  });

  test("cleanExpiredSessions removes old sessions", () => {
    registerSession({
      session_id: "sess-old",
      chat_id: 12345,
      thread_id: null,
      project_id: "proj",
    });
    // Manually set expires_at to past
    db.run(
      "UPDATE session_map SET expires_at = datetime('now', '-1 hour') WHERE session_id = ?",
      ["sess-old"]
    );
    cleanExpiredSessions();
    expect(getSession("sess-old")).toBeNull();
  });

  test("duplicate registerSession updates existing", () => {
    registerSession({
      session_id: "sess-dup",
      chat_id: 111,
      thread_id: null,
      project_id: "proj1",
    });
    registerSession({
      session_id: "sess-dup",
      chat_id: 222,
      thread_id: 5,
      project_id: "proj2",
    });
    const session = getSession("sess-dup");
    expect(session!.chat_id).toBe(222);
    expect(session!.project_id).toBe("proj2");
  });
});
