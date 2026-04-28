#!/bin/bash
# UserPromptSubmit hook: surface lucida cells minted in the last N minutes.
# Reads mint_log.jsonl appended by orchestrator.py, filters by age, prints
# a short summary that Claude Code injects as user-prompt context.
#
# Silent if no recent mints (hook stays out of the way when nothing changed).

set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="$REPO/mint_log.jsonl"
WINDOW_MIN="${LUCIDA_MINT_WINDOW_MIN:-60}"

[[ -f "$LOG" ]] || exit 0

python3 - "$LOG" "$WINDOW_MIN" <<'PY'
import json, sys, datetime as dt

log_path, window_min = sys.argv[1], int(sys.argv[2])
cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=window_min)

recent = []
try:
    with open(log_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = e.get("timestamp")
            if not ts:
                continue
            try:
                t = dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except ValueError:
                continue
            if t.tzinfo is None:
                t = t.replace(tzinfo=dt.timezone.utc)
            if t >= cutoff:
                recent.append(e)
except OSError:
    sys.exit(0)

if not recent:
    sys.exit(0)

print(f"Lucida cells minted in last {window_min}min ({len(recent)}):")
for e in recent[-10:]:  # cap at last 10 to bound prompt growth
    cap = (e.get("caption") or "").replace("\n", " ")
    if len(cap) > 80:
        cap = cap[:77] + "..."
    print(f"- {e.get('cell_id')} {e.get('cell_type')}: {cap}")
PY
