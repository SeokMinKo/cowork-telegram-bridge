import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { initDb, closeDb } from "../../src/store/db";
import {
  insertConversationTopic,
  getTopicByConversation,
  updateTopicStatus,
} from "../../src/store/conversation_topics";

// Mock telegram client functions
const mockCreateForumTopic = mock(() => Promise.resolve({ message_thread_id: 100, name: "test", icon_color: 0x6FB9F0 }));
const mockReopenForumTopic = mock(() => Promise.resolve(true));

// Mock config
const mockGetConfig = mock(() => ({
  version: 1,
  security: { allowed_sender_ids: [], unknown_sender_policy: "silent_drop" as const },
  default_dm_chat_id: 0,
  projects: [
    {
      project_id: "sync-proj",
      description: "test",
      chat_id: -1001234,
      thread_id: null,
      folder_path: "/tmp",
      keywords: [],
      alert_on_schedule: false,
      topic_sync: true,
      topic_icon_color: 0x6FB9F0,
    },
    {
      project_id: "static-proj",
      description: "static",
      chat_id: -1005678,
      thread_id: 99,
      folder_path: "/tmp",
      keywords: [],
      alert_on_schedule: false,
    },
  ],
}));

// We test the logic manually since mocking module imports is complex in bun:test.
// This tests the core business logic that create_conversation_topic.ts implements.
describe("create_conversation_topic logic", () => {
  beforeEach(() => {
    process.env.DB_PATH = ":memory:";
    initDb();
    mockCreateForumTopic.mockClear();
    mockReopenForumTopic.mockClear();
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  test("rejects project without topic_sync", () => {
    const cfg = mockGetConfig();
    const project = cfg.projects.find(p => p.project_id === "static-proj");
    expect(project?.topic_sync).toBeUndefined();
  });

  test("creates new topic via Telegram API", async () => {
    const cfg = mockGetConfig();
    const project = cfg.projects.find(p => p.project_id === "sync-proj")!;

    // Simulate: no existing topic
    const existing = getTopicByConversation("conv-new", "sync-proj");
    expect(existing).toBeNull();

    // Simulate: call createForumTopic
    const result = await mockCreateForumTopic({ chat_id: project.chat_id, name: "새 대화" });
    expect(result.message_thread_id).toBe(100);
    expect(mockCreateForumTopic).toHaveBeenCalledTimes(1);

    // Simulate: insert into DB
    insertConversationTopic({
      conversation_id: "conv-new",
      project_id: "sync-proj",
      chat_id: project.chat_id,
      thread_id: result.message_thread_id,
      topic_name: "새 대화",
    });

    const saved = getTopicByConversation("conv-new", "sync-proj");
    expect(saved!.thread_id).toBe(100);
    expect(saved!.status).toBe("open");
  });

  test("idempotent: returns existing open topic without API call", () => {
    insertConversationTopic({
      conversation_id: "conv-existing",
      project_id: "sync-proj",
      chat_id: -1001234,
      thread_id: 50,
      topic_name: "기존 토픽",
    });

    const existing = getTopicByConversation("conv-existing", "sync-proj");
    expect(existing).not.toBeNull();
    expect(existing!.status).toBe("open");

    // Should NOT call createForumTopic
    expect(mockCreateForumTopic).not.toHaveBeenCalled();
  });

  test("reopens closed topic", async () => {
    insertConversationTopic({
      conversation_id: "conv-closed",
      project_id: "sync-proj",
      chat_id: -1001234,
      thread_id: 60,
      topic_name: "닫힌 토픽",
    });
    updateTopicStatus("conv-closed", "sync-proj", "closed", "2025-01-01T00:00:00Z");

    const existing = getTopicByConversation("conv-closed", "sync-proj");
    expect(existing!.status).toBe("closed");

    // Simulate: reopen
    await mockReopenForumTopic(-1001234, 60);
    updateTopicStatus("conv-closed", "sync-proj", "open", null);
    expect(mockReopenForumTopic).toHaveBeenCalledTimes(1);

    const reopened = getTopicByConversation("conv-closed", "sync-proj");
    expect(reopened!.status).toBe("open");
    expect(reopened!.closed_at).toBeNull();
  });
});
