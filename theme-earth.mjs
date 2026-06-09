// Earth / UNN theme module — Earth/UN naval SITUATION-BOARD, the war-room
// tactical table. Extracted from lucida.mjs as part of task #70.
//
// Where Drift draws a tilted holo-plane and MarsBlue a radar bezel, this is
// a flat HEAD-ON range-ring plot (concentric circles = naval-radar grammar,
// refs unn_tactical_grid_rangerings) with the UN globe-laurel seal inlaid
// at center (the war-room table), blue friendly range-rings + a dashed red
// threat ring, framed in a chunky grey angular console bezel
// (unn_bridge_console_angular). NO glow, NO holo depth, NO flicker — the
// deliberately-dull "boring competent bureaucracy" register.
//
// Public exports:
//   _buildFurnitureEarth(el)  — populates #theme-furniture
//   _updateEarthTactical()    — binds contacts + readout to live cells
//   _earthAmbientStart()      — kicks off the 2s ambient ticker

// Resolve the earth palette from CSS custom properties at call time.
// SVG presentation attributes (fill="...", stroke="...") don't accept
// `var(--accent-X)` syntax — those resolve only in style declarations,
// not in attribute strings.  So we read once per build and interpolate
// the literal.  Hex fallbacks match earth.tokens.json so the SVG is
// correct if applyTokensToCSSVars hasn't run yet.  Eliminates the
// tokens.json ↔ .mjs calque on earth accent.primary / data.cat[2-3-5].
function _earthPalette() {
  const cs = getComputedStyle(document.body);
  const get = (name, fallback) =>
    (cs.getPropertyValue(name) || fallback).trim() || fallback;
  return {
    primary: get("--accent-primary", "#2f6fd0"),
    danger:  get("--accent-danger",  "#d83a2e"),
    cat2:    get("--data-cat-2",     "#6f9fd0"),
    cat3:    get("--data-cat-3",     "#9bb8d8"),
  };
}

// UN globe-laurel seal — the key Earth-power iconography (refs/unn/NOTES.md).
// Simplified azimuthal globe grid (concentric circles + radial meridians) flanked
// by two mirrored laurel branches. Flat single-blue line work, low opacity — it
// reads as etched into the plot, like the war-room table inlay.
function _earthSeal(cx, cy, R) {
  // Brighter institutional blue + higher opacity so the seal reads as
  // the Earth-power inlay, not a faint watermark. Audit 2026-05-31
  // flagged the prior #7da4d6 @ 0.5 as nearly invisible against bg.
  const col = _earthPalette().cat3;
  let s = '<g class="earth-seal-g" stroke="' + col + '" stroke-opacity="0.78" fill="none" stroke-width="0.7" stroke-linecap="round">';
  s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R.toFixed(1) + '"/>';
  s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R * 0.62).toFixed(1) + '"/>';
  s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R * 0.28).toFixed(1) + '"/>';
  // radial meridians (azimuthal-projection look)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + R * Math.cos(a)).toFixed(1) +
      '" y2="' + (cy + R * Math.sin(a)).toFixed(1) + '"/>';
  }
  // two mirrored laurel branches curving up around the globe
  s += '<path d="M' + (cx - R * 0.18).toFixed(1) + ' ' + (cy + R * 1.34).toFixed(1) +
    ' Q' + (cx - R * 1.62).toFixed(1) + ' ' + (cy + R * 0.5).toFixed(1) +
    ' ' + (cx - R * 1.22).toFixed(1) + ' ' + (cy - R * 0.78).toFixed(1) + '"/>';
  s += '<path d="M' + (cx + R * 0.18).toFixed(1) + ' ' + (cy + R * 1.34).toFixed(1) +
    ' Q' + (cx + R * 1.62).toFixed(1) + ' ' + (cy + R * 0.5).toFixed(1) +
    ' ' + (cx + R * 1.22).toFixed(1) + ' ' + (cy - R * 0.78).toFixed(1) + '"/>';
  s += '</g>';
  return s;
}

export function _buildFurnitureEarth(el) {
  // Own ship (EARTH) sits at center — concentric blue range-rings = its sensor
  // envelope. A SECOND, OFFSET red sensor bubble (a designated hostile contact)
  // overlaps it — the reference's signature composition (EARTH Agatha King's blue
  // bubble overlapping the MCRN threat's red bubble), not a single concentric
  // radar. Own ship is named by the UN seal + placard; the threat is labeled.
  const p = _earthPalette();
  const cx = 94, cy = 60;
  const ringR = [10, 22, 34, 46];
  // Head-on flat grid plane underlay — refs/unn/unn_tactical_grid_rangerings.png
  // shows a navy grid plane behind the rings (the WWII-naval institutional
  // chart paper). Even-spaced dashed verticals + horizontals, deliberately
  // dull (no perspective tilt, no glow) — the "boring competent bureaucracy"
  // register.
  let grid = "";
  for (let x = 4; x <= 184; x += 16) {
    grid += '<line x1="' + x + '" y1="6" x2="' + x + '" y2="118" ' +
      'stroke="' + p.primary + '" stroke-opacity="0.13" stroke-width="0.5" stroke-dasharray="2 2"/>';
  }
  for (let y = 6; y <= 118; y += 16) {
    grid += '<line x1="4" y1="' + y + '" x2="184" y2="' + y + '" ' +
      'stroke="' + p.primary + '" stroke-opacity="0.13" stroke-width="0.5" stroke-dasharray="2 2"/>';
  }
  let rings = "";
  ringR.forEach((r) => {
    rings += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
      '" fill="none" stroke="' + p.primary + '" stroke-opacity="0.5" stroke-width="1"/>';
  });
  // N-S / E-W bearing graticule through own ship.
  rings += '<line x1="' + cx + '" y1="' + (cy - 46) + '" x2="' + cx + '" y2="' + (cy + 46) +
    '" stroke="' + p.primary + '" stroke-opacity="0.22" stroke-width="0.6"/>' +
    '<line x1="' + (cx - 46) + '" y1="' + cy + '" x2="' + (cx + 46) + '" y2="' + cy +
    '" stroke="' + p.primary + '" stroke-opacity="0.22" stroke-width="0.6"/>';
  // Offset hostile contact — its own dashed red sensor bubble + an open red
  // threat triangle at its center + a label. Overlaps the blue envelope.
  const tx = 56, ty = 86, tr = 26;
  // Threat fades in/out (radar contact loses + reacquires) and drifts on a
  // slow bezier path — the hostile doesn't show the whole time and moves a little.
  const reduceThreat = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const threatMotion = reduceThreat ? "" :
    '<animateMotion path="M 0 0 C 8 -4, 14 6, 6 10 S -4 4, 0 0" ' +
    'dur="140s" rotate="0" repeatCount="indefinite"/>';
  // Opacity cycle: 0.05 most of the time, brief visible windows. 80s loop —
  // fade in over 15%, hold visible 35%, fade out 15%, ghost 35%.
  const threatFade = reduceThreat ? "" :
    '<animate attributeName="opacity" ' +
    'values="0.05;1;1;0.05;0.05" keyTimes="0;0.15;0.5;0.65;1" ' +
    'dur="80s" repeatCount="indefinite"/>';
  const threat =
    '<g class="earth-threat">' +
      threatMotion +
      threatFade +
      '<circle cx="' + tx + '" cy="' + ty + '" r="' + tr + '" fill="none" ' +
        'stroke="' + p.danger + '" stroke-opacity="0.5" stroke-width="1" stroke-dasharray="4 4"/>' +
      '<path d="M' + tx + ' ' + (ty - 4) + ' L' + (tx + 4) + ' ' + (ty + 3) +
        ' L' + (tx - 4) + ' ' + (ty + 3) + ' Z" fill="none" stroke="' + p.danger + '" stroke-width="1.2"/>' +
      '<text class="earth-threat-lbl" x="' + tx + '" y="' + (ty + 14) + '" text-anchor="middle">HOSTILE</text>' +
    '</g>';
  el.innerHTML =
    '<div class="earth-board">' +
      '<div class="earth-board-hd">EARTH NAVY · SITUATIONS PLOT</div>' +
      '<div class="earth-screen">' +
        '<svg viewBox="0 0 188 124" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
          '<g class="earth-grid-bg">' + grid + '</g>' +
          _earthSeal(cx, cy, 10) +
          '<g class="earth-rings">' + rings + '</g>' + threat +
          // Sweep beam — SVG <animateTransform> rotating a 30° wedge around
          // own-ship. SMIL handles rotation around the parent g's origin
          // (which we translate to cx,cy) natively — no CSS transform-origin
          // ambiguity. 12s/rev (dignified, weighty per earth register).
          '<g transform="translate(' + cx + ' ' + cy + ')">' +
            '<g class="earth-sweep">' +
              '<path d="M 0 0 L 42 0 A 42 42 0 0 1 36.4 21 Z" ' +
                'fill="' + p.primary + '" fill-opacity="0.06" ' +
                'stroke="' + p.primary + '" stroke-opacity="0.32" stroke-width="0.4"/>' +
              (window.matchMedia &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? ""
                  : '<animateTransform attributeName="transform" type="rotate" ' +
                    'from="0" to="360" dur="12s" repeatCount="indefinite"/>') +
            '</g>' +
          '</g>' +
          '<text class="earth-own-lbl" x="' + (cx + 14) + '" y="' + (cy - 14) + '">OWN</text>' +
          '<g class="earth-contacts"></g>' +
        '</svg>' +
      '</div>' +
      '<div class="earth-readout">' +
        '<div class="earth-readout-hd"><span>TRK</span><span>TYP</span><span>BRG</span><span>RNG</span></div>' +
        '<div class="earth-readout-rows"></div>' +
        // Selected-track field readout — label / value / unit three-column
        // rows (BRG · 028 · ° pattern) per refs/unn data-row density. The
        // ref panel shows multiple field rows for the selected contact, the
        // WWII-naval institutional "every channel labeled" register. Updated
        // in _updateEarthTactical with live BRG / RNG / CPA / SPD for the lead.
        '<div class="earth-fields">' +
          '<div class="earth-frow"><span>BRG</span><span class="earth-fval">---</span><span>°</span></div>' +
          '<div class="earth-frow"><span>RNG</span><span class="earth-fval">---</span><span>NM</span></div>' +
          '<div class="earth-frow"><span>CPA</span><span class="earth-fval">---</span><span>NM</span></div>' +
          '<div class="earth-frow"><span>SPD</span><span class="earth-fval">---</span><span>KT</span></div>' +
        '</div>' +
        '<div class="earth-readout-ft">' +
          '<span class="earth-ft1">SEL · STANDBY</span>' +
          '<span class="earth-ft2">STATUS · MONITORING</span>' +
        '</div>' +
      '</div>' +
    '</div>';
}

// Formal naval track abbreviation for a substrate type — institutional register
// (plain uppercase, not Drift creole).
function _earthTag(type) {
  const m = {
    vega: "PLOT", treemap: "AREA", gauge: "GAUG", sparkline: "TRND",
    coord_plot: "COOR", mermaid: "FLOW", force_graph: "NET", trajectory: "TRAJ",
    timeline_ribbon: "TIME", html: "DATA", code: "CODE", ascii: "TEXT",
    scene3d: "VOL", image: "IMG", animated_svg: "ANIM",
  };
  return m[type] || (type ? type.slice(0, 4).toUpperCase() : "SIG");
}

// Bind the situation-plot to REAL data: the most-recent cells become tracked
// friendly contacts (blue) on the range-rings — newest innermost — and populate
// the right-side tracking readout. Deterministic bearings (no jitter) keep it
// dignified/institutional. Called from applyActiveLayout.
export function _updateEarthTactical() {
  const fur = document.getElementById("theme-furniture");
  if (!fur || fur.dataset.theme !== "earth") return;
  const g = fur.querySelector(".earth-contacts");
  const rowsEl = fur.querySelector(".earth-readout-rows");
  if (!g) return;
  const cells = [...document.querySelectorAll("#notebook .cell[data-timestamp]")]
    .map((c) => ({ t: Date.parse(c.dataset.timestamp), type: c.dataset.cellType || "" }))
    .filter((c) => Number.isFinite(c.t))
    .sort((a, b) => b.t - a.t)
    .slice(0, 4);   // 4-contact dignified plot — fits 4 rows + 4 field rows in the readout panel.
  const p = _earthPalette();
  const cx = 94, cy = 60, ringR = [10, 22, 34, 46];
  let out = "", rows = "";
  cells.forEach((c, i) => {
    const r = ringR[Math.min(ringR.length - 1, Math.floor(i / 2))]; // newest inner, 2 per ring
    const deg = (i * 67 + 28) % 360;                                // deterministic bearing
    const a = ((deg - 90) * Math.PI) / 180;                         // 0° = North
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    const px = x.toFixed(1), py = y.toFixed(1);
    // Smooth spline track: each contact follows a closed bezier loop centered
    // on its initial position. <animateMotion rotate="0"> keeps the contact
    // (and its label) axis-aligned (always upright).
    // Loop shape varies per contact index so they look independent.
    const reduce = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sx = 8 + (i * 7) % 14;        // half-width  of the loop
    const sy = 6 + (i * 5) % 10;        // half-height of the loop
    const cw = (i % 2 === 0) ? 1 : -1;  // direction varies
    const period = 95 + i * 22;         // 95..185s — slow + dignified
    const path = "M 0 0 C " + (sx * cw) + " " + (-sy * 0.8) + ", " +
                 (sx * 1.2 * cw) + " " + (sy * 0.5) + ", " +
                 "0 " + (sy * 1.1) + " S " +
                 (-sx * 0.7 * cw) + " " + (sy * 0.3) + ", 0 0";
    const animMotion = reduce ? "" :
      '<animateMotion path="' + path + '" dur="' + period +
      's" rotate="0" repeatCount="indefinite"/>';
    out +=
      '<g class="earth-contact">' +
        animMotion +
        '<line x1="' + cx + '" y1="' + cy + '" x2="' + px + '" y2="' + py +
          '" stroke="' + p.primary + '" stroke-opacity="0.28" stroke-width="0.6"/>' +
        '<rect x="' + (x - 2).toFixed(1) + '" y="' + (y - 2).toFixed(1) +
          '" width="4" height="4" fill="none" stroke="' + p.cat2 + '" stroke-width="1"/>' +
        (i === 0 ? '<rect class="earth-sel-live" x="' + (x - 3.6).toFixed(1) + '" y="' + (y - 3.6).toFixed(1) +
          '" width="7.2" height="7.2" fill="none" stroke="' + p.cat3 + '" stroke-opacity="0.75" stroke-width="0.6"/>' : "") +
        (i < 3 ? '<text class="earth-contact-lbl" x="' + (x + 6).toFixed(1) + '" y="' + (y + 2.5).toFixed(1) +
          '">' + _earthTag(c.type) + '</text>' : "") +
      '</g>';
    const brg = String(deg).padStart(3, "0");
    const ringIdx = Math.min(ringR.length - 1, Math.floor(i / 2));
    const rng = String(4 + ringIdx * 8 + (i % 2) * 2).padStart(2, "0"); // recency→range
    rows += '<div class="earth-rrow"><span>' + String(i + 1).padStart(2, "0") +
      '</span><span>' + _earthTag(c.type) + '</span><span>' + brg +
      '</span><span>' + rng + '</span></div>';
  });
  g.innerHTML = out;
  if (rowsEl) rowsEl.innerHTML = rows;
  // Range-solution footer for the selected (lead) track — the reference's dense
  // naval readout (RNG / CPA / units). On-character institutional density.
  const ft1 = fur.querySelector(".earth-ft1");
  const ft2 = fur.querySelector(".earth-ft2");
  // Selected-track label/value/unit field readout. Values derive from the same
  // synthetic bearing/range solution the contact row uses (deterministic so it
  // reads as a steady naval plot, not a jittery dev demo).
  const fvals = fur.querySelectorAll(".earth-fields .earth-fval");
  if (cells.length) {
    const lead = cells[0];
    if (ft1) ft1.textContent = "SEL · " + _earthTag(lead.type);
    if (ft2) ft2.textContent = "STATUS · " + cells.length + " TRK";
    if (fvals.length === 4) {
      // Ambient values — derive from session-time + cell recency so they
      // slowly drift like a real tactical plot rather than static stubs.
      // Drift is smooth (sin) and slow (periods 30-45s) — earth register:
      // dignified, not jittery.
      const t = Date.now() / 1000;
      const recencyAge = (Date.now() - lead.t) / 1000;
      const brg = (28 + Math.sin(t / 40) * 18 + 360) % 360;
      const rng = 4 + (recencyAge % 60) / 10 + Math.sin(t / 30) * 0.6;
      const cpa = Math.max(0.5, 4.2 + Math.sin(t / 45 + 1.3) * 1.4);
      const spd = 10 + Math.sin(t / 35 + 0.7) * 4;
      fvals[0].textContent = String(brg | 0).padStart(3, "0");           // BRG °
      fvals[1].textContent = rng.toFixed(1).padStart(4, "0");            // RNG NM
      fvals[2].textContent = cpa.toFixed(1).padStart(4, "0");            // CPA NM
      fvals[3].textContent = String(Math.max(1, spd | 0)).padStart(2, "0"); // SPD KT
    }
  } else {
    if (ft1) ft1.textContent = "SEL · STANDBY";
    if (ft2) ft2.textContent = "STATUS · STANDBY";
    fvals.forEach((v) => { v.textContent = "---"; });
  }
}

// Ambient readout tick: re-runs _updateEarthTactical's drift math every
// 2s so the BRG/RNG/CPA/SPD values keep changing without needing a new
// mint to trigger an update. Gated on earth theme; cleared when furniture
// remounts (best-effort — interval keeps running, but no-ops on other themes).
let _earthAmbientTimer = null;
export function _earthAmbientStart() {
  if (_earthAmbientTimer) return;
  _earthAmbientTimer = setInterval(() => {
    const fur = document.getElementById("theme-furniture");
    if (!fur || fur.dataset.theme !== "earth") return;
    _updateEarthTactical();
  }, 2000);
}
