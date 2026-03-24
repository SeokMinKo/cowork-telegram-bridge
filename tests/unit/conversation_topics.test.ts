import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

// We need to initialize the DB before importing the store module.
// The store uses getDb(), so we mock initDb by setting up the full schema.
import { initDb, closeDb } from "../../src/store/db";

import {
  insertConversationTopic,
  getTopicByConversation,
  getTopicByThread,
  listTopicsByProject,
  updateTopicStatus,
} from "../../src/store/conversation_topics";

describe("conversation_topics", () => {
  beforeEach(() => {
    process.env.DB_PATH = ":memory:";
    initDb();
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  test("insertConversationTopic and getTopicByConversation", () => {
    insertConversationTopic({
      conversation_id: "conv-1",
      project_id: "proj-a",
      chat_id: -100123,
      thread_id: 42,
      topic_name: "테스트 토픽",
    });

    const topic = getTopicByConversation("conv-1", "proj-a");
    expect(topic).not.toBeNull();
    expect(topic!.conversation_id).toBe("conv-1");
    expect(topic!.project_id).toBe("proj-a");
    expect(topic!.chat_id).toBe(-100123);
    expect(topic!.thread_id).toBe(42);
    expect(topic!.topic_name).toBe("테스트 토픽");
    expect(topic!.status).toBe("open");
    expect(topic!.closed_at).toBeNull();
  });

  test("getTopicByConversation returns null for nonexistent", () => {
    const topic = getTopicByConversation("nonexistent", "proj-a");
    expect(topic).toBeNull();
  });

  test("INSERT OR IGNORE on duplicate (conversation_id, project_id)", () => {
    insertConversationTopic({
      conversation_id: "conv-dup",
      project_id: "proj-a",
      chat_id: -100123,
      thread_id: 42,
      topic_name: "첫 번째",
    });
    // Same conversation_id + project_id — should be ignored
    insertConversationTopic({
      conversation_id: "conv-dup",
      project_id: "proj-a",
      chat_id: -100999,
      thread_id: 99,
      topic_name: "두 번째",
    });

    const topic = getTopicByConversation("conv-dup", "proj-a");
    expect(topic!.thread_id).toBe(42); // Still first insert
    expect(topic!.topic_name).toBe("첫 번째");
  });

  test("same conversation_id with different project_id is allowed", () => {
    insertConversationTopic({
      conversation_id: "conv-shared",
      project_id: "proj-a",
      chat_id: -100123,
      thread_id: 42,
      topic_name: "프로젝트 A",
    });
    insertConversationTopic({
      conversation_id: "conv-shared",
      project_id: "proj-b",
      chat_id: -100456,
      thread_id: 55,
      topic_name: "프로젝트 B",
    });

    const a = getTopicByConversation("conv-shared", "proj-a");
    const b = getTopicByConversation("conv-shared", "proj-b");
    expect(a!.thread_id).toBe(42);
    expect(b!.thread_id).toBe(55);
  });

  test("getTopicByThread reverse lookup", () => {
    insertConversationTopic({
      conversation_id: "conv-1",
      project_id: "proj-a",
      chat_id: -100123,
      thread_id: 42,
      topic_name: "토픽",
    });

    const topic = getTopicByThread(-100123, 42);
    expect(topic).not.toBeNull();
    expect(topic!.conversation_id).toBe("conv-1");
  });

  test("getTopicByThread returns null for closed topics", () => {
    insertConversationTopic({
      conversation_id: "conv-closed",
      project_id: "proj-a",
      chat_id: -100123,
      thread_id: 77,
      topic_name: "닫힌 토픽",
    });
    updateTopicStatus("conv-closed", "proj-a", "closed", "2025-01-01T00:00:00Z");

    const topic = getTopicByThread(-100123, 77);
    expect(topic).toBeNull();
  });

  test("getTopicByThread returns null for nonexistent", () => {
    const topic = getTopicByThread(-999, 999);
    expect(topic).toBeNull();
  });

  test("listTopicsByProject returns all topics", () => {
    insertConversationTopic({ conversation_id: "c1", project_id: "proj-a", chat_id: -100, thread_id: 1, topic_name: "t1" });
    insertConversationTopic({ conversation_id: "c2", project_id: "proj-a", chat_id: -100, thread_id: 2, topic_name: "t2" });
    insertConversationTopic({ conversation_id: "c3", project_id: "proj-b", chat_id: -200, thread_id: 3, topic_name: "t3" });

    const all = listTopicsByProject("proj-a");
    expect(all.length).toBe(2);
  });

  test("listTopicsByProject with status filter", () => {
    insertConversationTopic({ conversation_id: "c1", project_id: "proj-a", chat_id: -100, thread_id: 1, topic_name: "t1" });
    insertConversationTopic({ conversation_id: "c2", project_id: "proj-a", chat_id: -100, thread_id: 2, topic_name: "t2" });
    updateTopicStatus("c1", "proj-a", "closed", "2025-01-01T00:00:00Z");

    const open = listTopicsByProject("proj-a", "open");
    expect(open.length).toBe(1);
    expect(open[0].conversation_id).toBe("c2");

    const closed = listTopicsByProject("proj-a", "closed");
    expect(closed.length).toBe(1);
    expect(closed[0].conversation_id).toBe("c1");
  });

  test("updateTopicStatus open → closed", () => {
    insertConversationTopic({ conversation_id: "c1", project_id: "proj-a", chat_id: -100, thread_id: 1, topic_name: "t1" });
    updateTopicStatus("c1", "proj-a", "closed", "2025-06-15T12:00:00Z");

    const topic = getTopicByConversation("c1", "proj-a");
    expect(topic!.status).toBe("closed");
    expect(topic!.closed_at).toBe("2025-06-15T12:00:00Z");
  });

  test("updateTopicStatus closed → open (reopen)", () => {
    insertConversationTopic({ conversation_id: "c1", project_id: "proj-a", chat_id: -100, thread_id: 1, topic_name: "t1" });
    updateTopicStatus("c1", "proj-a", "closed", "2025-06-15T12:00:00Z");
    updateTopicStatus("c1", "proj-a", "open", null);

    const topic = getTopicByConversation("c1", "proj-a");
    expect(topic!.status).toBe("open");
    expect(topic!.closed_at).toBeNull();
  });
});
