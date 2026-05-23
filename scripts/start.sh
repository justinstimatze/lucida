#!/usr/bin/env bash
# Launch lucida (renderer + snap receiver) and the transcript watcher together.
#
# Edit TRANSCRIPT below to point at your own Claude Code transcript.
# Ctrl-C tears down both processes.

set -u

LUCIDA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$LUCIDA_DIR"

# --- config ---
# Default to the most-recently-modified Claude Code transcript on this host.
# Override by setting LUCIDA_TRANSCRIPT before running this script, or by
# editing the line below to a fixed path.
DEFAULT_TRANSCRIPT=$(find "${HOME}/.claude/projects" -name '*.jsonl' -type f 2>/dev/null \
    | xargs -r ls -t 2>/dev/null \
    | head -n 1)
TRANSCRIPT="${LUCIDA_TRANSCRIPT:-${DEFAULT_TRANSCRIPT}}"

if [[ -z "${TRANSCRIPT}" ]]; then
    echo "[start] no transcript found; set LUCIDA_TRANSCRIPT or edit scripts/start.sh" >&2
    echo "[start] proceeding with renderer only (no watcher)" >&2
fi

# --- launch ---
declare -a PIDS=()

cleanup() {
    echo
    echo "[start] shutting down..."
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    wait 2>/dev/null
    exit 0
}
trap cleanup INT TERM

# serve.py bundles static + snap_receiver
python3 serve.py &
PIDS+=($!)
echo "[start] serve.py pid=${PIDS[-1]}"

if [[ -n "${TRANSCRIPT}" ]]; then
    sleep 0.5
    python3 watcher.py \
        --transcript "${TRANSCRIPT}" \
        --watch 30 --write --generate &
    PIDS+=($!)
    echo "[start] watcher.py pid=${PIDS[-1]} transcript=${TRANSCRIPT}"
fi

echo "[start] open http://localhost:8766/?theme=hackers&layout=mixed3d"
echo "[start] Ctrl-C to stop"
wait
