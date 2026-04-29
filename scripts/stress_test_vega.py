"""Stress-test vega specialist's forcing-step on existing backfilled cells.

Runs generate_vega_spec on the snippet for each pre-forcing-step vega cell
and diffs the new spec against the stored one. Looking for: data points
present in old that aren't in snippet (potential prior invention); changes
in axis/encoding shape that suggest prior misinterpretation.

Does NOT write cells.json. Cost: ~$0.09 across 6 cells.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import specialists


REPO = Path(__file__).parent
CELLS_JSON = REPO / "cells.json"
TARGETS = ["cell-0029", "cell-0035", "cell-0070", "cell-0071", "cell-0073", "cell-0064"]


def extract_data_values(spec: dict | None) -> list:
    """Pull data.values rows out of a vega-lite spec, if present."""
    if not isinstance(spec, dict):
        return []
    data = spec.get("data") or {}
    if isinstance(data, dict):
        vals = data.get("values")
        if isinstance(vals, list):
            return vals
    return []


def main() -> None:
    cells = {c["id"]: c for c in json.loads(CELLS_JSON.read_text())["cells"]}

    for cid in TARGETS:
        cell = cells.get(cid)
        if not cell:
            print(f"# {cid}: NOT FOUND", file=sys.stderr)
            continue
        snippet = cell.get("trigger_snippet", "") or ""
        old_spec = cell.get("spec")

        print(f"\n{'=' * 70}", file=sys.stderr)
        print(f"# {cid}", file=sys.stderr)
        print(f"# snippet: {snippet[:200]}", file=sys.stderr)
        print(f"# old data.values: {json.dumps(extract_data_values(old_spec))[:200]}", file=sys.stderr)

        try:
            result = specialists.generate_vega_spec(snippet)
        except specialists.SpecialistError as e:
            print(f"# specialist error: {e}", file=sys.stderr)
            continue

        if result.should_demote_to_text:
            print(f"# DEMOTED → text (reason: {result.demotion_reason})", file=sys.stderr)
            print(f"# new caption: {result.caption}", file=sys.stderr)
            continue

        print(f"# new data.values: {json.dumps(extract_data_values(result.spec))[:200]}", file=sys.stderr)
        print(f"# new caption: {result.caption}", file=sys.stderr)
        print(f"# tokens: in={result.input_tokens + result.cache_read_tokens + result.cache_creation_tokens} out={result.output_tokens}", file=sys.stderr)


if __name__ == "__main__":
    main()
