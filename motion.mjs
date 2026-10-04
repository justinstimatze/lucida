// motion.mjs — plays animated_svg declarative timelines with GSAP.
//
// The animated_svg specialist emits an SVG (the REST frame) plus an
// optional JSON timeline from a fixed op vocabulary (motion_timeline.py
// documents the contract). This module re-sanitizes the timeline (the
// cells.json file is not a trusted channel), resolves targets inside the
// cell's own <svg> only, and builds a GSAP timeline. The model never
// supplies code, selectors beyond `#id` / `.class`, or attribute names
// outside the whitelist — so no href / on* / style injection path exists
// through the timeline, independent of DOMPurify.
//
// Degrades to the static rest frame (the markup as authored) when GSAP
// didn't load, the user prefers reduced motion, or nothing in the
// timeline resolves. Off-screen cells pause; lazyMount teardown kills.

const MAX_STEPS = 24;
const MAX_AT = 10;
const MAX_DUR = 6;
const MAX_STAGGER = 1;
const MAX_REPEAT = 5;
const MAX_REPEAT_DELAY = 4;

const OPS = new Set(["from", "to", "set", "draw", "morph", "follow"]);
const EASES = new Set(["none", "back.out", "elastic.out", "bounce.out"]);
for (const f of ["power1", "power2", "power3", "power4", "sine", "expo", "circ"]) {
  for (const k of ["in", "out", "inOut"]) EASES.add(`${f}.${k}`);
}

// Transform/opacity props go through GSAP's CSS path; geometry props are
// SVG attributes. Ranges mirror motion_timeline.NUMERIC_PROPS.
const TRANSFORM_PROPS = {
  opacity: [0, 1], x: [-2000, 2000], y: [-2000, 2000],
  scale: [0, 10], scaleX: [0, 10], scaleY: [0, 10], rotation: [-3600, 3600],
};
const ATTR_PROPS = {
  strokeWidth: [0, 50], r: [0, 2000], cx: [-2000, 2000], cy: [-2000, 2000],
  width: [0, 2000], height: [0, 2000],
  x1: [-2000, 2000], y1: [-2000, 2000], x2: [-2000, 2000], y2: [-2000, 2000],
};
const ATTR_NAMES = { strokeWidth: "stroke-width" };
const COLOR_PROPS = new Set(["fill", "stroke"]);

const SELECTOR_RE = /^[#.][A-Za-z_][\w-]{0,63}$/;
const COLOR_RE = /^(\$[A-Za-z]\w{0,31}|#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|none)$/;
const REL_AT_RE = /^([+-])=(\d+(?:\.\d+)?)$/;

function _num(v, lo, hi) {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.min(hi, Math.max(lo, v));
}

function _at(v) {
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "<" || s === ">") return s;
    const m = REL_AT_RE.exec(s);
    return m ? `${m[1]}=${Math.min(MAX_AT, parseFloat(m[2]))}` : ">";
  }
  const n = _num(v, 0, MAX_AT);
  return n === null ? ">" : n;
}

function _props(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const range = TRANSFORM_PROPS[k] || ATTR_PROPS[k];
    if (range) {
      const n = _num(v, range[0], range[1]);
      if (n !== null) out[k] = n;
    } else if (COLOR_PROPS.has(k) && typeof v === "string" && COLOR_RE.test(v.trim())) {
      out[k] = v.trim();
    }
  }
  return out;
}

function _step(raw) {
  if (!raw || typeof raw !== "object") return null;
  const { op, target } = raw;
  if (!OPS.has(op) || typeof target !== "string" || !SELECTOR_RE.test(target)) return null;
  const step = { target, op, at: _at(raw.at ?? ">") };
  if (op !== "set") {
    step.dur = _num(raw.dur ?? 0.6, 0, MAX_DUR) ?? 0.6;
    step.ease = EASES.has(raw.ease) ? raw.ease : "power2.out";
  }
  const stagger = _num(raw.stagger ?? 0, 0, MAX_STAGGER);
  if (stagger) step.stagger = stagger;
  if (op === "from" || op === "to" || op === "set") {
    step.props = _props(raw.props);
    if (!Object.keys(step.props).length) return null;
  } else if (op === "draw") {
    const r = Array.isArray(raw.draw) && raw.draw.length === 2 ? raw.draw : [0, 100];
    step.draw = [_num(r[0], 0, 100) ?? 0, _num(r[1], 0, 100) ?? 100];
  } else if (op === "morph") {
    const to = raw.morph_to;
    if (typeof to !== "string" || !SELECTOR_RE.test(to) || to[0] !== "#") return null;
    step.morph_to = to;
  } else if (op === "follow") {
    const p = raw.path;
    if (typeof p !== "string" || !SELECTOR_RE.test(p) || p[0] !== "#") return null;
    step.path = p;
    step.auto_rotate = !!raw.auto_rotate;
  }
  return step;
}

/** Whitelist-normalize a timeline. Returns null when nothing survives. */
export function sanitizeTimeline(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.steps)) return null;
  const steps = raw.steps.slice(0, MAX_STEPS).map(_step).filter(Boolean);
  if (!steps.length) return null;
  let repeat = Number.isInteger(raw.repeat) ? raw.repeat : -1;
  repeat = repeat < 0 ? -1 : Math.min(repeat, MAX_REPEAT);
  return {
    repeat,
    repeat_delay: _num(raw.repeat_delay ?? 1, 0, MAX_REPEAT_DELAY) ?? 1,
    yoyo: !!raw.yoyo,
    steps,
  };
}

// querySelector scoped to this cell's <svg>. Selector strings already
// passed SELECTOR_RE, but CSS.escape guards ids with characters that are
// legal in the regex yet meaningful to the selector parser.
function _resolve(root, sel) {
  const q = (sel[0] === "#" ? "#" : ".") + CSS.escape(sel.slice(1));
  try { return Array.from(root.querySelectorAll(q)); } catch { return []; }
}

function _vars(props, resolveColor) {
  const vars = {};
  const attr = {};
  for (const [k, v] of Object.entries(props)) {
    if (k in TRANSFORM_PROPS) vars[k] = v;
    else if (k in ATTR_PROPS) attr[ATTR_NAMES[k] || k] = v;
    // Colors via the CSS path: GSAP's CSSPlugin interpolates colors and
    // reads the presentation attribute through getComputedStyle.
    else if (COLOR_PROPS.has(k)) vars[k] = resolveColor ? resolveColor(v) : v;
  }
  if (Object.keys(attr).length) vars.attr = attr;
  // Rotation / scale about the element's own center, not the SVG origin.
  if ("rotation" in vars || "scale" in vars || "scaleX" in vars || "scaleY" in vars) {
    vars.transformOrigin = "50% 50%";
  }
  return vars;
}

// GSAP + plugins arrive as classic-script globals (index.html).
const _w = () => /** @type {any} */ (typeof window !== "undefined" ? window : {});

let _pluginsRegistered = false;
function _gsap() {
  const g = _w().gsap || null;
  if (!g) return null;
  if (!_pluginsRegistered) {
    const plugins = [_w().DrawSVGPlugin, _w().MorphSVGPlugin, _w().MotionPathPlugin]
      .filter(Boolean);
    if (plugins.length) g.registerPlugin(...plugins);
    _pluginsRegistered = true;
  }
  return g;
}

function _prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch { return false; }
}

/**
 * Build and start a GSAP timeline on `svgRoot`. Returns a controller
 * { timeline, played, skipped, kill() } — kill() reverts every tweened
 * element to its rest frame and disconnects the visibility observer.
 * Returns null (rest frame stays as authored) when motion can't run.
 */
export function playTimeline(svgRoot, rawTimeline, opts = {}) {
  const tlSpec = sanitizeTimeline(rawTimeline);
  const gsap = _gsap();
  if (!tlSpec || !gsap || !svgRoot) return null;
  if (!opts.ignoreReducedMotion && _prefersReducedMotion()) return null;

  const tl = gsap.timeline({
    repeat: tlSpec.repeat,
    repeatDelay: tlSpec.repeat_delay,
    yoyo: tlSpec.yoyo,
    paused: true,
  });
  let played = 0;
  let skipped = 0;
  for (const step of tlSpec.steps) {
    const els = _resolve(svgRoot, step.target);
    if (!els.length) { skipped++; continue; }
    const timing = { duration: step.dur, ease: step.ease };
    if (step.stagger) timing.stagger = step.stagger;
    let ok = true;
    try {
      switch (step.op) {
        case "from":
          tl.from(els, { ...timing, ..._vars(step.props, opts.resolveColor) }, step.at);
          break;
        case "to":
          tl.to(els, { ...timing, ..._vars(step.props, opts.resolveColor) }, step.at);
          break;
        case "set":
          tl.set(els, _vars(step.props, opts.resolveColor), step.at);
          break;
        case "draw":
          if (!_w().DrawSVGPlugin) { ok = false; break; }
          tl.fromTo(els, { drawSVG: "0% 0%" },
            { ...timing, drawSVG: `${step.draw[0]}% ${step.draw[1]}%` }, step.at);
          break;
        case "morph": {
          const shape = _resolve(svgRoot, step.morph_to)[0];
          const paths = els.filter((e) => e.tagName.toLowerCase() === "path");
          if (!_w().MorphSVGPlugin || !shape || !paths.length) { ok = false; break; }
          tl.to(paths, { ...timing, morphSVG: shape }, step.at);
          break;
        }
        case "follow": {
          const path = _resolve(svgRoot, step.path)[0];
          if (!_w().MotionPathPlugin || !path) { ok = false; break; }
          tl.to(els, {
            ...timing,
            motionPath: { path, align: path, alignOrigin: [0.5, 0.5], autoRotate: step.auto_rotate },
          }, step.at);
          break;
        }
      }
    } catch {
      ok = false;  // a bad tween must not take down the cell
    }
    if (ok) played++; else skipped++;
  }
  if (!played) { tl.kill(); return null; }

  // Pause while the cell is off-screen. lazyMount keeps cells mounted
  // within 1500px of the viewport; there's no reason to tick those.
  let io = null;
  if (typeof IntersectionObserver !== "undefined" && !opts.alwaysPlay) {
    io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) tl.play(); else tl.pause();
      }
    });
    io.observe(svgRoot);
  } else {
    tl.play();
  }
  svgRoot.dataset.motion = `${played}/${played + skipped}`;
  return {
    timeline: tl,
    played,
    skipped,
    kill() {
      if (io) io.disconnect();
      // revert() kills and strips GSAP's inline styles / attrs, leaving
      // the rest frame as authored.
      try { tl.revert(); } catch { tl.kill(); }
    },
  };
}
