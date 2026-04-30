"""Pluggable transcript adapters for the lucida watcher.

Per memory/multi_assistant_dashboard.md: lucida's positioning is
"passive companion to AI sessions" — currently scoped to Claude Code,
but the segmenter + classifier + specialists are format-agnostic.
The only AI-tool-specific code is the transcript extractor (turning
the tool's native log/history format into flat prose).

Each adapter implements the same interface:

    def extract(source_path: Path, **kwargs) -> tuple[str, dict]

returning (flat_transcript, stats_dict). The dispatcher in
adapters/cli.py picks the adapter by name; the watcher consumes the
flat transcript without caring which AI tool produced it.

Add a new adapter by writing one Python file with the extract()
function and registering it in ADAPTERS below.
"""

from __future__ import annotations

from .aider import extract as aider_extract
from .claude_code import extract as claude_code_extract

# Registry: source-name → extractor. Add new adapters here.
ADAPTERS = {
    "claude-code": claude_code_extract,
    "aider": aider_extract,
}

__all__ = ["ADAPTERS", "aider_extract", "claude_code_extract"]
