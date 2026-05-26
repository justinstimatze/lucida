"""Cull over-represented cells from cells.json to rebalance substrate mix.

Drops two sets:
  1. Awaiting-generation cells whose cell_type is over-represented
     (html, timeline_ribbon, mermaid). Under-represented substrates with
     "(awaiting generation)" tags are KEPT so future backfill can
     populate them.
  2. The N oldest mermaid cells that already have a spec — to lower
     mermaid's overall share toward parity with html.

Writes cells.json atomically via tools.atomic_state. The pre-cull
state lands in a `.bak` next to cells.json so a botched cull is
recoverable.

Usage:
    uv run python tools/rebalance_cull.py --dry-run
    uv run python tools/rebalance_cull.py
    uv run python tools/rebalance_cull.py --mermaid-keep 500
    uv run python tools/rebalance_cull.py --over-represented html,timeline_ribbon
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from tools.atomic_state import atomic_write_json, state_lock  # noqa: E402

AWAITING_MARKER = "(awaiting generation)"
DEFAULT_OVER_REPRESENTED = ("html", "timeline_ribbon", "mermaid")
DEFAULT_MERMAID_KEEP = 500


def cell_id_num(c: dict) -> int:
    """Sort key: numeric portion of cell-NNNN ids. Older = lower."""
    cid = c.get("id", "")
    try:
        return int(cid.split("-", 1)[1])
    except (IndexError, ValueError):
        return 10**9


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="report counts; write nothing")
    parser.add_argument(
        "--over-represented",
        default=",".join(DEFAULT_OVER_REPRESENTED),
        help=(
            "comma-separated cell_types whose awaiting cells are eligible "
            f"for cull (default: {','.join(DEFAULT_OVER_REPRESENTED)})"
        ),
    )
    parser.add_argument(
        "--mermaid-keep",
        type=int,
        default=DEFAULT_MERMAID_KEEP,
        help=f"how many oldest mermaid cells (w/ spec) to keep (default: {DEFAULT_MERMAID_KEEP})",
    )
    args = parser.parse_args()
    over = tuple(t.strip() for t in args.over_represented.split(",") if t.strip())
    cells_json = REPO_ROOT / "cells.json"
    lock_path = REPO_ROOT / "cells.json.lock"
    bak_path = cells_json.with_suffix(".json.bak-pre-rebalance-cull")

    with state_lock(lock_path):
        with cells_json.open() as f:
            data = json.load(f)
        cells = data.get("cells")
        if not isinstance(cells, list):
            print("[rebalance-cull] cells.json missing 'cells' list", file=sys.stderr)
            return 1

        n_before = len(cells)
        before_by_type = Counter(c.get("cell_type") for c in cells)

        cull_ids: set[str] = set()

        # 1. Awaiting cells in over-represented substrates.
        n_aw_drop = 0
        for c in cells:
            if c.get("cell_type") not in over:
                continue
            if AWAITING_MARKER not in (c.get("notes") or ""):
                continue
            cull_ids.add(c.get("id"))
            n_aw_drop += 1

        # 2. Oldest mermaid cells with a spec, beyond keep limit.
        mermaid_with_spec = [
            c
            for c in cells
            if c.get("cell_type") == "mermaid"
            and AWAITING_MARKER not in (c.get("notes") or "")
            and c.get("spec")
            and c.get("spec") != "None"
            and c.get("id") not in cull_ids
        ]
        mermaid_with_spec.sort(key=cell_id_num)
        n_mermaid_drop = max(0, len(mermaid_with_spec) - args.mermaid_keep)
        for c in mermaid_with_spec[:n_mermaid_drop]:
            cull_ids.add(c.get("id"))

        kept = [c for c in cells if c.get("id") not in cull_ids]
        n_after = len(kept)
        after_by_type = Counter(c.get("cell_type") for c in kept)

        print(f"[rebalance-cull] before: {n_before} cells")
        print(f"[rebalance-cull]   awaiting culled (over-rep substrates): {n_aw_drop}")
        print(
            f"[rebalance-cull]   mermaid culled (oldest beyond keep={args.mermaid_keep}): {n_mermaid_drop}"
        )
        print(f"[rebalance-cull]   total to drop: {len(cull_ids)}")
        print(f"[rebalance-cull] after: {n_after} cells")
        print()
        print("[rebalance-cull] distribution (before → after):")
        all_types = sorted(
            set(before_by_type) | set(after_by_type), key=lambda t: -before_by_type[t]
        )
        for ct in all_types:
            b = before_by_type[ct]
            a = after_by_type[ct]
            bp = 100.0 * b / max(1, n_before)
            ap = 100.0 * a / max(1, n_after)
            mark = "  " if b == a else " *"
            print(f"  {mark}{ct:>18s}  {b:4d} ({bp:4.1f}%) → {a:4d} ({ap:4.1f}%)")

        if args.dry_run:
            print("\n[rebalance-cull] dry-run; no write")
            return 0

        # Backup pre-state.
        bak_path.write_text(json.dumps(data, indent=2))
        print(f"\n[rebalance-cull] backup → {bak_path.name}")

        data["cells"] = kept
        atomic_write_json(cells_json, data)
        print(f"[rebalance-cull] wrote {cells_json.name} ({n_after} cells)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
