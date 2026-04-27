"""Document segmentation for lucida.

Takes a long document (essay, paper, article transcript) and uses
Claude to identify salient passages that each warrant their own
cell. Each passage becomes a trigger snippet that the orchestrator
runs through classifier + specialist independently.

Without this, lucida treats input as one snippet -- a 30K-token
Wikipedia article produces one giant useless cell. With it, the
same article becomes N cells (5-15 typical for an essay), one per
load-bearing passage.

Caching: SYSTEM_PROMPT is ~1500 tokens; on Sonnet 4.6 (min 2048)
caching activates after the document grows past 600 tokens or so.
For typical inputs, cache fires from the first call.

Override the model via LUCIDA_SEGMENTER_MODEL env var.
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


DEFAULT_MODEL = os.environ.get("LUCIDA_SEGMENTER_MODEL", "claude-sonnet-4-6")


SYSTEM_PROMPT = """You are the segmenter for lucida -- a co-evolving notebook of generated artifacts. You read a document and identify the salient passages that are each worth their own notebook cell. Each passage you identify becomes a snippet that lucida's classifier + specialists will turn into an artifact (chart, diagram, scene, table, text caption).

# What counts as salient

A salient passage is one that, by itself, would warrant a cell. Concretely, it does at least one of:
- Makes a load-bearing claim (a thesis, a conclusion, a numerical anchor that's referenced elsewhere)
- Describes a specific scene with real visual specificity (a place, a character in a setting, sensory detail)
- Sets up a comparison between two or more entities along multiple axes
- Asserts a quantitative claim with multi-point data or a contested estimate
- Names a specific structural relationship (X causes Y; X depends on Z; A composes of B/C/D)
- Captures a moment of conceptual transition or reframing

# What to skip

Connective tissue and boilerplate don't earn cells:
- Transitional sentences ("As we'll see...", "To summarize...", section bridges)
- Introductions or summaries that restate without adding
- Methodological scaffolding ("In what follows...")
- Citations and references on their own
- Very short passages (<20 words alone) that aren't load-bearing
- Passages over ~500 words -- if a stretch is that long it needs further segmentation, not extraction whole

# Quality bar

5 high-quality segments beat 30 mediocre ones. Each segment should pass the test: "if I read JUST this snippet without the surrounding document, would it warrant a notebook cell?"

For each segment, return:
- snippet: the load-bearing prose (1-3 sentences, verbatim from the document)
- context: a short note (<50 words) about what surrounds the snippet -- what came just before, what argument it sits inside. The orchestrator passes this to the cell specialist as additional grounding.
- rationale: one sentence explaining why this passage warrants its own cell (what move it's making, what specialist might handle it).

Aim for 5-15 segments per 3-10K-token document. Skew toward quality.

# Output via the build_segments tool.
"""


SEGMENT_TOOL = {
    "name": "build_segments",
    "description": "Identify salient passages in a document; return one segment per passage that warrants its own notebook cell.",
    "input_schema": {
        "type": "object",
        "properties": {
            "segments": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "snippet": {
                            "type": "string",
                            "description": "1-3 sentences verbatim from the document.",
                        },
                        "context": {
                            "type": "string",
                            "description": "Short note (<50 words) about the surrounding passage.",
                        },
                        "rationale": {
                            "type": "string",
                            "description": "One sentence explaining why this passage warrants a cell.",
                        },
                    },
                    "required": ["snippet", "context", "rationale"],
                },
            },
            "summary": {
                "type": "string",
                "description": "1-2 sentences: what the document is about overall, in case the orchestrator wants to use it as session context.",
            },
        },
        "required": ["segments", "summary"],
    },
}


@dataclass
class Segment:
    snippet: str
    context: str
    rationale: str


@dataclass
class SegmentationResult:
    segments: list[Segment] = field(default_factory=list)
    summary: str = ""
    model: str = ""
    cache_read_tokens: int = 0
    cache_creation_tokens: int = 0
    input_tokens: int = 0
    output_tokens: int = 0


class SegmenterError(RuntimeError):
    pass


def segment_document(text: str, model: str = DEFAULT_MODEL) -> SegmentationResult:
    """Segment a document into salient passages. Raises SegmenterError on failure."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise SegmenterError("ANTHROPIC_API_KEY not set in env or .env")
    try:
        import anthropic
    except ImportError as e:
        raise SegmenterError("anthropic SDK not installed") from e

    client = anthropic.Anthropic(api_key=api_key)
    user_msg = f"Document:\n\n{text.strip()}"

    try:
        response = client.messages.create(
            model=model,
            max_tokens=4096,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[SEGMENT_TOOL],
            tool_choice={"type": "tool", "name": "build_segments"},
            messages=[{"role": "user", "content": user_msg}],
        )
    except anthropic.APIError as e:
        raise SegmenterError(f"Anthropic API call failed: {e}") from e

    for block in response.content:
        if block.type == "tool_use":
            inp = block.input
            raw_segments = inp.get("segments", [])
            # Defensive: Sonnet 4.6 occasionally serializes the segments
            # array as a JSON-encoded string instead of returning a real
            # list — observed on ~30K-char transcript inputs. Try to
            # un-quote it. Without this, `for s in <string>:` iterates
            # character-by-character and silently produces 7000+ 1-char
            # "segments" that mostly dedup but occasionally slip through.
            if isinstance(raw_segments, str):
                import json as _json
                try:
                    raw_segments = _json.loads(raw_segments)
                except _json.JSONDecodeError:
                    raw_segments = []
            segments: list[Segment] = []
            if isinstance(raw_segments, list):
                for s in raw_segments:
                    if isinstance(s, dict) and s.get("snippet"):
                        snippet = s["snippet"].strip()
                        if len(snippet) >= 20:  # min meaningful snippet
                            segments.append(Segment(
                                snippet=snippet,
                                context=s.get("context", ""),
                                rationale=s.get("rationale", ""),
                            ))
                    elif isinstance(s, str):
                        snippet = s.strip()
                        if len(snippet) >= 20:
                            segments.append(Segment(snippet=snippet, context="", rationale=""))
            return SegmentationResult(
                segments=segments,
                summary=inp.get("summary", ""),
                model=model,
                cache_read_tokens=getattr(response.usage, "cache_read_input_tokens", 0) or 0,
                cache_creation_tokens=getattr(response.usage, "cache_creation_input_tokens", 0) or 0,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
            )
    raise SegmenterError(f"no tool_use block (stop_reason={response.stop_reason})")


def main() -> None:
    """CLI for testing the segmenter on a document."""
    import argparse
    import json
    import sys
    from dataclasses import asdict

    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--file", help="path to a document")
    p.add_argument("--text", help="document text inline (alternative to --file)")
    p.add_argument("--model", default=DEFAULT_MODEL)
    args = p.parse_args()

    if args.file:
        text = Path(args.file).read_text()
    elif args.text:
        text = args.text
    else:
        print("error: --file or --text required", file=sys.stderr)
        sys.exit(2)

    try:
        result = segment_document(text, args.model)
    except SegmenterError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)

    json.dump(asdict(result), sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
