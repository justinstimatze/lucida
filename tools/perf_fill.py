"""Saturate the dashboard with cloned cells to expose render-perf issues.

Decision 2026-05-03: "we need to make sure we can render smoothly with all
surfaces covered in cells. then we can make the cells look right."

The mixed3d layout has 100 towers x 73 slots = 7,300 surfaces. At ~2,000
cells we fill row 0 only of each tower (~25% saturation); real per-frame
costs (cell-aware fog, distance cull, draw count) only show their teeth
near full saturation. Organic mint produces ~1,000-2,000 cells/day, so
reaching the saturated case naturally takes 4+ days.

This script bypasses the API-gated mint pipeline by CLONING existing
valid cells in cells.json with new IDs and a ``perf_fill: True`` tag.
Substrate distribution mirrors the source corpus, so render paths get
exercised authentically. ``--remove`` deletes every perf_fill cell in
one pass so the corpus snaps back to the organic baseline.

Usage:

  uv run python tools/perf_fill.py --target 7000
  uv run python tools/perf_fill.py --remove
  uv run python tools/perf_fill.py --target 7000 --dry-run

WARNING: cells.json is also written by the lucida supervisor's mint
path. Stop the supervisor (Ctrl-C its terminal, or
``kill -TERM <lucida_watch pid>``) before running so a write race
doesn't drop fresh mints. The script writes atomically, but if the
supervisor flushes between our read and our write we'd lose its
new cells.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CELLS_PATH = ROOT / "cells.json"

# scene3d cells are skipped by the mixed3d layout (each one allocates a
# WebGL context and browsers cap at ~16). Cloning them adds disk + JSON-
# parse cost but no visible perf signal in the layout we're testing.
EXCLUDE_FROM_CLONES = {"scene3d"}


def _is_renderable(cell: dict) -> bool:
    """Filter to cells with content the layout will actually mount."""
    if cell.get("cell_type") in EXCLUDE_FROM_CLONES:
        return False
    if cell.get("perf_fill"):
        return False  # never clone clones — keep distribution honest
    return bool(cell.get("html") or cell.get("spec"))


def _atomic_write(path: Path, data: dict) -> None:
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".perf_fill_", suffix=".json")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, indent=2)
        shutil.move(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
        raise


def fill(target: int, *, dry_run: bool) -> None:
    data = json.loads(CELLS_PATH.read_text())
    cells: list[dict] = data["cells"]
    organic = [c for c in cells if not c.get("perf_fill")]
    sources = [c for c in cells if _is_renderable(c)]
    if not sources:
        print("[perf_fill] no renderable cells to clone from", file=sys.stderr)
        sys.exit(2)

    current = len(cells)
    if current >= target:
        print(f"[perf_fill] already at {current} cells (target {target}); nothing to do")
        return

    needed = target - current
    next_pf_n = (
        max(
            (
                int(c["id"].split("-")[-1])
                for c in cells
                if c.get("perf_fill")
                and c["id"].startswith("cell-pf-")
                and c["id"].split("-")[-1].isdigit()
            ),
            default=0,
        )
        + 1
    )

    clones: list[dict] = []
    for i in range(needed):
        src = sources[i % len(sources)]
        clone = deepcopy(src)
        clone["id"] = f"cell-pf-{next_pf_n + i}"
        clone["perf_fill"] = True
        clone["session_id"] = "perf-fill"
        # Clear linkage fields that referenced the source's siblings —
        # cloning them through would create dangling references.
        clone["replaces"] = None
        clone["replaced_by"] = None
        clone["reflection_source_ids"] = []
        clones.append(clone)

    cells.extend(clones)

    if dry_run:
        from collections import Counter

        dist = Counter(c.get("cell_type") for c in clones)
        print(f"[perf_fill] DRY RUN — would add {len(clones)} cells (organic: {len(organic)})")
        for ct, n in dist.most_common():
            print(f"  {ct}: {n}")
        return

    _atomic_write(CELLS_PATH, data)
    print(f"[perf_fill] +{len(clones)} clones; total now {len(cells)} (organic: {len(organic)})")


def remove(*, dry_run: bool) -> None:
    data = json.loads(CELLS_PATH.read_text())
    before = len(data["cells"])
    organic = [c for c in data["cells"] if not c.get("perf_fill")]
    removed = before - len(organic)
    if removed == 0:
        print("[perf_fill] no perf_fill cells to remove")
        return
    if dry_run:
        print(f"[perf_fill] DRY RUN — would remove {removed} cells, leaving {len(organic)}")
        return
    data["cells"] = organic
    _atomic_write(CELLS_PATH, data)
    print(f"[perf_fill] removed {removed} cells; total now {len(organic)}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--target", type=int, help="fill cells.json until at least N total cells")
    g.add_argument("--remove", action="store_true", help="delete every perf_fill cell")
    p.add_argument("--dry-run", action="store_true", help="describe changes, don't write")
    args = p.parse_args()
    if args.remove:
        remove(dry_run=args.dry_run)
    else:
        fill(args.target, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
