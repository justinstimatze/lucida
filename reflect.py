"""v0.5 reflective loop demo.

Reads back the most recent N visible cells (including PNG bytes for
image cells) and asks Claude to articulate what they collectively
reveal about the conversation -- closing the Wakisaka loop where
generated artifacts re-enter perception and inform the next decision.

What this demonstrates:
- Claude can READ images (it has vision); it cannot generate them.
  That asymmetry is exactly where reflection has traction: the agent
  evaluates what its image-specialist + Gemini collaboration produced
  and adjusts.
- A cell can be both an artifact for human readers AND an input to the
  next agent decision. cell-0010's 'literal Costco' was a finding only
  because we (or Claude) could see it; that observation now propagates
  into the next prompt.

The output is a 'reflection cell': text cell whose caption is Claude's
synthesis, with reflection_source_ids pointing at the cells it read.
The orchestrator persists it like any other cell.

Cost: ~$0.02-0.05 per reflect call, depending on N and image sizes.
Image tokens dominate (~1500/image at 1024-px on Sonnet 4.6).
"""

from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass


DEFAULT_MODEL = os.environ.get("LUCIDA_REFLECT_MODEL", "claude-sonnet-4-6")


SYSTEM_PROMPT = """You are the reflective layer for lucida -- a co-evolving notebook of generated artifacts that accretes alongside conversation.

You will be shown the most recent visible cells in a session. Your job is to:
1. Articulate what these cells collectively reveal about the conversation. What thread is the user pulling on? What has the cell-generating pipeline gotten right or wrong?
2. Propose what kind of cell would naturally come next -- a synthesis, a question that's been left dangling, a counter-example, a quantitative anchor for a structural claim, etc.

This is the Wakisaka loop applied to a notebook: the artifacts re-enter perception and inform the next decision. You can see images that you couldn't have generated -- which means you can evaluate whether the image-specialist + Gemini got the snippet right, and that observation should propagate into your suggestion for the next cell.

# What to look for

- **What the cells say collectively** that no single cell says alone (a thread, a contradiction, a pattern).
- **What the cells got wrong**: image cells that read as generic AI-stock when the snippet wanted specificity; mermaid graphs that read as prose; vega charts on single values; cells where the trivial filter or specialist demoted unfaithfully.
- **What's missing**: the obvious-next-cell that the conversation is leaning toward but hasn't been generated yet.

# The synthesis is itself a cell — pick the right substrate

Reflections used to always render as html (a source-cells table plus footer blocks). That made every reflection look the same regardless of what it was actually saying. Now the reflection cell picks its substrate based on the synthesis content:

- **mermaid**: when the synthesis is *relational* — naming several cells (or threads across them) and the connections between them. "Cells 0042, 0044, 0048 form a chain: A leads to B, B's audit reveals C." A graph with cell-id nodes and labeled relationship edges renders this faster than prose.
- **vega**: when the synthesis is *quantitative* — counting, comparing, or trending across the source cells. "4 of the last 5 cells were html; mermaid usage fell from 60% to 20% across the window." A small bar chart renders this faster than prose.
- **html**: when the synthesis is *genuinely tabular* — a row per source cell, columns of attributes (substrate, what-worked, what-didn't), no relational or quantitative spine. This is the fallback shape, not the default.

Pick the substrate that fits the synthesis you actually have. Don't force a relationship onto cells that just happen to coexist; don't force a number onto a cell list. If neither relationship nor number is there, html is honest.

# Output via the reflect tool

Be specific. Generic observations ('these cells discuss economics') are not useful. Anchor your reflection in things you can point at: a specific image's literalism, a specific mermaid topology, a specific quantitative claim that doesn't have its visual companion yet.

If the cells together reveal a question or tension that no single cell surfaced, name it.

The `synthesis_substrate` you pick must match the `synthesis_spec` you produce:
- mermaid: a string of valid mermaid graph syntax (graph TD ... or flowchart LR ...). Nodes should typically be cell-ids or short thread labels; edges should be the inter-cell relationships you observed.
- vega: a JSON-stringified vega-lite spec (with `data.values`, `mark`, `encoding`). Counts/comparisons across the source cells.
- html: an HTML fragment, typically a `<table>` with `<thead>` and `<tbody>` — same shape as before. Use only when neither relational nor quantitative fits.
"""


REFLECT_TOOL = {
    "name": "reflect",
    "description": "Synthesize what recent lucida cells reveal collectively, and propose the next cell.",
    "input_schema": {
        "type": "object",
        "properties": {
            "reflection": {
                "type": "string",
                "description": "1-3 sentences: what these cells collectively reveal about the conversation.",
            },
            "synthesis_substrate": {
                "type": "string",
                "enum": ["mermaid", "vega", "html"],
                "description": "Which substrate best renders the reflection itself: mermaid (relational), vega (quantitative), or html (tabular fallback). Pick what fits the synthesis content, not a default.",
            },
            "synthesis_spec": {
                "type": "string",
                "description": "The substrate spec rendering the reflection. mermaid: graph syntax string. vega: JSON-stringified vega-lite spec. html: HTML fragment string. Must match synthesis_substrate.",
            },
            "what_worked": {
                "type": "string",
                "description": "Specific observation about which cell(s) successfully grounded the snippet, with reference to cell IDs.",
            },
            "what_didnt_work": {
                "type": "string",
                "description": "Specific observation about which cell(s) failed to ground their snippet (generic AI aesthetic, trivial viz, demotion artifacts), with reference to cell IDs.",
            },
            "proposed_next_cell_type": {
                "type": "string",
                "enum": [
                    "text",
                    "image",
                    "vega",
                    "mermaid",
                    "html",
                    "animated_svg",
                    "scene3d",
                    "treemap",
                    "sparkline",
                    "none",
                ],
                "description": "What kind of cell would naturally come next. 'none' if nothing useful is missing.",
            },
            "proposed_next_snippet": {
                "type": "string",
                "description": "A 1-3 sentence snippet that would seed the proposed next cell. Empty if proposed_next_cell_type is 'none'.",
            },
            "reasoning": {
                "type": "string",
                "description": "Why this is the next move, given what's been generated.",
            },
        },
        "required": [
            "reflection",
            "synthesis_substrate",
            "synthesis_spec",
            "what_worked",
            "what_didnt_work",
            "proposed_next_cell_type",
            "proposed_next_snippet",
            "reasoning",
        ],
    },
}


@dataclass
class ReflectionResult:
    reflection: str
    synthesis_substrate: str
    synthesis_spec: str
    what_worked: str
    what_didnt_work: str
    proposed_next_cell_type: str
    proposed_next_snippet: str
    reasoning: str
    source_ids: list[str]
    model: str
    cache_read_tokens: int
    cache_creation_tokens: int
    input_tokens: int
    output_tokens: int


class ReflectError(RuntimeError):
    pass


def _load_cells(cells_path: Path) -> list[dict]:
    if not cells_path.exists():
        raise ReflectError(f"cells.json not found at {cells_path}")
    return json.loads(cells_path.read_text())["cells"]  # type: ignore[no-any-return]


def _is_visible(cell: dict) -> bool:
    """Match the renderer's filter: skip cells demoted by trivial filter."""
    return not (cell.get("cell_type") == "text" and cell.get("attempted_cell_type"))


def _cell_summary_text(cell: dict) -> str:
    """Compact text representation of a cell for the message."""
    parts = [
        f"--- {cell['id']} ({cell['cell_type']}) ---",
        f"trigger: {cell.get('trigger_snippet', '(none)')[:300]}",
    ]
    if cell.get("caption"):
        parts.append(f"caption: {cell['caption']}")
    if cell.get("notes"):
        parts.append(f"notes: {cell['notes']}")
    if cell.get("classifier_reasoning"):
        parts.append(f"classifier_reasoning: {cell['classifier_reasoning']}")
    if cell.get("attempted_cell_type"):
        parts.append(f"(was demoted from {cell['attempted_cell_type']})")
    if cell.get("cell_type") == "mermaid" and cell.get("spec"):
        parts.append(f"mermaid spec:\n{cell['spec']}")
    elif cell.get("cell_type") == "vega" and cell.get("spec"):
        parts.append(f"vega spec: {json.dumps(cell['spec'])[:600]}")
    elif cell.get("cell_type") == "html" and cell.get("html"):
        parts.append(f"html: {cell['html'][:600]}")
    return "\n".join(parts)


def reflect_on_recent_cells(
    n: int = 5,
    cells_path: Path | None = None,
    model: str = DEFAULT_MODEL,
) -> ReflectionResult:
    """Load last n VISIBLE cells; send as multimodal input to Claude;
    return a structured reflection."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ReflectError("ANTHROPIC_API_KEY not set in env or .env")

    try:
        import anthropic
    except ImportError as e:
        raise ReflectError("anthropic SDK not installed") from e

    if cells_path is None:
        cells_path = Path(__file__).parent / "cells.json"
    all_cells = _load_cells(cells_path)
    visible = [c for c in all_cells if _is_visible(c)]
    if not visible:
        raise ReflectError("no visible cells to reflect on")
    recent = visible[-n:]

    # Build multimodal content: text summary + image bytes for image cells
    content: list[dict] = []
    content.append(
        {
            "type": "text",
            "text": f"Below are the {len(recent)} most recent visible cells (out of {len(visible)} total). Read them, including the images, and reflect.",
        }
    )
    # Resize image cells to a 384-px bounding box before embedding —
    # vision tokens scale with input size, and a 5-cell reflect with
    # all-image cells at 1024x1024 was ~7500 vision tokens (~$0.025
    # per reflection). 384x384 ≈ 240 tokens each, same recognition
    # quality for stylized FUI cells. Pillow is in [image] extras;
    # fall back to raw bytes if unavailable.
    try:
        from io import BytesIO

        from PIL import Image

        _has_pil = True
    except ImportError:
        _has_pil = False
    for cell in recent:
        content.append({"type": "text", "text": _cell_summary_text(cell)})
        if cell.get("cell_type") == "image" and cell.get("image_path"):
            img_path = cells_path.parent / cell["image_path"]
            if img_path.exists() and img_path.suffix.lower() == ".png":
                if _has_pil:
                    with Image.open(img_path) as img:
                        img.thumbnail((384, 384), Image.LANCZOS)
                        buf = BytesIO()
                        img.save(buf, format="PNG", optimize=True)
                        image_bytes = buf.getvalue()
                else:
                    image_bytes = img_path.read_bytes()
                data = base64.standard_b64encode(image_bytes).decode("utf-8")
                content.append(
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": data,
                        },
                    }
                )

    client = anthropic.Anthropic(api_key=api_key)
    try:
        response = client.messages.create(
            model=model,
            max_tokens=2048,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[REFLECT_TOOL],
            tool_choice={"type": "tool", "name": "reflect"},
            messages=[{"role": "user", "content": content}],
        )
    except anthropic.APIError as e:
        raise ReflectError(f"Anthropic API call failed: {e}") from e

    for block in response.content:
        if block.type == "tool_use":
            inp = block.input
            return ReflectionResult(
                reflection=inp.get("reflection", ""),
                synthesis_substrate=inp.get("synthesis_substrate", "html"),
                synthesis_spec=inp.get("synthesis_spec", ""),
                what_worked=inp.get("what_worked", ""),
                what_didnt_work=inp.get("what_didnt_work", ""),
                proposed_next_cell_type=inp.get("proposed_next_cell_type", "none"),
                proposed_next_snippet=inp.get("proposed_next_snippet", ""),
                reasoning=inp.get("reasoning", ""),
                source_ids=[c["id"] for c in recent],
                model=model,
                cache_read_tokens=getattr(response.usage, "cache_read_input_tokens", 0) or 0,
                cache_creation_tokens=getattr(response.usage, "cache_creation_input_tokens", 0)
                or 0,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
            )

    raise ReflectError(f"no tool_use in response (stop_reason={response.stop_reason})")


def main() -> None:
    """CLI for testing the reflective loop in isolation."""
    import argparse
    import sys
    from dataclasses import asdict

    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "-n",
        "--num-cells",
        type=int,
        default=5,
        help="number of recent visible cells to reflect on",
    )
    p.add_argument("--cells-path", default=None, help="override path to cells.json")
    p.add_argument("--model", default=DEFAULT_MODEL)
    args = p.parse_args()

    cells_path = Path(args.cells_path) if args.cells_path else None
    try:
        result = reflect_on_recent_cells(args.num_cells, cells_path, args.model)
    except ReflectError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)

    json.dump(asdict(result), sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
