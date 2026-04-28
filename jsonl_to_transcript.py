"""Extract the prose layer from a Claude Code .jsonl session log.

Skips tool_use/tool_result blocks (infrastructure noise — file dumps,
bash output, edit confirmations). Keeps:
  - user.message.content (the human's prose)
  - assistant.message.content text blocks (the model's prose)
  - assistant thinking blocks (only if you ask; they're noisy)

Filters system-injected user messages that aren't actually conversation:
skill loads, /command invocations, compact summaries. Strips common
inline tags (<bash-input>, <system-reminder>, etc.) before keeping the
text. Without these, the segmenter happily mints cells about model
parameter tables and SDK boilerplate.

Output is a flat transcript suitable for the segmenter — one block per
message separated by blank lines, with role tags so segments can carry
some context about who was speaking.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path


# Whole-message prefixes that mark system-injected user-role content.
# If a user-role message starts with one of these (after .lstrip()), drop it.
SKIP_PREFIXES = (
    "Base directory for this skill:",
    "<command-name>",
    "This session is being continued from a previous conversation",
    "<local-command-caveat>",
    "Caveat: The messages below were generated",
)

# Inline tag blocks to strip before keeping the surrounding text. These
# wrap command output and system reminders inside otherwise-conversational
# user messages (e.g. when the user types `! some_bash_cmd` mid-chat).
# `re.DOTALL` so `.` spans newlines.
STRIP_TAG_BLOCKS = re.compile(
    r"<(?:bash-input|bash-stdout|bash-stderr|system-reminder|local-command-caveat"
    r"|command-name|command-args|command-message|command-stdout|command-stderr"
    r"|persisted-output|tool_use_error)>.*?</(?:bash-input|bash-stdout|bash-stderr"
    r"|system-reminder|local-command-caveat|command-name|command-args"
    r"|command-message|command-stdout|command-stderr|persisted-output"
    r"|tool_use_error)>",
    re.DOTALL,
)


def clean_message(text: str) -> str:
    """Strip embedded tag blocks; return the residual prose, stripped."""
    return STRIP_TAG_BLOCKS.sub("", text).strip()


def is_skipped_message(text: str) -> bool:
    """Whole-message system-injection patterns we drop entirely."""
    head = text.lstrip()
    return any(head.startswith(p) for p in SKIP_PREFIXES)


def extract(jsonl_path: Path, *, include_thinking: bool = False) -> tuple[str, dict]:
    out: list[str] = []
    stats = {"kept": 0, "skipped_prefix": 0, "skipped_empty": 0,
             "stripped_chars": 0, "kept_chars": 0}
    with jsonl_path.open() as f:
        for line in f:
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            t = d.get("type")
            if t not in ("user", "assistant"):
                continue
            msg = d.get("message")
            if not isinstance(msg, dict):
                continue
            role = msg.get("role", t)
            content = msg.get("content")
            chunks: list[str] = []
            if isinstance(content, str):
                chunks.append(content)
            elif isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    btype = block.get("type")
                    if btype == "text":
                        chunks.append(block.get("text", ""))
                    elif btype == "thinking" and include_thinking:
                        chunks.append(f"[thinking] {block.get('thinking', '')}")
                    # skip tool_use, tool_result, image, etc.
            raw = "\n".join(c for c in chunks if c.strip()).strip()
            if not raw:
                continue
            if is_skipped_message(raw):
                stats["skipped_prefix"] += 1
                continue
            cleaned = clean_message(raw)
            stats["stripped_chars"] += len(raw) - len(cleaned)
            if not cleaned:
                stats["skipped_empty"] += 1
                continue
            stats["kept"] += 1
            stats["kept_chars"] += len(cleaned)
            out.append(f"[{role}]\n{cleaned}")
    return "\n\n".join(out) + "\n", stats


def main():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("jsonl", type=Path)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--thinking", action="store_true",
                   help="include assistant thinking blocks (verbose)")
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
