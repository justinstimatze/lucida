"""v0.5 cell evaluator -- closes the autonomous Wakisaka loop.

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
DEFAULT_THRESHOLD = float(os.environ.get("LUCIDA_RETRIGGER_THRESHOLD", "0.6"))


SYSTEM_PROMPT = """You are the cell evaluator for lucida -- you score a single image cell against its trigger snippet to decide whether the image-specialist + Gemini collaboration got it right.

You can READ images (vision) but you cannot generate them. That asymmetry is exactly what makes you useful here: you can see what the generator produced and check it against the snippet's specific claims.

# What to check

Walk through the snippet's load-bearing details one by one. For each, ask: is it visible in the image?

- Named entities (a specific place, character, object): present?
- Specific props the snippet calls for (intercropped beans, a hand tool, stone walls): all visible?
- Setting/atmosphere details (time of day, light, weather): match?
- Cultural/geographic specificity (Oaxacan vs Andean architecture, traditional dress): right?

Then check for AI-image-gen failure modes:
- Generic stock-illustration aesthetic (could illustrate ANY similar snippet vs THIS one specifically)
- Embedded text/captions (most prompts say no text)
- Over-saturated palette when the brief asked for restrained
- Literal interpretation of metaphors (a 'part Costco' simile rendered as a Costco sign)
- Invented props the snippet didn't imply

# Scoring

Score 0.0 to 1.0:
- 1.0: every load-bearing detail from the snippet is visible and correct; no invented elements; aesthetic matches brief
- 0.7-0.9: most details correct; minor issues that don't undermine the cell
- 0.5-0.7: significant failures (one major prop missing, wrong cultural register, partial generic aesthetic)
- <0.5: the image fails the snippet -- generic, missing key elements, wrong subject, etc.

Default threshold for retrigger is 0.6. Score conservatively: most images don't perfectly hit every detail; reserve <0.6 for clear failures.

# Retrigger guidance

If you recommend retriggering, write retrigger_guidance as a SHORT corrective brief that the image specialist will pass to Gemini on the next attempt. Be specific about what to fix:
- 'corn should be pale cream/heritage variety, not chalk-white skeletal'
- 'beans must be visible climbing the corn stalks (intercrop)'
- 'terraces should be Oaxacan stone-walled, not Andean'
- 'figure should be actively planting with a tool, not crouched in bare dirt'

Avoid generic advice ('make it better'). The orchestrator passes your guidance as additional context to the specialist, so it should read like a corrective addendum to the brief.

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
                "description": "True if the cell should be regenerated with corrective guidance.",
            },
            "retrigger_guidance": {
                "type": "string",
                "description": "Short corrective brief for the next attempt; empty if should_retrigger=false.",
            },
        },
        "required": [
            "quality_score", "what_worked", "what_didnt_work",
            "should_retrigger", "retrigger_guidance",
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
                model=model,
                cache_read_tokens=getattr(response.usage, "cache_read_input_tokens", 0) or 0,
                cache_creation_tokens=getattr(response.usage, "cache_creation_input_tokens", 0) or 0,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
            )

    raise EvaluatorError(
        f"no tool_use block in response (stop_reason={response.stop_reason})"
    )


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
