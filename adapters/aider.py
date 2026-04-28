"""Aider chat-history → flat-transcript adapter.

Aider writes session history to .aider.chat.history.md in the project
root. Format (Aider 0.50+):

    # aider chat started at YYYY-MM-DD HH:MM:SS

    > /run some-command
    output

    #### user message goes here

    assistant response goes here

    #### next user message

    next assistant response

The `####` h4 headers introduce user messages; everything between
two `####` headers (or before the first) belongs to the assistant
or to system output. `>` prefixed lines are command outputs / aider
internals.

This adapter is best-effort — Aider's format has shifted across
versions and configurations. If the output is empty or surprising,
diff a real .aider.chat.history.md against this parser. Per
memory/multi_assistant_dashboard.md.
"""
from __future__ import annotations

import re
from pathlib import Path

# Lines aider produces that aren't conversation prose:
SKIP_LINE_PATTERNS = (
    re.compile(r"^# aider chat started"),  # session header
    re.compile(r"^> /"),                      # /command invocations
    re.compile(r"^> \^C"),                   # interrupts
    re.compile(r"^Files? added|^Files? edited|^Applied edit"),
    re.compile(r"^Tokens: |^Cost: |^Repo-map: "),
)


def _is_skip_line(line: str) -> bool:
    return any(p.match(line) for p in SKIP_LINE_PATTERNS)


def extract(source_path: Path) -> tuple[str, dict]:
    """Read an .aider.chat.history.md file; return (flat transcript, stats).

    The output format matches the Claude Code adapter so the watcher
    consumes both interchangeably: blank-line-separated `[role]\n{prose}`
    blocks.
    """
    text = Path(source_path).read_text()
    stats = {
        "kept": 0, "skipped_lines": 0, "kept_chars": 0,
        "user_blocks": 0, "assistant_blocks": 0,
    }
    out: list[str] = []
    current_role = None  # "user" while inside a #### block; "assistant" otherwise (after first ####)
    current_lines: list[str] = []
    seen_first_user = False

    def flush():
        nonlocal current_role, current_lines
        if not current_role or not current_lines:
            current_lines = []
            return
        prose = "\n".join(current_lines).strip()
        if prose:
            out.append(f"[{current_role}]\n{prose}")
            stats["kept"] += 1
            stats["kept_chars"] += len(prose)
            if current_role == "user":
                stats["user_blocks"] += 1
            else:
                stats["assistant_blocks"] += 1
        current_lines = []

    for line in text.splitlines():
        # User-message marker: #### header in aider's format
        if line.startswith("#### "):
            flush()
            current_role = "user"
            user_text = line[5:].strip()
            if user_text:
                current_lines.append(user_text)
            seen_first_user = True
            continue
        # Skip aider internals
        if _is_skip_line(line):
            stats["skipped_lines"] += 1
            continue
        # Anything before the first user marker is preamble — drop
        if not seen_first_user:
            stats["skipped_lines"] += 1
            continue
        # If we just finished a user line and now have non-#### content,
        # that's the assistant's response.
        if current_role == "user" and line.strip() == "":
            # Blank line ends the user block; switch to assistant
            flush()
            current_role = "assistant"
            continue
        current_lines.append(line)
    flush()

    return "\n\n".join(out) + "\n", stats
