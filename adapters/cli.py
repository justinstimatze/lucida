"""Unified CLI dispatcher across the lucida transcript adapters.

Usage:

    python -m adapters.cli --source claude-code <jsonl> --out /tmp/transcript.txt
    python -m adapters.cli --source aider <chat.md>  --out /tmp/transcript.txt

The output transcript is what the watcher consumes regardless of the
source AI tool — single contract, one watcher, many adapters.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from adapters import ADAPTERS


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--source",
        required=True,
        choices=sorted(ADAPTERS.keys()),
        help="which adapter to use",
    )
    p.add_argument("source_path", type=Path, help="path to the AI tool's session log/history")
    p.add_argument("--out", type=Path, required=True, help="path for the flat transcript output")
    p.add_argument(
        "--thinking",
        action="store_true",
        help="(claude-code only) include assistant thinking blocks",
    )
    args = p.parse_args()

    extractor = ADAPTERS[args.source]
    if args.source == "claude-code":
        text, stats = extractor(args.source_path, include_thinking=args.thinking)
    else:
        if args.thinking:
            print(f"warning: --thinking has no effect for source '{args.source}'", file=sys.stderr)
        text, stats = extractor(args.source_path)

    args.out.write_text(text)
    print(f"wrote {len(text):,} chars to {args.out}", file=sys.stderr)
    print(
        " ".join(f"{k}={v}" for k, v in stats.items()),
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
