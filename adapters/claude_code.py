"""Claude Code session-jsonl → flat-transcript adapter.

Skips tool_use/tool_result blocks (infrastructure noise — file dumps,
bash output, edit confirmations). Keeps:
  - user.message.content (the human's prose)
  - assistant.message.content text blocks (the model's prose)
  - assistant thinking blocks (only if you ask; they're noisy)

Filters system-injected user messages (skill loads, /command invocations,
compact summaries) and strips inline tags (<bash-input>, <system-reminder>,
etc.). Without these, the segmenter mints cells about model parameter
tables and SDK boilerplate.

This module was previously the standalone jsonl_to_transcript.py;
relocated 2026-04-28 as part of the adapter refactor (memory/
multi_assistant_dashboard.md).
"""

from __future__ import annotations

import json
import re
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

# Inline tag blocks to strip before keeping the surrounding text.
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


def extract(source_path: Path, *, include_thinking: bool = False) -> tuple[str, dict]:
    """Read a Claude Code .jsonl session log; return (flat transcript, stats)."""
    out: list[str] = []
    stats = {
        "kept": 0,
        "skipped_prefix": 0,
        "skipped_empty": 0,
        "stripped_chars": 0,
        "kept_chars": 0,
    }
    with Path(source_path).open() as f:
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
