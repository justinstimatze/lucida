#!/usr/bin/env bash
# record.sh — prep for a demo recording session
#
# Usage:
#   bash demo/record.sh [--interval 6] [--theme conclave] [--from-session nif-demo]
#
# Default flow: drip the curated demo/demo_cells.json (run curate.py first).
# With --from-session: snapshot every cell from that session in cells.json,
# wipe them, and replay them at speed. Skips curation entirely — use after
# a live mint when you want all of it back at once.
#
# Record your screen manually (Ctrl+Alt+Shift+R on GNOME), then convert:
#
#   bash demo/convert.sh ~/Videos/Screencast*.webm --trim <seconds>

set -euo pipefail
cd "$(dirname "$0")/.."

INTERVAL=6
THEME=conclave
LAYOUT=pack
SESSION_FILTER="nif-demo"
FROM_SESSION=""
build_url() { RENDERER_URL="http://localhost:8766/?theme=${THEME}&layout=${LAYOUT}&session=${SESSION_FILTER}"; }
build_url

while [[ $# -gt 0 ]]; do
  case $1 in
    --interval)     INTERVAL="$2"; shift 2 ;;
    --theme)        THEME="$2"; build_url; shift 2 ;;
    --layout)       LAYOUT="$2"; build_url; shift 2 ;;
    --from-session) FROM_SESSION="$2"; SESSION_FILTER="$2"; build_url; shift 2 ;;
    *) echo "unknown arg: $1"; exit 1 ;;
  esac
done

cat <<EOF

┌────────────────────────────────────────────────────────────────────────┐
│  lucida demo recording — sequence                                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  STOP — read this before pressing any key.                             │
│                                                                        │
│  When you press enter to continue, this script will:                   │
│    a. Snapshot the cells to replay.                                    │
│    b. WIPE them from cells.json — your dashboard goes BLANK            │
│       within ~2s (renderer poll). This is the demo's opening beat.     │
│    c. Drip them back at ${INTERVAL}s intervals.                              │
│                                                                        │
│  So: BEFORE pressing enter —                                           │
│    1. Make sure the chrome window is positioned + framed how you want. │
│       URL: ${RENDERER_URL}
│    2. Start your screen recording (Ctrl+Alt+Shift+R on GNOME).         │
│                                                                        │
│  AFTER all cells land + the pack settles —                             │
│    3. Stop recording (Ctrl+Alt+Shift+R again).                         │
│    4. Convert: bash demo/convert.sh ~/Videos/Screencast*.webm --trim 6 │
│                                                                        │
│  Cancel with Ctrl-C if you're not ready.                               │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘

EOF
read -p "Press enter when screen-recording is rolling and you're ready to drip... " _
echo ""

if [[ -n "$FROM_SESSION" ]]; then
  echo "Replaying all cells from session=${FROM_SESSION} (snapshot + reset + drip)"
  python demo/replay.py --from-session "$FROM_SESSION" --interval "$INTERVAL"
else
  python demo/replay.py --reset --session "$SESSION_FILTER"
  echo "Cells reset. Starting drip (interval=${INTERVAL}s)..."
  python demo/replay.py --interval "$INTERVAL"
fi
