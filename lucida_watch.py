"""Run all lucida ingest streams as one supervised process tree.

Replaces "open three terminals and run watcher.py + log_watcher.py +
system_snapshot.py separately" with a single command. Default: all
three on. Toggle off via --no-transcripts / --no-logs / --no-snapshot.

Each child runs as its own subprocess so a crash in one (segmenter
exception, journalctl hiccup) doesn't take down the others. Output
from each child is line-prefixed with its name on the supervisor's
stdout. Ctrl-C signals all children to terminate.
"""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from types import FrameType

ROOT = Path(__file__).resolve().parent
CHILDREN: list[tuple[str, subprocess.Popen[str]]] = []
_SHUTTING_DOWN = False


def _pipe(name: str, proc: subprocess.Popen[str]) -> None:
    """Forward child stdout to supervisor stdout with a [name] prefix."""
    assert proc.stdout is not None
    for line in proc.stdout:
        print(f"[{name}] {line.rstrip()}", flush=True)


def _spawn(name: str, cmd: list[str]) -> None:
    print(f"[supervisor] start {name}: {' '.join(cmd)}", flush=True)
    proc = subprocess.Popen(
        cmd,
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    CHILDREN.append((name, proc))
    threading.Thread(target=_pipe, args=(name, proc), daemon=True).start()


def _shutdown(_signum: int = 0, _frame: FrameType | None = None) -> None:
    global _SHUTTING_DOWN
    if _SHUTTING_DOWN:
        return
    _SHUTTING_DOWN = True
    print("[supervisor] shutting down children...", file=sys.stderr, flush=True)
    for _name, proc in CHILDREN:
        if proc.poll() is None:
            proc.terminate()
    deadline = time.time() + 5.0
    for name, proc in CHILDREN:
        remaining = max(0.0, deadline - time.time())
        try:
            proc.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            print(f"[supervisor] {name} did not exit in time, killing", file=sys.stderr, flush=True)
            proc.kill()
    sys.exit(0)


def main() -> None:
    p = argparse.ArgumentParser(description="Supervise lucida ingest streams")
    p.add_argument(
        "--no-transcripts", action="store_true", help="skip transcript auto-discover watcher"
    )
    p.add_argument("--no-logs", action="store_true", help="skip systemd-journal watcher")
    p.add_argument("--no-snapshot", action="store_true", help="skip system-snapshot watcher")
    p.add_argument(
        "--watch-interval",
        type=int,
        default=30,
        help="transcript poll interval (s); passed to watcher.py --watch",
    )
    p.add_argument("--log-interval", type=float, default=30.0, help="journal poll interval (s)")
    p.add_argument("--snapshot-interval", type=float, default=60.0, help="snapshot interval (s)")
    p.add_argument(
        "--max-cells",
        type=int,
        default=None,
        help="cap total cells in cells.json (sets LUCIDA_MAX_CELLS for all children)",
    )
    args = p.parse_args()

    py = sys.executable

    # Cap total cells if requested. Applies to all children via env —
    # any of them may call into the orchestrator on a mint, so we set
    # it once at the supervisor and let it inherit, instead of threading
    # a flag through every child's CLI.
    if args.max_cells is not None:
        os.environ["LUCIDA_MAX_CELLS"] = str(args.max_cells)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    if not args.no_transcripts:
        _spawn(
            "transcripts",
            [
                py,
                str(ROOT / "watcher.py"),
                "--auto-discover",
                "--watch",
                str(args.watch_interval),
            ],
        )
    if not args.no_logs:
        _spawn(
            "logs",
            [py, str(ROOT / "log_watcher.py"), "--interval", str(args.log_interval)],
        )
    if not args.no_snapshot:
        _spawn(
            "snapshot",
            [py, str(ROOT / "system_snapshot.py"), "--interval", str(args.snapshot_interval)],
        )

    if not CHILDREN:
        print("[supervisor] all streams disabled; nothing to do", file=sys.stderr)
        sys.exit(2)

    print(f"[supervisor] {len(CHILDREN)} stream(s) running. Ctrl-C to stop.", flush=True)

    # Loop: poll for unexpected child deaths, otherwise sleep until signal.
    while not _SHUTTING_DOWN:
        time.sleep(1.0)
        for name, proc in list(CHILDREN):
            rc = proc.poll()
            if rc is not None and not _SHUTTING_DOWN:
                # A child exited on its own — log it but keep the others
                # running so the supervisor doesn't kill the world over a
                # single transient failure. The user can Ctrl-C if they
                # want to restart everything.
                print(
                    f"[supervisor] {name} exited unexpectedly (rc={rc})",
                    file=sys.stderr,
                    flush=True,
                )
                CHILDREN.remove((name, proc))
        if not CHILDREN:
            print("[supervisor] all children exited; bye", flush=True)
            return


if __name__ == "__main__":
    main()
