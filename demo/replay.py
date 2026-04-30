#!/usr/bin/env python3
"""Drip demo cells into cells.json to simulate live minting during recording.

Reads demo/demo_cells.json and appends cells one at a time to cells.json with
a configurable interval. The renderer polls cells.json and animates new cells
as they arrive — so this produces a live-mint visual during screen capture.

Usage:
    cd ~/Documents/lucida
    python demo/replay.py                        # 6s between cells, default source
    python demo/replay.py --interval 8           # 8s between cells
    python demo/replay.py --source demo/demo_cells.json --interval 5
    python demo/replay.py --reset                # clear cells.json back to demo baseline

Run in background while recording:
    python demo/replay.py --interval 6 &
    bash demo/record.sh
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

ROOT = Path(__file__).parent.parent
CELLS_PATH = ROOT / "cells.json"
DEFAULT_SOURCE = Path(__file__).parent / "demo_cells.json"


def load_cells() -> dict:
    if not CELLS_PATH.exists():
        return {"session_id": "lucida-demo", "cells": []}
    try:
        return json.loads(CELLS_PATH.read_text())
    except (json.JSONDecodeError, OSError):
        return {"session_id": "lucida-demo", "cells": []}


def save_cells(data: dict) -> None:
    CELLS_PATH.write_text(json.dumps(data, indent=2) + "\n")


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help="demo cells source (default: demo/demo_cells.json)",
    )
    p.add_argument(
        "--interval", type=float, default=6.0, help="seconds between each cell mint (default: 6)"
    )
    p.add_argument("--reset", action="store_true", help="clear cells.json to empty state and exit")
    p.add_argument(
        "--session",
        default=None,
        help="session_id to write to cells.json (default: from source file)",
    )
    args = p.parse_args()

    if args.reset:
        base = load_cells()
        base["cells"] = []
        save_cells(base)
        print("cells.json cleared.")
        return

    if not args.source.exists():
        print(f"error: {args.source} not found. Run `python demo/make_demo_cells.py` first.")
        raise SystemExit(1)

    source = json.loads(args.source.read_text())
    demo_cells = source.get("cells", [])
    session_id = args.session or source.get("session_id", "lucida-demo")

    if not demo_cells:
        print("error: no cells in source file.")
        raise SystemExit(1)

    # Start from a clean state — remove all cells from the demo session_id
    # so the renderer starts blank and cells trickle in during replay.
    live = load_cells()
    demo_ids = {c["id"] for c in demo_cells}
    live["cells"] = [
        c
        for c in live.get("cells", [])
        if c.get("session_id") != session_id and c.get("id") not in demo_ids
    ]
    live["session_id"] = session_id
    save_cells(live)

    print(f"Dripping {len(demo_cells)} cells into cells.json (interval={args.interval}s)")
    print("Press Ctrl-C to stop early.\n")

    for i, cell in enumerate(demo_cells, 1):
        live = load_cells()
        live["cells"].append(cell)
        save_cells(live)
        print(
            f"  [{i:2d}/{len(demo_cells)}] {cell.get('cell_type', '')} — {cell.get('title', '')[:50]}"
        )
        if i < len(demo_cells):
            time.sleep(args.interval)

    print(f"\nDone — {len(demo_cells)} cells in cells.json.")


if __name__ == "__main__":
    main()
