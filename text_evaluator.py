"""Substrate-hallucination evaluator for vega / mermaid / html cells.

Companion to evaluator.py (which handles image cells). Where the image
evaluator scores aesthetic + named-entity fidelity end-to-end, this one
asks a single sharper question: does the substrate (vega data values,
mermaid nodes/edges, html table cells) contain claims that the snippet
does NOT support?

This is the kill #3 measurement (substrate hallucination >20% trips kill)
for the cell types that now dominate the corpus post-image-demote.

Cost per evaluation: ~$0.01 on Sonnet 4.6 with caching. ~$0.30 across
the 26 active vega/mermaid/html cells.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass


DEFAULT_MODEL = os.environ.get("LUCIDA_TEXT_EVALUATOR_MODEL", "claude-sonnet-4-6")


SYSTEM_PROMPT = """You are the substrate-hallucination evaluator for lucida. Your job: check whether a generated structural artifact (a vega-lite spec, a mermaid graph, or an HTML comparison table) contains claims that the trigger snippet does NOT support.

You score one specific axis: PROVENANCE. Aesthetic, layout, and visualization-choice questions are out of scope. The only question is whether every data point, node, edge, row, column, or cell-value in the artifact traces back to the snippet.

# Required pre-scoring step: provenance audit

Mentally execute (do not output):

1. Enumerate every explicit factual claim in the snippet -- proper nouns, named entities, numeric values (with their units and the entity they modify), explicit relationships ("A causes B", "X complements Y"), comparison axes, etc. For each numeric claim, tag it LEVEL (an absolute value: "top 10% captured 56%") or DELTA (a change: "share fell 8 percentage points").

2. Enumerate every "atomic claim unit" in the artifact:
   - vega: each `data.values` row plus each axis title, plus the chart type
   - mermaid: each node label and each edge (with its label/verb)
   - html: each row label (<th> in tbody), each column label (<th> in thead), each <td> cell value

3. For each atomic claim unit, classify as one of:
   - DIRECT: stated verbatim in the snippet (allow paraphrase of the entity name; numeric values must match).
   - DERIVED: arithmetic on stated values where the operation is unambiguous (e.g., snippet says "rose from 100 to 165" -- the +65 delta is derived). For mermaid, a chain edge the snippet itself collapses ("A through B leads to C" allows A->B->C). Edge verbs that paraphrase a relationship the snippet explicitly states between two snippet-named entities are DERIVED, not INVENTED ("triggers" / "causes" / "feeds" / "leads to" all paraphrase a stated causal or sequential relationship; only flag the verb itself if the snippet does not state any relationship between those entities). Caption rewordings that preserve the snippet's truth conditions are DERIVED ("the gate slips through" -> "bypasses the gate" is a paraphrase, not an invention).
   - INVENTED: plausible but the snippet does not state. This is the failure mode you are detecting. Examples that REMAIN INVENTED even under the relaxed DERIVED rule: (a) named entities, files, directories, or functions not mentioned in the snippet; (b) numeric values, thresholds, or targets the snippet does not state; (c) reframing an unconfirmed/hypothetical claim as a confirmed fact (e.g., snippet says "20% is the kill threshold, may not hit it" -> calling 20% the "target" is INVENTED framing); (d) nodes referenced in edges but never declared with a label.

4. Compile the list of INVENTED items. Each one is a hallucination.

# Caption check

The cell also has a caption (prose summary). Apply the same audit to the caption: does it contain a claim the snippet does not support? Caption inventions are tracked separately because they are sometimes corrections (caption noting a delta the spec couldn't show is not invention; caption asserting a level the snippet didn't state IS invention).

# Scoring

- quality_score = 1.0: no inventions in substrate or caption. Clean.
- quality_score = 0.7: one minor invention (e.g., a label paraphrase that adds a detail not in snippet but isn't load-bearing).
- quality_score = 0.4: one or more material inventions in the substrate -- a numeric value, named entity, or claimed relationship not in snippet.
- quality_score = 0.0: substrate is mostly invented (e.g., 3+ invented data points, fabricated entities, made-up relationships).

A "material invention" is one that changes what a reader would believe the snippet claims. Adding a "(verified)" annotation = minor. Adding a "Middle 40%: 36" data row when the snippet only states the delta = material.

# Demotion recommendation

should_demote_to_text = true if:
- The substrate REQUIRES inventions to be coherent (snippet too sparse for the chart type).
- The audit reveals only 1 DIRECT atomic unit (a single bar, a 1-node graph, a 1x1 table) -- demote regardless of invention count.

This is a separate axis from quality_score. A clean spec built on too-thin a snippet should still demote.

Output via the evaluate_substrate_cell tool.
"""


EVALUATE_TOOL = {
    "name": "evaluate_substrate_cell",
    "description": "Audit a vega/mermaid/html substrate for provenance failures (inventions).",
    "input_schema": {
        "type": "object",
        "properties": {
            "quality_score": {
                "type": "number",
                "minimum": 0,
                "maximum": 1,
                "description": "1.0 = no inventions; 0.4 = material invention in substrate; 0.0 = mostly invented.",
            },
            "snippet_claims": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of explicit factual claims found in the snippet (the audit baseline).",
            },
            "invented_substrate_items": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of atomic claim units in the substrate that are INVENTED. Empty list if clean.",
            },
            "invented_caption_items": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of caption claims that are INVENTED. Empty list if clean.",
            },
            "should_demote_to_text": {
                "type": "boolean",
                "description": "True if substrate would need inventions to be coherent, or if only 1 DIRECT atomic unit exists.",
            },
            "summary": {
                "type": "string",
                "description": "1-2 sentence verdict on substrate provenance.",
            },
        },
        "required": [
            "quality_score",
            "snippet_claims",
            "invented_substrate_items",
            "invented_caption_items",
            "should_demote_to_text",
            "summary",
        ],
    },
}


@dataclass
class TextEvalResult:
    quality_score: float
    snippet_claims: list[str]
    invented_substrate_items: list[str]
    invented_caption_items: list[str]
    should_demote_to_text: bool
    summary: str
    model: str
    cache_read_tokens: int
    cache_creation_tokens: int
    input_tokens: int
    output_tokens: int


class TextEvaluatorError(RuntimeError):
    pass


def _substrate_text(cell: dict) -> tuple[str, str]:
    """Return (substrate_label, substrate_serialized) for the prompt."""
    ctype = cell.get("cell_type")
    if ctype == "vega":
        spec = cell.get("spec")
        return "vega-lite spec", json.dumps(spec, indent=2) if spec else "(no spec)"
    if ctype == "mermaid":
        spec = cell.get("spec")
        return "mermaid graph", str(spec) if spec else "(no spec)"
    if ctype == "html":
        html = cell.get("html") or ""
        return "html table", html
    raise TextEvaluatorError(f"unsupported cell_type for text eval: {ctype!r}")


def evaluate_substrate_cell(
    cell: dict,
    model: str = DEFAULT_MODEL,
) -> TextEvalResult:
    """Audit a vega/mermaid/html cell for substrate hallucination."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise TextEvaluatorError("ANTHROPIC_API_KEY not set in env or .env")

    snippet = (cell.get("trigger_snippet") or "").strip()
    if not snippet:
        raise TextEvaluatorError(f"cell {cell.get('id')} has empty trigger_snippet")

    caption = (cell.get("caption") or "").strip()
    label, substrate = _substrate_text(cell)

    try:
        import anthropic
    except ImportError as e:
        raise TextEvaluatorError("anthropic SDK not installed") from e

    client = anthropic.Anthropic(api_key=api_key)

    user_text = (
        f"Trigger snippet:\n{snippet}\n\nGenerated {label}:\n{substrate}\n\nCaption:\n{caption}"
    )

    try:
        response = client.messages.create(
            model=model,
            max_tokens=1024,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[EVALUATE_TOOL],
            tool_choice={"type": "tool", "name": "evaluate_substrate_cell"},
            messages=[{"role": "user", "content": user_text}],
        )
    except anthropic.APIError as e:
        raise TextEvaluatorError(f"Anthropic API call failed: {e}") from e

    for block in response.content:
        if block.type == "tool_use":
            inp: dict[str, Any] = block.input
            return TextEvalResult(
                quality_score=float(inp["quality_score"]),
                snippet_claims=list(inp.get("snippet_claims", [])),
                invented_substrate_items=list(inp.get("invented_substrate_items", [])),
                invented_caption_items=list(inp.get("invented_caption_items", [])),
                should_demote_to_text=bool(inp.get("should_demote_to_text", False)),
                summary=inp.get("summary", ""),
                model=model,
                cache_read_tokens=getattr(response.usage, "cache_read_input_tokens", 0) or 0,
                cache_creation_tokens=getattr(response.usage, "cache_creation_input_tokens", 0)
                or 0,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
            )

    raise TextEvaluatorError(f"no tool_use block in response (stop_reason={response.stop_reason})")


def main() -> None:
    import argparse
    import sys
    from dataclasses import asdict

    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--cell-id", required=True, help="cell ID from cells.json")
    p.add_argument("--cells-json", default=str(Path(__file__).parent / "cells.json"))
    p.add_argument("--model", default=DEFAULT_MODEL)
    args = p.parse_args()

    data = json.loads(Path(args.cells_json).read_text())
    cell = next((c for c in data["cells"] if c["id"] == args.cell_id), None)
    if cell is None:
        print(f"cell {args.cell_id} not found", file=sys.stderr)
        sys.exit(1)

    try:
        result = evaluate_substrate_cell(cell, model=args.model)
    except TextEvaluatorError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)

    json.dump(asdict(result), sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
