# cowork-telegram-bridge

Claude Cowork 프로젝트를 Telegram에서 원격 조작할 수 있는 커스텀 MCP 서버.

## 설치

```
bun install
cp .env.example .env
# .env에 TELEGRAM_BOT_TOKEN 입력
```

## 설정

config/chats.json에 프로젝트-채팅 매핑을 추가하세요.

## 실행

```
bun run src/server.ts
```

## 테스트

```
bun test
```

## Claude Desktop 등록

~/Library/Application Support/Claude/claude_desktop_config.json:

```json
{
  "mcpServers": {
    "telegram-cowork": {
      "command": "bun",
      "args": ["run", "/절대경로/cowork-telegram-bridge/src/server.ts"]
    }
  }
}
```
