"""One-time backfill for cells stuck at "(awaiting generation)".

Many existing cells were minted without --generate, so the classifier
picked vega/mermaid/html but no specialist was called. This script calls
the matching specialist on each cell's trigger_snippet and writes the
result back.

Defaults to vega-only. Pass --types vega,mermaid,html to broaden.

Usage:
  python backfill_specialists.py                           # dry-run, vega only
  python backfill_specialists.py --commit                  # write cells.json
  python backfill_specialists.py --types vega,mermaid      # multi-type
  python backfill_specialists.py --ids cell-0017,cell-0029 # specific cells
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import specialists


REPO = Path(__file__).parent
CELLS_JSON = REPO / "cells.json"

SPECIALIST_FNS = {
    "vega": specialists.generate_vega_spec,
    "mermaid": specialists.generate_mermaid_spec,
    "html": specialists.generate_html_spec,
    "animated_svg": specialists.generate_animated_svg_spec,
}


def find_candidates(cells: list[dict], types: set[str], ids: set[str] | None) -> list[dict]:
    out = []
    for c in cells:
        if c.get("cell_type") not in types:
            continue
        if c.get("replaced_by"):
            continue
        if ids is not None and c["id"] not in ids:
            continue
        # Already-rendered cells: skip unless user explicitly requested by id
        already_rendered = c.get("spec") is not None or c.get("html") is not None
        if already_rendered and ids is None:
            continue
        out.append(c)
    return out


def backfill_cell(cell: dict) -> dict:
    """Run specialist on one cell. Returns mutation dict (does NOT modify cell)."""
    ctype = cell["cell_type"]
    fn = SPECIALIST_FNS[ctype]
    snippet = cell.get("trigger_snippet", "") or ""
    if not snippet.strip():
        return {"id": cell["id"], "status": "no_snippet"}

    try:
        result = fn(snippet)
    except specialists.SpecialistError as e:
        return {"id": cell["id"], "status": "specialist_error", "error": str(e)}

    if result.should_demote_to_text:
        return {
            "id": cell["id"],
            "status": "demoted",
            "from_type": ctype,
            "demotion_reason": result.demotion_reason,
            "caption": result.caption,
        }

    return {
        "id": cell["id"],
        "status": "ok",
        "spec": result.spec,
        "caption": result.caption,
        "model": result.model,
        "tokens_in": result.input_tokens + result.cache_read_tokens + result.cache_creation_tokens,
        "tokens_out": result.output_tokens,
        "ctype": ctype,
    }


def apply_mutation(cell: dict, mut: dict) -> None:
    """Mutate cell in place to reflect specialist output."""
    if mut["status"] == "ok":
        if mut["ctype"] == "html":
            cell["html"] = mut["spec"]
            cell["spec"] = None
        else:
            cell["spec"] = mut["spec"]
        cell["caption"] = mut["caption"]
        old_notes = cell.get("notes", "") or ""
        # Strip prior "(awaiting generation)" if present, append backfill marker
        marker = f"[backfilled via specialist 2026-04-27 ({mut['model']})]"
        if "(awaiting generation)" in old_notes:
            old_notes = old_notes.replace("(awaiting generation)", "(generated)")
        cell["notes"] = (old_notes + " " + marker).strip()
    elif mut["status"] == "demoted":
        cell["cell_type"] = "text"
        cell["caption"] = mut["caption"] or cell.get("caption", "")
        old_notes = cell.get("notes", "") or ""
        marker = f"[backfill demoted {mut['from_type']}→text: {mut['demotion_reason']}]"
        cell["notes"] = (old_notes + " " + marker).strip()


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--types", default="vega",
                   help="comma-sep cell types to backfill (default: vega)")
    p.add_argument("--ids", default=None,
                   help="comma-sep specific cell IDs (overrides type filter to also include rendered cells)")
    p.add_argument("--commit", action="store_true",
                   help="write cells.json (default: dry-run)")
    p.add_argument("--limit", type=int, default=None,
                   help="cap on cells to process (default: all)")
    args = p.parse_args()

    types = {t.strip() for t in args.types.split(",") if t.strip()}
    invalid = types - set(SPECIALIST_FNS)
    if invalid:
        print(f"unknown types: {invalid}; valid: {set(SPECIALIST_FNS)}", file=sys.stderr)
        sys.exit(1)

    ids = {s.strip() for s in args.ids.split(",")} if args.ids else None

    data = json.loads(CELLS_JSON.read_text())
    cells = data["cells"]

    candidates = find_candidates(cells, types, ids)
    if args.limit is not None:
        candidates = candidates[:args.limit]
    print(f"# {len(candidates)} candidate cell(s)", file=sys.stderr)
    for c in candidates:
        snip = (c.get("trigger_snippet", "") or "")[:80].replace("\n", " ")
        print(f"  {c['id']} ({c['cell_type']}): {snip}", file=sys.stderr)

    if not candidates:
        return

    if not args.commit:
        print("\n# DRY RUN — pass --commit to write changes", file=sys.stderr)
        return

    print("\n# running specialists...", file=sys.stderr)
    mutations = []
    for c in candidates:
        print(f"  {c['id']}...", end=" ", file=sys.stderr, flush=True)
        mut = backfill_cell(c)
        mutations.append((c, mut))
        print(mut["status"], file=sys.stderr)

    by_id = {c["id"]: c for c in cells}
    for orig, mut in mutations:
        if mut["status"] in ("ok", "demoted"):
            apply_mutation(by_id[orig["id"]], mut)

    CELLS_JSON.write_text(json.dumps(data, indent=2))
    print(f"\n# wrote {CELLS_JSON}", file=sys.stderr)

    print("\n# summary", file=sys.stderr)
    by_status = {}
    for _, mut in mutations:
        by_status.setdefault(mut["status"], []).append(mut["id"])
    for status, ids_list in by_status.items():
        print(f"  {status}: {len(ids_list)} ({', '.join(ids_list)})", file=sys.stderr)


if __name__ == "__main__":
    main()
