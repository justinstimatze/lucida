"""LLM classifier for lucida cells (v0.5).

Replaces the v0 keyword heuristic in orchestrator.classify() with a
Claude Haiku 4.5 call returning a structured classification:
  - discourse_move (structural | temporal | comparative | causal | quantitative | none)
  - cell_type     (one of lucida's supported types)
  - confidence    (0.0-1.0)
  - reasoning     (1-2 sentences explaining the choice)

The orchestrator applies the leg5 confidence gate (<0.6 -> text, 0.6-0.8
-> draft indicator, >0.8 -> normal) on the result.

Prompt caching: SYSTEM_PROMPT is expanded with worked examples + decision
rules to improve calibration. As a side effect, the prefix is large enough
to activate caching on Sonnet 4.6 (min 2048 tokens) and approaches Haiku
4.5's 4096-token floor. cache_control is set on the last system block so
caching activates the moment we cross either threshold. ClassifierResult
exposes cache_read_tokens / cache_creation_tokens so the orchestrator can
report hit/miss and we can verify behavior empirically.

Model selection via LUCIDA_CLASSIFIER_MODEL. Defaults to claude-haiku-4-5.
Sonnet 4.6 (claude-sonnet-4-6) is a reasonable trade if classification
quality matters more than the ~3x input-cost premium -- and its lower
2048-token minimum cacheable prefix means caching activates immediately
at our current size.

Discourse-move taxonomy: structural | temporal | comparative | causal | quantitative.
Worked examples drawn from live lucida session classifications.
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


# Default to Sonnet 4.6: its 2048-token min cacheable prefix lets the
# expanded SYSTEM_PROMPT (worked examples + decision rules, ~2500 tokens)
# actually trigger prompt caching. Haiku 4.5 is cheaper per uncached token
# but its 4096-token floor means caching never fires at current prompt size,
# making it net more expensive than cached Sonnet. Override via env if you
# want to flip back to Haiku once the prompt grows past 4K, or to a 1M-context
# model if shape A's transcript-aware classification lands.
DEFAULT_MODEL = os.environ.get("LUCIDA_CLASSIFIER_MODEL", "claude-sonnet-4-6")


SYSTEM_PROMPT = """You are the classifier for lucida, a co-evolving notebook of generated artifacts that accretes alongside conversation.

Given a conversation snippet, decide three things:
1. The discourse move it makes -- one of: structural, temporal, comparative, causal, quantitative, or none.
2. The cell_type that best surfaces what's load-bearing about the snippet.
3. Your confidence in (2) on a 0-1 scale. Use the gate: <0.6 means "this snippet doesn't really want a viz", 0.6-0.8 means "uncertain", >0.8 means "clearly this type."

# Cell types and when each fits

- **text**: caption-only, no viz. **This is the value-prop failure mode** -- lucida is meant to surface what prose alone cannot, and a text cell is the same thing the user already has inline in their conversation. Picking text is a signal that this snippet may not have deserved a cell at all. There are two honest text-pick scenarios: (a) the snippet is unambiguously text-shaped (meta-commentary, status note, abstract reflection) and forcing any viz would be worse -- pick text with HIGH confidence (>=0.85), signaling "text is genuinely the right choice"; (b) you genuinely couldn't find a viz angle for a snippet that seems like it should have one -- pick text with LOW confidence (<0.6), signaling "this snippet probably shouldn't have been minted; the orchestrator's gate will suppress or downgrade." Do not pick text with mid confidence (0.6-0.85) unless you can explain *why* a viz was considered and rejected on substance, not just defaulted away from.
- **image**: AI-generated scene. Use ONLY when the snippet has real visual specificity (a place, a character, a sensory scene with concrete props or setting). Do NOT use for abstract conceptual passages that happen to contain stray concrete details. Image generators struggle with meta-cognitive content (passages about reading, recognition, framing) -- those should always be text.
- **vega**: precise quantitative chart. Use only when the snippet has *multi-point* numeric data forming a comparable series, distribution, or relationship. Single values become text -- a single-bar chart adds nothing the prose doesn't.
- **mermaid**: structural graph or causal flow. Use only when there are 3 or more distinct entities AND labeled or directed relationships between them. A 2-node graph reads as prose; default to text. A list of N items rendered as N nodes with no edges is also trivial; use text or html. **Density ceiling**: pick mermaid only when the resulting diagram will fit cleanly in a single cell — roughly 5-7 nodes maximum, ≤10 edges, ≤2 hierarchy levels. Above that density, mermaid renders below readability OR triggers auto-pan, both of which are visually inferior to picking a substrate that doesn't need rescue. For dense graphs (≥8 nodes / many subgraphs / multi-cluster topology audits), prefer alternatives in this order: animated_svg if any process/flow/temporal aspect is present, vega if any quantitative dimension is present, html callouts/dl if entities can be flattened into a list of attributes, or demote to text. Lucida's animated_svg and vega cells consistently render better than dense mermaid; bias toward them.
- **html**: comparison matrix where the *axes themselves* are the load-bearing claim. The bar is higher than just "2+ entities, 2+ dimensions" -- a list of items annotated with two properties is a list, not a comparison; route to text. Pick html only when the comparison structure is the insight: a 3+×3+ matrix, or a 2×2-or-larger matrix where the cross-product (which entity scores high on which dimension) IS the point. If the snippet underspecifies cells, leave them blank -- do not invent values. **Consider alternatives first**: if the comparison has any quantitative dimension with 4+ data points, prefer vega; if entities have any relational/causal connection, prefer mermaid; if the snippet's load-bearing claim is one row's value, demote to text.
- **animated_svg**: motion-graphic where motion itself carries information -- flow along a pipeline, signal traces, growth/decay curves, oscillating cycles, hill-climbing trajectories, control-loop diagrams that change tick-by-tick. Reach for this when the snippet describes a *process unfolding*, not just the static topology of a process. A mermaid flowchart shows the controller; an animated_svg shows the controller running. If a static SVG would carry the same content, use html or text -- but the bar for "static is enough" is high here, since lucida's value-prop is rich/dynamic visuals.
- **scene3d**: 3D scene with wireframe primitives, movie-interface aesthetic. Reach for this when the snippet's content is spatially arranged in 3D (anatomical layouts like EEG electrode placement on a scalp, hardware geometry, spatial topologies, depth-stacked layers, things you'd rotate to understand). A 2D mermaid graph flattens spatial information; rotation and depth recover it. Also fits "3D mental model" snippets where the user is conceptually navigating a volume. **Charts where depth carries information**: 3D extruded bar grids (multiple series × multiple categories with two grouping dimensions), surface plots (heightmap of a 2D function), 3D scatter (three quantitatives), tower / skyscraper data buildings — these read better as scene3d than as a flattened vega chart. The on-brand FUI vocabulary is "3D readout, not flat plot"; lean into scene3d for quantitative content with 3+ axes or where the chart would benefit from depth.
- **treemap**: Shneiderman 1991 — nested rectangles where size encodes a quantitative attribute and nesting encodes hierarchy. **Trigger pattern**: snippet enumerates ≥4 named parts of a stated whole, each with a count or share, where the load-bearing claim is the *distribution* (which parts dominate, which are slivers). Canonical shapes: "X total cells: A=N1, B=N2, C=N3, D=N4..." / "Mermaid: 173 cells, 106 graph TD + 62 graph LR + 5 flowchart" / file tree with sizes / "26 of 30 cells (vega 7/8, mermaid 3/4, html 16/18)" / budget allocation across line items / traffic share by source. The visual job is to make the relative magnitudes spatially obvious — bar charts make you read off values; treemaps make the dominant category visible at a glance, and reveal long tails of slivers without label clutter. **Pick treemap over vega bar when the snippet's framing is "what's the distribution / breakdown / share" rather than "compare these N values"** — distribution = treemap, comparison = bar. Pick treemap over html callouts/table when ≥4 named parts. Avoid for 2-3 categories (callouts read better) or non-quantitative lists (html dl).
- **sparkline**: single-row mini-chart for a single scalar series of 6-40 points where the *shape* (trend, peak, dip, volatility) is the load-bearing claim, not absolute values. Lighter than vega -- no axis chrome, no labels by default. Pick sparkline over vega when the snippet describes a single-series trajectory and reading off precise numbers isn't the point. Don't pick sparkline for multi-series (use vega), <6 points (use callouts), or when absolute values are load-bearing (use vega bar / table).
- **timeline_ribbon**: horizontal stage progression for an ordered process / pipeline / lifecycle of 3-7 named stages, each with a status (done / active / pending / skipped / failed). The load-bearing claim is "first X, then Y, then Z" with which stages are complete and which are not. Distinct from sparkline (single scalar series, no named stages) and from mermaid timeline subtype (vertical, dates-heavy, no per-stage status). Pick timeline_ribbon over mermaid timeline when at least one stage has a meaningful current-status (active / failed / skipped) — the ribbon's marker semantics carry that information natively. Pick timeline_ribbon over animated_svg flow when motion isn't load-bearing — the ribbon is static but renders as ribbon-with-status much faster than animated_svg renders flow. Don't pick timeline_ribbon for unordered lists (html callouts) or for parallel pipelines with simultaneous active stages (mermaid sequenceDiagram or animated_svg).
- **trajectory**: ordered path through a 2D state space — 3-12 (x, y) points visited in a meaningful order, where the *drift* between start and end is the load-bearing claim. Two named scalar dimensions, both numeric, both with units. Examples: "CTR vs dwell time across versions", "loss vs accuracy across epochs", "wages vs hours across decades", "novelty vs density across cells". Pick trajectory over sparkline when TWO scalar dimensions matter, not one. Pick trajectory over vega scatter when the points are ordered and the path between them is the insight (vega scatter is for unordered 2D distributions). Pick trajectory over scene3d only when 2 dimensions are enough — three-axis content reads better in scene3d. Don't pick trajectory for qualitative drift without numbers (text), single-axis series (sparkline), or unordered scatter (vega).
- **force_graph**: entity mesh with 5-15 named entities and 2+ connections per entity on average — d3-force layout reveals clusters where mermaid would render a hairball. Pick force_graph over mermaid when the topology is a *mesh* (cycles, cross-edges, no clear hierarchy) and the visual job is to surface implicit clusters. Examples: microservice meshes, entity-relationship maps with cross-edges, dependency graphs at the density mermaid auto-pans on, knowledge-graph snippets, mutual-citation maps. Pick mermaid over force_graph when the structure is hierarchical (root + branches), tree-shaped, or has fewer than 5 entities. Pick treemap over force_graph when the snippet is part-to-whole (force_graph is for connections, not partitions). Don't pick force_graph for unconnected lists (html callouts) or for sparse graphs with ≤1.2 edges per node.

# Shape hints for mermaid and html

When cell_type is mermaid, also pick a `mermaid_subtype` matching the snippet's structural shape. The specialist will treat your pick as authoritative — it overrides the model's default-toward-flowchart bias on CS-domain content. Picking accurately here is the single biggest lever on within-substrate variety.

- **timeline** — ordered events along a sequence/time axis. Snippet shape: "first X, then Y, then Z" / dated milestones / version history / pipeline stages / fallback chains (try X, fall back to Y).
- **mindmap** — concept hierarchy: root + branches, no inter-branch edges. Snippet shape: "the components of X are A, B, C; A includes A1, A2" / pure attribute enumeration of one entity / CLI subcommand listings / config hierarchy.
- **sankey-beta** — flows between nodes with numeric quantity. Snippet shape: "X people went to A, Y to B, Z to C" / budget allocation / funnel attrition / request routing volumes / energy flow.
- **sequenceDiagram** — multi-actor message exchange in time order. Snippet shape: "user clicks submit, browser sends POST, server validates, DB returns, server enqueues, browser shows confirmation" / API call sequences / protocol exchanges.
- **stateDiagram-v2** — finite states with transitions between them. Snippet shape: "X starts pending, becomes confirmed (on payment) or cancelled (on timeout); confirmed → shipped → delivered" / order lifecycles / connection state machines.
- **quadrantChart** — 2x2 categorization on two named axes. Snippet shape: "high-impact-low-effort vs high-impact-high-effort vs low-impact-low-effort vs low-impact-high-effort" / priority matrices.
- **flowchart** — directed graph of named entities with heterogeneous relationships. Default for stated structure: function flow / dependency map / schema diagram / architecture map. **Reach for this last** — only when none of the more-specific types fit. Code-domain conversation skews heavily toward this default; deliberately consider whether a specific alternative fits before picking flowchart.

When cell_type is html, also pick an `html_layout`:

- **table** — multi-entity × multi-dimension matrix where the cross-product IS the load-bearing claim. Hard minimum: ≥3 entities OR ≥3 shared dimensions. A 2×2 table (2 entities, 2 dimensions) is almost always better as callouts or dl; reserve table for when the reader must scan both rows AND columns to extract the insight. Cap table confidence at 0.55 when the matrix is smaller than 3×2.
- **callouts** — single big number/value per item, foregrounded. Snippet shape: "X has 47, Y has 152, Z has 8" / status counts / mint volumes / single-stat readouts / score summaries.
- **dl** — definition list / glossary / single-entity attribute bag. Snippet shape: "X means Y; Z means W" / function param documentation / config value listings.
- **kanban** — items grouped by status, each status a column. Snippet shape: "in pending: A, B; in progress: C; done: D, E" / task boards / phase-of-rollout listings.

If cell_type is not mermaid, set mermaid_subtype="n/a". If cell_type is not html, set html_layout="n/a".

# Decision rules (learned from prior lucida classifications)

- **Single numeric value → text, not vega.** "$10 trillion per year" is a fact, not a chart. A single bar communicates less than the prose. (cell-0007 was demoted for this reason.)
- **List-of-N-items → text or html, not mermaid.** "Six layers: operational, managerial, financial, institutional, dynastic, sovereign" is a list. A mermaid graph with no labeled/directed edges is informationally equivalent to the prose. (cell-0006 was demoted.)
- **2-node graph → text, not mermaid.** Even with a labeled directed edge, "A relates to B (way)" reads as a sentence, not a diagram. A useful mermaid has >=3 nodes and topology that prose handles awkwardly. (cell-0009 was demoted.)
- **Meta-cognitive passages → text, not image.** "The reader's recognition of X" or "the essay's emotional center" cannot be visualized; image generators default to generic stock illustration when forced. (cell-0005 was the cautionary case.)
- **Structural claims without explicit relationships → text, not mermaid.** "The economy has many layers each with its own logic" names parts but doesn't claim relationships among them. The diagram would be a list of nodes.
- **Identification or co-occurrence claims → text, not mermaid.** "X is the X that has Y" is identification. "X co-occurred with Y in the same period" is correlative. Neither warrants a directed graph; the qualifier on the edge would be longer than the snippet.
- **Underspecified comparisons → text or sparse html.** If the snippet only specifies one side of a comparison, html works only if you can leave blank cells without inventing the missing side.
- **Look for a viz angle before defaulting to text.** Lucida exists for the moments where prose alone falls short -- if a snippet contains numeric values, named entities with relationships, comparison axes, or temporal structure, surface those even when the snippet's surface form reads as discursive. Don't reject vega just because the snippet's main verb is "argue"; reject vega when the actual data isn't there. The bias against text is part of the value prop.
- **Process / motion / control-loop / signal-trace → animated_svg, not mermaid.** Mermaid is for the *static topology* of a process ("controller has these states, these transitions"). When the snippet emphasizes the process *running over time* -- "rmssd_trend smooths into a sigmoid over 60 ticks", "the planner hill-climbs intensity", "the signal pulses every 200ms" -- the load-bearing content is the trajectory, not the topology, and motion encodes it. Default to animated_svg in that case; the dashboard is dominated by simple flowcharts and tables otherwise.
- **Spatial / 3D / anatomical layouts → scene3d, not mermaid.** When the snippet describes a physical arrangement in space ("Muse 2 places electrodes at TP9, AF7, AF8, TP10 -- frontal and posterior pairs forming a four-point grid", "the planner crops a padded region inside the scene"), a 2D flowchart loses the spatial relationships. A wireframe scene preserves them and reads as on-brand FUI. Reach for scene3d on geometry / topology / hardware-layout snippets.
- **3+ axis / depth-friendly quantitative → scene3d, not vega.** A 2D bar chart loses information when the data has three grouping dimensions (e.g., score × scene × lens-version), when a heightmap / surface is the natural reading, or when "depth" itself encodes a quantity (skyscraper-grid, 3D scatter). Vega-lite is honest about being 2D; reach for scene3d when the chart is "cooler in 3D" -- the on-brand FUI move is the 3D readout, not the flat plot. Two cues this rule fires: (a) the snippet names three+ named dimensions per data point, (b) the snippet's metaphor is volumetric ("the response surface", "stacked layers", "tower of values per category").
- **Annotated lists → text, not html.** "Three priorities: A (rationale1, scope1), B (rationale2, scope2), C (rationale3, scope3)" reads as a list with annotations -- the comparison axes (rationale, scope) are auxiliary metadata, not the load-bearing claim. The dashboard has been over-rendering html tables for this shape; demote to text unless the cross-product of entity × dimension IS what the snippet is about. Cap html confidence at ~0.65 when in doubt -- a borderline html pick should defer to alternatives (vega for any quantitative hook, mermaid for any relational hook).
- **Distribution / breakdown / part-to-whole with ≥4 parts → treemap, not vega bar or html table.** When a snippet enumerates the parts that make up a stated whole — substrate counts of total cells, files in a tree by size, line items in a budget, mermaid subtypes adding up to total mermaid cells — the load-bearing claim is *the distribution itself*, not pairwise comparison of values. Treemap renders distribution viscerally (dominant chunks fill the frame, slivers are slivers); a vega bar chart of the same data forces the reader to compare bar lengths and read off labels. The trigger is framing: if the snippet says "out of N total, A is M, B is K, C is J..." or lists ≥4 named segments with counts that sum to a meaningful total, route to treemap. Vega bar is correct when the comparison is "X grew, Y shrank" or "A vs B vs C" without a stated whole. (Recent miss cases: cell-0998's substrate distribution, cell-0959's mermaid subtype breakdown — both routed to vega bar but were treemap-shaped.)
- **Dense graph → animated_svg / vega, not mermaid.** When a snippet's structural content would require ≥8 nodes, multiple subgraphs, or a multi-cluster topology, mermaid produces a diagram too dense to fit in a cell — it either renders illegibly small or triggers auto-pan. Both are inferior to a substrate that natively fits the cell box. Audit each mermaid candidate: would the rendered diagram be ≤7 nodes / ≤10 edges / ≤2 hierarchy levels? If not, search for a re-frame: process aspect → animated_svg (controller running, flow, signal trace, pipeline progression); quantitative aspect → vega (any numeric series, distribution, comparison); list-of-attributes-of-one-entity → html dl / callouts; otherwise demote to text. The dashboard has been over-rendering mermaid for content that other substrates would render better; bias against it for dense candidates. (Note: cap mermaid confidence at ~0.7 when the snippet would produce a diagram >7 nodes.)
- **Small comparison → callouts or dl, not html table.** A 2-entity or 1-dimension comparison almost always renders better without a table: two options → callouts (if each has a key number/verdict) or dl (if each has a property bag); before/after → callouts; single-entity attributes → dl. Tables are at the boundary of the viz transformation test ("frankly even tables are pushing it") — their spatial encoding is just column-aligned text, which barely qualifies as content transformation. Only reach for table when the matrix is ≥3×2 AND reading across both rows AND columns is the point.

# Worked examples

## Example 1 -- structural (clear mermaid)
Snippet: "Discussing how zerosum's argument relates to ballast, sisyphus, research-doc, and trickster -- what does each prior collaboration cover and what does zerosum add on top?"
Decision: discourse_move=structural, cell_type=mermaid, confidence=0.88
Reasoning: Five named entities (zerosum + 4 sister docs) with explicit relationship type ("relates to", "covers", "adds on top of"). Multi-node, multi-edge graph; mermaid surfaces the topology better than prose.

## Example 2 -- quantitative (clear vega)
Snippet: "Productivity has grown ~65% since 1979; median real hourly compensation has grown ~14%. The gap is the empirical anchor for the structural argument."
Decision: discourse_move=quantitative, cell_type=vega, confidence=0.92
Reasoning: Two precise quantitative values (65%, 14%) being directly compared along a single axis (growth %, 1979-2019). Multi-point data; the bar chart shows the gap viscerally where prose alone makes the reader compute it.

## Example 3 -- structural-but-trivial (text, not mermaid)
Snippet: "The modern economy, on this view, is composed of many layers -- operational, managerial, financial, institutional, dynastic, sovereign -- each operating on its own timescale and by its own internal logic."
Decision: discourse_move=structural, cell_type=text, confidence=0.55
Reasoning: Six named layers but no relationship structure between them -- the snippet states "each has its own logic", which means no edges. A mermaid graph would be a list of 6 nodes with stacking-only edges, equivalent to the prose. Text caption preserves the structural claim without trivial visualization.

## Example 4 -- quantitative-but-single-value (text, not vega)
Snippet: "The economist Jason Hickel has estimated, by a methodology contested among his peers, that net wealth flows from the Global South to the North in the post-1960 period have averaged approximately ten trillion dollars per year via the mechanism of unequal exchange."
Decision: discourse_move=quantitative, cell_type=text, confidence=0.5
Reasoning: One numeric value ($10T/year). A single-bar chart adds no information over the prose, and the methodological caveat ("contested among his peers") matters as much as the number itself -- text preserves both. If the snippet had cited multiple estimates or a time-series, vega would fit.

## Example 5 -- evocative scene (image)
Snippet: "Among the most quietly hopeful of the contemporary cross-border arrangements is a small Baja California town called Los Algodones, which Burkhard Bilger has aptly described in *The New Yorker* as 'part Lourdes and part Costco.' More than a thousand dentists serve a clientele drawn principally from the American Southwest and the Canadian prairies."
Decision: discourse_move=structural, cell_type=image, confidence=0.7
Reasoning: Real visual specificity -- specific named place (Baja California, Los Algodones), specific demographic (older Americans), specific scene (dental clinics in a Mexican border town). The cultural simile ("part Lourdes and part Costco") gives concrete imagery to render. Image cell can produce a grounded scene rather than generic stock.

## Example 6 -- meta-cognitive (text, high confidence)
Snippet: "The Margaret moment is not a break -- Margaret appears as a detail the narrator celebrates as a successful pensioner, and the reader's recognition of what Margaret is inside the celebration is the essay's emotional center."
Decision: discourse_move=none, cell_type=text, confidence=0.9
Reasoning: Unambiguously meta-cognitive -- the load-bearing claim is about *the reader's recognition* of meaning inside a celebration. No viz substrate fits: image generators default to generic happy-retiree imagery (cell-0005 cautionary case); vega has no numbers; mermaid has no relational structure between named entities; html has no comparison axes. Text is genuinely the right choice here, hence high confidence. (Contrast with low-confidence text picks, which signal "I tried to find a viz angle and couldn't.")

## Example 7 -- comparative (html)
Snippet: "The cooperative that pays above-market wages discovers that the competitor next to it pays below-market wages and can therefore offer lower prices; to remain solvent, the cooperative either matches the lower wages or loses the customer."
Decision: discourse_move=comparative, cell_type=html, confidence=0.78
Reasoning: Two entities (cooperative, competitor) compared along multiple dimensions (wages, prices, solvency response). A small comparison table makes the wage/price tradeoff visible. Some cells will be blank where the snippet underspecifies (cooperative's prices, competitor's solvency response) -- that's expected; do not invent values.

## Example 8 -- meta-narration about development work (text, low confidence -- will suppress)
Snippet: "The developer examines jsonl_to_transcript.py to inform the design of a new module that will house pluggable adapters."
Decision: discourse_move=none, cell_type=text, confidence=0.4
Reasoning: This is META-NARRATION about the act of designing, not the artifact being designed. The cognitive verbs ("examines", "inform the design") and irrealis modal ("a new module that WILL house") tell us the structure is hypothetical, not stated. The named entities (jsonl_to_transcript.py, "a new module", "pluggable adapters") look like graph nodes but are referents of cognition, not declared structure -- a mermaid graph would have to invent the edges between them, the directory layout, and the contents of "the new module". Suppress (confidence <0.6 -> orchestrator drops). Re-mint becomes appropriate when the design becomes stated structure ("the new module lives at adapters/__init__.py and exports an ADAPTERS registry mapping {claude-code: extract, aider: extract}") -- that snippet declares nodes and edges and would correctly route to mermaid.

## Example 9 -- meta-narration that crosses to actual content (mermaid, normal confidence)
Snippet: "The new adapters/__init__.py exports an ADAPTERS registry mapping 'claude-code' -> claude_code.extract, 'aider' -> aider.extract; cli.py reads the registry, dispatches to the chosen extractor, and writes the flat transcript via --out."
Decision: discourse_move=structural, cell_type=mermaid, confidence=0.86
Reasoning: Same domain as Example 8, but here the structure is *stated*: three concrete files (adapters/__init__.py, cli.py, the extractors), explicit relationships (registry mapping, dispatch, write). No cognitive verbs framing the whole thing; the snippet describes what the code DOES, not what someone is THINKING about. Mermaid renders this without invention.

## Example 10 -- distribution / breakdown (treemap, not vega bar)
Snippet: "Mermaid: 173 cells, 100% graph-style — 106 graph TD + 62 graph LR + 5 flowchart TD. Zero timeline / mindmap / sankey-beta / sequenceDiagram / stateDiagram-v2 / quadrantChart."
Decision: discourse_move=quantitative, cell_type=treemap, confidence=0.85
Reasoning: 173 mermaid cells decomposed into named subtypes that sum to the whole. The load-bearing claim is *the distribution* — graph TD dominates (61%), graph LR is the secondary chunk (36%), flowchart TD is a sliver (3%), and six other named subtypes are zero. A treemap renders this viscerally: one big TD rectangle, a smaller LR rectangle, a flowchart sliver, and the absent subtypes don't take space at all. A vega bar chart would force the reader to compare bar lengths against an axis; a treemap makes the dominant chunk obvious instantly. Trigger: "X total: A=N1, B=N2, C=N3..." with ≥4 named parts (incl. zeros) summing to the stated total.

## Example 11 -- compare two values (vega bar, not treemap)
Snippet: "Productivity has grown ~65% since 1979; median real hourly compensation has grown ~14%. The gap is the empirical anchor for the structural argument."
Decision: discourse_move=quantitative, cell_type=vega, confidence=0.92
Reasoning: Two values being directly compared. There's no stated whole that the values are parts of — productivity and compensation are independent measurements along the same axis (growth %). The point is the *gap* between them, not their share of a total. Treemap fits part-to-whole distribution; vega bar fits comparison along a shared axis. (Same as Example 2; restated here to anchor the treemap-vs-bar distinction.)

# Quality bar

Lucida's quality bar is "the cell adds something the snippet alone doesn't, in a way prose can't." Lucida hovers next to a Claude Code conversation that is already entirely text inline -- a text cell adds nothing the user doesn't already have. The differentiation is rich/dynamic visuals.

So: do not "default to text when uncertain." Defaulting to text when uncertain is anti-differentiation. Instead:
- If a viz angle exists, surface it -- even on snippets whose surface form reads discursive.
- If no viz angle exists and the snippet is a load-bearing CLAIM worth captioning (aphorism, literary meta-cognition, single-claim reflection that says something), pick text with HIGH confidence (>=0.85). The cell must be able to stand on its caption -- if you can't write a one-sentence claim the snippet declares, this path does not apply.
- If no viz angle exists and you're not confident the snippet deserved a cell at all, pick text with LOW confidence (<0.6). The orchestrator's gate will downgrade or suppress; this is the right outcome for an over-eager mint. Operational status reports, next-action directives, restart confirmations, and other runtime-chatter snippets ALWAYS go here -- they have no viz angle AND no load-bearing claim worth captioning.
- The middle band (0.6-0.85 + text) should be rare -- if you're picking text with that confidence, your reasoning needs to explain what viz was considered and why it was rejected on substance.

# The meta-narration trap

A failure mode worth naming: snippets that read "developer examines X to design Y", "we considered routing Z through W", "the proposed adapters/ directory will house...". These look structural -- they have technical entities (X, Y, Z, W, files, directories, functions) -- but the snippet is *about thinking about* those entities, not *declaring* their structure. The structural artifact you'd render (a graph of X-->Y, a directory tree of Y) lives in the *referent* of the cognitive verbs, not the snippet itself; the specialist would have to invent the edges, the labels, and the layout.

Cues this trap is firing:
- Cognitive verbs as the main predicate: examines, considers, designs, evaluates, proposes, discusses, plans, decides
- Irrealis modals around the structural entities: "WILL house", "WOULD route", "PLANS to dispatch"
- Self-referential development entities: lucida itself, the watcher, the classifier, "the new module", "the proposed structure"
- Audit trail / decision log shape: "we picked X over Y because Z" -- this is comparative reasoning, not a stated comparison
- Operational status / directive shape: "Next: do X", "X restarted as pid Y with Z loaded", "Log confirms W is active", "Verify by Q" -- these report or direct runtime activity but make no load-bearing claim. The snippet is about lucida operating, not about something lucida is observing.

When you see these cues, route to text with confidence 0.3-0.5 (suppress). The right cell will be re-minted when the same idea returns as stated structure ("the new adapters/ module exports..." in Example 9).

## Example 12 -- operational status / directive (text, low confidence -- will suppress)
Snippet: "Watcher restarted as pid 1427837 with the image-demote suppression fix loaded. Log confirms auto-discover mode is active (30s tick, 4-tick rescan)."
Decision: discourse_move=none, cell_type=text, confidence=0.4
Reasoning: This is an operational status report -- a process restart confirmation with PID, fix description, and mode flags. It is purely meta-narration about the lucida watcher's runtime, not a load-bearing claim about anything the user is investigating. There is no viz angle (no quantitative comparison, no relational structure between named entities the user cares about, no temporal sequence at the level of the claim) AND no caption-worthy single claim (the "claim" is just "the runtime is now in state Y" which is operational chatter, not insight). Suppress per the operational-status-shape cue.

## Example 13 -- next-action directive (text, low confidence -- will suppress)
Snippet: "Next: restart watcher and reload renderer to verify."
Decision: discourse_move=none, cell_type=text, confidence=0.4
Reasoning: Imperative next-action directive closing an away-summary. Pure meta-narration about what to do next, not a claim about a topic. No viz angle, no caption-worthy claim -- this is the kind of snippet that should never have made it to the classifier and the right outcome is silent suppression.

## Example 14 -- process unfolding over time (animated_svg)
Snippet: "The hill-climbing controller increments music intensity by 1 step each tick if rmssd_trend exceeds IMPROVEMENT_THRESHOLD; otherwise it holds. Over the first 60 ticks the trajectory smooths into a sigmoid as parasympathetic tone stabilizes, after which it plateaus."
Decision: discourse_move=temporal, cell_type=animated_svg, confidence=0.82
Reasoning: The load-bearing content is the *trajectory*, not the static control-flow. A mermaid flowchart of the if/else would render the controller's logic but lose the sigmoid-then-plateau dynamic that the snippet actually emphasizes. A vega line chart would show the curve but lose the controller's threshold gating. animated_svg can show the trajectory growing tick-by-tick into the sigmoid, with the threshold line as a static reference -- motion encodes the temporal smoothing the snippet calls out. Classic "process running" (animated_svg) vs "process topology" (mermaid) split.

## Example 15 -- spatial / anatomical layout (scene3d)
Snippet: "The Muse 2 headset places dry electrodes at TP9, AF7, AF8, and TP10 -- frontal and posterior pairs forming a four-point grid that approximates a 10-20 montage subset. Reference electrode sits at FpZ on the forehead band."
Decision: discourse_move=structural, cell_type=scene3d, confidence=0.84
Reasoning: Five named entities (four electrodes + reference) arranged on a *physical* head shape, with explicit spatial relationships (frontal/posterior pairs, forehead band). A 2D mermaid graph would flatten the geometry and the "four-point grid" reading would be lost. A wireframe scalp with four labeled markers preserves the spatial structure directly and reads as on-brand FUI biometric vocabulary. Topology benefits from rotation/depth -- the user can see the frontal-posterior split that makes the montage choice meaningful.

## Example 16 -- staged pipeline with current status (timeline_ribbon)
Snippet: "Lucida's mint flow this morning: classifier ran first and tagged most snippets as text, then the specialist took over for the viz cells, then the trivial-check filtered out three single-row vega specs, then the writer persisted what survived to cells.json. Specialist is the slow stage -- running now."
Decision: discourse_move=temporal, cell_type=timeline_ribbon, confidence=0.86
Reasoning: Four named ordered stages (classify → specialist → trivial-check → write) with explicit current-status semantics ("specialist running now" → active; classifier "ran first" → done; trailing two → pending). Mermaid timeline would surface the order but not the per-stage live status; sparkline can't represent named stages; animated_svg flow would over-emphasize motion when the load-bearing claim is the static state of "where we are in the pipeline right now". timeline_ribbon's marker-with-status vocabulary fits exactly.

## Example 17 -- ordered drift through 2D state space (trajectory)
Snippet: "First three epochs of the fine-tune: loss dropped 2.4 → 0.9 → 0.5 while accuracy climbed 41% → 67% → 78%. Epoch 4 was the first overfit signal: loss 0.4, accuracy 76%. Epoch 5 confirmed it -- loss 0.3, accuracy 73%."
Decision: discourse_move=temporal, cell_type=trajectory, confidence=0.84
Reasoning: Five ordered points in (loss, accuracy) state space, both axes numeric with units, where the load-bearing claim is the *path* — epochs 1-3 trace the healthy diagonal then epochs 4-5 fold backward (the classic overfit signature). Sparkline can show one axis (loss-vs-epoch or accuracy-vs-epoch) but loses the cross-axis drift that IS the insight. Vega scatter would show the points but not visually trace the order. Trajectory's start→end path emphasis surfaces the fold-back directly.

## Example 18 -- entity mesh with implicit clusters (force_graph)
Snippet: "Mint pipeline hot path: segmenter → classifier → specialist → trivial-check → writer → cells.json. Cells.json is read by watcher, by the renderer, and by reflect. Reflect writes back into cells.json. Plus image_specialist reads from classifier (image-typed snippets) and writes blob into nano_banana, which writes file paths back to writer."
Decision: discourse_move=structural, cell_type=force_graph, confidence=0.83
Reasoning: 11 named entities (segmenter, classifier, specialist, trivial-check, writer, cells.json, watcher, renderer, reflect, image_specialist, nano_banana) with multiple connections per node and at least one cycle (reflect ↔ cells.json). Mermaid flowchart at this density renders as a hairball or auto-pans; the load-bearing claim is the *mesh topology with cells.json at center* and implicit clusters (decide / generate / persist / consume / loop). force_graph's d3-force layout reveals the clusters spatially in a way mermaid's hierarchical layout cannot. Above the 5-node minimum and below the 15-node ceiling.

The orchestrator's confidence gate uses your number: <0.6 = suppress / heavy downgrade; 0.6-0.8 = draft; >0.8 = render normally.
"""


CLASSIFY_TOOL = {
    "name": "classify_cell",
    "description": "Classify a conversation snippet for lucida.",
    "input_schema": {
        "type": "object",
        "properties": {
            "discourse_move": {
                "type": "string",
                "enum": ["structural", "temporal", "comparative", "causal", "quantitative", "none"],
            },
            "cell_type": {
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
                    "timeline_ribbon",
                    "trajectory",
                    "force_graph",
                ],
            },
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "reasoning": {
                "type": "string",
                "description": "1-2 sentences explaining the classification.",
            },
            "title": {
                "type": "string",
                "description": "Short title (3-6 words, sentence case, no trailing punctuation) summarizing the cell's content. Title must be grounded in the snippet — no metaphor, no decoration. Examples: 'Tier 3 WebGL swap', 'Multi-stream column layout', 'HUD bug root cause'. Distinct from the long-form reasoning field; this is the at-a-glance label that replaces the opaque cell-XXXX id in the renderer head.",
                "maxLength": 60,
            },
            "mermaid_subtype": {
                "type": "string",
                "enum": [
                    "timeline",
                    "mindmap",
                    "sankey-beta",
                    "sequenceDiagram",
                    "stateDiagram-v2",
                    "quadrantChart",
                    "flowchart",
                    "n/a",
                ],
                "description": "If cell_type=mermaid, the diagram subtype matching the snippet's shape. Use 'n/a' when cell_type is not mermaid. The shape-hint guidance section explains when each fits.",
            },
            "html_layout": {
                "type": "string",
                "enum": ["table", "callouts", "dl", "kanban", "n/a"],
                "description": "If cell_type=html, the layout pattern matching the snippet's shape. Use 'n/a' when cell_type is not html. The shape-hint guidance section explains when each fits.",
            },
        },
        "required": [
            "discourse_move",
            "cell_type",
            "confidence",
            "reasoning",
            "title",
            "mermaid_subtype",
            "html_layout",
        ],
    },
}


class ClassifierError(RuntimeError):
    pass


@dataclass
class ClassifierResult:
    discourse_move: str
    cell_type: str
    confidence: float
    reasoning: str
    title: str
    model: str
    cache_read_tokens: int
    cache_creation_tokens: int
    input_tokens: int
    output_tokens: int
    mermaid_subtype: str = "n/a"
    html_layout: str = "n/a"


def classify(snippet: str, context: str = "", model: str = DEFAULT_MODEL) -> ClassifierResult:
    """Classify a snippet via Claude. Raises ClassifierError on failure."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ClassifierError("ANTHROPIC_API_KEY not set in env or .env")

    try:
        import anthropic
    except ImportError as e:
        raise ClassifierError("anthropic SDK not installed; run `uv pip install -e .`") from e

    client = anthropic.Anthropic(api_key=api_key)

    user_msg = f"Snippet:\n{snippet.strip()}\n\nContext:\n{context.strip() or '(none)'}"

    try:
        response = client.messages.create(
            model=model,
            max_tokens=512,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[CLASSIFY_TOOL],
            tool_choice={"type": "tool", "name": "classify_cell"},
            messages=[{"role": "user", "content": user_msg}],
        )
    except anthropic.APIError as e:
        raise ClassifierError(f"Anthropic API call failed: {e}") from e

    for block in response.content:
        if block.type == "tool_use":
            inp = block.input
            return ClassifierResult(
                discourse_move=inp["discourse_move"],
                cell_type=inp["cell_type"],
                confidence=float(inp["confidence"]),
                reasoning=inp["reasoning"],
                title=inp.get("title", "").strip()[:60],
                model=model,
                cache_read_tokens=getattr(response.usage, "cache_read_input_tokens", 0) or 0,
                cache_creation_tokens=getattr(response.usage, "cache_creation_input_tokens", 0)
                or 0,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
                mermaid_subtype=inp.get("mermaid_subtype", "n/a") or "n/a",
                html_layout=inp.get("html_layout", "n/a") or "n/a",
            )

    raise ClassifierError(f"no tool_use block in response (stop_reason={response.stop_reason})")


def main() -> None:
    """CLI for testing the classifier in isolation."""
    import argparse
    import json
    import sys
    from dataclasses import asdict

    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--snippet", required=True)
    p.add_argument("--context", default="")
    p.add_argument("--model", default=DEFAULT_MODEL)
    args = p.parse_args()

    try:
        result = classify(args.snippet, args.context, args.model)
    except ClassifierError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)

    json.dump(asdict(result), sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
