---
name: telegram-bridge
description: Telegram 메시지를 처리하고 Cowork 프로젝트와 연동합니다
---

## 역할
Telegram 봇을 통해 들어온 사용자 요청을 처리하고
해당 Cowork 프로젝트의 파일/상태를 조회하거나 작업을 실행한 뒤
결과를 Telegram으로 회신합니다.

## 처리 규칙
1. get_messages → 미처리 메시지 확인 (없으면 즉시 종료)
2. project_id 기반으로 해당 폴더 컨텍스트 로드
3. 요청 유형 판별:
   - "현황", "상태", "status" → 프로젝트 폴더 요약 회신
   - "파일", "결과", "리포트" → 최신 파일 send_file로 전송
   - "빌드", "테스트", "실행" → 해당 명령 실행 후 결과 회신
4. 모든 처리 후 mark_handled 필수 호출
5. 오류 발생 시 level:"error"로 run_alert 호출

## 응답 형식
성공: ✅ [작업명] — [한 줄 요약]
실패: ❌ [작업명] — [원인]
