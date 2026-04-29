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
    shape_hint: str = "",
) -> dict:
    """Shared API-call boilerplate. Returns dict with input + usage.

    shape_hint, when non-empty, is prepended to the user message as an
    authoritative override (the classifier's per-snippet shape pick).
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise SpecialistError("ANTHROPIC_API_KEY not set in env or .env")
    try:
        import anthropic
    except ImportError as e:
        raise SpecialistError("anthropic SDK not installed") from e

    client = anthropic.Anthropic(api_key=api_key)
    hint_block = f"[shape hint from classifier: {shape_hint}]\n\n" if shape_hint.strip() else ""
    user_msg = f"{hint_block}Snippet:\n{snippet.strip()}\n\nContext:\n{context.strip() or '(none)'}"

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
    # Animated_svg specialist sometimes omits or empties the spec field
    # when it intuits "no motion to encode" — even though the schema marks
    # spec required and the prompt says "demote to text". Empirically the
    # API allows the omission through. Convert that into a clean demote
    # so the orchestrator suppresses cleanly instead of bare-except'ing
    # the KeyError and minting an empty stub. Audit 2026-04-29: 32/118
    # empty animated_svg cells, all with notes "specialist failed: 'spec'".
    spec_value = inp.get(spec_field)
    if not spec_value:
        return SpecialistResult(
            spec="",
            caption=inp.get("caption", ""),
            should_demote_to_text=True,
            demotion_reason=(
                inp.get("demotion_reason")
                or f"specialist returned no {spec_field}; treating as demote"
            ),
            model=model,
            cache_read_tokens=raw["cache_read_tokens"],
            cache_creation_tokens=raw["cache_creation_tokens"],
            input_tokens=raw["input_tokens"],
            output_tokens=raw["output_tokens"],
        )
    return SpecialistResult(
        spec=spec_value,
        caption=inp.get("caption", ""),
        should_demote_to_text=bool(inp.get("should_demote_to_text", False)),
        demotion_reason=inp.get("demotion_reason", ""),
        model=model,
        cache_read_tokens=raw["cache_read_tokens"],
        cache_creation_tokens=raw["cache_creation_tokens"],
        input_tokens=raw["input_tokens"],
        output_tokens=raw["output_tokens"],
    )


def split_mermaid_subgraphs(spec: str) -> list[tuple[str, str]] | None:
    """Tufte small-multiples split for mermaid graph/flowchart specs.

    Parses a mermaid spec; if it has 2+ top-level subgraph blocks,
    returns [(child_spec, child_label), ...] — one entry per subgraph,
    each a complete standalone graph spec preserving the original
    diagram type and the subgraph's full body (nodes + intra-subgraph
    edges).

    Top-level edges (declared outside any subgraph) are dropped: under
    Tufte's small-multiples principle, the inter-cluster relationships
    become adjacency-on-the-dashboard rather than rendered edges. The
    layout's proximity carries that information once the cells are
    siblings.

    Returns None when no split is appropriate (no graph header, fewer
    than 2 subgraphs, or non-flowchart diagram type).
    """
    if not spec or not isinstance(spec, str):
        return None
    lines = spec.split("\n")

    header = ""
    body_start = 0
    for i, line in enumerate(lines):
        s = line.strip()
        if not s:
            continue
        if s.startswith(("graph ", "flowchart ")):
            header = s
            body_start = i + 1
            break
        return None
    if not header:
        return None

    subgraphs: list[tuple[str, list[str]]] = []
    current_label: str | None = None
    current_body: list[str] = []
    depth = 0

    for line in lines[body_start:]:
        stripped = line.strip()
        if stripped.startswith("subgraph "):
            if depth == 0:
                rest = stripped[len("subgraph "):].strip()
                if "[" in rest and "]" in rest:
                    label = rest[rest.index("[") + 1:rest.rindex("]")].strip().strip('"').strip("'")
                else:
                    label = rest.split(None, 1)[0] if rest else "subgraph"
                current_label = label
                current_body = []
                depth = 1
            else:
                current_body.append(line)
                depth += 1
        elif stripped == "end":
            if depth >= 1:
                depth -= 1
                if depth == 0:
                    subgraphs.append((current_label or "subgraph", current_body))
                    current_label = None
                    current_body = []
                else:
                    current_body.append(line)
        elif depth >= 1:
            current_body.append(line)
        # depth == 0 lines outside subgraphs (top-level edges, blanks) are dropped

    if len(subgraphs) < 2:
        return None

    children: list[tuple[str, str]] = []
    for label, body in subgraphs:
        body_text = "\n".join(body).rstrip()
        if not body_text.strip():
            continue
        child_spec = f"{header}\n{body_text}"
        children.append((child_spec, label))

    return children if len(children) >= 2 else None


# ============================================================
# MERMAID
# ============================================================

MERMAID_SYSTEM = """You are the mermaid specialist for lucida. The classifier has decided this snippet warrants a structural diagram. Your job: produce valid mermaid syntax that's a faithful structural map of what the snippet says.

Mermaid offers several diagram types — flowchart, mindmap, timeline, sankey-beta, sequenceDiagram, stateDiagram-v2, quadrantChart. Pick the type that matches the snippet's structural shape. Bias toward variety; if every cell on the dashboard is `graph LR`, the substrate reads as monotonous. Default to flowchart only when none of the more-specific types fit.

# Shape hint from classifier (authoritative)

If the user message starts with `[shape hint from classifier: diagram type = X. ...]`, the classifier has already inspected this snippet and picked X based on its shape. Treat that as authoritative — produce an X-typed spec. The classifier sees a different framing of the snippet than you do and is upstream of you in the pipeline; its pick overrides your defaults. The only way to refuse the hint is to demote to text (set should_demote_to_text=true with a one-line demotion_reason explaining why even the hinted shape can't be grounded). Do not silently downgrade an X hint to flowchart.

# Pick the diagram type

Match snippet shape to mermaid type. Prefer the most specific fit.

- **timeline** — ordered events along a sequence/time axis. Snippet shape: "first X, then Y, then Z" / dated milestones / version history / pipeline stages.
- **mindmap** — concept hierarchy: root + branches, no inter-branch edges. Snippet shape: "the components of X are A, B, C; A includes A1, A2; B includes B1, B2."
- **sankey-beta** — flows between nodes with numeric quantity. Snippet shape: "X people went to A, Y to B, Z to C" / budget allocation / funnel attrition / energy flow.
- **sequenceDiagram** — multi-actor message exchange in time order. Snippet shape: "user asks Claude X, Claude calls tool Y, tool returns Z, Claude responds W."
- **stateDiagram-v2** — finite states with transitions between them. Snippet shape: "X starts pending, becomes minting, then either completes or errors; error retries to minting."
- **quadrantChart** — 2x2 categorization on two named axes. Snippet shape: "high-impact-low-effort, high-impact-high-effort, low-impact-low-effort, low-impact-high-effort."
- **flowchart** (`graph TD` / `graph LR`) — directed graph of named entities with heterogeneous relationships. Default for "X relates to Y, Z, W in different ways" / architecture / dependency maps.

If two types fit, pick the more specific one: timeline > flowchart for ordered events; mindmap > flowchart for pure trees; sequenceDiagram > flowchart for actor-actor messages; sankey-beta > flowchart when quantities matter.

# Constraints (substrate-grounding)

- Only entities the snippet explicitly names. For sankey-beta, only flows the snippet quantifies. For timeline, only events/dates the snippet asserts. For sequenceDiagram, only messages the snippet describes.
- Labels and edge verbs reflect what the snippet actually says (e.g. "complements", "depends on", "cites") -- not invented genre conventions.
- Use directed edges (-->, -.->) for asymmetric relationships in flowchart; undirected (---) only when direction really isn't claimed.
- Use \\n for line breaks within node labels (flowchart syntax).
- **No embedded quotes inside flowchart node labels.** Labels are wrapped in double quotes (`X["label"]`), and mermaid's parser does NOT accept `\\"` escape sequences inside -- it errors with `Parse error... Expecting 'STR'`. Rephrase to avoid the quote (e.g. `extractCmd hook` instead of `extractCmd \\"hook\\"`), or replace with the HTML entity `#quot;` (e.g. `X["foo #quot;hook#quot; bar"]`). Same for single quotes.
- **Flowchart well-formedness**: every edge endpoint must be declared as a labeled node BEFORE the edge appears. `A -->|closes| F` is invalid if F has no `F["..."]` declaration above. The audit treats undeclared endpoints as INVENTED nodes. If you reference a node ID, declare it.
- **Planning-paragraph trap**: if the snippet's main predicate is a cognitive verb (examines, considers, designs, proposes, evaluates) and the structural entities are referents of that cognition rather than declared actors, the structural artifact lives in the snippet's *referent*, not the snippet. Set should_demote_to_text=true with a one-line demotion_reason. The classifier-side meta-narration gate catches most of these upstream, but trust your own audit when it slips through.

# Required pre-spec audit

Before producing spec, mentally execute (do not output):

1. Pick the diagram type per the rules above.
2. Enumerate every entity the snippet names. These are NODE / actor / branch candidates depending on the type.
3. Enumerate every relationship asserted between two named entities, including the snippet's verb. These are EDGE / message / transition / flow candidates.
4. For every entity in your spec, classify as DIRECT (named) or INVENTED (not named — forbidden).
5. For every relationship, classify as DIRECT (asserted), DERIVED (a chain the snippet itself collapses — "A through B leads to C" makes A->B->C direct; A->C is not), or INVENTED (forbidden).
6. INVENTED entities and relationships are forbidden. This overrides the urge to "round out" a graph that feels under-connected or asymmetric.

# Anti-pattern: invented edges between real nodes

Snippet: "ballast and sisyphus both complement zerosum's argument."

Audit: nodes ballast (DIRECT), sisyphus (DIRECT), zerosum (DIRECT). Edges ballast--complements-->zerosum (DIRECT), sisyphus--complements-->zerosum (DIRECT).

WRONG: add a `ballast <--> sisyphus "siblings"` edge because the prose puts them in the same sentence. The snippet does not claim a ballast-sisyphus relationship.

RIGHT: two edges, both pointing into zerosum. Visual asymmetry is acceptable -- the graph reflects the snippet's actual claim structure.

# When to demote to text

Set should_demote_to_text=true if:
- Fewer than 3 distinct entities (or for type-specific minima: fewer than 2 dated events for timeline, fewer than 2 actors for sequenceDiagram, fewer than 2 quantified flows for sankey-beta).
- No claimed relationships between entities (just a list).
- The snippet's content is meta-cognitive or analytic, not structural.

# Worked examples

## Flowchart (the workhorse — but don't pick it by default)

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

## Timeline (ordered events)

Snippet: "The build pipeline runs lint first, then unit tests, then bundles assets, then deploys to staging. Any failure aborts the pipeline."

spec:
timeline
    title CI pipeline stages
    Stage 1 : lint
    Stage 2 : unit tests
    Stage 3 : bundle assets
    Stage 4 : deploy to staging

caption: "Linear CI pipeline. Each stage gates the next; failure at any step aborts the run."
should_demote_to_text: false

## Mindmap (concept hierarchy)

Snippet: "Lucida has three layers: ingestion (watcher reads logs, classifier picks substrate), generation (specialist prompts produce specs), and rendering (browser inflates specs into cells)."

spec:
mindmap
  root((lucida))
    ingestion
      watcher reads logs
      classifier picks substrate
    generation
      specialist prompts
      produce specs
    rendering
      browser inflates specs
      into cells

caption: "Lucida architecture as a three-branch hierarchy. Each layer's responsibilities live as leaf nodes."
should_demote_to_text: false

## Sankey-beta (quantified flows)

Snippet: "Of 100 cells minted last hour, 60 became mermaid, 25 html, 10 vega, 5 animated_svg. 56 mermaid cells rendered cleanly; 4 errored."

spec:
sankey-beta
mints,mermaid,60
mints,html,25
mints,vega,10
mints,animated_svg,5
mermaid,rendered,56
mermaid,errored,4

caption: "Mint pipeline flow over the last hour. Total volume splits across substrates; mermaid further splits into render outcomes."
should_demote_to_text: false

# Output via the build_mermaid_spec tool.
"""

MERMAID_TOOL = {
    "name": "build_mermaid_spec",
    "description": "Build a mermaid spec from a conversation snippet. Pick the diagram type (timeline, mindmap, sankey-beta, sequenceDiagram, stateDiagram-v2, quadrantChart, or flowchart) that matches the snippet's structural shape.",
    "input_schema": {
        "type": "object",
        "properties": {
            "spec": {"type": "string", "description": "Valid mermaid syntax in any of the supported diagram types (timeline, mindmap, sankey-beta, sequenceDiagram, stateDiagram-v2, quadrantChart, flowchart). Pick by snippet shape."},
            "caption": {"type": "string", "description": "1-2 sentence summary of what the diagram shows."},
            "should_demote_to_text": {"type": "boolean"},
            "demotion_reason": {"type": "string", "description": "If demoting, why; else empty."},
        },
        "required": ["spec", "caption", "should_demote_to_text", "demotion_reason"],
    },
}


def generate_mermaid_spec(
    snippet: str,
    context: str = "",
    model: str = DEFAULT_MODEL,
    subtype_hint: str = "",
) -> SpecialistResult:
    hint = ""
    if subtype_hint and subtype_hint != "n/a":
        hint = f"diagram type = {subtype_hint}. Produce a {subtype_hint} spec unless the snippet shape genuinely cannot support it (in which case demote to text)"
    raw = _call_specialist(MERMAID_SYSTEM, MERMAID_TOOL, "build_mermaid_spec", snippet, context, model, shape_hint=hint)
    return _result(raw["input"], raw, model)


# ============================================================
# VEGA
# ============================================================

VEGA_SYSTEM = """You are the vega specialist for lucida. The classifier has decided this snippet warrants a vega-lite chart. Your job: produce a valid vega-lite v5 JSON spec grounded in the snippet's actual numeric claims.

# Constraints

- Use real numbers from the snippet. Do NOT invent values, time series, or distributions.
- Restrained palette; avoid full-saturation reds. Movie-interface vibe where applicable.
- Set "background": "transparent" so the cell-bg shows through (the lucida theme provides background color).
- **Use `"width": "container"`** — let vega-lite size to the cell body responsively. Hardcoded widths (400-600px) overflow narrow cells: cell bodies render 380-500px wide, so a `"width": 500` spec gets clipped by `overflow: hidden` in cells under 500px. Container mode adapts. Height: 60-200 typical for a single-claim chart; 200-340 for stream / area / scatter / boxplot where vertical resolution matters.
- **Pick the chart type from the data shape, not the "bar default".** Vega-lite supports a wide chart vocabulary; the dashboard has been over-rendering bar charts. Use the type the data wants:
  - **bar** — categorical comparison along one axis (default for 2-N named categories with one numeric)
  - **line** — temporal trend, one or more series indexed by time
  - **area** — temporal trend where the magnitude itself is the load-bearing claim (cumulative growth, share over time); stacked-area for compositional change
  - **point / scatter** — relationship between two quantitative dimensions; reach for this any time the snippet pairs two numerics per item (e.g., `{score, runtime}` per cell)
  - **circle / bubble** — scatter with a third quantitative encoded in size
  - **rule + tick** — small-multiple distributions, vertical rule lines marking quantiles
  - **arc** — pie / donut for compositional shares of a whole. **Avoid unless the whole-vs-part relationship is genuinely the load-bearing claim AND there are 2-3 slices.** Pie/arc geometry is fixed-radius pixel-based, not container-responsive: a pie with outerRadius:70 uses ~140px regardless of cell width, leaving huge horizontal whitespace in wider cells (e.g., the hero cell at ~1100px renders a pie chart with ~400px of dead space on each side). For "share of a whole" snippets, prefer **stacked bar (single category, segmented)** or **horizontal bar with totals** — both fill the cell width and read at any size. If you must pick arc, donut (innerRadius > 0) reads marginally better at small sizes.
  - **rect / heatmap** — two-categorical-axis matrices, cooccurrence, calendar heatmaps
  - **errorbar / errorband** — quantitative + uncertainty interval (target-vs-observed with error)
  - **boxplot** — distributions across categories
  - **trail** — line where stroke-width encodes a quantity along the path
  - **density / quantile transforms** for histograms / KDEs
  - **layer / facet / repeat** — overlays or small multiples; reach for `facet` when the snippet describes the same shape across N groups (small multiples > one busy chart)
  - For sankey/sunburst/treemap-shaped data, demote to mermaid (sankey/mindmap) or scene3d (3D treemap) — vega-lite has no native sankey.
- Single-value charts (one bar) usually warrant demotion to text instead.
- **Preserve epistemic markers.** If the snippet uses "may", "if", "unconfirmed", "hypothetical", "target vs. observed", or frames a number as a hypothesis, the chart and caption must preserve that hedge. Rendering an unconfirmed claim as a confirmed data row (row label `target` for a value the snippet calls a hypothetical destination) is INVENTED framing, not DIRECT. If the snippet says "20% is the kill threshold, may not hit it", the chart row for 20 is labeled `kill threshold (unconfirmed)` or similar — never `target`. Caption phrasing must match: "the audit confirms WHETHER the drop is real" stays hypothetical; do not paraphrase as "the audit confirms the drop is real". When the snippet's epistemic markers can't fit in row labels, demote to text.
- **Don't invent group labels.** If the snippet distinguishes data points only by their numeric values (e.g., "seed 2 produced 23.38, seeds 0,1,3,4 produced 18.71"), do NOT add a categorical group label like `Response A` / `Response B` to encode the distinction. The snippet does not name the groups; naming them invents structure. Encode the distinction visually (color, shape) without inventing string labels.
- **Don't override `axis.labelLimit`.** Vega-lite's default (180px) is correct for lucida cell widths. Cells often render in 380-500px-wide bodies; a 300px label limit eats most of the plot. If a category label needs to be longer than ~28 chars to be intelligible, abbreviate the data row's name (e.g., `"cinematic family (Powers-of-Ten + match-cut)"` → `"cinematic family"`) and put the full description in the caption. The theme config sets a 160px ceiling at the chart level — don't fight it.

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
{"$schema": "https://vega.github.io/schema/vega-lite/v5.json", "background": "transparent", "data": {"values": [{"series": "productivity", "growth_pct": 65}, {"series": "median real hourly compensation", "growth_pct": 14}]}, "mark": "bar", "encoding": {"y": {"field": "series", "type": "nominal", "axis": {"title": null}}, "x": {"field": "growth_pct", "type": "quantitative", "axis": {"title": "growth %, 1979-2019"}}, "color": {"field": "series", "type": "nominal", "legend": null}}, "width": "container", "height": 100}

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

HTML_SYSTEM = """You are the html specialist for lucida. The classifier has decided this snippet warrants an HTML layout. Your job: produce clean semantic HTML grounded in the snippet's claims.

The substrate supports four layout patterns. Pick the one that matches the snippet's structural shape; do not default to <table>. Bias toward variety; if every html cell is a comparison table, the dashboard reads as monotonous.

# Shape hint from classifier (authoritative)

If the user message starts with `[shape hint from classifier: layout pattern = X. ...]`, the classifier has already inspected this snippet and picked X based on its shape. Treat that as authoritative — produce an X-pattern layout. The classifier sees a different framing of the snippet than you do and is upstream of you in the pipeline; its pick overrides your defaults. The only way to refuse the hint is to demote to text (set should_demote_to_text=true with a one-line demotion_reason explaining why even the hinted layout can't be grounded). Do not silently downgrade a callouts/dl/kanban hint to <table>.

# Pick the layout pattern

Match snippet shape to layout. Prefer the most specific fit.

- **<table>** — multi-entity × multi-dimension comparison. 2+ entities AND 2+ shared dimensions. Snippet shape: "X has wages Y and prices Z; W has wages V and prices U."
- **<dl>** (definition list) — term ↔ definition / glossary / property bag. Single entity with several attributes, OR several term/definition pairs that aren't comparable across a shared axis. Snippet shape: "X means Y; Z means W; V means U."
- **callout cards** — single big number/value per item, foregrounded. Snippet shape: "X has 47 cells, Y has 152 cells, Z has 8 cells" / status counts / single-stat readouts. Render as `<div class="callouts"><div class="callout"><div class="big">VALUE</div><div class="label">LABEL</div></div>...</div>`.
- **kanban columns** — items grouped by status, each status a column. Snippet shape: "in pending: A, B; in progress: C; done: D, E." Render as `<div class="kanban"><div class="kanban-col"><div class="kanban-title">STATUS</div><ul><li>item</li>...</ul></div>...</div>`.

If two patterns fit, pick the more specific one: callout cards > table when the cells would all be single numbers; kanban > table when columns are statuses and cells are item lists; <dl> > table when there's one entity with attributes (no comparison axis).

# Constraints

- No inline styles -- the lucida theme handles styling via notebook.css. Use the class names listed above (`callouts`, `callout`, `big`, `label`, `kanban`, `kanban-col`, `kanban-title`) so theme tokens apply.
- Only entities the snippet names. (For tables: rows. For <dl>: <dt> terms. For callouts: each card's label. For kanban: each <li> item.)
- Only dimensions / values the snippet states. Empty cells / missing dt-dd pairs / absent cards are more honest than invented ones.
- Keep markup compact: single line of HTML if possible (no extraneous whitespace inside tags).
- **Planning-paragraph trap**: same as mermaid — if the snippet's main predicate is a cognitive verb (examines, considers, designs, proposes) and the layout's content would be projections of *what someone is thinking about* rather than *declared entities*, demote to text. The classifier-side gate catches most of these; trust your own audit when one slips through.
- **Preserve epistemic markers.** If a snippet describes "before X / after Y" where Y is hypothetical or unconfirmed, the rendered value must carry the hedge ("Y (target)", "Y (proposed)") — do not present it as a stated state.

# Required pre-spec audit

Before producing the markup, mentally execute (do not output):

1. Pick the layout pattern per the rules above.
2. Enumerate every entity the snippet names. These become rows / dt terms / callout labels / kanban items.
3. Enumerate every dimension, value, or status the snippet states.
4. For every label (<th>, <dt>, .label, .kanban-title), confirm it traces to a snippet-named entity, dimension, or status.
5. For every value cell (<td>, <dd>, .big, <li>), classify as:
   - DIRECT: stated verbatim in the snippet.
   - DERIVED: arithmetic on stated values where the operation is unambiguous.
   - EMPTY: the snippet does not specify this. Leave empty / omit -- absences are honest.
   - INVENTED: plausible-looking value the snippet does not state. Forbidden.
6. INVENTED labels and values are forbidden. This overrides the urge to "complete" sparse content by inferring from genre conventions.

For tables specifically: if EMPTY cells outnumber DIRECT+DERIVED cells, demote to text or pick a non-table layout (a 2-cell table is usually better as a 2-card callout grid).

# Anti-pattern: invented column

Snippet: "The cooperative pays above-market wages; the competitor pays below-market wages."

Audit: 2 entities × 1 dimension. WRONG: add a "size" column or "tenure" column. The snippet states one dimension. RIGHT: 2x1 table, or callout cards (one card per company with the wage value as .big), or demote to text if the visual return is low.

# When to demote to text

Set should_demote_to_text=true if:
- Fewer than 2 entities AND no clear single-entity attribute set (a 1x1 table or single callout card reads as prose).
- The "comparison" is asymmetric and any non-text layout would be mostly empty.
- The snippet's content is meta-cognitive rather than structural (planning-paragraph trap).

# Worked examples

## Comparison table (the workhorse — but don't pick it by default)

Snippet: "The cooperative pays above-market wages and the competitor next to it pays below-market wages and can therefore offer lower prices; to remain solvent, the cooperative either matches the lower wages or loses the customer."

html: "<table><thead><tr><th></th><th>cooperative</th><th>competitor</th></tr></thead><tbody><tr><td>wages paid</td><td>above-market</td><td>below-market</td></tr><tr><td>prices charged</td><td></td><td>lower</td></tr><tr><td>solvency response</td><td>match wages OR lose customer</td><td></td></tr></tbody></table>"

caption: "Cooperative vs competitor wage/price tension. Empty cells where the snippet underspecifies."
should_demote_to_text: false

## Callout cards (single big value per item)

Snippet: "Last hour the watcher minted 62 cells: 24 mermaid, 18 html, 12 animated_svg, 8 vega."

html: "<div class=\\"callouts\\"><div class=\\"callout\\"><div class=\\"big\\">62</div><div class=\\"label\\">total mints</div></div><div class=\\"callout\\"><div class=\\"big\\">24</div><div class=\\"label\\">mermaid</div></div><div class=\\"callout\\"><div class=\\"big\\">18</div><div class=\\"label\\">html</div></div><div class=\\"callout\\"><div class=\\"big\\">12</div><div class=\\"label\\">animated svg</div></div><div class=\\"callout\\"><div class=\\"big\\">8</div><div class=\\"label\\">vega</div></div></div>"

caption: "Mint volume by substrate over the last hour. Single-number readouts as one big stat per card."
should_demote_to_text: false

## Definition list (term ↔ definition)

Snippet: "drop_meme is a tool with three params: surface (where the meme appears), target_id (which cell), and reason (free-text justification). Returns the dropped meme's id."

html: "<dl><dt>surface</dt><dd>where the meme appears</dd><dt>target_id</dt><dd>which cell</dd><dt>reason</dt><dd>free-text justification</dd><dt>returns</dt><dd>the dropped meme's id</dd></dl>"

caption: "drop_meme tool parameters and return value."
should_demote_to_text: false

## Kanban columns (items grouped by status)

Snippet: "Bucket 1 (classifier deprioritization) is done; bucket 2 (specialist diversification) is in progress with mermaid and html updated; buckets 3 (new substrate types) and 4 (visual consistency pass) are still pending."

html: "<div class=\\"kanban\\"><div class=\\"kanban-col\\"><div class=\\"kanban-title\\">done</div><ul><li>bucket 1: classifier deprioritization</li></ul></div><div class=\\"kanban-col\\"><div class=\\"kanban-title\\">in progress</div><ul><li>bucket 2: specialist diversification</li></ul></div><div class=\\"kanban-col\\"><div class=\\"kanban-title\\">pending</div><ul><li>bucket 3: new substrate types</li><li>bucket 4: visual consistency pass</li></ul></div></div>"

caption: "Substrate-diversification roadmap, items grouped by current status."
should_demote_to_text: false

# Output via the build_html_spec tool.
"""

HTML_TOOL = {
    "name": "build_html_spec",
    "description": "Build an HTML layout string from a conversation snippet. Pick the layout pattern (table, callouts, dl, or kanban) that matches the snippet's structural shape.",
    "input_schema": {
        "type": "object",
        "properties": {
            "html": {"type": "string", "description": "Clean semantic HTML using one of the supported layout patterns (<table>, <div class=\"callouts\">, <dl>, or <div class=\"kanban\">). No inline styles. Pick by snippet shape."},
            "caption": {"type": "string"},
            "should_demote_to_text": {"type": "boolean"},
            "demotion_reason": {"type": "string"},
        },
        "required": ["html", "caption", "should_demote_to_text", "demotion_reason"],
    },
}


def generate_html_spec(
    snippet: str,
    context: str = "",
    model: str = DEFAULT_MODEL,
    layout_hint: str = "",
) -> SpecialistResult:
    hint = ""
    if layout_hint and layout_hint != "n/a":
        hint = f"layout pattern = {layout_hint}. Produce a {layout_hint} layout unless the snippet shape genuinely cannot support it (in which case demote to text)"
    raw = _call_specialist(HTML_SYSTEM, HTML_TOOL, "build_html_spec", snippet, context, model, shape_hint=hint)
    return _result(raw["input"], raw, model, spec_field="html")


# ============================================================
# TREEMAP
# ============================================================

TREEMAP_SYSTEM = """You are the treemap specialist for lucida. The classifier has decided this snippet's structural content is a hierarchy or a part-to-whole quantitative breakdown that benefits from Shneiderman's treemap visualization (size encodes magnitude, nesting encodes hierarchy).

# When treemap fits

A treemap is the right substrate when the snippet describes:
- A part-to-whole quantitative breakdown ("of 2400 cells, 920 are mermaid, 670 html, 340 text, 290 vega, 130 animated_svg, 50 scene3d") — sizes are directly comparable.
- A hierarchical breakdown with quantities at multiple levels (file tree with byte sizes; org chart with team sizes; KB clusters with member counts).
- Budget allocation, funnel attrition with named segments, traffic share by source.

A treemap is NOT the right substrate when:
- The snippet has only 2-3 categories (callouts/bar are clearer).
- The numbers don't add up to a meaningful whole (an unrelated list of metrics).
- The structure is relational (use mermaid) or temporal (use animated_svg / line chart).

# Spec format

Produce a JSON object:

  {
    "title": "<short caption-friendly title>",
    "items": [
      {"label": "<name>", "value": <number>},
      {"label": "<name>", "value": <number>, "children": [
        {"label": "<sub-name>", "value": <number>},
        ...
      ]},
      ...
    ]
  }

- `items` is the top-level partition. Each item has a label (string) and a value (number, in whatever unit the snippet uses — bytes, count, percent, $).
- `children` (optional) for hierarchical breakdowns. Children's values must sum to (or roughly approximate) the parent's value.
- Use the snippet's actual numbers. Do NOT invent values.
- Labels: short (1-3 words ideal). The renderer truncates at tile width, so longer labels lose visual fidelity.

# Constraints (substrate-grounding)

- Only entities the snippet explicitly names. Don't invent categories.
- Only values the snippet explicitly states (or derived via unambiguous arithmetic).
- Minimum 4 leaves at the top level; below that, callouts (html) reads better.
- Maximum ~12 leaves at the top level; above that, fine tiles become unreadable.

# When to demote to text

Set should_demote_to_text=true if:
- Fewer than 4 leaves can be grounded in the snippet.
- The "values" in the snippet aren't quantitative (just labeled buckets without sizes).
- The snippet's claim is about a relationship between named entities, not their relative size — that's mermaid territory.

# Worked example

Snippet: "Last 24 hours of mints by substrate: 920 mermaid, 670 html, 340 text, 290 vega, 130 animated_svg, 50 scene3d. Total 2400 cells."

spec:
{
  "title": "24h mint distribution by substrate",
  "items": [
    {"label": "mermaid", "value": 920},
    {"label": "html", "value": 670},
    {"label": "text", "value": 340},
    {"label": "vega", "value": 290},
    {"label": "animated_svg", "value": 130},
    {"label": "scene3d", "value": 50}
  ]
}

caption: "Substrate distribution over the last 24h. mermaid + html together account for ~66% of mints; scene3d trails."
should_demote_to_text: false

# Output via the build_treemap_spec tool.
"""

TREEMAP_TOOL = {
    "name": "build_treemap_spec",
    "description": "Build a treemap spec (Shneiderman 1991) from a conversation snippet with hierarchical or part-to-whole quantitative content.",
    "input_schema": {
        "type": "object",
        "properties": {
            "spec": {
                "type": "object",
                "description": "Treemap spec: { title?: string, items: [{label, value, children?}, ...] }. Values must come from the snippet.",
            },
            "caption": {"type": "string"},
            "should_demote_to_text": {"type": "boolean"},
            "demotion_reason": {"type": "string"},
        },
        "required": ["spec", "caption", "should_demote_to_text", "demotion_reason"],
    },
}


def generate_treemap_spec(snippet: str, context: str = "", model: str = DEFAULT_MODEL) -> SpecialistResult:
    raw = _call_specialist(TREEMAP_SYSTEM, TREEMAP_TOOL, "build_treemap_spec", snippet, context, model)
    return _result(raw["input"], raw, model)


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

# Figure vocabulary (humans, creatures, performers)

When the snippet involves a person — a comedian on stage, an audience, a runner, a worker, a speaker, a child — render as **stick figures**, not as head-on-rectangle silhouettes. A head-only-plus-torso shape reads as a chess pawn, not a person; the audience can't tell whether a body has agency without arms and legs, and figures without arms can't be performing the action the snippet describes.

A correct stick figure is six parts:

1. **Head** — circle, r=4-6, top.
2. **Neck (optional)** — short line, 2-4px, between head and torso.
3. **Torso** — line OR thin rounded rect from below the head down to hip-level. Length ≈ 2.5-3× head radius.
4. **Two arms** — lines radiating from the top of the torso (or just below the neck join). Default pose: arms angled outward and slightly down. For specific actions, position arms accordingly: a comedian holding a mic has one arm raised toward the mic; a relaxed audience member has arms by their side; a runner has arms swinging.
5. **Two legs** — lines radiating from the bottom of the torso. Default pose: legs angled outward and down (small "A" stance).
6. **Optional details** — eyes/mouth on the head if expression matters; props (mic, instrument, briefcase) attached to a specific hand position.

Concrete reference (a person standing center-stage, ~36px tall):
```
<g stroke="$fg" stroke-width="2" stroke-linecap="round" fill="none">
  <circle cx="50" cy="20" r="5" fill="$fg"/>           <!-- head -->
  <line x1="50" y1="25" x2="50" y2="48"/>              <!-- torso -->
  <line x1="50" y1="32" x2="38" y2="42"/>              <!-- left arm -->
  <line x1="50" y1="32" x2="62" y2="42"/>              <!-- right arm -->
  <line x1="50" y1="48" x2="42" y2="62"/>              <!-- left leg -->
  <line x1="50" y1="48" x2="58" y2="62"/>              <!-- right leg -->
</g>
```

This is the floor — every human figure has arms and legs. Animate the part the snippet says is moving (arms swinging on a runner, head turning on a listener) and leave the rest static. **Do not omit limbs**. A figure without arms is a flag — it tells the user the prompt didn't specify enough, not that the figure is meant to be armless.

For multiple figures (an audience, a crowd, a queue), use the same stick-figure vocabulary at smaller scale — don't switch to circle+rect because "a crowd of small figures is hard". Repeat the 6-part figure at r=3-4 head, ~18-22px tall. Vary x positions and slight stance differences so they don't look like a stamp.

# When to demote to text

Set should_demote_to_text=true if:
- The snippet doesn't have a temporal/dynamic dimension to animate.
- A static SVG would carry the same information.
- The snippet is meta-cognitive (about reading, framing) rather than depicting flow/cycle/change.

When demoting, still emit a valid (possibly minimal) `spec` value — the schema requires it. An empty string or a stub `<svg></svg>` is fine; the orchestrator suppresses the cell entirely when should_demote_to_text=true, so the spec content is unused.

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

SCENE3D_SYSTEM = """You are the scene3d specialist for lucida. The classifier has decided this snippet warrants a 3D scene -- either (a) structure / topology that benefits from rotation, depth, and ambient motion (Iron-man-HUD wireframe vocabulary, theme-tinted edges, slow rotation, particle ambient backdrops), or (b) a chart whose data shape benefits from depth: 3D extruded bar grids (one wireframe_cube per data point, positioned on the xy-plane, size or z-position encoding the value), 3D scatter (one icosahedron per point, position from three quantitatives), surface / heightmap (a grid of wireframe_cubes whose sizes form the surface). Same renderer contract for both modes -- you compose the scene out of the same primitives.

# Renderer contract (do not invent fields)

The lucida renderer turns spec.objects into Three.js meshes. Supported kinds and their fields:

- **wireframe_cube** -- size (number, default 1)
- **wireframe_sphere** -- size (number, sphere radius)
- **torus** -- size (number, controls major radius; tube is auto-scaled at 0.3*size)
- **icosahedron** -- size (number, radius)
- **axis_helper** -- size (number, axis length)
- **particle_cloud** -- size (unused by renderer, set 1.0); count (int, default 100; use 100-300); spread (number, default 3; cloud half-extent)
- **cylinder** -- size (number, radius); height (number, default 2*size). Vertical column / tower / pole; the natural shape for repo skylines, value towers, sensor poles.
- **cone** -- size (number, base radius); height (number, default 2*size). Directional / pointer / spike shape; useful for "this points to X" semantics.
- **plane** -- size (number, width); height (number, default = width). Flat layered surface; reach for it on stacked-strata snippets (architectural layers, geological strata, depth-stacked feature maps). Stack multiple at increasing y to read as layers.
- **line** -- from (array of three numbers); to (array of three numbers). A straight edge between two points. Use for connections between named entities (relationship in 3D, like a graph edge but routed through 3D space).
- **label** -- size (number, render scale; ~0.5 typical for short labels); text (string, the actual label content). A text sprite that always faces the camera. Use for axis labels on 3D charts, names on electrodes / nodes / towers, identifiers in semantic scenes.

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

# Prefer semantic geometry over abstract orrery

Default-fallback orrery scenes (sphere + 3 toruses + cubes orbiting at radius 2) read as decoration, not insight. Push instead toward **semantic geometry**: the scene IS the thing it represents, not an abstract decoration of it.

When the snippet's structural content has a natural physical shape, use the new primitives (cylinder / cone / plane / line / label) to render that shape directly:

- **Repo / project / metric tower** → cylinders at varying heights, one per repo, on a baseline plane. Heights encode the metric. label sprites on top name each tower. The "skyline of repos" reads literally.
- **Anatomical / hardware layout** (electrodes on a head, sensors on a chassis) → wireframe_sphere as the body, label sprites at sensor positions, lines connecting sensors to wires. The shape IS a head / device, not an arbitrary orrery.
- **Stacked architectural layers** (presentation / business / data) → translucent planes at increasing y, label sprites naming each layer, connection lines between adjacent planes if data flows between them.
- **Directional / vector** (input → router → output) → cones pointing along the flow, lines connecting them.
- **Process / control loop** with stages → cylinders at stage positions, lines tracing the loop, labels naming each stage.

Center the load-bearing object at [0,0,0]; arrange supporting objects with intent (semantic positioning) — only fall back to the radius-2 circle when the snippet genuinely is rotationally symmetric.

# When to demote to text

Set should_demote_to_text=true if:
- The snippet has neither a spatial/structural dimension nor a depth-friendly quantitative shape. (Quantitative content with two dimensions and one numeric still belongs in vega; quantitative content with three+ dimensions or a "chart-as-tower" reading belongs here.)
- The snippet describes < 3 distinguishable elements -- a single-object scene reads as decoration, not information.
- The snippet is meta-commentary about the cell mechanism rather than a thing-in-the-world.

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

# Worked example -- 3D bar grid (chart mode)

Snippet: "PASS verdict counts across three lens versions on the same 11-scene benchmark. v0.22-5: 18 PASS, 11 WARN, 4 FAIL. v0.22-6: 22 PASS, 7 WARN, 4 FAIL. v0.22-7: 27 PASS, 5 WARN, 1 FAIL. The cinematic family carried most of the gains."

spec (the JSON object):
{"background": "transparent", "camera_distance": 7.5, "objects": [
  {"kind": "wireframe_cube", "size": 0.18, "color": "$accent",  "position": [-2.0,  0.9, -1.0]},
  {"kind": "wireframe_cube", "size": 0.11, "color": "$stroke2", "position": [-2.0,  0.55, 0.0]},
  {"kind": "wireframe_cube", "size": 0.04, "color": "$stroke3", "position": [-2.0,  0.20, 1.0]},
  {"kind": "wireframe_cube", "size": 0.22, "color": "$accent",  "position": [ 0.0,  1.10, -1.0]},
  {"kind": "wireframe_cube", "size": 0.07, "color": "$stroke2", "position": [ 0.0,  0.35, 0.0]},
  {"kind": "wireframe_cube", "size": 0.04, "color": "$stroke3", "position": [ 0.0,  0.20, 1.0]},
  {"kind": "wireframe_cube", "size": 0.27, "color": "$accent",  "position": [ 2.0,  1.35, -1.0]},
  {"kind": "wireframe_cube", "size": 0.05, "color": "$stroke2", "position": [ 2.0,  0.25, 0.0]},
  {"kind": "wireframe_cube", "size": 0.01, "color": "$stroke3", "position": [ 2.0,  0.05, 1.0]},
  {"kind": "axis_helper",   "size": 1.5, "color": "$muted", "position": [-3.0, 0, -1.5]},
  {"kind": "particle_cloud", "size": 1.0, "color": "$muted", "count": 120, "spread": 6.0}
]}

caption: "PASS / WARN / FAIL by lens version (3D bar grid). Front row (z=-1): PASS — visible monotonic climb 18 -> 22 -> 27. Middle row: WARN trending down. Back row: FAIL collapsing. Depth axis encodes verdict; height encodes count; x is lens version."
should_demote_to_text: false

Notes for chart mode:
- Position bars on a regular grid in (x, z); use cube `size` or stack offset in `y` to encode the magnitude. Don't try to use `position` as a value AND a layout coordinate.
- Center the grid near (0, 0, 0). Lift cubes by `position.y = size/2` so their bottoms sit on the y=0 plane.
- Omit rotation_speed entirely in chart mode. A still 3D chart is more readable than a wobbling one. The orbital / topology mode (Worked Example #1 above) is where slow rotation reads as ambient.
- Add an `axis_helper` near the corner so depth/category axes are legible.
- Use $accent for the load-bearing series (e.g., PASS), $stroke2/$stroke3 for secondary series.
- For 3D scatter, replace cubes with icosahedra and put position[0,1,2] = scaled values of three quantitatives.
- **Use label primitives** for axis names and category names — text sprites face the camera so they stay readable as the scene rotates.

# Worked example -- semantic geometry (skyline)

Snippet: "Cell counts by substrate over the corpus: mermaid 920, html 670, text 340, vega 290, animated_svg 130, scene3d 50."

spec (the JSON object) -- repo skyline rendered as cylinders, not abstract orrery:
{"background": "transparent", "camera_distance": 7.5, "objects": [
  {"kind": "cylinder", "size": 0.32, "height": 4.6, "color": "$accent",  "position": [-2.5, 2.30, 0]},
  {"kind": "label", "size": 0.5, "color": "$fg", "text": "mermaid", "position": [-2.5, 4.85, 0]},
  {"kind": "cylinder", "size": 0.32, "height": 3.35, "color": "$stroke1", "position": [-1.5, 1.675, 0]},
  {"kind": "label", "size": 0.5, "color": "$fg", "text": "html", "position": [-1.5, 3.6, 0]},
  {"kind": "cylinder", "size": 0.32, "height": 1.7, "color": "$stroke2", "position": [-0.5, 0.85, 0]},
  {"kind": "label", "size": 0.5, "color": "$fg", "text": "text", "position": [-0.5, 1.95, 0]},
  {"kind": "cylinder", "size": 0.32, "height": 1.45, "color": "$stroke3", "position": [0.5, 0.725, 0]},
  {"kind": "label", "size": 0.5, "color": "$fg", "text": "vega", "position": [0.5, 1.7, 0]},
  {"kind": "cylinder", "size": 0.32, "height": 0.65, "color": "$stroke1", "position": [1.5, 0.325, 0]},
  {"kind": "label", "size": 0.4, "color": "$fg", "text": "anim_svg", "position": [1.5, 0.9, 0]},
  {"kind": "cylinder", "size": 0.32, "height": 0.25, "color": "$stroke2", "position": [2.5, 0.125, 0]},
  {"kind": "label", "size": 0.4, "color": "$fg", "text": "scene3d", "position": [2.5, 0.5, 0]},
  {"kind": "plane", "size": 7.0, "height": 1.5, "color": "$muted", "position": [0, 0, 0], "rotation_speed": [1.5708, 0, 0]}
]}

caption: "Substrate skyline. Each cylinder = one substrate's mint count. mermaid is the tallest tower; scene3d barely clears the baseline. Labels float at each tower's apex."
should_demote_to_text: false

Notes for semantic-geometry mode:
- Cylinder height = encoded value (scale to fit camera_distance). Position cylinder y = height/2 so it stands ON the baseline plane.
- Place a label sprite directly above each tower so the named entity is unambiguous.
- One floor plane at y=0, rotated π/2 around x to lie flat, gives a baseline; without it the towers float in space.
- Avoid rotation_speed on towers — viewer reads them as fixed buildings; rotating cylinders look unstable.
- Skyline is one specific case; the same vocabulary (cylinder + label + plane + line) covers electrode layouts (sphere + labels), architectural layers (planes + labels + lines), directional flows (cones + lines + labels).

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
