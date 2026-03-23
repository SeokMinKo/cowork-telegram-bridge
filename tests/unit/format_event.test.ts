import { describe, test, expect } from "bun:test";
import { formatToolEvent, formatCompleteEvent, formatStartEvent } from "../../src/hooks/format_event";

describe("format_event", () => {
  describe("formatStartEvent", () => {
    test("formats start message", () => {
      const result = formatStartEvent("my-project");
      expect(result).toContain("작업 시작");
      expect(result).toContain("my-project");
    });
  });

  describe("formatToolEvent", () => {
    test("formats Read tool", () => {
      const result = formatToolEvent({
        tool_name: "Read",
        tool_input: { file_path: "/Users/me/project/src/index.ts" },
      });
      expect(result).toContain("📖");
      expect(result).toContain("index.ts");
    });

    test("formats Bash tool with safe command", () => {
      const result = formatToolEvent({
        tool_name: "Bash",
        tool_input: { command: "bun test --reporter=json" },
      });
      expect(result).toContain("💻");
      expect(result).toContain("bun test");
    });

    test("formats Bash tool with dangerous command as hidden", () => {
      const result = formatToolEvent({
        tool_name: "Bash",
        tool_input: { command: "cat .env" },
      });
      expect(result).toContain("[보안상 내용이 숨겨졌습니다]");
    });

    test("formats Write tool", () => {
      const result = formatToolEvent({
        tool_name: "Write",
        tool_input: { file_path: "/Users/me/src/new-file.ts" },
      });
      expect(result).toContain("✏️");
      expect(result).toContain("new-file.ts");
    });

    test("formats Edit tool", () => {
      const result = formatToolEvent({
        tool_name: "Edit",
        tool_input: { file_path: "/Users/me/src/old.ts" },
      });
      expect(result).toContain("✏️");
      expect(result).toContain("old.ts");
    });

    test("formats Grep tool", () => {
      const result = formatToolEvent({
        tool_name: "Grep",
        tool_input: { pattern: "TODO" },
      });
      expect(result).toContain("🔍");
      expect(result).toContain("TODO");
    });

    test("formats Glob tool", () => {
      const result = formatToolEvent({
        tool_name: "Glob",
        tool_input: { pattern: "**/*.ts" },
      });
      expect(result).toContain("🔍");
      expect(result).toContain("**/*.ts");
    });

    test("formats Agent tool", () => {
      const result = formatToolEvent({
        tool_name: "Agent",
        tool_input: { description: "search for config" },
      });
      expect(result).toContain("🤖");
      expect(result).toContain("search for config");
    });

    test("formats unknown tool with generic icon", () => {
      const result = formatToolEvent({
        tool_name: "SomeTool",
        tool_input: {},
      });
      expect(result).toContain("🔧");
      expect(result).toContain("SomeTool");
    });

    test("does not expose file contents from Read", () => {
      const result = formatToolEvent({
        tool_name: "Read",
        tool_input: { file_path: "/secret/file.ts", content: "SECRET_DATA_HERE" },
      });
      expect(result).not.toContain("SECRET_DATA_HERE");
    });
  });

  describe("formatCompleteEvent", () => {
    test("formats completion with duration", () => {
      const result = formatCompleteEvent({
        project_id: "mutp",
        tool_log: ["📖 index.ts", "💻 bun test"],
        duration_sec: 28,
        thinking_summary: null,
      });
      expect(result).toContain("✅");
      expect(result).toContain("mutp");
      expect(result).toContain("28초");
      expect(result).toContain("📖 index.ts");
      expect(result).toContain("💻 bun test");
    });

    test("formats completion with thinking summary", () => {
      const result = formatCompleteEvent({
        project_id: "proj",
        tool_log: [],
        duration_sec: 5,
        thinking_summary: "파일을 먼저 읽어서 최신 테스트 결과를 확인한 뒤...",
      });
      expect(result).toContain("💭");
      expect(result).toContain("파일을 먼저 읽어서");
    });

    test("formats completion without tools", () => {
      const result = formatCompleteEvent({
        project_id: "proj",
        tool_log: [],
        duration_sec: 2,
        thinking_summary: null,
      });
      expect(result).toContain("✅");
      expect(result).toContain("2초");
    });
  });
});
