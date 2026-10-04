"""motion_timeline — sanitizer for animated_svg declarative motion timelines.

The animated_svg specialist can emit, alongside its SVG, a small JSON
timeline that lucida's own code plays back with GSAP (motion.mjs). The
model never writes JavaScript: it picks ops from a fixed vocabulary and
names targets by #id / .class inside its own SVG. This module is the
mint-time gate: it normalizes the timeline, drops anything outside the
whitelist, and drops steps whose targets don't exist in the SVG. The
browser re-sanitizes with the same rules (motion.mjs sanitizeTimeline) —
cells.json is a file on disk, not a trusted channel.

Contract (mirrored in specialists.ANIMATED_SVG_SYSTEM and motion.mjs):

  {
    "repeat": -1,            # -1 = loop forever, 0..5 = extra plays
    "repeat_delay": 1.0,     # seconds of rest between loops (0..4)
    "yoyo": false,
    "steps": [
      {
        "target": "#m-dot",  # one #id or .class inside the SVG
        "op": "from",        # from | to | set | draw | morph | follow
        "at": ">",           # seconds, or "<" / ">" / "+=0.2" / "-=0.2"
        "dur": 0.6,
        "ease": "power2.out",
        "stagger": 0.1,      # seconds between elements a .class matches
        "props": {"opacity": 0, "y": 12},   # from / to / set
        "draw": [0, 100],    # draw: stroke range to reveal, percent
        "morph_to": "#m-b",  # morph: path whose shape to morph into
        "path": "#m-track",  # follow: path to travel along
        "why": "direct"      # motion provenance: direct | derived
      }
    ]
  }

The SVG markup itself is the REST frame: what static renderers (mixed3d
PNG snapshots, prefers-reduced-motion, GSAP failing to load) show. The
timeline animates into or around it.
"""

from __future__ import annotations

import re

MAX_STEPS = 24
MAX_AT = 10.0
MAX_DUR = 6.0
MAX_STAGGER = 1.0
MAX_REPEAT = 5
MAX_REPEAT_DELAY = 4.0

OPS = ("from", "to", "set", "draw", "morph", "follow")
PROVENANCE = ("direct", "derived")

EASES = frozenset(
    ["none", "back.out", "elastic.out", "bounce.out"]
    + [
        f"{family}.{kind}"
        for family in ("power1", "power2", "power3", "power4", "sine", "expo", "circ")
        for kind in ("in", "out", "inOut")
    ]
)

# Numeric props and their clamp ranges. Transform props go through GSAP's
# CSS/transform path; geometry props are tweened as SVG attributes.
NUMERIC_PROPS: dict[str, tuple[float, float]] = {
    "opacity": (0.0, 1.0),
    "x": (-2000.0, 2000.0),
    "y": (-2000.0, 2000.0),
    "scale": (0.0, 10.0),
    "scaleX": (0.0, 10.0),
    "scaleY": (0.0, 10.0),
    "rotation": (-3600.0, 3600.0),
    "strokeWidth": (0.0, 50.0),
    "r": (0.0, 2000.0),
    "cx": (-2000.0, 2000.0),
    "cy": (-2000.0, 2000.0),
    "width": (0.0, 2000.0),
    "height": (0.0, 2000.0),
    "x1": (-2000.0, 2000.0),
    "y1": (-2000.0, 2000.0),
    "x2": (-2000.0, 2000.0),
    "y2": (-2000.0, 2000.0),
}
COLOR_PROPS = frozenset(["fill", "stroke"])

_SELECTOR_RE = re.compile(r"^[#.][A-Za-z_][\w-]{0,63}$")
_COLOR_RE = re.compile(r"^(\$[A-Za-z]\w{0,31}|#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|none)$")
_REL_AT_RE = re.compile(r"^([+-])=(\d+(?:\.\d+)?)$")


def _num(v, lo: float, hi: float) -> float | None:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    if v != v:  # NaN
        return None
    return float(min(hi, max(lo, v)))


def _at(v) -> float | str:
    if isinstance(v, str):
        s = v.strip()
        if s in ("<", ">"):
            return s
        m = _REL_AT_RE.match(s)
        if m:
            amt = min(MAX_AT, float(m.group(2)))
            return f"{m.group(1)}={amt:g}"
        return ">"
    n = _num(v, 0.0, MAX_AT)
    return ">" if n is None else n


def _svg_has_target(svg: str, sel: str) -> bool:
    name = re.escape(sel[1:])
    if sel[0] == "#":
        return re.search(rf"""\bid\s*=\s*["']{name}["']""", svg) is not None
    return re.search(rf"""\bclass\s*=\s*["'][^"']*(?<![\w-]){name}(?![\w-])""", svg) is not None


def _props(raw) -> dict:
    out: dict = {}
    if not isinstance(raw, dict):
        return out
    for k, v in raw.items():
        if k in NUMERIC_PROPS:
            n = _num(v, *NUMERIC_PROPS[k])
            if n is not None:
                out[k] = n
        elif k in COLOR_PROPS and isinstance(v, str) and _COLOR_RE.match(v.strip()):
            out[k] = v.strip()
    return out


def _step(raw, svg: str | None) -> dict | None:
    if not isinstance(raw, dict):
        return None
    op = raw.get("op")
    target = raw.get("target")
    if op not in OPS or not isinstance(target, str) or not _SELECTOR_RE.match(target):
        return None
    if svg is not None and not _svg_has_target(svg, target):
        return None
    step: dict = {"target": target, "op": op, "at": _at(raw.get("at", ">"))}
    if op != "set":
        step["dur"] = _num(raw.get("dur", 0.6), 0.0, MAX_DUR)
        if step["dur"] is None:
            step["dur"] = 0.6
        ease = raw.get("ease")
        step["ease"] = ease if ease in EASES else "power2.out"
    stagger = _num(raw.get("stagger", 0), 0.0, MAX_STAGGER)
    if stagger:
        step["stagger"] = stagger

    if op in ("from", "to", "set"):
        props = _props(raw.get("props"))
        if not props:
            return None
        step["props"] = props
    elif op == "draw":
        rng = raw.get("draw", [0, 100])
        if not isinstance(rng, list) or len(rng) != 2:
            rng = [0, 100]
        a = _num(rng[0], 0.0, 100.0)
        b = _num(rng[1], 0.0, 100.0)
        step["draw"] = [0.0 if a is None else a, 100.0 if b is None else b]
    elif op == "morph":
        to = raw.get("morph_to")
        if not isinstance(to, str) or not _SELECTOR_RE.match(to) or to[0] != "#":
            return None
        if svg is not None and not _svg_has_target(svg, to):
            return None
        step["morph_to"] = to
    elif op == "follow":
        path = raw.get("path")
        if not isinstance(path, str) or not _SELECTOR_RE.match(path) or path[0] != "#":
            return None
        if svg is not None and not _svg_has_target(svg, path):
            return None
        step["path"] = path
        step["auto_rotate"] = bool(raw.get("auto_rotate", False))

    why = raw.get("why")
    if why in PROVENANCE:
        step["why"] = why
    return step


def sanitize_timeline(raw, svg: str | None = None) -> dict | None:
    """Return a normalized, whitelisted timeline, or None if nothing survives.

    When `svg` is given, steps whose target / morph_to / path don't exist
    in it are dropped (a model that renames an id between the SVG and the
    timeline otherwise ships a cell whose motion silently never plays).
    """
    if not isinstance(raw, dict):
        return None
    steps_raw = raw.get("steps")
    if not isinstance(steps_raw, list):
        return None
    steps = [s for s in (_step(r, svg) for r in steps_raw[:MAX_STEPS]) if s is not None]
    if not steps:
        return None
    repeat = raw.get("repeat", -1)
    if isinstance(repeat, bool) or not isinstance(repeat, int):
        repeat = -1
    repeat = -1 if repeat < 0 else min(repeat, MAX_REPEAT)
    delay = _num(raw.get("repeat_delay", 1.0), 0.0, MAX_REPEAT_DELAY)
    return {
        "repeat": repeat,
        "repeat_delay": 1.0 if delay is None else delay,
        "yoyo": bool(raw.get("yoyo", False)),
        "steps": steps,
    }
