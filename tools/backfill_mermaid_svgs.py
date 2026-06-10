"""Pre-render every mermaid cell server-side via Puppeteer + system
Chrome so the browser never invokes mermaid.parse + mermaid.render on
the main thread.

Pipeline:
  cells.json → list mermaid cells without cached v* SVG → pipe a JSON
  batch to tools/render_mermaid.mjs (puppeteer-core + /usr/bin/google-
  chrome) → SVGs written to cells/<id>.mermaid.cN.v*.svg.

Why: client-side mermaid render blocks rAF ~200ms each (profiled
2026-05-25, 122 cells x 206ms avg = 25.1s of main-thread time per
session). Pre-rendering eliminates that - browser only does the
~10ms SVG-to-canvas rasterization, no rAF blocking, no animation
stutter.

Web Worker offload and jsdom both fail structurally (see
memory/mermaid_worker_blocked.md and mermaid_offload_options.md).
Puppeteer is the canonical working path.

Usage:
    uv run python tools/backfill_mermaid_svgs.py
    uv run python tools/backfill_mermaid_svgs.py --batch 50 --force

Sends cells to the node renderer in batches (one Chrome startup per
batch). Default batch=100. Reuses the same Chrome page across all
jobs in a batch.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

# Must match STYLE_V in mixed3d.mjs (_mixed3dRenderMermaidToCanvas)
# and tools/render_mermaid.mjs. Bump all three when CSS changes.
STYLE_V = "v12"


def target_path(cells_dir: Path, cell_id: str, colspan: int) -> Path:
    if colspan > 1:
        return cells_dir / f"{cell_id}.mermaid.c{colspan}.{STYLE_V}.svg"
    return cells_dir / f"{cell_id}.mermaid.{STYLE_V}.svg"


def run_batch(repo_root: Path, jobs: list[dict]) -> tuple[int, int, list[str]]:
    payload = json.dumps(jobs).encode()
    proc = subprocess.run(
        ["node", str(repo_root / "tools" / "render_mermaid.mjs")],
        input=payload,
        capture_output=True,
        cwd=str(repo_root),
        timeout=60 + 8 * len(jobs),
    )
    n_ok = n_fail = 0
    fails: list[str] = []
    for line in proc.stdout.decode().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            result = json.loads(line)
        except json.JSONDecodeError:
            continue
        if result.get("ok"):
            n_ok += 1
        else:
            n_fail += 1
            fails.append(f"{result.get('cellId')}: {result.get('error')}")
    if proc.returncode not in (0, 1):
        stderr = proc.stderr.decode().strip()
        fails.append(f"node exit={proc.returncode}: {stderr[:300]}")
    return n_ok, n_fail, fails


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=int, default=100, help="cells per Chrome session")
    parser.add_argument("--force", action="store_true", help="re-render even if SVG already exists")
    parser.add_argument("--limit", type=int, default=0, help="only render this many (0 = all)")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    cells_json = repo_root / "cells.json"
    cells_dir = repo_root / "cells"
    cells_dir.mkdir(exist_ok=True)
    if not cells_json.exists():
        print(f"[backfill] no cells.json at {cells_json}", file=sys.stderr)
        return 1

    with cells_json.open() as f:
        data = json.load(f)
    cells = data.get("cells") if isinstance(data, dict) else data
    if not isinstance(cells, list):
        print("[backfill] cells.json has no cells list", file=sys.stderr)
        return 1

    todo: list[dict] = []
    n_skip_no_spec = 0
    n_skip_cached = 0
    for c in cells:
        if c.get("cell_type") != "mermaid":
            continue
        spec = c.get("spec")
        if not spec or not isinstance(spec, str):
            n_skip_no_spec += 1
            continue
        cell_id = c.get("id") or c.get("cell_id")
        if not cell_id:
            continue
        colspan = max(1, min(3, int(c.get("colspan") or 1)))
        out = target_path(cells_dir, cell_id, colspan)
        if out.exists() and not args.force:
            n_skip_cached += 1
            continue
        todo.append({"cellId": cell_id, "spec": spec, "colspan": colspan})
        if args.limit and len(todo) >= args.limit:
            break

    if not todo:
        print(f"[backfill] nothing to do (cached={n_skip_cached} no_spec={n_skip_no_spec})")
        return 0
    print(
        f"[backfill] {len(todo)} cells to render "
        f"(cached={n_skip_cached} no_spec={n_skip_no_spec}) batch={args.batch}",
        flush=True,
    )

    total_ok = total_fail = 0
    all_fails: list[str] = []
    for i in range(0, len(todo), args.batch):
        batch = todo[i : i + args.batch]
        try:
            n_ok, n_fail, fails = run_batch(repo_root, batch)
        except subprocess.TimeoutExpired:
            print(f"  batch {i // args.batch + 1} TIMED OUT", file=sys.stderr)
            total_fail += len(batch)
            continue
        total_ok += n_ok
        total_fail += n_fail
        all_fails.extend(fails)
        print(
            f"  batch {i // args.batch + 1}: ok={n_ok} fail={n_fail} "
            f"({total_ok + total_fail}/{len(todo)})",
            flush=True,
        )

    print(f"[backfill] done: ok={total_ok} fail={total_fail}")
    if all_fails:
        print("first few failures:", file=sys.stderr)
        for f in all_fails[:10]:
            print(f"  {f}", file=sys.stderr)
    return 0 if total_fail == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
