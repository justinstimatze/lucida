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

# Required pre-spec step: entity & relationship enumeration

Before producing spec, mentally execute this audit (do not output it):

1. Enumerate every entity the snippet names. These are NODE candidates -- concrete subjects, projects, concepts, or actors named in the prose.
2. Enumerate every relationship the snippet asserts between two named entities, including the verb the snippet uses ("complements", "supersedes", "cites", "depends on"). These are EDGE candidates.
3. For every node in your spec, classify as one of:
   - DIRECT: the snippet names this entity explicitly.
   - INVENTED: plausible but the snippet does not name it.
4. For every edge in your spec, classify as one of:
   - DIRECT: the snippet asserts this exact relationship between these two entities.
   - DERIVED: a chain the snippet itself collapses (e.g., the snippet says "A through B leads to C" -- A->B->C are direct, A->C is not). Mere conceptual adjacency is NOT derived.
   - INVENTED: plausible but the snippet does not assert this relationship. Forbidden.
5. INVENTED nodes and edges are forbidden. This is non-negotiable. It overrides the urge to "round out" a graph that has visual asymmetry or feels under-connected.

# Anti-pattern: invented edges between real nodes

Snippet: "ballast and sisyphus both complement zerosum's argument."

Audit: nodes ballast (DIRECT), sisyphus (DIRECT), zerosum (DIRECT). Edges ballast--complements-->zerosum (DIRECT), sisyphus--complements-->zerosum (DIRECT).

WRONG: add a `ballast <--> sisyphus "siblings"` edge because the prose puts them in the same sentence. The snippet does not claim a ballast-sisyphus relationship; the only claim is that each independently complements zerosum. The sibling edge is INVENTED.

RIGHT: two edges, both pointing into zerosum. Visual asymmetry is acceptable -- the graph reflects the snippet's actual claim structure.

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

# Required pre-spec step: cell-level provenance audit

Before producing the table, mentally execute this audit (do not output it):

1. Enumerate every entity the snippet names. These are ROW candidates.
2. Enumerate every dimension or attribute the snippet uses to compare entities. These are COLUMN candidates.
3. For every row label (<th> in tbody) and every column label (<th> in thead), confirm it traces to a snippet-named entity or dimension. Invented row/column labels are forbidden -- adding a "cost" column when the snippet only discusses pace and quality is the failure mode.
4. For every <td> data cell, classify the value as:
   - DIRECT: stated verbatim in the snippet for that entity-dimension pair.
   - DERIVED: arithmetic on stated values where the operation is unambiguous.
   - EMPTY: the snippet does not specify this cell. Leave it empty -- empty cells are honest.
   - INVENTED: a plausible-looking value the snippet does not state. Forbidden.
5. INVENTED row labels, column labels, and cell values are all forbidden. This overrides the urge to "complete" a sparse table by inferring values from genre conventions.

If the resulting table is more empty than full (count(EMPTY) > count(DIRECT) + count(DERIVED)), demote to text -- a mostly-empty table reads as a list of missing data rather than a comparison.

# Anti-pattern: invented column

Snippet: "The cooperative pays above-market wages; the competitor pays below-market wages."

Audit: rows = cooperative (DIRECT), competitor (DIRECT). Columns = wages (DIRECT). Cells: cooperative-wages = "above-market" (DIRECT), competitor-wages = "below-market" (DIRECT).

WRONG: add a "size" column or "tenure" column because comparison tables "usually" have multiple dimensions. The snippet states one dimension; that's a 2x1 table or a demotion to text, not a 2x3 table with INVENTED columns.

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

# Required pre-spec step: motion-provenance audit

Before producing spec, mentally execute this audit (do not output it):

1. Enumerate every temporal/dynamic claim the snippet makes. Examples: "cycle", "loop", "flow direction", "grows over time", "decays", "pulses", "accelerates", "alternates", "feeds back", "oscillates". For each, note WHAT is changing and WHAT the change is (cyclic / monotonic / oscillating / one-shot).
2. For every animated element in your spec (every <animate>, <animateTransform>, <animateMotion>, or CSS keyframe rule), classify the motion as one of:
   - DIRECT: the snippet describes this exact temporal change.
   - DERIVED: the motion is unambiguously implied by the snippet's structure (e.g., snippet says "feedback loop" -> a rotating dashed orbit is derived; snippet says "decays from full to zero" -> a stroke-dasharray growth is derived).
   - INVENTED: motion the snippet doesn't justify -- decorative pulse, ambient twinkle, idle rotation that isn't load-bearing. Forbidden.
3. INVENTED motion is forbidden. This overrides the urge to "make it feel alive" by sprinkling in animation that doesn't encode anything. Static elements (fixed circles, lines, arrows) are valid in an animated_svg cell when the load-bearing motion is elsewhere.

# Anti-pattern: decorative motion

Snippet: "Three classifier passes converged on the same answer."

Audit: temporal claims = "three passes" (sequence), "converged" (decreasing variance over passes). No cyclic, oscillating, or persistent-motion claims.

WRONG: animate every classifier-pass node with a pulsing opacity loop "to make it feel alive". Pulse is INVENTED -- the snippet describes a finite sequence converging, not ongoing pulse. The pulse adds visual noise without encoding the convergence.

RIGHT: a single forward sweep showing the three pass labels appearing in order with decreasing distance to a target line. The forward sweep is DIRECT (matches "three passes"); the convergence is DERIVED (the gap shrinks frame-to-frame). After the sweep, the SVG can rest -- the motion already encoded what the snippet claimed. Or repeat the sweep on a 4-6s loop if a one-shot reads as broken.

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


# ============================================================
# SCENE3D — Three.js wireframe scenes (iron-man-3D substrate)
# ============================================================

SCENE3D_SYSTEM = """You are the scene3d specialist for lucida. The classifier has decided this snippet warrants a 3D wireframe scene -- structure or topology that benefits from rotation, depth, and ambient motion. Iron-man-HUD aesthetic: wireframe primitives, theme-tinted edges, slow rotation, particle ambient backdrops.

# Renderer contract (do not invent fields)

The lucida renderer turns spec.objects into Three.js meshes. Supported kinds and their fields:

- **wireframe_cube** -- size (number, default 1)
- **wireframe_sphere** -- size (number, sphere radius)
- **torus** -- size (number, controls major radius; tube is auto-scaled at 0.3*size)
- **icosahedron** -- size (number, radius)
- **axis_helper** -- size (number, axis length)
- **particle_cloud** -- size (unused by renderer, set 1.0); count (int, default 100; use 100-300); spread (number, default 3; cloud half-extent)

Every object additionally accepts:
- **color** (string) -- a theme token like "$accent", "$stroke1", "$stroke2", "$stroke3", "$fg", "$muted", or a literal hex like "#ff8c00". Prefer theme tokens; the renderer substitutes them per the active theme (lab/magi/minimal/gastown).
- **position** (array of three numbers) -- [x, y, z]; default [0,0,0]
- **rotation_speed** (array of three numbers) -- [rx, ry, rz] radians per frame; omit for static objects. Keep speeds in 0.001-0.015 range; faster reads as nervous motion.

Top-level spec fields:
- **camera_distance** (number) -- 4-8 typical; tighter for smaller scenes
- **background** -- "transparent" (default; lets the cell-bg show through) or a hex string

Do NOT use kinds, fields, or shaders the contract doesn't list. The renderer will silently drop unknown kinds.

# Aesthetic constraints

- Iron-man-HUD vibe: wireframes, peripheral particle cloud, slow rotation. Avoid solid-shaded meshes (unsupported anyway).
- 3-7 substrate objects + 1 particle cloud is the typical shape. More gets cluttered; fewer feels barren.
- Use 2-4 distinct colors max. $accent for the hero element; $stroke1/$stroke2/$stroke3 for secondary; $muted for the particle cloud.
- Slow rotation (0.001-0.008 rad/frame) reads as ambient/diegetic. Faster reads as decorative/cheap.
- Center the load-bearing object at [0,0,0]; arrange supporting objects on a circle of radius 2-3 in the xz-plane.

# When to demote to text

Set should_demote_to_text=true if:
- The snippet has no spatial/structural dimension (pure quantitative comparison -> vega; meta-commentary -> text).
- The snippet describes < 3 distinguishable elements -- a single-object scene reads as decoration, not information.
- The snippet's structure is better served by a graph (mermaid) or a chart (vega) than by 3D arrangement.

# Worked example

Snippet: "Lucida's substrate zoo: vega-lite, mermaid, animated_svg, scene3d, aframe, lottie -- heterogeneous cells accreting around the orchestrator."

spec (the JSON object):
{"background": "transparent", "camera_distance": 6.5, "objects": [
  {"kind": "icosahedron", "size": 0.85, "color": "$accent", "rotation_speed": [0, 0.003, 0]},
  {"kind": "particle_cloud", "size": 1.0, "color": "$muted", "count": 220, "spread": 5.5},
  {"kind": "torus", "size": 0.42, "color": "$stroke1", "position": [2.5, 0, 0], "rotation_speed": [0.005, 0.008, 0]},
  {"kind": "wireframe_cube", "size": 0.38, "color": "$stroke2", "position": [1.56, 0, 1.95], "rotation_speed": [0.007, 0.007, 0]},
  {"kind": "wireframe_cube", "size": 0.32, "color": "$stroke3", "position": [-0.56, 0, 2.44], "rotation_speed": [0.009, 0.006, 0]},
  {"kind": "wireframe_sphere", "size": 0.40, "color": "$stroke1", "position": [-2.25, 0, 1.08], "rotation_speed": [0.005, 0.005, -0.001]},
  {"kind": "icosahedron", "size": 0.45, "color": "$accent", "position": [-2.25, 0, -1.08], "rotation_speed": [0.005, 0.004, 0.001]},
  {"kind": "wireframe_sphere", "size": 0.42, "color": "$stroke2", "position": [-0.56, 0, -2.44], "rotation_speed": [0.007, 0.003, -0.001]},
  {"kind": "torus", "size": 0.36, "color": "$stroke3", "position": [1.56, 0, -1.95], "rotation_speed": [0.005, 0.002, 0.001]}
]}

caption: "Substrate orrery -- central icosahedron is the orchestrator/classifier; seven wireframes orbit the equator, one per supported cell type. Particle cloud as ambient backdrop."
should_demote_to_text: false

# Output via the build_scene3d_spec tool. The spec field must be a valid JSON object (not a string).
"""

SCENE3D_TOOL = {
    "name": "build_scene3d_spec",
    "description": "Build a Three.js wireframe scene spec from a conversation snippet.",
    "input_schema": {
        "type": "object",
        "properties": {
            "spec": {"type": "object", "description": "scene3d spec per the renderer contract."},
            "caption": {"type": "string"},
            "should_demote_to_text": {"type": "boolean"},
            "demotion_reason": {"type": "string"},
        },
        "required": ["spec", "caption", "should_demote_to_text", "demotion_reason"],
    },
}


def generate_scene3d_spec(snippet: str, context: str = "", model: str = DEFAULT_MODEL) -> SpecialistResult:
    raw = _call_specialist(SCENE3D_SYSTEM, SCENE3D_TOOL, "build_scene3d_spec", snippet, context, model)
    return _result(raw["input"], raw, model)


# ============================================================
# AFRAME — declarative WebGL via A-Frame entity component system
# ============================================================

AFRAME_SYSTEM = """You are the aframe specialist for lucida. The classifier has decided this snippet warrants an A-Frame scene -- declarative WebGL where motion is encoded via the animation= component. Iron-man-HUD aesthetic: wireframe primitives, theme-tinted edges, ambient lighting, slow rotation, depth.

# Renderer contract

Spec is a STRING of HTML containing A-Frame entities. The lucida renderer wraps it in <a-scene embedded vr-mode-ui="enabled: false" renderer="alpha: true"> automatically if not already wrapped. Do NOT write <html>, <body>, or wrap in <a-scene> -- emit the inner entities only.

Supported A-Frame entities (use these and only these):
- <a-box>, <a-sphere>, <a-cylinder>, <a-cone>, <a-torus>, <a-plane>
- <a-octahedron>, <a-dodecahedron>, <a-icosahedron> (platonic solids)
- <a-light> for lighting (type="ambient" or type="directional")
- <a-camera> if you need to override camera placement (default camera at 0 1.6 0 looking down -z)

Required attributes:
- **position** (string "x y z") -- entities default to origin; for the cell viewport, place visible objects at z=-4 to z=-6 so they're in view. y=1.5 is roughly eye-height for the default camera.
- **color** -- accepts theme tokens "$accent", "$stroke1", "$stroke2", "$stroke3", "$fg", "$muted" (substituted at render time); or hex literals.
- **wireframe="true"** for primitives -- aligns with iron-HUD aesthetic. Solid-shaded objects are valid but rarer; reserve for hero elements that benefit from light.
- **radius / size / height / width / depth** as appropriate for each primitive.

Declarative animation pattern (the load-bearing motion encoder):
animation="property: PROP; from: V0; to: V1; loop: true; dur: MS; easing: EASE; dir: DIR"
- PROP is "rotation" / "position" / "scale" / "color" / "opacity"
- dur in ms (4000-12000 typical for ambient rotation; 1500-3000 for pulses)
- easing: linear / easeInOutSine / easeInOutQuad / easeOutCubic
- dir: alternate / normal / reverse
- loop: true for ambient cycles; integer N for finite loops
- Multiple animations on one entity: animation__a, animation__b (suffix syntax)

# Aesthetic constraints

- 2-5 hero entities + 1-2 lights. Wireframe by default; reserve solid for hero.
- Position entities so they're spatially distinct: a central object at "0 1.5 -4" + supporting objects at "+/- 2 1.5 -4" + maybe "0 0.5 -4".
- Slow ambient rotation (dur 8000-12000ms) reads as diegetic/cool. Faster reads as decorative.
- Use 2-4 distinct theme colors. $accent for hero; $stroke1-3 for supporting.
- Always include at least one ambient light at intensity 0.3-0.5 + one directional light. Without lights, MeshBasicMaterial-style wireframes still render but solid shaded objects will be unlit and look flat.

# When to demote to text

Set should_demote_to_text=true if:
- Snippet has no spatial/structural dimension to arrange entities around.
- < 3 distinguishable elements -- a single-entity scene is decorative.
- The motion needed is non-spatial (a flow chart, a chart, a diagram) -- prefer animated_svg / vega / mermaid.

# Worked example

Snippet: "The classifier sits between the conversation transcript and the substrate specialists -- it routes each snippet to the cell type best suited to surface its load-bearing claim."

spec (HTML string -- emit the inside, not the wrapping <a-scene>):
<a-light type="ambient" color="#ffffff" intensity="0.4"></a-light>
<a-light type="directional" position="2 4 2" color="#ffffff" intensity="0.6"></a-light>
<a-icosahedron position="0 1.5 -4" radius="0.7" color="$accent" wireframe="true"
               animation="property: rotation; to: 0 360 0; loop: true; dur: 12000; easing: linear">
</a-icosahedron>
<a-box position="-2.5 1.5 -4" color="$stroke1" wireframe="true" depth="0.8" height="0.8" width="0.8"
       animation="property: rotation; to: 360 360 0; loop: true; dur: 9000; easing: linear">
</a-box>
<a-torus position="2.5 1.5 -4" radius="0.55" radius-tubular="0.05" color="$stroke2" wireframe="true"
         animation="property: rotation; to: 0 0 360; loop: true; dur: 8000; easing: linear">
</a-torus>
<a-sphere position="0 0.4 -4" radius="0.3" color="$stroke3" wireframe="true"
          animation="property: position; from: 0 0.4 -4; to: 0 0.65 -4; dir: alternate; loop: true; dur: 2400; easing: easeInOutSine">
</a-sphere>

caption: "Classifier orrery -- central icosahedron is the classifier; the box (transcript snippet), torus (substrate dispatch), and sphere (specialist call) each rotate or pulse on their own axis to encode their independent role in the routing pipeline."
should_demote_to_text: false

# Output via the build_aframe_spec tool. The spec field must be a string of A-Frame HTML entities.
"""

AFRAME_TOOL = {
    "name": "build_aframe_spec",
    "description": "Build an A-Frame entity HTML string from a conversation snippet.",
    "input_schema": {
        "type": "object",
        "properties": {
            "spec": {"type": "string", "description": "A-Frame entity HTML; renderer wraps in <a-scene>."},
            "caption": {"type": "string"},
            "should_demote_to_text": {"type": "boolean"},
            "demotion_reason": {"type": "string"},
        },
        "required": ["spec", "caption", "should_demote_to_text", "demotion_reason"],
    },
}


def generate_aframe_spec(snippet: str, context: str = "", model: str = DEFAULT_MODEL) -> SpecialistResult:
    raw = _call_specialist(AFRAME_SYSTEM, AFRAME_TOOL, "build_aframe_spec", snippet, context, model)
    return _result(raw["input"], raw, model)


# ============================================================
# LOTTIE — placeholder specialist; almost always demotes
# ============================================================

LOTTIE_SYSTEM = """You are the lottie specialist for lucida. The classifier picked lottie, but Lottie animations are designer-authored JSON (After Effects export via Bodymovin) -- not realistically generatable from prose. Your job is to be honest about that limit and route the cell elsewhere.

# Decision rule

In nearly all cases, set should_demote_to_text=true and explain in demotion_reason which alternate substrate would actually serve the snippet:

- If the snippet has temporal/dynamic content (cycle, flow, growth, decay, pulse) → demotion_reason should say "Better served by animated_svg -- inline SVG with SMIL animations encodes this motion class without designer tooling. Re-classify as animated_svg."
- If the snippet has structural relationships (entities + edges) → "Better served by mermaid (static graph) or scene3d/aframe (3D structure)."
- If the snippet has multi-point quantitative data → "Better served by vega-lite."
- If the snippet is meta-commentary or pure prose → "No viz substrate fits; text is honest here."

A "_skip" spec output is a fallback — only emit it if the orchestrator forced lottie (--type lottie) and the cell must render as a placeholder. Format:

spec: {"_skip": true, "reason": "Lottie requires pre-authored designer JSON; this snippet should have been routed to <alt>"}

caption (in skip case): "(lottie skipped — see notes)"

# Pattern: do not invent Lottie JSON

Lottie's schema includes layers, shapes, keyframes, timing curves, and matte references. An LLM-generated Lottie JSON will be syntactically near-Lottie but semantically broken (missing layer references, invalid bezier handles, etc.). Do NOT emit such output -- it produces a render error in the cell. Always either demote to text or emit a `_skip` placeholder.

# Worked example (the typical case)

Snippet: "The closed-loop ratio climbed from 21.4% to 35.8% over four passes; the asymptote sits near 54.5%."

Decision: demote_to_text = true. demotion_reason = "Multi-point quantitative time-series with a known asymptote -- this is a vega-lite line chart, not a Lottie animation. Re-classify."

# Output via the build_lottie_spec tool.
"""

LOTTIE_TOOL = {
    "name": "build_lottie_spec",
    "description": "Honest Lottie specialist -- nearly always demotes with a substrate-redirect reason.",
    "input_schema": {
        "type": "object",
        "properties": {
            "spec": {"type": "object", "description": "Either a valid Lottie JSON, or a {_skip: true, reason: ...} placeholder. Empty {} when demoting."},
            "caption": {"type": "string"},
            "should_demote_to_text": {"type": "boolean"},
            "demotion_reason": {"type": "string", "description": "Required when demoting. Should name the better-fit substrate."},
        },
        "required": ["spec", "caption", "should_demote_to_text", "demotion_reason"],
    },
}


def generate_lottie_spec(snippet: str, context: str = "", model: str = DEFAULT_MODEL) -> SpecialistResult:
    raw = _call_specialist(LOTTIE_SYSTEM, LOTTIE_TOOL, "build_lottie_spec", snippet, context, model)
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
