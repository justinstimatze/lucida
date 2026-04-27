"""lucida orchestrator — v0.

Given a conversation snippet + optional context, classify what cell
type to produce and build the prompt for the appropriate specialist.
With --generate, image cells are actually generated via nano_banana.
Vega/Mermaid spec generation is stubbed in v0 — fill in `spec` manually
until LLM specialists land in v0.5.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from textwrap import dedent


CELLS_PATH = Path(__file__).parent / "cells.json"


@dataclass
class CellProposal:
    id: str
    timestamp: str
    cell_type: str          # image | vega | mermaid | html | text
    trigger_snippet: str
    prompt: str
    # one of these populated depending on cell_type
    image_path: str | None = None
    spec: object | None = None
    html: str | None = None
    caption: str = ""
    notes: str = ""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def next_id(cells: list[dict]) -> str:
    n = len(cells) + 1
    return f"cell-{n:04d}"


def classify(snippet: str) -> str:
    """v0 placeholder classifier — keyword heuristics only.

    Real version will call Claude. For v0 we want to see how often a
    naive classifier would have made the right call so we can compare
    against the LLM later.
    """
    s = snippet.lower()
    if any(k in s for k in ["graph", "network", "topology", "relationship", "depends on", "cites"]):
        return "mermaid"
    if any(k in s for k in ["chart", "trend", "distribution", "percentage", "%", "gap", "vs."]):
        return "vega"
    if any(k in s for k in ["scene", "image", "picture", "looks like", "visualize literally", "evoke"]):
        return "image"
    if any(k in s for k in ["matrix", "heatmap", "table", "grid"]):
        return "html"
    return "text"


def build_prompt(cell_type: str, snippet: str, context: str = "") -> str:
    if cell_type == "mermaid":
        return dedent(f"""
            Produce a Mermaid diagram (graph LR or flowchart, no extra text)
            illustrating the structure described below. Keep it readable; ≤12
            nodes; label edges where it adds clarity.

            Snippet:
            {snippet}

            Context:
            {context or '(none)'}
        """).strip()
    if cell_type == "vega":
        return dedent(f"""
            Produce a Vega-Lite v5 spec (JSON only, no commentary) that
            visualizes the quantitative claim described below. Use real
            numbers from the snippet — do not invent values.

            Snippet:
            {snippet}

            Context:
            {context or '(none)'}
        """).strip()
    if cell_type == "image":
        return dedent(f"""
            (nano banana prompt)
            Conceptual scene illustrating: {snippet}
            Style: warm, restrained, low-saturation, painterly.
            No text, no captions in the image.

            Context:
            {context or '(none)'}
        """).strip()
    if cell_type == "html":
        return dedent(f"""
            Produce an HTML <table> (no inline styles; CSS is in
            notebook.css) that surfaces the comparison described below.

            Snippet:
            {snippet}

            Context:
            {context or '(none)'}
        """).strip()
    return dedent(f"""
        Caption only — no chart, no diagram. Summarize the snippet in
        ≤2 sentences as the cell content.

        Snippet:
        {snippet}
    """).strip()


def load_cells() -> dict:
    if not CELLS_PATH.exists():
        return {"session_id": "leg5-v0", "cells": []}
    return json.loads(CELLS_PATH.read_text())


def append_proposal(snippet: str, context: str = "", cell_type: str | None = None,
                    write: bool = False, generate_image: bool = False) -> CellProposal:
    data = load_cells()
    chosen_type = cell_type or classify(snippet)
    cell_id = next_id(data["cells"])
    proposal = CellProposal(
        id=cell_id,
        timestamp=now_iso(),
        cell_type=chosen_type,
        trigger_snippet=snippet.strip(),
        prompt=build_prompt(chosen_type, snippet, context),
        notes="(awaiting generation)",
    )

    if generate_image and chosen_type == "image":
        import nano_banana
        out = Path(__file__).parent / "cells" / f"{cell_id}.png"
        try:
            result = nano_banana.generate(proposal.prompt, out)
            proposal.image_path = f"cells/{out.name}"
            proposal.notes = f"generated via {result.model} ({result.bytes_written} bytes)"
        except nano_banana.NanoBananaError as e:
            proposal.notes = f"generation failed: {e}"

    if write:
        data["cells"].append(asdict(proposal))
        CELLS_PATH.write_text(json.dumps(data, indent=2))
    return proposal


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--snippet", required=True, help="conversation excerpt that triggers a cell")
    p.add_argument("--context", default="", help="optional extra context (file paths, prior cells, etc.)")
    p.add_argument("--type", default=None, choices=["image", "vega", "mermaid", "html", "text"],
                   help="force a cell type; default = naive classifier")
    p.add_argument("--write", action="store_true", help="append the proposal to cells.json")
    p.add_argument("--generate", action="store_true",
                   help="for image cells, actually call nano banana to generate")
    args = p.parse_args()

    proposal = append_proposal(args.snippet, args.context, args.type, args.write, args.generate)
    json.dump(asdict(proposal), sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
