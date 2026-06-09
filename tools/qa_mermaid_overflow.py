"""Auto-QA pass for mermaid SVG cache: detect text overflow inside node rects.

For each cells/<id>.mermaid.<colspan>.<ver>.svg, parse every <g class="node">
group, extract the label-container rect width, and compare against the
estimated rendered width of the inner tspans at the SVG's effective font.

Outputs a sorted offender list: cells with the worst overflow ratio first.

Usage:
    python3 tools/qa_mermaid_overflow.py [--threshold 1.05] [--limit 20]
"""

from __future__ import annotations

import argparse
import glob
import os
import re
from collections import namedtuple
from pathlib import Path

Node = namedtuple("Node", "cell node_id rect_w text overflow_ratio")

# Heuristic char-width for Eurostile at the default mermaid 16px node font.
# Measured empirically: Eurostile bold caps ~8.5px/char at 16px; mixed-case
# words ~7.5px/char. Use 8.0 as a balanced estimate.
CHAR_W_AT_16 = 8.0
DEFAULT_FONT_PX = 16


def estimate_text_w(text: str, font_px: float = DEFAULT_FONT_PX) -> float:
    return len(text) * CHAR_W_AT_16 * (font_px / DEFAULT_FONT_PX)


def scan(svg_path: str) -> list[Node]:
    cell = svg_path.rsplit("/", 1)[-1].split(".mermaid.")[0]
    with open(svg_path) as f:
        s = f.read()
    out: list[Node] = []
    # Each <g class="node ..." data-id="X" ...><rect class="basic label-container" ... width="W" .../>
    #   <g class="label" ...><rect></rect><text ...><tspan ...>line</tspan>...</text></g></g>
    node_pat = re.compile(
        r'<g class="node[^"]*"[^>]*data-id="([^"]+)"[^>]*>(.*?)</g>\s*</g>',
        re.DOTALL,
    )
    rect_pat = re.compile(r'<rect class="basic label-container"[^>]*\bwidth="([0-9.]+)"')
    tspan_pat = re.compile(r"<tspan[^>]*>([^<]*)</tspan>")
    for m in node_pat.finditer(s):
        node_id, inner = m.group(1), m.group(2)
        rm = rect_pat.search(inner)
        if not rm:
            continue
        rect_w = float(rm.group(1))
        lines = [ln for ln in tspan_pat.findall(inner) if ln.strip()]
        if not lines:
            continue
        widest = max(lines, key=len)
        text_w = estimate_text_w(widest)
        # Padding allowance: mermaid pads each side by ~8px. Allow 1.0x rect_w
        # as the budget. Below 1.0 = fits; > 1.0 = overflow.
        overflow = text_w / max(1.0, rect_w - 16)
        out.append(Node(cell, node_id, rect_w, widest, overflow))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--threshold", type=float, default=1.0, help="overflow_ratio > THRESHOLD = flagged"
    )
    ap.add_argument("--limit", type=int, default=30)
    # Default to ./cells relative to the repo root (the conventional location
    # for mermaid SVG output). Override via --dir or LUCIDA_CELLS_DIR.
    default_dir = os.environ.get(
        "LUCIDA_CELLS_DIR",
        str(Path(__file__).resolve().parent.parent / "cells"),
    )
    ap.add_argument("--dir", default=default_dir)
    args = ap.parse_args()
    files = glob.glob(f"{args.dir}/*.mermaid.*.svg")
    print(f"scanning {len(files)} mermaid SVGs")
    all_nodes: list[Node] = []
    for fp in files:
        try:
            all_nodes.extend(scan(fp))
        except Exception as e:
            print(f"  ! {fp}: {e}")
    print(f"parsed {len(all_nodes)} nodes total")
    over = [n for n in all_nodes if n.overflow_ratio > args.threshold]
    over.sort(key=lambda n: n.overflow_ratio, reverse=True)
    print(f"flagged {len(over)} nodes (threshold={args.threshold})")
    print()
    print(f"{'cell':18s}  {'node':12s}  {'rect':>6s}  {'ratio':>6s}  text")
    print("-" * 100)
    for n in over[: args.limit]:
        # Trim the text to fit terminal nicely.
        t = n.text if len(n.text) <= 56 else n.text[:53] + "..."
        print(f"{n.cell:18s}  {n.node_id:12s}  {n.rect_w:>6.0f}  {n.overflow_ratio:>6.2f}  {t}")
    if len(over) > args.limit:
        print(f"... +{len(over) - args.limit} more")
    # Per-cell summary
    by_cell: dict[str, int] = {}
    for n in over:
        by_cell[n.cell] = by_cell.get(n.cell, 0) + 1
    print()
    print(f"cells with any overflow: {len(by_cell)} of {len(set(n.cell for n in all_nodes))}")
    if by_cell:
        top = sorted(by_cell.items(), key=lambda kv: kv[1], reverse=True)[:10]
        print("worst-offending cells (count of overflowing nodes):")
        for c, n in top:
            print(f"  {c}: {n}")


if __name__ == "__main__":
    main()
