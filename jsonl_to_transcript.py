"""Backward-compat shim — the real logic moved to adapters/claude_code.py
as part of the multi-assistant adapter refactor (memory/
multi_assistant_dashboard.md). The hooks/recent_mints.sh + the live
watcher loop both invoke this script with the legacy CLI; keep working.

For new integrations prefer:

    python -m adapters.cli --source claude-code <jsonl> --out <txt>
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from adapters.claude_code import clean_message, extract, is_skipped_message  # re-exports

__all__ = ["clean_message", "extract", "is_skipped_message"]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("jsonl", type=Path)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument(
        "--thinking",
        action="store_true",
        help="include assistant thinking blocks (verbose)",
    )
    args = p.parse_args()
    text, stats = extract(args.jsonl, include_thinking=args.thinking)
    args.out.write_text(text)
    print(f"wrote {len(text):,} chars to {args.out}", file=sys.stderr)
    print(
        f"kept={stats['kept']} skipped_prefix={stats['skipped_prefix']} "
        f"skipped_empty={stats['skipped_empty']} stripped={stats['stripped_chars']:,}c "
        f"kept_chars={stats['kept_chars']:,}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
