#!/usr/bin/env bash
set -euo pipefail

# ─── Claude Desktop DXT Extension Installer ───
# cowork-telegram-bridge를 Claude Desktop 확장으로 설치합니다.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
EXT_DIR="$HOME/Library/Application Support/Claude/Claude Extensions"
EXT_ID="local.telegram-cowork"
EXT_PATH="$EXT_DIR/$EXT_ID"
REGISTRY="$HOME/Library/Application Support/Claude/extensions-installations.json"

# ─── Color helpers ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

# ─── Pre-checks ───
echo "=== Telegram Cowork Bridge 설치 ==="
echo ""

# bun 확인
command -v bun >/dev/null 2>&1 || error "bun이 설치되어 있지 않습니다. https://bun.sh 에서 설치하세요."
info "bun $(bun --version) 확인됨"

# Claude Desktop 확인
[ -d "$EXT_DIR" ] || error "Claude Desktop Extensions 디렉토리를 찾을 수 없습니다. Claude Desktop이 설치되어 있나요?"
info "Claude Desktop Extensions 디렉토리 확인됨"

# ─── Bot Token 입력 ───
if [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
  echo ""
  echo -n "Telegram Bot Token을 입력하세요 (BotFather에서 발급): "
  read -r TELEGRAM_BOT_TOKEN
  [ -n "$TELEGRAM_BOT_TOKEN" ] || error "Bot Token이 필요합니다."
fi

HOOK_SECRET="${HOOK_SECRET:-cowork-bridge-secret}"

# ─── chats.json 설정 ───
if [ ! -f "$PROJECT_DIR/config/chats.json" ]; then
  warn "config/chats.json이 없습니다."
  echo "  config/chats.example.json을 복사하고 수정하세요:"
  echo "    cp config/chats.example.json config/chats.json"
  echo "    \$EDITOR config/chats.json"
  echo ""
  cp "$PROJECT_DIR/config/chats.example.json" "$PROJECT_DIR/config/chats.json"
  warn "example을 복사했습니다. 설치 후 반드시 수정하세요!"
fi

# ─── Dependencies 설치 ───
echo ""
info "의존성 설치 중..."
cd "$PROJECT_DIR" && bun install --frozen-lockfile 2>/dev/null || bun install
info "의존성 설치 완료"

# ─── .env 생성 ───
cat > "$PROJECT_DIR/.env" <<EOF
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
HOOK_SECRET=$HOOK_SECRET
EOF
info ".env 파일 생성됨"

# ─── data 디렉토리 보장 ───
mkdir -p "$PROJECT_DIR/data"

# ─── Extension 디렉토리에 복사 ───
echo ""
info "확장 설치 중..."

# 기존 설치 제거
[ -d "$EXT_PATH" ] && rm -rf "$EXT_PATH"
mkdir -p "$EXT_PATH"

# 필요한 파일 복사
cp "$PROJECT_DIR/manifest.json" "$EXT_PATH/"
cp "$PROJECT_DIR/package.json" "$EXT_PATH/"
cp "$PROJECT_DIR/bun.lock" "$EXT_PATH/"
cp "$PROJECT_DIR/CLAUDE.md" "$EXT_PATH/"
cp -r "$PROJECT_DIR/src" "$EXT_PATH/"
cp -r "$PROJECT_DIR/node_modules" "$EXT_PATH/"
cp -r "$PROJECT_DIR/skills" "$EXT_PATH/"
mkdir -p "$EXT_PATH/config" "$EXT_PATH/data"
cp "$PROJECT_DIR/config/chats.json" "$EXT_PATH/config/"

info "파일 복사 완료: $EXT_PATH"

# ─── manifest.json에 토큰 직접 주입 (user_config 미지원 대비) ───
# DXT가 user_config를 지원하면 설치 시 프롬프트가 뜨지만,
# 미지원할 경우를 대비해 설치된 manifest에 토큰을 직접 주입
python3 -c "
import json
with open('$EXT_PATH/manifest.json') as f:
    m = json.load(f)
m['server']['mcp_config']['env']['TELEGRAM_BOT_TOKEN'] = '$TELEGRAM_BOT_TOKEN'
m['server']['mcp_config']['env']['HOOK_SECRET'] = '$HOOK_SECRET'
with open('$EXT_PATH/manifest.json', 'w') as f:
    json.dump(m, f, indent=2, ensure_ascii=False)
" 2>/dev/null || {
  # python3 없으면 sed로 대체
  sed -i '' "s|\\\${user_config.TELEGRAM_BOT_TOKEN}|$TELEGRAM_BOT_TOKEN|g" "$EXT_PATH/manifest.json"
  sed -i '' "s|\\\${user_config.HOOK_SECRET}|$HOOK_SECRET|g" "$EXT_PATH/manifest.json"
}
info "토큰 주입 완료"

# ─── Extensions Registry 등록 ───
HASH=$(shasum -a 256 "$EXT_PATH/manifest.json" | cut -d' ' -f1)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

if [ -f "$REGISTRY" ]; then
  python3 -c "
import json, sys
with open('$REGISTRY') as f:
    data = json.load(f)
with open('$EXT_PATH/manifest.json') as f:
    manifest = json.load(f)
data['extensions']['$EXT_ID'] = {
    'id': '$EXT_ID',
    'version': manifest.get('version', '0.1.0'),
    'hash': '$HASH',
    'installedAt': '$NOW',
    'manifest': manifest,
    'signatureInfo': {'status': 'unsigned'},
    'source': 'local'
}
with open('$REGISTRY', 'w') as f:
    json.dump(data, f, ensure_ascii=False)
print('Registry updated')
"
  info "확장 레지스트리 등록 완료"
else
  warn "extensions-installations.json을 찾을 수 없습니다. 수동 등록이 필요할 수 있습니다."
fi

# ─── claude_desktop_config.json에서 중복 MCP 제거 ───
DESKTOP_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
if [ -f "$DESKTOP_CONFIG" ] && grep -q "telegram-cowork" "$DESKTOP_CONFIG" 2>/dev/null; then
  python3 -c "
import json
with open('$DESKTOP_CONFIG') as f:
    cfg = json.load(f)
if 'telegram-cowork' in cfg.get('mcpServers', {}):
    del cfg['mcpServers']['telegram-cowork']
    with open('$DESKTOP_CONFIG', 'w') as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    print('Removed duplicate MCP entry')
" 2>/dev/null && info "claude_desktop_config.json에서 중복 MCP 항목 제거됨" || true
fi

# ─── 완료 ───
echo ""
echo "=== 설치 완료! ==="
echo ""
echo "다음 단계:"
echo "  1. Claude Desktop을 완전히 종료 (Cmd+Q)"
echo "  2. Claude Desktop 다시 실행"
echo "  3. 코워크 세션에서 '텔레그램 메시지 확인해줘' 테스트"
echo ""
echo "설정 변경:"
echo "  - 프로젝트/채팅 설정: $PROJECT_DIR/config/chats.json"
echo "  - 봇 토큰 변경: scripts/install.sh 재실행"
echo ""
