"""Extract the prose layer from a Claude Code .jsonl session log.

Skips tool_use/tool_result blocks (infrastructure noise — file dumps,
bash output, edit confirmations). Keeps:
  - user.message.content (the human's prose)
  - assistant.message.content text blocks (the model's prose)
  - assistant thinking blocks (only if you ask; they're noisy)

Output is a flat transcript suitable for the segmenter — one block per
message separated by blank lines, with role tags so segments can carry
some context about who was speaking.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def extract(jsonl_path: Path, *, include_thinking: bool = False) -> str:
    out: list[str] = []
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
            text = "\n".join(c for c in chunks if c.strip()).strip()
            if not text:
                continue
            out.append(f"[{role}]\n{text}")
    return "\n\n".join(out) + "\n"


def main():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("jsonl", type=Path)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--thinking", action="store_true",
                   help="include assistant thinking blocks (verbose)")
    args = p.parse_args()
    text = extract(args.jsonl, include_thinking=args.thinking)
    args.out.write_text(text)
    print(f"wrote {len(text):,} chars to {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
