// Drift / Belter (OPA Free Navy) theme module — extracted from lucida.mjs
// (2026-06-08, the first per-theme slice; pattern for the rest in task #70).
//
// The Drift↔MarsBlue differentiator: Mars draws a flat radial sonar fan; the
// Belt draws a perspective-TILTED elliptical orbital PLANE (concentric
// ellipses seen at an angle) with cyan tracks + yellow ▼ stalk-markers
// rising off the plane (refs/drift/belter_orbital_tactical.png). Plus the
// OPA split-circle faction glyph + a Lang-Belta-register registry label.
// Contacts are data-bound (_updateDriftOrbital) so the plot reads as live
// session tracking, not decoration (memory feedback_flair_must_inform).
//
// Public exports (called from lucida.mjs):
//   _buildFurnitureDrift(el)  — populates #theme-furniture for the drift theme
//   _updateDriftOrbital()     — data-binds orbital contacts + starts rAF loop
//   _updateDriftHero()        — refreshes the top hero band + bottom strip

export function _buildFurnitureDrift(el) {
  // Big live orbital tactical (2026-06-08). The orbital plot grew from a 266×182
  // bottom-left widget into the dashboard CENTERPIECE: viewport-bottom-half,
  // wide aspect, live data-bound contacts via _updateDriftOrbital. Cells live in
  // the 4 corners (layout=corners), the orbital fills the middle/lower.
  // Coords: viewBox 480×200, cx=240 cy=170 RxMax=280; matches the new
  // _updateDriftOrbital arithmetic.
  // Lang-Belta perimeter decals stay as eclectic-graffiti tell.
  const p = _driftPalette();
  el.innerHTML =
    // Top-center hero band — sits between the TL and TR corner cells.
    // Composition (per ref bel_pPutN_076): left = live ROCI-style callout
    // (newest contact tagged); middle = mint cadence sparkline; right =
    // operations status (kontakt count + latest substrate + mint rate).
    // Position bounds (left/right/top/height) are written as CSS vars by
    // applyCornersLayout so the band tracks the actual TL/TR cell bounds.
    '<div class="drift-hero" aria-hidden="true">' +
      '<div class="drift-hero-callout">' +
        '<div class="drift-hero-tag">—</div>' +
        '<div class="drift-hero-meta">' +
          '<span class="drift-hero-session"></span>' +
          '<span class="drift-hero-age"></span>' +
        '</div>' +
      '</div>' +
      '<div class="drift-hero-spark">' +
        '<div class="drift-hero-spark-head">KONTAKT · 5m</div>' +
        '<svg class="drift-hero-spark-svg" viewBox="0 0 240 36" ' +
          'preserveAspectRatio="none"></svg>' +
        '<div class="drift-hero-spark-axis">MINT CADENCE</div>' +
      '</div>' +
      '<div class="drift-hero-ops">' +
        '<div class="drift-hero-ops-row">' +
          '<span class="drift-hero-ops-k">KONTAKT</span>' +
          '<span class="drift-hero-ops-v drift-hero-kontakt-n">0</span>' +
        '</div>' +
        '<div class="drift-hero-ops-row">' +
          '<span class="drift-hero-ops-k">LATEST</span>' +
          '<span class="drift-hero-ops-v drift-hero-latest-tag">—</span>' +
        '</div>' +
        '<div class="drift-hero-ops-row">' +
          '<span class="drift-hero-ops-k">MINT / MIN</span>' +
          '<span class="drift-hero-ops-v drift-hero-mintrate">0.0</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="drift-plot" aria-hidden="true">' +
      '<svg viewBox="0 0 480 200" preserveAspectRatio="xMidYMax meet">' +
        // Radial yellow halo behind the center target — soft bloom that
        // fades out into the orbital plane.
        '<defs>' +
          '<radialGradient id="drift-target-halo" cx="50%" cy="50%" r="50%">' +
            '<stop offset="0%"   stop-color="#d4d076" stop-opacity="0.55"/>' +
            '<stop offset="35%"  stop-color="#a39d5c" stop-opacity="0.30"/>' +
            '<stop offset="70%"  stop-color="' + p.primary + '" stop-opacity="0.10"/>' +
            '<stop offset="100%" stop-color="' + p.primary + '" stop-opacity="0"/>' +
          '</radialGradient>' +
        '</defs>' +
        '<ellipse class="drift-target-halo" cx="240" cy="170" rx="120" ' +
          'ry="36" fill="url(#drift-target-halo)"/>' +
        // Orbital rings — solid yellow lines + 4 discrete "nodules"
        // geometrically distributed at compass points per ring
        // (electron-site / station-keep markers). Outermost = double-blue
        // perimeter (threat-detection edge).
        _driftRing(50, 15,   "#b1a55c", 0.85) +
        _driftRing(100, 30,  "#b1a55c", 0.75) +
        _driftRing(160, 48,  "#b1a55c", 0.65) +
        _driftRing(220, 66,  "#b1a55c", 0.55) +
        // Triple-blue outer perimeter — two thin inner rings + one thick
        // outermost. The threat-detection edge.
        '<ellipse cx="240" cy="170" rx="276" ry="82.5" fill="none" ' +
          'stroke="' + p.secondary + '" stroke-opacity="0.55" stroke-width="0.7"/>' +
        '<ellipse cx="240" cy="170" rx="282" ry="84.5" fill="none" ' +
          'stroke="' + p.secondary + '" stroke-opacity="0.55" stroke-width="0.7"/>' +
        '<ellipse cx="240" cy="170" rx="292" ry="87.5" fill="none" ' +
          'stroke="' + p.secondary + '" stroke-opacity="0.85" stroke-width="2.4"/>' +
        // Center target triangle — bright yellow. Equilateral in the orbital
        // plane (tilt 0.30), apex pointing forward.
        //   apex (240, 162) · BR (254, 174) · BL (226, 174)
        '<path class="drift-shipglyph" d="M240 162 L254 174 L226 174 Z" ' +
          'fill="#d4c869" fill-opacity="0.95" stroke="#e0dba8" ' +
          'stroke-width="0.6" stroke-opacity="0.7"/>' +
        // Live contact group — _updateDriftOrbital populates this with the
        // most-recent N cells as tracked contacts (stalk-markers + labels).
        '<g class="drift-contacts"></g>' +
      '</svg>' +
    '</div>' +
    // Yellow chrome bands — TL bottom edge + bottom-row top edges (per
    // ref bel_pPutN_076). Positioned via CSS vars from applyCornersLayout.
    '<div class="drift-edge-band drift-edge-tl-bot" aria-hidden="true"></div>' +
    '<div class="drift-edge-band drift-edge-bl-top" aria-hidden="true"></div>' +
    // Belta-coded button strip along TR cell bottom edge. Mix of labeled
    // yellow buttons + cyan zoom/view controls.
    '<div class="drift-buttongrid drift-buttongrid-tr" aria-hidden="true">' +
      '<span class="drift-btn-y">NAV</span>' +
      '<span class="drift-btn-y">OPA</span>' +
      '<span class="drift-btn-c">+</span>' +
      '<span class="drift-btn-c">−</span>' +
      '<span class="drift-btn-y">LOK</span>' +
      '<span class="drift-btn-y">REF</span>' +
      '<span class="drift-btn-y">KOM</span>' +
    '</div>' +
    // Bottom chrome strip — Belta-coded segments + a dotted center track.
    '<div class="drift-bottom-strip" aria-hidden="true">' +
      '<div class="drift-bot-seg drift-bot-l">' +
        '<span class="drift-bot-k">GEMMA LEK</span>' +
        '<span class="drift-bot-v drift-bot-gemma">—</span>' +
      '</div>' +
      '<div class="drift-bot-track">' +
        '<div class="drift-bot-dots"></div>' +
      '</div>' +
      '<div class="drift-bot-seg drift-bot-r">' +
        '<span class="drift-bot-k">DEPATUNG · LET</span>' +
        '<span class="drift-bot-v drift-bot-depat">—</span>' +
      '</div>' +
    '</div>' +
    // Bottom-right alt-view widget — STRAIGHT-LINE semicircle spider web.
    // Hub at (120,170), 5 concentric semicircular polylines (7 vertices each
    // at 30° steps from -180° to 0°), 7 radial spokes. Polygons not arcs.
    // Sized to fit inside the L-border (max radius 110, leaves 8px gap).
    '<div class="drift-mesh-widget" aria-hidden="true">' +
      '<svg viewBox="0 0 240 200" preserveAspectRatio="none">' +
        // Concentric semicircular POLYLINES (straight-line approximation).
        // Hub at (130, 170) — shifted right of viewBox center to optically
        // balance the heavy white L-border on the left side. Max R=100.
        '<g fill="none" stroke="#7adde0" stroke-width="0.9">' +
          '<polyline stroke-opacity="0.45" points="110,170 113,160 120,153 130,150 140,153 147,160 150,170"/>' +
          '<polyline stroke-opacity="0.58" points="90,170 95,150 110,135 130,130 150,135 165,150 170,170"/>' +
          '<polyline stroke-opacity="0.70" points="70,170 78,140 100,118 130,110 160,118 182,140 190,170"/>' +
          '<polyline stroke-opacity="0.85" points="50,170 61,130 90,101 130,90 170,101 199,130 210,170"/>' +
          '<polyline stroke-opacity="0.95" stroke-width="1.2" points="30,170 43,120 80,83 130,70 180,83 217,120 230,170"/>' +
        '</g>' +
        // 7 radial spokes from hub to outer-ring vertices.
        '<g fill="none" stroke="#7adde0" stroke-width="0.8" stroke-opacity="0.7">' +
          '<line x1="130" y1="170" x2="30"  y2="170"/>' +
          '<line x1="130" y1="170" x2="43"  y2="120"/>' +
          '<line x1="130" y1="170" x2="80"  y2="83"/>' +
          '<line x1="130" y1="170" x2="130" y2="70"/>' +
          '<line x1="130" y1="170" x2="180" y2="83"/>' +
          '<line x1="130" y1="170" x2="217" y2="120"/>' +
          '<line x1="130" y1="170" x2="230" y2="170"/>' +
        '</g>' +
        // Orange reference accents — 3 small orange ticks at the outer-ring
        // spoke endpoints (-150°, -90°, -30°). Station-keep markers.
        '<g fill="#d68548" stroke="#d68548" stroke-width="0.9">' +
          '<circle cx="43"  cy="120" r="2.2"/>' +
          '<circle cx="130" cy="70"  r="2.4"/>' +
          '<circle cx="217" cy="120" r="2.2"/>' +
          // Two small radial orange ticks crossing the outermost ring.
          '<line x1="76"  y1="86"  x2="84"  y2="80"  stroke-opacity="0.85"/>' +
          '<line x1="184" y1="86"  x2="176" y2="80"  stroke-opacity="0.85"/>' +
        '</g>' +
        // Center pip — yellow target at the hub.
        '<circle cx="130" cy="170" r="3.2" fill="#d4c869" fill-opacity="0.9"/>' +
        // Cryptic Belter labels in the space ABOVE the spider web, inside
        // the box — small low-opacity tags + numeric readouts.
        '<g font-family="\'Space Mono\', \'Share Tech Mono\', monospace">' +
          '<text x="40"  y="28" font-size="9" fill="#b1a55c" fill-opacity="0.7" letter-spacing="1.2">DRIFT-LEK</text>' +
          '<text x="200" y="28" font-size="8" fill="#7adde0" fill-opacity="0.65" letter-spacing="1" text-anchor="end">TRAK · 04</text>' +
          '<text x="40"  y="44" font-size="7" fill="#7adde0" fill-opacity="0.55" letter-spacing="1">OWALDA SETARA</text>' +
          '<text x="200" y="44" font-size="7" fill="#d68548" fill-opacity="0.85" letter-spacing="1" text-anchor="end">AKTIV</text>' +
        '</g>' +
        // Data-bound stalkers (populated each frame).
        '<g class="drift-mesh-contacts"></g>' +
        // Thick YELLOW L-border top + left with 45° chamfered corner.
        '<polyline points="232,4 22,4 4,22 4,184" ' +
          'stroke="#c1b85d" stroke-width="7" fill="none" stroke-linecap="square" ' +
          'stroke-linejoin="miter" opacity="0.94"/>' +
      '</svg>' +
      '<span class="drift-mesh-lbl">PROJ · POLAR</span>' +
    '</div>' +
    '<div class="drift-decals" aria-hidden="true">' +
      '<span class="drift-decal drift-decal-1">DRIFTLINE</span>' +
      '<span class="drift-decal drift-decal-2">CORE BREAK</span>' +
      '<span class="drift-decal drift-decal-3">OUTERFLEET</span>' +
      '<span class="drift-decal drift-decal-4">STATIONKEEP · DRIFT</span>' +
    '</div>' +
    // Cryptic Belter labels — moved to the LEFT side of the mesh widget
    // (vertical text column) so the TR button strip can hang freely below
    // the TR cell without colliding with the label stack.
    '<div class="drift-mesh-labels drift-mesh-labels-left" aria-hidden="true">' +
      '<span>WALDA · INTEN</span>' +
      '<span>KOMUN-OTKWA</span>' +
      '<span>BERLA · 47-K</span>' +
      '<span>MEDINA TRACK</span>' +
      '<span>SETARA · IM</span>' +
      '<span>WANG XALESINE</span>' +
    '</div>';
}

// Salvaged-terminal tag for a substrate type — honest (derived from the real
// cell type) but typeset in the Drift creole/abbreviation register.
// Resolve the drift palette from CSS custom properties at call time.
// SVG presentation attributes (fill="...", stroke="...", stop-color="...")
// don't accept `var(--accent-X)` syntax — those resolve only in style
// declarations, not attribute strings.  So we read once per build and
// interpolate the literal.  Hex fallbacks match drift.tokens.json so
// the SVG is still correct if applyTokensToCSSVars hasn't run yet
// (rare, but cheap insurance).  Eliminates the tokens.json ↔ .mjs
// calque on drift accent.primary / .secondary / .warning / .danger.
function _driftPalette() {
  const cs = getComputedStyle(document.body);
  const get = (name, fallback) =>
    (cs.getPropertyValue(name) || fallback).trim() || fallback;
  return {
    primary:   get("--accent-primary",   "#947038"),
    secondary: get("--accent-secondary", "#3d7777"),
    warning:   get("--accent-warning",   "#ffc233"),
    danger:    get("--accent-danger",    "#e23b2e"),
  };
}

function _driftTag(type) {
  const m = {
    vega: "VEGA", treemap: "TREE", gauge: "DIAL", sparkline: "SPRK",
    coord_plot: "KORD", mermaid: "GRAF", force_graph: "NET", trajectory: "TRAJ",
    timeline_ribbon: "TIMA", html: "DOC", code: "KODE", ascii: "ASKI",
    scene3d: "3DEE", image: "IMAJ", animated_svg: "ANIM",
  };
  return m[type] || (type ? type.slice(0, 4).toUpperCase() : "SIG");
}

// Track state for the orbital animation. Each track is one contact with a
// base angle that the rAF loop advances over time → contacts orbit slowly,
// consistent with a "pretend 3D" tactical plot.
let _driftTracks = [];
let _driftAnimStart = 0;
let _driftAnimRAF = null;
// Orbital angular velocity (radians/sec). Period ≈ 160s — slow enough to
// read as deliberate ship motion (deep-space tactical, not a fan). Reduced-
// motion gated below.
const DRIFT_OMEGA = (2 * Math.PI) / 160;

// Static yellow orbital ring + 4 discrete "nodule" dots at compass points
// (electron-site / station-keep markers). Solid stroke so the ring stays
// visible; dots add the per-ring landmarks per ref bel_pPutN_076.
function _driftRing(rx, ry, color, opacity) {
  let s = '<ellipse cx="240" cy="170" rx="' + rx + '" ry="' + ry +
    '" fill="none" stroke="' + color + '" stroke-opacity="' + opacity +
    '" stroke-width="0.9"/>';
  // 4 dots at θ = 0, 90, 180, 270° — right, bottom, left, top of the tilted
  // ellipse. Dot radius scales gently with ring radius so outer dots stay
  // visible without dominating.
  const r = Math.max(1.6, Math.min(2.6, rx / 80));
  const pts = [
    [240 + rx, 170      ],
    [240,      170 + ry ],
    [240 - rx, 170      ],
    [240,      170 - ry ],
  ];
  pts.forEach(([x, y]) => {
    s += '<circle cx="' + x + '" cy="' + y + '" r="' + r.toFixed(2) +
      '" fill="' + color + '" fill-opacity="' + Math.min(1, opacity + 0.1) + '"/>';
  });
  return s;
}

// Bind the orbital plot's contacts to REAL data: the most-recent cells become
// tracked contacts on the tilted plane — newest innermost, oldest outermost,
// spread across a front-facing arc so the ▼ stalk labels don't collide. Each
// marker is tagged by substrate (_driftTag). Called from applyActiveLayout —
// rebinds tracks + (re)starts the rAF loop.
export function _updateDriftOrbital() {
  const fur = document.getElementById("theme-furniture");
  if (!fur || fur.dataset.theme !== "drift") return;
  const g = fur.querySelector(".drift-contacts");
  if (!g) { _driftTracks = []; return; }
  // HAMMER LOCK threat state is CSS-driven via body:has(.cell-danger)
  // (same trigger as the mars-blue threat reticle). No JS class toggle needed.
  // Dedupe by substrate type so no two contacts share the same _driftTag —
  // keep the NEWEST cell per type; cap at 6.
  const allCells = [...document.querySelectorAll("#notebook .cell[data-timestamp]")]
    .map((c) => ({ t: Date.parse(c.dataset.timestamp), type: c.dataset.cellType || "" }))
    .filter((c) => Number.isFinite(c.t))
    .sort((a, b) => b.t - a.t);
  const seen = new Set();
  const cells = [];
  for (const c of allCells) {
    const tag = _driftTag(c.type);
    if (seen.has(tag)) continue;
    seen.add(tag);
    cells.push(c);
    if (cells.length >= 6) break;
  }
  if (!cells.length) { g.innerHTML = ""; _driftTracks = []; return; }
  const n = cells.length;
  const arc = 210, base = -195;          // front-facing arc, degrees
  // Compute initial track placements (base angle + radial fraction). Each
  // track gets a SPEED MULTIPLIER ∈ [0.5, 1.0] hashed from its tag — some
  // contacts orbit slower than others, but none exceeds the base OMEGA.
  _driftTracks = cells.map((c, i) => {
    const tag = _driftTag(c.type);
    let h = 5381;
    for (let k = 0; k < tag.length; k++) h = ((h << 5) + h + tag.charCodeAt(k)) | 0;
    const speedMul = 0.5 + ((Math.abs(h) % 100) / 100) * 0.5;  // 0.50..0.999
    return {
      type: c.type,
      isLive: i === 0,
      baseAng: ((base + (n > 1 ? (arc / (n - 1)) * i : arc / 2)) * Math.PI) / 180,
      frac: 0.42 + (i / Math.max(1, n - 1)) * 0.5,   // newest inner
      speedMul,
    };
  });
  _driftAnimStart = performance.now();
  // Reduced-motion: paint a single static frame and exit (no rAF loop).
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    _renderDriftOrbitalFrame(0);
    if (_driftAnimRAF) { cancelAnimationFrame(_driftAnimRAF); _driftAnimRAF = null; }
    return;
  }
  if (_driftAnimRAF) cancelAnimationFrame(_driftAnimRAF);
  const tick = (now) => {
    _driftAnimRAF = requestAnimationFrame(tick);
    // Bail if user switched themes mid-loop.
    if (!fur.isConnected || fur.dataset.theme !== "drift") {
      cancelAnimationFrame(_driftAnimRAF);
      _driftAnimRAF = null;
      return;
    }
    _renderDriftOrbitalFrame((now - _driftAnimStart) / 1000);
  };
  _driftAnimRAF = requestAnimationFrame(tick);
}

// Data-bind the top-center hero band (callout · sparkline · ops). Newest
// cell drives the live ROCI-style callout; recent-window timestamps drive
// the sparkline + mint-rate. Called from applyActiveLayout alongside the
// orbital update.
export function _updateDriftHero() {
  const fur = document.getElementById("theme-furniture");
  if (!fur || fur.dataset.theme !== "drift") return;
  const hero = fur.querySelector(".drift-hero");
  if (!hero) return;
  const cells = [...document.querySelectorAll("#notebook .cell[data-timestamp]")]
    .map((c) => ({
      t: Date.parse(c.dataset.timestamp),
      type: c.dataset.cellType || "",
      session: c.dataset.session || c.dataset.sessionId || "",
    }))
    .filter((c) => Number.isFinite(c.t))
    .sort((a, b) => b.t - a.t);
  const newest = cells[0];
  const now = Date.now();
  // --- callout: newest contact ---
  const tagEl = hero.querySelector(".drift-hero-tag");
  const sessEl = hero.querySelector(".drift-hero-session");
  const ageEl = hero.querySelector(".drift-hero-age");
  if (newest) {
    if (tagEl) tagEl.textContent = _driftTag(newest.type);
    const sn = (newest.session || "").slice(0, 6).toUpperCase() || "UNTAGGED";
    if (sessEl) sessEl.textContent = "SESS · " + sn;
    if (ageEl) ageEl.textContent = _driftAgo(now - newest.t);
  } else {
    if (tagEl) tagEl.textContent = "—";
    if (sessEl) sessEl.textContent = "";
    if (ageEl) ageEl.textContent = "";
  }
  // --- ops: counts ---
  const window5m = cells.filter((c) => now - c.t <= 5 * 60 * 1000);
  const kontaktEl = hero.querySelector(".drift-hero-kontakt-n");
  const latestEl = hero.querySelector(".drift-hero-latest-tag");
  const rateEl = hero.querySelector(".drift-hero-mintrate");
  if (kontaktEl) kontaktEl.textContent = String(window5m.length).padStart(3, "0");
  if (latestEl) latestEl.textContent = newest ? _driftTag(newest.type) : "—";
  if (rateEl) {
    const rate = window5m.length / 5;   // mints/min over last 5min window
    rateEl.textContent = rate.toFixed(1);
  }
  // Bottom strip readouts. GEMMA LEK = total tracked cells. DEPATUNG LET =
  // distinct substrate count this 5m window. Belta-coded but data-honest.
  const gemmaEl = hero.parentElement?.querySelector(".drift-bot-gemma");
  const depatEl = hero.parentElement?.querySelector(".drift-bot-depat");
  if (gemmaEl) gemmaEl.textContent = String(cells.length).padStart(3, "0");
  if (depatEl) {
    const substrates = new Set(window5m.map((c) => _driftTag(c.type)));
    depatEl.textContent = String(substrates.size).padStart(2, "0") + " TYP";
  }
  // --- sparkline: 5-min cadence ---
  const svg = hero.querySelector(".drift-hero-spark-svg");
  if (svg) {
    const bucketMs = 10 * 1000;                // 10s buckets
    const buckets = 5 * 60 * 1000 / bucketMs;  // 30 buckets across 5min
    const counts = new Array(buckets).fill(0);
    for (const c of window5m) {
      const idx = Math.min(buckets - 1, Math.floor((now - c.t) / bucketMs));
      counts[buckets - 1 - idx]++;            // oldest left, newest right
    }
    const max = Math.max(1, ...counts);
    const W = 240, H = 36, bw = W / buckets;
    let s = "";
    counts.forEach((n, i) => {
      const bh = n === 0 ? 1 : Math.max(2, (n / max) * (H - 4));
      const x = (i * bw).toFixed(2);
      const y = (H - bh).toFixed(2);
      const op = n === 0 ? 0.18 : Math.min(1, 0.4 + (n / max) * 0.55);
      s += '<rect x="' + x + '" y="' + y + '" width="' + (bw - 0.6).toFixed(2) +
        '" height="' + bh.toFixed(2) + '" fill="#b1a55c" fill-opacity="' +
        op.toFixed(2) + '"/>';
    });
    // Baseline hairline.
    s += '<line x1="0" y1="' + (H - 0.5) + '" x2="' + W + '" y2="' + (H - 0.5) +
      '" stroke="#5a9a9a" stroke-opacity="0.5" stroke-width="0.6"/>';
    svg.innerHTML = s;
  }
}

// "1m2s" / "12s" / "3h" — compact age formatter for the hero callout.
function _driftAgo(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m" + (s % 60) + "s";
  const h = Math.floor(m / 60);
  return h + "h" + (m % 60) + "m";
}

// Render one animation frame — recompute contact positions from elapsed time
// and replace .drift-contacts innerHTML. Called every frame by the rAF tick
// (or once for reduced-motion). Geometry: viewBox 480×200, cx=240 cy=170
// RxMax=280, tilt 0.30.
function _renderDriftOrbitalFrame(tSec) {
  const fur = document.getElementById("theme-furniture");
  if (!fur) return;
  const g = fur.querySelector(".drift-contacts");
  if (!g || !_driftTracks.length) return;
  const cx = 240, cy = 170, RxMax = 280, tilt = 0.30, stalkH = 50;
  const p = _driftPalette();
  let out = "";
  _driftTracks.forEach((tr, i) => {
    const ang = tr.baseAng + tSec * DRIFT_OMEGA * (tr.speedMul || 1);
    const rx = tr.frac * RxMax, ry = rx * tilt;
    const pxN = cx + rx * Math.cos(ang), pyN = cy + ry * Math.sin(ang);
    const tyN = pyN - stalkH;
    const px = pxN.toFixed(1), py = pyN.toFixed(1), ty = tyN.toFixed(1);
    // Marker sizes scaled for the big viewBox (was tuned to the 266px widget).
    const tri = "M" + (pxN - 5).toFixed(1) + " " + (tyN - 2).toFixed(1) +
      " L" + (pxN + 5).toFixed(1) + " " + (tyN - 2).toFixed(1) +
      " L" + px + " " + (tyN + 5).toFixed(1) + " Z";
    // Threat-state diamond marker (per refs/drift belter_hammerlock_trails:
    // contact glyphs morph from yellow ▼ triangles to red ◆ diamonds
    // during HAMMER LOCK). Same position as the triangle so the swap
    // reads as one marker changing rather than two markers fighting.
    const dia = "M" + px + " " + (tyN - 5.5).toFixed(1) +
      " L" + (pxN + 5.5).toFixed(1) + " " + tyN.toFixed(1) +
      " L" + px + " " + (tyN + 5.5).toFixed(1) +
      " L" + (pxN - 5.5).toFixed(1) + " " + tyN.toFixed(1) + " Z";
    out +=
      '<g class="drift-contact' + (i === 0 ? ' drift-live' : '') + '">' +
        // Footprint ellipse — grounds the contact as a 3D pin on the plane.
        '<ellipse cx="' + px + '" cy="' + py + '" rx="7" ry="2.5" fill="none" ' +
          'stroke="#5a9a9a" stroke-opacity="0.5" stroke-width="1"/>' +
        '<circle cx="' + px + '" cy="' + py + '" r="3.5" fill="#5a9a9a"/>' +
        // Stalk riser: gold-yellow per ref; triangle bright warning-yellow
        // per refs/drift/belter_orbital_tactical (canonical Drift contact glyph).
        '<line x1="' + px + '" y1="' + py + '" x2="' + px + '" y2="' + ty +
          '" stroke="#b1a55c" stroke-width="2" stroke-opacity="0.9"/>' +
        '<path class="drift-marker-tri" d="' + tri + '" fill="' + p.warning + '"/>' +
        '<path class="drift-marker-dia" d="' + dia + '" fill="' + p.danger + '"/>' +
        '<text x="' + px + '" y="' + (tyN - 7).toFixed(1) +
          '" text-anchor="middle" class="drift-contact-lbl">' + _driftTag(tr.type) +
        '</text>' +
      '</g>';
  });
  g.innerHTML = out;
  _renderDriftMeshFrame(tSec);
}

// Mesh-widget stalkers — project the live orbital tracks into the bottom-
// right SEMI-CIRCLE WEB (viewBox 240×200, hub at 130/170, max radius 100).
// Polar mapping: angle = orbital angle, radius = tr.frac * R. Only upper-
// half angles (sin(ang) ≤ 0) plot inside the visible web.
function _renderDriftMeshFrame(tSec) {
  const fur = document.getElementById("theme-furniture");
  if (!fur) return;
  const g = fur.querySelector(".drift-mesh-contacts");
  if (!g || !_driftTracks.length) return;
  const cx = 130, cy = 170, R = 100;
  let out = "";
  _driftTracks.forEach((tr, i) => {
    const ang = tr.baseAng + tSec * DRIFT_OMEGA * (tr.speedMul || 1);
    // Skip tracks that have rotated into the lower half — they're "below"
    // the web's diameter and would plot outside the visible semicircle.
    if (Math.sin(ang) > 0.02) return;
    const r = tr.frac * R;
    const x = (cx + r * Math.cos(ang)).toFixed(1);
    const y = (cy + r * Math.sin(ang)).toFixed(1);
    const rd = (i === 0 ? 3.2 : 2.4).toFixed(1);
    out +=
      '<g class="drift-mesh-contact' + (i === 0 ? ' drift-mesh-live' : '') + '">' +
        '<circle cx="' + x + '" cy="' + y + '" r="' + rd + '" fill="#7adde0" fill-opacity="0.92"/>' +
        // Small vertical riser so contacts read as stalkers.
        '<line x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + (Number(y) - 10).toFixed(1) +
          '" stroke="#d4c869" stroke-width="1.2" stroke-opacity="0.75"/>' +
      '</g>';
  });
  g.innerHTML = out;
}
