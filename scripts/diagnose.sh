#!/usr/bin/env bash
set +e

# ─── Telegram Cowork Bridge 진단 스크립트 ───
# 코워크에서 telegram MCP 도구가 안 보일 때 실행하세요.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
info() { echo -e "  ${CYAN}ℹ${NC} $1"; }

CLAUDE_SUPPORT="$HOME/Library/Application Support/Claude"
CLAUDE_LOGS="$HOME/Library/Logs/Claude"
EXT_DIR="$CLAUDE_SUPPORT/Claude Extensions"
REGISTRY="$CLAUDE_SUPPORT/extensions-installations.json"
DESKTOP_CONFIG="$CLAUDE_SUPPORT/claude_desktop_config.json"
SESSION_DIR="$CLAUDE_SUPPORT/local-agent-mode-sessions"

echo "╔══════════════════════════════════════════════╗"
echo "║  Telegram Cowork Bridge 진단 v1.0            ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ─── 1. bun 런타임 ───
echo "1. 런타임"
if command -v bun >/dev/null 2>&1; then
  ok "bun $(bun --version) @ $(which bun)"
else
  fail "bun 미설치"
fi

# ─── 2. Claude Desktop 실행 여부 ───
echo ""
echo "2. Claude Desktop"
if pgrep -f "Claude.app" >/dev/null; then
  ok "Claude Desktop 실행 중"
else
  fail "Claude Desktop 실행 안 됨"
fi

# ─── 3. DXT 확장 (호스트) ───
echo ""
echo "3. DXT 확장 (호스트 macOS)"
for dir in "$EXT_DIR"/*/; do
  name=$(basename "$dir")
  if echo "$name" | grep -qi telegram; then
    echo -e "  ${CYAN}→${NC} $name"
    if [ -f "$dir/manifest.json" ]; then
      ok "manifest.json 존재"
      # compatibility 체크
      BAD_KEYS=$(python3 -c "
import json
with open('$dir/manifest.json') as f: m=json.load(f)
rt = m.get('compatibility',{}).get('runtimes',{})
bad = [k for k in rt if k not in ('node','python')]
print(' '.join(bad) if bad else '')
" 2>/dev/null)
      if [ -n "$BAD_KEYS" ]; then
        fail "compatibility.runtimes에 미지원 키: $BAD_KEYS (node/python만 지원!)"
      else
        ok "compatibility 유효"
      fi
      # command 체크
      CMD=$(python3 -c "
import json
with open('$dir/manifest.json') as f: m=json.load(f)
print(m.get('server',{}).get('mcp_config',{}).get('command','?'))
" 2>/dev/null)
      info "mcp_config.command = $CMD"
    else
      fail "manifest.json 없음"
    fi
    # node_modules
    if [ -d "$dir/node_modules" ]; then
      ok "node_modules 존재"
    else
      fail "node_modules 없음 — bun install 필요"
    fi
  fi
done

# ─── 4. extensions-installations.json 레지스트리 ───
echo ""
echo "4. 확장 레지스트리"
if [ -f "$REGISTRY" ]; then
  python3 -c "
import json
with open('$REGISTRY') as f: data=json.load(f)
found = False
for k, v in data.get('extensions',{}).items():
    if 'telegram' in k.lower():
        found = True
        m = v.get('manifest',{})
        c = m.get('compatibility',{})
        rt = c.get('runtimes',{})
        print(f'  ✓ 등록됨: {k} (v{v.get(\"version\")}, source={v.get(\"source\")})')
        if rt:
            bad = [x for x in rt if x not in ('node','python')]
            if bad:
                print(f'  ✗ 레지스트리 manifest에도 미지원 runtimes: {bad}')
            else:
                print(f'  ✓ 레지스트리 runtimes 정상')
        else:
            print(f'  ✓ runtimes 미지정 (정상)')
if not found:
    print('  ✗ telegram 관련 확장 미등록')
" 2>/dev/null
else
  fail "extensions-installations.json 없음"
fi

# ─── 5. claude_desktop_config.json ───
echo ""
echo "5. claude_desktop_config.json (로컬 MCP)"
if [ -f "$DESKTOP_CONFIG" ]; then
  if grep -q "telegram" "$DESKTOP_CONFIG" 2>/dev/null; then
    warn "telegram-cowork가 claude_desktop_config.json에 있음 (DXT와 중복될 수 있음)"
    python3 -c "
import json
with open('$DESKTOP_CONFIG') as f: cfg=json.load(f)
tg = cfg.get('mcpServers',{}).get('telegram-cowork',{})
cmd = tg.get('command','?')
token = tg.get('env',{}).get('TELEGRAM_BOT_TOKEN','')
print(f'    command: {cmd}')
print(f'    token: {\"설정됨\" if token and len(token)>10 else \"미설정!\"}')
" 2>/dev/null
  else
    ok "telegram-cowork 없음 (DXT 확장으로만 운영)"
  fi
else
  fail "claude_desktop_config.json 없음"
fi

# ─── 6. 코워크 플러그인 (VM 경로) ───
echo ""
echo "6. 코워크 플러그인 (remote_cowork_plugins)"
FOUND_PLUGIN=0
find "$SESSION_DIR" -path "*/remote_cowork_plugins/*/plugin.json" -o -path "*/remote_cowork_plugins/manifest.json" 2>/dev/null | while read pf; do
  if echo "$pf" | grep -q "manifest.json$"; then
    python3 -c "
import json
with open('$pf') as f: m=json.load(f)
for p in m.get('plugins',[]):
    if 'telegram' in p.get('name','').lower():
        pref = p.get('installationPreference', 'NOT SET')
        print(f'  → 플러그인: {p[\"name\"]} (id={p[\"id\"]})')
        if pref == 'available':
            print(f'    ✓ installationPreference = available')
        elif pref == 'NOT SET':
            print(f'    ✗ installationPreference 미설정! (available로 설정 필요)')
        else:
            print(f'    ⚠ installationPreference = {pref}')
" 2>/dev/null
  fi
done

# 코워크 플러그인 .mcp.json 체크
find "$SESSION_DIR" -path "*/remote_cowork_plugins/plugin_*/.mcp.json" 2>/dev/null | while read mcpf; do
  DIR=$(dirname "$mcpf")
  PLUGIN_JSON="$DIR/.claude-plugin/plugin.json"
  if [ -f "$PLUGIN_JSON" ] && grep -q "telegram" "$PLUGIN_JSON" 2>/dev/null; then
    echo ""
    echo "  코워크 플러그인 .mcp.json:"
    python3 -c "
import json
with open('$mcpf') as f: m=json.load(f)
for name, srv in m.get('mcpServers',{}).items():
    cmd = srv.get('command','?')
    args = srv.get('args',[])
    env = srv.get('env',{})
    token = env.get('TELEGRAM_BOT_TOKEN','')
    db = env.get('DB_PATH','')

    # 변수 참조 체크
    issues = []
    if '\${' in cmd: issues.append(f'command에 미해결 변수: {cmd}')
    for a in args:
        if '\${' in str(a): issues.append(f'args에 미해결 변수: {a}')
    for k,v in env.items():
        if '\${' in str(v): issues.append(f'env.{k}에 미해결 변수: {v}')

    print(f'    server: {name}')
    print(f'    command: {cmd}')
    print(f'    token: {\"설정됨\" if token and not token.startswith(\"\${\") else \"✗ 미설정 또는 변수참조!\"}')

    if issues:
        for i in issues:
            print(f'    ✗ {i}')
    else:
        print(f'    ✓ 모든 경로/변수 해결됨')
" 2>/dev/null

    # node_modules 체크
    if [ -d "$DIR/node_modules" ]; then
      ok "  node_modules 존재"
    else
      fail "  node_modules 없음!"
    fi
  fi
done

# ─── 7. MCP 서버 로그 ───
echo ""
echo "7. MCP 서버 로그"
LOG="$CLAUDE_LOGS/mcp-server-telegram-cowork.log"
if [ -f "$LOG" ]; then
  LAST_LINE=$(tail -1 "$LOG")
  LAST_TIME=$(echo "$LAST_LINE" | grep -oE "20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}" | head -1)
  if [ -n "$LAST_TIME" ]; then
    info "마지막 활동: $LAST_TIME"
  fi

  # 에러 체크
  ERRORS=$(grep -ci "error\|fail\|ECONNRESET" "$LOG" 2>/dev/null || true)
  ERRORS=${ERRORS:-0}
  if [ "$ERRORS" -gt 0 ]; then
    warn "$ERRORS개 에러 발견:"
    grep -i "error\|fail\|ECONNRESET" "$LOG" 2>/dev/null | tail -3 | while read l; do
      echo "    $l"
    done
  else
    ok "에러 없음"
  fi

  # 마지막 tools/list 응답
  if grep -q "tools/list" "$LOG"; then
    TOOL_COUNT=$(grep "tools/list" "$LOG" | tail -1 | grep -o '"name":"[^"]*' | wc -l | tr -d ' ')
    info "마지막 tools/list 응답: ${TOOL_COUNT}개 도구"
  fi
else
  warn "MCP 서버 로그 없음 (한 번도 실행 안 됨)"
fi

# ─── 8. main.log 에러 ───
echo ""
echo "8. main.log 진단"
MAIN_LOG="$CLAUDE_LOGS/main.log"
if [ -f "$MAIN_LOG" ]; then
  # Skipping 에러
  SKIP=$(grep -c "Skipping.*telegram" "$MAIN_LOG" 2>/dev/null || echo "0")
  if [ "$SKIP" -gt 0 ]; then
    fail "DXT 확장 스킵 에러 $SKIP건:"
    grep "Skipping.*telegram" "$MAIN_LOG" 2>/dev/null | tail -2 | while read l; do
      echo "    $l"
    done
  else
    ok "DXT 스킵 에러 없음"
  fi

  # LocalMcpServerManager에서 telegram 연결 시도
  TG_CONNECT=$(grep -c "LocalMcpServerManager.*Connecting to telegram" "$MAIN_LOG" 2>/dev/null || echo "0")
  if [ "$TG_CONNECT" -gt 0 ]; then
    info "LocalMcpServerManager telegram 연결 시도 $TG_CONNECT건"
    # 마지막 연결 결과
    grep "LocalMcpServerManager.*telegram" "$MAIN_LOG" 2>/dev/null | tail -2 | while read l; do
      echo "    $l"
    done
  else
    warn "LocalMcpServerManager에서 telegram 연결 시도 없음"
    info "→ DXT 확장 또는 코워크 플러그인에서 MCP 서버를 등록하지 않았거나,"
    info "  코워크 세션이 플러그인의 .mcp.json을 읽지 못하고 있을 수 있음"
  fi

  # can_install 결과
  CAN_INSTALL=$(grep "canInstall.*telegram" "$MAIN_LOG" 2>/dev/null | tail -1)
  if [ -n "$CAN_INSTALL" ]; then
    if echo "$CAN_INSTALL" | grep -q "true"; then
      ok "can_install API: 승인됨"
    else
      fail "can_install API: 거부됨"
      echo "    $CAN_INSTALL"
    fi
  fi
fi

# ─── 9. Telegram Bot API 연결 테스트 ───
echo ""
echo "9. Telegram Bot API"
# .env에서 토큰 읽기
TOKEN=""
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$PROJECT_DIR/.env" ]; then
  TOKEN=$(grep "^TELEGRAM_BOT_TOKEN=" "$PROJECT_DIR/.env" 2>/dev/null | cut -d= -f2-)
fi
if [ -n "$TOKEN" ]; then
  RESULT=$(curl -s --max-time 5 "https://api.telegram.org/bot${TOKEN}/getMe" 2>/dev/null)
  if echo "$RESULT" | grep -q '"ok":true'; then
    BOT_NAME=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['username'])" 2>/dev/null)
    ok "봇 연결 성공: @$BOT_NAME"
  else
    fail "봇 연결 실패: $RESULT"
  fi
else
  warn "TELEGRAM_BOT_TOKEN 없음 (.env 파일 확인)"
fi

# ─── 10. SQLite DB 상태 ───
echo ""
echo "10. 데이터베이스"
for DB_PATH in "$PROJECT_DIR/data/bridge.db" ; do
  if [ -f "$DB_PATH" ]; then
    PENDING=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM pending_messages;" 2>/dev/null || echo "?")
    HANDLED=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM handled_messages;" 2>/dev/null || echo "?")
    SENT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sent_messages;" 2>/dev/null || echo "?")
    info "DB: $DB_PATH"
    info "  pending=$PENDING  handled=$HANDLED  sent=$SENT"
    if [ "$SENT" = "0" ]; then
      warn "  sent_messages가 비어있음 — 코워크→텔레그램 전송이 한 번도 안 됨"
    fi
  fi
done

# ─── 요약 ───
echo ""
echo "═══════════════════════════════════════════════"
echo " 핵심 확인 사항:"
echo "═══════════════════════════════════════════════"
echo ""
echo " 코워크에서 MCP 도구가 안 보이는 이유는 크게 3가지:"
echo ""
echo " A) DXT 확장 경로:"
echo "    Extensions 폴더 → manifest.json → LocalMcpServerManager"
echo "    ⤷ compatibility.runtimes에 node/python 외 키가 있으면 스킵됨"
echo ""
echo " B) 코워크 플러그인 경로:"
echo "    remote_cowork_plugins → .mcp.json → 코워크 VM 세션"
echo "    ⤷ installationPreference가 'available'이어야 활성화"
echo "    ⤷ .mcp.json의 모든 변수(\${...})가 해결되어야 함"
echo "    ⤷ node_modules가 있어야 함"
echo ""
echo " C) claude_desktop_config.json 경로:"
echo "    이 경로의 MCP 서버는 코워크 세션에서 사용 불가"
echo "    (메인 채팅에서만 사용)"
echo ""
