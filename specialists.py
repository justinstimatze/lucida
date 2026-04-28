"""v0.5 specialists for non-image cell types.

One module covering vega / mermaid / html / animated_svg generators.
Each function takes a snippet (and optional context), returns a
SpecialistResult: spec + caption + demote flag + cache stats.

The classifier upstream has already chosen the cell type; the
specialist's job is just to produce a snippet-grounded spec or to
recognize that the snippet doesn't actually fit the type and demote
to text.

Image cells use image_specialist.py (separate module because the
2-step text -> Gemini flow needs different scaffolding).

Caching: each specialist has its own ~700-1200 token SYSTEM_PROMPT.
Sonnet 4.6's min cacheable prefix is 2048 tokens, so individual
specialists may not always trigger caching unless the snippet pushes
the prefix over -- still set cache_control on the system block for
forward-compat.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass


DEFAULT_MODEL = os.environ.get("LUCIDA_SPECIALIST_MODEL", "claude-sonnet-4-6")


class SpecialistError(RuntimeError):
    pass


@dataclass
class SpecialistResult:
    spec: object  # dict for vega, str for mermaid/html/animated_svg
    caption: str
    should_demote_to_text: bool
    demotion_reason: str
    model: str
    cache_read_tokens: int
    cache_creation_tokens: int
    input_tokens: int
    output_tokens: int


def _call_specialist(
    system_prompt: str,
    tool_def: dict,
    tool_name: str,
    snippet: str,
    context: str,
    model: str,
) -> dict:
    """Shared API-call boilerplate. Returns dict with input + usage."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise SpecialistError("ANTHROPIC_API_KEY not set in env or .env")
    try:
        import anthropic
    except ImportError as e:
        raise SpecialistError("anthropic SDK not installed") from e

    client = anthropic.Anthropic(api_key=api_key)
    user_msg = f"Snippet:\n{snippet.strip()}\n\nContext:\n{context.strip() or '(none)'}"

    try:
        response = client.messages.create(
            model=model,
            max_tokens=2048,
            system=[
                {
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[tool_def],
            tool_choice={"type": "tool", "name": tool_name},
            messages=[{"role": "user", "content": user_msg}],
        )
    except anthropic.APIError as e:
        raise SpecialistError(f"Anthropic API call failed: {e}") from e

    for block in response.content:
        if block.type == "tool_use":
            return {
                "input": block.input,
                "cache_read_tokens": getattr(response.usage, "cache_read_input_tokens", 0) or 0,
                "cache_creation_tokens": getattr(response.usage, "cache_creation_input_tokens", 0) or 0,
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
            }
    raise SpecialistError(f"no tool_use block (stop_reason={response.stop_reason})")


def _result(inp: dict, raw: dict, model: str, spec_field: str = "spec") -> SpecialistResult:
    return SpecialistResult(
        spec=inp[spec_field],
        caption=inp.get("caption", ""),
        should_demote_to_text=bool(inp.get("should_demote_to_text", False)),
        demotion_reason=inp.get("demotion_reason", ""),
        model=model,
        cache_read_tokens=raw["cache_read_tokens"],
        cache_creation_tokens=raw["cache_creation_tokens"],
        input_tokens=raw["input_tokens"],
        output_tokens=raw["output_tokens"],
    )


# ============================================================
# MERMAID
# ============================================================

MERMAID_SYSTEM = """You are the mermaid specialist for lucida. The classifier has decided this snippet warrants a mermaid graph. Your job: produce valid mermaid syntax that's a faithful structural map of what the snippet says.

# Constraints (substrate-grounding)

- Only nodes for entities the snippet explicitly names.
- Only edges for relationships the snippet claims. Edge labels should reflect the snippet's actual verb (e.g. "complements", "depends on", "cites", "supersedes") -- not invented.
- Use directed edges (-->, -.->) for asymmetric relationships, undirected (---) only when the snippet really doesn't claim direction.
- Use \\n for line breaks within node labels (mermaid syntax).

# When to demote to text

Set should_demote_to_text=true if:
- Fewer than 3 distinct entities (a 1-2 node graph reads as prose).
- No claimed relationships between entities (just a list).
- The snippet's content is meta-cognitive or analytic, not structural.

# Worked example

Snippet: "Discussing how zerosum's argument relates to ballast, sisyphus, research-doc, and trickster -- what does each prior collaboration cover and what does zerosum add on top?"

spec:
graph LR
  Z["zerosum\\nstructural extraction frame"]
  B["ballast\\ncognitive mechanism"]
  S["sisyphus\\ndramatic version"]
  R["research-doc\\nempirical anchors"]
  T["trickster\\nrelational answer"]
  B -.complements.-> Z
  S -.dramatizes.-> Z
  R -.cites into.-> Z
  T -.sister essay.-> Z
  Z -.refers back.-> R

caption: "Prior-work delta map. zerosum at center; siblings positioned by relationship type."
should_demote_to_text: false

# Output via the build_mermaid_spec tool.
"""

MERMAID_TOOL = {
    "name": "build_mermaid_spec",
    "description": "Build a mermaid graph spec from a conversation snippet.",
    "input_schema": {
        "type": "object",
        "properties": {
            "spec": {"type": "string", "description": "Valid mermaid syntax."},
            "caption": {"type": "string", "description": "1-2 sentence summary of what the diagram shows."},
            "should_demote_to_text": {"type": "boolean"},
            "demotion_reason": {"type": "string", "description": "If demoting, why; else empty."},
        },
        "required": ["spec", "caption", "should_demote_to_text", "demotion_reason"],
    },
}


def generate_mermaid_spec(snippet: str, context: str = "", model: str = DEFAULT_MODEL) -> SpecialistResult:
    raw = _call_specialist(MERMAID_SYSTEM, MERMAID_TOOL, "build_mermaid_spec", snippet, context, model)
    return _result(raw["input"], raw, model)


# ============================================================
# VEGA
# ============================================================

VEGA_SYSTEM = """You are the vega specialist for lucida. The classifier has decided this snippet warrants a vega-lite chart. Your job: produce a valid vega-lite v5 JSON spec grounded in the snippet's actual numeric claims.

# Constraints

- Use real numbers from the snippet. Do NOT invent values, time series, or distributions.
- Restrained palette; avoid full-saturation reds. Movie-interface vibe where applicable.
- Set "background": "transparent" so the cell-bg shows through (the lucida theme provides background color).
- Width 400-600, height 60-200 typical for a single-claim chart.
- Mark choices: use "bar" for comparisons, "line" for trends, "point" for distributions. Single-value charts (one bar) usually warrant demotion to text instead.

# Required pre-spec step: numeric enumeration

Before producing spec, mentally execute this audit (do not output it):

1. Scan the snippet and list every explicit numeric claim, verbatim, with the entity it modifies and whether it is a LEVEL (an absolute value: "top 10% captured 56%") or a DELTA (a change: "middle 40% share fell 8 percentage points").
2. For every data point you intend to put in spec.data.values, confirm it traces to a listed claim. There is no "implied" — pick one:
   - DIRECT: the value is stated verbatim in the snippet.
   - DERIVED: the value is the result of arithmetic on stated values where the operation is unambiguous (e.g., snippet says "rose from 100 to 165" — both stated, the +65 delta is derived).
   - INVENTED: the value is plausible but not in the snippet, even if you can guess what it "should" be.
3. INVENTED values are forbidden. This is non-negotiable. It overrides the urge to "complete" a chart that has gaps.

If after the audit you have only DIRECT values, build the spec from those and only those.

If the stated values would produce a misleading or trivial chart on their own (e.g., snippet states two of three group shares but not the third), you have two valid moves:
- Encode the snippet's actual claim type — e.g., a chart of percentage-point CHANGES if that's what the snippet talks about, not levels
- Drop the incomplete dimension entirely; show only the values the snippet states
- Demote to text via should_demote_to_text=true with demotion_reason explaining the gap

# When to demote to text

Set should_demote_to_text=true if:
- Only one numeric value in the snippet (a single bar adds nothing over the prose).
- The numbers are illustrative rather than load-bearing.
- The snippet's structure is ordinal/qualitative rather than quantitative.
- The audit reveals the chart would need INVENTED values to be coherent.

# Worked examples

## Clean case (no audit gap)

Snippet: "Productivity has grown ~65% since 1979; median real hourly compensation has grown ~14%. The gap is the empirical anchor for the structural argument."

Audit: 65% (productivity growth, LEVEL), 14% (median compensation growth, LEVEL). Both DIRECT.

spec (the vega-lite JSON):
{"$schema": "https://vega.github.io/schema/vega-lite/v5.json", "background": "transparent", "data": {"values": [{"series": "productivity", "growth_pct": 65}, {"series": "median real hourly compensation", "growth_pct": 14}]}, "mark": "bar", "encoding": {"y": {"field": "series", "type": "nominal", "axis": {"title": null}}, "x": {"field": "growth_pct", "type": "quantitative", "axis": {"title": "growth %, 1979-2019"}}, "color": {"field": "series", "type": "nominal", "legend": null}}, "width": 480, "height": 100}

caption: "Productivity-compensation gap, 1979-2019. The recurring anchor across drafts."
should_demote_to_text: false

## Anti-pattern: mixed-level/delta data

Snippet: "Between 1979 and 2019, the top 10% captured 56% of total income growth, while the bottom 50% captured 4%. The middle 40% saw their share fall by 8 percentage points."

Audit: 56% (top 10% capture, LEVEL), 4% (bottom 50% capture, LEVEL), -8pp (middle 40% share change, DELTA).

WRONG: build a 3-bar chart with [{Top 10%: 56}, {Middle 40%: 36}, {Bottom 50%: 4}] — the 36 is INVENTED (the snippet states a delta, not an absolute). This is the failure mode.

RIGHT options:
- Two-bar chart of capture only: [{"Top 10%": 56}, {"Bottom 50%": 4}], with caption noting the middle 40% delta in prose. Acknowledges the gap.
- Or a chart whose units are percentage-point changes (where you'd need similar deltas for top 10% and bottom 50% — usually not stated, so this often demotes to text).
- Or demote to text if no coherent chart is possible without inventing.

# Output via the build_vega_spec tool. The spec field must be a valid JSON object (not a string).
"""

VEGA_TOOL = {
    "name": "build_vega_spec",
    "description": "Build a vega-lite v5 JSON spec from a conversation snippet.",
    "input_schema": {
        "type": "object",
        "properties": {
            "spec": {"type": "object", "description": "A valid vega-lite v5 spec."},
            "caption": {"type": "string"},
            "should_demote_to_text": {"type": "boolean"},
            "demotion_reason": {"type": "string"},
        },
        "required": ["spec", "caption", "should_demote_to_text", "demotion_reason"],
    },
}


def generate_vega_spec(snippet: str, context: str = "", model: str = DEFAULT_MODEL) -> SpecialistResult:
    raw = _call_specialist(VEGA_SYSTEM, VEGA_TOOL, "build_vega_spec", snippet, context, model)
    return _result(raw["input"], raw, model)


# ============================================================
# HTML (comparison tables)
# ============================================================

HTML_SYSTEM = """You are the html specialist for lucida. The classifier has decided this snippet warrants a comparison table. Your job: produce a clean HTML <table> grounded in the snippet's claims.

# Constraints

- No inline styles -- the lucida theme handles styling via notebook.css.
- Only rows for entities the snippet names.
- Only columns for dimensions the snippet specifies.
- Empty cells where the snippet underspecifies a dimension. Do NOT fill with plausible-looking guesses; an empty cell is more honest than an invented one.
- Use <th> for header rows and column labels.
- Keep the table compact: single line of HTML if possible (no extraneous whitespace inside tags).

# When to demote to text

Set should_demote_to_text=true if:
- Fewer than 2 entities to compare.
- Fewer than 2 dimensions / axes of comparison.
- The "comparison" is asymmetric (only one side of two specified) and the empty cells would dominate the table.

# Worked example

Snippet: "The cooperative that pays above-market wages discovers that the competitor next to it pays below-market wages and can therefore offer lower prices; to remain solvent, the cooperative either matches the lower wages or loses the customer."

html: "<table><thead><tr><th></th><th>cooperative</th><th>competitor</th></tr></thead><tbody><tr><td>wages paid</td><td>above-market</td><td>below-market</td></tr><tr><td>prices charged</td><td></td><td>lower</td></tr><tr><td>solvency response</td><td>match wages OR lose customer</td><td></td></tr></tbody></table>"

caption: "Cooperative vs competitor wage/price tension. Empty cells where the snippet underspecifies (cooperative's prices, competitor's solvency response)."
should_demote_to_text: false

# Output via the build_html_spec tool.
"""

HTML_TOOL = {
    "name": "build_html_spec",
    "description": "Build an HTML <table> string from a conversation snippet.",
    "input_schema": {
        "type": "object",
        "properties": {
            "html": {"type": "string", "description": "A clean <table> with no inline styles."},
            "caption": {"type": "string"},
            "should_demote_to_text": {"type": "boolean"},
            "demotion_reason": {"type": "string"},
        },
        "required": ["html", "caption", "should_demote_to_text", "demotion_reason"],
    },
}


def generate_html_spec(snippet: str, context: str = "", model: str = DEFAULT_MODEL) -> SpecialistResult:
    raw = _call_specialist(HTML_SYSTEM, HTML_TOOL, "build_html_spec", snippet, context, model)
    return _result(raw["input"], raw, model, spec_field="html")


# ============================================================
# ANIMATED SVG
# ============================================================

ANIMATED_SVG_SYSTEM = """You are the animated_svg specialist for lucida. The classifier has decided this snippet warrants a motion-graphic where the motion itself encodes load-bearing information (flow, cycle, growth, decay, pulse).

# Constraints

- Produce inline <svg> with SMIL animations (<animate>, <animateTransform>) or CSS keyframes.
- Bounded loop: 2-6 seconds per cycle.
- 1-3 stroke colors max. Use lucida's $tokens for theme awareness: $accent, $stroke1, $stroke2, $stroke3, $fg, $muted. The orchestrator substitutes them at render time, so write them as literal $token in the spec.
- The motion must encode something a static SVG could not (cycle direction, decay over time, signal flow). If you cannot identify what the motion encodes, demote to text.
- No text inside the SVG (the cell renderer adds a caption separately).
- Width and height: 320-480 wide, 100-200 tall typical.

# When to demote to text

Set should_demote_to_text=true if:
- The snippet doesn't have a temporal/dynamic dimension to animate.
- A static SVG would carry the same information.
- The snippet is meta-cognitive (about reading, framing) rather than depicting flow/cycle/change.

# Worked example

Snippet: "Soil compaction reduces root depth, which decreases water uptake, which stresses plants, which lowers yields, which increases the pressure to till -- which compacts the soil further. Each cycle accelerates the next."

spec:
<svg width="380" height="180" viewBox="0 0 380 180" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(190 90)">
    <circle r="70" fill="none" stroke="$stroke1" stroke-width="1.5" stroke-dasharray="4 6">
      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="6s" repeatCount="indefinite"/>
    </circle>
  </g>
  <g font-family="ui-monospace, monospace" font-size="9" fill="$fg" stroke="$stroke2" stroke-width="0.8">
    <circle cx="190" cy="20" r="6" fill="$stroke2"/>
    <circle cx="280" cy="60" r="6" fill="$stroke2"/>
    <circle cx="280" cy="120" r="6" fill="$stroke2"/>
    <circle cx="190" cy="160" r="6" fill="$stroke2"/>
    <circle cx="100" cy="120" r="6" fill="$stroke2"/>
    <circle cx="100" cy="60" r="6" fill="$stroke2"/>
  </g>
</svg>

caption: "Soil-compaction feedback cycle. Six nodes, rotating dashed orbit signals the loop direction; each turn implies the next iteration accelerates."
should_demote_to_text: false

# Output via the build_animated_svg_spec tool.
"""

ANIMATED_SVG_TOOL = {
    "name": "build_animated_svg_spec",
    "description": "Build an animated inline SVG from a conversation snippet.",
    "input_schema": {
        "type": "object",
        "properties": {
            "spec": {"type": "string", "description": "Inline <svg> with SMIL or CSS animation."},
            "caption": {"type": "string"},
            "should_demote_to_text": {"type": "boolean"},
            "demotion_reason": {"type": "string"},
        },
        "required": ["spec", "caption", "should_demote_to_text", "demotion_reason"],
    },
}


def generate_animated_svg_spec(snippet: str, context: str = "", model: str = DEFAULT_MODEL) -> SpecialistResult:
    raw = _call_specialist(ANIMATED_SVG_SYSTEM, ANIMATED_SVG_TOOL, "build_animated_svg_spec", snippet, context, model)
    return _result(raw["input"], raw, model)


def main() -> None:
    """CLI for testing a specialist in isolation."""
    import argparse
    import json
    import sys
    from dataclasses import asdict

    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--type", required=True, choices=["mermaid", "vega", "html", "animated_svg"])
    p.add_argument("--snippet", required=True)
    p.add_argument("--context", default="")
    p.add_argument("--model", default=DEFAULT_MODEL)
    args = p.parse_args()

    fn = {
        "mermaid": generate_mermaid_spec,
        "vega": generate_vega_spec,
        "html": generate_html_spec,
        "animated_svg": generate_animated_svg_spec,
    }[args.type]
    try:
        result = fn(args.snippet, args.context, args.model)
    except SpecialistError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)

    json.dump(asdict(result), sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
