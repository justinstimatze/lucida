#!/usr/bin/env python3
"""Extract a curated demo set from the live cells.json.

Picks real cells minted by the watcher from an actual Claude Code session
and writes them to demo/demo_cells.json for use with replay.py.

Usage:
    cd ~/Documents/lucida

    # Auto-select best cell per substrate from a session (recommended):
    python demo/curate.py --session nif-demo

    # Explicit IDs:
    python demo/curate.py --ids cell-0042,...

    # List candidates by substrate (optionally filtered by session):
    python demo/curate.py --list
    python demo/curate.py --list --session nif-demo
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent.parent
CELLS_PATH = ROOT / "cells.json"
OUT_PATH = Path(__file__).parent / "demo_cells.json"

DEMO_SUBSTRATES = ["mermaid", "vega", "animated_svg", "html", "treemap", "sparkline", "scene3d"]


def _has_content(c: dict) -> bool:
    return bool(c.get("spec") or c.get("html"))


def _load_all() -> list[dict]:
    return json.loads(CELLS_PATH.read_text()).get("cells", [])


def auto_select(session: str) -> list[dict]:
    """Pick the most recent non-empty cell per substrate from session."""
    cells = [c for c in _load_all() if c.get("session_id") == session]
    if not cells:
        raise SystemExit(f"No cells found with session_id={session!r}")

    by_sub: dict[str, list[dict]] = defaultdict(list)
    for c in cells:
        ct = c.get("cell_type", "")
        if ct and ct not in ("text",) and _has_content(c):
            by_sub[ct].append(c)

    def _score(c: dict) -> int:
        return len(c.get("spec") or c.get("html") or "")

    selected = []
    for sub in DEMO_SUBSTRATES:
        candidates = by_sub.get(sub, [])
        if candidates:
            selected.append(max(candidates, key=_score))  # richest spec
        else:
            # Fall back to any session — pick the most recent non-empty cell of this type
            all_cells = [c for c in _load_all() if c.get("cell_type") == sub and _has_content(c)]
            if all_cells:
                selected.append(all_cells[-1])
                print(
                    f"  note: {sub} not in session {session!r}, using {all_cells[-1]['id']} from {all_cells[-1].get('session_id', '?')}"
                )
            else:
                print(f"  warning: no {sub} cell found anywhere")

    # Any non-demo-substrate types that appeared (extra vega, etc.)
    covered = {c["id"] for c in selected}
    for sub, candidates in by_sub.items():
        if sub not in DEMO_SUBSTRATES and candidates:
            c = candidates[-1]
            if c["id"] not in covered:
                selected.append(c)

    return selected


def load_cells_by_id(cell_ids: list[str]) -> tuple[list[dict], list[str]]:
    lookup = {c["id"]: c for c in _load_all()}
    found, missing = [], []
    for cid in cell_ids:
        if cid in lookup:
            found.append(lookup[cid])
        else:
            missing.append(cid)
    return found, missing


def list_candidates(session: str | None = None) -> None:
    cells = _load_all()
    if session:
        cells = [c for c in cells if c.get("session_id") == session]
        print(f"Showing cells for session={session!r} ({len(cells)} total)\n")
    else:
        cells = cells[-150:]

    by_sub: dict[str, list[dict]] = defaultdict(list)
    for c in cells:
        ct = c.get("cell_type", "?")
        if ct not in ("text", "?"):
            by_sub[ct].append(c)

    for sub in DEMO_SUBSTRATES:
        print(f"\n── {sub} ──")
        for c in by_sub.get(sub, [])[-8:]:
            has = "ok" if _has_content(c) else "empty"
            print(f"  {c['id']} [{has}] {c.get('title', '')[:55]}")


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--session", help="auto-select best cell per substrate from this session_id")
    p.add_argument("--ids", help="comma-separated cell IDs to include")
    p.add_argument("--out", type=Path, default=OUT_PATH, help="output path")
    p.add_argument("--list", action="store_true", help="list candidate cells and exit")
    args = p.parse_args()

    if args.list:
        list_candidates(session=args.session)
        return

    if args.session and args.ids:
        p.error("--session and --ids are mutually exclusive")

    if args.session:
        cells = auto_select(args.session)
    elif args.ids:
        cells, missing = load_cells_by_id([x.strip() for x in args.ids.split(",")])
        if missing:
            print(f"warning: {len(missing)} IDs not found: {', '.join(missing)}")
    else:
        p.error("specify --session <id> or --ids <cell-id,...>")

    print(f"Curated {len(cells)} cells → {args.out}")
    for c in cells:
        has = "ok" if _has_content(c) else "EMPTY"
        print(f"  {c['id']} {c.get('cell_type', ''):14s} [{has}] {c.get('title', '')[:55]}")

    # Normalize all cell session_ids so replay.py drips them under the right filter
    demo_session = args.session or "lucida-demo"
    for c in cells:
        c["session_id"] = demo_session

    data = {"session_id": demo_session, "cells": cells}
    args.out.write_text(json.dumps(data, indent=2) + "\n")
    print(f"\nWritten to {args.out}")


if __name__ == "__main__":
    main()
