// Mars-blue / Rocinante (and shared with Mars-red / Tachi) theme module —
// MCRN bridge-console BEZEL + live mint-activity histogram. Extracted from
// lucida.mjs as part of task #70 (per-theme module split). The drift
// extraction (theme-drift.mjs) established the pattern; this is slice #2.
//
// Public exports:
//   _buildFurnitureMarsBlue(el)  — populates #theme-furniture
//   _updateMarsBlueHisto()       — binds histogram + dials + lamps to live state

// Active theme name. lucida.mjs sets window.__LUCIDA_THEME from the bootstrap
// script; we read it inside each function so the module doesn't fail on
// import in non-browser environments (Node sanity checks).
function _active() { return (typeof window !== "undefined" && window.__LUCIDA_THEME) || "lab"; }

export function _buildFurnitureMarsBlue(el) {
  const ACTIVE = _active();
  // Gate SMIL stanzas on prefers-reduced-motion (paired with the CSS
  // @media gate further down for the histogram + needle animations).
  const reduce = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // MCRN bridge-console BEZEL.  Layout reorganized 2026-06-09 to match
  // refs/rocinante/roci_warship_tactical_screen bottom-band density:
  //   TOP    — row of "PDC ammo" filled-meter circles across the top center,
  //            small cryptic labels in the TL/TR corners.
  //   BOTTOM — compact mint-rate histogram in the LL corner (was full-width),
  //            row of partial-circle cockpit gauges with coord labels across
  //            the bottom center, mirror dense block in the BR corner.
  //   Above each histogram: small blue-bordered red-filled "PIP" rectangles
  //   (the show's THREAT chip motif).
  //   Brackets and bearing-scales kept.
  let bars = "";
  const N = 28;  // narrower band — fewer bars since width is much smaller now
  for (let i = 0; i < N; i++) {
    const dur = (1.5 + (i % 5) * 0.4).toFixed(2);
    const delay = (((i * 3) % 11) * 0.13).toFixed(2);
    bars += '<i style="--h:0.1;--dur:' + dur + 's;--delay:' + delay + 's"></i>';
  }
  // PDC ammo circles — 12 across the top center in ONE row.  User
  // 2026-06-09: 2×8 was overlapping the hero cell's titlebar; "maybe
  // we could do one row of 12 or something."
  // Levels slowly cycle ±0.07 around a deterministic base so the gauges
  // feel like rounds chambering/expending in idle rotation.  SMIL <animate>
  // on the path `d` interpolates between two arc paths — both kept on the
  // same large-arc side of 0.5 so the SVG arc-flag stays consistent.
  function pdcPathAt(lvl) {
    if (lvl < 0.005) return "";
    const ang = -90 + lvl * 360;
    const a = (ang * Math.PI) / 180;
    const x = 8 + 6 * Math.cos(a);
    const y = 8 + 6 * Math.sin(a);
    const large = lvl > 0.5 ? 1 : 0;
    return "M 8 2 A 6 6 0 " + large + " 1 " + x.toFixed(2) + " " + y.toFixed(2) + " L 8 8 Z";
  }
  let pdc = "";
  const PDC_N = 12;
  for (let i = 0; i < PDC_N; i++) {
    let lvl = ((i * 37 + 11) % 100) / 100;
    // Push levels off the 0.5 large-arc boundary so a small swing stays
    // on one side — interpolating across the flag mid-loop breaks the
    // SVG path animation.
    if (lvl > 0.42 && lvl < 0.5) lvl = 0.42;
    else if (lvl > 0.5 && lvl < 0.58) lvl = 0.58;
    const swing = 0.07;
    const lo = Math.max(0.05, lvl - swing);
    const hi = Math.min(0.95, lvl + swing);
    const pathLo = pdcPathAt(lo);
    const pathMid = pdcPathAt(lvl);
    const pathHi = pdcPathAt(hi);
    const dur = 20 + ((i * 5) % 16);  // 20-35s per cell, staggered
    const off = -((i * 3) % dur);
    let fillElem;
    if (!pathMid) {
      fillElem = "";
    } else if (reduce) {
      fillElem = '<path d="' + pathMid + '" fill="#4c8dc6" fill-opacity="0.88"/>';
    } else {
      fillElem = '<path d="' + pathMid + '" fill="#4c8dc6" fill-opacity="0.88">'
        + '<animate attributeName="d" values="' + pathLo + ";" + pathHi + ";" + pathLo
        +   '" dur="' + dur + 's" begin="' + off + 's" repeatCount="indefinite"/>'
        + '</path>';
    }
    // mars-red gets a squared-off PDC indicator (rect outline with the
    // same pie-slice fill inside) to match the tachi-era angular chassis.
    // mars-blue keeps the round bezel.
    const pdcOutline = ACTIVE === "mars-red"
      ? `<rect x="2" y="2" width="12" height="12" fill="none" stroke="#d8362a" stroke-opacity="0.9" stroke-width="0.9"/>`
      : `<circle cx="8" cy="8" r="6" fill="none" stroke="#4c8dc6" stroke-opacity="0.88" stroke-width="0.9"/>`;
    const pdcFillColor = ACTIVE === "mars-red" ? "#d8362a" : "#4c8dc6";
    const fillElemColored = fillElem.replace(/#4c8dc6/g, pdcFillColor);
    pdc += '<span class="fur-pdc-cell"><svg viewBox="0 0 16 16">'
        +   pdcOutline
        +   fillElemColored
        + '</svg></span>';
  }
  // Theme-aware palette for the gauges.  mars-red (early-Syfy tachi era)
  // = saturated red + steel-cyan + harder square bezels per user 2026-06-09
  // ("the gauges look weird on mars red — not squared off enough — and
  // obviously the wrong colors").  mars-blue (late-Amazon era) keeps the
  // round chrome + cobalt-on-cobalt-white palette.
  const RED = ACTIVE === "mars-red";
  const P = RED ? {
    fg:     "#d8362a",                // dominant stroke (was #4c8dc6 cobalt)
    fgDim:  "rgba(216, 54, 42, 0.45)", // dim variant for inner rings
    sec:    "#4a9ec0",                // secondary = steel-cyan
    accent: "#ffc233",                // accent / red-zone (RPM hot zone)
    face:   "rgba(38, 22, 22, 0.85)", // dark red-tinted face fill
    glow:   "#c8d8e8",                // bright spot (plasma core, etc.)
    star:   "#c8d8e8",                // star color for inertial gauge
    bezel:  "rect",                   // squared-off industrial chassis
  } : {
    fg:     "#4c8dc6",
    fgDim:  "rgba(76, 141, 198, 0.45)",
    sec:    "#92aee3",
    accent: "#a11a4b",
    face:   "#02103a",
    glow:   "#92aee3",
    star:   "#92aee3",
    bezel:  "round",
  };
  // Bezel helper — round (circle) or square (rect with sharp corners).
  // The inner gauge content stays circular either way (it's a gauge), so
  // the square option reads as a tachi-era chassis around a round face.
  function bezel() {
    if (P.bezel === "rect") {
      return `<rect x="2" y="2" width="44" height="44" fill="none" stroke="${P.fg}" stroke-opacity="0.9" stroke-width="2.0"/><rect x="4" y="4" width="40" height="40" fill="none" stroke="${P.fg}" stroke-opacity="0.45" stroke-width="0.6"/><rect x="5" y="5" width="38" height="38" fill="${P.face}"/>`;
    }
    return `<circle cx="24" cy="24" r="22.5" fill="none" stroke="${P.fg}" stroke-opacity="0.85" stroke-width="2.0"/><circle cx="24" cy="24" r="20.5" fill="none" stroke="${P.fg}" stroke-opacity="0.5" stroke-width="0.6"/><circle cx="24" cy="24" r="19.5" fill="${P.face}"/>`;
  }
  // Cockpit gauges — 5 DISTINCT types across the bottom center (per user
  // 2026-06-09: "the dials all look like watch faces, give me more
  // variety. there's more variety in the ref image").  Each fits viewBox
  // 0 0 48 48 with center (24, 24).  Template literals throughout — the
  // earlier `+` line-continuation pattern was eating <g> wrappers as
  // `'<g>' + + '<animateTransform.../>'`  → `'<g>NaN<animateTransform.../>'`,
  // and the orphaned <animateTransform> then targeted the <svg> element
  // itself (so the whole dial spun rather than just the hand).
  function gaugeWatch(i) {
    const needleAng = -150 + ((i * 41) % 300);
    const ang = (needleAng - 90) * Math.PI / 180;
    const nx = (24 + 16 * Math.cos(ang)).toFixed(2);
    const ny = (24 + 16 * Math.sin(ang)).toFixed(2);
    const cwx = (24 - 4 * Math.cos(ang)).toFixed(2);
    const cwy = (24 - 4 * Math.sin(ang)).toFixed(2);
    const hourAng = -90 + ((i * 91) % 360);
    const ha = (hourAng - 90) * Math.PI / 180;
    const hx = (24 + 10 * Math.cos(ha)).toFixed(2);
    const hy = (24 + 10 * Math.sin(ha)).toFixed(2);
    const subAng = ((i * 71) % 360);
    const sa = (subAng - 90) * Math.PI / 180;
    const sx = (24 + 4 * Math.cos(sa)).toFixed(2);
    const sy = (33 + 4 * Math.sin(sa)).toFixed(2);
    const subDur = 45 + ((i * 7) % 30);
    const minSwingDur = 14 + ((i * 7) % 9);
    const hourSwingDur = 24 + ((i * 11) % 16);
    let ticks = "";
    for (let t = 0; t < 12; t++) {
      const tAng = (t * 30 - 90) * Math.PI / 180;
      const r1 = 19, r2 = (t % 3 === 0) ? 16.5 : 17.5;
      const x1 = (24 + r1 * Math.cos(tAng)).toFixed(2);
      const y1 = (24 + r1 * Math.sin(tAng)).toFixed(2);
      const x2 = (24 + r2 * Math.cos(tAng)).toFixed(2);
      const y2 = (24 + r2 * Math.sin(tAng)).toFixed(2);
      const sw = (t % 3 === 0) ? 0.9 : 0.5;
      ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${P.fg}" stroke-opacity="0.7" stroke-width="${sw}"/>`;
    }
    const subHand = reduce
      ? `<line x1="24" y1="33" x2="${sx}" y2="${sy}" stroke="${P.fg}" stroke-opacity="0.78" stroke-width="0.6"/>`
      : `<g transform="rotate(${subAng} 24 33)"><animateTransform attributeName="transform" type="rotate" values="${subAng} 24 33; ${subAng + 360} 24 33" dur="${subDur}s" repeatCount="indefinite"/><line x1="24" y1="33" x2="24" y2="29" stroke="${P.fg}" stroke-opacity="0.78" stroke-width="0.6"/></g>`;
    const hourSway = reduce ? "" : `<animateTransform attributeName="transform" type="rotate" values="0 24 24; 11 24 24; -7 24 24; 0 24 24" dur="${hourSwingDur}s" repeatCount="indefinite"/>`;
    const minSway = reduce ? "" : `<animateTransform attributeName="transform" type="rotate" values="0 24 24; 22 24 24; -14 24 24; 0 24 24" dur="${minSwingDur}s" repeatCount="indefinite"/>`;
    return `${bezel()}<circle cx="24" cy="24" r="16.5" fill="none" stroke="${P.fg}" stroke-opacity="0.35" stroke-width="0.4"/><circle cx="24" cy="24" r="13.5" fill="none" stroke="${P.fg}" stroke-opacity="0.3" stroke-width="0.4"/><circle cx="24" cy="24" r="10.5" fill="none" stroke="${P.fg}" stroke-opacity="0.28" stroke-width="0.4"/><circle cx="24" cy="24" r="7.5" fill="none" stroke="${P.fg}" stroke-opacity="0.24" stroke-width="0.4"/>${ticks}<circle cx="24" cy="33" r="4.2" fill="none" stroke="${P.fg}" stroke-opacity="0.55" stroke-width="0.5"/>${subHand}<circle cx="24" cy="33" r="0.6" fill="${P.fg}" fill-opacity="0.92"/><line x1="24" y1="24" x2="${hx}" y2="${hy}" stroke="${P.fg}" stroke-opacity="0.88" stroke-width="1.4">${hourSway}</line><path d="M 24 24 L ${nx} ${ny} M 24 24 L ${cwx} ${cwy}" stroke="${P.fg}" stroke-opacity="0.9" stroke-width="0.9" fill="none">${minSway}</path><circle cx="24" cy="24" r="1.7" fill="${P.fg}" fill-opacity="0.92"/><circle cx="24" cy="24" r="0.6" fill="${P.face}"/>`;
  }
  // Fusion reactor containment cross-section — toroidal magnetic-field
  // lines around a pulsing plasma core.  Replaces the old compass gauge
  // (Earth heading vectors don't exist in vacuum, and the bg-radar
  // already carries a heading arc at the bottom-center of the tactical
  // display so a second one would be redundant).
  function gaugeReactor(i) {
    const dur = 3.8 + ((i * 0.7) % 2);  // 3.8-5.8s pulse
    const pulse = reduce ? "" : `<animate attributeName="r" values="1.8; 3.0; 1.8" dur="${dur}s" repeatCount="indefinite"/>`;
    const pulseO = reduce ? "" : `<animate attributeName="fill-opacity" values="0.7; 1; 0.7" dur="${dur}s" repeatCount="indefinite"/>`;
    const haloPulse = reduce ? "" : `<animate attributeName="stroke-opacity" values="0.3; 0.65; 0.3" dur="${dur}s" repeatCount="indefinite"/>`;
    return `${bezel()}<ellipse cx="24" cy="24" rx="16" ry="9" fill="none" stroke="${P.fg}" stroke-opacity="0.42" stroke-width="0.5"/><ellipse cx="24" cy="24" rx="12" ry="6.5" fill="none" stroke="${P.fg}" stroke-opacity="0.55" stroke-width="0.5"/><ellipse cx="24" cy="24" rx="8" ry="4.5" fill="none" stroke="${P.fg}" stroke-opacity="0.72" stroke-width="0.55"/><path d="M 8 14 A 16 9 0 0 1 40 14" fill="none" stroke="${P.fg}" stroke-opacity="0.32" stroke-width="0.4" stroke-dasharray="2 2"/><path d="M 8 34 A 16 9 0 0 0 40 34" fill="none" stroke="${P.fg}" stroke-opacity="0.32" stroke-width="0.4" stroke-dasharray="2 2"/><line x1="8" y1="14" x2="8" y2="34" stroke="${P.fg}" stroke-opacity="0.30" stroke-width="0.4" stroke-dasharray="1 2"/><line x1="40" y1="14" x2="40" y2="34" stroke="${P.fg}" stroke-opacity="0.30" stroke-width="0.4" stroke-dasharray="1 2"/><circle cx="24" cy="24" r="3.6" fill="none" stroke="${P.glow}" stroke-opacity="0.35" stroke-width="0.4">${haloPulse}</circle><circle cx="24" cy="24" r="2" fill="${P.glow}" fill-opacity="0.88">${pulse}${pulseO}</circle><text x="24" y="44" text-anchor="middle" font-family="Space Mono,monospace" font-size="2.4" fill="${P.fg}" fill-opacity="0.6">FUS</text>`;
  }
  function gaugeRpm(i) {
    const dur = 9 + ((i * 3) % 6);
    const baseAng = 30 + (i % 3) * 25;
    const sway = reduce ? "" : `<animateTransform attributeName="transform" type="rotate" values="${baseAng} 24 24; ${baseAng + 22} 24 24; ${baseAng - 6} 24 24; ${baseAng + 10} 24 24; ${baseAng} 24 24" dur="${dur}s" repeatCount="indefinite"/>`;
    let ticks = "";
    for (let t = 0; t <= 10; t++) {
      const a = (-120 + t * 24) * Math.PI / 180;
      const r1 = 19, r2 = (t % 2 === 0) ? 15.5 : 17;
      const x1 = (24 + r1 * Math.cos(a)).toFixed(2);
      const y1 = (24 + r1 * Math.sin(a)).toFixed(2);
      const x2 = (24 + r2 * Math.cos(a)).toFixed(2);
      const y2 = (24 + r2 * Math.sin(a)).toFixed(2);
      const sw = (t % 2 === 0) ? 0.9 : 0.5;
      ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${P.fg}" stroke-opacity="0.72" stroke-width="${sw}"/>`;
    }
    return `${bezel()}${ticks}<path d="M 36 11 A 16 16 0 0 1 38 31" stroke="${P.accent}" stroke-opacity="0.78" stroke-width="2.2" fill="none"/><text x="9" y="40" font-family="Space Mono,monospace" font-size="2.6" fill="${P.fg}" fill-opacity="0.55">0</text><text x="32" y="40" font-family="Space Mono,monospace" font-size="2.6" fill="${P.accent}" fill-opacity="0.75">RED</text><line x1="24" y1="24" x2="24" y2="8" stroke="${P.fg}" stroke-opacity="0.95" stroke-width="1.1" transform="rotate(${baseAng} 24 24)">${sway}</line><circle cx="24" cy="24" r="1.7" fill="${P.fg}" fill-opacity="0.92"/>`;
  }
  // Inertial reference / star-tracker — the aircraft artificial horizon
  // doesn't translate to vacuum (no sky/ground), so replace with a
  // spacecraft-appropriate analog: stars on a black face, plus a
  // rotating reference frame (heading axes + pitch ladder) that drifts
  // around a fixed spacecraft marker.  Same tilt-motion vocabulary,
  // different (and accurate) referent.
  function gaugeInertial(i) {
    const dur = 14 + ((i * 4) % 8);
    const tilt = reduce ? "" : `<animateTransform attributeName="transform" type="rotate" values="0 24 24; 11 24 24; -8 24 24; 5 24 24; 0 24 24" dur="${dur}s" repeatCount="indefinite"/>`;
    const clipId = `mb-inertial-${i}`;
    // Fixed star positions — chosen by eye to spread across the face
    // without clustering near the spacecraft marker at (24, 24).
    const STAR_POS = [
      [13, 10], [18, 7], [27, 9], [33, 12], [38, 17], [40, 26],
      [36, 33], [29, 38], [18, 39], [10, 33], [7, 25], [9, 17],
      [16, 13], [32, 16], [34, 30], [16, 31],
    ];
    let stars = "";
    for (const [sx, sy] of STAR_POS) {
      stars += `<circle cx="${sx}" cy="${sy}" r="0.4" fill="${P.star}" fill-opacity="0.78"/>`;
    }
    // Clip path matches bezel shape so stars don't bleed past the chassis edge.
    const clipShape = P.bezel === "rect"
      ? `<rect x="5" y="5" width="38" height="38"/>`
      : `<circle cx="24" cy="24" r="20.5"/>`;
    return `<defs><clipPath id="${clipId}">${clipShape}</clipPath></defs>${bezel()}<g clip-path="url(#${clipId})">${stars}</g><g clip-path="url(#${clipId})" transform="rotate(0 24 24)">${tilt}<line x1="-4" y1="24" x2="52" y2="24" stroke="${P.fg}" stroke-opacity="0.78" stroke-width="0.6" stroke-dasharray="5 1.5"/><line x1="24" y1="-4" x2="24" y2="52" stroke="${P.fg}" stroke-opacity="0.36" stroke-width="0.35" stroke-dasharray="3 2"/><line x1="17" y1="17" x2="31" y2="17" stroke="${P.fg}" stroke-opacity="0.45" stroke-width="0.3"/><line x1="14" y1="20" x2="34" y2="20" stroke="${P.fg}" stroke-opacity="0.45" stroke-width="0.3"/><line x1="17" y1="31" x2="31" y2="31" stroke="${P.fg}" stroke-opacity="0.45" stroke-width="0.3"/><line x1="14" y1="28" x2="34" y2="28" stroke="${P.fg}" stroke-opacity="0.45" stroke-width="0.3"/></g><circle cx="24" cy="24" r="3.5" fill="none" stroke="${P.fg}" stroke-opacity="0.88" stroke-width="0.55"/><line x1="20" y1="24" x2="28" y2="24" stroke="${P.fg}" stroke-opacity="0.88" stroke-width="0.55"/><line x1="24" y1="20" x2="24" y2="28" stroke="${P.fg}" stroke-opacity="0.88" stroke-width="0.55"/><circle cx="24" cy="24" r="0.7" fill="${P.fg}"/>`;
  }
  function gaugeVscale(i) {
    const dur = 22 + ((i * 4) % 12);
    const baseY = 17 + (i % 3) * 5;
    const slide = reduce ? "" : `<animateTransform attributeName="transform" type="translate" values="0 0; 0 -6; 0 5; 0 -2; 0 0" dur="${dur}s" repeatCount="indefinite"/>`;
    let ticks = "";
    for (let t = 0; t <= 10; t++) {
      const y = (6 + t * 3.6).toFixed(2);
      const r = (t % 2 === 0) ? 4 : 2;
      ticks += `<line x1="15" y1="${y}" x2="${15 + r}" y2="${y}" stroke="${P.fg}" stroke-opacity="0.6" stroke-width="0.4"/>`;
    }
    const labelVal = (35 + i * 7);
    return `${bezel()}<line x1="15" y1="6" x2="15" y2="42" stroke="${P.fg}" stroke-opacity="0.78" stroke-width="0.6"/>${ticks}<rect x="16" y="9" width="14" height="30" fill="${P.fgDim}" fill-opacity="0.18"/><text x="34" y="9" font-family="Space Mono,monospace" font-size="2.4" fill="${P.fg}" fill-opacity="0.55">H</text><text x="34" y="42" font-family="Space Mono,monospace" font-size="2.4" fill="${P.fg}" fill-opacity="0.55">L</text><g transform="translate(0 0)">${slide}<polygon points="20,${baseY} 24,${baseY - 2.5} 24,${baseY + 2.5}" fill="${P.fg}" fill-opacity="0.95"/><text x="27" y="${(baseY + 1).toFixed(2)}" font-family="Space Mono,monospace" font-size="3" fill="${P.fg}" fill-opacity="0.88">${labelVal}</text></g>`;
  }
  // 5 distinct gauges across the bottom center — pilot watch, reactor
  // containment, inertial reference, RPM dial, vertical scale.  All
  // referents space-appropriate (no compass / no sky-vs-ground horizon).
  const GAUGE_TYPES = ["watch", "reactor", "inertial", "rpm", "vscale"];
  const DIAL_LABELS = ["(0,0)", "(88,2)", "(224)", "(54,2)", "(20,2)"];
  let dials = "";
  for (let i = 0; i < GAUGE_TYPES.length; i++) {
    const type = GAUGE_TYPES[i];
    let svgInner;
    if (type === "watch")         svgInner = gaugeWatch(i);
    else if (type === "reactor")  svgInner = gaugeReactor(i);
    else if (type === "inertial") svgInner = gaugeInertial(i);
    else if (type === "rpm")      svgInner = gaugeRpm(i);
    else                           svgInner = gaugeVscale(i);
    dials += `<span class="fur-cdial"><span class="fur-cdial-lbl">${DIAL_LABELS[i]}</span><svg viewBox="0 0 48 48">${svgInner}</svg></span>`;
  }
  // Pip rectangles — small blue-bordered red-filled boxes above the
  // histograms (and a couple decorative ones around the dial block).
  // The "THREAT" chip from the show.
  // data-pip drives the per-pip data-state wiring in _updateMarsBlueHisto:
  //   THREAT → "alert" when any cell-danger, else "armed"
  //   SCAN   → "active" when there's recent mint activity, else "idle"
  //   LOK    → "locked" steady-glow when clean+active, else "idle"
  //   PDC/AUX → "armed" (steady; dialed-in placeholder for future data wiring).
  const pips = '<span class="fur-pip" data-pip="THREAT">THREAT</span>'
             + '<span class="fur-pip" data-pip="SCAN">SCAN</span>'
             + '<span class="fur-pip" data-pip="LOK">LOK</span>';
  const pipsR = '<span class="fur-pip" data-pip="PDC">PDC</span>'
              + '<span class="fur-pip" data-pip="AUX">AUX</span>';
  // mars-red reuses this furniture (same MCRN bezel); ACTIVE picks the registry.
  const REG = ACTIVE === "mars-red" ? "MARS NAVY · CV-T15" : "MARS NAVY · CTV-K1W-XR";
  el.innerHTML =
    '<div class="fur-glass" aria-hidden="true"></div>' +
    '<div class="fur-bracket fur-tl"></div>' +
    '<div class="fur-bracket fur-tr"></div>' +
    '<div class="fur-bracket fur-bl"></div>' +
    '<div class="fur-bracket fur-br"></div>' +
    '<div class="fur-scale fur-scale-l"></div>' +
    '<div class="fur-scale fur-scale-r"></div>' +
    // Top: PDC ammo circle 2×8 grid + thick red separator below + corner cryptic labels.
    '<div class="fur-top-pdc">' + pdc + '</div>' +
    '<div class="fur-top-sep" aria-hidden="true"></div>' +
    '<div class="fur-top-tl"><div>UN.7 · CTV-K1W</div><div>ENG · OK</div><div>RCS · NOM</div><div>EPS · 0.91</div></div>' +
    '<div class="fur-top-tr"><div>NAV · NOM</div><div>PDC.1-4 · ARM</div><div>RAIL · STBY</div><div>TBC · 03:42</div></div>' +
    // Bottom-left: compact histogram + pips above.
    '<div class="fur-pips fur-pips-bl">' + pips + '</div>' +
    '<div class="fur-histo" title="Mint-activity readout — each bar is a time slice of the session; bar height = cells minted in that slice.">' +
      '<div class="fur-histo-label">' + REG + '<br>TRAFFIC · STANDBY</div>' +
      '<div class="fur-bars">' + bars + '</div>' +
      '<div class="fur-triad" title="System-color triad — red (errors/danger), amber (warnings), green (ok). Live from session state.">' +
        '<span class="fur-lamp fur-lamp-r" data-on="0"></span>' +
        '<span class="fur-lamp fur-lamp-a" data-on="0"></span>' +
        '<span class="fur-lamp fur-lamp-g" data-on="1"></span>' +
      '</div>' +
    '</div>' +
    // Bottom-middle: row of cockpit dials with coord labels.
    '<div class="fur-bottom-dials">' + dials + '</div>' +
    // Bottom-right: mirror block + pips above.
    '<div class="fur-pips fur-pips-br">' + pipsR + '</div>' +
    '<div class="fur-bottom-right">' +
      '<div class="fur-br-dials"><span class="fur-dial"></span><span class="fur-dial fur-dial-sm"></span></div>' +
      '<div class="fur-br-label">PDC · AMMO 1842<br>RAIL · CHARGE 0.91</div>' +
    '</div>';
  _buildMarsBlueBgRadar();
}

// Background tactical radar — fixed, behind cells, vocabulary lifted from
// roci_warship_tactical_screen + roci_combat_missilelock_dense.  Mix of
// equilateral-triangle outlines (4), angle-bracket-with-dot truncated
// arrows (3), red-dot-with-blue-outline threat contacts (3); bold blue
// inner rings + dotted-red outer fan; center radial glow; ship's-compass
// heading arc with degree labels; short bridge-curves between concentric
// rings.  Lives in #mb-bgradar (body-level fixed element, z=0 — behind
// cells z=1+, above bg color).  Built once on theme activation; future
// motion lands as SMIL <animateMotion> per stalker (task #76).
function _buildMarsBlueBgRadar() {
  let host = document.getElementById("mb-bgradar");
  if (!host) {
    host = document.createElement("div");
    host.id = "mb-bgradar";
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);
  }
  // Idempotent: applyActiveLayout fires _buildFurnitureMarsBlue multiple
  // times per theme switch (0ms / 600ms / 2000ms passes), and each
  // re-parse of the 80-element SVG was repromoting the compositor layer
  // — measurable as a tab OOM on top of an already-busy session
  // (reproduced 2026-06-09).  Build once, reuse.
  if (host.dataset.built === "1") return;
  host.dataset.built = "1";

  // Reduced-motion gate — emits empty animation stanzas when the user
  // prefers reduced motion, so the radar stays photo-static.
  const reduce = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Closed ellipses in 4 orientations so adjacent stalkers don't trace
  // identical paths.  12x6 viewBox units = ~2.5% of radar width — visible
  // drift on a 1500px viewport (~30px envelope).  Initial pass used a
  // 6x3 envelope which moved only ~0.2 px/sec — labels jittered from
  // sub-pixel font snap but the glyphs themselves read as static.
  const LOOPS = [
    "M 0 0 a 6 3 0 1 0 12 0 a 6 3 0 1 0 -12 0",
    "M 0 0 a 3 6 0 1 0 0 12 a 3 6 0 1 0 0 -12",
    "M 0 0 a 6 3 45 1 0 8.49 8.49 a 6 3 45 1 0 -8.49 -8.49",
    "M 0 0 a 6 3 -45 1 0 8.49 -8.49 a 6 3 -45 1 0 -8.49 8.49",
  ];
  function motion(i, dur) {
    if (reduce) return "";
    const off = -((i * 7) % dur);
    return '<animateMotion path="' + LOOPS[i % 4] +
      '" dur="' + dur + 's" rotate="0" begin="' + off + 's" repeatCount="indefinite"/>';
  }
  // Bridge-curve helper: dashed bezier between concentric rings, with the
  // dashes drifting INWARD (from path end back toward path start = toward
  // the radar center, since each path is authored end→inner).  Animation
  // omitted on reduced-motion.
  function bridge(d, dur) {
    return '<path d="' + d + '">' +
      (reduce ? "" :
        '<animate attributeName="stroke-dashoffset" from="0" to="9" ' +
          'dur="' + dur + 's" repeatCount="indefinite"/>') +
    '</path>';
  }
  const SB = 'stroke="#4c8dc6" stroke-opacity="0.72" stroke-width="0.7"';
  const SR = 'stroke="#a11a4b" stroke-opacity="0.78" stroke-width="0.7"';
  const TB = 'fill="#4c8dc6" fill-opacity="0.6" font-family="\'Space Mono\', monospace" font-size="3.0"';
  const TR = 'fill="#a11a4b" fill-opacity="0.65" font-family="\'Space Mono\', monospace" font-size="3.0"';

  // Each stalker is its own <g> so <animateMotion> translates the whole
  // group (glyph + dot if any + label) as one unit.  Coords stay
  // absolute — the path "M 0 0 ..." applies as a relative translation
  // around the group's intrinsic position.
  let stalkers = "";
  // 2 blue + 2 red equilateral triangles (M1, M2, T1, T2).
  stalkers +=
    '<g>' + motion(0, 75) +
      '<polygon points="200,191 196,198 204,198" fill="none" ' + SB + '/>' +
      '<text x="206" y="200" ' + TB + '>M1</text>' +
    '</g>' +
    '<g>' + motion(1, 85) +
      '<polygon points="290,136 286,143 294,143" fill="none" ' + SB + '/>' +
      '<text x="296" y="145" ' + TB + '>M2</text>' +
    '</g>' +
    '<g>' + motion(2, 55) +
      '<polygon points="175,114 171,121 179,121" fill="none" ' + SR + '/>' +
      '<text x="181" y="123" ' + TR + '>T1</text>' +
    '</g>' +
    '<g>' + motion(3, 70) +
      '<polygon points="315,161 311,168 319,168" fill="none" ' + SR + '/>' +
      '<text x="321" y="170" ' + TR + '>T2</text>' +
    '</g>';
  // 2 blue + 1 red caret-with-dot (M5, M6, T3).  Dot in the caret mouth.
  stalkers +=
    '<g>' + motion(4, 60) +
      '<path d="M 260 168 L 252 174 L 260 180" fill="none" ' + SB + '/>' +
      '<circle cx="257" cy="174" r="1.5" fill="#4c8dc6" fill-opacity="0.78"/>' +
      '<text x="262" y="176" ' + TB + '>M5</text>' +
    '</g>' +
    '<g>' + motion(5, 80) +
      '<path d="M 220 200 L 226 192 L 232 200" fill="none" ' + SB + '/>' +
      '<circle cx="226" cy="198" r="1.5" fill="#4c8dc6" fill-opacity="0.78"/>' +
      '<text x="232" y="200" ' + TB + '>M6</text>' +
    '</g>' +
    '<g>' + motion(6, 65) +
      '<path d="M 340 128 L 346 122 L 352 128" fill="none" ' + SR + '/>' +
      '<circle cx="346" cy="127" r="1.5" fill="#a11a4b" fill-opacity="0.88"/>' +
      '<text x="354" y="128" ' + TR + '>T3</text>' +
    '</g>';
  // 10 red-dot-with-blue-outline contacts (H1..HA).  Outer r=2.8, inner r=1.4.
  const CT = [
    [225, 118, 230, 120, "H1", 55],
    [295, 125, 300, 127, "H2", 90],
    [182, 130, 187, 132, "H3", 70],
    [330, 110, 335, 112, "H4", 95],
    [168, 160, 173, 162, "H5", 50],
    [245, 130, 250, 132, "H6", 80],
    [160, 180, 165, 182, "H7", 60],
    [300, 200, 305, 202, "H8", 88],
    [338, 145, 343, 147, "H9", 95],
    [140, 170, 145, 172, "HA", 55],
  ];
  for (let k = 0; k < CT.length; k++) {
    const c = CT[k];
    stalkers +=
      '<g>' + motion(7 + k, c[5]) +
        '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="2.8" fill="none" stroke="#4c8dc6" stroke-opacity="0.78" stroke-width="0.6"/>' +
        '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="1.4" fill="#a11a4b" fill-opacity="0.92"/>' +
        '<text x="' + c[2] + '" y="' + c[3] + '" ' + TR + '>' + c[4] + '</text>' +
      '</g>';
  }

  // viewBox 480x360 (extra-wide + extra headroom up top so the larger
  // perimeter rings can render).  Radar centered at (240, 240) — bottom-
  // center of viewBox, which lands on viewport bottom thanks to CSS
  // bottom:0 + translateX(-50%) on #mb-bgradar.  Concentric semicircles
  // rise above the horizon.  Eight rings total: 1 inner faint, 1 BRIGHT
  // middle ring (~80vw diameter), 1 dashed blue intermediate, then 5 red
  // perimeter rings progressively further out (alert/long-range cordon),
  // the outermost ~280vw diameter — barely visible flat arcs near the top
  // of the viewport (the "long-range horizon").
  let svgStr =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -120 480 360">' +
      // Center halo — one arc (was radial gradient — OOM'd 2026-06-09).
      '<path d="M 195 240 A 45 45 0 0 1 285 240" fill="none" ' +
        'stroke="#4c8dc6" stroke-opacity="0.36" stroke-width="0.8"/>' +
      // (Spokes dropped — they were barely visible at 0.10 opacity.)
      // Ring radii × 1.5 (was 40/80/120/150/180/205/225/240 in commit
      // f44e32b; user 2026-06-09 "radius of curvature 50% more"):
      // Ring 1: inner small thin solid blue.
      '<path d="M 180 240 A 60 60 0 0 1 300 240" fill="none" ' +
        'stroke="#4c8dc6" stroke-opacity="0.32" stroke-width="0.5"/>' +
      // Ring 2: BRIGHTEST middle, solid blue — "central" ring.
      '<path d="M 120 240 A 120 120 0 0 1 360 240" fill="none" ' +
        'stroke="#4c8dc6" stroke-opacity="0.50" stroke-width="0.95"/>' +
      // Ring 3: intermediate blue, DASHED.
      '<path d="M 60 240 A 180 180 0 0 1 420 240" fill="none" ' +
        'stroke="#4c8dc6" stroke-opacity="0.34" stroke-width="0.65" stroke-dasharray="4 3"/>' +
      // Ring 4: medium-far blue DASHED.
      '<path d="M 15 240 A 225 225 0 0 1 465 240" fill="none" ' +
        'stroke="#4c8dc6" stroke-opacity="0.28" stroke-width="0.55" stroke-dasharray="4 3"/>' +
      // Ring 5: red dashed — first alert perimeter.
      '<path d="M -30 240 A 270 270 0 0 1 510 240" fill="none" ' +
        'stroke="#a11a4b" stroke-opacity="0.40" stroke-width="0.45" stroke-dasharray="3 3"/>' +
      // Ring 6: red dotted, further out.
      '<path d="M -67 240 A 307 307 0 0 1 547 240" fill="none" ' +
        'stroke="#a11a4b" stroke-opacity="0.34" stroke-width="0.4"  stroke-dasharray="2 4"/>' +
      // Ring 7: red dotted.
      '<path d="M -97 240 A 337 337 0 0 1 577 240" fill="none" ' +
        'stroke="#a11a4b" stroke-opacity="0.28" stroke-width="0.4"  stroke-dasharray="2 4"/>' +
      // Ring 8: outermost red dotted (top at viewBox y=-120, exactly at
      // the visible-area top edge on a 100vh-capped container).
      '<path d="M -120 240 A 360 360 0 0 1 600 240" fill="none" ' +
        'stroke="#a11a4b" stroke-opacity="0.22" stroke-width="0.4"  stroke-dasharray="2 5"/>' +
      // N-S graticule (vertical centerline). Dashed.
      '<line x1="240" y1="-60" x2="240" y2="240" fill="none" ' +
        'stroke="#5a96aa" stroke-opacity="0.16" stroke-width="0.4" stroke-dasharray="3 2"/>' +
      // Subtle violet orbital ellipse — calm-ops cue per refs/mars-blue.
      // Gentle 3D pivot via animateTransform: tilt oscillates -14°..-6°
      // around the radar center, 80s period.  Gated on reduced-motion.
      '<path d="M 50 240 A 190 95 0 0 1 430 240" fill="none" ' +
        'stroke="#8b6cff" stroke-opacity="0.16" stroke-width="0.55" stroke-dasharray="4 3" transform="rotate(-10 240 240)">' +
        (reduce ? "" :
          '<animateTransform attributeName="transform" type="rotate" ' +
            'values="-14 240 240; -6 240 240; -14 240 240" ' +
            'dur="80s" repeatCount="indefinite"/>') +
      '</path>' +
      // Bridge curves between adjacent rings — visual cross-talk
      // (the radar "knows about itself").  Seven small radial spans
      // across the upper half, scattered angles so they don't read as
      // a regular pattern.  Each curve gets a marching stroke-dashoffset
      // animation so the dashes drift inward — reads as radar data flowing
      // between concentric zones.  Opacity bumped to 0.50 to compensate
      // for the dashed (rather than solid) stroke.
      '<g fill="none" stroke="#4c8dc6" stroke-opacity="0.50" stroke-width="0.55" stroke-dasharray="3 6">' +
        bridge("M 282 198 Q 305 178 325 155", 4.2) +
        bridge("M 198 198 Q 180 175 155 155", 5.6) +
        bridge("M 281 127 Q 305 110 333 95",  4.8) +
        bridge("M 200 128 Q 175 113 148 95",  6.4) +
        bridge("M 396 150 Q 415 145 432 138", 5.2) +
        bridge("M 85 150 Q 65 145 48 138",    7.0) +
        bridge("M 240 15 Q 240 0 240 -30",    5.8) +
      '</g>' +
      // Radial arrows pointing inward — small triangles with tips on
      // ring boundaries, oriented radially.  ~5 of them, scattered.
      '<g fill="none" stroke="#4c8dc6" stroke-opacity="0.55" stroke-width="0.5">' +
        // Arrow on r=120 at top (angle 90°), pointing down toward center.
        '<polygon points="240,120 234,110 246,110"/>' +
        // Arrow on r=180 upper-right (angle ~45°), pointing inward.
        '<polygon points="367,113 376,107 374,118"/>' +
        // Arrow on r=180 upper-left (angle ~135°), pointing inward.
        '<polygon points="113,113 104,107 106,118"/>' +
        // Arrow on r=225 right (angle ~30°), pointing inward.
        '<polygon points="435,128 443,128 443,141"/>' +
        // Arrow on r=225 left (angle ~150°), pointing inward.
        '<polygon points="45,128 37,128 37,141"/>' +
      '</g>' +
      // Compass heading arc — three concentric arcs centered (240, 240),
      // SAME center as the tactical display.  Arcs span upward as semicircles.
      // Whole compass (arcs + ticks + degree labels) gently sways ±15° around
      // the radar center over 65s, mimicking own-ship heading drift.  Labels
      // ride the rotation so the bearing markings stay attached to their ticks.
      '<g>' +
        (reduce ? "" :
          '<animateTransform attributeName="transform" type="rotate" ' +
            'values="-15 240 240; 15 240 240; -15 240 240" ' +
            'dur="65s" repeatCount="indefinite"/>') +
        '<g fill="none" stroke="#4c8dc6" stroke-opacity="0.40">' +
          '<path d="M 213 240 A 27 27 0 0 1 267 240" stroke-width="0.35"/>' +
          '<path d="M 210 240 A 30 30 0 0 1 270 240" stroke-width="0.35"/>' +
          '<path d="M 205 240 A 35 35 0 0 1 275 240" stroke-width="0.9"/>' +
        '</g>' +
        '<g stroke="#4c8dc6" stroke-opacity="0.5" stroke-width="0.35">' +
          '<line x1="213" y1="240" x2="214.5" y2="236"/>' +
          '<line x1="222" y1="221" x2="223.5" y2="218"/>' +
          '<line x1="240" y1="213" x2="240"   y2="209.5"/>' +
          '<line x1="258" y1="221" x2="256.5" y2="218"/>' +
          '<line x1="267" y1="240" x2="265.5" y2="236"/>' +
        '</g>' +
        '<g fill="#4c8dc6" fill-opacity="0.55" font-family="\'Space Mono\', monospace" font-size="1.8">' +
          '<text x="208" y="245">330</text>' +
          '<text x="217" y="218">350</text>' +
          '<text x="235" y="210">000</text>' +
          '<text x="253" y="218">010</text>' +
          '<text x="261" y="245">030</text>' +
        '</g>' +
      '</g>' +
      // 17 stalker glyphs — per-stalker <g> wrappers with per-glyph
      // <animateMotion> drift, built into `stalkers` above so each glyph
      // (shape + dot if any + label) moves as a single unit.
      stalkers +
      // Own ship — bold blue dot at the radar center (= viewport bottom).
      '<circle cx="240" cy="240" r="3.2" fill="#4c8dc6" fill-opacity="0.95"/>' +
    '</svg>';
  // Mars-red palette swap — the tachi era runs RED-dominant tactical plots
  // ("red concentric tactical plots, not just danger" per refs/mars-red
  // NOTES.md), with steel-cyan as the cooler accent.  Cheaper than
  // restructuring every color reference up above — the SVG content has
  // exactly two repeating ink slots (#4c8dc6 cobalt = primary,
  // #a11a4b desat-red = secondary), so a simple swap reskins everything.
  if (_active() === "mars-red") {
    svgStr = svgStr
      .replace(/#4c8dc6/g, "#d8362a")
      .replace(/#a11a4b/g, "#4a9ec0");
  }
  host.innerHTML = svgStr;
}

// Bind the bottom histogram band to REAL data: the session's mint activity over
// time. Each of the N bars is a time slice between the oldest and newest
// rendered cell; bar height = normalized count of cells minted in that slice
// (red = activity/energy, the MCRN grammar). So the band reads as a live
// session-activity spectrum, not decoration. Called from applyActiveLayout
// (initial + livefeed + resize). Per memory feedback_flair_must_inform.
export function _updateMarsBlueHisto() {
  const ACTIVE = _active();
  const fur = document.getElementById("theme-furniture");
  if (!fur || fur.dataset.theme !== "mars-blue") return;
  const bars = fur.querySelectorAll(".fur-bars i");
  if (!bars.length) return;
  const N = bars.length;
  const ts = [...document.querySelectorAll("#notebook .cell[data-timestamp]")]
    .map((c) => Date.parse(c.dataset.timestamp))
    .filter((t) => Number.isFinite(t));
  if (ts.length < 2) return;
  let minT = Infinity, maxT = -Infinity;
  for (const t of ts) { if (t < minT) minT = t; if (t > maxT) maxT = t; }
  const span = Math.max(1, maxT - minT);
  const bins = new Array(N).fill(0);
  for (const t of ts) {
    let i = Math.floor(((t - minT) / span) * N);
    if (i >= N) i = N - 1; else if (i < 0) i = 0;
    bins[i]++;
  }
  let maxCount = 1;
  for (const b of bins) if (b > maxCount) maxCount = b;
  for (let i = 0; i < N; i++) {
    bars[i].style.setProperty("--h", (0.1 + 0.9 * (bins[i] / maxCount)).toFixed(3));
  }
  const mins = Math.round(span / 60000);
  const window = mins >= 1 ? mins + "M" : "<1M";
  const REG = ACTIVE === "mars-red" ? "MARS NAVY · CV-T15" : "MARS NAVY · CTV-K1W-XR";
  const label = fur.querySelector(".fur-histo-label");
  if (label) {
    // "MINT ACTIVITY · N CELLS" read as dev-tooling on an MCRN warship
    // status line.  TRAFFIC + CONTACTS matches the HUD chip vocabulary
    // (CONTACTS / WATCH / POST / SHIP) so the footer reads in-register.
    label.innerHTML = REG + "<br>TRAFFIC · " +
      ts.length + " CONTACTS / " + window.replace("<", "&lt;");
  }
  const histo = fur.querySelector(".fur-histo");
  if (histo) {
    histo.title = "Mint-activity readout — " + ts.length + " cells minted over " +
      (mins >= 1 ? "the last " + mins + " min" : "under a minute") +
      ". Each bar is a time slice; bar height = cells minted in that slice.";
  }
  // Dials + strip → bound to real session metrics (flair-must-inform): the
  // needles point to live values instead of spinning decoratively.
  const spanMin = Math.max(0.5, span / 60000);
  const rate = ts.length / spanMin;                 // cells per minute
  const rateNorm = Math.min(1, rate / 3);           // 3 cells/min = full deflection
  const types = new Set(
    [...document.querySelectorAll("#notebook .cell[data-cell-type]")].map((c) => c.dataset.cellType),
  );
  const divNorm = Math.min(1, types.size / 6);
  const dials = fur.querySelectorAll(".fur-dial");
  if (dials[0]) {
    dials[0].style.setProperty("--dial-angle", Math.round(rateNorm * 240 - 120) + "deg");
    dials[0].title = "Mint rate — ~" + rate.toFixed(1) + " cells/min in the recent window.";
  }
  if (dials[1]) {
    dials[1].style.setProperty("--dial-angle", Math.round(divNorm * 240 - 120) + "deg");
    dials[1].title = "Substrate diversity — " + types.size + " distinct cell types in view.";
  }
  // System-color triad: red = any danger cells in view, amber = low-
  // confidence cells, green = clean steady state (no signals firing).
  // Same flair-must-inform pattern as the histogram + dials.
  const dangerCount = document.querySelectorAll("#notebook .cell.cell-danger").length;
  const lowConfCount = document.querySelectorAll("#notebook .cell.cell-conf-low").length;
  const lampR = fur.querySelector(".fur-lamp-r");
  const lampA = fur.querySelector(".fur-lamp-a");
  const lampG = fur.querySelector(".fur-lamp-g");
  if (lampR) lampR.dataset.on = dangerCount > 0 ? "1" : "0";
  if (lampA) lampA.dataset.on = lowConfCount > 0 ? "1" : "0";
  if (lampG) lampG.dataset.on = dangerCount === 0 && lowConfCount === 0 ? "1" : "0";
  // Pip rectangles → data-state per session signal, same flair-must-inform
  // pattern as the lamp triad above.  CSS keys off [data-state] for the
  // pulse + glow variations.
  const recent = ts.filter((t) => maxT - t < 30_000).length;
  const setPip = (name, state) => {
    const p = fur.querySelector('.fur-pip[data-pip="' + name + '"]');
    if (p) p.dataset.state = state;
  };
  setPip("THREAT", dangerCount > 0 ? "alert" : "armed");
  setPip("SCAN",   recent > 0       ? "active" : "idle");
  setPip("LOK",    (dangerCount === 0 && recent > 0) ? "locked" : "idle");
  setPip("PDC",    "armed");
  setPip("AUX",    "armed");
}
