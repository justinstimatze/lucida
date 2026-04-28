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
MINT_LOG_PATH = Path(__file__).parent / "mint_log.jsonl"


def _log_mints(cell_dicts: list[dict]) -> None:
    """Append a one-line JSON record per minted cell. Read by the
    recent_mints hook to surface fresh cells back into the conversation."""
    try:
        with MINT_LOG_PATH.open("a") as f:
            for c in cell_dicts:
                snippet = (c.get("trigger_snippet") or "").strip().replace("\n", " ")
                f.write(json.dumps({
                    "timestamp": c.get("timestamp"),
                    "cell_id": c.get("id"),
                    "cell_type": c.get("cell_type"),
                    "snippet_head": snippet[:120],
                    "caption": (c.get("caption") or "").strip()[:200],
                }) + "\n")
    except OSError:
        pass  # mint_log is best-effort; never block a write on it


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
    # populated by the autonomous retrigger loop (image cells only):
    replaces: str | None = None         # predecessor cell this one supersedes
    replaced_by: str | None = None      # successor (set on the predecessor when retriggered)
    retrigger_count: int = 0            # how many retriggers this cell has gone through
    retrigger_reason: str | None = None # evaluator's corrective guidance from the predecessor


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def next_id(cells: list[dict]) -> str:
    """Return the next unused cell-NNNN id.

    Uses max(numeric_id) + 1 rather than len(cells) + 1 — the latter is racy
    when two writers see the same length and mint colliding IDs (observed
    2026-04-27: 4 ID collisions between a 10:58 batch and a 19:30 batch
    that both saw len=59 and minted cell-0060..0063 twice).
    """
    max_n = 0
    for c in cells:
        cid = c.get("id") if isinstance(c, dict) else getattr(c, "id", None)
        if not cid or not cid.startswith("cell-"):
            continue
        try:
            n = int(cid.split("-", 1)[1])
        except ValueError:
            continue
        if n > max_n:
            max_n = n
    return f"cell-{max_n + 1:04d}"


def _guidance_too_similar(a: str, b: str, threshold: float = 0.7) -> bool:
    """Word-Jaccard between two retrigger guidance strings.

    Used to break the retrigger loop when consecutive guidances are
    essentially saying the same thing — the prompt isn't moving the
    image generator, so further attempts waste API calls.
    """
    aw = set(re.findall(r"\w+", a.lower()))
    bw = set(re.findall(r"\w+", b.lower()))
    if not aw or not bw:
        return False
    union = aw | bw
    intersect = aw & bw
    return len(intersect) / len(union) >= threshold


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
    if any(k in s for k in ["matrix", "heatmap", "table", "grid"]):
        return "html"
    return "text"
    # image removed from auto-routing 2026-04-27 per kill_criteria.md #1 kill
    # action (5/6 image cells failed snippet-fidelity at week-1 audit; only 1/4
    # remediations clearly worked). Image cells require explicit --type image.


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


def closed_loop_stats(cells: list[dict]) -> dict:
    """Closed-loop metric proposed in learnings.md.

    A cell *closes a loop* if at least one is true:
      1. it was retriggered (replaces or replaced_by populated)
      2. it appears in another cell's reflection_source_ids
      3. it is itself a reflection cell (reflection_source_ids non-empty)

    Infrastructure-only seed cells that are *demos* (no real snippet)
    are excluded from the denominator — they're inert by design.

    Returns a dict suitable for both human-readable logging and machine
    parsing.
    """
    seed_or_demo = lambda c: (
        c.get("id", "").startswith("seed-")
        or "infrastructure demo" in (c.get("trigger_snippet") or "")
    )
    referenced_ids: set[str] = set()
    for c in cells:
        for src in (c.get("reflection_source_ids") or []):
            referenced_ids.add(src)

    content_cells = [c for c in cells if not seed_or_demo(c)]
    closed = []
    for c in content_cells:
        loops = []
        if c.get("replaces") or c.get("replaced_by"):
            loops.append("retrigger")
        if c["id"] in referenced_ids:
            loops.append("reflected_on")
        if c.get("reflection_source_ids"):
            loops.append("reflection_output")
        if loops:
            closed.append((c["id"], loops))

    total_content = len(content_cells)
    closed_count = len(closed)
    return {
        "total_cells": len(cells),
        "content_cells": total_content,
        "closed_cells": closed_count,
        "ratio": (closed_count / total_content) if total_content else 0.0,
        "closed": closed,
    }


def reflect_and_persist(n: int = 5, write: bool = True) -> "CellProposal":
    """Run a reflection pass over the last n visible cells and persist the
    resulting reflection cell. Returns the CellProposal (returned even if
    write=False, for dry-run callers).

    Extracted from the --reflect CLI block so the watcher can drive
    reflection autonomously after a configurable cadence of mintings.
    Raises whatever reflect.reflect_on_recent_cells raises (typically
    ReflectError on missing key/SDK or no visible cells).
    """
    import reflect as _reflect
    result = _reflect.reflect_on_recent_cells(n)

    data = load_cells()
    cell_id = next_id(data["cells"])
    cache_info = (
        f"cache:hit/{result.cache_read_tokens}t" if result.cache_read_tokens > 0
        else f"cache:wrote/{result.cache_creation_tokens}t" if result.cache_creation_tokens > 0
        else "cache:miss"
    )
    # Build a structured html artifact for the reflection cell -- per the
    # text-anti-differentiation principle (memory/lucida_vision.md), reflection
    # cells were the last persistent text source. Now they render as an html
    # table of source cells + a footer block of analysis.
    by_id = {c.get("id"): c for c in data["cells"]}

    def _esc(s: object) -> str:
        return (str(s or "")
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;"))

    rows_html = []
    for sid in result.source_ids:
        sc = by_id.get(sid)
        if sc is None:
            continue
        sc_type = _esc(sc.get("cell_type", ""))
        sc_caption = _esc((sc.get("caption") or sc.get("trigger_snippet") or "")[:140])
        rows_html.append(
            f"<tr><td>{_esc(sid)}</td><td>{sc_type}</td><td>{sc_caption}</td></tr>"
        )

    footer_blocks = []
    if result.what_worked:
        footer_blocks.append(
            f"<p><strong>worked:</strong> {_esc(result.what_worked)}</p>"
        )
    if result.what_didnt_work:
        footer_blocks.append(
            f"<p><strong>didn&#39;t:</strong> {_esc(result.what_didnt_work)}</p>"
        )
    if result.proposed_next_cell_type != "none" and result.proposed_next_snippet:
        footer_blocks.append(
            f"<p><strong>proposed next ({_esc(result.proposed_next_cell_type)}):</strong> "
            f"{_esc(result.proposed_next_snippet)}</p>"
        )

    html_artifact = (
        "<table>"
        "<thead><tr><th>source</th><th>type</th><th>caption</th></tr></thead>"
        f"<tbody>{''.join(rows_html)}</tbody>"
        "</table>"
        + "".join(footer_blocks)
    )

    caption = result.reflection  # synthesis sentence(s) only; analysis lives in html
    short_model = result.model.replace("claude-", "")
    proposal = CellProposal(
        id=cell_id,
        timestamp=now_iso(),
        cell_type="html",
        trigger_snippet=f"(reflection on {len(result.source_ids)} cells: {', '.join(result.source_ids)})",
        prompt="(reflective loop -- system prompt was reflect.SYSTEM_PROMPT; user content was the recent cells as multimodal input)",
        caption=caption,
        html=html_artifact,
        notes=f"reflection via {short_model} [{cache_info}; {result.input_tokens}u/{result.output_tokens}o]",
        classifier_reasoning=result.reasoning,
        reflection_source_ids=result.source_ids,
    )
    if write:
        d = asdict(proposal)
        data["cells"].append(d)
        CELLS_PATH.write_text(json.dumps(data, indent=2) + "\n")
        _log_mints([d])
    return proposal


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
                    use_llm: bool | None = None,
                    auto_retrigger: bool = True,
                    max_retriggers: int = 3) -> CellProposal:
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
            # Confidence gate (leg5_spec.md lines 117-122). Spec says
            # "no viz update; panel holds last good" at <0.6 — i.e. suppress.
            # lucida diverges: demote to text rather than suppress, since
            # text cells still carry information and lucida has no "panel"
            # to hold-last-good. The cell mints, just without viz authority.
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

    # kill_criteria.md #1 kill action enacted 2026-04-27: image cells must be
    # explicit opt-in. If neither the keyword nor LLM classifier was overridden
    # by --type image, demote any image recommendation to text.
    if chosen_type == "image" and cell_type != "image":
        gate_note += " [image-demote per kill #1; pass --type image to opt-in]"
        chosen_type = "text"

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

    # v0.5 specialists for non-image cell types: when --generate is set,
    # call the matching specialist (mermaid / vega / html / animated_svg)
    # to produce a snippet-grounded spec. Symmetric with image_specialist
    # but for the cheaper, all-text spec types. Specialists may demote to
    # text if the snippet doesn't fit the type as well as the classifier
    # thought.
    non_image_spec = None
    non_image_html = None
    non_image_caption = ""
    if (llm_available and generate_image
            and chosen_type in ("mermaid", "vega", "html", "animated_svg", "scene3d", "aframe", "lottie")
            and os.environ.get("ANTHROPIC_API_KEY")):
        try:
            import specialists as _specs
            fns = {
                "mermaid": _specs.generate_mermaid_spec,
                "vega": _specs.generate_vega_spec,
                "html": _specs.generate_html_spec,
                "animated_svg": _specs.generate_animated_svg_spec,
                "scene3d": _specs.generate_scene3d_spec,
                "aframe": _specs.generate_aframe_spec,
                "lottie": _specs.generate_lottie_spec,
            }
            spec_result = fns[chosen_type](snippet, context)
            spec_cache_info = (
                f"cache:hit/{spec_result.cache_read_tokens}t" if spec_result.cache_read_tokens > 0
                else f"cache:wrote/{spec_result.cache_creation_tokens}t" if spec_result.cache_creation_tokens > 0
                else "cache:miss"
            )
            if spec_result.should_demote_to_text:
                old_type = chosen_type
                chosen_type = "text"
                gate_note += f" [{old_type}-specialist demoted to text: {spec_result.demotion_reason}]"
            else:
                if chosen_type == "html":
                    non_image_html = spec_result.spec
                else:
                    non_image_spec = spec_result.spec
                non_image_caption = spec_result.caption
                classifier_label += f" [{chosen_type}-specialist:{spec_cache_info}]"
        except Exception as e:
            classifier_label += f" [{chosen_type}-specialist failed: {e}]"

    cell_id = next_id(data["cells"])
    final_prompt = image_prompt_override or build_prompt(chosen_type, snippet, context)
    has_specialist_content = non_image_spec is not None or non_image_html is not None
    proposal_notes = (
        f"generated via specialist [{classifier_label}]{gate_note}"
        if has_specialist_content
        else f"(awaiting generation) [{classifier_label}]{gate_note}"
    )
    proposal = CellProposal(
        id=cell_id,
        timestamp=now_iso(),
        cell_type=chosen_type,
        trigger_snippet=snippet.strip(),
        prompt=final_prompt,
        spec=non_image_spec,
        html=non_image_html,
        caption=non_image_caption,
        notes=proposal_notes,
        discourse_move=discourse_move,
        confidence=confidence,
        classifier_reasoning=classifier_reasoning,
    )

    # Image generation + autonomous retrigger loop. The loop closes the
    # Wakisaka pattern: generate -> evaluate -> if disappointing, regenerate
    # with the evaluator's corrective brief as feedback. Bounded by
    # max_retriggers and the LUCIDA_RETRIGGER_SCORE_FLOOR env var.
    cells_to_write: list[CellProposal] = [proposal]
    if generate_image and chosen_type == "image":
        out_dir = Path(__file__).parent / "cells"

        def _generate_into(p: CellProposal, attempt_label: str,
                           edit_base: Path | None = None) -> None:
            """Mutate p with nano_banana result; preserve classifier_label in notes.

            If edit_base is set, run image-to-image edit on that PNG using
            p.prompt as the (short) corrective brief. Otherwise text-to-image
            from p.prompt. Routing is done by the caller based on
            evaluator.failure_mode (see learnings.md → i2i mode-conditional).
            """
            import nano_banana
            out_path = out_dir / f"{p.id}.png"
            try:
                if edit_base is not None:
                    result = nano_banana.transform_image(
                        edit_base, p.prompt, out_path, temperature=0.4,
                    )
                    mode_tag = f"i2i-edit of {edit_base.name}"
                else:
                    result = nano_banana.generate(p.prompt, out_path)
                    mode_tag = "text-to-image"
                p.image_path = f"cells/{out_path.name}"
                p.notes = (
                    f"{attempt_label} ({mode_tag}) via {result.model} "
                    f"({result.bytes_written} bytes) [{classifier_label}]"
                )
            except nano_banana.NanoBananaError as e:
                p.notes = f"{attempt_label} failed: {e} [{classifier_label}]"

        _generate_into(proposal, "generated")

        if (auto_retrigger and llm_available and proposal.image_path
                and os.environ.get("ANTHROPIC_API_KEY")):
            score_floor = float(os.environ.get("LUCIDA_RETRIGGER_SCORE_FLOOR", "0.5"))
            score_ceiling = float(os.environ.get("LUCIDA_RETRIGGER_SCORE_CEILING", "0.8"))
            prev_guidance: str = ""
            current = proposal
            for attempt in range(max_retriggers):
                try:
                    import evaluator as _eval
                    eval_result = _eval.evaluate_image_cell(
                        snippet,
                        Path(__file__).parent / current.image_path,
                    )
                except Exception as e:
                    current.notes += f" [evaluator failed: {e}]"
                    break

                # Three-band gate. Below floor: orchestrator forces retrigger
                # regardless of evaluator. Above ceiling: orchestrator accepts
                # regardless of evaluator (the lighthouse-chain bug — evaluator
                # said should_retrigger=True at 0.82 three attempts running,
                # never improving). In between: defer to evaluator.
                if eval_result.quality_score < score_floor:
                    should_retrigger = True
                    gate_reason = "score_floor"
                elif eval_result.quality_score >= score_ceiling:
                    should_retrigger = False
                    gate_reason = "score_ceiling"
                else:
                    should_retrigger = eval_result.should_retrigger
                    gate_reason = "evaluator" if should_retrigger else "evaluator_accept"
                current.notes += (
                    f" [eval@{eval_result.quality_score:.2f}"
                    f", {'retrigger' if should_retrigger else 'accepted'}"
                    f"/{gate_reason}"
                    f", mode={eval_result.failure_mode}]"
                )
                if not should_retrigger:
                    break

                # Failure-mode gate: wrong_genre means the cell-type itself
                # was probably wrong (snippet is meta-commentary or abstract,
                # not a renderable scene). Re-attempting won't help; abort.
                # See learnings.md → i2i mini-batch (cell-0005 went from a
                # generic-pensioner scene to score 0.15 even with explicit
                # corrective text).
                if eval_result.failure_mode == "wrong_genre":
                    current.notes += (
                        " [wrong_genre — aborting retrigger; "
                        "snippet may not be image-genre]"
                    )
                    break

                # Build corrective guidance. Prefer evaluator's retrigger_guidance
                # (intentional corrective). When score-floor forced retrigger
                # without that, splice what_didnt_work into a stronger reframe so
                # the next attempt sees actionable corrective text rather than a
                # bare description of failure.
                if eval_result.retrigger_guidance.strip():
                    guidance = eval_result.retrigger_guidance.strip()
                elif eval_result.what_didnt_work.strip():
                    guidance = (
                        f"Score-floor retrigger ({eval_result.quality_score:.2f} "
                        f"< {score_floor}). Previous attempt failed at: "
                        f"{eval_result.what_didnt_work.strip()} "
                        f"Try a fundamentally different visual interpretation; "
                        f"attend to every named entity and prop in the snippet."
                    )
                else:
                    guidance = (
                        f"Score below floor ({eval_result.quality_score:.2f} "
                        f"< {score_floor}) with no specific failure analysis. "
                        f"Re-read the snippet and ground the image in its named "
                        f"entities, props, and setting. Resist generic stock-"
                        f"illustration furniture."
                    )

                # Stop if guidance is essentially repeating itself — the prompt
                # isn't moving the model and further attempts waste images.
                if prev_guidance and _guidance_too_similar(prev_guidance, guidance):
                    current.notes += " [guidance-stalled, breaking]"
                    break
                prev_guidance = guidance

                # Mode-aware routing: i2i edit fixes missed_detail and
                # literal_simile_color reliably (per learnings.md mini-batch),
                # but makes literal_simile_metaphor worse (the wrong-
                # interpretation is in the base PNG and Gemini anchors on
                # it — cell-0010 COSTCO sign survived an explicit removal
                # corrective). Default-on; LUCIDA_RETRIGGER_USE_I2I=0 disables.
                i2i_modes = {"missed_detail", "literal_simile_color"}
                use_i2i = (
                    os.environ.get("LUCIDA_RETRIGGER_USE_I2I", "1") == "1"
                    and eval_result.failure_mode in i2i_modes
                    and current.image_path
                )

                new_id_num = len(data["cells"]) + len(cells_to_write) + 1
                new_id = f"cell-{new_id_num:04d}"
                if use_i2i:
                    # For i2i, the prompt is just the short corrective brief;
                    # the base image carries the rest of the context.
                    enhanced_prompt = (
                        f"(i2i edit of {current.id}; "
                        f"failure_mode={eval_result.failure_mode})\n\n"
                        f"{guidance}"
                    )
                else:
                    # Text-to-image: full original prompt + corrective addendum.
                    # Strip prior CORRECTIVE GUIDANCE sections so we don't
                    # accumulate stale corrections across attempts.
                    base_prompt = current.prompt.split(
                        "\n\nCORRECTIVE GUIDANCE FROM PREVIOUS ATTEMPT"
                    )[0].split(
                        "\n\n("  # i2i header from a prior i2i retrigger
                    )[0]
                    enhanced_prompt = (
                        f"{base_prompt}\n\n"
                        f"CORRECTIVE GUIDANCE FROM PREVIOUS ATTEMPT (#{attempt + 1}):\n"
                        f"{guidance}"
                    )
                new_proposal = CellProposal(
                    id=new_id,
                    timestamp=now_iso(),
                    cell_type="image",
                    trigger_snippet=snippet.strip(),
                    prompt=enhanced_prompt,
                    notes=f"(retrigger {attempt + 1}/{max_retriggers}) [{classifier_label}]",
                    discourse_move=proposal.discourse_move,
                    confidence=proposal.confidence,
                    classifier_reasoning=proposal.classifier_reasoning,
                    replaces=current.id,
                    retrigger_count=attempt + 1,
                    retrigger_reason=guidance,
                )
                current.replaced_by = new_id

                edit_base = (
                    Path(__file__).parent / current.image_path
                    if use_i2i else None
                )
                _generate_into(
                    new_proposal, f"retrigger {attempt + 1}",
                    edit_base=edit_base,
                )
                cells_to_write.append(new_proposal)

                if not new_proposal.image_path:
                    break  # generation failed; stop retriggering
                current = new_proposal

            proposal = current  # the FINAL proposal is the last attempt

    # Trivial filter on the final proposal (only -- predecessors keep their state)
    demoted_reason = demote_if_trivial(proposal)
    if demoted_reason:
        proposal.notes = f"{proposal.notes} [trivial-filter applied]"

    if write:
        new_dicts = [asdict(c) for c in cells_to_write]
        for d in new_dicts:
            data["cells"].append(d)
        CELLS_PATH.write_text(json.dumps(data, indent=2))
        _log_mints(new_dicts)
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
    p.add_argument("--no-auto-retrigger", action="store_true",
                   help="disable the autonomous evaluate-and-retrigger loop on image cells")
    p.add_argument("--max-retriggers", type=int, default=3,
                   help="cap on retriggers per cell (default 3)")
    p.add_argument("--segment", default=None,
                   help="path to a document; segment it into salient passages and run each through the orchestrator")
    p.add_argument("--metric", default=None, choices=["closed-loop"],
                   help="report a corpus-level metric and exit")
    args = p.parse_args()

    if args.metric == "closed-loop":
        stats = closed_loop_stats(load_cells()["cells"])
        print(
            f"closed-loop ratio: {stats['closed_cells']}/{stats['content_cells']} "
            f"= {stats['ratio'] * 100:.1f}%  "
            f"(of {stats['total_cells']} total; "
            f"seeds & infra demos excluded from denominator)"
        )
        for cid, loops in stats["closed"]:
            print(f"  {cid}: {','.join(loops)}")
        return

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
            proposal = reflect_and_persist(args.reflect_on, write=args.write)
        except Exception as e:
            print(f"reflect error: {e}", file=sys.stderr)
            sys.exit(1)
        json.dump(asdict(proposal), sys.stdout, indent=2)
        print()
        return

    if args.segment:
        try:
            import segmenter as _seg
            doc_path = Path(args.segment)
            text = doc_path.read_text()
            seg_result = _seg.segment_document(text)
        except Exception as e:
            print(f"segmenter error: {e}", file=sys.stderr)
            sys.exit(1)

        print(f"segmented {doc_path.name}: {len(seg_result.segments)} passages",
              file=sys.stderr)
        print(f"summary: {seg_result.summary}", file=sys.stderr)
        cache_info = (
            f"cache:hit/{seg_result.cache_read_tokens}t" if seg_result.cache_read_tokens > 0
            else f"cache:wrote/{seg_result.cache_creation_tokens}t" if seg_result.cache_creation_tokens > 0
            else "cache:miss"
        )
        print(f"segmenter usage: {seg_result.input_tokens}u / {seg_result.output_tokens}o "
              f"[{cache_info}]", file=sys.stderr)

        use_llm = False if args.no_llm_classify else None
        proposals = []
        for i, s in enumerate(seg_result.segments):
            preview = s.snippet[:80].replace("\n", " ")
            print(f"  [{i + 1}/{len(seg_result.segments)}] {preview}...",
                  file=sys.stderr)
            ctx = (
                f"Document: {doc_path.name}. "
                f"Document summary: {seg_result.summary}. "
                f"Surrounding context: {s.context}"
            )
            proposal = append_proposal(
                s.snippet, ctx, args.type,
                write=args.write,
                generate_image=args.generate,
                use_llm=use_llm,
                auto_retrigger=not args.no_auto_retrigger,
                max_retriggers=args.max_retriggers,
            )
            proposals.append(proposal)
            print(f"      -> {proposal.id} ({proposal.cell_type})", file=sys.stderr)

        json.dump([asdict(p) for p in proposals], sys.stdout, indent=2)
        print()
        return

    if not args.snippet:
        p.error("--snippet is required (unless --sweep-trivial / --reflect / --segment)")

    use_llm = False if args.no_llm_classify else None  # None = auto-detect via env
    proposal = append_proposal(args.snippet, args.context, args.type, args.write, args.generate,
                               use_llm=use_llm,
                               auto_retrigger=not args.no_auto_retrigger,
                               max_retriggers=args.max_retriggers)
    json.dump(asdict(proposal), sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
