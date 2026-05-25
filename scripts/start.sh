#!/usr/bin/env bash
# Launch lucida (renderer + snap receiver) and the transcript watcher together.
# Supervisor restarts crashed children up to a per-child quota so a single
# watcher crash (e.g. corrupt cells.json before R4 recovery fires) doesn't
# silently leave the dashboard dead.
#
# Edit TRANSCRIPT below to point at your own Claude Code transcript.
# Ctrl-C tears down both processes.

set -u

LUCIDA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$LUCIDA_DIR"

# Prefer the project venv so anthropic + python-dotenv are importable.
# Fall back to system python3 if no venv (dev hasn't run `uv venv` yet).
PY="$LUCIDA_DIR/.venv/bin/python3"
[ -x "$PY" ] || PY=python3

# --- config ---
# Default to the most-recently-modified Claude Code transcript on this host.
# Override by setting LUCIDA_TRANSCRIPT before running this script, or by
# editing the line below to a fixed path.
# -print0 / -0 handles filenames containing spaces or newlines safely.
DEFAULT_TRANSCRIPT=$(find "${HOME}/.claude/projects" -name '*.jsonl' -type f -print0 2>/dev/null \
    | xargs -0 -r ls -t 2>/dev/null \
    | head -n 1)
TRANSCRIPT="${LUCIDA_TRANSCRIPT:-${DEFAULT_TRANSCRIPT}}"

if [[ -z "${TRANSCRIPT}" ]]; then
    echo "[start] no transcript found; set LUCIDA_TRANSCRIPT or edit scripts/start.sh" >&2
    echo "[start] proceeding with renderer only (no watcher)" >&2
fi

# --- supervisor state ---
# Parallel arrays: child name | pid | command string | restart count.
declare -a NAMES=() PIDS=() CMDS=() RESTARTS=()
SHUTDOWN=0
MAX_RESTARTS=5            # per child, total over session
RESTART_COOLDOWN_S=2      # min seconds between restarts of same child

start_child() {
    local name="$1" cmd="$2"
    # shellcheck disable=SC2086 — intentional word-splitting on cmd
    bash -c "exec $cmd" &
    local pid=$!
    echo "[start] $name pid=$pid"
    NAMES+=("$name")
    PIDS+=("$pid")
    CMDS+=("$cmd")
    RESTARTS+=(0)
}

cleanup() {
    SHUTDOWN=1
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

# --- launch initial children ---
# serve.py bundles static + snap_receiver
start_child "serve.py" "\"$PY\" serve.py"

# Block until snap_receiver answers /healthz on :8767 (or 10s timeout).
# Without this, the watcher and any browser tab connecting to :8766
# can race ahead and start firing POST /cells/<id>.svg requests at a
# snap_receiver port that isn't bound yet — produces a noisy 404 burst
# at first paint that looks like the cache is broken.
SNAP_READY=0
for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if curl -sf -o /dev/null --max-time 1 http://127.0.0.1:8767/healthz 2>/dev/null; then
        SNAP_READY=1
        echo "[start] snap_receiver ready (took ${attempt}s)"
        break
    fi
    sleep 1
done
if [[ $SNAP_READY -eq 0 ]]; then
    echo "[start] WARN snap_receiver /healthz unanswered after 10s — continuing anyway" >&2
fi

if [[ -n "${TRANSCRIPT}" ]]; then
    start_child "watcher.py" "\"$PY\" watcher.py --transcript \"${TRANSCRIPT}\" --watch 30 --write --generate"
fi

echo "[start] open http://localhost:8766/?theme=hackers&layout=mixed3d"
echo "[start] Ctrl-C to stop"

# --- supervisor loop ---
# Poll every 2s. If any child is dead and we're not shutting down, restart
# it up to MAX_RESTARTS times. Exits when shutdown trap fires or all
# children have exhausted their restart budget.
while [[ $SHUTDOWN -eq 0 ]]; do
    sleep 2
    [[ $SHUTDOWN -eq 1 ]] && break
    for i in "${!PIDS[@]}"; do
        pid="${PIDS[$i]}"
        name="${NAMES[$i]}"
        if ! kill -0 "$pid" 2>/dev/null; then
            n="${RESTARTS[$i]}"
            if [[ $n -ge $MAX_RESTARTS ]]; then
                echo "[start] $name dead — restart budget exhausted ($n/$MAX_RESTARTS), giving up" >&2
                continue
            fi
            echo "[start] $name (pid=$pid) died — restarting ($((n+1))/$MAX_RESTARTS)" >&2
            sleep "$RESTART_COOLDOWN_S"
            # shellcheck disable=SC2086
            bash -c "exec ${CMDS[$i]}" &
            PIDS[$i]=$!
            RESTARTS[$i]=$((n+1))
            echo "[start] $name restarted pid=${PIDS[$i]}"
        fi
    done
done
