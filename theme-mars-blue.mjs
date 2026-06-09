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
