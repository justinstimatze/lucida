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
import re
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
    # populated by demote_if_trivial when the original viz failed the heuristic
    attempted_cell_type: str | None = None
    attempted_spec: object | None = None


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

    v0.5 target (inherited from station/sensors/leg5_spec.md, lines 60-69
    and 117-122): replace with a Claude-based classifier whose primary
    target is the *discourse move* (structural | temporal | comparative
    | causal | quantitative) plus a confidence score. Cell type follows
    from move + confidence, not the other way around. Confidence gates:
    <0.6 suppress, 0.6-0.8 render with "draft" indicator, >0.8 normal.
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
            Do not add nodes or edges for entities/relationships not
            mentioned in the snippet — the diagram should be a faithful
            structural map, not an embellished one.

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
            Do not invent props, settings, or characters not implied by
            the snippet. Ground the scene in what the snippet actually
            says — resist generic stock-illustration furniture.

            Context:
            {context or '(none)'}
        """).strip()
    if cell_type == "html":
        return dedent(f"""
            Produce an HTML <table> (no inline styles; CSS is in
            notebook.css) that surfaces the comparison described below.
            Do not invent rows, columns, or values not present in the
            snippet. If the snippet underspecifies a dimension, leave
            that cell blank rather than filling it with a plausible-
            looking guess.

            Snippet:
            {snippet}

            Context:
            {context or '(none)'}
        """).strip()
    if cell_type == "animated_svg":
        return dedent(f"""
            Produce an inline <svg> element (no commentary, no outer
            wrapper) with SMIL or CSS-keyframe animation that visualizes
            the snippet below.

            Constraints:
            - Bounded loop, 2-6 seconds per cycle.
            - 1-3 stroke colors max; movie-interface aesthetic (cyan/
              magenta on dark, or restrained greys); no full-saturation
              reds.
            - The motion must encode something a static SVG could not
              (flow direction, growth, decay, pulse). If you cannot
              identify what the motion encodes, return a static SVG.
            - Do not invent visual elements not implied by the snippet.

            Snippet:
            {snippet}

            Context:
            {context or '(none)'}
        """).strip()
    if cell_type == "scene3d":
        return dedent(f"""
            Produce a JSON spec (no commentary) for a Three.js scene
            illustrating the snippet below. Use ONLY this schema:

            {{
              "background": "#hex",
              "camera_distance": <float>,
              "objects": [
                {{
                  "kind": "wireframe_cube" | "wireframe_sphere"
                          | "torus" | "icosahedron" | "axis_helper"
                          | "particle_cloud",
                  "size": <float>,
                  "color": "#hex",
                  "position": [x, y, z],
                  "rotation_speed": [rx, ry, rz],
                  "count": <int, particle_cloud only>,
                  "spread": <float, particle_cloud only>
                }}
              ]
            }}

            Aesthetic constraints (movie-computer-interface):
            - Dark background; glowing wireframe edges.
            - 1-3 colors max.
            - Slow rotation (0.005-0.02 rad/frame).

            Do not invent kinds outside the listed set. Do not invent
            objects whose presence is not implied by the snippet.

            Snippet:
            {snippet}

            Context:
            {context or '(none)'}
        """).strip()
    if cell_type == "aframe":
        return dedent(f"""
            Produce A-Frame markup (the inner contents of <a-scene>;
            the surrounding <a-scene> tag is added by the renderer).
            Use only standard A-Frame primitives: a-box, a-sphere,
            a-cylinder, a-plane, a-text, a-light, a-sky.

            Aesthetic constraints (movie-computer-interface):
            - Dark sky color (e.g. "#0a0a1a").
            - Wireframe primitives where possible.
            - 1-3 stroke colors max.
            - Use the `animation` component for rotation/translation,
              not the deprecated <a-animation>.

            Do not invent primitives or assets that aren't standard
            A-Frame, and do not reference external models, images, or
            audio.

            Snippet:
            {snippet}

            Context:
            {context or '(none)'}
        """).strip()
    if cell_type == "lottie":
        return dedent(f"""
            (Lottie cells are best authored with After Effects + bodymovin
            or hand-edited from a known-good template; LLM generation of
            valid Lottie JSON from scratch is unreliable.)

            If you have a pre-authored Lottie JSON appropriate to the
            snippet, paste it. Otherwise, return:
              {{"_skip": true, "reason": "no pre-authored Lottie available"}}

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


def is_trivial(cell_type: str, spec, html: str | None) -> str | None:
    """Heuristic: would this viz be more informative as a caption-only text
    cell? If trivial, returns a short reason; else None.

    Inherited from station/sensors/leg5_spec.md confidence-gate idea, applied
    at the rendering stage rather than the classification stage. Conservative:
    catches obvious cases (single-row vega, edgeless or stacking-only mermaid,
    single-data-cell html) and lets borderline cases through.
    """
    if cell_type == "vega":
        return _trivial_vega(spec)
    if cell_type == "mermaid":
        return _trivial_mermaid(spec)
    if cell_type == "html":
        return _trivial_html(html)
    return None


def _trivial_vega(spec) -> str | None:
    if not isinstance(spec, dict):
        return None
    values = spec.get("data", {}).get("values")
    if isinstance(values, list) and len(values) <= 1:
        return f"single data point ({len(values)} rows in data.values)"
    return None


def _trivial_mermaid(spec) -> str | None:
    if not isinstance(spec, str) or not spec.strip():
        return None
    lines = [l.strip() for l in spec.splitlines() if l.strip()]
    node_decls = [l for l in lines if re.match(r'^\w+\s*[\[\({]', l)]
    if len(node_decls) < 3:
        return f"too few nodes ({len(node_decls)} declared) -- a 1-2 node graph reads as prose"
    edge_tokens = ["-->", "---", "-.->", ".->", "==>", "<--"]
    edge_lines = [l for l in lines if any(t in l for t in edge_tokens)]
    if not edge_lines:
        return "no edges (just a node list)"
    has_directed = any(
        any(t in l for t in ["-->", "==>", "-.->", ".->"])
        for l in edge_lines
    )
    has_edge_label = any(
        re.search(r'-\.\s*"[^"]+"\s*\.->', l) or       # -. "label" .->
        re.search(r'-\.[^.]+\.->', l) or                # -.label.->
        re.search(r'\|"?[^"|]+"?\|', l)                 # |label| or |"label"|
        for l in edge_lines
    )
    if not has_directed and not has_edge_label:
        return "edges are unlabeled and undirected (---), purely structural stacking"
    return None


def _trivial_html(html: str | None) -> str | None:
    if not isinstance(html, str) or not html.strip():
        return None
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, flags=re.IGNORECASE | re.DOTALL)
    if len(rows) < 2:
        return f"too few rows ({len(rows)})"
    has_header = "<th" in rows[0].lower()
    data_rows = rows[1:] if has_header else rows
    non_empty_data_cells = 0
    for r in data_rows:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", r, flags=re.IGNORECASE | re.DOTALL)
        non_empty_data_cells += sum(1 for c in cells if c.strip())
    if non_empty_data_cells < 2:
        return f"too few non-empty data cells ({non_empty_data_cells})"
    return None


def demote_if_trivial(proposal: CellProposal) -> str | None:
    """If proposal's viz is trivial, mutate proposal in place into a text cell
    (preserving the original under attempted_*). Returns the demotion reason
    or None."""
    reason = is_trivial(proposal.cell_type, proposal.spec, proposal.html)
    if not reason:
        return None
    proposal.attempted_cell_type = proposal.cell_type
    proposal.attempted_spec = proposal.spec if proposal.spec is not None else proposal.html
    proposal.cell_type = "text"
    proposal.spec = None
    proposal.html = None
    proposal.caption = (proposal.caption or "") + f" [demoted from {proposal.attempted_cell_type}: {reason}]"
    return reason


def sweep_trivial(write: bool = False) -> list[str]:
    """Walk cells.json and demote any cell whose populated viz is trivial.
    Returns list of '<id>: <reason>' descriptions. With write=False this is
    a dry-run report; with write=True it persists."""
    data = load_cells()
    demoted = []
    for cell in data["cells"]:
        reason = is_trivial(
            cell.get("cell_type"),
            cell.get("spec"),
            cell.get("html"),
        )
        if not reason:
            continue
        cell["attempted_cell_type"] = cell["cell_type"]
        cell["attempted_spec"] = (
            cell.get("spec") if cell.get("spec") is not None else cell.get("html")
        )
        cell["cell_type"] = "text"
        cell["spec"] = None
        cell["html"] = None
        cell["caption"] = (cell.get("caption") or "") + f" [demoted from {cell['attempted_cell_type']}: {reason}]"
        cell["notes"] = (cell.get("notes") or "") + " [trivial-filter applied]"
        demoted.append(f"{cell['id']}: {reason}")
    if write and demoted:
        CELLS_PATH.write_text(json.dumps(data, indent=2) + "\n")
    return demoted


def append_proposal(snippet: str, context: str = "", cell_type: str | None = None,
                    write: bool = False, generate_image: bool = False) -> CellProposal:
    data = load_cells()
    auto_type = classify(snippet)
    chosen_type = cell_type or auto_type
    cell_id = next_id(data["cells"])
    if cell_type and cell_type != auto_type:
        classifier_note = f"classifier(v0)→{auto_type}; forced→{cell_type}"
    else:
        classifier_note = f"classifier(v0)→{auto_type}"
    proposal = CellProposal(
        id=cell_id,
        timestamp=now_iso(),
        cell_type=chosen_type,
        trigger_snippet=snippet.strip(),
        prompt=build_prompt(chosen_type, snippet, context),
        notes=f"(awaiting generation) [{classifier_note}]",
    )

    if generate_image and chosen_type == "image":
        import nano_banana
        out = Path(__file__).parent / "cells" / f"{cell_id}.png"
        try:
            result = nano_banana.generate(proposal.prompt, out)
            proposal.image_path = f"cells/{out.name}"
            proposal.notes = f"generated via {result.model} ({result.bytes_written} bytes) [{classifier_note}]"
        except nano_banana.NanoBananaError as e:
            proposal.notes = f"generation failed: {e} [{classifier_note}]"

    # Trivial check after spec/html may have been populated. In v0 this only
    # fires for cells whose specs were filled by something other than this
    # orchestrator (hand-fill or v0.5 LLM specialist).
    demoted_reason = demote_if_trivial(proposal)
    if demoted_reason:
        proposal.notes = f"{proposal.notes} [trivial-filter applied]"

    if write:
        data["cells"].append(asdict(proposal))
        CELLS_PATH.write_text(json.dumps(data, indent=2))
    return proposal


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--snippet", help="conversation excerpt that triggers a cell")
    p.add_argument("--context", default="", help="optional extra context (file paths, prior cells, etc.)")
    p.add_argument("--type", default=None,
                   choices=["image", "vega", "mermaid", "html", "text",
                            "animated_svg", "scene3d", "aframe", "lottie"],
                   help="force a cell type; default = naive classifier")
    p.add_argument("--write", action="store_true",
                   help="append the proposal to cells.json (or, with --sweep-trivial, persist the demotions)")
    p.add_argument("--generate", action="store_true",
                   help="for image cells, actually call nano banana to generate")
    p.add_argument("--sweep-trivial", action="store_true",
                   help="walk cells.json and demote trivial cells in place; pair with --write to persist")
    args = p.parse_args()

    if args.sweep_trivial:
        demoted = sweep_trivial(write=args.write)
        if demoted:
            print(f"demoted {len(demoted)} cell(s):")
            for d in demoted:
                print(f"  - {d}")
            if not args.write:
                print("(dry-run; pass --write to persist)")
        else:
            print("(no trivial cells found)")
        return

    if not args.snippet:
        p.error("--snippet is required (unless --sweep-trivial)")

    proposal = append_proposal(args.snippet, args.context, args.type, args.write, args.generate)
    json.dump(asdict(proposal), sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
