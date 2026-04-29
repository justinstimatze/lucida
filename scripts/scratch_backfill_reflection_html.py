"""One-shot backfill: convert text-type reflection cells to html-type.

Existing reflection cells were minted before orchestrator.reflect_and_persist
was rewired to produce html. This script:
  - finds active reflection cells (cell_type=text, reflection_source_ids set)
  - rebuilds the html field as a table of source cells
  - splits the concatenated caption into a synthesis section + footer blocks
    (best-effort -- the original caption uses recognizable headers like
    "What worked:", "What didn't:", "Proposed next ...:")
  - sets cell_type = "html"
  - leaves caption as the synthesis-only sentence(s)

No LLM calls. Free. Idempotent — running twice is a no-op.

Usage:
  python scratch_backfill_reflection_html.py            # dry-run
  python scratch_backfill_reflection_html.py --commit   # write
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

REPO = Path(__file__).parent
CELLS_JSON = REPO / "cells.json"


def _esc(s: object) -> str:
    return (str(s or "")
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;"))


def split_caption(caption: str) -> dict:
    """Best-effort split of the original concatenated caption into parts.
    Original format from the pre-rewire reflect_and_persist:
      <reflection>\n\n
      [What worked: <text>\n\n]
      [What didn't: <text>\n\n]
      [Proposed next (<type>): <snippet>]
    """
    parts = {"synthesis": "", "worked": "", "didnt": "", "proposed": ""}
    if not caption:
        return parts

    # Find anchored markers; use them to split.
    markers = [
        ("worked",   re.compile(r"\n\nWhat worked:\s*", re.I)),
        ("didnt",    re.compile(r"\n\nWhat didn'?t:\s*", re.I)),
        ("proposed", re.compile(r"\n\nProposed next[^:]*:\s*", re.I)),
    ]
    cursor = caption
    found_indices = []
    for key, rx in markers:
        m = rx.search(cursor)
        if m:
            found_indices.append((key, m.start(), m.end()))

    found_indices.sort(key=lambda t: t[1])

    if not found_indices:
        parts["synthesis"] = caption.strip()
        return parts

    parts["synthesis"] = cursor[:found_indices[0][1]].strip()
    for i, (key, _start, hdr_end) in enumerate(found_indices):
        next_start = found_indices[i + 1][1] if i + 1 < len(found_indices) else len(cursor)
        parts[key] = cursor[hdr_end:next_start].strip()
    return parts


def build_html(parts: dict, source_ids: list[str], by_id: dict) -> str:
    rows = []
    for sid in source_ids:
        sc = by_id.get(sid)
        if sc is None:
            continue
        sc_type = _esc(sc.get("cell_type", ""))
        sc_caption = _esc((sc.get("caption") or sc.get("trigger_snippet") or "")[:140])
        rows.append(
            f"<tr><td>{_esc(sid)}</td><td>{sc_type}</td><td>{sc_caption}</td></tr>"
        )

    footer = []
    if parts["worked"]:
        footer.append(f"<p><strong>worked:</strong> {_esc(parts['worked'])}</p>")
    if parts["didnt"]:
        footer.append(f"<p><strong>didn&#39;t:</strong> {_esc(parts['didnt'])}</p>")
    if parts["proposed"]:
        footer.append(f"<p><strong>proposed next:</strong> {_esc(parts['proposed'])}</p>")

    return (
        "<table>"
        "<thead><tr><th>source</th><th>type</th><th>caption</th></tr></thead>"
        f"<tbody>{''.join(rows)}</tbody>"
        "</table>"
        + "".join(footer)
    )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--commit", action="store_true", help="write cells.json")
    args = ap.parse_args()

    data = json.loads(CELLS_JSON.read_text())
    cells = data["cells"]
    by_id = {c.get("id"): c for c in cells}

    targets = [
        c for c in cells
        if c.get("reflection_source_ids")
        and not c.get("replaced_by")
        and c.get("cell_type") == "text"
    ]
    print(f"# {len(targets)} reflection cells to backfill")

    for c in targets:
        parts = split_caption(c.get("caption") or "")
        html = build_html(parts, c.get("reflection_source_ids") or [], by_id)
        if not args.commit:
            print(f"\n  {c['id']}: synthesis={parts['synthesis'][:80]!r}")
            print(f"    worked   = {parts['worked'][:60]!r}")
            print(f"    didnt    = {parts['didnt'][:60]!r}")
            print(f"    proposed = {parts['proposed'][:60]!r}")
            print(f"    html-len = {len(html)}")
            continue
        c["cell_type"] = "html"
        c["caption"] = parts["synthesis"]
        c["html"] = html
        old_notes = c.get("notes", "") or ""
        c["notes"] = (old_notes + " [backfilled to html cell-type 2026-04-28]").strip()

    if not args.commit:
        print("\n# DRY RUN — pass --commit to write")
        return

    CELLS_JSON.write_text(json.dumps(data, indent=2) + "\n")
    print(f"\n# wrote {CELLS_JSON}; rewrote {len(targets)} reflection cells to html")


if __name__ == "__main__":
    main()
