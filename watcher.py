"""v0.5 Shape A -- autonomous transcript watcher.

Tails a transcript file and mints lucida cells when salient passages
emerge in the new content. Closes the loop where lucida becomes
ambient: it sits behind a conversation (Claude Code session, voice
transcript, anything) rather than being user-driven CLI.

Architecture (kept simple for v0.5+):
- One-pass delta processor: each call reads new content since the
  last_offset (persisted in .watcher_state_<file>.json), segments it,
  dedupes against existing cells.json snippets, mints non-dup cells.
- --watch INTERVAL turns it into a polling loop with a min_new_chars
  threshold so we don't fire the segmenter on trivial deltas.

Dedup is substring + word-level Jaccard; not perfect, but catches
near-identical reposts of the same passage. False positives skip
cells we'd want; false negatives mint a duplicate. Tune threshold.

State (last_offset) persists across runs; if you delete the state
file, next run reprocesses the whole transcript.
"""
from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path


def _state_path_for(transcript_path: Path) -> Path:
    """Where to persist last_offset for a given transcript."""
    return transcript_path.parent / f".watcher_state_{transcript_path.stem}.json"


def _load_state(state_path: Path) -> dict:
    if not state_path.exists():
        return {}
    try:
        return json.loads(state_path.read_text())
    except json.JSONDecodeError:
        return {}


def _save_state(state_path: Path, state: dict) -> None:
    state_path.write_text(json.dumps(state, indent=2))


def _is_dup(snippet: str, existing_snippets: set[str], jaccard_threshold: float = 0.7) -> bool:
    """Cheap dedup: exact match -> substring -> word-level Jaccard.

    Returns True if `snippet` substantially overlaps any existing one.
    """
    s_lower = snippet.strip().lower()
    if not s_lower:
        return True  # don't mint empty
    for existing in existing_snippets:
        e_lower = existing.strip().lower()
        if not e_lower:
            continue
        if s_lower == e_lower:
            return True
        if s_lower in e_lower or e_lower in s_lower:
            return True
        s_words = set(s_lower.split())
        e_words = set(e_lower.split())
        if not s_words or not e_words:
            continue
        union = s_words | e_words
        intersect = s_words & e_words
        if len(intersect) / len(union) >= jaccard_threshold:
            return True
    return False


@dataclass
class WatcherStep:
    """Result of one watcher pass."""
    new_chars: int
    segments_found: int
    cells_minted: int
    cells_skipped_dup: int
    minted_ids: list[str] = field(default_factory=list)
    reflection_id: str | None = None
    note: str = ""


def process_once(
    transcript_path: Path,
    *,
    write: bool = True,
    generate: bool = False,
    use_llm: bool | None = None,
    auto_retrigger: bool = True,
    max_retriggers: int = 3,
    min_new_chars: int = 200,
    state_path: Path | None = None,
    reflect_every: int | None = None,
    reflect_n: int = 5,
) -> WatcherStep:
    """Read transcript delta, segment, mint non-duplicate cells.

    If ``reflect_every`` is a positive int, the watcher tracks cumulative
    minted-since-last-reflect across passes (in the state file) and calls
    orchestrator.reflect_and_persist(reflect_n) once the threshold is
    crossed. Without this, shape A is a one-way pipe — the closed-loop
    metric only goes down.
    """
    if not transcript_path.exists():
        return WatcherStep(0, 0, 0, 0, note=f"transcript not found: {transcript_path}")

    state_path = state_path or _state_path_for(transcript_path)
    state = _load_state(state_path)
    last_offset = state.get("last_offset", 0)

    text = transcript_path.read_text()
    new_text = text[last_offset:]

    if len(new_text) < min_new_chars:
        return WatcherStep(
            new_chars=len(new_text),
            segments_found=0,
            cells_minted=0,
            cells_skipped_dup=0,
            note=f"only {len(new_text)} new chars; min_new_chars={min_new_chars}",
        )

    # Lazy imports so the watcher module loads even without the deps
    import segmenter as _seg
    from orchestrator import append_proposal, load_cells

    try:
        seg_result = _seg.segment_document(new_text)
    except Exception as e:
        return WatcherStep(
            new_chars=len(new_text), segments_found=0, cells_minted=0,
            cells_skipped_dup=0, note=f"segmenter error: {e}",
        )

    existing = load_cells()
    existing_snippets = {c.get("trigger_snippet", "") for c in existing.get("cells", [])}

    minted_ids: list[str] = []
    skipped = 0
    for s in seg_result.segments:
        if _is_dup(s.snippet, existing_snippets):
            skipped += 1
            continue
        ctx = (
            f"Transcript: {transcript_path.name}. "
            f"Recent context: {seg_result.summary}. "
            f"Surrounding: {s.context}"
        )
        try:
            proposal = append_proposal(
                s.snippet, ctx, None,
                write=write,
                generate_image=generate,
                use_llm=use_llm,
                auto_retrigger=auto_retrigger,
                max_retriggers=max_retriggers,
            )
            minted_ids.append(proposal.id)
            existing_snippets.add(s.snippet)  # avoid re-mint within this pass
        except Exception as e:
            skipped += 1
            print(f"  failed to mint segment: {e}", file=sys.stderr)

    # Reflection cadence: drive a reflection cell after every `reflect_every`
    # mintings (cumulative across passes). State persists the running count
    # so a slow stream of single-cell mintings still triggers reflection on
    # schedule. Reflection failures are logged but don't block the watcher.
    reflection_id: str | None = None
    if reflect_every and reflect_every > 0 and minted_ids:
        pending = state.get("cells_minted_since_reflect", 0) + len(minted_ids)
        if pending >= reflect_every:
            try:
                from orchestrator import reflect_and_persist
                proposal = reflect_and_persist(reflect_n, write=write)
                reflection_id = proposal.id
                pending = 0
            except Exception as e:
                print(f"  reflection error: {e}", file=sys.stderr)
        state["cells_minted_since_reflect"] = pending

    if write:
        state["last_offset"] = len(text)
        state["last_pass"] = time.time()
        _save_state(state_path, state)

    return WatcherStep(
        new_chars=len(new_text),
        segments_found=len(seg_result.segments),
        cells_minted=len(minted_ids),
        cells_skipped_dup=skipped,
        minted_ids=minted_ids,
        reflection_id=reflection_id,
        note=seg_result.summary,
    )


def watch(
    transcript_path: Path,
    *,
    interval: float = 30.0,
    **kwargs,
) -> None:
    """Polling loop: process_once every `interval` seconds until interrupted."""
    print(f"[watcher] tailing {transcript_path}; interval={interval}s",
          file=sys.stderr)
    try:
        while True:
            step = process_once(transcript_path, **kwargs)
            ts = time.strftime("%H:%M:%S")
            metric = ""
            # Closed-loop ratio after each pass that minted something —
            # cheap, runs against in-memory cells.json. The point is to
            # surface the metric live during shape-A operation so we can
            # tell whether new cells are participating in loops or just
            # piling up.
            if step.cells_minted:
                try:
                    from orchestrator import closed_loop_stats, load_cells
                    cl = closed_loop_stats(load_cells()["cells"])
                    metric = (
                        f" closed-loop {cl['closed_cells']}/{cl['content_cells']}"
                        f"={cl['ratio'] * 100:.0f}%"
                    )
                except Exception:
                    metric = ""
                refl = f" + reflection {step.reflection_id}" if step.reflection_id else ""
                print(
                    f"[watcher {ts}] +{step.cells_minted} cells "
                    f"({step.cells_skipped_dup} dups skipped, "
                    f"{step.new_chars} new chars){metric}{refl}: {step.minted_ids}",
                    file=sys.stderr,
                )
            else:
                print(
                    f"[watcher {ts}] idle ({step.new_chars} new chars; "
                    f"{step.note})",
                    file=sys.stderr,
                )
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\n[watcher] stopped", file=sys.stderr)


def main() -> None:
    """CLI entry point: one-pass by default, --watch for polling loop."""
    import argparse

    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--transcript", required=True, help="path to the transcript file")
    p.add_argument("--watch", type=float, default=None,
                   help="poll every N seconds (default: one-pass and exit)")
    p.add_argument("--write", action="store_true", default=True,
                   help="persist minted cells to cells.json (default true)")
    p.add_argument("--no-write", action="store_false", dest="write",
                   help="dry-run; don't persist")
    p.add_argument("--generate", action="store_true",
                   help="actually generate specs (specialists/Gemini); else proposals only")
    p.add_argument("--no-llm-classify", action="store_true",
                   help="force the v0 keyword classifier (off by default)")
    p.add_argument("--no-auto-retrigger", action="store_true",
                   help="disable retrigger loop")
    p.add_argument("--max-retriggers", type=int, default=3)
    p.add_argument("--min-new-chars", type=int, default=200,
                   help="don't fire the segmenter unless the delta is at least this large")
    p.add_argument("--reflect-every", type=int,
                   default=int(os.environ.get("LUCIDA_WATCHER_REFLECT_EVERY", "0") or "0"),
                   help="trigger a reflection cell after every N minted cells "
                        "(cumulative across passes; 0 disables; default 0). "
                        "Without this, shape A is one-way and the closed-loop ratio only goes down.")
    p.add_argument("--reflect-n", type=int, default=5,
                   help="number of recent visible cells the reflection covers (default 5)")
    args = p.parse_args()

    use_llm = False if args.no_llm_classify else None

    kwargs = dict(
        write=args.write,
        generate=args.generate,
        use_llm=use_llm,
        auto_retrigger=not args.no_auto_retrigger,
        max_retriggers=args.max_retriggers,
        min_new_chars=args.min_new_chars,
        reflect_every=args.reflect_every,
        reflect_n=args.reflect_n,
    )

    transcript_path = Path(args.transcript)
    if args.watch is not None:
        watch(transcript_path, interval=args.watch, **kwargs)
    else:
        step = process_once(transcript_path, **kwargs)
        print(json.dumps({
            "new_chars": step.new_chars,
            "segments_found": step.segments_found,
            "cells_minted": step.cells_minted,
            "cells_skipped_dup": step.cells_skipped_dup,
            "minted_ids": step.minted_ids,
            "reflection_id": step.reflection_id,
            "note": step.note,
        }, indent=2))


if __name__ == "__main__":
    main()
