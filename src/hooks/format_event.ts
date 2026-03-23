import { sanitize, isDangerousCommand } from "./sanitizer";
import { basename } from "path";

export interface ToolEvent {
  tool_name: string;
  tool_input: Record<string, any>;
}

export interface CompleteEvent {
  project_id: string;
  tool_log: string[];
  duration_sec: number;
  thinking_summary: string | null;
}

const TOOL_ICONS: Record<string, string> = {
  Read: "📖",
  Write: "✏️",
  Edit: "✏️",
  Bash: "💻",
  Grep: "🔍",
  Glob: "🔍",
  Agent: "🤖",
};

function shortenPath(filePath: string): string {
  return basename(filePath);
}

export function formatStartEvent(projectId: string): string {
  return `🧠 ${projectId} 작업 시작`;
}

export function formatToolEvent(event: ToolEvent): string {
  const icon = TOOL_ICONS[event.tool_name] ?? "🔧";
  const input = event.tool_input;

  switch (event.tool_name) {
    case "Read":
      return `${icon} ${shortenPath(input.file_path ?? "unknown")}`;

    case "Write":
    case "Edit":
      return `${icon} ${shortenPath(input.file_path ?? "unknown")}`;

    case "Bash": {
      const cmd = input.command ?? "";
      if (isDangerousCommand(cmd)) {
        return `${icon} [보안상 내용이 숨겨졌습니다]`;
      }
      return `${icon} ${sanitize(cmd)}`;
    }

    case "Grep":
      return `${icon} 검색: ${sanitize(input.pattern ?? "")}`;

    case "Glob":
      return `${icon} ${sanitize(input.pattern ?? "")}`;

    case "Agent":
      return `${icon} ${sanitize(input.description ?? input.prompt ?? "서브에이전트")}`;

    default:
      return `${icon} ${event.tool_name}`;
  }
}

export function formatCompleteEvent(event: CompleteEvent): string {
  const lines: string[] = [];
  lines.push(`✅ ${event.project_id} 완료 (${event.duration_sec}초)`);

  for (const log of event.tool_log) {
    lines.push(`├ ${log}`);
  }

  if (event.thinking_summary) {
    lines.push(`💭 ${event.thinking_summary}`);
  }

  return lines.join("\n");
}
