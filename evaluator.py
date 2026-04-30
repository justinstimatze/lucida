r"""v0.5 cell evaluator -- closes the autonomous Wakisaka loop.

Scores a single cell (currently image cells only) against its trigger
snippet's specific claims. If the score is below threshold, the
orchestrator retriggers generation with the evaluator's failure
analysis as feedback context.

This is the asymmetric reflection move: the agent CAN read the image
it generated (vision) but CANNOT generate it directly. So it can
evaluate whether the image-specialist + Gemini got the snippet right,
and that observation feeds the next attempt.

Bounded by:
- max_retriggers (orchestrator-level cap; default 3 per cell)
- LUCIDA_DAILY_IMAGE_CAP (already wraps nano_banana)
- LUCIDA_RETRIGGER_THRESHOLD (default 0.6 -- score below this triggers
  regeneration; tune higher for more-aggressive retriggering)

Cost per evaluation: ~\$0.02 (one image + ~700 token system prompt
on Sonnet 4.6). Caching applies; first call writes the cache.
"""

from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass


DEFAULT_MODEL = os.environ.get("LUCIDA_EVALUATOR_MODEL", "claude-sonnet-4-6")


SYSTEM_PROMPT = """You are the cell evaluator for lucida -- you score a single image cell against its trigger snippet to decide whether the image-specialist + Gemini collaboration got it right.

You can READ images (vision) but you cannot generate them. That asymmetry is exactly what makes you useful here: you can see what the generator produced and check it against the snippet's specific claims.

# What to check

Walk through the snippet's load-bearing details one by one. For each, ask: is it visible in the image?

- Named entities (a specific brand, person, place, proper noun, named character): present and identifiable AS that named thing? See the named-entity audit below for the binding rule.
- Specific props the snippet calls for (intercropped beans, a hand tool, stone walls): all visible?
- Setting/atmosphere details (time of day, light, weather): match?
- Cultural/geographic specificity (Oaxacan vs Andean architecture, traditional dress): right?

Then check for AI-image-gen failure modes:
- Generic stock-illustration aesthetic (could illustrate ANY similar snippet vs THIS one specifically)
- Embedded text/captions (most prompts say no text)
- Over-saturated palette when the brief asked for restrained
- Literal interpretation of metaphors (a 'part Costco' simile rendered as a Costco sign)
- Invented props the snippet didn't imply

# Required pre-scoring step: named-entity audit

Before assigning a score, mentally execute this audit (do not output it):

1. Scan the snippet for proper nouns and named brands. List them.
2. For each, decide: VISIBLE (clearly identifiable as that named thing in the image) or NOT VISIBLE (only a generic version is shown, or the named thing is missing entirely). There is no "debatable" — pick one.
3. Count NOT VISIBLE entries.

If count >= 1, the score MUST be ≤0.6 and failure_mode = missed_detail. This is non-negotiable. It overrides the score-band wording below. A "plausible substitute" (treadle machine for Singer; warehouse store for Costco) is NOT VISIBLE for the purposes of this audit.

# Scoring

Score 0.0 to 1.0:
- 1.0: every load-bearing detail from the snippet is visible and correct; no invented elements; aesthetic matches brief
- 0.7-0.9: most details correct; minor issues that don't undermine the cell
- 0.5-0.7: significant failures (one major prop missing, wrong cultural register, partial generic aesthetic)
- <0.5: the image fails the snippet -- generic, missing key elements, wrong subject, etc.

Default threshold for retrigger is 0.6. Score conservatively: most images don't perfectly hit every detail; reserve <0.6 for clear failures.

# Retrigger decision

The should_retrigger flag follows mechanically from the score band, NOT from a separate "would a fix help" judgment:

- score < 0.5: should_retrigger = true (clear failure, regenerate)
- score 0.5-0.7: should_retrigger = true (significant failure that retrigger may correct)
- score 0.7-0.9: should_retrigger = **false** — by the band definition above, this is "minor issues that don't undermine the cell," so accept it. Do not flag retrigger here even if you can name a specific tweak; the cell is acceptable as-is.
- score >= 0.9: should_retrigger = false (already excellent)

If you find yourself wanting to retrigger at 0.7+, the right move is to lower the score into the 0.5-0.7 band, not to flag retrigger above the threshold. The scoring rubric and the retrigger flag must be internally consistent — the orchestrator gates on this and a score/flag mismatch wastes a generation cycle (observed: lighthouse chain 0023→0024→0025, three eval@0.82 with retrigger=true, no improvement across attempts because the score said "fine" and the flag said "redo").

# Failure-mode classification

After identifying what went wrong, classify the failure into ONE of these modes The orchestrator routes to image-to-image edit vs. fresh-generate based on this — a wrong classification can make the next attempt worse:

- **missed_detail**: A specifically-named prop, geometry, or feature is missing or rendered incorrectly inside an otherwise-correct interpretation. Examples: "alternating bands of unequal width" rendered as equal bands; "Singer sewing machines + 1989 calendar" both absent; named character missing a tool. Image-to-image edit reliably fixes these — the base image's correct interpretation is preserved while the missing detail is added.

- **literal_simile_color**: A color/material descriptor was rendered as object morphology rather than as a property of the right object. Example: "bone-white corn" rendered as skeletal pale stalks rather than as living corn whose kernels happen to be white. Image-to-image edit usually fixes these.

- **literal_simile_metaphor**: A metaphor's literal half was rendered. Examples: "part Lourdes and part Costco" rendered with a literal Costco store sign; "drowning in paperwork" rendered with someone literally underwater. Image-to-image edit makes this WORSE — the wrong-interpretation is in the base PNG and the model anchors on it. Flag this so the orchestrator does fresh generate, not edit.

- **wrong_genre**: The snippet is meta-commentary, abstract, or rhetorical and the image renders it as a concrete scene (or the inverse). Example: "the Margaret moment is the essay's emotional center" — meta-commentary about an essay — rendered as a literal cozy pensioner scene. The cell type itself may have been wrong; even fresh generate is unlikely to help. Flag this and the orchestrator will abort retrigger.

- **none**: Image is correct or has only minor issues unrelated to the modes above.

Pick the SINGLE most-load-bearing mode if more than one applies. Defer to missed_detail when uncertain — it has the safest correction strategy.

# Retrigger guidance

If you recommend retriggering, retrigger_guidance is the corrective brief that the image specialist will pass to Gemini on the next attempt. **This field is the load-bearing variable for whether retrigger succeeds** (observed: under generic auto-generated guidance, 1 of 4 retriggered cells crossed the 0.7 line; the rest stayed unchanged because the brief was too vague to anchor the next attempt).

Write the brief via this two-step process:

## Step 1: enumerate compromises (mentally, do not output)

From your named-entity audit and general check above, list every specific compromise that needs fixing. Each item must name a concrete prop, attribute, or detail.

SPECIFIC (good):
- "Singer-branded sewing machines absent — only unbranded treadle bases visible"
- "1989 wall calendar absent — should be a visible prop on the wall"
- "corn rendered as skeletal pale stalks; should be living corn whose kernels happen to be cream/heritage-white"
- "intercropped beans absent — must be visible climbing the corn stalks"

GENERIC (bad — these do not survive into a useful brief):
- "the image is generic"
- "missing snippet-specific details"
- "looks like stock illustration"
- "needs better lighting"

## Step 2: compose the brief

For each enumerated compromise, write ONE imperative sentence that names the specific prop, attribute, or detail to add or change. Concatenate them with periods. Do not editorialize ("the original was too generic"), do not explain mode taxonomy, do not summarize the snippet.

Examples (good — every sentence names a specific compromise):
- "Show Singer-branded treadle sewing machines (visible logo on the machine body). Add a 1989 wall calendar as a visible workshop prop. Preserve the existing dusty-workshop atmosphere and lighting."
- "Render corn as living standing stalks with cream/heritage-white kernels, not chalk-white skeletal stalks. Beans must be visible climbing the corn stalks (intercrop). Keep the field setting."

Examples (bad — generic, untestable):
- "Make the image more specific to the snippet."
- "Add the named entities from the snippet."
- "Improve compositional fidelity."

If you cannot enumerate at least one specific compromise in Step 1, you do not have enough audit signal to produce useful guidance — set should_retrigger=false instead of writing a vague brief that wastes a generation cycle.

Output via the evaluate_cell tool.
"""


EVALUATE_TOOL = {
    "name": "evaluate_cell",
    "description": "Score an image cell against its trigger snippet and recommend whether to retrigger.",
    "input_schema": {
        "type": "object",
        "properties": {
            "quality_score": {
                "type": "number",
                "minimum": 0,
                "maximum": 1,
                "description": "0.0-1.0 score; <0.6 typically triggers retrigger.",
            },
            "what_worked": {
                "type": "string",
                "description": "Specific details the image got right.",
            },
            "what_didnt_work": {
                "type": "string",
                "description": "Specific details the image missed or got wrong.",
            },
            "should_retrigger": {
                "type": "boolean",
                "description": "True if quality_score < 0.7. Must be false at score >= 0.7; the score band already defines those as acceptable.",
            },
            "retrigger_guidance": {
                "type": "string",
                "description": "Short corrective brief for the next attempt; empty if should_retrigger=false.",
            },
            "failure_mode": {
                "type": "string",
                "enum": [
                    "missed_detail",
                    "literal_simile_color",
                    "literal_simile_metaphor",
                    "wrong_genre",
                    "none",
                ],
                "description": "Primary failure mode (see system prompt). Routes orchestrator to i2i edit vs. fresh generate vs. abort. Pick the single most load-bearing mode if multiple apply.",
            },
        },
        "required": [
            "quality_score",
            "what_worked",
            "what_didnt_work",
            "should_retrigger",
            "retrigger_guidance",
            "failure_mode",
        ],
    },
}


@dataclass
class EvaluationResult:
    quality_score: float
    what_worked: str
    what_didnt_work: str
    should_retrigger: bool
    retrigger_guidance: str
    model: str
    cache_read_tokens: int
    cache_creation_tokens: int
    input_tokens: int
    output_tokens: int
    failure_mode: str = "none"


class EvaluatorError(RuntimeError):
    pass


def evaluate_image_cell(
    snippet: str,
    image_path: Path,
    model: str = DEFAULT_MODEL,
) -> EvaluationResult:
    """Evaluate an image cell. Raises EvaluatorError on failure."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise EvaluatorError("ANTHROPIC_API_KEY not set in env or .env")

    if not image_path.exists():
        raise EvaluatorError(f"image not found at {image_path}")

    if image_path.suffix.lower() != ".png":
        raise EvaluatorError(f"only PNG supported (got {image_path.suffix})")

    try:
        import anthropic
    except ImportError as e:
        raise EvaluatorError("anthropic SDK not installed") from e

    client = anthropic.Anthropic(api_key=api_key)
    image_b64 = base64.standard_b64encode(image_path.read_bytes()).decode("utf-8")

    user_content = [
        {
            "type": "text",
            "text": f"Trigger snippet:\n{snippet.strip()}\n\nGenerated image:",
        },
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": image_b64,
            },
        },
    ]

    try:
        response = client.messages.create(
            model=model,
            max_tokens=768,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[EVALUATE_TOOL],
            tool_choice={"type": "tool", "name": "evaluate_cell"},
            messages=[{"role": "user", "content": user_content}],
        )
    except anthropic.APIError as e:
        raise EvaluatorError(f"Anthropic API call failed: {e}") from e

    for block in response.content:
        if block.type == "tool_use":
            inp = block.input
            return EvaluationResult(
                quality_score=float(inp["quality_score"]),
                what_worked=inp["what_worked"],
                what_didnt_work=inp["what_didnt_work"],
                should_retrigger=bool(inp["should_retrigger"]),
                retrigger_guidance=inp["retrigger_guidance"],
                failure_mode=inp.get("failure_mode", "none"),
                model=model,
                cache_read_tokens=getattr(response.usage, "cache_read_input_tokens", 0) or 0,
                cache_creation_tokens=getattr(response.usage, "cache_creation_input_tokens", 0)
                or 0,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
            )

    raise EvaluatorError(f"no tool_use block in response (stop_reason={response.stop_reason})")


def main() -> None:
    """CLI for testing the evaluator in isolation."""
    import argparse
    import json
    import sys
    from dataclasses import asdict

    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--snippet", required=True, help="trigger snippet")
    p.add_argument("--image", required=True, help="path to PNG")
    p.add_argument("--model", default=DEFAULT_MODEL)
    args = p.parse_args()

    try:
        result = evaluate_image_cell(args.snippet, Path(args.image), args.model)
    except EvaluatorError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)

    json.dump(asdict(result), sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
