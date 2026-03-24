# cowork-telegram-bridge

Claude Cowork 프로젝트와 Telegram을 양방향으로 연결하는 MCP 서버.
Telegram에서 메시지를 보내면 Cowork가 읽고, Cowork의 응답이 Telegram으로 전송됩니다.

## 주요 기능

- **양방향 메시지 브릿지** — Telegram ↔ Cowork 실시간 메시지 전달
- **프로젝트 단위 라우팅** — 여러 프로젝트를 각각 다른 Telegram 채팅/토픽에 매핑
- **대화-토픽 동기화** — Cowork 대화마다 Telegram Forum 토픽 자동 생성/관리
- **실시간 진행 표시** — Claude의 추론 과정을 Telegram에 실시간 전송
- **파일 전송** — 이미지, 문서 등 최대 50MB 파일 송수신
- **알림 시스템** — info/success/warning/error 레벨별 알림 전송
- **핫 리로드** — `chats.json` 수정 시 서버 재시작 없이 반영

## 아키텍처

```
┌─────────────────┐     long polling      ┌──────────────┐
│  Telegram 사용자  │ ◄──────────────────► │  Bot API     │
└─────────────────┘                       └──────┬───────┘
                                                 │
                                          ┌──────▼───────┐
                                          │   Poller     │
                                          │  (30초 주기)  │
                                          └──────┬───────┘
                                                 │
                                          ┌──────▼───────┐
                                          │   SQLite DB  │
                                          │  (WAL 모드)   │
                                          └──────┬───────┘
                                                 │
                                          ┌──────▼───────┐
                                          │  MCP Server  │ ◄──► Claude Cowork
                                          │  (12개 도구)  │
                                          └──────────────┘
```

**핵심 원칙:** Cowork는 SQLite에서만 읽고, Telegram API를 직접 호출하지 않습니다.

## 빠른 시작

### 1. 설치

```bash
bun install
```

### 2. 환경 설정

```bash
cp .env.example .env
```

`.env` 파일 편집:

```env
# 필수: BotFather에서 발급받은 Telegram Bot Token
TELEGRAM_BOT_TOKEN=123456789:AAHfiqksKZ8...

# 선택 (기본값 사용 권장)
# POLL_INTERVAL_MS=30000        # 폴링 주기 (ms)
# DB_PATH=./data/bridge.db     # SQLite DB 경로
# PROGRESS_PORT=18080           # 진행 표시 HTTP 포트
# HOOK_SECRET=cowork-bridge-secret
# DEBUG=1                       # 디버그 로그 활성화
```

### 3. chats.json 설정

```bash
mkdir -p config
```

`config/chats.json` 파일 생성:

```json
{
  "version": 1,
  "security": {
    "allowed_sender_ids": [123456789],
    "unknown_sender_policy": "silent_drop"
  },
  "default_dm_chat_id": 0,
  "projects": [
    {
      "project_id": "my-project",
      "description": "내 프로젝트",
      "chat_id": -1001234567890,
      "thread_id": null,
      "folder_path": "/home/user/projects/my-project",
      "keywords": ["my-project"],
      "alert_on_schedule": false
    }
  ]
}
```

> **`allowed_sender_ids` 확인 방법:** Telegram에서 [@userinfobot](https://t.me/userinfobot)에게 메시지를 보내면 자신의 ID를 알 수 있습니다.

> **`chat_id` 확인 방법:** 봇을 그룹에 추가한 뒤, 그룹에서 아무 메시지를 보내고 `https://api.telegram.org/bot<TOKEN>/getUpdates`를 호출하면 `chat.id` 값을 확인할 수 있습니다.

### 4. Claude Desktop / Cowork에 등록

`claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Linux: `~/.config/claude/`):

```json
{
  "mcpServers": {
    "telegram-cowork": {
      "command": "bun",
      "args": ["run", "/절대경로/cowork-telegram-bridge/src/server.ts"],
      "env": {
        "TELEGRAM_BOT_TOKEN": "your-bot-token"
      }
    }
  }
}
```

### 5. 실행

```bash
bun run src/server.ts
```

## 설정 상세

### chats.json 프로젝트 필드

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `project_id` | string | O | 프로젝트 고유 식별자 |
| `description` | string | O | 프로젝트 설명 |
| `chat_id` | number | O | Telegram 채팅/그룹 ID |
| `thread_id` | number \| null | O | 정적 토픽 ID (null이면 그룹 전체) |
| `folder_path` | string | O | 프로젝트 로컬 경로 |
| `keywords` | string[] | O | 메시지 자동 매칭 키워드 |
| `alert_on_schedule` | boolean | O | 스케줄 알림 활성화 |
| `topic_sync` | boolean | - | `true`면 대화별 토픽 자동 생성 모드 |
| `topic_icon_color` | number | - | 자동 생성 토픽의 아이콘 색상 |

### 보안 설정

```json
{
  "security": {
    "allowed_sender_ids": [123456789, 987654321],
    "unknown_sender_policy": "silent_drop"
  }
}
```

- `allowed_sender_ids`: 허용된 Telegram 사용자 ID 목록. **비어있으면 모든 메시지가 무시됩니다.**
- `unknown_sender_policy`: `"silent_drop"` (무시) 또는 `"reply_reject"` (거부 응답)

### 메시지 라우팅 우선순위

수신 메시지의 프로젝트 매칭 순서:

1. **정적 매핑** — `(chat_id, thread_id)` 정확히 일치하는 프로젝트
2. **동적 토픽** — `conversation_topics` DB 테이블에서 `(chat_id, thread_id)` 조회
3. **topic_sync 폴백** — 해당 그룹의 `topic_sync: true` 프로젝트
4. **키워드 매칭** — 메시지 텍스트에 `keywords` 포함 여부
5. **미매칭** — `"unknown"` 프로젝트로 분류

## MCP 도구 (12개)

### 메시지

| 도구 | 설명 |
|------|------|
| `get_messages` | 미처리 Telegram 메시지 조회 (`project_id`, `limit`, `since_min`) |
| `send_message` | 텍스트 전송 — 4096자 초과 시 자동 분할 (`chat_id`, `text`, `thread_id?`, `reply_to?`) |
| `send_file` | 파일/이미지 전송 — 최대 50MB (`chat_id`, `file_path`, `caption?`, `thread_id?`) |
| `mark_handled` | 메시지 처리 완료 기록 — **모든 처리 흐름의 마지막에 필수 호출** |

### 프로젝트 관리

| 도구 | 설명 |
|------|------|
| `list_projects` | chats.json에 등록된 프로젝트 목록 |
| `get_bot_status` | 봇 연결 상태, 미처리 수, DB 크기, topic_sync 현황 |
| `run_alert` | 프로젝트 채팅으로 포맷팅된 알림 전송 (`level`: info/success/warning/error) |

### 실시간 진행

| 도구 | 설명 |
|------|------|
| `send_progress` | 추론 진행 상황 실시간 전송 (`phase`: thinking/tool/done) |

### 대화-토픽 동기화

| 도구 | 설명 |
|------|------|
| `create_conversation_topic` | Cowork 대화에 대한 Telegram 토픽 생성 (멱등 — 이미 있으면 기존 반환) |
| `close_conversation_topic` | 대화 종료 시 토픽 닫기 |
| `get_conversation_topic` | 대화의 토픽 정보 조회 |
| `list_conversation_topics` | 프로젝트의 모든 토픽 목록 (status 필터 가능) |

## 대화-토픽 동기화 가이드

Cowork 프로젝트 안의 각 대화(conversation)를 Telegram 그룹의 개별 토픽으로 자동 관리하는 기능입니다.

### 전제 조건

1. Telegram 그룹이 **슈퍼그룹**이어야 합니다
2. 그룹 설정에서 **Topics** 기능이 활성화되어 있어야 합니다
3. 봇이 그룹의 **관리자**이며 **Manage Topics** 권한이 있어야 합니다

### 설정 방법

`chats.json`에서 프로젝트에 `topic_sync: true`를 추가합니다:

```json
{
  "project_id": "ml-training",
  "description": "ML 훈련 프로젝트",
  "chat_id": -1001234567890,
  "thread_id": null,
  "folder_path": "/home/user/ml-training",
  "keywords": ["ml", "training"],
  "alert_on_schedule": true,
  "topic_sync": true,
  "topic_icon_color": 7322096
}
```

> **주의:** `topic_sync: true`일 때 `thread_id`는 반드시 `null`이어야 합니다.

### 사용 흐름

```
1. 새 대화 시작
   └─ create_conversation_topic 호출
      → Telegram 그룹에 토픽 자동 생성
      → thread_id 반환

2. 대화 진행
   └─ send_message(chat_id, text, thread_id=반환값) 으로 해당 토픽에 메시지 전송
   └─ get_messages로 수신 메시지 조회 시 conversation_id 자동 포함

3. 대화 종료
   └─ close_conversation_topic 호출
      → Telegram 토픽 닫힘
      → DB 상태 closed로 업데이트

4. 대화 재개 (선택)
   └─ create_conversation_topic 동일 conversation_id로 재호출
      → 닫힌 토픽 자동 reopen
```

### 도구 사용 예시

**토픽 생성:**
```json
{
  "project_id": "ml-training",
  "conversation_id": "conv-abc123",
  "topic_name": "GPU 클러스터 설정 논의"
}
```
→ 응답: `{ "thread_id": 42, "topic_name": "GPU 클러스터 설정 논의", "created": true, "reopened": false }`

**토픽으로 메시지 전송:**
```json
{
  "chat_id": -1001234567890,
  "text": "GPU 설정이 완료되었습니다.",
  "thread_id": 42
}
```

**토픽 닫기:**
```json
{
  "project_id": "ml-training",
  "conversation_id": "conv-abc123"
}
```
→ 응답: `{ "success": true, "closed_at": "2025-01-15T10:30:00.000Z" }`

**프로젝트 토픽 목록:**
```json
{
  "project_id": "ml-training",
  "status": "open"
}
```
→ 응답: `{ "topics": [...], "count": 3 }`

### 토픽 아이콘 색상

Telegram이 허용하는 색상 값:

| 색상 | 값 (decimal) | 값 (hex) |
|------|-------------|----------|
| 파랑 | 7322096 | 0x6FB9F0 |
| 노랑 | 16767358 | 0xFFD67E |
| 보라 | 13337307 | 0xCB86DB |
| 초록 | 9367192 | 0x8EEE98 |
| 분홍 | 16749490 | 0xFF93B2 |
| 빨강 | 16478047 | 0xFB6F5F |

## 디버그

`DEBUG=1` 환경변수를 설정하면 상세 로그가 stderr로 출력됩니다:

```bash
DEBUG=1 bun run src/server.ts
```

출력 예시:
```
[poller] 정적 매핑: chat=-1001234 thread=42 → my-project
[poller] 동적 토픽: chat=-1001234 thread=55 → ml-training (conv: conv-abc123)
[poller] topic_sync 폴백: chat=-1001234 thread=99 → ml-training
[topic-sync] 토픽 생성: ml-training/conv-new → thread:100
[topic-sync] 토픽 닫기: ml-training/conv-old → thread:50
```

`get_bot_status` 도구 응답에도 topic_sync 상태가 포함됩니다:
```json
{
  "bot_id": 123456789,
  "username": "my_bot",
  "pending_count": 2,
  "topic_sync_projects": [
    { "project_id": "ml-training", "open_topics": 3, "closed_topics": 7 }
  ]
}
```

## 테스트

```bash
bun test
```

## 기술 스택

- **Runtime:** Bun >= 1.1.0
- **MCP:** @modelcontextprotocol/sdk
- **DB:** bun:sqlite (WAL 모드, 내장)
- **Telegram:** Bot API long polling (외부 라이브러리 없음)

## 주의사항

- `.env`, `data/`, `logs/`는 절대 커밋하지 마세요
- `mark_handled`는 모든 메시지 처리 흐름의 마지막에 반드시 호출해야 합니다
- `allowed_sender_ids`가 비어있으면 모든 메시지가 무시됩니다
- `chats.json` 수정은 서버 재시작 없이 2초 내 자동 반영됩니다
