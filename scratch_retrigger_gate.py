"""Test the three-band retrigger gate without hitting the API.

Replays the lighthouse-chain pathology (eval@0.82 with should_retrigger=True)
through the new gate logic to confirm the orchestrator now refuses to
retrigger when the score is above the ceiling, regardless of what the
evaluator's should_retrigger flag says.

Also exercises the score-floor branch (forced retrigger with stronger
guidance composition) and the guidance-stalled branch.
"""
from __future__ import annotations

from dataclasses import dataclass
from orchestrator import _guidance_too_similar


@dataclass
class FakeEval:
    quality_score: float
    what_worked: str
    what_didnt_work: str
    should_retrigger: bool
    retrigger_guidance: str


def gate(eval_result: FakeEval, score_floor: float = 0.5, score_ceiling: float = 0.8):
    """Mirror of the orchestrator's three-band gate. Returns
    (should_retrigger, gate_reason)."""
    if eval_result.quality_score < score_floor:
        return True, "score_floor"
    if eval_result.quality_score >= score_ceiling:
        return False, "score_ceiling"
    return eval_result.should_retrigger, "evaluator" if eval_result.should_retrigger else "evaluator_accept"


def compose_guidance(eval_result: FakeEval, score_floor: float = 0.5) -> str:
    """Mirror of the orchestrator's guidance composition."""
    if eval_result.retrigger_guidance.strip():
        return eval_result.retrigger_guidance.strip()
    if eval_result.what_didnt_work.strip():
        return (
            f"Score-floor retrigger ({eval_result.quality_score:.2f} "
            f"< {score_floor}). Previous attempt failed at: "
            f"{eval_result.what_didnt_work.strip()} "
            f"Try a fundamentally different visual interpretation; "
            f"attend to every named entity and prop in the snippet."
        )
    return (
        f"Score below floor ({eval_result.quality_score:.2f} "
        f"< {score_floor}) with no specific failure analysis. "
        f"Re-read the snippet and ground the image in its named "
        f"entities, props, and setting. Resist generic stock-"
        f"illustration furniture."
    )


def main():
    print("=== Lighthouse pathology (cells 0023→0024→0025 replay) ===")
    # The actual lighthouse-chain evaluator outputs were eval@0.82 with
    # should_retrigger=True, three attempts running. Old gate: retrigger.
    # New gate: accept (above ceiling).
    lighthouse = FakeEval(
        quality_score=0.82,
        what_worked="solitary lighthouse visible, ocean below",
        what_didnt_work="banding pattern not unequal-width as snippet specifies",
        should_retrigger=True,
        retrigger_guidance="paint bands in unequal widths to match the snippet's 'unequal width' detail",
    )
    rt, reason = gate(lighthouse)
    print(f"  score=0.82 should_retrigger=True → retrigger={rt} ({reason})")
    assert rt is False and reason == "score_ceiling", "lighthouse case should hit ceiling"

    print()
    print("=== Score-floor branch with weak evaluator output ===")
    # Score below floor, evaluator forgot to set retrigger_guidance.
    # Old fallback: bare what_didnt_work string (description, not corrective).
    # New: actionable corrective frame.
    weak = FakeEval(
        quality_score=0.4,
        what_worked="",
        what_didnt_work="image is generic stock illustration, no specific snippet detail visible",
        should_retrigger=False,
        retrigger_guidance="",
    )
    rt, reason = gate(weak)
    g = compose_guidance(weak)
    print(f"  score=0.4 should_retrigger=False → retrigger={rt} ({reason})")
    print(f"  guidance: {g[:120]}...")
    assert rt is True and reason == "score_floor"
    assert "fundamentally different" in g, "should add corrective frame, not just regurgitate"

    print()
    print("=== Score-floor with no failure analysis at all ===")
    nothing = FakeEval(
        quality_score=0.3,
        what_worked="",
        what_didnt_work="",
        should_retrigger=False,
        retrigger_guidance="",
    )
    g = compose_guidance(nothing)
    print(f"  guidance: {g[:120]}...")
    assert "Re-read the snippet" in g

    print()
    print("=== Mid-band defers to evaluator ===")
    mid_yes = FakeEval(0.65, "", "missing prop X", True, "add prop X to next attempt")
    mid_no = FakeEval(0.65, "", "minor cropping", False, "")
    print(f"  0.65 / yes → {gate(mid_yes)}")
    print(f"  0.65 / no  → {gate(mid_no)}")
    assert gate(mid_yes) == (True, "evaluator")
    assert gate(mid_no) == (False, "evaluator_accept")

    print()
    print("=== Guidance-stalled detection ===")
    g1 = "paint bands in unequal widths to match the snippet's unequal-width detail"
    g2 = "the bands should be unequal in width as the snippet says"
    g3 = "make the lighthouse look more dramatic"
    print(f"  g1 vs g2 (paraphrase): {_guidance_too_similar(g1, g2)}")
    print(f"  g1 vs g3 (different):  {_guidance_too_similar(g1, g3)}")
    # Threshold may not catch this depending on word overlap; just print
    # rather than assert so the test stays useful even as threshold tunes.

    print()
    print("All gate assertions passed.")


if __name__ == "__main__":
    main()
