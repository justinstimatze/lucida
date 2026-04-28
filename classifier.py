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

Discourse-move taxonomy inherited from station/sensors/leg5_spec.md
(lines 60-69 and 117-122). Worked examples drawn from this lucida
session's own classifications (cell-0006 onward).
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
- **mermaid**: structural graph or causal flow. Use only when there are 3 or more distinct entities AND labeled or directed relationships between them. A 2-node graph reads as prose; default to text. A list of N items rendered as N nodes with no edges is also trivial; use text or html.
- **html**: comparison table. Use only when the snippet has 2+ entities AND 2+ dimensions to compare. If the snippet underspecifies cells in the table, leave them blank -- do not invent values to fill the grid.
- **animated_svg**: motion-graphic where the motion itself encodes load-bearing information (flow direction, growth, decay, pulse, signal trace). If a static SVG would carry the same content, use html or text.
- **scene3d** / **aframe**: 3D scene with wireframe primitives, movie-interface aesthetic. Use only when the snippet describes structure or topology that benefits from rotation/depth.
- **lottie**: pre-authored animation. Almost always returns text -- valid Lottie JSON is rarely generatable from a snippet.

# Decision rules (learned from prior lucida classifications)

- **Single numeric value → text, not vega.** "$10 trillion per year" is a fact, not a chart. A single bar communicates less than the prose. (cell-0007 was demoted for this reason.)
- **List-of-N-items → text or html, not mermaid.** "Six layers: operational, managerial, financial, institutional, dynastic, sovereign" is a list. A mermaid graph with no labeled/directed edges is informationally equivalent to the prose. (cell-0006 was demoted.)
- **2-node graph → text, not mermaid.** Even with a labeled directed edge, "A relates to B (way)" reads as a sentence, not a diagram. A useful mermaid has >=3 nodes and topology that prose handles awkwardly. (cell-0009 was demoted.)
- **Meta-cognitive passages → text, not image.** "The reader's recognition of X" or "the essay's emotional center" cannot be visualized; image generators default to generic stock illustration when forced. (cell-0005 was the cautionary case.)
- **Structural claims without explicit relationships → text, not mermaid.** "The economy has many layers each with its own logic" names parts but doesn't claim relationships among them. The diagram would be a list of nodes.
- **Identification or co-occurrence claims → text, not mermaid.** "X is the X that has Y" is identification. "X co-occurred with Y in the same period" is correlative. Neither warrants a directed graph; the qualifier on the edge would be longer than the snippet.
- **Underspecified comparisons → text or sparse html.** If the snippet only specifies one side of a comparison, html works only if you can leave blank cells without inventing the missing side.
- **Look for a viz angle before defaulting to text.** Lucida exists for the moments where prose alone falls short -- if a snippet contains numeric values, named entities with relationships, comparison axes, or temporal structure, surface those even when the snippet's surface form reads as discursive. Don't reject vega just because the snippet's main verb is "argue"; reject vega when the actual data isn't there. The bias against text is part of the value prop.

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

# Quality bar

Lucida's quality bar is "the cell adds something the snippet alone doesn't, in a way prose can't." Lucida hovers next to a Claude Code conversation that is already entirely text inline -- a text cell adds nothing the user doesn't already have. The differentiation is rich/dynamic visuals.

So: do not "default to text when uncertain." Defaulting to text when uncertain is anti-differentiation. Instead:
- If a viz angle exists, surface it -- even on snippets whose surface form reads discursive.
- If no viz angle exists and the snippet is genuinely text-shaped (meta-commentary, abstract reflection), pick text with HIGH confidence (>=0.85). This is honest -- text is the right choice, the cell stands on its caption.
- If no viz angle exists and you're not confident the snippet deserved a cell at all, pick text with LOW confidence (<0.6). The orchestrator's gate will downgrade or suppress; this is the right outcome for an over-eager mint.
- The middle band (0.6-0.85 + text) should be rare -- if you're picking text with that confidence, your reasoning needs to explain what viz was considered and why it was rejected on substance.

# The meta-narration trap

A failure mode worth naming: snippets that read "developer examines X to design Y", "we considered routing Z through W", "the proposed adapters/ directory will house...". These look structural -- they have technical entities (X, Y, Z, W, files, directories, functions) -- but the snippet is *about thinking about* those entities, not *declaring* their structure. The structural artifact you'd render (a graph of X-->Y, a directory tree of Y) lives in the *referent* of the cognitive verbs, not the snippet itself; the specialist would have to invent the edges, the labels, and the layout.

Cues this trap is firing:
- Cognitive verbs as the main predicate: examines, considers, designs, evaluates, proposes, discusses, plans, decides
- Irrealis modals around the structural entities: "WILL house", "WOULD route", "PLANS to dispatch"
- Self-referential development entities: lucida itself, the watcher, the classifier, "the new module", "the proposed structure"
- Audit trail / decision log shape: "we picked X over Y because Z" -- this is comparative reasoning, not a stated comparison

When you see these cues, route to text with confidence 0.3-0.5 (suppress). The right cell will be re-minted when the same idea returns as stated structure ("the new adapters/ module exports..." in Example 9).

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
                "enum": ["structural", "temporal", "comparative",
                         "causal", "quantitative", "none"],
            },
            "cell_type": {
                "type": "string",
                "enum": ["text", "image", "vega", "mermaid", "html",
                         "animated_svg", "scene3d", "aframe", "lottie"],
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
        },
        "required": ["discourse_move", "cell_type", "confidence", "reasoning", "title"],
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


def classify(snippet: str, context: str = "", model: str = DEFAULT_MODEL) -> ClassifierResult:
    """Classify a snippet via Claude. Raises ClassifierError on failure."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ClassifierError("ANTHROPIC_API_KEY not set in env or .env")

    try:
        import anthropic
    except ImportError as e:
        raise ClassifierError(
            "anthropic SDK not installed; run `uv pip install -e .`"
        ) from e

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
                cache_creation_tokens=getattr(response.usage, "cache_creation_input_tokens", 0) or 0,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
            )

    raise ClassifierError(
        f"no tool_use block in response (stop_reason={response.stop_reason})"
    )


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
