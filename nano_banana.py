"""nano_banana — Gemini image-generation specialist for lucida.

Given a prompt and a target output path, calls Gemini's native image
generation model and writes the resulting PNG. Returns the relative path
to the saved image so the orchestrator can populate a cell's image_path.

Designed for v0: clear errors, no retries, small surface. Daily-cap is
advisory — stored in a tiny JSON sidecar so it survives process restarts.

Reference:
- https://ai.google.dev/gemini-api/docs/image-generation
- https://deepmind.google/models/gemini-image/
"""
from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass

DEFAULT_MODEL = os.environ.get("NANO_BANANA_MODEL", "gemini-2.5-flash-image")
DAILY_CAP = int(os.environ.get("LUCIDA_DAILY_IMAGE_CAP", "200"))
USAGE_PATH = Path(__file__).parent / ".nano_banana_usage.json"


class NanoBananaError(RuntimeError):
    pass


@dataclass
class GenResult:
    image_path: Path
    model: str
    bytes_written: int


def _load_usage() -> dict:
    if not USAGE_PATH.exists():
        return {}
    try:
        return json.loads(USAGE_PATH.read_text())
    except json.JSONDecodeError:
        return {}


def _save_usage(usage: dict) -> None:
    USAGE_PATH.write_text(json.dumps(usage, indent=2))


def _check_and_bump_daily_cap() -> None:
    today = date.today().isoformat()
    usage = _load_usage()
    count = usage.get(today, 0)
    if count >= DAILY_CAP:
        raise NanoBananaError(
            f"daily cap reached: {count}/{DAILY_CAP} images generated today. "
            f"adjust LUCIDA_DAILY_IMAGE_CAP in .env if intentional."
        )
    usage[today] = count + 1
    # prune old entries (keep last 30 days)
    cutoff = date.today().toordinal() - 30
    usage = {k: v for k, v in usage.items()
             if date.fromisoformat(k).toordinal() >= cutoff}
    _save_usage(usage)


def generate(prompt: str, out_path: Path, model: str = DEFAULT_MODEL) -> GenResult:
    """Generate an image from `prompt`, write to `out_path`, return result."""
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise NanoBananaError(
            "GOOGLE_API_KEY not set. copy .env.example to .env and fill it in."
        )

    _check_and_bump_daily_cap()

    try:
        from google import genai
        from google.genai import types
    except ImportError as e:
        raise NanoBananaError(
            "google-genai not installed. run `uv pip install -e .` or "
            "`pip install google-genai`."
        ) from e

    client = genai.Client(api_key=api_key)

    # Image-output models accept a regular generate_content call. The
    # response contains inline_data parts with image bytes.
    resp = client.models.generate_content(
        model=model,
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
        ),
    )

    image_bytes: bytes | None = None
    for cand in resp.candidates or []:
        for part in cand.content.parts or []:
            if getattr(part, "inline_data", None) and part.inline_data.data:
                image_bytes = part.inline_data.data
                break
        if image_bytes:
            break

    if not image_bytes:
        raise NanoBananaError(
            f"no image returned by {model}. response candidates: "
            f"{len(resp.candidates or [])}"
        )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(image_bytes)
    return GenResult(image_path=out_path, model=model, bytes_written=len(image_bytes))


def main() -> None:
    import argparse
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--prompt", required=True)
    p.add_argument("--out", required=True, help="output PNG path")
    p.add_argument("--model", default=DEFAULT_MODEL)
    args = p.parse_args()

    try:
        result = generate(args.prompt, Path(args.out), args.model)
    except NanoBananaError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"wrote {result.bytes_written} bytes to {result.image_path} "
          f"(model: {result.model})")


if __name__ == "__main__":
    main()
