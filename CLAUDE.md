# cowork-telegram-bridge

Cowork 프로젝트와 Telegram을 연결하는 MCP 서버.

## 기술 스택
- Runtime: Bun >= 1.1.0
- MCP: @modelcontextprotocol/sdk
- DB: bun:sqlite (내장)
- Telegram: Bot API long polling

## 주요 명령
bun run src/server.ts         # MCP 서버 실행
bun test                      # 전체 테스트

## 아키텍처 원칙
- Background Poller가 SQLite에 메시지 캐싱
- Cowork는 SQLite에서만 읽음 (Telegram API 직접 호출 없음)
- 모든 Telegram 발송은 rate_limiter 경유 예정
- chats.json 수정은 서버 재시작 없이 반영됨 (fs.watch)

## 주의사항
- .env, data/, logs/ 는 절대 커밋 금지
- mark_handled 는 모든 처리 흐름의 마지막에 반드시 호출
- allowed_sender_ids 미설정 시 보안 경고 로그 출력
