"""Quarantine stale cells.json snapshots into .cells-snapshots/.

The orchestrator writes timestamped backups before destructive operations
(cull, rebalance, sysmetric resampling).  Over months they accumulate
hundreds of megabytes.  This script keeps the N most-recent per prefix and
moves the rest aside.  By default it MOVES (reversible) rather than
deletes — the user can `rm -rf .cells-snapshots/` themselves once they're
sure they don't need any of them.

Prefixes handled:
    cells.json.bak*
    cells.json.before-*
    cells.json.pre-*
    cells.json.corrupt-*
    cells.json.truncated-*
    cells_*_archive.json

Usage:
    python tools/cleanup_cells_snapshots.py            # dry-run (prints plan)
    python tools/cleanup_cells_snapshots.py --apply    # execute the moves
    python tools/cleanup_cells_snapshots.py --keep 5   # retain 5 per prefix
    python tools/cleanup_cells_snapshots.py --delete   # rm instead of mv
"""

from __future__ import annotations

import argparse
import re
import shutil
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
QUARANTINE = REPO / ".cells-snapshots"

# (glob, group-key extractor). The key collapses a timestamp/suffix into
# a stable prefix so siblings of the same backup type rank together.
PREFIXES: list[tuple[str, re.Pattern[str]]] = [
    ("cells.json.bak*", re.compile(r"^(cells\.json\.bak)")),
    ("cells.json.before-*", re.compile(r"^(cells\.json\.before-[a-z-]+)")),
    ("cells.json.pre-*", re.compile(r"^(cells\.json\.pre-[a-z-]+)")),
    ("cells.json.corrupt-*", re.compile(r"^(cells\.json\.corrupt(?:-backup)?)")),
    ("cells.json.truncated-*", re.compile(r"^(cells\.json\.truncated-\d+)")),
    ("cells_*_archive.json", re.compile(r"^(cells_[a-z]+_archive)\.json")),
]


def group_snapshots(repo: Path) -> dict[str, list[Path]]:
    groups: dict[str, list[Path]] = defaultdict(list)
    for glob, keyrx in PREFIXES:
        for path in repo.glob(glob):
            if not path.is_file():
                continue
            m = keyrx.match(path.name)
            if not m:
                continue
            groups[m.group(1)].append(path)
    return groups


def plan(repo: Path, keep: int) -> list[tuple[Path, str]]:
    """Return [(path, action)] where action is 'keep' or 'move'."""
    groups = group_snapshots(repo)
    out: list[tuple[Path, str]] = []
    for _key, paths in sorted(groups.items()):
        # Newest first by mtime — newest N stay, rest move.
        paths.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        for i, p in enumerate(paths):
            out.append((p, "keep" if i < keep else "move"))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="execute (default: dry-run)")
    ap.add_argument("--delete", action="store_true", help="delete instead of move")
    ap.add_argument("--keep", type=int, default=2, help="retain N newest per prefix (default 2)")
    args = ap.parse_args()

    actions = plan(REPO, args.keep)
    movers = [p for p, a in actions if a == "move"]
    keepers = [p for p, a in actions if a == "keep"]

    print(
        f"Found {len(actions)} snapshot file(s) across {len({p.name.split('-')[0] for p in movers + keepers})} prefix groups."
    )
    print(f"Keeping {len(keepers)} newest (--keep {args.keep}). Acting on {len(movers)}.")

    if not movers:
        return

    if not args.apply:
        print("\nDry-run plan (re-run with --apply to execute):")
        for p in movers:
            kb = p.stat().st_size // 1024
            verb = "rm" if args.delete else "mv to .cells-snapshots/"
            print(f"  {verb}  {p.name}  ({kb} KB)")
        return

    if args.delete:
        for p in movers:
            p.unlink()
            print(f"removed {p.name}")
    else:
        QUARANTINE.mkdir(exist_ok=True)
        for p in movers:
            dest = QUARANTINE / p.name
            shutil.move(str(p), str(dest))
            print(f"moved   {p.name} -> {dest.relative_to(REPO)}")


if __name__ == "__main__":
    main()
