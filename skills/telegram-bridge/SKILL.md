---
name: telegram-bridge
description: >
  Telegram 봇을 통해 들어온 메시지를 처리하고 Cowork 프로젝트와 연동합니다.
  Use when the user asks to "텔레그램 메시지 확인", "텔레그램 처리",
  "check telegram", "process telegram messages", or needs to send files
  or progress updates to Telegram chats.
metadata:
  version: "0.1.0"
---

## 역할
Telegram 봇을 통해 들어온 사용자 요청을 처리하고
해당 Cowork 프로젝트의 파일/상태를 조회하거나 작업을 실행한 뒤
결과를 Telegram으로 회신합니다.

## 진행 상황 전송 규칙 (필수)
메시지를 처리할 때 반드시 아래 순서로 send_progress를 호출하세요:

1. **작업 시작 시**: `send_progress(project_id, chat_id, message_id, "시작", "thinking")`
   - 반드시 가장 먼저 호출 — 이 호출이 세션을 활성화합니다
   - 반환된 session_id를 이후 호출에서 사용하세요
2. **주요 도구 호출 전** (선택): `send_progress(..., "파일 분석 중", "tool", session_id)`
3. **완료 시**: `send_progress(..., "완료", "done", session_id)`

⚠️ 메시지가 없어서 즉시 종료하는 경우 send_progress를 호출하지 마세요.
   이렇게 하면 "작업 시작 → 완료 (0초)" 노이즈가 방지됩니다.

## 처리 규칙
1. get_messages → 미처리 메시지 확인 (없으면 즉시 종료, send_progress 미호출)
2. 메시지가 있으면 → send_progress("시작", "thinking") 호출
3. project_id 기반으로 해당 폴더 컨텍스트 로드
4. 요청 유형 판별:
   - "현황", "상태", "status" → 프로젝트 폴더 요약 회신
   - "파일", "결과", "리포트" → 최신 파일 send_file로 전송
   - "빌드", "테스트", "실행" → 해당 명령 실행 후 결과 회신
5. 모든 처리 후 mark_handled 필수 호출
6. send_progress("완료", "done") 호출
7. 오류 발생 시 level:"error"로 run_alert 호출

## 응답 형식
성공: ✅ [작업명] — [한 줄 요약]
실패: ❌ [작업명] — [원인]
