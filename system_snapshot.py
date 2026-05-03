"""v0 system-snapshot adapter — periodic cell of "what the box looks
like right now".

User 2026-05-03: "and not just logs but system info like what htop or
similar would snapshot ... doesn't need to be continuous ... just a
cell going by with what the state of the system was at that point".

Each tick captures load + memory + top processes + disk + sockets, hands
the labeled-text bundle to the orchestrator, mints one cell tagged
``session_id="system:snapshot"``. Different snapshots may classify into
different substrates (treemap for processes, gauge for memory, etc.) —
that variety is a feature.

Compose with watcher.py and log_watcher.py: independent session_id
namespaces, one column each under the multi-stream filter.
"""

from __future__ import annotations

import argparse
import datetime
import shutil
import subprocess
import sys
import time

from orchestrator import SuppressedMintError, append_proposal


def _run(cmd: list[str], *, timeout: float = 5.0) -> str:
    """Run a probe and return stripped stdout, or a one-line error marker."""
    if shutil.which(cmd[0]) is None:
        return f"({cmd[0]} not on PATH)"
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return f"({' '.join(cmd)} timed out)"
    except Exception as e:
        return f"({cmd[0]} failed: {e!r})"
    if proc.returncode != 0:
        return f"({cmd[0]} exit {proc.returncode}: {proc.stderr.strip()[:100]})"
    return proc.stdout.strip()


def capture_snapshot(*, top_n: int = 10) -> str:
    """Build the labeled-text snippet for one tick."""
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    parts: list[str] = [f"# System snapshot at {now}", ""]

    parts.append("## Load average / uptime")
    parts.append(_run(["uptime"]))
    parts.append("")

    parts.append("## Memory")
    parts.append(_run(["free", "-h"]))
    parts.append("")

    parts.append(f"## Top {top_n} processes by CPU")
    parts.append(
        _run(["bash", "-c", f"ps -eo user,pid,pcpu,pmem,comm --sort=-pcpu | head -n {top_n + 1}"])
    )
    parts.append("")

    parts.append(f"## Top {top_n} processes by RSS")
    parts.append(
        _run(
            ["bash", "-c", f"ps -eo user,pid,pcpu,pmem,rss,comm --sort=-rss | head -n {top_n + 1}"]
        )
    )
    parts.append("")

    parts.append("## Disk usage")
    parts.append(
        _run(
            [
                "df",
                "-h",
                "--output=source,size,used,avail,pcent,target",
                "-x",
                "tmpfs",
                "-x",
                "devtmpfs",
            ]
        )
    )
    parts.append("")

    parts.append("## Active TCP sockets")
    parts.append(_run(["bash", "-c", "ss -tn state established 2>/dev/null | head -n 15"]))

    return "\n".join(parts)


def watch(
    *,
    interval_s: float = 60.0,
    top_n: int = 10,
    write: bool = True,
) -> None:
    session_id = "system:snapshot"
    print(f"[system_snapshot] minting state cells as {session_id}, every {interval_s:g}s")
    while True:
        try:
            time.sleep(interval_s)
        except KeyboardInterrupt:
            print("[system_snapshot] interrupted")
            return
        snippet = capture_snapshot(top_n=top_n)
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        ctx = f"Periodic system snapshot at {ts} (load + memory + top processes + disk + sockets)"
        try:
            proposal = append_proposal(
                snippet,
                ctx,
                None,
                write=write,
                session_id=session_id,
            )
            print(f"[system_snapshot] {ts}: minted {proposal.id} ({len(snippet)} chars)")
        except SuppressedMintError as e:
            print(f"[system_snapshot] {ts}: suppressed ({e})")
        except Exception as e:
            print(f"[system_snapshot] {ts}: mint error: {e!r}", file=sys.stderr)


def main() -> None:
    p = argparse.ArgumentParser(description="Mint lucida cells from periodic system snapshots")
    p.add_argument("--interval", type=float, default=60.0, help="snapshot interval (s)")
    p.add_argument("--top", type=int, default=10, help="top-N processes per category")
    p.add_argument(
        "--once", action="store_true", help="emit one snapshot to stdout and exit (no mint)"
    )
    p.add_argument("--dry-run", action="store_true", help="don't write cells.json")
    args = p.parse_args()
    if args.once:
        print(capture_snapshot(top_n=args.top))
        return
    watch(
        interval_s=args.interval,
        top_n=args.top,
        write=not args.dry_run,
    )


if __name__ == "__main__":
    main()
