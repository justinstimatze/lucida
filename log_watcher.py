"""v0 system-log adapter — mint lucida cells from the systemd journal.

Polls ``journalctl --since=<last>`` on a fixed interval, mints one cell
per batch with ``session_id="log:journal"`` so the source surfaces as
its own column under the existing multi-stream filter
(``?session=log:journal``).

The systemd journal is the natural unified-log answer on this host
(aggregates kernel + user services + syslog), so v0 hardwires it as
the single source. UX for adding/removing arbitrary log sources is a
later concern (user 2026-05-03: "I'm not sure how to easily let lucida
configure log sources but that's a ux thing for later").

Compose with watcher.py: run both processes in parallel, their
session_id namespaces don't collide.
"""

from __future__ import annotations

import argparse
import datetime
import shutil
import subprocess
import sys
import time

from orchestrator import SuppressedMintError, append_proposal


def _fetch(since: datetime.datetime, until: datetime.datetime) -> str:
    """Pull a journal slice for the half-open window [since, until)."""
    proc = subprocess.run(
        [
            "journalctl",
            "--since",
            since.strftime("%Y-%m-%d %H:%M:%S"),
            "--until",
            until.strftime("%Y-%m-%d %H:%M:%S"),
            "--no-pager",
            "--output=short",
        ],
        capture_output=True,
        text=True,
        timeout=15,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"journalctl exit {proc.returncode}: {proc.stderr.strip()}")
    return proc.stdout


def watch(
    *,
    interval_s: float = 30.0,
    min_chars: int = 200,
    snippet_cap: int = 2000,
    write: bool = True,
) -> None:
    if shutil.which("journalctl") is None:
        print("[log_watcher] journalctl not on PATH; aborting", file=sys.stderr)
        sys.exit(2)

    session_id = "log:journal"
    # First tick reads the prior interval so the very first window has
    # something to chew on without replaying ancient history.
    since = datetime.datetime.now() - datetime.timedelta(seconds=interval_s)
    print(f"[log_watcher] tailing systemd journal as {session_id}, every {interval_s:g}s")
    while True:
        try:
            time.sleep(interval_s)
        except KeyboardInterrupt:
            print("[log_watcher] interrupted")
            return
        until = datetime.datetime.now()
        try:
            chunk = _fetch(since, until)
        except Exception as e:
            print(f"[log_watcher] fetch error: {e!r}", file=sys.stderr)
            since = until
            continue

        chunk = chunk.strip()
        window = f"{since.strftime('%H:%M:%S')}-{until.strftime('%H:%M:%S')}"
        if len(chunk) < min_chars:
            print(f"[log_watcher] {window}: idle ({len(chunk)} chars)")
            since = until
            continue

        # Cap the snippet from the END (most recent lines) — journalctl
        # output is chronological so the tail is the most informative
        # for a fresh cell.
        snippet = chunk[-snippet_cap:] if len(chunk) > snippet_cap else chunk
        ctx = f"systemd journal slice {window}"
        try:
            proposal = append_proposal(
                snippet,
                ctx,
                None,
                write=write,
                session_id=session_id,
            )
            print(f"[log_watcher] {window}: minted {proposal.id} ({len(snippet)} chars)")
        except SuppressedMintError as e:
            print(f"[log_watcher] {window}: suppressed ({e})")
        except Exception as e:
            print(f"[log_watcher] {window}: mint error: {e!r}", file=sys.stderr)
        since = until


def main() -> None:
    p = argparse.ArgumentParser(description="Mint lucida cells from systemd journal")
    p.add_argument("--interval", type=float, default=30.0, help="poll interval (s)")
    p.add_argument("--min-chars", type=int, default=200, help="skip windows below this")
    p.add_argument("--snippet-cap", type=int, default=2000, help="cap snippet to last N chars")
    p.add_argument("--dry-run", action="store_true", help="don't write cells.json")
    args = p.parse_args()
    watch(
        interval_s=args.interval,
        min_chars=args.min_chars,
        snippet_cap=args.snippet_cap,
        write=not args.dry_run,
    )


if __name__ == "__main__":
    main()
