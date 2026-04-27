#!/usr/bin/env bash
# start_session.sh — wire up renderer + watcher for a fresh demo session
#
# Usage (two terminals):
#   Terminal 1:  bash demo/start_session.sh
#   Terminal 2:  cd /tmp/nif-session && claude
#
# The script starts the HTTP renderer, opens Chrome, then blocks waiting
# for the transcript to appear. Once claude starts in Terminal 2 and the
# first turn lands, the watcher attaches automatically.
#
# Prompts to paste are in demo/seed_conversation.md.

set -euo pipefail
cd "$(dirname "$0")/.."

SESSION_DIR=/tmp/nif-session
TRANSCRIPT_DIR="$HOME/.claude/projects/-tmp-nif-session"
RENDERER_URL="http://localhost:8766/?theme=conclave&session=nif-demo"
SESSION_ID="nif-demo"

# ── renderer ──────────────────────────────────────────────────────────────────
if lsof -i :8766 &>/dev/null; then
  echo "renderer already running on :8766"
else
  echo "Starting renderer..."
  python3 -m http.server 8766 &>/dev/null &
  HTTP_PID=$!
  sleep 1
  echo "  → http://localhost:8766/?theme=conclave"
fi

# ── browser ───────────────────────────────────────────────────────────────────
for bin in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "$bin" &>/dev/null; then
    "$bin" --start-maximized --app="$RENDERER_URL" &>/dev/null &
    break
  fi
done

# ── prompt ────────────────────────────────────────────────────────────────────
mkdir -p "$SESSION_DIR"
echo ""
echo "┌─────────────────────────────────────────────────────────┐"
echo "│  Open a new terminal and run:                           │"
echo "│                                                         │"
echo "│    cd $SESSION_DIR && claude         │"
echo "│                                                         │"
echo "│  Prompts: demo/seed_conversation.md                     │"
echo "│  Wait ~30s between prompts.                             │"
echo "└─────────────────────────────────────────────────────────┘"
echo ""
echo "Waiting for claude session transcript..."

# ── wait for transcript ───────────────────────────────────────────────────────
TRANSCRIPT=""
while true; do
  if [[ -d "$TRANSCRIPT_DIR" ]]; then
    TRANSCRIPT=$(ls -t "$TRANSCRIPT_DIR"/*.jsonl 2>/dev/null | head -1 || true)
    if [[ -n "$TRANSCRIPT" ]]; then
      break
    fi
  fi
  sleep 2
done

echo "Transcript found: $TRANSCRIPT"
echo "Attaching watcher (session-id: $SESSION_ID)..."
echo ""

# ── watcher ───────────────────────────────────────────────────────────────────
python watcher.py \
  --transcript "$TRANSCRIPT" \
  --watch 20 \
  --write \
  --generate \
  --session-id "$SESSION_ID"
