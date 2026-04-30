"""v0.5 image specialist -- two-step prompt-shaping for image cells.

Step 1 (shape_prompt): Claude extracts the load-bearing visual brief
from the snippet -- subject, setting, props, mood, composition, things
to avoid -- as a structured tool output.

Step 2 (build_gemini_prompt): the brief composes into a nano_banana
prompt that grounds Gemini in what the snippet actually says, with
explicit anti-pattern guidance for the things AI image generators
typically invent.

The v0 path was a single-step "(nano banana prompt) Conceptual scene
illustrating: <snippet>" template. That produced cell-0005's generic
Margaret-in-garden (invented tea, bread, flowers) and cell-0010's
literal-Costco failure (took the simile as a store sign). The classifier
already filters meta-cognitive snippets to text; this specialist
addresses the remaining failure mode: when an image cell IS warranted,
the prompt sent to Gemini should be specifically grounded.

Caching: same prefix-cache pattern as classifier.py. SYSTEM_PROMPT is
~1500-2000 tokens; on Sonnet 4.6 (min 2048) caching activates after the
prompt grows by ~50 more tokens of examples. cache_control set on the
last system block; ImageBrief exposes cache_*_tokens for verification.

Override the model via LUCIDA_IMAGE_SPECIALIST_MODEL env var.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass


DEFAULT_MODEL = os.environ.get("LUCIDA_IMAGE_SPECIALIST_MODEL", "claude-sonnet-4-6")


SYSTEM_PROMPT = """You are the image specialist for lucida. Given a conversation snippet that the upstream classifier has already decided warrants an image cell, your job is to extract the load-bearing visual brief that the image should render -- and to recognize when the classifier got it wrong and the snippet shouldn't be visualized at all.

Lucida's image cells are most useful when the snippet has REAL visual specificity: a place, a character in a setting, a sensory scene with concrete props. They are LEAST useful when the snippet is meta-cognitive (about reading, framing, recognition) or when its concrete details are stage furniture for an abstract claim.

# Extraction targets

- subject: the central figure or scene (e.g. "older American snowbirds at a Mexican dental clinic", "a small Baja California desert town main street")
- setting: place + time of day + atmospheric conditions (e.g. "Mexican border town, late morning, dust in the air, palm shadows")
- props: specific objects implied by the snippet -- a small list, max 6 (e.g. "Spanish-language pharmacy signs, a small fountain, palm trees, a row of small dental clinics")
- mood: the emotional register (e.g. "quietly hopeful, slightly absurd, cross-cultural pragmatism")
- composition: framing implied by the snippet (e.g. "street-level pedestrian view, older figures dominate the foreground, painterly with restrained palette")
- avoid: things the snippet does NOT imply but a generic image generator typically invents -- this is the most important field for grounding (e.g. "literal Costco store-front signage, generic happy-retiree garden imagery, full-saturation reds, embedded text/captions")

# When to demote to text

Set should_demote_to_text=true when ANY of these hold:
- The snippet is meta-cognitive: about a reader's recognition, a narrator's framing, an essay's emotional center, etc. ("the reader's recognition of what Margaret is" -> demote, even though "Margaret" is a name).
- The snippet's concrete details are decorative, not load-bearing. ("a successful pensioner" is a phrase, not a scene; if removing it doesn't change the snippet's meaning, don't visualize it.)
- The snippet has no concrete sensory content -- it's pure abstract claim or analytic statement.
- The most honest image you could brief would be a generic stock image of the surface noun. (If your brief reads "an elderly woman, generic", demote.)

When demoting, return whatever subject/setting/etc you have to satisfy the schema, but set should_demote_to_text=true and the orchestrator will skip generation and rewrite as a text cell. The reasoning the brief encodes is itself useful audit data.

# Worked examples

## Example A -- clearly visualizable, no demotion (Los Algodones)
Snippet: "Among the most quietly hopeful of the contemporary cross-border arrangements is a small Baja California town called Los Algodones, which Burkhard Bilger has aptly described in *The New Yorker* as 'part Lourdes and part Costco.' More than a thousand dentists serve a clientele drawn principally from the American Southwest and the Canadian prairies."
Brief:
  subject: "older American/Canadian snowbirds at the dental clinics of a small Mexican border town"
  setting: "Los Algodones, Baja California, mid-morning, desert light, dusty"
  props: ["a row of small dental clinic storefronts", "Spanish-language pharmacy signs", "palm trees", "older pedestrian figures with light sweaters and canes", "a public fountain or simple plaza"]
  mood: "quietly hopeful, cross-cultural pragmatism, slightly absurd juxtaposition"
  composition: "street-level pedestrian view, painterly, low-saturation, warm desert palette"
  avoid: ["literal Costco store signage (it's a simile, not a store)", "literal Lourdes religious imagery", "Hollywood-style cantina cliches", "embedded text or signage you can read", "saturated reds or generic 'Mexican' palette"]
  should_demote_to_text: false

## Example B -- clearly meta-cognitive, demote (Margaret moment)
Snippet: "The Margaret moment is not a break -- Margaret appears as a detail the narrator celebrates as a successful pensioner, and the reader's recognition of what Margaret is inside the celebration is the essay's emotional center."
Brief:
  subject: "Margaret, an elderly pensioner (but the snippet's actual move is meta-cognitive)"
  setting: "(unspecified -- this is about reader recognition, not a place)"
  props: []
  mood: "the snippet's mood is reflective/analytic, not pictorial"
  composition: "(none -- text cell would surface the structural irony better)"
  avoid: ["any image at all -- generic happy-retiree imagery would lose the meta-cognitive content"]
  should_demote_to_text: true

## Example C -- has a place name but no real scene, demote (Hickel statistic)
Snippet: "The economist Jason Hickel has estimated that net wealth flows from the Global South to the North in the post-1960 period have averaged approximately ten trillion dollars per year via the mechanism of unequal exchange."
Brief:
  subject: "a quantitative claim about global wealth flows -- not a scene"
  setting: "(this is an analytic statement, not a place)"
  props: []
  mood: "analytic/statistical"
  composition: "(none)"
  avoid: ["any literal image of money flowing, world maps with arrows, generic 'global trade' stock illustration"]
  should_demote_to_text: true

# Quality bar

When you do extract a brief, the test is: would Gemini, given just this brief and not the original snippet, produce an image specifically of THIS snippet -- not a generic image that could illustrate any similar snippet? If your brief could equally well illustrate a different snippet on the same general topic, it's too generic.

Output via the build_image_brief tool.
"""


BRIEF_TOOL = {
    "name": "build_image_brief",
    "description": "Extract the load-bearing visual brief from a conversation snippet, or flag the snippet for demotion to text.",
    "input_schema": {
        "type": "object",
        "properties": {
            "subject": {"type": "string", "description": "Central figure or scene."},
            "setting": {
                "type": "string",
                "description": "Place + time of day + atmospheric conditions.",
            },
            "props": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Specific objects implied by the snippet (max ~6).",
            },
            "mood": {"type": "string", "description": "Emotional register."},
            "composition": {"type": "string", "description": "Framing and visual style."},
            "avoid": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Generic-AI-image-gen pitfalls to avoid for THIS snippet.",
            },
            "should_demote_to_text": {
                "type": "boolean",
                "description": "True if the snippet has insufficient visual content to render meaningfully; the orchestrator will skip image generation and demote to text.",
            },
        },
        "required": ["subject", "setting", "mood", "composition", "should_demote_to_text"],
    },
}


@dataclass
class ImageBrief:
    subject: str
    setting: str
    mood: str
    composition: str
    should_demote_to_text: bool
    model: str
    cache_read_tokens: int
    cache_creation_tokens: int
    input_tokens: int
    output_tokens: int
    props: list[str] = field(default_factory=list)
    avoid: list[str] = field(default_factory=list)


class ImageSpecialistError(RuntimeError):
    pass


def shape_prompt(snippet: str, context: str = "", model: str = DEFAULT_MODEL) -> ImageBrief:
    """Step 1: extract a structured visual brief via Claude.

    Returns ImageBrief; the caller composes it into a Gemini prompt
    via build_gemini_prompt() before calling nano_banana.generate().
    Raises ImageSpecialistError if the API key is missing or the call fails.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ImageSpecialistError("ANTHROPIC_API_KEY not set in env or .env")

    try:
        import anthropic
    except ImportError as e:
        raise ImageSpecialistError("anthropic SDK not installed; run `uv pip install -e .`") from e

    client = anthropic.Anthropic(api_key=api_key)
    user_msg = f"Snippet:\n{snippet.strip()}\n\nContext:\n{context.strip() or '(none)'}"

    try:
        response = client.messages.create(
            model=model,
            max_tokens=1024,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[BRIEF_TOOL],
            tool_choice={"type": "tool", "name": "build_image_brief"},
            messages=[{"role": "user", "content": user_msg}],
        )
    except anthropic.APIError as e:
        raise ImageSpecialistError(f"Anthropic API call failed: {e}") from e

    for block in response.content:
        if block.type == "tool_use":
            inp = block.input
            return ImageBrief(
                subject=inp["subject"],
                setting=inp["setting"],
                mood=inp["mood"],
                composition=inp["composition"],
                props=inp.get("props", []),
                avoid=inp.get("avoid", []),
                should_demote_to_text=bool(inp["should_demote_to_text"]),
                model=model,
                cache_read_tokens=getattr(response.usage, "cache_read_input_tokens", 0) or 0,
                cache_creation_tokens=getattr(response.usage, "cache_creation_input_tokens", 0)
                or 0,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
            )

    raise ImageSpecialistError(
        f"no tool_use block in response (stop_reason={response.stop_reason})"
    )


def build_gemini_prompt(brief: ImageBrief, snippet: str) -> str:
    """Step 2: compose the brief into a nano_banana prompt."""
    props_str = "\n".join(f"  - {p}" for p in brief.props) if brief.props else "  (none specified)"
    avoid_str = "\n".join(f"  - {a}" for a in brief.avoid) if brief.avoid else "  (none specified)"
    return f"""(nano banana prompt, v0.5 specialist-shaped)

Subject: {brief.subject}
Setting: {brief.setting}
Mood: {brief.mood}
Composition: {brief.composition}

Specific props/details to include:
{props_str}

Style: warm, restrained, low-saturation, painterly. Movie-interface
aesthetic where appropriate. No text, no captions in the image.

Do NOT invent the following (these are common AI-image-gen failures
for THIS snippet specifically):
{avoid_str}

Original snippet (for reference, do not render literally):
{snippet}
"""


def main() -> None:
    """CLI for testing the image specialist in isolation."""
    import argparse
    import json
    import sys
    from dataclasses import asdict

    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--snippet", required=True)
    p.add_argument("--context", default="")
    p.add_argument("--model", default=DEFAULT_MODEL)
    p.add_argument(
        "--show-prompt", action="store_true", help="also print the composed Gemini prompt"
    )
    args = p.parse_args()

    try:
        brief = shape_prompt(args.snippet, args.context, args.model)
    except ImageSpecialistError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)

    json.dump(asdict(brief), sys.stdout, indent=2)
    print()
    if args.show_prompt and not brief.should_demote_to_text:
        print()
        print("=== composed Gemini prompt ===")
        print(build_gemini_prompt(brief, args.snippet))


if __name__ == "__main__":
    main()
