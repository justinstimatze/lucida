#!/usr/bin/env python3
"""Re-mint the animated_svg cells of a curated demo with GSAP timelines.

Curated demo cells (demo/demo_cells.json, or one session in cells.json)
predate declarative motion timelines: their animated_svg specs are SMIL
only. This re-runs the current animated_svg specialist on each such
cell's trigger snippet and swaps in the new spec + motion + caption,
leaving every other cell (and the order, ids, titles) untouched, so a
re-recorded demo walks through the same story with the new motion.

Costs one specialist call per animated_svg cell (a few cents total).

    python demo/remint_motion.py                      # demo/demo_cells.json in place
    python demo/remint_motion.py --dry-run            # list what would change
    python demo/remint_motion.py --source demo/demo_cells.json --out /tmp/x.json
    python demo/remint_motion.py --convert mermaid    # also turn these types into
                                                      # animated_svg where the
                                                      # specialist finds motion

The previous spec is kept under attempted_spec so nothing is lost.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from specialists import generate_animated_svg_spec  # noqa: E402

DEFAULT_SOURCE = Path(__file__).parent / "demo_cells.json"


def _cells(doc):
    return doc["cells"] if isinstance(doc, dict) else doc


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    p.add_argument("--out", type=Path, help="write here instead of overwriting --source")
    p.add_argument(
        "--convert",
        nargs="*",
        default=[],
        metavar="TYPE",
        help="also offer cells of these types to the animated_svg specialist",
    )
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    doc = json.loads(args.source.read_text())
    targets = [
        c
        for c in _cells(doc)
        if c.get("cell_type") == "animated_svg" or c.get("cell_type") in args.convert
    ]
    print(f"{len(targets)} cell(s) to re-mint from {args.source}", file=sys.stderr)
    changed = 0
    for c in targets:
        label = f"{c.get('id')} [{c.get('cell_type')}] {(c.get('title') or '')[:50]}"
        if args.dry_run:
            print(f"  would re-mint {label}", file=sys.stderr)
            continue
        try:
            r = generate_animated_svg_spec(c.get("trigger_snippet") or "", c.get("caption") or "")
        except Exception as e:  # keep going; one bad call shouldn't sink the demo
            print(f"  FAILED {label}: {e}", file=sys.stderr)
            continue
        if r.should_demote_to_text or not r.motion:
            print(f"  kept   {label} (no timeline: {r.demotion_reason or 'none'})", file=sys.stderr)
            continue
        c["attempted_cell_type"] = c.get("cell_type")
        c["attempted_spec"] = c.get("spec") if c.get("spec") is not None else c.get("html")
        c["cell_type"] = "animated_svg"
        c["spec"] = r.spec
        c["html"] = None
        c["motion"] = r.motion
        c["caption"] = r.caption or c.get("caption", "")
        c["notes"] = (c.get("notes") or "") + f" [remint_motion: {len(r.motion['steps'])} steps]"
        changed += 1
        print(f"  ok     {label} ({len(r.motion['steps'])} steps)", file=sys.stderr)

    if not args.dry_run:
        out = args.out or args.source
        out.write_text(json.dumps(doc, indent=2) + "\n")
        print(f"{changed} re-minted -> {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
