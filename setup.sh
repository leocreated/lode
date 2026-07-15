#!/bin/bash
# LODE tester setup — checks everything, asks for your YouTube key, installs.
set -e
cd "$(dirname "$0")"

ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
bad()  { printf "  \033[31m✗\033[0m %s\n" "$1"; }
note() { printf "    %s\n" "$1"; }

echo ""
echo "LODE setup"
echo "=========="
FAIL=0

# 1. Node
if command -v node >/dev/null 2>&1; then
  ok "Node $(node -v) found"
else
  bad "Node.js is not installed"
  note "Install it from https://nodejs.org (LTS version), then run this again."
  FAIL=1
fi

# 2. An AI CLI: Claude Code or OpenAI Codex (either works)
if command -v claude >/dev/null 2>&1; then
  ok "Claude Code found (LODE will use Claude)"
  note "Make sure you're logged in: run 'claude' once and sign in with your Claude subscription."
elif command -v codex >/dev/null 2>&1; then
  ok "OpenAI Codex found (LODE will use ChatGPT)"
  note "Make sure you're logged in: run 'codex' once and sign in with your ChatGPT account."
else
  bad "No AI assistant installed. LODE needs ONE of these (runs on your existing subscription, free):"
  note "Claude subscription?  npm install -g @anthropic-ai/claude-code   then run 'claude' and log in."
  note "ChatGPT subscription? npm install -g @openai/codex              then run 'codex' and log in."
  note "It names the niches, reads thumbnails to filter foreign-language bait, and writes deep-dive reports."
  FAIL=1
fi

[ $FAIL -eq 1 ] && { echo ""; echo "Fix the ✗ items above, then run ./setup.sh again."; exit 1; }

# 3. YouTube API key
if [ -f .env ] && grep -q "^YOUTUBE_API_KEY=." .env; then
  ok "YouTube API key already saved in .env"
else
  echo ""
  echo "You need a free YouTube API key (takes ~3 minutes):"
  note "1. Go to https://console.cloud.google.com and create a project (any name)."
  note "2. Search 'YouTube Data API v3' and click Enable."
  note "3. Go to Credentials > Create credentials > API key. Copy it."
  echo ""
  read -r -p "Paste your YouTube API key here: " KEY
  [ -z "$KEY" ] && { bad "No key entered. Run ./setup.sh again when you have it."; exit 1; }
  printf "YOUTUBE_API_KEY=%s\n" "$KEY" > .env
  ok "Saved to .env (stays on your machine, never uploaded)"
fi

# 4. Dependencies
echo ""
echo "Installing..."
npm install --silent
ok "Dependencies installed"

echo ""
echo "Done. Start LODE with:  npm start"
echo "Then open http://localhost:4780"
echo ""
