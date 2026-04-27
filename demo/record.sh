#!/usr/bin/env bash
# record.sh — prep for a demo recording session
#
# Usage:
#   bash demo/record.sh [--interval 6] [--theme conclave]
#
# This script resets the demo cells and starts the replay drip.
# Record your screen manually (Ctrl+Alt+Shift+R on GNOME), then convert:
#
#   bash demo/convert.sh ~/Videos/Screencast*.webm --trim <seconds>

set -euo pipefail
cd "$(dirname "$0")/.."

INTERVAL=6
THEME=conclave
SESSION_FILTER="nif-demo"
RENDERER_URL="http://localhost:8766/?theme=${THEME}&session=${SESSION_FILTER}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --interval) INTERVAL="$2"; shift 2 ;;
    --theme)    THEME="$2"; RENDERER_URL="http://localhost:8766/?theme=${THEME}&session=${SESSION_FILTER}"; shift 2 ;;
    *) echo "unknown arg: $1"; exit 1 ;;
  esac
done

echo ""
echo "┌─────────────────────────────────────────────────────────┐"
echo "│  lucida demo prep                                       │"
echo "│                                                         │"
echo "│  1. Cells will reset and start dripping every ${INTERVAL}s    │"
echo "│  2. Open: ${RENDERER_URL}  │"
echo "│  3. Hit Ctrl+Alt+Shift+R to start recording             │"
echo "│  4. Hit Ctrl+Alt+Shift+R again to stop                  │"
echo "│  5. Run: bash demo/convert.sh ~/Videos/Screencast*.webm │"
echo "│                                                         │"
echo "└─────────────────────────────────────────────────────────┘"
echo ""

python demo/replay.py --reset
echo "Cells reset. Starting drip (interval=${INTERVAL}s)..."
python demo/replay.py --interval "$INTERVAL"
