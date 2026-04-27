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
import os
import re
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from textwrap import dedent

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass


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
    # populated by the v0.5 LLM classifier (classifier.py)
    discourse_move: str | None = None
    confidence: float | None = None
    classifier_reasoning: str | None = None
    # populated when this cell is a reflection -- ids of the cells reflected on
    reflection_source_ids: list[str] | None = None


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
                    write: bool = False, generate_image: bool = False,
                    use_llm: bool | None = None) -> CellProposal:
    data = load_cells()
    auto_type_v0 = classify(snippet)  # always run keyword classifier for comparison

    # llm_available controls BOTH the LLM classifier and the image specialist.
    # use_llm=None -> auto (True if ANTHROPIC_API_KEY set). use_llm=False ->
    # forced off (--no-llm-classify). The classifier additionally requires
    # cell_type to be None (it's deciding the type); the image specialist
    # runs whenever we're generating an image cell regardless of how
    # cell_type was determined.
    llm_explicitly_off = (use_llm is False)
    llm_available = bool(os.environ.get("ANTHROPIC_API_KEY")) and not llm_explicitly_off

    discourse_move = None
    confidence = None
    classifier_reasoning = None
    classifier_label = f"classifier(v0)→{auto_type_v0}"
    gate_note = ""
    chosen_type = cell_type or auto_type_v0

    if llm_available and cell_type is None:
        try:
            import classifier as _classifier
            llm = _classifier.classify(snippet, context)
            discourse_move = llm.discourse_move
            confidence = llm.confidence
            classifier_reasoning = llm.reasoning
            short_model = llm.model.replace("claude-", "")
            if llm.cache_read_tokens > 0:
                cache_info = f"cache:hit/{llm.cache_read_tokens}t"
            elif llm.cache_creation_tokens > 0:
                cache_info = f"cache:wrote/{llm.cache_creation_tokens}t"
            else:
                cache_info = "cache:miss(prefix<min)"
            classifier_label = (
                f"classifier({short_model})→"
                f"{llm.discourse_move}/{llm.cell_type}@{llm.confidence:.2f} "
                f"[v0→{auto_type_v0}] {cache_info}"
            )
            # Confidence gate (leg5_spec.md lines 117-122)
            if llm.confidence < 0.6:
                chosen_type = "text"
                gate_note = f" [confidence-gate <0.6 → text; was {llm.cell_type}]"
            elif llm.confidence < 0.8:
                chosen_type = llm.cell_type
                gate_note = " [draft, confidence 0.6-0.8]"
            else:
                chosen_type = llm.cell_type
        except Exception as e:
            chosen_type = auto_type_v0
            gate_note = f" [LLM classifier failed: {e}]"
    elif cell_type and cell_type != auto_type_v0:
        classifier_label += f"; forced→{cell_type}"

    # v0.5 image specialist: when we're about to generate an image cell,
    # run a 2-step prompt (Claude extracts the load-bearing visual brief,
    # we compose it into a grounded Gemini prompt). The specialist may
    # also demote to text if the snippet is meta-cognitive or has no real
    # visual content -- defending against the cell-0005 generic-stock
    # failure mode upstream of generation.
    image_prompt_override: str | None = None
    if llm_available and chosen_type == "image" and generate_image:
        try:
            import image_specialist as _imgspec
            brief = _imgspec.shape_prompt(snippet, context)
            spec_cache_info = (
                f"cache:hit/{brief.cache_read_tokens}t" if brief.cache_read_tokens > 0
                else f"cache:wrote/{brief.cache_creation_tokens}t" if brief.cache_creation_tokens > 0
                else "cache:miss"
            )
            if brief.should_demote_to_text:
                chosen_type = "text"
                gate_note += f" [imgspec demoted to text: {spec_cache_info}]"
            else:
                image_prompt_override = _imgspec.build_gemini_prompt(brief, snippet)
                classifier_label += f" [imgspec:{spec_cache_info}]"
        except Exception as e:
            classifier_label += f" [imgspec failed: {e}]"

    cell_id = next_id(data["cells"])
    final_prompt = image_prompt_override or build_prompt(chosen_type, snippet, context)
    proposal = CellProposal(
        id=cell_id,
        timestamp=now_iso(),
        cell_type=chosen_type,
        trigger_snippet=snippet.strip(),
        prompt=final_prompt,
        notes=f"(awaiting generation) [{classifier_label}]{gate_note}",
        discourse_move=discourse_move,
        confidence=confidence,
        classifier_reasoning=classifier_reasoning,
    )

    if generate_image and chosen_type == "image":
        import nano_banana
        out = Path(__file__).parent / "cells" / f"{cell_id}.png"
        try:
            result = nano_banana.generate(proposal.prompt, out)
            proposal.image_path = f"cells/{out.name}"
            proposal.notes = f"generated via {result.model} ({result.bytes_written} bytes) [{classifier_label}]"
        except nano_banana.NanoBananaError as e:
            proposal.notes = f"generation failed: {e} [{classifier_label}]"

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
    p.add_argument("--no-llm-classify", action="store_true",
                   help="disable the v0.5 LLM classifier; force the keyword classifier even if ANTHROPIC_API_KEY is set")
    p.add_argument("--reflect", action="store_true",
                   help="reflective loop: read back recent visible cells (incl. images) and synthesize a reflection cell")
    p.add_argument("-n", "--reflect-on", type=int, default=5,
                   help="number of recent visible cells to reflect on (with --reflect)")
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

    if args.reflect:
        try:
            import reflect as _reflect
            result = _reflect.reflect_on_recent_cells(args.reflect_on)
        except Exception as e:
            print(f"reflect error: {e}", file=sys.stderr)
            sys.exit(1)

        data = load_cells()
        cell_id = next_id(data["cells"])
        cache_info = (
            f"cache:hit/{result.cache_read_tokens}t" if result.cache_read_tokens > 0
            else f"cache:wrote/{result.cache_creation_tokens}t" if result.cache_creation_tokens > 0
            else "cache:miss"
        )

        # Compose a multi-paragraph caption from the structured reflection
        parts = [result.reflection]
        if result.what_worked:
            parts.append(f"What worked: {result.what_worked}")
        if result.what_didnt_work:
            parts.append(f"What didn't: {result.what_didnt_work}")
        if result.proposed_next_cell_type != "none" and result.proposed_next_snippet:
            parts.append(
                f"Proposed next ({result.proposed_next_cell_type}): "
                f"{result.proposed_next_snippet}"
            )
        caption = "\n\n".join(parts)

        short_model = result.model.replace("claude-", "")
        proposal = CellProposal(
            id=cell_id,
            timestamp=now_iso(),
            cell_type="text",
            trigger_snippet=f"(reflection on {len(result.source_ids)} cells: {', '.join(result.source_ids)})",
            prompt="(reflective loop -- system prompt was reflect.SYSTEM_PROMPT; user content was the recent cells as multimodal input)",
            caption=caption,
            notes=f"reflection via {short_model} [{cache_info}; {result.input_tokens}u/{result.output_tokens}o]",
            classifier_reasoning=result.reasoning,
            reflection_source_ids=result.source_ids,
        )
        if args.write:
            data["cells"].append(asdict(proposal))
            CELLS_PATH.write_text(json.dumps(data, indent=2) + "\n")
        json.dump(asdict(proposal), sys.stdout, indent=2)
        print()
        return

    if not args.snippet:
        p.error("--snippet is required (unless --sweep-trivial or --reflect)")

    use_llm = False if args.no_llm_classify else None  # None = auto-detect via env
    proposal = append_proposal(args.snippet, args.context, args.type, args.write, args.generate,
                               use_llm=use_llm)
    json.dump(asdict(proposal), sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
