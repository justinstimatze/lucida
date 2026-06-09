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
  // MCRN bridge-console BEZEL: corner brackets, L/R bearing tick scales, a top
  // segmented readout strip, and the signature bottom band (red spectrum-analyzer
  // histogram + cyan dials + registry label). All in the viewport margins,
  // pointer-events none. The animated bits (bar bounce, strip runner, dial
  // needles) + the body::after radar sweep are the "movement" tells. Styling +
  // keyframes live in notebook.css (#theme-furniture[data-theme=mars-blue]).
  let bars = "";
  const N = 46;
  for (let i = 0; i < N; i++) {
    // Bars start at a flat baseline; _updateMarsBlueHisto() binds each bar's
    // height to REAL mint activity (cells minted in that time slice). The
    // per-bar dur/delay only drive a subtle shimmer so the band looks alive
    // without overriding the data height.
    const dur = (1.5 + (i % 5) * 0.4).toFixed(2);
    const delay = (((i * 3) % 11) * 0.13).toFixed(2);
    bars += '<i style="--h:0.1;--dur:' + dur + 's;--delay:' + delay + 's"></i>';
  }
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
    '<div class="fur-histo" title="Mint-activity readout — each bar is a time slice of the session; bar height = cells minted in that slice.">' +
      '<div class="fur-histo-label">' + REG + '<br>TRAFFIC · STANDBY</div>' +
      '<div class="fur-bars">' + bars + '</div>' +
      // System-color triad indicators — red/green/amber backlit lamps
      // (Yorke's MCRN physical button palette). Bound below in
      // _updateMarsBlueHisto to real session state.
      '<div class="fur-triad" title="System-color triad — red (errors/danger), amber (warnings), green (ok). Live from session state.">' +
        '<span class="fur-lamp fur-lamp-r" data-on="0"></span>' +
        '<span class="fur-lamp fur-lamp-a" data-on="0"></span>' +
        '<span class="fur-lamp fur-lamp-g" data-on="1"></span>' +
      '</div>' +
      '<div class="fur-dials"><span class="fur-dial"></span><span class="fur-dial fur-dial-sm"></span></div>' +
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
  // viewBox 480x360 (extra-wide + extra headroom up top so the larger
  // perimeter rings can render).  Radar centered at (240, 240) — bottom-
  // center of viewBox, which lands on viewport bottom thanks to CSS
  // bottom:0 + translateX(-50%) on #mb-bgradar.  Concentric semicircles
  // rise above the horizon.  Eight rings total: 1 inner faint, 1 BRIGHT
  // middle ring (~80vw diameter), 1 dashed blue intermediate, then 5 red
  // perimeter rings progressively further out (alert/long-range cordon),
  // the outermost ~280vw diameter — barely visible flat arcs near the top
  // of the viewport (the "long-range horizon").
  host.innerHTML =
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
      '<path d="M 50 240 A 190 95 0 0 1 430 240" fill="none" ' +
        'stroke="#8b6cff" stroke-opacity="0.16" stroke-width="0.55" stroke-dasharray="4 3" transform="rotate(-10 240 240)"/>' +
      // Bridge curves between adjacent rings — visual cross-talk
      // (the radar "knows about itself").  Six small radial spans
      // across upper half, scattered angles so they don't read as
      // a regular pattern.
      '<g fill="none" stroke="#4c8dc6" stroke-opacity="0.36" stroke-width="0.5">' +
        // r=60 → r=120, angle ~45° upper-right
        '<path d="M 282 198 Q 305 178 325 155"/>' +
        // r=60 → r=120, angle ~135° upper-left
        '<path d="M 198 198 Q 180 175 155 155"/>' +
        // r=120 → r=180, angle ~70° upper-right
        '<path d="M 281 127 Q 305 110 333 95"/>' +
        // r=120 → r=180, angle ~110° upper-left
        '<path d="M 200 128 Q 175 113 148 95"/>' +
        // r=180 → r=225, angle ~30° right
        '<path d="M 396 150 Q 415 145 432 138"/>' +
        // r=180 → r=225, angle ~150° left
        '<path d="M 85 150 Q 65 145 48 138"/>' +
        // r=225 → r=270 angle ~90° (top vertical)
        '<path d="M 240 15 Q 240 0 240 -30"/>' +
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
      // Equilateral triangles — 2 friendly blue (M1, M2) + 2 hostile red
      // (T1, T2).  Per user 2026-06-09: "some stalkers should be red
      // triangles etc. they are all blue right now."  Glyph: outline-only.
      '<g fill="none" stroke="#4c8dc6" stroke-opacity="0.72" stroke-width="0.7">' +
        '<polygon points="200,191 196,198 204,198"/>' +
        '<polygon points="290,136 286,143 294,143"/>' +
      '</g>' +
      '<g fill="none" stroke="#a11a4b" stroke-opacity="0.78" stroke-width="0.7">' +
        '<polygon points="175,114 171,121 179,121"/>' +
        '<polygon points="315,161 311,168 319,168"/>' +
      '</g>' +
      '<g fill="#4c8dc6" fill-opacity="0.6" font-family="\'Space Mono\', monospace" font-size="3.0">' +
        '<text x="206" y="200">M1</text>' +
        '<text x="296" y="145">M2</text>' +
      '</g>' +
      '<g fill="#a11a4b" fill-opacity="0.65" font-family="\'Space Mono\', monospace" font-size="3.0">' +
        '<text x="181" y="123">T1</text>' +
        '<text x="321" y="170">T2</text>' +
      '</g>' +
      // Angle-bracket-with-dot truncated arrows — 2 blue (M5, M6) + 1
      // red (T3).  Dots sit IN the open mouth of each caret.
      '<g fill="none" stroke="#4c8dc6" stroke-opacity="0.72" stroke-width="0.7">' +
        '<path d="M 260 168 L 252 174 L 260 180"/>' +
        '<path d="M 220 200 L 226 192 L 232 200"/>' +
      '</g>' +
      '<g fill="none" stroke="#a11a4b" stroke-opacity="0.78" stroke-width="0.7">' +
        '<path d="M 340 128 L 346 122 L 352 128"/>' +
      '</g>' +
      '<g fill="#4c8dc6" fill-opacity="0.78">' +
        '<circle cx="257" cy="174" r="1.5"/>' +
        '<circle cx="226" cy="198" r="1.5"/>' +
      '</g>' +
      '<g fill="#a11a4b" fill-opacity="0.88">' +
        '<circle cx="346" cy="127" r="1.5"/>' +
      '</g>' +
      '<g fill="#4c8dc6" fill-opacity="0.6" font-family="\'Space Mono\', monospace" font-size="3.0">' +
        '<text x="262" y="176">M5</text>' +
        '<text x="232" y="200">M6</text>' +
      '</g>' +
      '<g fill="#a11a4b" fill-opacity="0.65" font-family="\'Space Mono\', monospace" font-size="3.0">' +
        '<text x="354" y="128">T3</text>' +
      '</g>' +
      // 10 red-dot-with-blue-outline contacts — outer r=2.8 (was 1.4),
      // inner r=1.4 (was 0.7).
      '<g fill="none" stroke="#4c8dc6" stroke-opacity="0.78" stroke-width="0.6">' +
        '<circle cx="225" cy="118" r="2.8"/>' +
        '<circle cx="295" cy="125" r="2.8"/>' +
        '<circle cx="182" cy="130" r="2.8"/>' +
        '<circle cx="330" cy="110" r="2.8"/>' +
        '<circle cx="168" cy="160" r="2.8"/>' +
        '<circle cx="245" cy="130" r="2.8"/>' +
        '<circle cx="160" cy="180" r="2.8"/>' +
        '<circle cx="300" cy="200" r="2.8"/>' +
        '<circle cx="338" cy="145" r="2.8"/>' +
        '<circle cx="140" cy="170" r="2.8"/>' +
      '</g>' +
      '<g fill="#a11a4b" fill-opacity="0.92">' +
        '<circle cx="225" cy="118" r="1.4"/>' +
        '<circle cx="295" cy="125" r="1.4"/>' +
        '<circle cx="182" cy="130" r="1.4"/>' +
        '<circle cx="330" cy="110" r="1.4"/>' +
        '<circle cx="168" cy="160" r="1.4"/>' +
        '<circle cx="245" cy="130" r="1.4"/>' +
        '<circle cx="160" cy="180" r="1.4"/>' +
        '<circle cx="300" cy="200" r="1.4"/>' +
        '<circle cx="338" cy="145" r="1.4"/>' +
        '<circle cx="140" cy="170" r="1.4"/>' +
      '</g>' +
      '<g fill="#a11a4b" fill-opacity="0.65" font-family="\'Space Mono\', monospace" font-size="3.0">' +
        '<text x="230" y="120">H1</text>' +
        '<text x="300" y="127">H2</text>' +
        '<text x="187" y="132">H3</text>' +
        '<text x="335" y="112">H4</text>' +
        '<text x="173" y="162">H5</text>' +
        '<text x="250" y="132">H6</text>' +
        '<text x="165" y="182">H7</text>' +
        '<text x="305" y="202">H8</text>' +
        '<text x="343" y="147">H9</text>' +
        '<text x="145" y="172">HA</text>' +
      '</g>' +
      // Own ship — bold blue dot at the radar center (= viewport bottom).
      '<circle cx="240" cy="240" r="3.2" fill="#4c8dc6" fill-opacity="0.95"/>' +
    '</svg>';
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
}
