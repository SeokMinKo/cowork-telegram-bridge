#!/usr/bin/env bun
import { Server }               from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { initDb, getDb }    from "./store/db";
import { loadConfig }        from "./config/loader";
import { initClient, sendText, editMessage } from "./telegram/client";
import { startPoller, stopPoller } from "./telegram/poller";
import { getMessages }       from "./tools/get_messages";
import { sendMessage }       from "./tools/send_message";
import { sendFile }          from "./tools/send_file";
import { markHandledTool }   from "./tools/mark_handled";
import { listProjects }      from "./tools/list_projects";
import { getBotStatus }      from "./tools/get_bot_status";
import { runAlert }          from "./tools/run_alert";
import { createSendProgress } from "./tools/send_progress";
import { createConversationTopic } from "./tools/create_conversation_topic";
import { closeConversationTopic }  from "./tools/close_conversation_topic";
import { getConversationTopic }    from "./tools/get_conversation_topic";
import { listConversationTopics }  from "./tools/list_conversation_topics";
import { initSessionMap }    from "./store/session_map";
import { createProgressServer } from "./http/progress_server";
import { MessageTracker }    from "./http/message_tracker";

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? "30000", 10);
const PROGRESS_PORT    = parseInt(process.env.PROGRESS_PORT ?? "18080", 10);
const HOOK_SECRET      = process.env.HOOK_SECRET ?? "cowork-bridge-secret";
const MCP_TRANSPORT    = process.env.MCP_TRANSPORT ?? "stdio";
const MCP_PORT         = parseInt(process.env.MCP_PORT ?? "18081", 10);

const tgAdapter = { sendText, editMessage };
const tracker   = new MessageTracker();
let sendProgressFn: ReturnType<typeof createSendProgress>;

const TOOLS = [
  { name: "get_messages",   description: "미처리 Telegram 메시지 조회",           inputSchema: { type: "object" as const, properties: { project_id: { type: "string" }, limit: { type: "number" }, since_min: { type: "number" } } } },
  { name: "send_message",   description: "Telegram 텍스트 전송 (4096자 자동분할)", inputSchema: { type: "object" as const, required: ["chat_id","text"], properties: { chat_id: { type: "number" }, text: { type: "string" }, thread_id: { type: "number" }, reply_to: { type: "number" } } } },
  { name: "send_file",      description: "로컬 파일 Telegram 전송 (최대 50MB)",   inputSchema: { type: "object" as const, required: ["chat_id","file_path"], properties: { chat_id: { type: "number" }, file_path: { type: "string" }, caption: { type: "string" }, thread_id: { type: "number" } } } },
  { name: "mark_handled",   description: "메시지 처리 완료 기록 (필수 호출)",      inputSchema: { type: "object" as const, required: ["message_id","chat_id"], properties: { message_id: { type: "number" }, chat_id: { type: "number" }, project_id: { type: "string" }, result: { type: "string" } } } },
  { name: "list_projects",  description: "등록된 프로젝트 목록 조회",              inputSchema: { type: "object" as const, properties: {} } },
  { name: "get_bot_status", description: "봇 상태 및 운영 지표 조회",              inputSchema: { type: "object" as const, properties: {} } },
  { name: "run_alert",      description: "프로젝트 채팅으로 알림 전송",            inputSchema: { type: "object" as const, required: ["project_id","title","body"], properties: { project_id: { type: "string" }, title: { type: "string" }, body: { type: "string" }, level: { type: "string", enum: ["info","success","warning","error"] }, file_path: { type: "string" } } } },
  { name: "send_progress",  description: "작업 진행 상황을 Telegram에 실시간 전송 (세션 등록 + 활성화)", inputSchema: { type: "object" as const, required: ["project_id","chat_id","message_id","status","phase"], properties: { project_id: { type: "string" }, chat_id: { type: "number" }, thread_id: { type: "number" }, message_id: { type: "number" }, status: { type: "string" }, phase: { type: "string", enum: ["thinking","tool","done"] }, session_id: { type: "string" } } } },
  { name: "create_conversation_topic", description: "대화에 대한 Telegram 토픽 생성 (topic_sync 프로젝트 전용, 멱등)", inputSchema: { type: "object" as const, required: ["project_id","conversation_id","topic_name"], properties: { project_id: { type: "string" }, conversation_id: { type: "string" }, topic_name: { type: "string", description: "1~128자" }, icon_color: { type: "number" } } } },
  { name: "close_conversation_topic", description: "대화 토픽 닫기 (라이프사이클 동기화)", inputSchema: { type: "object" as const, required: ["project_id","conversation_id"], properties: { project_id: { type: "string" }, conversation_id: { type: "string" } } } },
  { name: "get_conversation_topic", description: "대화의 Telegram 토픽 정보 조회", inputSchema: { type: "object" as const, required: ["project_id","conversation_id"], properties: { project_id: { type: "string" }, conversation_id: { type: "string" } } } },
  { name: "list_conversation_topics", description: "프로젝트의 모든 대화 토픽 목록 조회", inputSchema: { type: "object" as const, required: ["project_id"], properties: { project_id: { type: "string" }, status: { type: "string", enum: ["open","closed"] } } } },
];

function createMcpServer(): Server {
  const server = new Server(
    { name: "telegram-cowork", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    try {
      let result: unknown;
      switch (name) {
        case "get_messages":   result = await getMessages(args as any);       break;
        case "send_message":   result = await sendMessage(args as any);       break;
        case "send_file":      result = await sendFile(args as any);          break;
        case "mark_handled":   result = await markHandledTool(args as any);   break;
        case "list_projects":  result = await listProjects();                 break;
        case "get_bot_status": result = await getBotStatus();                 break;
        case "run_alert":      result = await runAlert(args as any);          break;
        case "send_progress":  result = await sendProgressFn(args as any);    break;
        case "create_conversation_topic": result = await createConversationTopic(args as any); break;
        case "close_conversation_topic":  result = await closeConversationTopic(args as any);  break;
        case "get_conversation_topic":    result = await getConversationTopic(args as any);    break;
        case "list_conversation_topics":  result = await listConversationTopics(args as any);  break;
        default: return { content: [{ type: "text" as const, text: `알 수 없는 도구: ${name}` }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `오류: ${String(err)}` }], isError: true };
    }
  });

  return server;
}

function bootstrap() {
  const db = initDb();
  initSessionMap(db);
  loadConfig();
  initClient();
  startPoller(POLL_INTERVAL_MS);

  sendProgressFn = createSendProgress(tgAdapter);

  const progressServer = createProgressServer({
    port: PROGRESS_PORT,
    hookSecret: HOOK_SECRET,
    tracker,
    tg: tgAdapter,
  });

  console.error(`[cowork-telegram-bridge] 서버 시작 (폴링: ${POLL_INTERVAL_MS/1000}초, progress: :${progressServer.port})`);
}

async function startHttpTransport() {
  const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

  Bun.serve({
    port: MCP_PORT,
    async fetch(req: Request) {
      const url = new URL(req.url);

      if (url.pathname === "/health") {
        return Response.json({ status: "ok", transport: "http", time: new Date().toISOString() });
      }

      if (url.pathname !== "/mcp") {
        return new Response("Not Found", { status: 404 });
      }

      const sessionId = req.headers.get("mcp-session-id");

      if (sessionId && transports.has(sessionId)) {
        return transports.get(sessionId)!.handleRequest(req);
      }

      if (req.method === "POST") {
        const body = await req.json();
        if (!sessionId && body?.method === "initialize") {
          const transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (sid: string) => {
              console.error(`[mcp-http] 세션 시작: ${sid}`);
              transports.set(sid, transport);
            },
          });
          transport.onclose = () => {
            if (transport.sessionId) {
              console.error(`[mcp-http] 세션 종료: ${transport.sessionId}`);
              transports.delete(transport.sessionId);
            }
          };
          const server = createMcpServer();
          await server.connect(transport);
          return transport.handleRequest(req, { parsedBody: body });
        }
      }

      return Response.json(
        { jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" }, id: null },
        { status: 400 }
      );
    },
  });

  console.error(`[cowork-telegram-bridge] MCP HTTP transport: http://localhost:${MCP_PORT}/mcp`);
}

async function main() {
  bootstrap();

  if (MCP_TRANSPORT === "http") {
    await startHttpTransport();
  } else {
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }

  process.on("SIGINT",  () => { stopPoller(); process.exit(0); });
  process.on("SIGTERM", () => { stopPoller(); process.exit(0); });
}

main().catch(err => { console.error("[cowork-telegram-bridge] 치명적 오류:", err); process.exit(1); });
