// Layout strategies — organic / pack-hero / warroom / corners / scatter.
// Extracted from lucida.mjs as part of task #70. cockpit/composition slot
// dispatch stays in lucida.mjs for now (depends on TOKENS + _cellArchetypeRole
// which haven't been split yet). pack (Muuri) and mixed3d also remain in
// lucida.mjs because of their heavy ties to module-level state.
//
// Public exports (all wired into LAYOUT_REGISTRY in lucida.mjs):
//   applyOrganicLayout()    — hero + concentric rings of satellites
//   applyPackHeroLayout()   — hero top-left, cells flow right + below
//   applyWarroomLayout()    — ring around a reserved center (earth war-room)
//   applyCornersLayout()    — 3 cells in corners + drift orbital reservation
//   applyScatterLayout()    — deterministic-hash slot scatter

// Once-only flag for the organic-layout auto-scroll. Was state.rendering._organicScrolled
// in lucida.mjs; pulled local to this module since nothing outside reads it.
let _organicScrolled = false;

// ----------------------------------------------------------------
// Organic v1: hero at center + 3 concentric rings of 6 satellites
// each (cap 19). Outer rings extend past one viewport vertically, so
// the notebook scrolls. Satellite size shrinks gently outward; ring
// radii spaced so neighboring rings don't overlap. Slot angles are
// staggered ring-to-ring (30° offset on odd rings) so cells don't
// pile vertically up the y-axis.
// ----------------------------------------------------------------
export function applyOrganicLayout() {
  const root = document.getElementById("notebook");
  const cells = [...root.querySelectorAll(":scope > .cell")];
  if (!cells.length) return;
  const headerH = 80;
  const w = window.innerWidth - 32;
  // Use the SMALLER viewport dim so rings fit horizontally on
  // narrow displays and tiles stay readable on widescreens. Using
  // max() inflated radii past the viewport edge on narrow windows.
  const minDim = Math.min(window.innerWidth, window.innerHeight);
  const cx = w / 2;
  const slotsPerRing = 6;
  // 1 ring of 6 (cap 7). Sized to satisfy memory/layout_visual_rigor.md
  // PLUS ~82px of cell chrome (head + line-clamped caption + hairline
  // summaries) eaten before the body area. Vega min body 280px →
  // tile height needs ≥ 362, tile width ≥ ~462. 0.55 × minDim ≈ 479
  // wide × 374 tall at minDim=871. Clears the budgeted minimum.
  //
  // Fit-to-viewport scale: an outer cell at angle 0° (right side) sits
  // at x = cx + radius + size/2. To stay inside w it needs
  //   radius + size/2 <= w/2 - margin
  // Same constraint vertically. Without this clamp, default
  // (radius=0.62, sizeMul=0.55) ring of cells extended ~430px past
  // the right viewport edge at 1920×1080 (decision 2026-05-23 audit).
  // Scale the entire layout proportionally to keep the FUI feel while
  // guaranteeing the outer satellites fit.
  const margin = 32;
  const radMul = 0.62;
  const sizeMul = 0.55;
  const availHalf = Math.min(w, window.innerHeight - headerH) / 2 - margin;
  const reach = (radMul + sizeMul / 2) * minDim;
  const fitScale = Math.min(1, availHalf / Math.max(1, reach));
  const ringSpecs = [
    { radius: radMul * minDim * fitScale, size: sizeMul * minDim * fitScale },
  ];
  const outer = ringSpecs[ringSpecs.length - 1];
  const outerSatHalfH = outer.size * 0.78 / 2;
  // cy: outermost top satellite needs y >= headerH so cells don't float
  // over the .hud top status bar.
  const cy = Math.max(window.innerHeight / 2, outer.radius + outerSatHalfH + headerH);
  // Hero substantially bigger so its body fills its tile rather than
  // floating in a sparse center. Apply the same fit-scale so the hero
  // also respects narrow viewports.
  const heroW = minDim * 0.58 * fitScale;
  const heroH = minDim * 0.42 * fitScale;
  cells.forEach((cell, i) => {
    let x, y, sw, sh, visible = true;
    if (i === 0) {
      sw = heroW; sh = heroH;
      x = cx - sw / 2; y = cy - sh / 2;
    } else {
      const ringIdx = Math.floor((i - 1) / slotsPerRing);
      if (ringIdx >= ringSpecs.length) {
        visible = false;
      } else {
        const spec = ringSpecs[ringIdx];
        const slotIdx = (i - 1) % slotsPerRing;
        // Stagger ring 2 + 4 by 30° so cells don't align radially with
        // ring 1 — gives the layout an organic "petals offset between
        // layers" feel instead of starburst spokes.
        const angleOffset = (ringIdx % 2 === 1) ? Math.PI / slotsPerRing : 0;
        const angle = (slotIdx / slotsPerRing) * Math.PI * 2 - Math.PI / 2 + angleOffset;
        sw = spec.size; sh = spec.size * 0.78;
        x = cx + Math.cos(angle) * spec.radius - sw / 2;
        y = cy + Math.sin(angle) * spec.radius - sh / 2;
      }
    }
    if (!visible) { cell.style.display = "none"; return; }
    Object.assign(cell.style, {
      position: "absolute",
      display: "",
      left: x + "px",
      top: y + "px",
      width: sw + "px",
      // min-height (not fixed height) so cells with less content shrink
      // to fit instead of padding empty space below the body.
      // Tall content can overflow naturally (maxHeight: none). The radial
      // centering is approximate when heights vary, but visual symmetry
      // around cy is preserved well enough for the FUI feel.
      height: "auto",
      minHeight: Math.round(sh * 0.5) + "px",
      maxHeight: "none",
      maxWidth: "none",
      // 100+ keeps cells above the connection-overlay canvas (z=50) so
      // session-thread + reflection lines pass BEHIND the cell tiles.
      zIndex: String(100 + (cells.length - i)),
    });
  });
  // Tall-enough notebook for the outer ring to fit before bottom.
  const totalH = cy + ringSpecs[ringSpecs.length - 1].radius + ringSpecs[ringSpecs.length - 1].size;
  Object.assign(root.style, {
    position: "relative",
    height: totalH + "px",
    minHeight: totalH + "px",
  });
  // Auto-scroll once on first organic load so the hero is centered in
  // the viewport.
  if (!_organicScrolled) {
    _organicScrolled = true;
    const target = Math.max(0, cy - window.innerHeight / 2);
    window.scrollTo({ top: target, behavior: "instant" });
  }
}

// Pack-hero: hero in top-left, cells flow right (along hero edge) and below.
// Simpler packing than the 4-strips approach. The hero rect is the earth-board
// (sized to its 2.4× CSS scale: 826×360). Cells fill: (1) right strip alongside
// the hero, then (2) bottom strip below the hero.
export function applyPackHeroLayout() {
  const root = document.getElementById("notebook");
  if (!root) return;
  const cells = [...root.querySelectorAll(":scope > .cell")];
  if (!cells.length) return;
  const rootRect = root.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const availH = vh - rootRect.top;
  const availW = vw;
  const gap = 10;
  // Hero in top-left at notebook origin (CSS aligns the board to dashboard
  // top-left at (0, 52) viewport — which is (0, 0) of notebook content).
  const heroW = 826;
  const heroH = 360;
  // Two regions for cells: right strip (alongside hero) and bottom strip.
  // Larger gaps from the hero on both sides so cells don't visually hug
  // the board edge.
  const rightGap = 30;
  const belowGap = 30;
  const rightX = heroW + rightGap;
  const rightW = availW - rightX - gap;
  const belowY = heroH + belowGap;
  const belowW = availW - 2 * gap;
  const belowH = availH - belowY - gap;
  const tgtW = 300, tgtH = 200;
  const place = (cell, x, y, w, h) => {
    // Clear any leftover transform from a prior Muuri/pack layout — that's
    // what was causing the "two layers" double-vision (cells positioned by
    // BOTH my inline left/top AND Muuri's translate(x,y)).
    cell.style.transform = "";
    cell.style.margin = "0";
    Object.assign(cell.style, {
      position: "absolute",
      boxSizing: "border-box",
      left: Math.round(x) + "px",
      top: Math.round(y) + "px",
      width: Math.round(w) + "px",
      height: Math.round(h) + "px",
      maxHeight: Math.round(h) + "px",
      maxWidth: "none",
      zIndex: "100",
      overflow: "hidden",
    });
  };
  // Generic row-wrap flow. Distributes a list of cells into a strip,
  // cols×rows chosen so cells stretch to fill the strip.
  const flow = (list, ox, oy, stripW, stripH, dir) => {
    if (!list.length) return;
    const n = list.length;
    let cols, rows;
    if (dir === "horizontal") {
      const maxCols = Math.max(1, Math.floor((stripW + gap) / (tgtW + gap)));
      cols = Math.min(n, maxCols);
      rows = Math.max(1, Math.ceil(n / cols));
    } else {
      const maxRows = Math.max(1, Math.floor((stripH + gap) / (tgtH + gap)));
      rows = Math.min(n, maxRows);
      cols = Math.max(1, Math.ceil(n / rows));
    }
    // Cells fill the strip in both dimensions (right-of-hero cell matches
    // the hero's height — anchor-pin parity with the hero art piece).
    const cw = Math.floor((stripW - gap * (cols - 1)) / cols);
    const ch = Math.floor((stripH - gap * (rows - 1)) / rows);
    list.forEach((c, i) => {
      const col = dir === "horizontal" ? i % cols : Math.floor(i / rows);
      const row = dir === "horizontal" ? Math.floor(i / cols) : i % rows;
      place(c, ox + col * (cw + gap), oy + row * (ch + gap), cw, ch);
    });
  };
  // Split cells: ONE single cell alongside the hero (right strip is too
  // narrow to stack two without cramping). The rest go in the bottom
  // strip (horizontal flow).
  const nRight = Math.min(1, cells.length);
  const rightCells = cells.slice(0, nRight);
  const belowCells = cells.slice(nRight);
  flow(rightCells, rightX, gap,     rightW, heroH, "vertical");
  flow(belowCells, gap,    belowY,  belowW, belowH, "horizontal");
  Object.assign(root.style, {
    position: "relative",
    height: Math.round(availH) + "px",
    minHeight: "0px",
  });
}

// Warroom: ring of cells around a reserved center where the earth situations-
// board furniture is centered + enlarged. Theme-agnostic; earth adopts it via
// its layout token. Distinct from organic (no center hero — the centerpiece is
// the holo-table, not a cell).
export function applyWarroomLayout() {
  const root = document.getElementById("notebook");
  if (!root) return;
  const cells = [...root.querySelectorAll(":scope > .cell")];
  if (!cells.length) return;
  const rootRect = root.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const margin = 28;
  // Ring center = NOTEBOOK center. The situations-board furniture sits at
  // viewport 50% (CSS-fixed) so the board appears ~headerH/2 above the ring
  // center — visually minor on a tall notebook; the board still reads as
  // the central hero.
  const cx = vw / 2 - rootRect.left;
  const cy = (vh - rootRect.top) / 2;
  // Cells: moderate width so 8 ring slots fit around a bigger board.
  const cellW = Math.min(280, vw * 0.20);
  const cellH = Math.min(200, vh * 0.26);
  // Reserve the centered holo-table — sized for the 2.4× scale of earth-board
  // (826×360 visual). Half-extents 413×180 (+ 24 padding).
  const tableHalfW = 413, tableHalfH = 180, gap = 24;
  const availHalfW = vw / 2 - margin;
  const availHalfH = (vh - rootRect.top) / 2 - margin;
  const rx = Math.max(availHalfW - cellW / 2, tableHalfW + cellW / 2 + gap);
  let ry = Math.max(availHalfH - cellH / 2, tableHalfH + cellH / 2 + gap);
  // Asymmetric clamp: the ring is centered on viewport-center (cy), but the
  // notebook starts BELOW the HUD strip, so the space available above cy is
  // smaller than the space below cy. Clamp ry so the topmost cell at angle
  // -π/2 stays >= margin below the HUD bottom in viewport coords.
  const topClearance = cy - cellH / 2 - margin;
  const botClearance = (vh - rootRect.top) - cy - cellH / 2 - margin;
  const ryMax = Math.min(topClearance, botClearance);
  if (ryMax > 0) ry = Math.min(ry, ryMax);
  // Adjacent-cell-overlap constraint: at angular step Δθ, the vertical spacing
  // between same-side cells is |sin(θ₁) − sin(θ₂)|·ry ≤ ry (worst case). If
  // cellH > ry, those adjacent cells overlap. Follow ry down: shrink cellH so
  // the ring stays geometrically valid. Floor at 140 so substrates remain
  // readable.
  const cellHFit = Math.max(140, Math.min(cellH, Math.round(ry)));
  const n = cells.length;
  // Perimeter slots: 8 ring positions (4 corners first, then 4 edge mid-points).
  const RING_ANGLES = [
    -3 * Math.PI / 4,  -Math.PI / 4,  Math.PI / 4,  3 * Math.PI / 4,  // 4 corners
    -Math.PI / 2,  0,  Math.PI / 2,  Math.PI,                          // 4 edges
  ];
  cells.forEach((cell, i) => {
    const angle = RING_ANGLES[i % RING_ANGLES.length];
    const x = cx + Math.cos(angle) * rx - cellW / 2;
    const y = cy + Math.sin(angle) * ry - cellHFit / 2;
    Object.assign(cell.style, {
      position: "absolute",
      display: "",
      left: Math.round(x) + "px",
      top: Math.round(y) + "px",
      width: Math.round(cellW) + "px",
      // Cap at the slot height so a tall cell stays centered on its ring point
      // (grows from y by at most cellHFit → never overruns into the centered
      // table OR into the adjacent ring slot).
      height: "auto",
      minHeight: Math.round(cellHFit * 0.6) + "px",
      maxHeight: Math.round(cellHFit) + "px",
      maxWidth: "none",
      zIndex: String(100 + (n - i)),
    });
  });
  // No scroll: the notebook exactly fills the field below the HUD so the ring
  // stays put around the fixed centered table.
  Object.assign(root.style, {
    position: "relative",
    height: Math.round(vh - rootRect.top) + "px",
    minHeight: "0px",
  });
}

// ----------------------------------------------------------------
// Corners layout — drift/Free Navy: 3 cells pinned to the corners
// (TL/TR/BL), central viewport-bottom-half reserved for the live
// orbital tactical plot (in #theme-furniture). Mirrors warroom's
// shape (cap-limited, absolute-positioned, root height clamped).
// Composition reference: refs/belter/bel_pPutN_076 (orbital
// dominates middle, thin chrome rides the corners).
// ----------------------------------------------------------------
export function applyCornersLayout() {
  const root = document.getElementById("notebook");
  if (!root) return;
  const cells = [...root.querySelectorAll(":scope > .cell")];
  if (!cells.length) return;
  const rootRect = root.getBoundingClientRect();
  // clientWidth excludes the scrollbar (innerWidth includes it). Using
  // innerWidth caused a horizontal scrollbar on themes where any content
  // overflowed vertically — corner cells then extended past the usable area.
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;
  // Asymmetric margins — the right edge needs more breathing room than
  // the left.
  const marginL = 24, marginR = 56, marginY = 24;
  const baseW = Math.min(360, Math.max(270, vw * 0.21));
  const baseH = Math.min(240, Math.max(180, vh * 0.22));
  const availH = vh - rootRect.top;
  // Per-slot asymmetric multipliers — eclectic-salvage signal (refs/belter
  // NOTES: "panels bolted at different registers"). Top-left shorter, top-
  // right substantially wider, bottom-left taller. 3-cell layout — the BR
  // slot ceded to the mesh widget.
  // Reverse-chrono render = cells[0] is NEWEST → lands TL.
  const SLOT_SCALE = [
    { wMul: 1.00, hMul: 0.74 },  // TL — shorter
    { wMul: 1.50, hMul: 1.00 },  // TR — much wider
    { wMul: 1.00, hMul: 1.20 },  // BL — taller (was BR's hMul; BR is gone)
  ];
  const dims = SLOT_SCALE.map((s) => ({
    w: Math.round(baseW * s.wMul),
    h: Math.round(baseH * s.hMul),
  }));
  // Reserve vertical space for the bottom chrome strip + clearance gap
  // (CSS: strip bottom:14 + height:28 = 42, + ~38 visual gap = 80).
  const BOTTOM_STRIP_RESERVE = 80;
  const bottomY = availH - BOTTOM_STRIP_RESERVE;
  const slots = [
    { x: marginL,                      y: marginY },                            // TL
    { x: vw - dims[1].w - marginR,     y: marginY },                            // TR
    { x: marginL,                      y: bottomY - dims[2].h },                // BL
  ];
  cells.forEach((cell, i) => {
    if (i >= slots.length) {
      cell.style.display = "none";
      return;
    }
    const s = slots[i], d = dims[i];
    Object.assign(cell.style, {
      position: "absolute",
      display: "",
      left: Math.round(s.x) + "px",
      top: Math.round(s.y) + "px",
      width: d.w + "px",
      // FIXED height — height:auto + content updates made the cells (and the
      // band positions tracking them via getBoundingClientRect) shift on every
      // mint. Stable height keeps the chrome bands pinned.
      height: d.h + "px",
      maxHeight: d.h + "px",
      maxWidth: "none",
      zIndex: String(100 + (cells.length - i)),
    });
  });
  Object.assign(root.style, {
    position: "relative",
    height: Math.round(availH) + "px",
    minHeight: "0px",
  });
  // Hero band bounds — sits between the TL and TR cells in viewport coords
  // (the .drift-hero element is position:fixed in #theme-furniture).
  const tlRight = marginL + dims[0].w;
  const trLeft = vw - dims[1].w - marginR;
  // Extra breathing room on the left so the band sits cleanly off TL.
  const heroLeft = tlRight + 56;
  const heroRight = vw - trLeft + 32;     // CSS uses `right:` from the right edge
  const heroTop = (rootRect.top + marginY);
  const heroHeight = Math.max(dims[0].h, 96);
  const cs = document.documentElement.style;
  cs.setProperty("--drift-hero-left",   heroLeft + "px");
  cs.setProperty("--drift-hero-right",  heroRight + "px");
  cs.setProperty("--drift-hero-top",    heroTop + "px");
  cs.setProperty("--drift-hero-height", heroHeight + "px");
  // Edge-band + button-grid positioning. Bands hug ACTUAL cell rect edges
  // (not the maxHeight bounds). Reading getBoundingClientRect after the
  // style assignments gives the live rect.
  const fur = document.getElementById("theme-furniture");
  if (fur && fur.dataset.theme === "drift") {
    const tlR = cells[0]?.getBoundingClientRect();
    const trR = cells[1]?.getBoundingClientRect();
    const blR = cells[2]?.getBoundingClientRect();
    const tl = fur.querySelector(".drift-edge-tl-bot");
    if (tl && tlR) {
      // Band top FLUSH with TL bottom edge.
      tl.style.left = tlR.left + "px";
      tl.style.width = tlR.width + "px";
      tl.style.top = tlR.bottom + "px";
    }
    const blTop = fur.querySelector(".drift-edge-bl-top");
    if (blTop && blR) {
      // Band bottom FLUSH with BL top edge.
      blTop.style.left = blR.left + "px";
      blTop.style.width = blR.width + "px";
      blTop.style.top = (blR.top - 16) + "px";
    }
    const bg = fur.querySelector(".drift-buttongrid-tr");
    if (bg && trR) {
      // Always hangs CLEARLY below the TR cell.
      bg.style.left = trR.left + "px";
      bg.style.width = trR.width + "px";
      bg.style.right = "auto";
      bg.style.top = (trR.bottom + 38) + "px";
    }
  }
}

// ----------------------------------------------------------------
// Scatter v0: each cell drops at a pseudo-random position in the
// viewport (deterministic hash from cell id so positions are stable
// across renders). Cells overlap; newest cell gets highest z-index
// so it sits on top. Like a desktop-windows pile or a corkboard.
// ----------------------------------------------------------------
function _hashCellId(s) {
  // Simple FNV-ish hash returning a 32-bit unsigned int.
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function applyScatterLayout() {
  const root = document.getElementById("notebook");
  const cells = [...root.querySelectorAll(":scope > .cell")];
  if (!cells.length) return;
  const headerH = 80;
  const w = window.innerWidth - 32;
  const h = window.innerHeight - headerH - 16;
  if (w <= 0 || h <= 0) return;
  // Cell size: bigger for hero, slightly smaller for ambient.
  const heroW = Math.min(w * 0.42, 640);
  const heroH = Math.min(h * 0.50, 380);
  const cellW = Math.min(w * 0.30, 460);
  const cellH = Math.min(h * 0.36, 280);
  // Slot-grid distribution so cells use the negative space across the
  // viewport instead of clustering center.
  const cols = 4;
  const rows = Math.max(2, Math.ceil(cells.length / cols));
  const colW = w / cols;
  const rowH = h / rows;
  // Sort cells by stable hash for deterministic slot assignment.
  const ordered = cells
    .map((cell, i) => ({ cell, i, hash: _hashCellId(cell.id || `i${i}`) }))
    .sort((a, b) => a.hash - b.hash);
  const slotCenter = new Map();
  ordered.forEach((item, slotIdx) => {
    const col = slotIdx % cols;
    const row = Math.floor(slotIdx / cols) % rows;
    const cx = col * colW + colW / 2;
    const cy = row * rowH + rowH / 2;
    const jx = (item.hash % 51) - 25;
    const jy = ((item.hash >>> 8) % 51) - 25;
    slotCenter.set(item.i, { cx: cx + jx, cy: cy + jy });
  });
  const positions = cells.map((cell, i) => {
    const sw = i === 0 ? heroW : cellW;
    const sh = i === 0 ? heroH : cellH;
    const c = slotCenter.get(i);
    let x = c.cx - sw / 2;
    let y = c.cy - sh / 2;
    // Clamp inside viewport so corner slots don't push tiles off-edge.
    x = Math.max(20, Math.min(w - sw - 20, x));
    y = Math.max(20, Math.min(h - sh - 20, y));
    return { x, y, sw, sh };
  });
  // Newest cell (i=0) lands over the oldest visible (last in DOM order)
  // with small jitter — covers the least-important tile.
  if (cells.length >= 2) {
    const oldestPos = positions[positions.length - 1];
    const newestId = cells[0].id || "i0";
    const jx = (_hashCellId(newestId + ":jx") % 41) - 20;
    const jy = (_hashCellId(newestId + ":jy") % 41) - 20;
    const sw = positions[0].sw;
    const sh = positions[0].sh;
    let nx = oldestPos.x + (oldestPos.sw - sw) / 2 + jx;
    let ny = oldestPos.y + (oldestPos.sh - sh) / 2 + jy;
    nx = Math.max(20, Math.min(w - sw - 20, nx));
    ny = Math.max(20, Math.min(h - sh - 20, ny));
    positions[0] = { x: nx, y: ny, sw, sh };
  }
  cells.forEach((cell, i) => {
    const { x, y, sw, sh } = positions[i];
    Object.assign(cell.style, {
      position: "absolute",
      display: "",
      left: x + "px",
      top: y + "px",
      width: sw + "px",
      // Same height treatment as organic — natural content height with a
      // minHeight floor so cells with little content don't pad empty space.
      height: "auto",
      minHeight: Math.round(sh * 0.5) + "px",
      maxHeight: "none",
      maxWidth: "none",
      // Above the connection-overlay (z=50) so session-thread lines pass
      // BEHIND each cell.
      zIndex: String(100 + (cells.length - i)),
    });
  });
  Object.assign(root.style, {
    position: "relative",
    height: h + "px",
    minHeight: h + "px",
  });
}
