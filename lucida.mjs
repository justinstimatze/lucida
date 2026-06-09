// lucida.mjs — extracted from index.html on 2026-05-31.
// Was previously inlined as <script type="module">…</script>.
// Loading mechanics unchanged: still deferred, still module scope.
// Cache version managed at index.html's <script src="lucida.mjs?v=N">.

// Pinned to 10.9.6 explicitly — the npm advisory range fixed in this
// patch covers classDef CSS injection (GHSA-xcj9-5m2h-648r), state
// diagram HTML injection (GHSA-ghcm-xqfw-q4vr), Gantt infinite-loop
// DoS, and the transitive uuid<11.1.1 bounds check. ES module imports
// can't carry SRI integrity attributes, so pinning the exact version
// is the only supply-chain handle here.
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10.9.6/dist/mermaid.esm.min.mjs";
// Expose mermaid globally so the mixed3d tier-1 snapshot pipeline (#142)
// can render cell.spec → SVG → canvas-texture for tower-face textures.
window.mermaid = mermaid;

// scene3d substrate. Three exports: the kind-switch factory, the holo-ring
// mesh builder (used by mixed3d war-room), and the standalone cell renderer
// (used by the scene3d cell substrate). resolveColor is passed through at
// each call so the module stays free of palette-global coupling. Cache key
// pinned via ?v= — bump alongside `lucida.mjs?v=` in index.html when this
// file changes (see [[dev_cache_discipline]]).
import { initScene3D } from "./scene3d.mjs?v=2";
import { _buildFurnitureDrift, _updateDriftOrbital, _updateDriftHero } from "./theme-drift.mjs?v=2";
import { _buildFurnitureMarsBlue, _updateMarsBlueHisto } from "./theme-mars-blue.mjs?v=1";
import { _buildFurnitureEarth, _updateEarthTactical, _earthAmbientStart } from "./theme-earth.mjs?v=1";
import {
  applyOrganicLayout, applyPackHeroLayout, applyWarroomLayout,
  applyCornersLayout, applyScatterLayout,
} from "./layouts.mjs?v=1";
import {
  _buildTransientConclave, _buildTransientGastown, _buildTransientLab,
  _buildTransientVigil, _buildTransientOps, _buildTransientNoir,
  _buildTransientTerminus, _buildTransientCircuit, _buildTransientMainframe,
  _buildTransientRenegade, _buildTransientMinimal, _buildTransientGeneric,
  _buildTransientDrift, _buildTransientMarsBlue, _buildTransientEarth,
  _transientThemeName,
} from "./theme-transients.mjs?v=1";
import { pauseOffScreen, setupAutoPan } from "./viewport.mjs?v=1";
import {
  applyMixed3DLayout, teardownMixed3DLayout, _mixed3dDrawCellPreview,
} from "./mixed3d.mjs?v=5";

// Full-stack theme config: chrome lives in CSS (notebook.css), but
// mermaid + vega + scene3d content also need theme-aware colors.
// Active theme is set by the inline head script -> window.__LUCIDA_THEME.
const ACTIVE = window.__LUCIDA_THEME || "lab";

// LOG shim: log levels for browser console.  console.log is noisy in
// production (boot diagnostics, snap-driver lifecycle, mixed3d state
// changes); gate it behind `?debug=1` so a normal user's console stays
// quiet.  warn/error always fire — those are genuine user-visible
// problems.  Audit-flagged: 19 console.log calls used to ship
// unconditionally; this is the centralized hook to gate them.
const _LOG_DEBUG = (() => {
  try { return new URLSearchParams(window.location.search).has("debug"); }
  catch (e) { return false; }
})();
export const LOG = {
  debug: _LOG_DEBUG ? console.log.bind(console)  : () => {},
  info:  _LOG_DEBUG ? console.info.bind(console) : () => {},
  warn:  console.warn.bind(console),
  error: console.error.bind(console),
};

// Centralized mutable state. Pre-2026-04-28 the renderer had ~15
// disconnected `let` variables scattered through the module —
// state.rendering.renderedIds / state.hud.lastTyped / state.conn.renderer / state.hud.killHistory etc.
// Made "what is currently rendered?" hard to answer and led to
// observer-leak bugs where scrolled-out cells never disconnected
// their IntersectionObservers. This object is the single source of
// mutable state; every subsystem reads/writes named paths.
//
// Per memory/feedback_layout_density_validated.md don't drift back
// into module-scope let leakage on future feature work — add to
// state, don't sprinkle.
export const state = {
  // Multi-stream arc step 2: ?session=<id1>,<id2>,... filter. Multi-
  // select via comma-separated list. Empty / no param = unscoped (show
  // every cell, intuitive default). The literal "untagged" is a pseudo-
  // session matching cells without a session_id field. Set is
  // mutable at runtime via the HUD dropdown.
  sessions: {
    // Multi-stream arc step 4: ?session=auto is a sentinel meaning "every
    // distinct session_id in cells.json should be a column". active is left
    // empty at parse time; load() populates it from the data, and
    // liveAppendNewCells() grows it when a fresh cell arrives with a new
    // session_id. The URL stays `?session=auto` so the share link doesn't
    // freeze a snapshot of session ids.
    active: (() => {
      try {
        const v = new URLSearchParams(window.location.search).get("session");
        if (!v || v.trim() === "auto") return new Set();
        return new Set(v.split(",").map(s => s.trim()).filter(Boolean));
      } catch (e) { return new Set(); }
    })(),
    // Default to multi-stream auto-discovery — most users want to see
    // every active session out of the box, then narrow down via the
    // SESSION dropdown if they want to focus. No-param, empty-string,
    // and explicit ?session=auto all resolve to autoMode=true.
    autoMode: (() => {
      try {
        const v = new URLSearchParams(window.location.search).get("session");
        return v == null || v.trim() === "" || v.trim() === "auto";
      } catch (e) { return true; }
    })(),
  },
  rendering: {
    renderedIds: new Set(),       // cells already mounted in the notebook
    overflowPending: false,       // overflow-check rAF throttle
    cellsBarKey: null,            // memo key for HUD substrate-bar repaint
    cellsById: null,              // id → cell map for predecessor lookup (Task #79)
  },
  hud: {
    lastTyped: new Map(),         // typeInto cache (suppress re-animation)
    lastSeenMint: null,           // most-recent cell_id surfaced in HUD recent ticker
    lastMintTs: null,             // for the live seconds-since-last counter
    killHistory: new Map(),       // kill-slot data-state history → bloom triggers
    cachedAudit: undefined,       // undefined = not attempted; null = none found; obj = result
  },
  webgl: {
    registry: [],                 // active scene3d contexts (LRU eviction)
  },
  conn: {
    renderer: null, scene: null, camera: null,  // Three.js connection-overlay
    lines: [],                    // current line meshes (re-disposed each redraw)
    animating: false,             // continuous-pulse rAF running flag
    startTime: 0,                 // animation epoch
    rafPending: false,            // redraw rAF throttle
  },
};
// Debug expose — dev-only probe path so closures aren't opaque
// when investigating cellsById coverage from the browser console.
if (typeof window !== "undefined") window._debugState = state;
function matchesActiveSession(cell) {
  if (state.sessions.active.size === 0) return true;
  if (state.sessions.active.has("untagged") && !cell.session_id) return true;
  return state.sessions.active.has(cell.session_id);
}
// True when classifier picked a substrate but the specialist never produced
// content. ingest writes spec/html/image as Python None which JSON-serializes
// to the string "None" (legacy) or null/empty. These cells render as
// classifier-reasoning prose blocks and dominate layouts that aren't aware of
// them — see 2026-05-19 audit: 50% of cells.json was in this state. Filtering
// them out is non-destructive; cells.json keeps them in case a retrigger
// backfills.
function isAwaitingMint(cell) {
  if (cell.cell_type === "text") return false;  // text cells legitimately render from caption
  if (cell.cell_type === "image") return !cell.image_path || cell.image_path === "None";
  const noSpec = !cell.spec || cell.spec === "None";
  const noHtml = !cell.html || cell.html === "None";
  return noSpec && noHtml;
}
// Persist the current filter to the URL so the view is shareable from
// inside a Claude Code session without the user typing a query string.
function syncSessionFilterToURL() {
  const url = new URL(window.location.href);
  if (state.sessions.autoMode) {
    url.searchParams.set("session", "auto");
  } else if (state.sessions.active.size === 0) {
    url.searchParams.delete("session");
  } else {
    url.searchParams.set("session", [...state.sessions.active].join(","));
  }
  window.history.replaceState(null, "", url.toString());
}

// Re-render the notebook from cells.json under the current filter.
// Called after a session-filter toggle. Clears the existing notebook
// + render-id baseline so the next pass treats every visible cell as
// fresh; live-append continues from there.
async function rerenderNotebook() {
  disconnectAllCellObservers();
  document.getElementById("notebook").innerHTML = "";
  state.rendering.renderedIds.clear();
  await load();
  loadHud().catch(() => {});
  scheduleRedrawConnections();
}

// Walk the notebook DOM and disconnect every per-element observer
// stashed by pauseOffScreen / lazyMount. Without this, rerenders
// leave behind live IntersectionObservers that keep firing into
// torn-down state. Per audit 2026-04-28.
function disconnectAllCellObservers() {
  document.querySelectorAll("#notebook *").forEach(el => {
    if (el._pauseObserver) { el._pauseObserver.disconnect(); el._pauseObserver = null; }
    if (el._lazyObserver)  { el._lazyObserver.disconnect();  el._lazyObserver = null; }
  });
}

// Build the session-filter dropdown contents. Reads unique session_id
// values from cells.json (plus an "untagged" pseudo-session for cells
// missing the field) and renders a checkbox list. Each toggle updates
// state.sessions.active, syncs the URL, and re-renders the notebook.
function buildSessionDropdown(cellsData) {
  const dropdown = document.getElementById("session-dropdown");
  if (!dropdown) return;
  const cells = (cellsData && cellsData.cells) || [];
  const sessionCounts = new Map();
  let untaggedCount = 0;
  for (const c of cells) {
    if (c.replaced_by) continue;
    if (c.session_id) {
      sessionCounts.set(c.session_id, (sessionCounts.get(c.session_id) || 0) + 1);
    } else {
      untaggedCount++;
    }
  }
  const entries = [...sessionCounts.entries()].sort((a, b) => b[1] - a[1]);
  if (untaggedCount > 0) entries.push(["untagged", untaggedCount]);

  const header = `
    <div class="session-dropdown-header">
      <span>FILTER BY SESSION</span>
      <button type="button" class="session-dropdown-clear">show all</button>
    </div>
  `;
  const rows = entries.map(([sid, count]) => {
    const checked = state.sessions.active.has(sid) ? "checked" : "";
    const safeId = sid.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `
      <label class="session-dropdown-row">
        <input type="checkbox" data-session="${sid}" id="sess-cb-${safeId}" ${checked}>
        <span class="session-dropdown-id">${sid}</span>
        <span class="session-dropdown-count">${count}</span>
      </label>
    `;
  }).join("");
  dropdown.innerHTML = header + (rows || '<div class="session-dropdown-empty">no sessions yet</div>');

  dropdown.querySelector(".session-dropdown-clear")?.addEventListener("click", () => {
    state.sessions.active.clear();
    syncSessionFilterToURL();
    buildSessionDropdown(cellsData);
    rerenderNotebook();
  });
  dropdown.querySelectorAll('input[type="checkbox"][data-session]').forEach(cb => {
    cb.addEventListener("change", () => {
      const sid = cb.dataset.session;
      if (cb.checked) state.sessions.active.add(sid);
      else state.sessions.active.delete(sid);
      syncSessionFilterToURL();
      rerenderNotebook();
    });
  });
}

// Wire the LAYOUT HUD slot. Mirrors the session dropdown shape but
// with a fixed list of layout choices (grid / treemap / organic /
// scatter). Selecting a layout updates ?layout=<v> in the URL and
// reloads — applying live without reload would require resetting
// every cell's inline style, which the existing layout funcs don't
// do, so a reload keeps it simple. Visually the same `.session-
// dropdown` styles apply to the chip + popover.
function buildLayoutDropdown() {
  const dropdown = document.getElementById("layout-dropdown");
  if (!dropdown) return;
  const current = getLayoutMode();
  // Read from LAYOUT_REGISTRY so adding a new layout there auto-shows
  // it in the dropdown without touching this function.
  const options = Object.values(LAYOUT_REGISTRY);
  const rows = options.map(o => `
    <button type="button" role="option" class="session-dropdown-row layout-dropdown-row"
            data-layout="${o.id}"
            aria-selected="${o.id === current ? 'true' : 'false'}"
            ${o.id === current ? 'aria-current="true"' : ""}>
      <span class="session-dropdown-id">${o.label}</span>
      <span class="session-dropdown-count">${o.description}</span>
    </button>
  `).join("");
  dropdown.innerHTML = `
    <div class="session-dropdown-header">
      <span>LAYOUT</span>
    </div>
    <div role="listbox" aria-label="Layout">${rows}</div>
  `;
  dropdown.querySelectorAll(".layout-dropdown-row").forEach(btn => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.layout;
      const url = new URL(window.location.href);
      // pack is the default — strip the param when picking it so the
      // URL stays clean. Other modes get an explicit ?layout=<id>.
      if (v === "pack") url.searchParams.delete("layout");
      else url.searchParams.set("layout", v);
      window.location.replace(url.toString());
    });
  });
}
// THEME_REGISTRY is the single source of truth for themes, defined in the
// head <script> block so the bootstrap can derive its URL/cookie allowlist
// from it AND every per-theme switch (HUD labels, furniture, transient
// builders) reads from the same place. Adding a theme means: add one
// registry entry + one themes/<id>.tokens.json file. (The handful of
// builder functions referenced as strings — furniture / transient — still
// need their function declarations in this module, mapped at the dispatch
// site via FURNITURE_BUILDERS / TRANSIENT_BUILDERS.)
const THEME_REGISTRY = window.THEME_REGISTRY;

function buildThemeDropdown() {
  const dropdown = document.getElementById("theme-dropdown");
  if (!dropdown) return;
  const current = ACTIVE;
  const options = Object.values(THEME_REGISTRY);
  const rows = options.map(o => `
    <button type="button" role="option" class="session-dropdown-row theme-dropdown-row"
            data-theme="${o.id}"
            aria-selected="${o.id === current ? 'true' : 'false'}"
            ${o.id === current ? 'aria-current="true"' : ""}>
      <span class="session-dropdown-id">${o.label}</span>
      <span class="session-dropdown-count">${o.description}</span>
    </button>
  `).join("");
  dropdown.innerHTML = `
    <div class="session-dropdown-header">
      <span>THEME</span>
    </div>
    <div role="listbox" aria-label="Theme">${rows}</div>
  `;
  dropdown.querySelectorAll(".theme-dropdown-row").forEach(btn => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.theme;
      if (v === ACTIVE) return;
      // Write the cookie too so a subsequent visit without ?theme= still
      // honors the choice — matches the head bootstrap's cookie-or-URL
      // resolution order.
      document.cookie = `lucida_theme=${v}; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`;
      const url = new URL(window.location.href);
      url.searchParams.set("theme", v);
      // Strip ?layout= so the new theme's preferred layout token
      // (themes/<name>.tokens.json → layout) applies via
      // applyTokenLayout at boot. Without this, an explicit ?layout=
      // pinned by start_session.sh or a previous LAYOUT-dropdown pick
      // would survive the theme switch and the new theme's canonical
      // layout (e.g., terminus → terminal, mainframe → organic) never
      // takes effect. Per task #102. If a user truly wants a layout
      // locked across theme changes, they can re-pick it via the
      // LAYOUT dropdown after switching theme.
      url.searchParams.delete("layout");
      window.location.replace(url.toString());
    });
  });
}
function initThemeDropdownTrigger() {
  const trigger = document.getElementById("hud-theme-cell");
  const dropdown = document.getElementById("theme-dropdown");
  if (!trigger || !dropdown) return;
  const valEl = document.getElementById("hud-theme-val");
  if (valEl) valEl.textContent = (THEME_REGISTRY[ACTIVE]?.label || ACTIVE.toUpperCase());
  const open = () => {
    buildThemeDropdown();
    dropdown.hidden = false;
    const r = trigger.getBoundingClientRect();
    dropdown.style.top = (r.bottom + 4) + "px";
    dropdown.style.left = r.left + "px";
  };
  const close = () => { dropdown.hidden = true; };
  const toggle = () => { dropdown.hidden ? open() : close(); };
  trigger.addEventListener("click", toggle);
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
  });
  document.addEventListener("click", (e) => {
    if (dropdown.hidden) return;
    if (!dropdown.contains(e.target) && !trigger.contains(e.target)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !dropdown.hidden) close();
  });
}

function initLayoutDropdownTrigger() {
  const trigger = document.getElementById("hud-layout-cell");
  const dropdown = document.getElementById("layout-dropdown");
  if (!trigger || !dropdown) return;
  // Reflect the current mode on the chip on load. Route through the
  // per-theme value transform so layouts like `cockpit` render as faction-
  // native words (e.g. `HELM` under MCRN) instead of the engine id.
  const valEl = document.getElementById("hud-layout-val");
  if (valEl) {
    const raw = getLayoutMode().toUpperCase();
    const xf = _HUD_VALUE_TRANSFORMS["hud-layout-val"];
    valEl.textContent = xf ? xf(raw) : raw;
    _hudChipMaybeHide("hud-layout-val", valEl.textContent);
  }
  const open = () => {
    buildLayoutDropdown();
    dropdown.hidden = false;
    const r = trigger.getBoundingClientRect();
    dropdown.style.top = (r.bottom + 4) + "px";
    dropdown.style.left = r.left + "px";
  };
  const close = () => { dropdown.hidden = true; };
  const toggle = () => { dropdown.hidden ? open() : close(); };
  trigger.addEventListener("click", toggle);
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
  });
  document.addEventListener("click", (e) => {
    if (dropdown.hidden) return;
    if (!dropdown.contains(e.target) && !trigger.contains(e.target)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !dropdown.hidden) close();
  });
}

// Wire the SESSION HUD slot to toggle the dropdown. Click outside or
// ESC dismisses. Per memory/feedback_glanceable_no_clicks.md the
// dropdown is power-user-config (clicked once to scope), not a
// default-path interaction; the empty default keeps the glanceable
// principle intact.
function initSessionDropdownTrigger() {
  const trigger = document.getElementById("hud-session-cell");
  const dropdown = document.getElementById("session-dropdown");
  if (!trigger || !dropdown) return;

  const open = async () => {
    const cellsData = await fetchJSON("cells.json");
    buildSessionDropdown(cellsData);
    dropdown.hidden = false;
    const r = trigger.getBoundingClientRect();
    dropdown.style.top = (r.bottom + 4) + "px";
    dropdown.style.left = r.left + "px";
  };
  const close = () => { dropdown.hidden = true; };
  const toggle = () => { dropdown.hidden ? open() : close(); };

  trigger.addEventListener("click", toggle);
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
  });
  document.addEventListener("click", (e) => {
    if (dropdown.hidden) return;
    if (!dropdown.contains(e.target) && !trigger.contains(e.target)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !dropdown.hidden) close();
  });
}

// Theme tokens (themes/<name>.tokens.json) are the single source of truth
// for cross-substrate theming: mermaid themeVariables, vega config (axis
// colors, range categories), animated_svg $X palette substitution, and the
// new --data-cat-N CSS vars all derive from one JSON file per theme.
// Pre-2026-04-29 each substrate had its own hand-mapped literals so themes
// drifted (vega range had off-brand colors that didn't match mermaid edges).
// See design-references.md "Theme strategy" + memory/visual_consistency_
// theming_pass.md for the why.
async function loadTokens(themeName) {
  // cache:"no-store" + a per-load timestamp query bust both the
  // browser cache and any intermediate proxy. We were seeing stale
  // tokens.json served via "hard reload" (which only bypasses cache
  // for the main document, not for fetches inside JS) — the tokens
  // are tiny (~1KB), so refetching every load is fine.
  const bust = `?_t=${Date.now()}`;
  try {
    const r = await fetch(`themes/${themeName}.tokens.json${bust}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    console.warn(`[lucida] failed to load themes/${themeName}.tokens.json: ${e}; falling back to lab`);
    if (themeName === "lab") throw e;  // can't fall back further
    const r = await fetch(`themes/lab.tokens.json${bust}`, { cache: "no-store" });
    return await r.json();
  }
}

function buildThemeConfig(t) {
  // mermaid: built-in themes (dark/neutral) skip themeVariables; otherwise
  // we derive themeVariables from accent/surface/text/type tokens so the
  // mermaid edges/nodes/text track the same accent values used elsewhere.
  const mermaidConf = t.mermaid_builtin
    ? { theme: t.mermaid_builtin }
    : {
        theme: "base",
        themeVariables: {
          background: t.surface.bg,
          primaryColor: t.surface.cell,
          primaryTextColor: t.text.fg,
          primaryBorderColor: t.accent.primary,
          secondaryColor: t.surface.cell,
          tertiaryColor: t.surface.cell,
          mainBkg: t.surface.cell,
          lineColor: t.accent.secondary,
          textColor: t.text.fg,
          secondaryTextColor: t.text.fg,
          tertiaryTextColor: t.text.fg,
          // Edge-label backplates (the rect behind "produces", "consumed by",
          // etc on edges) defaulted to a near-white that inverted the
          // light-on-dark contrast on every dark theme. User flagged
          // 2026-04-29 ("the mermaid text backplates are still bad").
          // Match the cell-bg so labels render light-on-cell-bg, same as
          // node text. labelBoxBkgColor + edgeLabelBackground both apply
          // depending on diagram type (flowchart vs sequence).
          edgeLabelBackground: t.surface.cell,
          labelBoxBkgColor: t.surface.cell,
          actorBkg: t.surface.cell,
          actorTextColor: t.text.fg,
          actorLineColor: t.accent.primary,
          noteBkgColor: t.surface.cell,
          noteTextColor: t.text.fg,
          noteBorderColor: t.accent.primary,
          // fontFamily here governs mermaid's text-width measurement when
          // sizing edge-label backing rects. Must match the render-time CSS
          // font or wider chars overflow the pre-measured rect.
          fontFamily: t.type.mono || t.type.body,
        },
      };

  return {
    mermaid: mermaidConf,
    vega: {
      config: {
        background: "transparent",
        title: { color: t.text.fg, font: t.type.head || t.type.body },
        axis: {
          domainColor: t.surface.muted, labelColor: t.text.fg,
          tickColor: t.surface.muted, gridColor: t.surface.line,
          titleColor: t.text.fg,
          labelFont: t.type.body, titleFont: t.type.body,
          // Long category labels (e.g., "cinematic family (Powers-of-Ten +
          // match-cut)") were eating most of the plot in 380-500px cells
          // because the vega specialist had been setting labelLimit: 300.
          // Theme-level ceiling at 160px clamps the baseline; per-spec
          // overrides still win, so the specialist prompt also tells the
          // model not to override (specialists.py VEGA_SYSTEM constraint).
          labelLimit: 160, labelOverlap: true,
        },
        legend: { labelColor: t.text.fg, titleColor: t.text.fg },
        range: { category: t.data.cat },
      },
    },
    palette: t.palette,
  };
}

// Apply selected token values to :root as CSS custom properties so HTML
// cells / vega cell wrappers / connection-overlay can read them. The
// existing chrome vars (--bg, --accent, --fg, etc.) are still set by
// notebook.css per .theme-<name> class — token vars layer additional
// roles on top (--data-cat-N, --accent-secondary, --accent-warning, etc.)
// and could fully replace the CSS chrome blocks in a follow-up pass.
function applyTokensToCSSVars(t) {
  const root = document.documentElement;
  (t.data?.cat || []).forEach((c, i) => {
    root.style.setProperty(`--data-cat-${i}`, c);
  });
  root.style.setProperty("--accent-primary",   t.accent.primary);
  root.style.setProperty("--accent-secondary", t.accent.secondary);
  root.style.setProperty("--accent-warning",   t.accent.warning);
  root.style.setProperty("--accent-danger",    t.accent.danger);
  root.style.setProperty("--accent-ok",        t.accent.ok);
  // Surface + text tokens — collapse a multi-path drift trap (2026-06-07):
  // notebook.css used to declare its own `.theme-X { --bg/--cell-bg/--accent/... }`
  // block PER theme that quietly diverged from tokens.json `surface.*` / `text.*` /
  // `palette.*`. Two surfaces for one canonical value = unreliable edits (changing
  // tokens.surface.cell had ZERO effect because the CSS block won via cascade).
  // Set the same vars on documentElement.style here — element-style beats per-
  // theme selector specificity, so tokens.json wins. Per-theme CSS blocks may
  // stay as fallback for safe rollback; they no-op when tokens cover the field.
  // Calque axis "token-vs-cssvar-drift" should still catch *future* drift between
  // these vars and any leftover per-theme block. Mapping:
  //   tokens.surface.bg     → --bg
  //   tokens.surface.cell   → --cell-bg
  //   tokens.surface.header → --header-bg
  //   tokens.surface.code   → --code-bg
  //   tokens.surface.muted  → --muted   (legacy alias for the muted-text color)
  //   tokens.surface.line   → --line
  //   tokens.text.fg        → --fg
  //   tokens.accent.primary → --accent  (legacy alias — --accent-primary already set above)
  if (t.surface) {
    if (t.surface.bg)     root.style.setProperty("--bg",        t.surface.bg);
    if (t.surface.cell)   root.style.setProperty("--cell-bg",   t.surface.cell);
    if (t.surface.header) root.style.setProperty("--header-bg", t.surface.header);
    if (t.surface.code)   root.style.setProperty("--code-bg",   t.surface.code);
    if (t.surface.muted)  root.style.setProperty("--muted",     t.surface.muted);
    if (t.surface.line)   root.style.setProperty("--line",      t.surface.line);
  }
  if (t.text?.fg)       root.style.setProperty("--fg",      t.text.fg);
  if (t.accent?.primary) root.style.setProperty("--accent", t.accent.primary);
  // Type tokens — exposed as CSS vars so chrome (dropdowns, popovers,
  // captions) can pick the active theme's font without depending on
  // DOM-tree inheritance. Pre-2026-04-30 dropdowns inherited from
  // .hud's explicit monospace, so they didn't track lcars/gastown
  // condensed/serif body fonts.
  if (t.type) {
    if (t.type.body) root.style.setProperty("--type-body", t.type.body);
    if (t.type.head) root.style.setProperty("--type-head", t.type.head);
    if (t.type.mono) root.style.setProperty("--type-mono", t.type.mono);
  }
}

const TOKENS = await loadTokens(ACTIVE);
applyTokensToCSSVars(TOKENS);
mountThemeFurniture(ACTIVE);  // theme console-overlay furniture (no-op for themes without a builder)
// Per-theme HUD value transforms: themes register a fn keyed by chip
// elId (e.g. strip "38sess" → "38"). System level — typeInto routes
// every value through this. Empty for default themes; populated for
// Expanse themes. Module-level mutable so theme switches can replace.
const _HUD_VALUE_TRANSFORMS = {};
// Empty-chip values that auto-hide their parent chip. Universal.
const _HUD_EMPTY_VALUES = new Set(["", "—", "-", "None", "null", "undefined"]);
function _hudChipMaybeHide(elId, value) {
  const e = document.getElementById(elId);
  if (!e) return;
  const chip = e.closest(".hud-cell");
  if (!chip) return;
  // Triggers stay clickable — the dropdown should still open even when
  // the chip currently shows no data. Only hide non-trigger chips.
  if (chip.classList.contains("hud-session-trigger") ||
      chip.classList.contains("hud-layout-trigger") ||
      chip.classList.contains("hud-theme-trigger")) return;
  chip.classList.toggle("hud-empty", _HUD_EMPTY_VALUES.has(String(value).trim()));
}
applyFactionHUDLabels(ACTIVE);  // swap HUD chip labels to faction-native naval words
const TC = buildThemeConfig(TOKENS);

// Faction-native HUD chip labels + value transforms — replaces dev-tooling
// words (`SESSION`, `LAYOUT`, `THEME`, `CELLS`) with in-universe naval
// labels AND transforms displayed values where the raw form breaks the
// register (e.g. layout=COCKPIT under POST reads as a mixed metaphor;
// transforming to HELM fixes it). System level — populates
// `_HUD_VALUE_TRANSFORMS` so future themes register the same way.
// Per fan-mode review 2026-05-29: "POST COCKPIT" was the canonical
// example of MCRN-flavored label but generic-coded value.
function applyFactionHUDLabels(theme) {
  // Trims the trailing literal "sess" from session ids — the multi-stream
  // arc produces ids like "38sess" / "38sess-xyz"; the chip should read as
  // a watch number, not a session-slug stub. Universal across themes.
  // Defined locally so the const can't be in TDZ at first-call time (this
  // function may run before any top-level const initializer below it).
  const _sessionTrim = (v) => String(v).replace(/sess(?:-.*)?$/i, "");
  // Layout AND theme chips stay canonical ("LAYOUT: PACK", "THEME: EARTH")
  // across themes — per-theme remaps (layout pack→CONVOY, theme unn→FLAG …)
  // hid the renderer-internal id the corresponding dropdown still showed,
  // so chip and dropdown disagreed. Reverted per user 2026-05-29: "the
  // earth still uses the 'flag' name instead of 'theme' — correct that for
  // all themes". Faction flavor stays in the other chip labels
  // (status/cells/since/render/session).
  //
  // Per-theme labels live in THEME_REGISTRY[theme].hud. Themes without an
  // entry keep the default chip labels (lab + minimal).
  const entry = THEME_REGISTRY[theme];
  // Always clear prior transforms so theme switches don't leak. The
  // sessionTrim value transform is universal across themes that have a
  // HUD entry — applied once, not per-theme.
  for (const k of Object.keys(_HUD_VALUE_TRANSFORMS)) delete _HUD_VALUE_TRANSFORMS[k];
  if (!entry?.hud) return;
  const setLabel = (sel, txt) => {
    const el = document.querySelector(sel);
    if (el && txt != null) el.textContent = txt;
  };
  const labels = entry.hud;
  setLabel(".hud-status .hud-label",   labels.status);
  setLabel(".hud-elapsed .hud-label",  labels.since);
  setLabel(".hud-cells-cell .hud-label", labels.cells);
  setLabel("#hud-render-cell .hud-label", labels.render);
  setLabel("#hud-session-cell .hud-label", labels.session);
  _HUD_VALUE_TRANSFORMS["hud-session-val"] = _sessionTrim;
  // Re-flow the session value through the transform so the chip updates
  // immediately on theme switch (without waiting for the next loadHud
  // tick). The lastTyped cache is cleared so typeInto re-runs.
  const raw = state.hud.lastTyped.get("hud-session-val");
  if (raw != null) {
    state.hud.lastTyped.delete("hud-session-val");
    typeInto("hud-session-val", raw);
  }
}

// Token-declared layout preference applied after LAYOUT_REGISTRY is defined
// (see applyTokenLayout call below the registry).

// flowchart.htmlLabels: false renders edge labels as native SVG <text>
// instead of foreignObject+HTML. The foreignObject path measures label
// width with mermaid's default proportional font but renders with our
// theme CSS (Courier New monospace under magi), and the wider monospace
// chars overflow the pre-measured foreignObject — manifesting as
// truncated labels like "fin" or "triggers demot". SVG text labels
// measure and render with the same font, so they size correctly.
mermaid.initialize({
  startOnLoad: false,
  // padding: 16 (default 8) gives node-internal breathing room so
  // label text doesn't crash into the node border (user 2026-05-23
  // cell-4271). curve: "step" replaces the default basis-spline
  // edges (swoopy curves) with orthogonal 90° elbow lines — PCB-
  // trace style, architectural / square-pipe instead of organic
  // (user 2026-05-23 "force the mermaids etc to square pipe style
  // lines between nodes instead of the swoops").
  flowchart: { htmlLabels: false, padding: 16, curve: "step" },
  ...TC.mermaid,
});

// Lazy-load Prism.js (core + autoloader) on first code-cell mount.
// Sessions without code cells skip Prism entirely. The autoloader fetches
// language packs on demand from the same CDN root. All concurrent
// first-mounts share the same Promise so we only fetch + parse once.
let _prismLoad = null;
function ensurePrismLoaded(language) {
  if (window.Prism && window.Prism.languages && window.Prism.languages[language]) {
    return Promise.resolve();
  }
  if (!_prismLoad) {
    _prismLoad = new Promise((resolve, reject) => {
      // Prism core + autoloader pinned + SRI'd to match the SRI discipline
      // applied to every other CDN script in the head.  Without this, a
      // jsdelivr republish or prismjs npm takeover would execute attacker
      // JS in the same origin as DOMPurify.  Hashes computed against
      // prismjs@1.29.0 (openssl dgst -sha384 -binary | openssl base64).
      const core = document.createElement("script");
      core.src = "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js";
      core.integrity = "sha384-ZM8fDxYm+GXOWeJcxDetoRImNnEAS7XwVFH5kv0pT6RXNy92Nemw/Sj7NfciXpqg";
      core.crossOrigin = "anonymous";
      core.onload = () => {
        // Disable Prism's default auto-highlight on DOM ready — we trigger
        // highlightElement manually per cell so lazy-mounted cells get
        // highlighted on viewport entry, not page load.
        if (window.Prism) window.Prism.manual = true;
        const auto = document.createElement("script");
        auto.src = "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/plugins/autoloader/prism-autoloader.min.js";
        auto.integrity = "sha384-Uq05+JLko69eOiPr39ta9bh7kld5PKZoU+fF7g0EXTAriEollhZ+DrN8Q/Oi8J2Q";
        auto.crossOrigin = "anonymous";
        auto.onload = () => {
          try {
            window.Prism.plugins.autoloader.languages_path =
              "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/";
          } catch (e) { /* autoloader missing — degrade silently */ }
          resolve();
        };
        auto.onerror = () => reject(new Error("Prism autoloader failed"));
        document.head.appendChild(auto);
      };
      core.onerror = () => reject(new Error("Prism core failed"));
      document.head.appendChild(core);
    });
  }
  return _prismLoad;
}

// Browsers cap live WebGL contexts at ~16; with 84 cells minted over a
// session, a few scene3d demos eat that budget and leak GPU memory
// even when paused. This registry keeps at most WEBGL_CAP scenes alive at
// once, evicting the least-recently-visible non-visible scene when a new
// one initializes. Evicted scenes call their teardown to dispose Three.js
// geometry/materials/renderer + drop the canvas; they re-init from spec
// when scrolled back into view.
const WEBGL_CAP = 2;
function registerWebGL(entry) {
  state.webgl.registry.push(entry);
  evictWebGLIfOverCap();
}
function touchWebGL(entry) { entry.lastVisible = performance.now(); }
function evictWebGLIfOverCap() {
  while (state.webgl.registry.length > WEBGL_CAP) {
    const evictable = state.webgl.registry
      .filter(e => !e.visible)
      .sort((a, b) => a.lastVisible - b.lastVisible);
    if (evictable.length === 0) break;
    const victim = evictable[0];
    try { victim.teardown(); } catch (err) { /* swallow */ }
    const idx = state.webgl.registry.indexOf(victim);
    if (idx >= 0) state.webgl.registry.splice(idx, 1);
  }
}

// Tear down per-cell mounted state when a cell is being removed from the
// DOM (cap-based eviction). Handles:
//   - WebGL scene3d / force_graph contexts → teardown + drop registry entry
//   - vega-embed views → finalize() to free the runtime
//   - mounted IntersectionObservers (lazyMount) → disconnect
// The observers and timers self-clean once their target is GC'd, but
// explicit disposal here makes the eviction predictable + immediate
// rather than waiting for the next GC pass.
function disposeCellState(cellEl) {
  if (!cellEl) return;
  // WebGL scene3d / force_graph: registry entries hold a reference to
  // the .cell-body container. Match by descendant.
  for (let i = state.webgl.registry.length - 1; i >= 0; i--) {
    const entry = state.webgl.registry[i];
    if (entry.target && cellEl.contains(entry.target)) {
      try { entry.teardown(); } catch (e) { /* swallow */ }
      state.webgl.registry.splice(i, 1);
    }
  }
  // Vega-embed: each .vega-target gets a `_vegaView` reference set by
  // the substrate render. finalize() releases the runtime.
  for (const v of cellEl.querySelectorAll(".vega-target")) {
    if (v._vegaView && typeof v._vegaView.finalize === "function") {
      try { v._vegaView.finalize(); } catch (e) { /* swallow */ }
      v._vegaView = null;
    }
  }
  // Lazy-mount IntersectionObservers: target nodes hold an _lazyObserver
  // ref. Disconnect proactively so the observer doesn't keep a strong
  // ref to the (about-to-be-detached) target.
  for (const t of cellEl.querySelectorAll("[data-lazy-target], .mermaid-target, .vega-target, .animated-svg-target, .timeline-ribbon-target, .trajectory-target, .force-graph-target, .scene3d-target")) {
    if (t._lazyObserver && typeof t._lazyObserver.disconnect === "function") {
      try { t._lazyObserver.disconnect(); } catch (e) { /* swallow */ }
      t._lazyObserver = null;
    }
  }
  // Pack-layout ResizeObserver: a single module-scope observer watches
  // every pack cell so substrates that hydrate-late (mermaid, vega,
  // animated_svg) can trigger a re-pack. Per-column eviction is the load-
  // bearing RAM mechanism (memory perf_ram_cap), but the observer was
  // retaining evicted cells — both as GC roots and as continued layout
  // work. Unobserve here so disposeCellState fully releases the cell.
  if (_packResizeObserver) {
    try { _packResizeObserver.unobserve(cellEl); } catch (e) { /* swallow */ }
  }
}

// Lazy mount/unmount for SVG-heavy substrates (mermaid, vega, animated_svg).
// Starts unmounted; the IntersectionObserver renders on first viewport
// approach and tears down when the cell drifts beyond ~1500px of viewport.
// The 1500px margin is intentionally generous — earlier 400px tightening
// caused thrashing leaks (rapid mount/unmount cycles each leaking a vega
// view through a finalize race, accumulating to +150MB). Specs are cheap
// to re-render (no API call). Optional teardown callback may be async;
// returning a Promise lets vega await its embed before finalize().
function lazyMount(target, render, teardown) {
  let mounted = false;
  const io = new IntersectionObserver(async (entries) => {
    for (const e of entries) {
      if (e.isIntersecting && !mounted) {
        target.style.minHeight = "";
        try { render(); } catch (err) { /* swallow */ }
        mounted = true;
      } else if (!e.isIntersecting && mounted) {
        const h = target.offsetHeight;
        if (h > 20) target.style.minHeight = h + "px";
        if (teardown) {
          try { await teardown(); } catch (err) { /* swallow */ }
        }
        target.innerHTML = "";
        mounted = false;
      }
    }
  }, { rootMargin: "1500px" });
  target._lazyObserver = io;  // see rerenderNotebook for cleanup
  io.observe(target);
}

// Natural-size pivot phase 2 (2026-04-29): after a cell's content
// renders, measure its intrinsic width and set --cell-natural-width
// on the cell article so the flex layout sizes the cell to content.
// Read scrollWidth (NOT clientWidth) so wider-than-viewport content
// reports its true intrinsic size. Adds inset for cell padding/border
// (~32px) so the cell's visible content area matches the measured
// content rather than tightly clipping to scrollWidth's edge.
function applyNaturalCellSize(target, hint) {
  const cell = target && target.closest && target.closest(".cell");
  if (!cell) return;
  // Defer one frame so layout has settled.
  requestAnimationFrame(() => {
    let naturalWidth = 0;
    if (typeof hint === "number" && hint > 0) {
      naturalWidth = hint;
    } else {
      // Measure widest descendant. scrollWidth on the target captures
      // children that overflow (wide tables, natural-size mermaid
      // SVGs); fall back to the measured bounding rect if scrollWidth
      // is zero (text-only content).
      naturalWidth = target.scrollWidth || target.getBoundingClientRect().width || 0;
    }
    if (naturalWidth <= 0) return;
    const padding = 32;
    cell.style.setProperty("--cell-natural-width", (naturalWidth + padding) + "px");
  });
}

function expandTokens(s) {
  if (typeof s !== "string") return s;
  return s.replace(/\$(\w+)/g, (m, name) => TC.palette[name] || m);
}
export function resolveColor(c) {
  if (typeof c !== "string") return c;
  if (c.startsWith("$")) {
    const name = c.slice(1);
    return TC.palette[name] || c;
  }
  return c;
}

// Type-on animation: progressively reveal text into a target element.
// Hackertyper-feel; bounded so first paint isn't a blocking effect.
// Critical: only animates when the value actually CHANGES — otherwise
// the 5s HUD poll would re-type the entire header every tick, which
// reads as nervous flicker, not signal.
function typeInto(elId, text, perChar = 18, maxChars = 200) {
  const e = document.getElementById(elId);
  if (!e) return;
  const xform = _HUD_VALUE_TRANSFORMS[elId];
  const raw = String(text).slice(0, maxChars);
  const t = xform ? String(xform(raw)).slice(0, maxChars) : raw;
  _hudChipMaybeHide(elId, t);
  if (state.hud.lastTyped.get(elId) === t) return;  // unchanged → leave it alone
  state.hud.lastTyped.set(elId, t);
  e.textContent = "";
  let i = 0;
  const tick = () => {
    e.textContent = t.slice(0, ++i);
    if (i < t.length) setTimeout(tick, perChar);
  };
  tick();
}

// Last-good payload cache, keyed by path. On parse failure we serve the
// previously-successful payload instead of returning null — keeps the UI
// alive when one of the JSON producers writes a malformed file (e.g. an
// OOM-truncated cells.json: writer killed mid-write, trailing garbage
// past the closing `}`, JSON.parse throws — happened 2026-05-04). Falls
// through to null only when there's no cache yet.
const _fetchJSONLastGood = new Map();

// cells.json wire-format version the JS reader was authored for. Must
// match orchestrator.py CELLS_SCHEMA_VERSION. Mismatch is a warn-and-
// degrade, not an abort — the renderer is forward-tolerant of unknown
// keys but the operator should know the source has drifted.
const EXPECTED_CELLS_SCHEMA_VERSION = 1;
const _schemaVersionWarned = new Set();
function _checkCellsSchemaVersion(path, data) {
  if (path !== "cells.json" || !data || typeof data !== "object") return;
  const v = data.schema_version;
  if (v === EXPECTED_CELLS_SCHEMA_VERSION) return;
  const key = v == null ? "missing" : String(v);
  if (_schemaVersionWarned.has(key)) return;
  _schemaVersionWarned.add(key);
  if (v == null) {
    console.warn(
      `[fetchJSON] cells.json has no schema_version field. ` +
      `Reader expects v${EXPECTED_CELLS_SCHEMA_VERSION}. ` +
      `Writer may be pre-versioning (orchestrator.py < 2026-05-29) — ` +
      `unknown fields will be ignored, missing fields will read as undefined.`,
    );
  } else {
    console.warn(
      `[fetchJSON] cells.json schema_version=${v} but reader expects ` +
      `${EXPECTED_CELLS_SCHEMA_VERSION}. Rendering with best-effort tolerance; ` +
      `confirm the JS bundle and the Python writer are on the same release.`,
    );
  }
}

async function fetchJSON(path) {
  try {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) return null;
    const text = await r.text();
    try {
      const data = JSON.parse(text);
      _checkCellsSchemaVersion(path, data);
      _fetchJSONLastGood.set(path, data);
      return data;
    } catch (parseErr) {
      const cached = _fetchJSONLastGood.get(path);
      if (cached !== undefined) {
        console.warn(
          `[fetchJSON] parse failed for ${path} (len=${text.length}); ` +
          `serving last-good cache. error: ${parseErr.message}`,
        );
        return cached;
      }
      console.error(`[fetchJSON] parse failed for ${path} and no cache available`, parseErr);
      return null;
    }
  } catch (e) { return null; }
}

// Discover the newest substrate-eval audit JSON. Browsers can't glob
// directories on a static server, so we probe a window of recent dates.
// Cached after first lookup so subsequent loadHud polls don't re-issue.
// Returns null if no audit is found — kill #3 then displays "n/a".
//
// 2026-05-04: 14-day → 4-day window (#129). The earlier walk produced
// up to 13 sequential 404s in the boot console when the latest audit
// was older than today; narrower window means at most 3 misses, and
// they fire in parallel via Promise.all so wall-time is one round-trip.
async function loadLatestSubstrateAudit() {
  if (state.hud.cachedAudit !== undefined) return state.hud.cachedAudit;
  if (state.hud.cachedAuditPromise) return state.hud.cachedAuditPromise;
  state.hud.cachedAuditPromise = (async () => {
    const today = new Date();
    const dates = [];
    for (let i = 0; i < 4; i++) {
      const d = new Date(today.getTime() - i * 86400000);
      dates.push(d.toISOString().slice(0, 10));
    }
    // Parallel probe — collect all 4 in one round-trip instead of
    // sequentially awaiting each.
    const results = await Promise.all(
      dates.map((ds) => fetchJSON(`audits/substrate_eval_${ds}.json`)),
    );
    for (let i = 0; i < results.length; i++) {
      if (results[i]) {
        state.hud.cachedAudit = results[i];
        return results[i];
      }
    }
    state.hud.cachedAudit = null;
    return null;
  })();
  return state.hud.cachedAuditPromise;
}
async function fetchText(path) {
  try {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.text();
  } catch (e) { return null; }
}

// Compute lucida HUD metrics from cells.json + the latest substrate eval.
// Kill rates use audited values when present, else fall back to cells.json
// regex / proxy heuristics so the strip never reads "—".
function computeHud(data, substrateAudit, mintLog) {
  const cells = data.cells || [];
  // Scope to the active session if ?session= is set; otherwise global.
  // Kill-criteria gauges then reflect the current session's rates, not
  // a cross-session aggregate that would be misleading in a session view.
  const scoped = cells.filter(matchesActiveSession);
  const active = scoped.filter(c => !c.replaced_by);
  const visible = active.filter(c => !(c.cell_type === "text" && c.attempted_cell_type));
  const byType = {};
  for (const c of visible) byType[c.cell_type] = (byType[c.cell_type] || 0) + 1;

  // KILL.AESTHETIC — kill #1, image quality. Proxy: count image cells whose notes mention low score.
  // For the audit, we'd read audits/audit_*.md; for now use the rate from the existing audit_2026-04-27 figures.
  let kill1 = "n/a";
  const imgCells = visible.filter(c => c.cell_type === "image");
  if (imgCells.length) kill1 = `img ${imgCells.length} (audit Δ pending)`;

  // KILL.MISROUTE — classifier mis-routings. Pull from notes via regex.
  const forced = active.filter(c => /forced→\w+/.test(c.notes || ""));
  const total = active.length;
  const kill2pct = total ? (forced.length * 100 / total).toFixed(1) : "0.0";
  const kill2 = `${kill2pct}% (${forced.length}/${total})`;

  // KILL.HALLUC — substrate hallucination from latest audit.
  let kill3 = "n/a";
  if (substrateAudit && substrateAudit.length) {
    const evaluated = substrateAudit.filter(r => !r.error);
    const inv = evaluated.filter(r => (r.substrate_inv && r.substrate_inv.length) || (r.caption_inv && r.caption_inv.length));
    const pct = evaluated.length ? (inv.length * 100 / evaluated.length).toFixed(1) : "0.0";
    kill3 = `${pct}% (${inv.length}/${evaluated.length})`;
  }

  // STATUS — alive if any mint within last 60min, else idle.
  let status = "IDLE";
  let lastMint = null;
  if (mintLog && mintLog.length) {
    const now = Date.now();
    const recent = mintLog.filter(m => {
      const t = Date.parse(m.timestamp || "");
      return !Number.isNaN(t) && (now - t) < 60 * 60 * 1000;
    });
    if (recent.length) status = "ACTIVE";
    lastMint = mintLog[mintLog.length - 1];
  }

  // RECENT — last 3 mints, comma-separated.
  let recent = "—";
  if (mintLog && mintLog.length) {
    const last3 = mintLog.slice(-3).map(m => `${m.cell_id}:${m.cell_type}`);
    recent = last3.join("  ");
  }

  return {
    status,
    cells: `${visible.length}`,
    cellsByType: byType,
    cellsTotal: visible.length,
    // Session display: prefer the active ?session= filter when set.
    // Single id → show truncated; multiple → show "Nsess"; none →
    // fall back to corpus-level session_id field.
    session: (state.sessions.active.size === 1
              ? [...state.sessions.active][0].slice(0, 8)
              : state.sessions.active.size > 1
                ? `${state.sessions.active.size}sess`
                : (data.session_id || "—").slice(0, 8)),
    theme: (() => {
      const k = window.__LUCIDA_THEME || "lab";
      return THEME_REGISTRY[k]?.label || k.toUpperCase();
    })(),
    kill1, kill2, kill3, recent,
  };
}

// Substrate-type → theme-palette index mapping for the CELLS stacked bar.
// Routed through --data-cat-N so the bar wears the active theme's data
// palette (was hardcoded var(--vis-ok)/etc. → green/yellow/red regardless
// of theme — user 2026-06-08: "doesn't really seem to change much between
// themes"). Grouping is by substrate semantics so adjacent stripes don't
// blend visually:
//   cat-0 → primary viz (vega/animated_svg/treemap/force_graph)
//   cat-1 → graph/structure (mermaid/scene3d)
//   cat-2 → content (html/code/ascii)
//   cat-3 → time-series (sparkline/timeline_ribbon/trajectory)
//   text → --muted (de-emphasize anti-differentiation)
//   image → --accent-danger (semantic "demoted" red)
const SUBSTRATE_COLORS = {
  vega:            "var(--data-cat-0, var(--accent))",
  mermaid:         "var(--data-cat-1, var(--accent))",
  html:            "var(--data-cat-2, var(--accent))",
  animated_svg:    "var(--data-cat-0, var(--accent))",
  scene3d:         "var(--data-cat-1, var(--accent))",
  treemap:         "var(--data-cat-0, var(--accent))",
  code:            "var(--data-cat-2, var(--accent))",
  sparkline:       "var(--data-cat-3, var(--accent))",
  timeline_ribbon: "var(--data-cat-3, var(--accent))",
  trajectory:      "var(--data-cat-3, var(--accent))",
  force_graph:     "var(--data-cat-0, var(--accent))",
  ascii:           "var(--data-cat-2, var(--accent))",
  text:            "var(--muted)",
  image:           "var(--accent-danger, #f87171)",
};

// Render the stacked-bar of substrate distribution. Idempotent: clears
// previous segments + rebuilds. Uses a small cache so we don't repaint
// when the breakdown is unchanged.
function renderCellsBar(byType, total) {
  const svg = document.getElementById("hud-cells-bar");
  if (!svg) return;
  if (!total || total <= 0) {
    svg.innerHTML = "";
    state.rendering.cellsBarKey = null;
    return;
  }
  // Stable order: prioritize visible/high-value substrates first so the
  // bar reads left-to-right by importance.
  const order = ["vega", "mermaid", "html", "animated_svg", "scene3d",
                 "treemap", "code", "sparkline", "timeline_ribbon", "trajectory", "force_graph", "ascii", "image", "text"];
  const present = order.filter(t => byType[t]);
  for (const t of Object.keys(byType)) {
    if (!present.includes(t)) present.push(t);
  }
  const key = present.map(t => `${t}:${byType[t]}`).join(",") + `=${total}`;
  if (key === state.rendering.cellsBarKey) return;
  state.rendering.cellsBarKey = key;

  svg.innerHTML = "";
  let x = 0;
  for (const t of present) {
    const n = byType[t];
    const w = (n / total) * 100;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", x.toFixed(3));
    rect.setAttribute("y", "0");
    rect.setAttribute("width", w.toFixed(3));
    rect.setAttribute("height", "6");
    rect.setAttribute("fill", SUBSTRATE_COLORS[t] || "var(--muted)");
    rect.setAttribute("opacity", t === "text" ? "0.5" : "0.92");
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${t}: ${n}`;
    rect.appendChild(title);
    svg.appendChild(rect);
    x += w;
  }
}

// Parse mint_log.jsonl (one JSON object per line) into an array.
function parseMintLog(text) {
  if (!text) return [];
  return text.split(/\r?\n/).filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch (e) { return null; }
  }).filter(Boolean);
}

// Track latest seen mint so we can detect *new* events between polls
// and flash the HUD to announce them. Persists across loadHud calls.

// Set of cell IDs already rendered in the notebook. Initialized by the
// first load() pass and grown by liveAppendNewCells() as fresh cells arrive.
// to the notebook with a slide-in animation. Called from loadHud() so it
// runs at the same 1.5s cadence as the HUD poll.
function liveAppendNewCells(cellsData) {
  if (!cellsData || !Array.isArray(cellsData.cells)) return 0;
  // In auto-mode, a fresh cell from a brand-new session_id grows the
  // active set so its column auto-mounts. The `matchesActiveSession`
  // filter below then accepts it via the freshly-added id.
  if (state.sessions.autoMode) {
    let changed = false;
    for (const c of cellsData.cells) {
      if (c.replaced_by) continue;
      if (c.cell_type === "text" && c.attempted_cell_type) continue;
      const sid = c.session_id || "untagged";
      if (!state.sessions.active.has(sid)) {
        state.sessions.active.add(sid);
        changed = true;
      }
    }
    if (changed) {
      // Pre-mount any newly-discovered session columns (mirrors load()).
      if (isMultiStream()) for (const sid of state.sessions.active) ensureSessionColumn(sid);
    }
  }
  const visible = cellsData.cells.filter(c => {
    if (c.cell_type === "text" && c.attempted_cell_type) return false;
    if (c.replaced_by) return false;
    if (!matchesActiveSession(c)) return false;  // ?session=<id> filter (step 2)
    if (isAwaitingMint(c)) return false;
    return true;
  });
  // Removal detection — fixes demo-replay flow where replay.py wipes
  // session cells then drips them back with same IDs. Without this,
  // wiped cells stay in the DOM (no delete handler) and re-dripped
  // cells get skipped because their IDs are still in renderedIds.
  // Same disposal sequence as the cap eviction path uses. Cell DOM
  // id == cell.id (set in renderCell at card.id = c.id).
  const currentIds = new Set(cellsData.cells.map(c => c.id));
  for (const id of [...state.rendering.renderedIds]) {
    if (!currentIds.has(id)) {
      const node = document.getElementById(id);
      if (node) {
        if (typeof disposeCellState === "function") disposeCellState(node);
        node.remove();
      }
      state.rendering.renderedIds.delete(id);
      if (state.rendering.cellsById) state.rendering.cellsById.delete(id);
    }
  }
  // First poll establishes the baseline; subsequent polls detect deltas.
  // load() seeds state.rendering.renderedIds before the first poll fires.
  const fresh = visible.filter(c => !state.rendering.renderedIds.has(c.id));
  if (!fresh.length) return 0;

  // Rebuild snippetGroups from the full visible set so attempt-N-of-M
  // badges include the newly arrived cells.
  const snippetGroups = new Map();
  for (const c of visible) {
    if (!c.trigger_snippet) continue;
    if (!snippetGroups.has(c.trigger_snippet)) snippetGroups.set(c.trigger_snippet, []);
    snippetGroups.get(c.trigger_snippet).push(c.id);
  }

  const root = document.getElementById("notebook");
  // Reverse-chrono prepend: newest cell ends up at top. Preserve the
  // user's current viewport position when they're not at the top —
  // prepending grows the document upward, so without compensation a
  // user reading older cells would suddenly see different content.
  // When the user IS at the top, let the new cell push everything down
  // naturally so they see it immediately.
  const wasAtTop = window.scrollY < 100;
  const oldDocHeight = document.body.offsetHeight;
  let firstNode = null;
  const multi = isMultiStream();
  // Merge the latest poll's cells into cellsById so a freshly-arrived
  // successor can find its (older) predecessor that was loaded earlier.
  // Per Task #79.
  const cellsById = state.rendering.cellsById || new Map();
  for (const c of cellsData.cells) cellsById.set(c.id, c);
  state.rendering.cellsById = cellsById;
  // Note real-mint activity for the transient-cell spawn gate (Task #94).
  if (typeof _transientNote === "function") _transientNote(true);
  for (const c of fresh) {
    const node = renderCell(c, snippetGroups, cellsById);
    node.classList.add("cell-fresh");
    if (multi) {
      // Route into the cell's session column; newest first within column.
      const col = ensureSessionColumn(sessionKey(c));
      const headerEl = col.firstChild;
      col.insertBefore(node, headerEl.nextSibling);
    } else {
      root.prepend(node);
    }
    state.rendering.renderedIds.add(c.id);
    firstNode = node;
    // Mint-time scrubber (Task #95): rapid theme-tuned glyph storm
    // overlaid on the cell body for the first ~700ms, resolving into
    // the real substrate render. Pairs with the wireframe-reveal
    // ::before pseudo on cell-fresh; this is the *content-layer*
    // computer-thinking-fast effect, where wireframe-reveal is the
    // *frame-layer*. Skipped for transient cells (their entire body
    // IS a glyph storm already — doubling up reads as broken).
    if (c.cell_type !== "transient" && typeof attachMintScrubber === "function") {
      attachMintScrubber(node);
    }
    setTimeout(() => node.classList.remove("cell-fresh"), 1400);
  }
  // Cap the visible cell count: prepending a fresh cell without eviction
  // would let the grid grow indefinitely. Auto-mode caps at hero count
  // (?max=N or layout cap); ?recent=N caps the trailing transcript in any
  // mode. IDs stay in renderedIds so they don't re-mount on the next
  // poll — refresh re-seeds the tail.
  //
  // Multi-stream mode previously bypassed this loop entirely, so a session
  // running for hours accumulated cells across every column without bound
  // (user 2026-05-01: "766MB of ram"). Now: each column gets its own cap
  // and the eviction also cleans up registry state (WebGL contexts,
  // running timers via cell teardown hooks) so freed cells don't leak.
  const recentCap = getRecentCap();
  const tickLayoutEntry = LAYOUT_REGISTRY[getLayoutMode()];
  const tickLayoutCap = tickLayoutEntry && tickLayoutEntry.cap;
  const cap = state.sessions.autoMode
    ? getVisibleCap()
    : (recentCap || tickLayoutCap || 80);
  if (cap) {
    if (multi) {
      // Per-column cap. Each session gets its own trailing cap-N cells.
      const columns = root.querySelectorAll(":scope > .cell-column");
      for (const col of columns) {
        const cells = col.querySelectorAll(":scope > .cell");
        for (let i = cells.length - 1; i >= cap; i--) {
          disposeCellState(cells[i]);
          cells[i].remove();
        }
      }
    } else {
      const cells = root.querySelectorAll(":scope > .cell");
      for (let i = cells.length - 1; i >= cap; i--) {
        disposeCellState(cells[i]);
        cells[i].remove();
      }
    }
  }
  if (!wasAtTop && firstNode) {
    const delta = document.body.offsetHeight - oldDocHeight;
    if (delta > 0) window.scrollBy(0, delta);
  }
  // Transfer the "still warm" hero glow to the newest appended cell.
  if (firstNode) applyStillWarmToLatest();
  // Re-apply alternate layout (pack / organic) so freshly arrived
  // cells get their absolute position computed alongside existing ones.
  // Pack mode also schedules 600ms / 2000ms retries because substrates
  // (vega/scene3d/mermaid) lazy-mount async and have offsetWidth=0
  // at the synchronous call — see scheduleLiveLayoutRetries.
  applyActiveLayout();
  if (getLayoutMode() === "pack") scheduleLiveLayoutRetries();
  // Redraw inter-cell connections — a fresh reflection cell or a fresh
  // source cell can both invalidate existing paths.
  if (firstNode) scheduleRedrawConnections();
  // Re-tag overflow on any cells that may have changed size from the
  // append (and async-loaded content settling in for fresh cells).
  if (firstNode) {
    scheduleCheckOverflow();
    setTimeout(scheduleCheckOverflow, 800);
    setTimeout(scheduleCheckOverflow, 2200);
  }
  return fresh.length;
}

// Single shared poll. Fetches cells.json + mint_log once per cadence,
// then dispatches to (a) live cell-append, then (b) HUD update. The
// audit's "control flow inversion" critique was that minting was
// gated by HUD render — that's still partially true (single fetch
// loop), but the layering is now explicit and we can split into
// independent cadences if mint latency ever bites: just call
// pollCells() and pollHud() from separate intervals with different
// cache keys for cellsData / mintLogText. Per audit 2026-04-28.
async function pollAll() {
  // HEAD probe before GET. At saturation cells.json is multi-MB and
  // JSON.parse is ~50-100ms per poll. The fingerprint short-circuit
  // (below) skips the heavy walks but only AFTER parse. A HEAD
  // request returns just headers (~1-5ms localhost); when
  // Content-Length + Last-Modified match the previous poll, the file
  // genuinely hasn't changed and we skip the GET + parse entirely.
  // Organic mints land every ~30s; polls run every 3s, so ~9/10
  // polls hit this fast path. Falls through to full path on any
  // HEAD error so a flaky probe doesn't strand the HUD.
  let modTag = null;
  try {
    const head = await fetch("cells.json", { method: "HEAD", cache: "no-store" });
    if (head.ok) {
      modTag = (head.headers.get("content-length") || "?")
        + ":" + (head.headers.get("last-modified") || "?");
      if (state.poll && state.poll.lastModTag === modTag) return;
    }
  } catch (e) { /* fall through to full GET */ }

  const [cellsData, mintLogText] = await Promise.all([
    fetchJSON("cells.json"),
    fetchText("mint_log.jsonl"),
  ]);
  if (!cellsData) return;

  // Fingerprint short-circuit (parsed-shape dedup): a HEAD-mismatch
  // can fire on byte-identical content (e.g. atomic write touches
  // Last-Modified). Cell count + last cell id + mint-log byte length
  // covers every "actually changed" signal we care about, and runs
  // after parse so the HEAD path is the cheap one — see above.
  const cells = cellsData.cells || [];
  const lastId = cells.length ? cells[cells.length - 1].id : null;
  const fingerprint = `${cells.length}:${lastId}:${(mintLogText || "").length}`;
  if (state.poll && state.poll.lastFingerprint === fingerprint) {
    if (modTag) state.poll.lastModTag = modTag;
    return;
  }
  if (!state.poll) state.poll = {};
  state.poll.lastFingerprint = fingerprint;
  if (modTag) state.poll.lastModTag = modTag;

  // (a) Cell append first — this is the "what just landed" signal,
  // load-bearing for the live-stream feel. HUD updates derive from
  // the same cellsData so cell counts + flashes reflect post-append.
  const appended = liveAppendNewCells(cellsData);
  if (appended) flashHud();

  // (b) HUD update from the same fetched data. Synchronous compute
  // + typeInto-driven repaint of HUD slots.
  await updateHud(cellsData, mintLogText);
}

async function updateHud(cellsData, mintLogText) {
  // Pick latest substrate eval if present. Browser can't list directories,
  // so we walk backward from today across a 14-day window once per page
  // load and cache the result. Page reload re-discovers.
  const substrateAudit = await loadLatestSubstrateAudit();

  const mintLog = parseMintLog(mintLogText);
  const newest = mintLog.length ? mintLog[mintLog.length - 1] : null;

  // Detect new mint vs. last poll → flash HUD.
  if (newest && newest.cell_id && newest.cell_id !== state.hud.lastSeenMint) {
    if (state.hud.lastSeenMint !== null) flashHud();  // skip flash on first paint
    state.hud.lastSeenMint = newest.cell_id;
  }
  state.hud.lastMintTs = newest ? newest.timestamp : null;

  const m = computeHud(cellsData, substrateAudit, mintLog);
  typeInto("hud-status-val", m.status);
  typeInto("hud-cells-val", m.cells);
  renderCellsBar(m.cellsByType, m.cellsTotal);
  typeInto("hud-session-val", m.session);
  typeInto("hud-theme-val", m.theme);
  typeInto("hud-kill1-val", m.kill1);
  typeInto("hud-kill2-val", m.kill2);
  typeInto("hud-kill3-val", m.kill3);
  typeInto("hud-recent-val", m.recent);
  const hud = document.getElementById("hud");
  hud.dataset.status = m.status.toLowerCase();
  // Mirror the status onto #notebook so the hero cell can pulse a
  // continuous "live stream" border while the watcher is active.
  document.getElementById("notebook").dataset.stream = m.status.toLowerCase();
  applyKillState("hud-kill1-slot", parsePct(m.kill1), 30, 50);
  applyKillState("hud-kill2-slot", parsePct(m.kill2), 25, 40);
  applyKillState("hud-kill3-slot", parsePct(m.kill3), 12, 20);
}

// Backward-compat alias: existing call sites (rerenderNotebook,
// bootstrap loop) still call loadHud(). Same behavior; just dispatches
// to the split form so a future cadence change is local.
const loadHud = pollAll;

// Parse a % value out of strings like "11.5% (7/61)" / "n/a" / "img 6 (audit Δ pending)".
function parsePct(s) {
  if (typeof s !== "string") return null;
  const m = s.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : null;
}

// Set data-state on a kill slot from a % vs warn/tripped thresholds, and
// fill the ring in proportion. Ring uses stroke-dasharray on a 2*pi*r=62.83 path.
// Track each kill slot's previous state so we can detect non-tripped →
// tripped transitions and trigger the peripheral-to-center bloom (Iron
// HUD signature: peripheral gauges escalate to center when their data
// becomes load-bearing — see design-references.md "peripheral-to-center
// attention move"). First-paint state is treated as established
// (no bloom on initial load if a kill is already tripped).
function applyKillState(slotId, pct, warnAt, trippedAt) {
  const slot = document.getElementById(slotId);
  if (!slot) return;
  let killState = "ok";
  if (pct == null) killState = "unknown";
  else if (pct >= trippedAt) killState = "tripped";
  else if (pct >= warnAt) killState = "warn";
  const prev = state.hud.killHistory.get(slotId);
  slot.dataset.state = killState;
  if (prev !== undefined && prev !== "tripped" && killState === "tripped") {
    bloomKillTrip(slot, pct);
  }
  state.hud.killHistory.set(slotId, killState);
  const fill = slot.querySelector(".hud-ring-fill");
  if (!fill) return;
  const circ = 2 * Math.PI * 10;  // r=10
  let frac = 0;
  if (pct != null) {
    // Cap at trippedAt for the ring fill so a tripped slot looks "full".
    frac = Math.min(1, Math.max(0, pct / trippedAt));
  }
  fill.style.strokeDasharray = `${(frac * circ).toFixed(2)} ${circ.toFixed(2)}`;
}

// Peripheral-to-center bloom. Clones a kill slot's content into a
// fixed-position hero card, animates it from its peripheral HUD position
// to the viewport center (scaled up, glowing), holds, then animates
// back. Pure Web Animations API — no React Flow / no animation library.
// Triggered automatically by applyKillState on a tripped transition;
// can also be invoked manually via window.lucidaBloomDemo() for testing.
function bloomKillTrip(slot, pct) {
  const sourceRect = slot.getBoundingClientRect();
  const label = slot.querySelector(".hud-label")?.textContent || "KILL";
  const value = slot.querySelector(".hud-value")?.textContent || `${pct}%`;

  const hero = el("div", "kill-bloom-hero");
  hero.dataset.killState = "tripped";
  hero.innerHTML = `
    <div class="kill-bloom-label">${label}</div>
    <div class="kill-bloom-value">${value}</div>
    <div class="kill-bloom-status">TRIPPED</div>
  `;
  document.body.appendChild(hero);

  // Position at source first; layout pass; then animate to center.
  const heroW = 280, heroH = 160;
  const sourceX = sourceRect.left + sourceRect.width / 2 - heroW / 2;
  const sourceY = sourceRect.top + sourceRect.height / 2 - heroH / 2;
  const centerX = window.innerWidth / 2 - heroW / 2;
  const centerY = window.innerHeight / 2 - heroH / 2;
  hero.style.left = sourceX + "px";
  hero.style.top = sourceY + "px";
  hero.style.width = heroW + "px";
  hero.style.height = heroH + "px";

  const dx = centerX - sourceX;
  const dy = centerY - sourceY;

  hero.animate(
    [
      { transform: "translate(0, 0) scale(0.2)", opacity: 0 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5}px) scale(0.7)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${dx}px, ${dy}px) scale(1)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${dx}px, ${dy}px) scale(1)`, opacity: 1, offset: 0.85 },
      { transform: "translate(0, 0) scale(0.2)", opacity: 0 },
    ],
    { duration: 3500, easing: "cubic-bezier(0.25, 0.8, 0.3, 1)", fill: "forwards" }
  ).onfinish = () => hero.remove();
}

// Console-accessible demo: window.lucidaBloomDemo() fakes a tripped
// transition on KILL.HALLUC so the bloom can be eyeballed without
// waiting for a real kill-criteria trip.
window.lucidaBloomDemo = (slotId = "hud-kill3-slot") => {
  const slot = document.getElementById(slotId);
  if (slot) bloomKillTrip(slot, 99);
};

// Inter-cell connections: WebGL via Three.js. Replaces the prior SVG
// implementation. Lines are real 3D paths in a Three.js scene with a
// forward Z-arc through the middle, giving the connections genuine
// depth (the user's "the lines imply 3D-ness" intuition). Per
// memory/2d_3d_mix_arc.md — Tier 3 partial. Structure is VR-loopback-
// ready: future swap of OrthographicCamera → PerspectiveCamera +
// WebXRManager keeps everything else mechanical.
//
// gemotvis lesson (memory/2d_3d_mix_arc.md, anchored 2026-04-28): the
// brittleness wasn't CSS-3D-specific — it was multiple async animation
// systems trampling each other. Lucida is vanilla, single source of
// truth (Three.js render on rAF), so the trampling vector doesn't
// apply.
function ensureThreeOverlay() {
  if (state.conn.renderer) return state.conn.renderer;
  const canvas = document.getElementById("connection-overlay");
  if (!canvas || !window.THREE) return null;
  const T = window.THREE;
  state.conn.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
  state.conn.renderer.setPixelRatio(window.devicePixelRatio);
  state.conn.renderer.setClearColor(0x000000, 0);
  // updateStyle:false on init AND on every resize. CSS handles the
  // canvas's displayed size via `width: 100%; height: 100%`. If we let
  // Three.js write inline style here, it captures the init-time size,
  // and later viewport changes never refresh it — buffer downscales
  // on resize but the stale inline style keeps stretching the buffer
  // across the (now-different) viewport. That's the "giant green bar"
  // bug: any pixel rendered at buffer.width=926 became a horizontal
  // bar across an inline-styled-2060px canvas after the user resized
  // their window. Per audit 2026-04-28.
  canvas.style.removeProperty("width");
  canvas.style.removeProperty("height");
  state.conn.renderer.setSize(window.innerWidth, window.innerHeight, false);
  state.conn.scene = new T.Scene();
  // Orthographic camera maps viewport pixels directly to scene units.
  // top=0 / bottom=H inverts Y so screen Y increases downward (matches
  // DOM getBoundingClientRect coordinates). Z range allows ±1000px
  // depth for connection arcs; near/far will tighten when this becomes
  // a PerspectiveCamera in VR mode.
  state.conn.camera = new T.OrthographicCamera(
    0, window.innerWidth,
    0, window.innerHeight,
    -2000, 2000,
  );
  state.conn.camera.position.z = 100;
  return state.conn.renderer;
}

function _connAccent() {
  // Read live --accent from current theme. Cheap (cached in browser
  // computed-style); ensures connections re-color on theme switch.
  const c = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent").trim();
  return new window.THREE.Color(c || "#66ccff");
}

// Connection capability: a theme can declare TOKENS.connections to make the
// overlay faction-native. "trajectory" = the MCRN nav register — dashed lines
// with chevron flow-arrows, the way the show joins named bodies on the nav plot
// (MARS_BLUE—MARASMUS dashed path). Color stays CYAN (--accent): per the
// reference frames the connecting/trajectory lines are cyan/white in BOTH calm
// and combat; red is reserved for the histogram band + threat reticles, never
// the connector lines. Absent → plain solid accent arcs. Reusable: drift/unn
// can add their own connection modes.
function _connStyle() {
  const mode = (typeof TOKENS !== "undefined" && TOKENS.connections) || null;
  if (mode === "trajectory") {
    return { mode, color: _connAccent(), dashed: true, dashSize: 7, gapSize: 5, chevrons: true };
  }
  return { mode: null, color: _connAccent(), dashed: false, chevrons: false };
}

// Build one overlay line honoring the style (dashed vs solid), register it for
// disposal + opacity-pulse. `color` is explicit so per-session threads keep
// their distinct hues while still picking up the dashed treatment.
function _connMakeLine(T, points, style, color, opacity) {
  const geo = new T.BufferGeometry().setFromPoints(points);
  const mat = style.dashed
    ? new T.LineDashedMaterial({ color, transparent: true, opacity, dashSize: style.dashSize, gapSize: style.gapSize })
    : new T.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new T.Line(geo, mat);
  if (style.dashed) line.computeLineDistances();  // required for dash pattern
  state.conn.scene.add(line);
  state.conn.lines.push(line);
  return line;
}

// Chevron flow-arrows along a polyline, oriented by local tangent, pointing in
// the direction of travel (points[0] → points[n]). A few evenly-spaced wedges
// read as "signal flowing this way" — the MCRN conduit tell.
function _connChevrons(T, points, color, opacity) {
  const n = points.length;
  if (n < 3) return;
  const fracs = n > 12 ? [0.3, 0.55, 0.8] : [0.5, 0.85];
  const size = 7, theta = 0.6, ct = Math.cos(theta), st = Math.sin(theta);
  for (const f of fracs) {
    const i = Math.max(1, Math.min(n - 2, Math.round(f * (n - 1))));
    const a = points[i - 1], b = points[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const ap = points[i];
    const w1 = new T.Vector3(ap.x + size * (-ux * ct + uy * st), ap.y + size * (-ux * st - uy * ct), ap.z + 1);
    const w2 = new T.Vector3(ap.x + size * (-ux * ct - uy * st), ap.y + size * (ux * st - uy * ct), ap.z + 1);
    const apex = new T.Vector3(ap.x, ap.y, ap.z + 1);
    const geo = new T.BufferGeometry().setFromPoints([w1, apex, w2]);
    const mat = new T.LineBasicMaterial({ color, transparent: true, opacity });
    const line = new T.Line(geo, mat);
    state.conn.scene.add(line);
    state.conn.lines.push(line);
  }
}

function scheduleRedrawConnections() {
  if (state.conn.rafPending) return;
  state.conn.rafPending = true;
  requestAnimationFrame(() => {
    state.conn.rafPending = false;
    drawConnections();
  });
}

function drawConnections() {
  if (!ensureThreeOverlay()) return;
  const T = window.THREE;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Resync camera + renderer to current viewport (cheap; both mostly
  // no-ops if dimensions unchanged).
  state.conn.renderer.setSize(vw, vh, false);
  state.conn.camera.left = 0;
  state.conn.camera.right = vw;
  state.conn.camera.top = 0;
  state.conn.camera.bottom = vh;
  state.conn.camera.updateProjectionMatrix();

  // Dispose previous lines. Three.js holds GPU buffers for geometry +
  // materials that don't auto-release; this loop is the price for
  // redrawing on every scroll tick.
  for (const line of state.conn.lines) {
    state.conn.scene.remove(line);
    if (line.geometry) line.geometry.dispose();
    if (line.material) line.material.dispose();
  }
  state.conn.lines.length = 0;

  // Faction connection style (dashed/red/chevroned for trajectory themes;
  // default solid accent otherwise). Computed once per draw.
  const style = _connStyle();

  // Session threads first (alt-layout modes only) — independent of
  // reflection lines below, so they still appear when there are no
  // reflection cells in view.
  const layoutMode = getLayoutMode();
  if (layoutMode === "treemap" || layoutMode === "organic") {
    _drawSessionThreads(T, style);
  }

  const reflections = document.querySelectorAll(".cell-reflection[data-source-ids]");
  if (!reflections.length) {
    state.conn.renderer.render(state.conn.scene, state.conn.camera);
    if (state.conn.lines.length && !state.conn.animating) {
      state.conn.animating = true;
      state.conn.startTime = performance.now();
      requestAnimationFrame(_connAnimate);
    }
    return;
  }

  const inView = (r) => r.bottom > 0 && r.top < vh;

  for (const refl of reflections) {
    const reflRect = refl.getBoundingClientRect();
    if (!inView(reflRect)) continue;
    const reflCx = reflRect.left + reflRect.width / 2;

    // First pass: classify sources as in-view / off-below / off-above
    // so we can fan the off-screen stubs across the reflection's edge
    // instead of stacking them all at the same X.
    const sourceIds = (refl.dataset.sourceIds || "").split(",").filter(Boolean);
    const sources = sourceIds.map(sid => {
      const el = document.getElementById(sid);
      if (!el) return null;
      const sr = el.getBoundingClientRect();
      let bucket;
      if (inView(sr)) bucket = "in";
      else if (sr.top >= reflRect.bottom) bucket = "below";
      else bucket = "above";
      return { sid, sr, bucket };
    }).filter(Boolean);

    const stubsBelow = sources.filter(s => s.bucket === "below");
    const stubsAbove = sources.filter(s => s.bucket === "above");
    const drawStubFan = (stubs, dir) => {
      if (!stubs.length) return;
      // Anchor at the reflection's edge in the direction-of-source.
      // Skip when that edge isn't visible — no useful place to draw
      // a directional indicator the user can see.
      const refEdge = dir === "below" ? reflRect.bottom : reflRect.top;
      if (dir === "below" && (refEdge >= vh || refEdge < 0)) return;
      if (dir === "above" && (refEdge <= 0 || refEdge > vh)) return;
      const baseY = refEdge;
      const endY = dir === "below"
        ? Math.min(vh - 2, baseY + 60)
        : Math.max(2, baseY - 60);
      if (Math.abs(endY - baseY) < 16) return;  // too short — would read as a glitch
      // Fan stubs across the reflection's edge so multiple off-screen
      // sources don't stack at the same X. Width capped at the
      // reflection's own width minus padding.
      const fanWidth = Math.min(reflRect.width - 48, stubs.length * 26);
      const fanLeft = reflCx - fanWidth / 2;
      stubs.forEach((_, i) => {
        const x = stubs.length === 1
          ? reflCx
          : fanLeft + (i + 0.5) * (fanWidth / stubs.length);
        const stubPoints = [
          new T.Vector3(x, baseY, 8),
          new T.Vector3(x, endY, 8),
        ];
        _connMakeLine(T, stubPoints, style, style.color, 0.55);
      });
    };
    drawStubFan(stubsBelow, "below");
    drawStubFan(stubsAbove, "above");

    for (const s of sources) {
      if (s.bucket !== "in") continue;
      const sid = s.sid;
      const srcRect = s.sr;
      const srcInView = true;

      // Full curve. Anchor reflection at source-aligned X (clamped to
      // its bounds), pick nearest vertical edges, sample a cubic
      // bezier in XY with a forward Z-arc through the middle.
      const srcCx = srcRect.left + srcRect.width / 2;
      const reflAnchorX = Math.max(
        reflRect.left + 24,
        Math.min(reflRect.right - 24, srcCx),
      );
      let srcY, reflY;
      if (srcRect.top >= reflRect.bottom) {
        srcY = srcRect.top; reflY = reflRect.bottom;
      } else if (srcRect.bottom <= reflRect.top) {
        srcY = srcRect.bottom; reflY = reflRect.top;
      } else {
        srcY = srcRect.top + srcRect.height / 2;
        reflY = reflRect.top + reflRect.height / 2;
      }
      if (Math.abs(srcY - reflY) < 50) continue;
      const midY = (srcY + reflY) / 2;

      const points = [];
      const steps = 28;
      const maxZ = 40;  // px of forward arc; tune for parallax feel
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Cubic bezier with control points anchoring near each endpoint X.
        const u = 1 - t;
        const x = u*u*u*srcCx + 3*u*u*t*srcCx + 3*u*t*t*reflAnchorX + t*t*t*reflAnchorX;
        const y = u*u*u*srcY + 3*u*u*t*midY + 3*u*t*t*midY + t*t*t*reflY;
        const z = maxZ * Math.sin(t * Math.PI);  // bow forward in middle
        points.push(new T.Vector3(x, y, z));
      }
      _connMakeLine(T, points, style, style.color, 0.45);
      if (style.chevrons) _connChevrons(T, points, style.color, 0.5);
    }
  }

  state.conn.renderer.render(state.conn.scene, state.conn.camera);
  // Kick the continuous animation loop if there's anything to animate.
  if (state.conn.lines.length && !state.conn.animating) {
    state.conn.animating = true;
    state.conn.startTime = performance.now();
    requestAnimationFrame(_connAnimate);
  }
}

// Cells from the same Claude Code session, linked chronologically
// (DOM order, since cells render reverse-chrono). Colors cycle per
// session via a fixed palette so threads stay visually distinct
// without becoming theme-dependent.
const _sessionThreadPalette = [
  0x66ccff, 0xff9966, 0x99ff66, 0xff66cc,
  0xccff66, 0x66ffcc, 0x9966ff, 0xffcc66,
  0xcc99ff, 0x66ff99, 0xff6666, 0x99ccff,
];
const _sessionColorMap = new Map();
function _colorForSession(sid) {
  if (_sessionColorMap.has(sid)) return _sessionColorMap.get(sid);
  const c = _sessionThreadPalette[_sessionColorMap.size % _sessionThreadPalette.length];
  _sessionColorMap.set(sid, c);
  return c;
}
function _drawSessionThreads(T, style) {
  style = style || { dashed: false, chevrons: false };
  const cells = document.querySelectorAll("#notebook > .cell[data-session-id]");
  if (!cells.length) return;
  const groups = new Map();
  for (const cell of cells) {
    if (getComputedStyle(cell).display === "none") continue;
    const sid = cell.dataset.sessionId;
    if (!groups.has(sid)) groups.set(sid, []);
    groups.get(sid).push(cell);
  }
  for (const [sid, group] of groups) {
    if (group.length < 2) continue;
    const colorHex = _colorForSession(sid);
    const color = new T.Color(colorHex);
    for (let i = 0; i < group.length - 1; i++) {
      const ar = group[i].getBoundingClientRect();
      const br = group[i + 1].getBoundingClientRect();
      const ax = ar.left + ar.width / 2;
      const ay = ar.top + ar.height / 2;
      const bx = br.left + br.width / 2;
      const by = br.top + br.height / 2;
      // Z=2 keeps session threads slightly behind the reflection
      // arcs (which use Z=4-8) so they read as ambient backbone.
      const pts = [new T.Vector3(ax, ay, 2), new T.Vector3(bx, by, 2)];
      _connMakeLine(T, pts, style, color, 0.4);
      if (style.chevrons) _connChevrons(T, pts, color, 0.45);
    }
  }
}

// Continuous animation: pulse line opacity over time so the connections
// feel alive (signal flow). Stops automatically when the line set is
// empty (no reflections in viewport) and resumes on next draw.
function _connAnimate(now) {
  if (!state.conn.lines.length) {
    state.conn.animating = false;
    return;
  }
  const elapsed = (now - state.conn.startTime) / 1000;
  for (const line of state.conn.lines) {
    if (!line.material) continue;
    // Slow opacity wobble, +/- 0.15 around base. Phase offset by line
    // index would be nicer but keeping simple — uniform pulse reads
    // as "the whole network is alive".
    const base = line.material.userData?.baseOpacity ?? line.material.opacity;
    if (line.material.userData?.baseOpacity === undefined) {
      line.material.userData.baseOpacity = base;
    }
    line.material.opacity = base + 0.15 * Math.sin(elapsed * 1.8);
  }
  state.conn.renderer.render(state.conn.scene, state.conn.camera);
  requestAnimationFrame(_connAnimate);
}

window.addEventListener("scroll", scheduleRedrawConnections, { passive: true });
window.addEventListener("resize", scheduleRedrawConnections);

// Tag cells that overflow their height cap so the bottom-fade gradient
// only renders where it's needed. Without this, every short cell gets
// a spurious fade. Re-runs on resize and on retries after fresh mints
// (async vega/mermaid/scene3d content settles in over a few seconds).
function scheduleCheckOverflow() {
  if (state.rendering.overflowPending) return;
  state.rendering.overflowPending = true;
  requestAnimationFrame(() => {
    state.rendering.overflowPending = false;
    document.querySelectorAll("#notebook .cell").forEach(c => {
      const overflows = c.scrollHeight > c.clientHeight + 2;
      c.classList.toggle("cell-overflow", overflows);
    });
  });
}
window.addEventListener("resize", scheduleCheckOverflow);

function flashHud() {
  const hud = document.getElementById("hud");
  hud.classList.add("hud-flash");
  setTimeout(() => hud.classList.remove("hud-flash"), 700);
}

// Live elapsed-since-last-mint tick. Updates a dedicated SINCE.LAST slot
// every second so the HUD feels alive between polls without fighting the
// loadHud poll over the STATUS slot. Direct textContent mutation; no
// typeInto, no animation. The pulse dot still encodes activity recency
// via the hud[data-status] attribute set by loadHud.
function tickSinceLast() {
  const e = document.getElementById("hud-elapsed-val");
  if (!e) return;
  if (!state.hud.lastMintTs) { e.textContent = "—"; return; }
  const t = Date.parse(state.hud.lastMintTs);
  if (Number.isNaN(t)) { e.textContent = "—"; return; }
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  e.textContent = formatElapsed(sec);
}

function formatElapsed(sec) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m${sec % 60}s`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d`;
}

// Multi-stream arc step 3: when 2+ sessions are selected via the
// HUD dropdown, the notebook switches from a single responsive grid
// to a flex-row of per-session columns. Each column is a vertical
// stack of that session's cells (newest at top); each column's
// :first-child still gets hero treatment via the existing CSS rule.
// Single-session and unscoped views remain in single-grid mode.
// ?session=auto explicitly tiles all sessions into the single grid
// instead of spawning per-session columns; columns crush at N>5
// sessions, the grid auto-fits the viewport.
function isMultiStream() {
  if (state.sessions.autoMode) return false;
  return state.sessions.active.size >= 2;
}
// Cap visible cells in auto-mode so the grid fits the viewport without
// vertical scroll. Default 12 ≈ 1 hero + 3-4 cols × 3 rows of ambient
// cells at typical 1800×1000 viewports. ?max=N overrides for larger
// screens or power-user density preferences. Organic mode bumps to
// 19 (1 hero + 3 concentric rings of 6) — those rings extend the
// notebook past one viewport, vertical scroll engages.
function getVisibleCap() {
  try {
    const v = new URLSearchParams(window.location.search).get("max");
    const n = v ? parseInt(v, 10) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  } catch (e) { /* fallthrough */ }
  const entry = LAYOUT_REGISTRY[getLayoutMode()];
  return (entry && entry.cap) || 12;
}
// ?recent=N: cap the rendered grid to the last N cells regardless of
// session/auto mode. Default behavior (no param) still renders everything
// — keeps backwards compat. Acts as the user-facing "the bottom of the
// transcript is dead substrate, just stop rendering it" knob. Distinct
// from ?max=N which is auto-mode's hero-cell cap; ?recent=N is the
// general transcript-tail cap.
function getRecentCap() {
  try {
    const v = new URLSearchParams(window.location.search).get("recent");
    const n = v ? parseInt(v, 10) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  } catch (e) { /* fallthrough */ }
  return null;
}
// =============================================================
// Layout registry. Each layout is a self-contained entry with an
// `apply()` callback. To add a new layout (e.g. an LCARS-themed
// asymmetric-panel mode, a Muuri-driven drag-arrangeable mode, or a
// jsPlumb-routed graph mode):
//   1. Write a function that absolutely-positions the existing
//      `#notebook > .cell` elements (or invokes a 3rd-party lib that
//      does so).
//   2. Register it below with `id`, `label`, `description`, and
//      `apply`. Optional `cap` overrides getVisibleCap().
//   3. `getLayoutMode()` validates against the registry, the LAYOUT
//      dropdown auto-lists the entry, `applyActiveLayout()` dispatches.
//
// No other code path needs to change — keep this contract.
// =============================================================
const LAYOUT_REGISTRY = {
  // `grid` and `treemap` removed 2026-05-01 — user: "drop grid and treemap
  // this is much better." `pack` (Muuri rock-sand bin pack, fillGaps:true)
  // subsumes both: keeps natural sizes (unlike treemap's proportional
  // squish) and fills gaps (unlike grid's flex-wrap whitespace). Per
  // memory/feedback_pack_layout_validated.md.
  organic: {
    id: "organic",
    label: "organic",
    description: "concentric rings, FUI feel",
    apply: () => applyOrganicLayout(),
    cap: 7,
  },
  scatter: {
    id: "scatter",
    label: "scatter",
    description: "overlapping windows pile",
    apply: () => applyScatterLayout(),
    cap: 12,
  },
  tactical: {
    id: "tactical",
    label: "tactical",
    description: "asymmetric command center — hero left, stack right",
    apply: () => { /* CSS grid handles it */ },
  },
  terminal: {
    id: "terminal",
    label: "terminal",
    description: "single-column CRT stream",
    apply: () => { /* CSS block handles it */ },
  },
  cockpit: {
    id: "cockpit",
    label: "cockpit",
    description: "command center — center nav-plot, L/R telemetry rails, bottom log band",
    // Positioning is pure CSS grid (#notebook[data-layout="cockpit"]). apply()
    // only tags side-rail cells so CSS can angle them inward (curved-cockpit
    // tilt) — it never sets positions. MarsBlue's default layout.
    apply: () => applyCockpitRailTags(),
    // 3 columns × ~2 rows at typical res (user 2026-05-28: "if you're going to
    // have 3 cols then you can have only 1-2 rows"). Hero spans both center rows;
    // the rest are 2 rails per side. Few, large, fully-readable cells, no scroll
    // and no vertical clipping. Full corpus lives in the pack layout.
    cap: 5,
  },
  corners: {
    id: "corners",
    label: "corners",
    description: "Free Navy ops — 3 cells (TL/TR/BL) around the orbital plot + mesh",
    // Per refs/belter/bel_pPutN_076: the orbital tactical dominates the middle,
    // chrome cells ride 3 corners (BR ceded to the polar-mesh widget).
    // Differentiates drift from mars-blue (pack) and earth (warroom).
    apply: () => applyCornersLayout(),
    cap: 3,
  },
  warroom: {
    id: "warroom",
    label: "warroom",
    description: "UN situation room — cells ring a central holo-table",
    // Cells ring a reserved center where the earth situations-board is centered +
    // enlarged. One ring fit-to-viewport (no scroll). Few, large, readable cells
    // (like cockpit); the full corpus lives in pack. earth's default layout.
    // Cap 4: cells placed at diagonal corners (NW/NE/SE/SW). Earlier 6-at-60°
    // layout had right/left flank cells at sin±30° that overlapped (vertical
    // spacing = ry, but cellH > ry post-HUD-clamp). Diagonal corners give
    // vertical spacing ry·√2 ≈ 1.414·ry — much more generous, no overlap at
    // realistic cellH. 4 stations also reads as the canonical UN war-room
    // (command / weapons / sensors / comms around a holo-table).
    apply: () => applyWarroomLayout(),
    cap: 4,
  },
  "pack-hero": {
    id: "pack-hero",
    label: "pack-hero",
    description: "tiled cells in 4 strips around a reserved central hero",
    // Reserves a center rect for a hero board (e.g. earth's situations-plot).
    // Distributes cells into 4 perimeter strips: top, bottom, left, right.
    // Each strip flows L→R or T→B. Cells stay visible AND the hero stays
    // dominant in the center. Per user request 2026-06-08 ("pack but with
    // a reserved spot in the center for the hero cell, tiled grid around").
    apply: () => applyPackHeroLayout(),
    // Cap 4: 1 right of hero + 3 below. User 2026-06-08: 5 was still too
    // many; 4 cells around a hero gives proper breathing room.
    cap: 4,
  },
  pack: {
    id: "pack",
    label: "pack",
    description: "rock-sand bin pack (Muuri, fillGaps)",
    apply: () => applyPackLayout(),
    // Cap: Muuri's layout work is O(n²)-ish in fillGaps mode; 1000+ items
    // freezes the browser. 60 keeps the pack responsive while showing far
    // more density than treemap (cap 8). Tunable; raise as Muuri proves
    // it can absorb more.
    cap: 60,
  },
  // mixed3d: 2D/3D hybrid family — cells mounted as CSS3DObjects on
  // arrangement-defined surfaces (towers / planes-on-wall / floating-grid)
  // inside a Three.js WebGL world (floor circuits, particles, lights, fog).
  // World layer is native Three.js so VR (WebXR) can occupy the same
  // scene later by swapping CSS3D cells for canvas-textured planes.
  // Per memory/gibson_layout_arc.md.
  // Theme tokens drive arrangement/camera/material via TOKENS.mixed3d.
  // hackers theme is the seed (canyon-of-towers + dolly-canyon + glass).
  mixed3d: {
    id: "mixed3d",
    label: "mixed3d",
    description: "3D world + cells on glass faces (gibson-style)",
    apply: () => applyMixed3DLayout(TOKENS.mixed3d || {}),
    // Cap: 100 towers × 145 slots = 14500 physical capacity. 15000
    // covers it with a bit of slack for live mints arriving on top
    // of a fully populated historical baseline. Texture mem worst
    // case ~1.15GB (15000 × 80×240×4); modern GPUs handle this but
    // if it bites, drop _mixed3dCellTexture canvas dims to 64×192.
    cap: 15000,
  },
  // Reference list: memory/window_layout_libs.md.
};
// Apply token-declared layout preference as default when no ?layout= override.
// Runs here so LAYOUT_REGISTRY is already defined above.
// Expose registries on window for the puppeteer smoke runner
// (tools/smoke_themes.mjs).  Dev-only probe — same shape as
// window._debugState above.  Adding a theme/layout doesn't require
// updating the smoke runner; it re-reads on each launch.
if (typeof window !== "undefined") {
  window._debugTHEME_REGISTRY = THEME_REGISTRY;
  window._debugLAYOUT_REGISTRY = LAYOUT_REGISTRY;
}
(function applyTokenLayout() {
  const urlLayout = new URLSearchParams(window.location.search).get("layout");
  if (!urlLayout && TOKENS.layout && LAYOUT_REGISTRY[TOKENS.layout]) {
    const url = new URL(window.location.href);
    url.searchParams.set("layout", TOKENS.layout);
    history.replaceState(null, "", url.toString());
  }
})();

function getLayoutMode() {
  try {
    const v = (new URLSearchParams(window.location.search).get("layout") || "").trim();
    if (v && LAYOUT_REGISTRY[v]) return v;
  } catch (e) { /* fallthrough */ }
  return "pack";  // pack replaced the grid default 2026-05-01
}
function sessionKey(c) {
  return c.session_id || "untagged";
}
// Find or create the column wrapper for a session in multi-stream mode.
function ensureSessionColumn(sid) {
  const root = document.getElementById("notebook");
  let col = root.querySelector(`.session-column[data-sid="${CSS.escape(sid)}"]`);
  if (col) return col;
  col = el("div", "session-column");
  col.dataset.sid = sid;
  const header = el("div", "session-column-header", sid.slice(0, 12));
  col.appendChild(header);
  root.appendChild(col);
  return col;
}

async function load() {
  // Boot perf probe (gated on URL ?perf=1 to keep prod silent).
  // Investigating 9–11s frame-stall freezes at boot reported
  // 2026-05-04. Suspect: synchronous DOM render of 14k cells in the
  // loop near line 2296. Probe marks fetch/parse/render-loop batches
  // and total. Read with: ?theme=hackers&layout=mixed3d&perf=1
  const _PERF = new URLSearchParams(window.location.search).get("perf") === "1";
  const _pT0 = performance.now();
  const _pLog = (label) => {
    if (_PERF) LOG.debug(`[load.perf] +${(performance.now() - _pT0).toFixed(0)}ms ${label}`);
  };
  _pLog("load() start");
  // Boot-overlay phase narration for ALL themes (mixed3d gets its own
  // per-phase text via _bootMark; this covers pack/scatter/cockpit/etc).
  // The previous flow showed "INITIALIZING" for 5-10s with no movement
  // while cells.json fetched + 60+ cells rendered — user reported as
  // a stall on first impression (parked_theme_polish: "fan loading the
  // URL sees no data for 10-15s, may close the tab").
  const _bootTitleSet = (txt) => {
    const el = document.querySelector("#boot-overlay .boot-title");
    if (el) el.textContent = txt;
  };
  if (getLayoutMode() !== "mixed3d") _bootTitleSet("FETCHING CELLS");
  const res = await fetch("cells.json", { cache: "no-store" });
  _pLog(`fetch returned (status=${res.status})`);
  const data = await res.json();
  _pLog(`json parsed (cells=${(data.cells || []).length})`);
  if (getLayoutMode() !== "mixed3d") _bootTitleSet("MOUNTING CELLS");
  // ?session=auto: discover every distinct session_id in the corpus and
  // mount one column per session. Cells without a session_id collapse
  // into the "untagged" pseudo-column.
  if (state.sessions.autoMode) {
    for (const c of data.cells) {
      if (c.replaced_by) continue;
      if (c.cell_type === "text" && c.attempted_cell_type) continue;
      state.sessions.active.add(c.session_id || "untagged");
    }
  }
  const visible = data.cells.filter(c => {
    if (c.cell_type === "text" && c.attempted_cell_type) return false;  // demoted by trivial-filter
    if (c.replaced_by) return false;                                     // superseded by a retrigger
    if (!matchesActiveSession(c)) return false;                          // ?session=<id> filter (step 2)
    if (isAwaitingMint(c)) return false;                                 // classifier picked but specialist never minted
    return true;
  });

  // Group cells that share a trigger_snippet so each can render as
  // "attempt N of M" rather than appearing as accidental duplicates.
  const snippetGroups = new Map();
  for (const c of visible) {
    if (!c.trigger_snippet) continue;
    if (!snippetGroups.has(c.trigger_snippet)) snippetGroups.set(c.trigger_snippet, []);
    snippetGroups.get(c.trigger_snippet).push(c.id);
  }

  // Lookup map for predecessor inlining (Task #79). Includes replaced
  // cells filtered out of `visible` above — those are the predecessors
  // we want to render compactly inside their successor.
  const cellsById = new Map();
  for (const c of data.cells) cellsById.set(c.id, c);
  state.rendering.cellsById = cellsById;

  const root = document.getElementById("notebook");
  if (isMultiStream()) {
    // Mission-control mode. One column per selected session; cells
    // routed into their column. Columns are pre-created in dropdown
    // order so a session with no cells still renders an empty column
    // (acts as a placeholder for "this session is being watched but
    // hasn't minted yet").
    root.dataset.mode = "multi-stream";
    for (const sid of state.sessions.active) ensureSessionColumn(sid);
    for (const c of visible) {
      const col = ensureSessionColumn(sessionKey(c));
      // Newest first within column — prepend AFTER the header.
      const headerEl = col.firstChild;
      col.insertBefore(renderCell(c, snippetGroups, cellsById), headerEl.nextSibling);
      state.rendering.renderedIds.add(c.id);
    }
  } else {
    root.dataset.mode = "single";
    // CSS hook for the auto-mode tightened layout (smaller max-heights
    // so the cap-N cells fit one viewport).
    if (state.sessions.autoMode) root.dataset.auto = "true";
    else delete root.dataset.auto;
    const layout = getLayoutMode();
    // Always set data-layout — every layout mode (including pack, the
    // default) needs CSS rules to switch off the base flex-wrap.
    root.dataset.layout = layout;
    // Reverse-chrono render: newest cells live at the top so they're
    // immediately visible without autoscroll. Iterating chronologically
    // and prepending each puts the last (newest) cell at the very top.
    // In auto-mode, cap to the trailing N cells so the grid fits the
    // viewport — older cells are still in cells.json, just not on screen.
    const recentCap = getRecentCap();
    // Layout cap applies even in non-auto mode now. Pre-2026-04-29 the
    // LAYOUT_REGISTRY[*].cap was only enforced when state.sessions.autoMode
    // was true; selecting scatter (cap:12) on the full corpus tried to
    // absolute-position 1000+ cells and froze the browser. User reported
    // 2026-04-29 ("scatter also seems to have crashed or frozen the browser").
    // Now: layouts with a declared cap use it always; grid (no cap) keeps
    // the original "render everything" behavior.
    const layoutEntry = LAYOUT_REGISTRY[getLayoutMode()];
    const layoutCap = layoutEntry && layoutEntry.cap;
    let tail;
    if (state.sessions.autoMode) tail = visible.slice(-getVisibleCap());
    else if (recentCap) tail = visible.slice(-recentCap);
    else if (layoutCap) tail = visible.slice(-layoutCap);
    else tail = visible;
    _pLog(`render loop start (tail.len=${tail.length}, cap=auto:${state.sessions.autoMode}/recent:${recentCap}/layout:${layoutCap})`);
    let _renderedSinceMark = 0;
    let _lastMarkT = performance.now();
    for (const c of tail) {
      root.prepend(renderCell(c, snippetGroups, cellsById));
      state.rendering.renderedIds.add(c.id);
      _renderedSinceMark++;
      if (_PERF && _renderedSinceMark >= 1000) {
        const _now = performance.now();
        LOG.debug(`[load.perf] +${(_now - _pT0).toFixed(0)}ms rendered ${_renderedSinceMark} cells in ${(_now - _lastMarkT).toFixed(0)}ms (avg ${((_now - _lastMarkT) / _renderedSinceMark).toFixed(2)}ms/cell)`);
        _renderedSinceMark = 0;
        _lastMarkT = _now;
      }
    }
    _pLog(`render loop done`);
  }

  // Hero "still warm" treatment: the most-recent visible cell gets a
  // subtle glow that fades over ~60s. Survives across renders by
  // looking at timestamp on each load.
  applyStillWarmToLatest();
  _pLog("applyStillWarmToLatest done");
  // Click-to-zoom: clicking a cell's body (not its interactive children)
  // promotes it to a centered overlay at near-viewport size. Escape or
  // click-on-backdrop dismisses. Opt-in inspection without disturbing
  // the live grid. Idempotent — safe to call after each load().
  setupCellZoom();
  _pLog("setupCellZoom done");
  // Apply alternate layouts (treemap / organic) if URL opted in.
  // Default grid stays as-is. Run after the substrate-async settles
  // so cell heights are stable when squarify reads them.
  applyActiveLayout();
  _pLog("applyActiveLayout #1 done");
  setTimeout(applyActiveLayout, 600);
  setTimeout(applyActiveLayout, 2000);
  // Initial draw of inter-cell connections; subsequent redraws fire
  // on scroll/resize and after liveAppendNewCells.
  scheduleRedrawConnections();
  // Tag cells whose content exceeds the height cap so the fade
  // gradient renders only where needed.
  scheduleCheckOverflow();
  _pLog("load() complete");
  // Dismiss the boot overlay AFTER all layout iterations have settled —
  // applyActiveLayout runs at +0, +600, +2000ms, plus ephemeral cells slot
  // in between renders. Previously this dismissed after the FIRST pass and
  // the user saw subsequent re-layouts/ephemeral inserts behind the
  // already-cleared overlay (the "couple of waves of ugly loading").
  // 2200ms = the last delayed layout + a one-frame buffer.
  // mixed3d themes still gate boot on the WebGL stable-frame counter
  // (see applyMixed3DLayout tick), so this branch leaves them alone.
  if (!document.body.classList.contains("booted")
      && getLayoutMode() !== "mixed3d") {
    setTimeout(() => document.body.classList.add("booted"), 2500);
  }
  // Catch async-loaded content (vega/mermaid/scene3d) that resolves
  // after first layout — re-check at intervals during the first
  // few seconds of page life.
  setTimeout(scheduleCheckOverflow, 500);
  setTimeout(scheduleCheckOverflow, 1500);
  setTimeout(scheduleCheckOverflow, 3000);
}

// Tag the most-recent cell with .cell-still-warm. The CSS animates the
// glow's opacity from full → none over ~60s, so a "fresh-on-load" cell
// reads as still settling. New cells from liveAppendNewCells also get
// this treatment via the cell-fresh path. Reverse-chrono: newest is at
// index 0 (the first .cell in document order is the most-recent mint).
// applyTreemapLayout removed 2026-05-01 — pack mode (Muuri rock-sand)
// replaced grid+treemap as the default; treemap's proportional squish
// of cells was the load-bearing complaint in user feedback. The
// d3-hierarchy import is kept because the *treemap substrate type*
// (cell_type === "treemap") still uses it for in-cell rendering. Per
// memory/feedback_pack_layout_validated.md.

// ----------------------------------------------------------------
// Pack layout (Muuri, fillGaps:true). Rock-sand packing — cells keep
// their natural sizes and small cells fill gaps under tall ones, fixing
// the wasted-whitespace mode of the default flex layout AND the squish-
// everything-proportional mode of treemap. User-flagged 2026-05-01:
// "could replace both grid and treemap probably".
//
// Singleton Muuri instance kept on window so we can destroy() before
// re-init (e.g. user switches treemap → pack → treemap → pack).
// ----------------------------------------------------------------
let _muuriGrid = null;

// Livefeed re-pack: a single applyActiveLayout() at append time misses
// substrates that lazy-mount async (vega/scene3d/mermaid), leaving
// fresh cells with offsetWidth=0 — applyPackLayout drops them from
// the sized filter and they stack at default coords. Mirror the
// initial-load retry cadence (600ms / 2000ms) and debounce across
// rapid polls so consecutive appends share one retry burst.
let _liveLayoutRetryTimers = [];
function scheduleLiveLayoutRetries() {
  for (const t of _liveLayoutRetryTimers) clearTimeout(t);
  _liveLayoutRetryTimers = [
    setTimeout(applyActiveLayout, 600),
    setTimeout(applyActiveLayout, 2000),
  ];
}

// ResizeObserver-driven re-pack: substrates hydrate over many seconds
// (some mermaid renders take 3s+) and Muuri positions cells at their
// initial offsetWidth. Once a cell grows past its old natural size, it
// overlaps neighbors and stays overlapped until the next live-append
// triggers the noop re-pack path. The 600ms/2000ms retries cover boot
// but not the long tail. This watcher coalesces size changes through a
// 250ms debounce, then asks Muuri to refresh + re-layout. User
// 2026-05-22 cell-overlap audit on hackers/pack + conclave/pack.
let _packResizeObserver = null;
let _packResizeTimer = null;
function _packScheduleRepack() {
  if (_packResizeTimer) clearTimeout(_packResizeTimer);
  _packResizeTimer = setTimeout(() => {
    _packResizeTimer = null;
    if (_muuriGrid) {
      try {
        _muuriGrid.refreshItems();
        _muuriGrid.layout(false);
      } catch (e) { /* best-effort */ }
    }
  }, 250);
}
function _packGetObserver() {
  if (!_packResizeObserver && typeof ResizeObserver !== "undefined") {
    _packResizeObserver = new ResizeObserver(_packScheduleRepack);
  }
  return _packResizeObserver;
}

function applyPackLayout() {
  const root = document.getElementById("notebook");
  window._lucidaPackDebug = window._lucidaPackDebug || { calls: [] };
  const dbg = { ts: Date.now(), root: !!root, hasMuuri: !!window.Muuri };
  if (!window.Muuri) {
    // Muuri loads async via CDN; if not ready, the apply retries at 600ms
    // and 2000ms (called by the load() flow) will catch up. As a
    // safety net for "Muuri CDN failed entirely", strip data-layout so
    // the base flex-wrap CSS takes over instead of leaving cells
    // position:absolute and stacked at (0,0).
    dbg.bail = "no-muuri";
    window._lucidaPackDebug.calls.push(dbg);
    if (root) delete root.dataset.layout;
    return;
  }
  // Tear down any prior alternate-layout inline styles so Muuri has a
  // clean slate. Treemap leaves left/top/width/height set on each cell;
  // those would override Muuri's transform-based positioning.
  //
  // Only safe to clear when we DON'T already have a Muuri grid — once
  // Muuri owns the items, its internal positions are the source of truth
  // and we'd wipe them on every poll-tick re-apply (2026-05-19 bug:
  // cells were stacked at container origin because the noop incremental
  // path wiped transforms without re-laying out). Width/height stay
  // untouched too; Muuri caches them on item construction.
  const cells = [...root.querySelectorAll(":scope > .cell")];
  if (!_muuriGrid) {
    cells.forEach(c => {
      c.style.left = "";
      c.style.top = "";
      c.style.width = "";
      c.style.height = "";
      c.style.maxHeight = "";
      c.style.maxWidth = "";
      c.style.zIndex = "";
      c.style.transform = "";
    });
  }
  // Reset container — Muuri requires position: relative on the parent
  // and absolute on items. Height auto-grows via Muuri's layout calc.
  root.style.height = "";
  root.style.minHeight = "";
  // Defer construction until cells actually have non-zero offsetWidth.
  // Muuri caches _width / _height on item construction; if every cell
  // has size 0 at that moment (substrates lazy-mount async), refreshItems
  // doesn't reliably re-read them, so the grid stays stuck at 0×0
  // stacked at (0, 0). Easier to wait + (re)construct fresh than to
  // chase Muuri's refresh semantics.
  const itemEls = [...root.children].filter(el => el.classList.contains("cell"));
  const sized = itemEls.filter(el => el.offsetWidth > 0 && el.offsetHeight > 0);
  dbg.itemCount = itemEls.length;
  dbg.sizedCount = sized.length;
  if (sized.length === 0) {
    dbg.bail = "no-sized-items-yet";
    window._lucidaPackDebug.calls.push(dbg);
    return; // retry timer (600ms / 2000ms) catches up after hydration
  }
  // Incremental path — when Muuri already exists for this root, just
  // sync new and removed items to the existing grid. This preserves
  // existing items' positions instead of clearing all transforms +
  // re-snapping (which read as "everything flies around" on cell
  // append). Only the destroy-recreate path runs on initial mount or
  // after teardownPackLayout (layout-mode switch).
  if (_muuriGrid) {
    try {
      const muuriItems = _muuriGrid.getItems();
      const muuriEls = new Set(muuriItems.map(i => i.getElement()));
      const sizedSet = new Set(sized);
      // Drop items whose DOM nodes are no longer in the container
      // (cap eviction / session clear / remove-from-cellsjson). Keeps
      // Muuri's getItems() honest so future fillGaps work doesn't
      // try to position phantom items.
      const stale = muuriItems.filter(i => !sizedSet.has(i.getElement()));
      if (stale.length) {
        const ro = _packGetObserver();
        if (ro) stale.forEach(i => { try { ro.unobserve(i.getElement()); } catch (e) {} });
        _muuriGrid.remove(stale, { layout: false });
      }
      const fresh = sized.filter(el => !muuriEls.has(el));
      if (fresh.length) {
        // 2026-05-24: replaced visibility:hidden with .pack-prep class
        // (opacity:0 + 0.4s transition). visibility:hidden race could
        // leave cells permanently invisible if Muuri's layout callback
        // didn't fire (60 cells observed stuck-hidden after multi-nav).
        // Opacity-with-transition is self-healing — even if unhide
        // never runs, the transition fires once we remove the class.
        fresh.forEach(el => { el.classList.add("pack-prep"); });
        _muuriGrid.add(fresh, { layout: false });
        const ro = _packGetObserver();
        if (ro) fresh.forEach(el => { try { ro.observe(el); } catch (e) {} });
      }
      if (stale.length || fresh.length) {
        // Refresh sizes too — fresh items just hydrated and their
        // existing siblings may have grown into their natural sizes
        // since the last layout pass (substrates lazy-mount async).
        _muuriGrid.refreshItems();
        const _unprepFresh = () => fresh.forEach(el => {
          el.classList.remove("pack-prep");
        });
        _muuriGrid.layout(false, _unprepFresh);
        requestAnimationFrame(_unprepFresh);
        setTimeout(_unprepFresh, 300);
        dbg.path = "incremental";
        dbg.added = fresh.length;
        dbg.removed = stale.length;
        window._lucidaPackDebug.calls.push(dbg);
        return;
      }
      // Noop path: no items changed but cells may have grown since the
      // last layout (substrates finishing async mount). Refresh sizes
      // and re-pack — without this, cells stay positioned for their
      // pre-hydration sizes and overlap once they've grown to natural
      // dimensions (2026-05-19 bug: 356 overlapping cell pairs).
      _muuriGrid.refreshItems();
      _muuriGrid.layout(false);
      dbg.path = "noop";
      window._lucidaPackDebug.calls.push(dbg);
      return;
    } catch (e) {
      // Fall through to destroy-recreate as the safe path.
      dbg.incrementalError = String(e);
      try { _muuriGrid.destroy(); } catch (e2) {}
      _muuriGrid = null;
      // Disconnect the ResizeObserver too — the new grid will create a
      // fresh one via _packGetObserver().observe(...). Otherwise the
      // surviving observer fires against detached elements from the
      // destroyed grid (already audit-flagged as a leak vector).
      if (_packResizeObserver) {
        try { _packResizeObserver.disconnect(); } catch (e3) {}
        _packResizeObserver = null;
      }
    }
  }
  dbg.path = "create";
  // Hide the entire container during destroy-recreate. Per-cell .pack-prep
  // was insufficient because cells added BETWEEN create and the unprep
  // sweep (the snap driver, transient spawner, live mints from cells.json)
  // hit the DOM before pack-prep got applied — flash at top-left, then
  // Muuri re-positions them. Container-level hide is bulletproof: nothing
  // inside #notebook paints until pack layout settles. User 2026-05-24
  // (third report): "ephemeral cells still appear briefly at load on top
  // of all the other cells then disappear."
  root.classList.add("pack-laying-out");
  _muuriGrid = new window.Muuri(root, {
    items: sized,
    // fillGaps:true is the load-bearing setting — small items fill
    // earlier gaps left by larger items, allowing the layout to deviate
    // a little from insertion order to maximize density. User signed
    // off on "rearrange (a little)" 2026-05-01.
    layout: { fillGaps: true, rounding: true },
    dragEnabled: false,
    // 250ms ease-out for incremental moves (e.g., _muuriGrid.add for a
    // transient cell, or fillGaps reflowing on insert). Initial
    // construction uses layoutOnInit:false + a manual instant layout
    // below so all 60+ cells don't fly in from (0,0). Show/hide
    // durations stay 0 — entrance animation lives in cell-fresh CSS,
    // not in Muuri's show pipeline.
    layoutDuration: 250,
    layoutEasing: "cubic-bezier(0.2, 0.85, 0.4, 1)",
    showDuration: 0,
    hideDuration: 0,
    layoutOnInit: false,
  });
  // Instant initial layout, then reveal the container. Belt-and-
  // suspenders reveal: layout(true) callback + rAF + 300ms safety, so
  // a callback race doesn't strand the container hidden. The opacity
  // transition on #notebook makes any reveal fire smoothly regardless
  // of which trigger fires first.
  const _packReveal = () => root.classList.remove("pack-laying-out");
  _muuriGrid.layout(true, _packReveal);
  requestAnimationFrame(_packReveal);
  setTimeout(_packReveal, 300);
  // Last-resort safety: 1.5s hard floor — even if every other trigger
  // somehow fails, the container is guaranteed visible after 1.5s.
  setTimeout(_packReveal, 1500);
  // Observe each cell for size changes — substrates hydrate async and
  // a late-growing cell would overlap neighbors without a re-pack.
  const ro = _packGetObserver();
  if (ro) sized.forEach(el => { try { ro.observe(el); } catch (e) {} });
  window._muuriGrid = _muuriGrid;
  window._lucidaPackDebug.calls.push(dbg);
}

// Tear down Muuri when leaving pack mode so its position:absolute styles
// don't fight the next layout. Called from applyActiveLayout when the
// active mode is NOT pack.
function teardownPackLayout() {
  if (!_muuriGrid) return;
  try {
    const items = _muuriGrid.getItems();
    const ro = _packGetObserver();
    items.forEach(it => {
      const el = it.getElement();
      if (ro) { try { ro.unobserve(el); } catch (e) {} }
      el.style.transform = "";
      el.style.position = "";
      el.style.left = "";
      el.style.top = "";
    });
    _muuriGrid.destroy();
  } catch (e) { /* best-effort */ }
  _muuriGrid = null;
  if (_packResizeTimer) { clearTimeout(_packResizeTimer); _packResizeTimer = null; }
}

// Cockpit layout (CSS-grid command-center): positioning is pure CSS via
// #notebook[data-layout="cockpit"] in notebook.css. This pass only TAGS the
// side-rail cells so CSS can angle them inward (the curved-cockpit tilt); it
// never sets positions. getBoundingClientRect() returns the POST-transform box,
// so we clear the tilt classes and force a reflow BEFORE reading rects — else
// the tags oscillate (a prior tilt shifts center-x and flips the next pass).
// Hoisted function declaration so LAYOUT_REGISTRY's deferred apply() resolves it.
function applyCockpitRailTags() {
  const root = document.getElementById("notebook");
  if (!root || root.dataset.layout !== "cockpit") return;
  // Composition capability: when the theme declares a composition mode,
  // dock cells by FUNCTION (role-based instrument slots) instead of by
  // DOM/recency order. Generic pass — reused by drift/unn compositions.
  if (TOKENS.composition) {
    root.dataset.composition = TOKENS.composition;
    applyCompositionSlots(root);
    return;
  }
  delete root.dataset.composition;
  const cells = [...root.querySelectorAll(":scope > .cell")];
  if (!cells.length) return;
  // 1) clear prior tilt so rects are read in the untilted state
  cells.forEach((c) => {
    c.classList.remove("cockpit-rail-left", "cockpit-rail-right");
  });
  // 2) force one reflow so the cleared geometry is current before measuring
  void root.offsetWidth;
  // 3) container center + a center-column dead band that stays flat
  const rootRect = root.getBoundingClientRect();
  const mid = rootRect.left + rootRect.width / 2;
  const band = rootRect.width * 0.18;
  // 4) tag rail cells by horizontal position; skip the hero (:first-child =
  //    center nav-plot) and any cell sitting in the center band.
  cells.forEach((cell, i) => {
    if (i === 0) return;
    const r = cell.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    if (cx < mid - band) cell.classList.add("cockpit-rail-left");
    else if (cx > mid + band) cell.classList.add("cockpit-rail-right");
  });
}

// Composition-as-instrument: cast every visible cell to a faction ROLE
// (_cellArchetypeRole) and dock it into a named SLOT — hero (center
// nav-plot), comp-rail-l / comp-rail-r (flanking telemetry), comp-dock
// (command-line log band stacked under the plot). The layout's CSS pins
// each slot; this pass only assigns the class + a CSS `order` so flow
// sequence is hero → rails (top, flanking) → dock (below the plot),
// regardless of the cells' chronological DOM order. Theme-agnostic: the
// same five slot classes are repositioned per-composition in CSS, so
// drift/unn reuse this core with their own slot geometry.
function applyCompositionSlots(root) {
  const SLOTS = ["comp-hero", "comp-rail-l", "comp-rail-r", "comp-dock", "comp-solo"];
  const cells = [...root.querySelectorAll(":scope > .cell")];
  cells.forEach((c) => {
    c.classList.remove(...SLOTS, "cockpit-rail-left", "cockpit-rail-right");
    c.style.order = "";
  });
  if (!cells.length) return;
  // Hero fitness by role: the nav-plot must read as a DISPLAY (a relational
  // map, a quant readout, a spatial scene) — never a text log. DOM index is
  // recency rank (cells prepend newest-first), so a lower index wins ties.
  const HERO_FIT = { relational: 4, spatial: 3, quant: 3, status: 1, text: 0 };
  const tagged = cells.map((cell, i) => {
    const role = _cellArchetypeRole(cell.dataset.cellType || "");
    return { cell, i, role, fit: HERO_FIT[role] ?? 0 };
  });
  let hero = tagged[0];
  for (const t of tagged) {
    if (t.fit > hero.fit || (t.fit === hero.fit && t.i < hero.i)) hero = t;
  }
  hero.cell.classList.add("comp-hero");
  hero.cell.style.order = "-1";
  // Remaining cells → flanking telemetry rails, alternating L/R for balance
  // (newest at each column top). The hero owns the full-height center; keeping
  // everything else in the side rails holds the panel to ~2 rows (no center
  // dock-stack, which would add rows and shrink every cell).
  let railN = 0;
  for (const t of tagged) {
    if (t === hero) continue;
    t.cell.classList.add(railN % 2 === 0 ? "comp-rail-l" : "comp-rail-r");
    t.cell.style.order = String(railN++);
  }
  // Degenerate early-session case (no telemetry yet): let the hero span the
  // full field so it isn't marooned in a single empty-flanked column.
  if (railN === 0) hero.cell.classList.add("comp-solo");
}

// Theme furniture / console-overlay layer. Fills #theme-furniture with a
// theme's decorative console framing. Dispatch mirrors _buildTransientBody:
// a theme without a builder is a no-op (empty overlay) so existing themes are
// untouched. CSS-positioned (corners/edges), so no resize redraw is needed.
// Part of the theming-flexibility foundation (chrome modes + furniture + type).
function mountThemeFurniture(theme) {
  const el = document.getElementById("theme-furniture");
  if (!el) return;
  el.innerHTML = "";
  el.removeAttribute("data-theme");
  // Furniture builder registry. THEME_REGISTRY[theme].furniture names the
  // builder key — themes can share a builder by naming the same key (mars-red
  // reuses mars-blue's MCRN bezel, so _both_ entries' furniture field reads
  // "mars-blue"). _buildFurnitureMarsBlue reads ACTIVE off the theme
  // registry so "MCRN MARS_RED" / "MCRN MARS_BLUE" labels stay correct
  // regardless of which entry triggered the build. Defined locally so
  // the const can't be in TDZ — mountThemeFurniture(ACTIVE) is called at
  // top level before this file position is reached.
  const FURNITURE_BUILDERS = {
    "mars-blue": _buildFurnitureMarsBlue,
    drift:       _buildFurnitureDrift,
    earth:       _buildFurnitureEarth,
  };
  const furnitureKey = THEME_REGISTRY[theme]?.furniture;
  if (!furnitureKey) return;
  const builder = FURNITURE_BUILDERS[furnitureKey];
  if (!builder) {
    console.warn(`[lucida] theme '${theme}' references furniture '${furnitureKey}' but no builder is registered`);
    return;
  }
  el.dataset.theme = furnitureKey;
  builder(el);
}

// Apply the active layout mode, if any. Called after load() and on
// window resize. No-op for grid mode (the CSS auto-fit handles it).
function applyActiveLayout() {
  const mode = getLayoutMode();
  // Center + enlarge the earth situations-board into the holo-table only in the
  // war-room ring layout (the ring is built around it); bottom-left otherwise.
  const _fur = document.getElementById("theme-furniture");
  if (_fur) {
    // fur-warroom == "board positioned + 2.4× scale" (now top-left for
    // pack-hero; previously centered for warroom — same class, same CSS).
    _fur.classList.toggle("fur-warroom", mode === "warroom" || mode === "pack-hero");
  }
  // Tear down Muuri before applying any non-pack layout, so its
  // absolute-positioned items don't fight the next mode's CSS / JS.
  if (mode !== "pack" && _muuriGrid) teardownPackLayout();
  // Tear down mixed3d when leaving — it lives in body-level overlays
  // (#mixed3d-wrap) and re-parents cells off #notebook, so other
  // layouts need them returned to the flat tree first.
  if (mode !== "mixed3d") teardownMixed3DLayout();
  const entry = LAYOUT_REGISTRY[mode];
  if (entry && typeof entry.apply === "function") entry.apply();
  // Inter-cell connection lines anchor to getBoundingClientRect, which
  // changes when cells are absolutely positioned by the layout funcs
  // above. Re-trigger the WebGL overlay so reflection edges + session
  // threads track the new positions.
  scheduleRedrawConnections();
  // Refresh the data-bound MCRN histogram band (mint activity over time).
  _updateMarsBlueHisto();
  // Refresh the data-bound Drift orbital plot (recent cells as contacts).
  _updateDriftOrbital();
  // Refresh the top-center hero band (callout · sparkline · ops).
  _updateDriftHero();
  // Refresh the data-bound EARTH situation-plot (recent cells as tracked contacts).
  _updateEarthTactical();
  // Kick off the 2s ambient ticker (idempotent — no-op after first start).
  _earthAmbientStart();
  // Track the live HUD height so the mars-blue cockpit panel (height:calc with
  // --hud-h) always ends just above the bottom band — the HUD can grow to a
  // second kill-meter row, which a hardcoded offset wouldn't survive.
  const _hud = document.querySelector("header");
  if (_hud) document.documentElement.style.setProperty("--hud-h", _hud.offsetHeight + "px");
}

// Re-apply on resize so tile sizes track the viewport.
let _layoutResizeTimer = null;
window.addEventListener("resize", () => {
  if (_layoutResizeTimer) clearTimeout(_layoutResizeTimer);
  _layoutResizeTimer = setTimeout(applyActiveLayout, 120);
});

// Click-to-zoom via native <dialog>. The browser handles focus trap,
// Escape-to-close, and the ::backdrop pseudo-element for free; we
// just clone the cell's DOM into the dialog on click. Per
// memory/window_layout_libs.md ("don't reinvent" — Radix/HeadlessUI
// modals exist, but the platform <dialog> is even simpler).
function setupCellZoom() {
  if (state.rendering._cellZoomBound) return;
  state.rendering._cellZoomBound = true;
  let dlg = document.getElementById("cell-zoom-dialog");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "cell-zoom-dialog";
    document.body.appendChild(dlg);
  }
  // Click on the dialog backdrop (the dialog element itself, but not
  // its descendants) closes the modal. Native <dialog> already closes
  // on Escape automatically.
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });
  document.addEventListener("click", (e) => {
    if (dlg.open) return;  // dialog handles its own clicks
    const cell = e.target.closest("#notebook > .cell");
    if (!cell) return;
    // Don't hijack clicks on inner interactive elements.
    if (e.target.closest(".cell-id, button, a, input, summary, details, details *")) return;
    // Clone the cell into the dialog. Cloning preserves rendered SVG
    // (mermaid) and html content; vega charts come along as a static
    // snapshot of their last render — fine for inspection mode.
    const clone = cell.cloneNode(true);
    clone.removeAttribute("style");  // strip layout-mode inline positioning
    clone.classList.add("cell-zoomed-clone");
    // Inspection-mode reset: the original cell ran with content sized
    // to natural intrinsic dimensions (mermaid SVG at viewBox px,
    // html-pan-wrap at max-content) which overflowed the dialog and
    // produced horizontal scrollbars on click. In the dialog the user
    // wants fit-to-view, not natural-overflow — reset the sizing so
    // content scales to the dialog width. Per user 2026-04-29.
    clone.style.removeProperty("--cell-natural-width");
    clone.style.maxHeight = "none";
    const cloneSvg = clone.querySelector(".mermaid-target svg");
    if (cloneSvg) {
      // Fit-to-view in the dialog: width:auto + height:auto with a
      // max-width AND max-height clamps preserves viewBox aspect
      // ratio while ensuring the SVG never exceeds the dialog box
      // (which would force a scrollbar). 75vh leaves headroom for
      // the cell-head + caption + trigger summary above the SVG.
      cloneSvg.style.width = "auto";
      cloneSvg.style.height = "auto";
      cloneSvg.style.maxWidth = "100%";
      cloneSvg.style.maxHeight = "75vh";
      cloneSvg.style.transform = "";
    }
    const cloneMermaidTarget = clone.querySelector(".mermaid-target");
    if (cloneMermaidTarget) {
      cloneMermaidTarget.style.maxHeight = "none";
      cloneMermaidTarget.style.overflow = "visible";
    }
    const cloneWrap = clone.querySelector(".html-pan-wrap");
    if (cloneWrap) {
      cloneWrap.style.width = "auto";
      cloneWrap.style.maxWidth = "100%";
      cloneWrap.style.minWidth = "0";
      cloneWrap.style.transform = "";
    }
    const cloneHtmlTarget = clone.querySelector(".html-target");
    if (cloneHtmlTarget) {
      cloneHtmlTarget.style.overflow = "auto";  // tables wider than dialog get a scrollbar inside the cell
    }
    dlg.replaceChildren(clone);
    dlg.showModal();

    // Re-embed any vega charts inside the clone — same canvas-cloning
    // problem as scene3d below: cloneNode(true) copies the <canvas>
    // element but it paints blank because canvas pixels don't survive
    // cloning. The spec is stashed on .vega-target's dataset at
    // render time so we can re-embed here with the dialog-sized
    // container.
    const cloneVegaTarget = clone.querySelector(".vega-target");
    if (cloneVegaTarget && cloneVegaTarget.dataset.vegaSpec && window.vegaEmbed) {
      cloneVegaTarget.innerHTML = "";
      requestAnimationFrame(() => {
        try {
          const rawSpec = JSON.parse(cloneVegaTarget.dataset.vegaSpec);
          // Re-strip URL-bearing fields and literal colors here too —
          // the dataset.vegaSpec carries the ORIGINAL spec, not the
          // already-stripped one used in the main render.
          const safeSpec = window.stripVegaLiteralColors
            ? window.stripVegaLiteralColors(rawSpec) : rawSpec;
          window.vegaEmbed(cloneVegaTarget, safeSpec, { actions: false, ...TC.vega }).catch(err => {
            cloneVegaTarget.textContent = "vega render error: " + err.message;
          });
        } catch (err) {
          console.warn("[lucida] vega zoom re-embed failed:", err);
        }
      });
    }
    // Re-instantiate any 3D scenes inside the clone — cloneNode(true) of
    // a <canvas> produces a blank canvas, so without re-init the dialog
    // shows nothing for scene3d cells. RAF defers until layout has
    // measured the dialog so initScene3D's clientWidth read is non-zero.
    const scene3dTarget = clone.querySelector(".scene3d-target");
    if (scene3dTarget && scene3dTarget.dataset.scene3dSpec) {
      scene3dTarget.innerHTML = "";  // remove the blank cloned canvas
      scene3dTarget.style.minHeight = "";
      requestAnimationFrame(() => {
        try {
          const spec = JSON.parse(scene3dTarget.dataset.scene3dSpec);
          const ctrl = initScene3D(scene3dTarget, spec, resolveColor);
          if (ctrl) {
            ctrl.play();
            dlg._zoomedCtrl = ctrl;
          }
        } catch (err) {
          console.warn("[lucida] scene3d zoom re-init failed:", err);
        }
      });
    }
  });
  // Tear down the re-instantiated scene when the dialog closes so it
  // doesn't keep a hidden Three.js render loop spinning.
  dlg.addEventListener("close", () => {
    if (dlg._zoomedCtrl) {
      try { dlg._zoomedCtrl.dispose(); } catch (e) {}
      dlg._zoomedCtrl = null;
    }
  });
}

function applyStillWarmToLatest() {
  document.querySelectorAll(".cell.cell-still-warm").forEach(n => {
    n.classList.remove("cell-still-warm");
  });
  if (isMultiStream()) {
    // Each column glows its own most-recent cell — independent
    // mission-control feeds, each with its own "live" indicator.
    document.querySelectorAll(".session-column").forEach(col => {
      const c = col.querySelector(".cell");
      if (c) c.classList.add("cell-still-warm");
    });
  } else {
    const cells = document.querySelectorAll(".cell");
    if (cells.length) cells[0].classList.add("cell-still-warm");
  }
}

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Map a substrate cell_type to a faction-archetype ROLE — the basis for a
// theme "skin"'s per-cell widget treatment. Coarser than the mixed3d
// archetype dispatch (roles, not shapes): quant=measured data, relational=
// graphs/paths, status=text/log/table, spatial=3d/image, text=fallback.
function _cellArchetypeRole(ctype) {
  switch (ctype) {
    case "vega": case "treemap": case "gauge": case "sparkline": case "coord_plot":
      return "quant";
    case "mermaid": case "force_graph": case "trajectory": case "timeline_ribbon":
      return "relational";
    case "html": case "code": case "ascii":
      return "status";
    case "scene3d": case "image": case "animated_svg":
      return "spatial";
    default:
      return "text";
  }
}

// XSS defense for LLM-emitted cell content. Cells of type html and
// animated_svg take strings produced by Claude specialists and inject
// them via innerHTML. A prompt-injected transcript could in principle
// hijack a specialist to emit <script>, on* handlers, or javascript:
// URLs that would execute in the dashboard's origin. DOMPurify is the
// industry-standard sanitizer (loaded from CDN with SRI above).
//
// Two profiles: html (general content) and svg (animated SVG cells).
// If DOMPurify failed to load (offline / CDN block), we degrade to a
// "no rich content" mode by returning a plain-text fallback wrapped
// in <pre> — readable but inert.
function _purifyHtml(s) {
  if (window.DOMPurify) {
    return DOMPurify.sanitize(String(s || ""), {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus"],
    });
  }
  const pre = document.createElement("pre");
  pre.textContent = String(s || "");
  return pre.outerHTML;
}
// Normalize a mermaid spec before parse/render: substrate emitters
// sometimes encode newlines as literal "\n" sequences (single-line JSON
// strings); mermaid interprets those literally, producing "(16 kHz mono)"
// rendering with literal "\n" in the box.  Actual statement-separator
// newlines are 0x0A characters and are not touched.  Shared with
// mixed3d.mjs's substrate renderer — exported so the slice can re-use.
export function _normalizeMermaidSpec(spec) {
  if (typeof spec !== "string") return spec;
  return spec.replace(/\\n/g, "<br/>");
}

function _purifySvg(s) {
  if (window.DOMPurify) {
    return DOMPurify.sanitize(String(s || ""), {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ["script", "foreignObject"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus"],
    });
  }
  return "";
}

// LLM-emitted html/animated_svg cells can embed a <style> block. A <style> in
// the light DOM is NOT scoped — selectors like `.cell`, `:root`, or `body` leak
// out and restyle the whole dashboard. (cell-6560: an animated_svg whose
// `.cell { opacity: 0 }` reset blanked every real cell on the page.) DOMPurify
// permits <style> for legit SVG/CSS animation, so after injecting we prefix
// each rule's selector with the cell's own id — styles still reach the cell's
// subtree (the SVG/HTML elements are descendants) but can no longer match
// sibling cells or document chrome. lazyMount runs render after the cell is
// connected, so styleEl.sheet is parsed; a one-frame retry covers the rare
// unparsed case. Mermaid is exempt (its <style> is already #m-<id>-scoped).
function _scopeCellStyles(container, scopeSel, _retry) {
  if (!container || !scopeSel) return;
  let anyUnparsed = false;
  container.querySelectorAll("style").forEach((styleEl) => {
    if (styleEl.dataset.lucidaScoped) return;
    const sheet = styleEl.sheet;
    if (!sheet) { anyUnparsed = true; return; }
    let rules;
    try { rules = sheet.cssRules; } catch (e) { styleEl.dataset.lucidaScoped = "1"; return; }
    const scopeOne = (rule) => {
      if (rule.type === CSSRule.STYLE_RULE) {
        try {
          rule.selectorText = rule.selectorText
            .split(",")
            .map((s) => scopeSel + " " + s.trim())
            .join(", ");
        } catch (e) { /* unsettable selector — leave it */ }
      } else if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
        for (const inner of rule.cssRules) scopeOne(inner);
      }
      // @keyframes / @font-face have no host-matching selector — left as-is.
    };
    for (const rule of rules) scopeOne(rule);
    styleEl.dataset.lucidaScoped = "1";
  });
  if (anyUnparsed && !_retry) {
    requestAnimationFrame(() => _scopeCellStyles(container, scopeSel, true));
  }
}

// Expose sanitizers on window for dev probes + the puppeteer-driven
// sanitization unit tests (tools/test_sanitization.mjs).  Same pattern
// as _debugTHEME_REGISTRY above.
if (typeof window !== "undefined") {
  window._purifyHtml = _purifyHtml;
  window._purifySvg = _purifySvg;
  window._scopeCellStyles = _scopeCellStyles;
}

// MutationObserver: when a cell is removed from #notebook (layout
// clear, session switch, live-feed eviction, etc.), disconnect its
// archetype-backdrop ResizeObserver so we don't leak. Audit
// 2026-05-23 found that 1300 ROs (one per cell from renderCell)
// were never disconnected on cell removal. Install once on first
// renderCell call.
function _ensureArchetypeBgCleanup() {
  if (window._archetypeBgMO) return;
  const root = document.getElementById("notebook");
  if (!root) return;
  const disconnectIn = (node) => {
    if (!node || node.nodeType !== 1) return;
    // The card itself, plus any descendants if a wrapper was removed.
    const cards = node.classList?.contains("cell") ? [node] : Array.from(node.querySelectorAll?.(".cell") || []);
    for (const card of cards) {
      if (card._archetypeBgRO) {
        try { card._archetypeBgRO.disconnect(); } catch (e) { /* ignore */ }
        card._archetypeBgRO = null;
      }
    }
  };
  window._archetypeBgMO = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const removed of m.removedNodes) disconnectIn(removed);
    }
  });
  window._archetypeBgMO.observe(root, { childList: true, subtree: true });
}

function renderCell(c, snippetGroups, cellsById, opts) {
  opts = opts || {};
  const card = el("article", "cell");
  if (c.id && !opts.compact) card.id = c.id;
  if (opts.compact) card.classList.add("cell-compact");
  // Theme-declared cell-frame chrome mode (tokens.json "chrome"): a theme can
  // restructure the cell frame (e.g. "instrument" = corner-tab header +
  // bracket corners) instead of the default card. Generic/opt-in — absent
  // token = today's card; an unknown mode yields an inert class. See
  // notebook.css ".cell-chrome-*". Per the theming-flexibility foundation.
  if (TOKENS.chrome) card.classList.add("cell-chrome-" + TOKENS.chrome);
  // Theme-declared cell SKIN (tokens.json "skin"): cast each cell into a
  // faction-archetype ROLE so content reads as an instrument widget (gauge /
  // nav-plot / telemetry) rather than a uniform chart-in-a-box. Generic/opt-in
  // like chrome — absent token = today's cell; styling lives in CSS under
  // ".cell-skin-<skin>" + ".cell-role-<role>". A small corner glyph badges the
  // role (gauge bars / target reticle / terminal prompt / spatial brackets).
  if (TOKENS.skin) {
    card.classList.add("cell-skin-" + TOKENS.skin);
    card.classList.add("cell-role-" + _cellArchetypeRole(c.cell_type));
    if (!opts.compact) {
      const mark = el("span", "cell-skin-mark");
      mark.setAttribute("aria-hidden", "true");
      card.appendChild(mark);
    }
  }
  if (c.cell_type) card.dataset.cellType = c.cell_type;
  // mixed3d colspan heuristic reads cell.dataset.mermaidSubtype to
  // decide which mermaid cells get colspan=2 (flowchart, timeline,
  // etc — wide-aspect diagrams). Without this attribute push, every
  // mermaid stayed at colspan=1 regardless of shape.
  if (c.mermaid_subtype) card.dataset.mermaidSubtype = c.mermaid_subtype;
  if (c.html_layout) card.dataset.htmlLayout = c.html_layout;
  // Session id on the card for the WebGL session-thread connection lines
  // (drawSessionThreads in alt-layout modes). Reflection source-ids
  // continue to live on .cell-reflection[data-source-ids] for the
  // existing reflection→source connection rendering.
  if (c.session_id) card.dataset.sessionId = c.session_id;
  // Recency anchor for tier-1 promotion bias — mixed3d's retier sweep
  // uses this to prefer recent cells when the camera approaches a face.
  if (c.timestamp) card.dataset.timestamp = c.timestamp;
  const sources = Array.isArray(c.reflection_source_ids) ? c.reflection_source_ids : [];
  if (sources.length > 0) {
    card.classList.add("cell-reflection");
    card.dataset.sourceIds = sources.join(",");
  }
  // Top-left cell head: dense, dynamic-content-only. The type label
  // ("vega" / "html" / etc.) is dropped — the cell's visual rendering
  // already tells the user what substrate it is, and the label costs
  // a slot that should carry actual signal. Per memory/
  // feedback_dynamic_only_chrome.md.
  // Order (left-to-right): generated title (prominent) · discourse_move
  // · confidence · attempt-badge if any · cell-id (small, clickable to
  // copy) · timestamp.
  const head = el("div", "cell-head");
  if (c.title) {
    const titleEl = el("span", "cell-title", c.title);
    // Clicking the title copies the cell id — same as the .cell-id pill.
    // The whole title bar is a natural target; users don't always notice
    // the small id pill as the affordance.
    if (c.id) {
      titleEl.style.cursor = "pointer";
      titleEl.title = "click to copy cell id";
      titleEl.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(c.id); } catch (e) { /* ignore */ }
      });
    }
    head.appendChild(titleEl);
  }
  if (c.id) {
    const idEl = el("button", "cell-id", c.id);
    idEl.type = "button";
    idEl.title = "click to copy";
    // Explicit accessible name for screen readers — title is announced
    // inconsistently across SR/browser combos; aria-label always wins.
    idEl.setAttribute("aria-label", `${c.id}, click to copy cell id`);
    idEl.dataset.cellType = c.cell_type;  // for substrate-based color hint
    idEl.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(c.id);
        idEl.classList.add("cell-id-copied");
        const prev = idEl.textContent;
        idEl.textContent = "copied · " + c.id;
        setTimeout(() => {
          idEl.classList.remove("cell-id-copied");
          idEl.textContent = prev;
        }, 900);
      } catch (e) {
        idEl.title = "copy failed: " + (e && e.message || "no clipboard access");
      }
    });
    head.appendChild(idEl);
  }
  if (c.discourse_move) {
    head.appendChild(el("span", "cell-move", c.discourse_move));
  }
  if (typeof c.confidence === "number") {
    // Edge telemetry: confidence as a small graphical bar + numeric chip,
    // not just a number. The bar makes confidence-distribution across the
    // dashboard scannable at a glance (the 0.40 cells stand out from 0.85
    // cells without the user having to read each value). Per Task #68 MVP.
    const conf = el("span", "cell-conf");
    const cv = Math.max(0, Math.min(1, c.confidence));
    // --conf drives both the linear bar's width AND the gastown dial's
    // needle rotation via CSS — set once on the wrapper so the two
    // alternate displays stay in sync without theme-aware JS.
    conf.style.setProperty("--conf", cv.toFixed(3));
    const bar = el("span", "cell-conf-bar");
    const fill = el("span", "cell-conf-bar-fill");
    fill.style.width = (cv * 100).toFixed(1) + "%";
    // Low-confidence cells (<0.6) get a desaturated fill so they read as
    // "the system flagged this one as uncertain" without needing the number.
    if (cv < 0.6) fill.classList.add("cell-conf-bar-low");
    bar.appendChild(fill);
    conf.appendChild(bar);
    // Per-theme flair variants. All variants are inserted in every cell;
    // CSS reveals exactly one based on the active .theme-* class on
    // <html> and hides the others (including the default linear bar).
    // Per memory/feedback_theme_specific_flair: each theme gets distinct
    // flourishes; cross-theme bleed is the only failure mode.
    //
    //   .cell-conf-dial   — gastown brass pressure gauge (needle ∝ conf)
    //   .cell-conf-magi   — conclave/magi MELCHIOR/BALTHASAR/CASPAR
    //                        3-vote stack (each bar fills ∝ conf)
    //
    // Ops (LCARS) and lab themes restyle the default .cell-conf-bar
    // via CSS — no SVG variant needed.
    conf.insertAdjacentHTML("beforeend", `
      <svg class="cell-conf-dial" viewBox="0 0 24 24" aria-hidden="true">
        <circle class="dial-rim" cx="12" cy="12" r="10.5"/>
        <circle class="dial-face" cx="12" cy="12" r="9"/>
        <g class="dial-ticks">
          <line x1="12" y1="3" x2="12" y2="5"/>
          <line x1="3" y1="12" x2="5" y2="12"/>
          <line x1="21" y1="12" x2="19" y2="12"/>
          <line x1="5.5" y1="5.5" x2="6.9" y2="6.9"/>
          <line x1="18.5" y1="5.5" x2="17.1" y2="6.9"/>
        </g>
        <line class="dial-needle" x1="12" y1="12" x2="12" y2="4.5"/>
        <circle class="dial-hub" cx="12" cy="12" r="1.4"/>
      </svg>
      <svg class="cell-conf-magi" viewBox="0 0 26 22" aria-hidden="true">
        <!-- Three hexagons arranged as the MAGI System trinity:
             MELCHIOR (top-left), BALTHASAR (top-right), CASPAR (bottom).
             Each hex is a flat-top regular hexagon, side ~3.5 user units.
             Stroke = track; fill = magi-fill (clipped by --conf at the
             whole-shape level via clip-path on the parent <g>). Labels
             centered inside each hex in tiny mono. -->
        <g class="magi-tracks">
          <polygon points="3.5,3 6.5,1 9.5,3 9.5,7 6.5,9 3.5,7"/>
          <polygon points="16.5,3 19.5,1 22.5,3 22.5,7 19.5,9 16.5,7"/>
          <polygon points="10,12 13,10 16,12 16,16 13,18 10,16"/>
        </g>
        <g class="magi-fills">
          <polygon points="3.5,3 6.5,1 9.5,3 9.5,7 6.5,9 3.5,7"/>
          <polygon points="16.5,3 19.5,1 22.5,3 22.5,7 19.5,9 16.5,7"/>
          <polygon points="10,12 13,10 16,12 16,16 13,18 10,16"/>
        </g>
        <text class="magi-label" x="6.5"  y="6"  text-anchor="middle" dominant-baseline="middle">M</text>
        <text class="magi-label" x="19.5" y="6"  text-anchor="middle" dominant-baseline="middle">B</text>
        <text class="magi-label" x="13"   y="15" text-anchor="middle" dominant-baseline="middle">C</text>
      </svg>`.trim());
    if (cv < 0.6) conf.classList.add("cell-conf-low");
    // High-confidence rarity hook. The hackers theme uses this to
    // promote the rare cell to the magenta-highlight column visible in
    // refs/gibson/tower_face_labels.png — pink is the "this one
    // matters" signal. Threshold 0.88 chosen empirically against the
    // actual cv distribution (quantized clusters at 0.85/0.86/0.88/
    // 0.89): >=0.88 yields ~4% pink — sparse enough that during a
    // slow-scan tower-face graze, an occasional pink cell scrolls by
    // as a "this one matters" surprise. Tagged on both the conf chip
    // AND the cell so theme CSS can rail-color the whole cell without
    // :has() (broader browser compat).
    if (cv >= 0.88) {
      conf.classList.add("cell-conf-high");
      if (card) card.classList.add("cell-conf-high");
    }
    conf.appendChild(el("span", "cell-conf-num", c.confidence.toFixed(2)));
    conf.title = `classifier confidence: ${c.confidence}`;
    head.appendChild(conf);
  }
  // Edge telemetry: retrigger pip — only renders when a cell was retried.
  // Most cells have retrigger_count=0, so this is selectively visible
  // (the FUI "thing you only see when it matters" pattern). Per Task #68.
  if (typeof c.retrigger_count === "number" && c.retrigger_count > 0) {
    const pip = el("span", "cell-retrigger", "↻" + c.retrigger_count);
    pip.title = c.retrigger_reason
      ? `retried ${c.retrigger_count}× — ${c.retrigger_reason}`
      : `retried ${c.retrigger_count}×`;
    head.appendChild(pip);
  }
  if (snippetGroups && c.trigger_snippet) {
    const group = snippetGroups.get(c.trigger_snippet);
    if (group && group.length > 1) {
      const idx = group.indexOf(c.id);
      head.appendChild(el("span", "cell-attempt-badge",
        `${idx + 1}/${group.length}`));
    }
  }
  // Session origin chip: only visible when multiple sessions are mixed
  // into one grid (?session=auto). In single-session views, the column
  // header / HUD already names the session so the per-cell chip is noise.
  if (state.sessions.autoMode && c.session_id) {
    const sess = el("span", "cell-session", c.session_id.slice(0, 14));
    sess.title = `session: ${c.session_id}`;
    head.appendChild(sess);
  }
  // Time chip: HH:MM in the user's LOCAL timezone (full ISO in title
  // for hover). Pre-2026-05-01 we regex'd HH:MM out of the ISO string,
  // which left it as UTC — user 2026-05-01: "should probably be in
  // local". Parse via Date so DST + offset resolve naturally.
  const timeStr = (() => {
    if (!c.timestamp) return "";
    const d = new Date(c.timestamp);
    if (Number.isNaN(d.getTime())) return c.timestamp;
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  })();
  const timeChip = el("span", "cell-time", timeStr);
  if (c.timestamp) timeChip.title = c.timestamp;
  head.appendChild(timeChip);
  card.appendChild(head);

  if (sources.length > 0) {
    const srcRow = el("div", "cell-reflection-sources");
    srcRow.appendChild(el("span", "cell-reflection-sources-label", "reflecting on"));
    for (const sid of sources) {
      const a = el("a", "cell-reflection-source-chip", sid);
      a.href = "#" + sid;
      srcRow.appendChild(a);
    }
    card.appendChild(srcRow);
  }

  const body = el("div", "cell-body");
  card.appendChild(body);

  if (c.cell_type === "image" && c.image_path) {
    const img = el("img");
    img.loading = "lazy";  // browser-native lazy decode; image cells are
    // demoted from auto-classifier (kill #1) but 4 historical ones remain
    // and each decoded raster is multi-MB.
    img.src = c.image_path;
    img.alt = c.caption || "generated image";
    body.appendChild(img);
  } else if (c.cell_type === "vega" && c.spec) {
    // Local helper: deep-clone the spec and remove literal hex colors so
    // the vega-embed theme config (TC.vega) drives the palette instead.
    // Touches mark.color/fill/stroke and scale.range arrays whose entries
    // are all hex strings.
    if (typeof window.stripVegaLiteralColors !== "function") {
      window.stripVegaLiteralColors = (spec) => {
        if (!spec || typeof spec !== "object") return spec;
        const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
        const isHex = v => typeof v === "string" && HEX_RE.test(v.trim());
        const clone = JSON.parse(JSON.stringify(spec));
        const stripMarkColors = m => {
          if (!m || typeof m !== "object") return m;
          if (isHex(m.color)) delete m.color;
          if (isHex(m.fill)) delete m.fill;
          if (isHex(m.stroke)) delete m.stroke;
          return m;
        };
        if (clone.mark) clone.mark = stripMarkColors(clone.mark);
        // Strip URL-bearing fields from the spec.  Vega's loader honors
        // data.url, data.format.url, and image-mark url fields by issuing
        // GETs from the browser — a poisoned spec could exfil to attacker
        // or hit cloud-metadata services (169.254.169.254).  Specs in
        // cells.json are LLM-generated; we don't allow them to control
        // the loader.  Allowlist: data.values inline is fine; data.name
        // (named-dataset reference) is fine; data.url / data.format.url
        // / image-mark url are stripped.  Replace data.url with an empty
        // inline values array so the spec still parses.
        const URL_KEYS = ["url", "href", "src"];
        const stripUrls = (node, parent) => {
          if (!node || typeof node !== "object") return;
          if (Array.isArray(node)) {
            node.forEach(c => { stripUrls(c, parent); });
            return;
          }
          for (const k of URL_KEYS) {
            if (k in node) {
              // Image mark / pattern: delete the field; the mark just
              // won't paint the image but the spec still renders.
              delete node[k];
            }
          }
          if ("data" in node && node.data && typeof node.data === "object" && !Array.isArray(node.data)) {
            // Vega data block — replace any url/format.url with inline empty values.
            if ("url" in node.data || (node.data.format && "url" in node.data.format)) {
              node.data = { values: [] };
            }
          }
          for (const k of Object.keys(node)) stripUrls(node[k], node);
        };
        stripUrls(clone, null);
        // Also strip scale.range arrays of hex literals from any encoding.
        const walk = obj => {
          if (!obj || typeof obj !== "object") return;
          if (Array.isArray(obj)) { obj.forEach(walk); return; }
          if (obj.scale && obj.scale.range && Array.isArray(obj.scale.range)
              && obj.scale.range.every(isHex)) {
            delete obj.scale.range;
          }
          for (const k of Object.keys(obj)) walk(obj[k]);
        };
        walk(clone);
        return clone;
      };
    }
    const stripVegaLiteralColors = window.stripVegaLiteralColors;
    const target = el("div", "vega-target");
    // Stash the spec on the target so the click-zoom modal can
    // re-embed vega in its clone. Without this, cloneNode(true)
    // copies the <canvas> element but it paints blank in the dialog.
    try {
      target.dataset.vegaSpec = JSON.stringify(c.spec);
    } catch (e) { /* spec not serializable; skip */ }
    body.appendChild(target);
    let currentEmbed = null;
    let currentView = null;
    const renderVega = () => {
      // Defense-in-depth: strip literal hex colors from mark.color /
      // mark.fill / mark.stroke and any scale.range arrays. Pre-2026-05-01
      // some specialist outputs hardcoded colors like "#6a9fb5" steel-blue
      // into the mark, which bypassed the vega-embed theme config and
      // pinned the chart off-theme. The specialist prompt now forbids this
      // for new mints; this strip handles legacy cells.
      const themedSpec = stripVegaLiteralColors(c.spec);
      currentEmbed = vegaEmbed(target, themedSpec, { actions: false, ...TC.vega }).then(result => {
        currentView = result && result.view;
        // Stash the view on the DOM element so disposeCellState() can
        // finalize() it when this cell is evicted by the cap loop.
        target._vegaView = currentView;
        // If the spec declares a numeric width, use it as the cell's
        // natural width. Otherwise (`"width": "container"` style)
        // measure post-render scrollWidth.
        const specWidth = (c.spec && typeof c.spec.width === "number") ? c.spec.width : 0;
        applyNaturalCellSize(target, specWidth);
        return result;
      }).catch(err => {
        target.textContent = "vega render error: " + err.message;
        return null;
      });
    };
    // Async: await the in-flight embed Promise before finalizing.
    // Without this, fast scroll-pasts hit teardown while the embed is
    // still resolving — currentView is null at teardown time, finalize
    // never fires, and the resolved view (signal graph + canvas backing)
    // is orphaned. Each leaked view costs a few MB; 80 thrashes = 150MB+.
    const teardownVega = async () => {
      if (currentEmbed) {
        try { await currentEmbed; } catch (e) {}
      }
      if (currentView) {
        try { currentView.finalize(); } catch (e) {}
        currentView = null;
      }
      currentEmbed = null;
    };
    lazyMount(target, renderVega, teardownVega);
  } else if (c.cell_type === "mermaid" && c.spec) {
    const target = el("div", "mermaid-target");
    body.appendChild(target);
    // Stable ID per cell across re-renders. Mermaid 10+ removes its own
    // temp container after render, so reusing the ID is fine and avoids
    // accumulating per-ID internal state on each remount.
    const renderMermaid = async () => {
      try {
        // Validate first via mermaid.parse() — without this, mermaid.render
        // injects its own "Syntax error in text / mermaid version 10.x.y"
        // stub into the document body when parsing fails, and that stub
        // floats free of our cell. parse() throws on invalid syntax; we
        // render a clean inline error instead.
        const normSpec = _normalizeMermaidSpec(c.spec);
        await mermaid.parse(normSpec);
        const { svg } = await mermaid.render(`m-${c.id}`, normSpec);
        // Sanitize before innerHTML even though mermaid produces the
        // SVG itself — defense-in-depth against the mermaid CVE family
        // (CSS injection via classDef, HTML injection in state diagrams)
        // and against future bypasses. USE_PROFILES.svg permits SVG
        // structure but strips <script>, on* event handlers, and the
        // FORBID_TAGS list catches anything snuck through.
        target.innerHTML = _purifySvg(svg);
        // Edge-label backplates were sized flush to the text bbox by
        // mermaid (htmlLabels:false path), so labels read as cramped
        // chips. Inflate each rect by a few px on each side and re-
        // center via x/y offset. Per task #89.
        target.querySelectorAll(".edgeLabel rect").forEach(rect => {
          const w = parseFloat(rect.getAttribute("width") || 0);
          const h = parseFloat(rect.getAttribute("height") || 0);
          const x = parseFloat(rect.getAttribute("x") || 0);
          const y = parseFloat(rect.getAttribute("y") || 0);
          const padX = 5, padY = 2;
          rect.setAttribute("width", w + 2 * padX);
          rect.setAttribute("height", h + 2 * padY);
          rect.setAttribute("x", x - padX);
          rect.setAttribute("y", y - padY);
        });
        // Mermaid: render at natural viewBox size (not auto-fit). The
        // cell will size to that width via applyNaturalCellSize. Auto-
        // pan only kicks in if the natural-size diagram is itself
        // wider/taller than what fits in the dashboard viewport.
        const svgEl = target.querySelector("svg");
        if (svgEl) {
          const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
          if (vb && vb.width > 0 && vb.height > 0) {
            svgEl.removeAttribute("style");
            svgEl.style.maxWidth = "none";
            svgEl.style.width = vb.width + "px";
            svgEl.style.height = vb.height + "px";
            applyNaturalCellSize(target, vb.width);
            // Auto-pan fallback when the natural-size SVG ends up
            // wider than the actual rendered cell — typically because
            // max-width clamped natural width to 95vw on a narrow
            // window, or because the diagram is genuinely huge. The
            // earlier rule required ratio ≥1.4× AND ≥120px absolute;
            // borderline cases (e.g., cell=900 vb=1100, ratio=1.22,
            // 200px clipped) silently lost the right edge. Single
            // absolute threshold: pan whenever ≥80px would clip,
            // regardless of ratio. ~80px is roughly one node-width
            // of content, the floor below which the pan motion would
            // distract more than it reveals.
            const cw = target.getBoundingClientRect().width || 0;
            const wOverflow = cw > 0 && (vb.width - cw) > 80;
            if (wOverflow) {
              target.style.maxHeight = "32vh";
              setupAutoPan(target, svgEl);
            }
          }
        }
      } catch (err) {
        // Mermaid parse/render failures are noise on the dashboard —
        // a cell whose spec doesn't parse adds nothing. Hide the cell
        // entirely (rather than showing "mermaid render error: ...").
        // Pre-2026-05-01 we rendered the error inline; user flagged
        // 2026-05-01 they want these caught automatically. The cell
        // record stays in cells.json so a server-side validation pass
        // can be added later — see task #91.
        const cellEl = target.closest(".cell");
        if (cellEl) {
          cellEl.classList.add("cell-mermaid-failed");
          cellEl.style.display = "none";
        }
        // Console hint so we still see the bad spec in dev tools.
        console.warn(`[lucida] mermaid suppress ${c.id}: ${err && err.message ? err.message.split("\n")[0] : err}`);
      }
    };
    lazyMount(target, renderMermaid);
  } else if (c.cell_type === "html" && c.html) {
    const target = el("div", "html-target");
    body.appendChild(target);
    const renderHtml = () => {
      // Wrap content in an inner div so the cell can size to the
      // wrap's intrinsic width (max-content per CSS). No-op for html
      // that fits the cell — setupAutoPan returns early on no
      // overflow. Natural-size pivot 2026-04-29: cell width follows
      // wrap.scrollWidth via applyNaturalCellSize.
      const wrap = el("div", "html-pan-wrap");
      // Sanitize LLM-emitted html before innerHTML — prompt injection
      // could otherwise smuggle <script> or event handlers through a
      // hijacked specialist output. Allows mainstream tags/attrs; strips
      // script, on* handlers, javascript:/data: URLs.
      wrap.innerHTML = _purifyHtml(c.html);
      target.innerHTML = "";
      target.appendChild(wrap);
      if (c.id) _scopeCellStyles(wrap, "#" + c.id);  // contain leaky <style>
      applyNaturalCellSize(wrap);
      setupAutoPan(target, wrap);
    };
    lazyMount(target, renderHtml);
  } else if (c.cell_type === "animated_svg" && c.spec) {
    const target = el("div", "svg-target");
    body.appendChild(target);
    const renderSVG = () => {
      // Sanitize before innerHTML — animated_svg specs come from LLM,
      // could embed <script> or onload= handlers.
      target.innerHTML = _purifySvg(expandTokens(c.spec));
      if (c.id) _scopeCellStyles(target, "#" + c.id);  // contain leaky <style>
      const inner = target.querySelector("svg");
      // Tighten the viewBox + size to actual content bbox. Authors
      // sometimes write a generous canvas (width=400) for content
      // that only fills the top-left ~140px (cell-2813 case);
      // shrinking to bbox makes the viz fill the cell area instead
      // of squatting in the corner. getBBox is computed once after
      // mount; pad by 4px so strokes don't clip.
      const w = inner ? parseFloat(inner.getAttribute("width")) || 0 : 0;
      if (inner && typeof inner.getBBox === "function") {
        try {
          const bb = inner.getBBox();
          const pad = 4;
          // Reframe viewBox to actual content extents while keeping
          // the SVG's declared width/height. Content stretches to
          // fill the visible canvas instead of squatting in the
          // top-left of an oversized viewBox (cell-2813 case: 70×52
          // content inside a 400×160 viewBox). preserveAspectRatio
          // defaults to xMidYMid meet so aspect is preserved
          // (letterboxing rather than distortion); cell-bg fills the
          // rest. Only re-frame when content is >25% smaller than
          // the canvas — dynamic SVGs that grow over the animation
          // shouldn't be clipped by an early bbox.
          if (bb.width > 4 && bb.height > 4 && w > 0 &&
              bb.width < w * 0.75) {
            inner.setAttribute("viewBox",
              `${(bb.x - pad).toFixed(1)} ${(bb.y - pad).toFixed(1)} ${(bb.width + 2 * pad).toFixed(1)} ${(bb.height + 2 * pad).toFixed(1)}`);
          }
        } catch (e) { /* getBBox unavailable on detached SVG -- skip */ }
      }
      applyNaturalCellSize(target, w);
    };
    lazyMount(target, renderSVG);
  } else if (c.cell_type === "treemap" && c.spec) {
    // Treemap substrate (Shneiderman 1991, design-references.md): nested
    // rectangles where size encodes a quantitative attribute and nesting
    // encodes hierarchy. Renders via d3.treemap (already loaded for the
    // ?layout=treemap mode). Spec format:
    //   { title?: string, items: [{label, value, children?}, ...] }
    // Leaves get a colored rect (cycled through --data-cat-N) plus a
    // wrapped label + value. Empty / zero-value children are pruned.
    const target = el("div", "treemap-target");
    body.appendChild(target);
    const renderTreemap = () => {
      try {
        const spec = c.spec || {};
        const items = Array.isArray(spec.items) ? spec.items : [];
        if (!window.d3 || items.length === 0) {
          target.textContent = "treemap render: missing d3 or empty items";
          return;
        }
        // Natural cell size for treemap: width × height proportional to
        // total value count, with sane min/max. The rendered pixel area
        // has to be enough for ~6-8 readable tiles even when one leaf
        // dominates.
        const total = items.reduce((s, x) => s + (x.value || 0), 0) || 1;
        const w = Math.max(360, Math.min(640, 360 + items.length * 24));
        const h = Math.max(220, Math.min(360, 220 + Math.sqrt(total) * 4));
        const root = window.d3.hierarchy({ children: items, label: spec.title || "" }, d => d.children)
          .sum(d => d.value || 0)
          .sort((a, b) => (b.value || 0) - (a.value || 0));
        window.d3.treemap()
          .size([w, h])
          .paddingInner(2)
          .paddingOuter(0)
          .round(true)
          .tile(window.d3.treemapSquarify)(root);
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", w);
        svg.setAttribute("height", h);
        svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
        svg.style.maxWidth = "100%";
        svg.style.height = "auto";
        const leaves = root.leaves();
        leaves.forEach((leaf, i) => {
          const x = leaf.x0, y = leaf.y0;
          const tw = leaf.x1 - leaf.x0, th = leaf.y1 - leaf.y0;
          if (tw <= 0 || th <= 0) return;
          const fillIdx = i % 6;
          const rect = document.createElementNS(svgNS, "rect");
          rect.setAttribute("x", x);
          rect.setAttribute("y", y);
          rect.setAttribute("width", tw);
          rect.setAttribute("height", th);
          rect.setAttribute("fill", `var(--data-cat-${fillIdx}, #888)`);
          rect.setAttribute("fill-opacity", "0.85");
          rect.setAttribute("stroke", "var(--bg)");
          rect.setAttribute("stroke-width", "1");
          svg.appendChild(rect);
          // Label + value text — only render when tile is large enough.
          if (tw < 40 || th < 22) return;
          const labelText = leaf.data.label || "";
          const valueText = String(leaf.data.value ?? "");
          const padX = 6, padY = 14;
          const label = document.createElementNS(svgNS, "text");
          label.setAttribute("x", x + padX);
          label.setAttribute("y", y + padY);
          label.setAttribute("font-family", "var(--type-body, sans-serif)");
          label.setAttribute("font-size", "11");
          label.setAttribute("fill", "var(--bg)");
          label.setAttribute("font-weight", "600");
          // Trim label to fit width
          const maxChars = Math.max(3, Math.floor((tw - padX * 2) / 5.5));
          label.textContent = labelText.length > maxChars
            ? labelText.slice(0, maxChars - 1) + "…"
            : labelText;
          svg.appendChild(label);
          if (th >= 36) {
            const value = document.createElementNS(svgNS, "text");
            value.setAttribute("x", x + padX);
            value.setAttribute("y", y + padY + 16);
            value.setAttribute("font-family", "var(--type-mono, monospace)");
            value.setAttribute("font-size", "13");
            value.setAttribute("fill", "var(--bg)");
            value.setAttribute("font-weight", "700");
            value.textContent = valueText;
            svg.appendChild(value);
          }
        });
        target.innerHTML = "";
        target.appendChild(svg);
        applyNaturalCellSize(target, w);
      } catch (err) {
        target.classList.add("treemap-error");
        target.textContent = "treemap render error: " + err.message;
      }
    };
    lazyMount(target, renderTreemap);
  } else if (c.cell_type === "code" && c.spec) {
    // Code substrate: syntax-highlighted block. Spec is { language, source }.
    // Prism.js + autoloader are lazy-loaded on first code cell. The autoloader
    // grabs the language pack on demand from CDN. Prism token classes are
    // styled by the .code-target rules in notebook.css using theme tokens —
    // not Prism's bundled CSS — so highlighting follows magi/lcars/etc.
    const target = el("div", "code-target");
    const pre = el("pre", "code-pre");
    const codeEl = document.createElement("code");
    const lang = (c.spec.language || "text").toLowerCase();
    codeEl.className = "language-" + lang;
    codeEl.textContent = c.spec.source || "";
    pre.appendChild(codeEl);
    target.appendChild(pre);
    body.appendChild(target);
    const renderCode = () => {
      ensurePrismLoaded(lang).then(() => {
        if (window.Prism && window.Prism.highlightElement) {
          window.Prism.highlightElement(codeEl);
        }
      }).catch(() => { /* silent — code still renders unhighlighted */ });
      // Natural width: longest line × ~6.5px/char (the .code-pre font
      // is 0.72rem which renders at ~6.5px per mono char). Cap tighter
      // (520 max, was 720) so a 10-line function doesn't dominate the
      // grid — code cells should compose alongside other substrates,
      // not crowd them out. Per user 2026-04-29.
      const lines = (c.spec.source || "").split("\n");
      const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
      const w = Math.min(520, Math.max(260, 16 + longest * 6.5));
      applyNaturalCellSize(target, w);
    };
    lazyMount(target, renderCode);
  } else if (c.cell_type === "sparkline" && c.spec) {
    // Sparkline substrate: single-row mini-chart. Pure SVG, no dep. Spec:
    //   { series: [n,...], current?, min?, max?, band_lo?, band_hi?, label?, unit? }
    // Default natural size 320×72 (label band + line band + caption); grows
    // with point count to keep ≥ 6px between samples.
    const target = el("div", "sparkline-target");
    body.appendChild(target);
    const renderSpark = () => {
      try {
        const spec = c.spec || {};
        const series = (spec.series || []).map(Number).filter(n => Number.isFinite(n));
        if (series.length < 2) {
          target.textContent = "sparkline: needs ≥2 numeric points";
          return;
        }
        const w = Math.min(640, Math.max(280, 24 + series.length * 14));
        const h = 76;
        const padL = 8, padR = 56, padT = 18, padB = 14;
        const innerW = w - padL - padR, innerH = h - padT - padB;
        const yMin = (typeof spec.min === "number") ? spec.min : Math.min(...series);
        const yMax = (typeof spec.max === "number") ? spec.max : Math.max(...series);
        const yRange = (yMax - yMin) || 1;
        const xAt = i => padL + (i / (series.length - 1)) * innerW;
        const yAt = v => padT + innerH - ((v - yMin) / yRange) * innerH;
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", w);
        svg.setAttribute("height", h);
        svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
        svg.style.maxWidth = "100%";
        svg.style.height = "auto";
        // Optional shaded band for "normal range".
        if (typeof spec.band_lo === "number" && typeof spec.band_hi === "number") {
          const yLo = yAt(Math.max(spec.band_lo, yMin));
          const yHi = yAt(Math.min(spec.band_hi, yMax));
          const band = document.createElementNS(svgNS, "rect");
          band.setAttribute("x", padL);
          band.setAttribute("y", Math.min(yLo, yHi));
          band.setAttribute("width", innerW);
          band.setAttribute("height", Math.abs(yHi - yLo));
          band.setAttribute("fill", "var(--accent)");
          band.setAttribute("fill-opacity", "0.10");
          svg.appendChild(band);
        }
        // Polyline of the series.
        const points = series.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");
        const line = document.createElementNS(svgNS, "polyline");
        line.setAttribute("points", points);
        line.setAttribute("fill", "none");
        line.setAttribute("stroke", "var(--accent)");
        line.setAttribute("stroke-width", "1.6");
        line.setAttribute("stroke-linecap", "round");
        line.setAttribute("stroke-linejoin", "round");
        svg.appendChild(line);
        // Current-value dot + readout.
        const cur = (typeof spec.current === "number") ? spec.current : series[series.length - 1];
        const cIdx = series.length - 1;
        const cx = xAt(cIdx), cy = yAt(cur);
        const dot = document.createElementNS(svgNS, "circle");
        dot.setAttribute("cx", cx);
        dot.setAttribute("cy", cy);
        dot.setAttribute("r", "3.2");
        dot.setAttribute("fill", "var(--accent)");
        svg.appendChild(dot);
        const readout = document.createElementNS(svgNS, "text");
        readout.setAttribute("x", w - padR + 6);
        readout.setAttribute("y", cy + 4);
        readout.setAttribute("font-family", "var(--type-mono, monospace)");
        readout.setAttribute("font-size", "13");
        readout.setAttribute("font-weight", "700");
        readout.setAttribute("fill", "var(--fg)");
        readout.textContent = String(cur) + (spec.unit || "");
        svg.appendChild(readout);
        // Optional label above.
        if (spec.label) {
          const lbl = document.createElementNS(svgNS, "text");
          lbl.setAttribute("x", padL);
          lbl.setAttribute("y", 12);
          lbl.setAttribute("font-family", "var(--type-mono, monospace)");
          lbl.setAttribute("font-size", "10");
          lbl.setAttribute("fill", "var(--muted)");
          lbl.setAttribute("letter-spacing", "0.05em");
          lbl.textContent = String(spec.label).toUpperCase();
          svg.appendChild(lbl);
        }
        target.innerHTML = "";
        target.appendChild(svg);
        applyNaturalCellSize(target, w);
      } catch (err) {
        target.textContent = "sparkline render error: " + err.message;
      }
    };
    lazyMount(target, renderSpark);
  } else if (c.cell_type === "timeline_ribbon" && c.spec) {
    // Timeline ribbon substrate: 3-7 ordered stages laid out left→right,
    // each with a marker, label, optional detail, and a status (done /
    // active / pending / skipped / failed). Pure SVG, no dep. Spec:
    //   { stages: [{label, detail?, status?}, ...], axis_label? }
    // Status semantics drive the marker style; the renderer reads theme
    // tokens (--accent, --muted, --fg, --bg, --vis-ok, --vis-tripped)
    // so it follows magi/lcars/etc without per-substrate CSS branches.
    const target = el("div", "timeline-ribbon-target");
    body.appendChild(target);
    const renderRibbon = () => {
      try {
        const spec = c.spec || {};
        // Hackers / rectilinear themes get square markers; other
        // themes keep circular dots. User 2026-05-23 cell-3423.
        const squareMarkers = document.documentElement.classList.contains("theme-hackers");
        const stages = Array.isArray(spec.stages) ? spec.stages : [];
        if (stages.length < 3) {
          target.textContent = "timeline_ribbon: needs ≥3 stages";
          return;
        }
        const colW = 132;
        const padL = 28, padR = 28, padT = 26, padB = 22;
        const innerW = colW * (stages.length - 1);
        const w = padL + innerW + padR;
        const h = padT + 90 + padB;
        const trackY = padT + 18;
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", w);
        svg.setAttribute("height", h);
        svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
        svg.style.maxWidth = "100%";
        svg.style.height = "auto";
        // Optional axis label, top-left corner.
        if (spec.axis_label) {
          const ax = document.createElementNS(svgNS, "text");
          ax.setAttribute("x", padL);
          ax.setAttribute("y", 14);
          ax.setAttribute("font-family", "var(--type-mono, monospace)");
          ax.setAttribute("font-size", "10");
          ax.setAttribute("fill", "var(--muted)");
          ax.setAttribute("letter-spacing", "0.08em");
          ax.textContent = String(spec.axis_label).toUpperCase();
          svg.appendChild(ax);
        }
        const xAt = i => padL + i * colW;
        const colorFor = status => {
          if (status === "active") return "var(--accent)";
          if (status === "failed") return "var(--vis-tripped, #f87171)";
          if (status === "skipped") return "var(--muted)";
          if (status === "pending") return "var(--muted)";
          return "var(--vis-ok, var(--accent))";  // done (default)
        };
        // Connection track: a single line under all markers, drawn first
        // so markers sit on top. Per-segment color reflects the *earlier*
        // stage's status (the segment is the "after-this-finished" path).
        for (let i = 0; i < stages.length - 1; i++) {
          const s = stages[i] || {};
          const seg = document.createElementNS(svgNS, "line");
          seg.setAttribute("x1", xAt(i) + 12);
          seg.setAttribute("y1", trackY);
          seg.setAttribute("x2", xAt(i + 1) - 12);
          seg.setAttribute("y2", trackY);
          const segColor = (s.status === "done" || s.status === "active")
            ? colorFor(s.status)
            : "var(--line, var(--muted))";
          seg.setAttribute("stroke", segColor);
          seg.setAttribute("stroke-width", "1.5");
          if (s.status === "skipped" || s.status === "pending") {
            seg.setAttribute("stroke-dasharray", "3,3");
          }
          svg.appendChild(seg);
        }
        // Stage markers + labels.
        stages.forEach((stg, i) => {
          const status = stg.status || (i === stages.length - 1 ? "pending" : "done");
          const cx = xAt(i), cy = trackY;
          const color = colorFor(status);
          // Marker: filled circle for done / failed; ring for active /
          // pending; X for skipped. Active also gets a pulsing outer ring.
          if (status === "skipped") {
            // Diagonal X marker, ~9px arms.
            const mk = (x1, y1, x2, y2) => {
              const ln = document.createElementNS(svgNS, "line");
              ln.setAttribute("x1", x1); ln.setAttribute("y1", y1);
              ln.setAttribute("x2", x2); ln.setAttribute("y2", y2);
              ln.setAttribute("stroke", color);
              ln.setAttribute("stroke-width", "1.5");
              ln.setAttribute("stroke-linecap", "round");
              svg.appendChild(ln);
            };
            mk(cx - 5, cy - 5, cx + 5, cy + 5);
            mk(cx - 5, cy + 5, cx + 5, cy - 5);
          } else if (status === "pending") {
            // Hackers/rectilinear themes get a square marker; other
            // themes keep the circle. User 2026-05-23 cell-3423.
            const ring = squareMarkers
              ? document.createElementNS(svgNS, "rect")
              : document.createElementNS(svgNS, "circle");
            if (squareMarkers) {
              ring.setAttribute("x", cx - 5); ring.setAttribute("y", cy - 5);
              ring.setAttribute("width", 10); ring.setAttribute("height", 10);
            } else {
              ring.setAttribute("cx", cx); ring.setAttribute("cy", cy);
              ring.setAttribute("r", "5");
            }
            ring.setAttribute("fill", "var(--bg)");
            ring.setAttribute("stroke", color);
            ring.setAttribute("stroke-width", "1.5");
            ring.setAttribute("stroke-dasharray", "2,2");
            svg.appendChild(ring);
          } else if (status === "active") {
            // Outer pulsing ring + inner solid core. Pulse via SMIL so it
            // works without requiring a JS timer. For rectilinear
            // themes the pulse is opacity-only (no size-grow) since
            // animating size on a rect requires 4 animate elements;
            // opacity alone still reads as "active".
            const pulse = squareMarkers
              ? document.createElementNS(svgNS, "rect")
              : document.createElementNS(svgNS, "circle");
            if (squareMarkers) {
              pulse.setAttribute("x", cx - 6); pulse.setAttribute("y", cy - 6);
              pulse.setAttribute("width", 12); pulse.setAttribute("height", 12);
            } else {
              pulse.setAttribute("cx", cx); pulse.setAttribute("cy", cy);
              pulse.setAttribute("r", "6");
            }
            pulse.setAttribute("fill", "none");
            pulse.setAttribute("stroke", color);
            pulse.setAttribute("stroke-width", "1.4");
            if (!squareMarkers) {
              const anim = document.createElementNS(svgNS, "animate");
              anim.setAttribute("attributeName", "r");
              anim.setAttribute("values", "5;10;5");
              anim.setAttribute("dur", "1.6s");
              anim.setAttribute("repeatCount", "indefinite");
              pulse.appendChild(anim);
            }
            const animO = document.createElementNS(svgNS, "animate");
            animO.setAttribute("attributeName", "opacity");
            animO.setAttribute("values", "0.85;0.15;0.85");
            animO.setAttribute("dur", "1.6s");
            animO.setAttribute("repeatCount", "indefinite");
            pulse.appendChild(animO);
            svg.appendChild(pulse);
            const core = squareMarkers
              ? document.createElementNS(svgNS, "rect")
              : document.createElementNS(svgNS, "circle");
            if (squareMarkers) {
              core.setAttribute("x", cx - 4); core.setAttribute("y", cy - 4);
              core.setAttribute("width", 8); core.setAttribute("height", 8);
            } else {
              core.setAttribute("cx", cx); core.setAttribute("cy", cy);
              core.setAttribute("r", "4");
            }
            core.setAttribute("fill", color);
            svg.appendChild(core);
          } else {
            // done OR failed — solid filled marker. Failed gets a thin
            // contrasting outline so it reads as "stopped here" not "ok".
            const dot = squareMarkers
              ? document.createElementNS(svgNS, "rect")
              : document.createElementNS(svgNS, "circle");
            if (squareMarkers) {
              dot.setAttribute("x", cx - 5); dot.setAttribute("y", cy - 5);
              dot.setAttribute("width", 10); dot.setAttribute("height", 10);
            } else {
              dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
              dot.setAttribute("r", "5");
            }
            dot.setAttribute("fill", color);
            if (status === "failed") {
              dot.setAttribute("stroke", "var(--fg)");
              dot.setAttribute("stroke-width", "1");
            }
            svg.appendChild(dot);
          }
          // Label (mono caps).
          const lbl = document.createElementNS(svgNS, "text");
          lbl.setAttribute("x", cx);
          lbl.setAttribute("y", trackY + 24);
          lbl.setAttribute("text-anchor", "middle");
          lbl.setAttribute("font-family", "var(--type-mono, monospace)");
          lbl.setAttribute("font-size", "11");
          lbl.setAttribute("font-weight", "600");
          lbl.setAttribute("fill", "var(--fg)");
          lbl.setAttribute("letter-spacing", "0.04em");
          lbl.textContent = String(stg.label || "").toUpperCase();
          svg.appendChild(lbl);
          // Detail (body, optional).
          if (stg.detail) {
            const det = document.createElementNS(svgNS, "text");
            det.setAttribute("x", cx);
            det.setAttribute("y", trackY + 40);
            det.setAttribute("text-anchor", "middle");
            det.setAttribute("font-family", "var(--type-body, sans-serif)");
            det.setAttribute("font-size", "10");
            det.setAttribute("fill", "var(--muted)");
            // Trim detail to roughly fit colW.
            const maxChars = Math.max(8, Math.floor((colW - 12) / 5.5));
            const t = String(stg.detail);
            det.textContent = t.length > maxChars ? t.slice(0, maxChars - 1) + "…" : t;
            svg.appendChild(det);
          }
          // Status chip (small caps under detail).
          if (status && status !== "done") {
            const chip = document.createElementNS(svgNS, "text");
            chip.setAttribute("x", cx);
            chip.setAttribute("y", trackY + 56);
            chip.setAttribute("text-anchor", "middle");
            chip.setAttribute("font-family", "var(--type-mono, monospace)");
            chip.setAttribute("font-size", "9");
            chip.setAttribute("fill", color);
            chip.setAttribute("letter-spacing", "0.10em");
            chip.textContent = status.toUpperCase();
            svg.appendChild(chip);
          }
        });
        target.innerHTML = "";
        target.appendChild(svg);
        applyNaturalCellSize(target, w);
      } catch (err) {
        target.classList.add("timeline-ribbon-error");
        target.textContent = "timeline_ribbon render error: " + err.message;
      }
    };
    lazyMount(target, renderRibbon);
  } else if (c.cell_type === "trajectory" && c.spec) {
    // Trajectory substrate: ordered path through a 2D state space. Pure
    // SVG, no dep. Spec:
    //   { points: [{x, y, label?}, ...], x_label?, y_label?, x_range?,
    //     y_range?, annotation_start?, annotation_end? }
    // Start point renders as a hollow ring; end point as a filled accent
    // dot; the connecting polyline traces the path; small dashed crosshairs
    // mark the median (x, y) so the four quadrants of drift are visible
    // at a glance. Theme tokens (--accent, --fg, --muted, --line) drive
    // color so the substrate follows magi/lcars/etc without per-substrate
    // CSS branches.
    const target = el("div", "trajectory-target");
    body.appendChild(target);
    const renderTraj = () => {
      try {
        const spec = c.spec || {};
        const points = (Array.isArray(spec.points) ? spec.points : [])
          .filter(p => p && Number.isFinite(+p.x) && Number.isFinite(+p.y))
          .map(p => ({ x: +p.x, y: +p.y, label: p.label }));
        if (points.length < 3) {
          target.textContent = "trajectory: needs ≥3 numeric points";
          return;
        }
        const w = 400, h = 260;
        const padL = 44, padR = 22, padT = 22, padB = 38;
        const innerW = w - padL - padR, innerH = h - padT - padB;
        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        const xRange = (Array.isArray(spec.x_range) && spec.x_range.length === 2)
          ? [+spec.x_range[0], +spec.x_range[1]]
          : [Math.min(...xs), Math.max(...xs)];
        const yRange = (Array.isArray(spec.y_range) && spec.y_range.length === 2)
          ? [+spec.y_range[0], +spec.y_range[1]]
          : [Math.min(...ys), Math.max(...ys)];
        const padFrac = 0.08;
        const xPad = (xRange[1] - xRange[0]) * padFrac || 1;
        const yPad = (yRange[1] - yRange[0]) * padFrac || 1;
        const xLo = xRange[0] - xPad, xHi = xRange[1] + xPad;
        const yLo = yRange[0] - yPad, yHi = yRange[1] + yPad;
        const xRangeSpan = (xHi - xLo) || 1;
        const yRangeSpan = (yHi - yLo) || 1;
        const xAt = v => padL + ((v - xLo) / xRangeSpan) * innerW;
        const yAt = v => padT + innerH - ((v - yLo) / yRangeSpan) * innerH;
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", w);
        svg.setAttribute("height", h);
        svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
        svg.style.maxWidth = "100%";
        svg.style.height = "auto";
        // Frame: thin baseline + left axis lines using --line.
        const xAxis = document.createElementNS(svgNS, "line");
        xAxis.setAttribute("x1", padL); xAxis.setAttribute("y1", h - padB);
        xAxis.setAttribute("x2", w - padR); xAxis.setAttribute("y2", h - padB);
        xAxis.setAttribute("stroke", "var(--line, var(--muted))");
        xAxis.setAttribute("stroke-width", "1");
        svg.appendChild(xAxis);
        const yAxis = document.createElementNS(svgNS, "line");
        yAxis.setAttribute("x1", padL); yAxis.setAttribute("y1", padT);
        yAxis.setAttribute("x2", padL); yAxis.setAttribute("y2", h - padB);
        yAxis.setAttribute("stroke", "var(--line, var(--muted))");
        yAxis.setAttribute("stroke-width", "1");
        svg.appendChild(yAxis);
        // Median crosshair — faint dashed lines marking the (median x, median y)
        // so quadrants of drift are visible at a glance.
        const med = arr => {
          const s = [...arr].sort((a, b) => a - b);
          const m = Math.floor(s.length / 2);
          return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
        };
        const mx = med(xs), my = med(ys);
        const medV = document.createElementNS(svgNS, "line");
        medV.setAttribute("x1", xAt(mx)); medV.setAttribute("y1", padT);
        medV.setAttribute("x2", xAt(mx)); medV.setAttribute("y2", h - padB);
        medV.setAttribute("stroke", "var(--muted)");
        medV.setAttribute("stroke-width", "1");
        medV.setAttribute("stroke-dasharray", "2,4");
        medV.setAttribute("opacity", "0.35");
        svg.appendChild(medV);
        const medH = document.createElementNS(svgNS, "line");
        medH.setAttribute("x1", padL); medH.setAttribute("y1", yAt(my));
        medH.setAttribute("x2", w - padR); medH.setAttribute("y2", yAt(my));
        medH.setAttribute("stroke", "var(--muted)");
        medH.setAttribute("stroke-width", "1");
        medH.setAttribute("stroke-dasharray", "2,4");
        medH.setAttribute("opacity", "0.35");
        svg.appendChild(medH);
        // Trajectory polyline.
        const polyPoints = points
          .map(p => `${xAt(p.x).toFixed(1)},${yAt(p.y).toFixed(1)}`)
          .join(" ");
        const poly = document.createElementNS(svgNS, "polyline");
        poly.setAttribute("points", polyPoints);
        poly.setAttribute("fill", "none");
        poly.setAttribute("stroke", "var(--accent)");
        poly.setAttribute("stroke-width", "1.6");
        poly.setAttribute("stroke-linecap", "round");
        poly.setAttribute("stroke-linejoin", "round");
        svg.appendChild(poly);
        // Direction arrow on the final segment so the path "reads" as
        // start → end. Compute angle from the second-to-last to last point.
        if (points.length >= 2) {
          const a = points[points.length - 2];
          const b = points[points.length - 1];
          const ax = xAt(a.x), ay = yAt(a.y), bx = xAt(b.x), by = yAt(b.y);
          const dx = bx - ax, dy = by - ay;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const ux = dx / len, uy = dy / len;
          const arrowLen = 8, arrowSpread = 4;
          const tipX = bx, tipY = by;
          const baseX = bx - ux * arrowLen, baseY = by - uy * arrowLen;
          const perpX = -uy, perpY = ux;
          const arrow = document.createElementNS(svgNS, "polygon");
          arrow.setAttribute("points",
            `${tipX.toFixed(1)},${tipY.toFixed(1)} ` +
            `${(baseX + perpX * arrowSpread).toFixed(1)},${(baseY + perpY * arrowSpread).toFixed(1)} ` +
            `${(baseX - perpX * arrowSpread).toFixed(1)},${(baseY - perpY * arrowSpread).toFixed(1)}`);
          arrow.setAttribute("fill", "var(--accent)");
          svg.appendChild(arrow);
        }
        // Per-point markers + labels.
        points.forEach((p, i) => {
          const cx = xAt(p.x), cy = yAt(p.y);
          const isStart = i === 0, isEnd = i === points.length - 1;
          if (isStart) {
            // Hollow ring at start.
            const ring = document.createElementNS(svgNS, "circle");
            ring.setAttribute("cx", cx); ring.setAttribute("cy", cy);
            ring.setAttribute("r", "5");
            ring.setAttribute("fill", "var(--bg)");
            ring.setAttribute("stroke", "var(--accent)");
            ring.setAttribute("stroke-width", "1.6");
            svg.appendChild(ring);
          } else if (isEnd) {
            // Solid filled accent dot at end (covered by arrow tip; keep
            // small inner dot for the "current state" affordance).
            const dot = document.createElementNS(svgNS, "circle");
            dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
            dot.setAttribute("r", "3");
            dot.setAttribute("fill", "var(--accent)");
            svg.appendChild(dot);
          } else {
            // Small intermediate dot.
            const dot = document.createElementNS(svgNS, "circle");
            dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
            dot.setAttribute("r", "2.4");
            dot.setAttribute("fill", "var(--accent)");
            dot.setAttribute("opacity", "0.75");
            svg.appendChild(dot);
          }
          if (p.label) {
            const lbl = document.createElementNS(svgNS, "text");
            // Offset above-right of the marker; flip below if too close to top.
            const offsetY = cy < padT + 14 ? 14 : -8;
            const offsetX = cx > w - padR - 30 ? -6 : 8;
            lbl.setAttribute("x", cx + offsetX);
            lbl.setAttribute("y", cy + offsetY);
            lbl.setAttribute("text-anchor", offsetX < 0 ? "end" : "start");
            lbl.setAttribute("font-family", "var(--type-mono, monospace)");
            lbl.setAttribute("font-size", "10");
            lbl.setAttribute("fill", "var(--fg)");
            lbl.textContent = String(p.label).slice(0, 8);
            svg.appendChild(lbl);
          }
        });
        // Start / end annotations (small caps near the corresponding marker,
        // distinct from the per-point label).
        const startAnn = spec.annotation_start;
        if (startAnn) {
          const t = document.createElementNS(svgNS, "text");
          const sx = xAt(points[0].x), sy = yAt(points[0].y);
          t.setAttribute("x", sx + 8);
          t.setAttribute("y", sy + 14);
          t.setAttribute("font-family", "var(--type-mono, monospace)");
          t.setAttribute("font-size", "9");
          t.setAttribute("fill", "var(--muted)");
          t.setAttribute("letter-spacing", "0.10em");
          t.textContent = String(startAnn).toUpperCase().slice(0, 20);
          svg.appendChild(t);
        }
        const endAnn = spec.annotation_end;
        if (endAnn) {
          const t = document.createElementNS(svgNS, "text");
          const ex = xAt(points[points.length - 1].x);
          const ey = yAt(points[points.length - 1].y);
          const right = ex < w - padR - 60;
          t.setAttribute("x", ex + (right ? 8 : -8));
          t.setAttribute("y", ey - 12);
          t.setAttribute("text-anchor", right ? "start" : "end");
          t.setAttribute("font-family", "var(--type-mono, monospace)");
          t.setAttribute("font-size", "9");
          t.setAttribute("fill", "var(--accent)");
          t.setAttribute("letter-spacing", "0.10em");
          t.textContent = String(endAnn).toUpperCase().slice(0, 20);
          svg.appendChild(t);
        }
        // Axis labels.
        if (spec.x_label) {
          const xl = document.createElementNS(svgNS, "text");
          xl.setAttribute("x", padL + innerW / 2);
          xl.setAttribute("y", h - 8);
          xl.setAttribute("text-anchor", "middle");
          xl.setAttribute("font-family", "var(--type-mono, monospace)");
          xl.setAttribute("font-size", "10");
          xl.setAttribute("fill", "var(--muted)");
          xl.setAttribute("letter-spacing", "0.06em");
          xl.textContent = String(spec.x_label).toUpperCase();
          svg.appendChild(xl);
        }
        if (spec.y_label) {
          const yl = document.createElementNS(svgNS, "text");
          yl.setAttribute("x", 12);
          yl.setAttribute("y", padT + innerH / 2);
          yl.setAttribute("text-anchor", "middle");
          yl.setAttribute("font-family", "var(--type-mono, monospace)");
          yl.setAttribute("font-size", "10");
          yl.setAttribute("fill", "var(--muted)");
          yl.setAttribute("letter-spacing", "0.06em");
          yl.setAttribute("transform", `rotate(-90, 12, ${padT + innerH / 2})`);
          yl.textContent = String(spec.y_label).toUpperCase();
          svg.appendChild(yl);
        }
        // Min/max value tics on each axis (low-chrome — just the bound numbers).
        const fmt = v => {
          const a = Math.abs(v);
          if (a !== 0 && (a < 0.1 || a >= 10000)) return v.toExponential(1);
          return Number.isInteger(v) ? String(v) : v.toFixed(a < 1 ? 2 : 1);
        };
        const tic = (x, y, anchor, text) => {
          const t = document.createElementNS(svgNS, "text");
          t.setAttribute("x", x); t.setAttribute("y", y);
          t.setAttribute("text-anchor", anchor);
          t.setAttribute("font-family", "var(--type-mono, monospace)");
          t.setAttribute("font-size", "9");
          t.setAttribute("fill", "var(--muted)");
          t.textContent = text;
          svg.appendChild(t);
        };
        tic(padL, h - padB + 12, "middle", fmt(xRange[0]));
        tic(w - padR, h - padB + 12, "middle", fmt(xRange[1]));
        tic(padL - 4, h - padB + 4, "end", fmt(yRange[0]));
        tic(padL - 4, padT + 4, "end", fmt(yRange[1]));
        target.innerHTML = "";
        target.appendChild(svg);
        applyNaturalCellSize(target, w);
      } catch (err) {
        target.classList.add("trajectory-error");
        target.textContent = "trajectory render error: " + err.message;
      }
    };
    lazyMount(target, renderTraj);
  } else if (c.cell_type === "force_graph" && c.spec) {
    // force_graph substrate: d3-force layout for entity meshes where
    // mermaid would render a hairball. Spec:
    //   { nodes: [{id, label?, group?, size?}, ...],
    //     edges: [{source, target, label?, weight?}, ...] }
    // We run the simulation deterministically: 300 ticks with a fixed
    // seed-equivalent (alpha schedule), then snapshot the final positions
    // to static SVG. No always-running animation — the cell renders once,
    // settles, and is done. Per-group color cycles through --data-cat-N.
    const target = el("div", "force-graph-target");
    body.appendChild(target);
    const renderForceGraph = () => {
      try {
        if (!window.d3 || !window.d3.forceSimulation) {
          target.classList.add("force-graph-error");
          target.textContent = "force_graph: d3-force not loaded";
          return;
        }
        const spec = c.spec || {};
        const rawNodes = Array.isArray(spec.nodes) ? spec.nodes : [];
        const rawEdges = Array.isArray(spec.edges) ? spec.edges : [];
        if (rawNodes.length < 5) {
          target.textContent = "force_graph: needs ≥5 nodes";
          return;
        }
        const w = 420, h = 320;
        // Nodes — d3 will mutate these in place with x/y. Defensive copy.
        const nodes = rawNodes.map(n => ({
          id: n.id,
          label: n.label || n.id,
          group: n.group || "_default",
          size: typeof n.size === "number" ? Math.max(0.5, Math.min(2.5, n.size)) : 1.0,
        }));
        const idSet = new Set(nodes.map(n => n.id));
        const edges = rawEdges
          .filter(e => idSet.has(e.source) && idSet.has(e.target))
          .map(e => ({
            source: e.source,
            target: e.target,
            label: e.label,
            weight: typeof e.weight === "number" ? Math.max(0.5, Math.min(3, e.weight)) : 1.0,
          }));
        // Group → --data-cat-N color (cycle 0..5 like treemap does).
        const groups = [...new Set(nodes.map(n => n.group))];
        const colorFor = group => {
          const idx = groups.indexOf(group);
          return `var(--data-cat-${idx % 6}, var(--accent))`;
        };
        // Run the simulation deterministically: stop the timer-driven
        // ticking and step manually until alpha cools. This avoids the
        // "particles still drifting when the user scrolls past" cost of
        // many cells running animations forever.
        const sim = window.d3.forceSimulation(nodes)
          .force("link", window.d3.forceLink(edges).id(d => d.id).distance(60).strength(0.6))
          .force("charge", window.d3.forceManyBody().strength(-180))
          .force("center", window.d3.forceCenter(w / 2, h / 2).strength(0.05))
          .force("collide", window.d3.forceCollide().radius(d => 6 + d.size * 4 + 2))
          .stop();
        for (let i = 0; i < 300; i++) sim.tick();
        // Clamp positions inside the SVG box so nodes that wandered off
        // are still visible at the edge.
        const pad = 18;
        nodes.forEach(n => {
          n.x = Math.max(pad, Math.min(w - pad, n.x));
          n.y = Math.max(pad, Math.min(h - pad, n.y));
        });
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", w);
        svg.setAttribute("height", h);
        svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
        svg.style.maxWidth = "100%";
        svg.style.height = "auto";
        // Edges first, so node circles draw on top.
        edges.forEach(e => {
          const s = typeof e.source === "object" ? e.source : nodes.find(n => n.id === e.source);
          const t = typeof e.target === "object" ? e.target : nodes.find(n => n.id === e.target);
          if (!s || !t) return;
          const ln = document.createElementNS(svgNS, "line");
          ln.setAttribute("x1", s.x.toFixed(1));
          ln.setAttribute("y1", s.y.toFixed(1));
          ln.setAttribute("x2", t.x.toFixed(1));
          ln.setAttribute("y2", t.y.toFixed(1));
          ln.setAttribute("stroke", "var(--line, var(--muted))");
          ln.setAttribute("stroke-width", (1 * e.weight).toFixed(2));
          ln.setAttribute("opacity", "0.6");
          svg.appendChild(ln);
          if (e.label) {
            const mx = (s.x + t.x) / 2;
            const my = (s.y + t.y) / 2;
            const lbl = document.createElementNS(svgNS, "text");
            lbl.setAttribute("x", mx);
            lbl.setAttribute("y", my - 2);
            lbl.setAttribute("text-anchor", "middle");
            lbl.setAttribute("font-family", "var(--type-mono, monospace)");
            lbl.setAttribute("font-size", "9");
            lbl.setAttribute("fill", "var(--muted)");
            lbl.textContent = String(e.label).slice(0, 12);
            svg.appendChild(lbl);
          }
        });
        // Nodes.
        nodes.forEach(n => {
          const r = 6 + n.size * 4;
          const dot = document.createElementNS(svgNS, "circle");
          dot.setAttribute("cx", n.x.toFixed(1));
          dot.setAttribute("cy", n.y.toFixed(1));
          dot.setAttribute("r", r.toFixed(1));
          dot.setAttribute("fill", colorFor(n.group));
          dot.setAttribute("fill-opacity", "0.85");
          dot.setAttribute("stroke", "var(--bg)");
          dot.setAttribute("stroke-width", "1.5");
          svg.appendChild(dot);
          // Label below the node, mono caps small.
          const lbl = document.createElementNS(svgNS, "text");
          lbl.setAttribute("x", n.x.toFixed(1));
          lbl.setAttribute("y", (n.y + r + 11).toFixed(1));
          lbl.setAttribute("text-anchor", "middle");
          lbl.setAttribute("font-family", "var(--type-mono, monospace)");
          lbl.setAttribute("font-size", "10");
          lbl.setAttribute("fill", "var(--fg)");
          const t = String(n.label).slice(0, 16);
          lbl.textContent = t;
          svg.appendChild(lbl);
        });
        target.innerHTML = "";
        target.appendChild(svg);
        applyNaturalCellSize(target, w);
      } catch (err) {
        target.classList.add("force-graph-error");
        target.textContent = "force_graph render error: " + err.message;
      }
    };
    lazyMount(target, renderForceGraph);
  } else if (c.cell_type === "gauge" && c.spec) {
    // Gauge substrate: single scalar reading against a stated range,
    // rendered as a 270° dial with optional warn/danger thresholds.
    // Spec: { value, min, max, unit?, label?, threshold_warn?,
    //         threshold_danger?, direction? }. Pure SVG, no dep.
    const target = el("div", "gauge-target");
    body.appendChild(target);
    const renderGauge = () => {
      const spec = c.spec || {};
      const value = Number(spec.value);
      const min = Number(spec.min);
      const max = Number(spec.max);
      if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        target.textContent = "gauge: invalid spec";
        return;
      }
      const span = max - min;
      const ratio = Math.max(0, Math.min(1, (value - min) / span));
      // Sweep angle 270° centered at top; dial spans -135° → +135°.
      const startAng = -135, sweepAng = 270;
      const angAt = r => startAng + sweepAng * r;
      const polar = (r, deg) => {
        const rad = (deg - 90) * Math.PI / 180;
        return [50 + r * Math.cos(rad), 50 + r * Math.sin(rad)];
      };
      const arcD = (r, fromR, toR) => {
        const a0 = angAt(fromR), a1 = angAt(toR);
        const [x0, y0] = polar(r, a0), [x1, y1] = polar(r, a1);
        const large = (a1 - a0) > 180 ? 1 : 0;
        return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
      };
      // Threshold zones — warn/danger fill the side of the dial that
      // the direction prefers. higher_is_worse: warn/danger on the right
      // side. lower_is_worse: on the left.
      const dir = spec.direction === "lower_is_worse" ? "lower_is_worse" : "higher_is_worse";
      const warnRatio = Number.isFinite(Number(spec.threshold_warn))
        ? Math.max(0, Math.min(1, (Number(spec.threshold_warn) - min) / span))
        : null;
      const dangerRatio = Number.isFinite(Number(spec.threshold_danger))
        ? Math.max(0, Math.min(1, (Number(spec.threshold_danger) - min) / span))
        : null;
      // Determine which CSS state the current value falls into.
      let state = "ok";
      if (dir === "higher_is_worse") {
        if (dangerRatio !== null && ratio >= dangerRatio) state = "danger";
        else if (warnRatio !== null && ratio >= warnRatio) state = "warn";
      } else {
        if (dangerRatio !== null && ratio <= dangerRatio) state = "danger";
        else if (warnRatio !== null && ratio <= warnRatio) state = "warn";
      }
      const RING_R = 38;
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("class", "gauge-svg gauge-state-" + state);
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

      // Hackers theme: rectilinear horizontal-bar readout instead of
      // the analog dial. The Gibson canon (Hackers 1995, NERV, Tron
      // Legacy) is militantly rectilinear — a needle-on-dial reads
      // as "analog instrument from a different system". User
      // 2026-05-23: round viz should be more square/blocky in
      // hackers since text and towers are all square and blocky.
      if (document.documentElement.classList.contains("theme-hackers")) {
        svg.setAttribute("class", "gauge-svg gauge-bar gauge-state-" + state);
        const BAR_X0 = 8, BAR_X1 = 92, BAR_Y = 60, BAR_H = 7;
        const xAt = (r) => BAR_X0 + (BAR_X1 - BAR_X0) * r;
        // Track
        const track = document.createElementNS(ns, "rect");
        track.setAttribute("x", BAR_X0); track.setAttribute("y", BAR_Y - BAR_H / 2);
        track.setAttribute("width", BAR_X1 - BAR_X0); track.setAttribute("height", BAR_H);
        track.setAttribute("class", "gauge-track");
        svg.appendChild(track);
        // Warn / danger zones — colored bg strips inside the track.
        if (warnRatio !== null) {
          const warnZone = document.createElementNS(ns, "rect");
          let zx0, zx1;
          if (dir === "higher_is_worse") {
            zx0 = xAt(warnRatio);
            zx1 = xAt(dangerRatio !== null ? dangerRatio : 1);
          } else {
            zx0 = xAt(dangerRatio !== null ? dangerRatio : 0);
            zx1 = xAt(warnRatio);
          }
          warnZone.setAttribute("x", zx0); warnZone.setAttribute("y", BAR_Y - BAR_H / 2);
          warnZone.setAttribute("width", Math.max(0, zx1 - zx0)); warnZone.setAttribute("height", BAR_H);
          warnZone.setAttribute("class", "gauge-zone-warn");
          svg.appendChild(warnZone);
        }
        if (dangerRatio !== null) {
          const dangerZone = document.createElementNS(ns, "rect");
          let zx0, zx1;
          if (dir === "higher_is_worse") {
            zx0 = xAt(dangerRatio);
            zx1 = xAt(1);
          } else {
            zx0 = xAt(0);
            zx1 = xAt(dangerRatio);
          }
          dangerZone.setAttribute("x", zx0); dangerZone.setAttribute("y", BAR_Y - BAR_H / 2);
          dangerZone.setAttribute("width", Math.max(0, zx1 - zx0)); dangerZone.setAttribute("height", BAR_H);
          dangerZone.setAttribute("class", "gauge-zone-danger");
          svg.appendChild(dangerZone);
        }
        // Value fill — the live "needle equivalent" — a notch+rail.
        const valueFill = document.createElementNS(ns, "rect");
        valueFill.setAttribute("x", BAR_X0); valueFill.setAttribute("y", BAR_Y - BAR_H / 2);
        valueFill.setAttribute("width", (BAR_X1 - BAR_X0) * ratio);
        valueFill.setAttribute("height", BAR_H);
        valueFill.setAttribute("class", "gauge-value-arc");
        svg.appendChild(valueFill);
        // Value notch — vertical tick at the current value position,
        // taller than the bar so it reads as an indicator marker.
        const notch = document.createElementNS(ns, "line");
        const nx = xAt(ratio);
        notch.setAttribute("x1", nx); notch.setAttribute("y1", BAR_Y - BAR_H / 2 - 4);
        notch.setAttribute("x2", nx); notch.setAttribute("y2", BAR_Y + BAR_H / 2 + 4);
        notch.setAttribute("class", "gauge-notch");
        svg.appendChild(notch);
        // Ticks at 0/25/50/75/100 under the bar.
        for (const tr of [0, 0.25, 0.5, 0.75, 1]) {
          const tx = xAt(tr);
          const tick = document.createElementNS(ns, "line");
          tick.setAttribute("x1", tx); tick.setAttribute("y1", BAR_Y + BAR_H / 2 + 1);
          tick.setAttribute("x2", tx); tick.setAttribute("y2", BAR_Y + BAR_H / 2 + 5);
          tick.setAttribute("class", "gauge-tick");
          svg.appendChild(tick);
        }
        // Value text — large, above the bar.
        const valText = document.createElementNS(ns, "text");
        valText.setAttribute("x", "50"); valText.setAttribute("y", "42");
        valText.setAttribute("text-anchor", "middle");
        valText.setAttribute("class", "gauge-value");
        const valFmt = Number.isInteger(value) ? String(value) : value.toFixed(1);
        valText.textContent = valFmt + (spec.unit || "");
        svg.appendChild(valText);
        // Label above value.
        if (spec.label) {
          const lbl = document.createElementNS(ns, "text");
          lbl.setAttribute("x", "50"); lbl.setAttribute("y", "20");
          lbl.setAttribute("text-anchor", "middle");
          lbl.setAttribute("class", "gauge-label");
          lbl.textContent = String(spec.label).slice(0, 24);
          svg.appendChild(lbl);
        }
        // Min / max at bar ends.
        const minTxt = document.createElementNS(ns, "text");
        minTxt.setAttribute("x", BAR_X0); minTxt.setAttribute("y", BAR_Y + BAR_H / 2 + 13);
        minTxt.setAttribute("text-anchor", "start");
        minTxt.setAttribute("class", "gauge-range-tick");
        minTxt.textContent = String(min);
        svg.appendChild(minTxt);
        const maxTxt = document.createElementNS(ns, "text");
        maxTxt.setAttribute("x", BAR_X1); maxTxt.setAttribute("y", BAR_Y + BAR_H / 2 + 13);
        maxTxt.setAttribute("text-anchor", "end");
        maxTxt.setAttribute("class", "gauge-range-tick");
        maxTxt.textContent = String(max);
        svg.appendChild(maxTxt);
        target.replaceChildren(svg);
        return;
      }
      // Background track (full sweep).
      const track = document.createElementNS(ns, "path");
      track.setAttribute("d", arcD(RING_R, 0, 1));
      track.setAttribute("class", "gauge-track");
      svg.appendChild(track);
      // Warn / danger zones — drawn under the value arc.
      if (warnRatio !== null) {
        const warnZone = document.createElementNS(ns, "path");
        if (dir === "higher_is_worse") {
          warnZone.setAttribute("d", arcD(RING_R, warnRatio, dangerRatio !== null ? dangerRatio : 1));
        } else {
          warnZone.setAttribute("d", arcD(RING_R, dangerRatio !== null ? dangerRatio : 0, warnRatio));
        }
        warnZone.setAttribute("class", "gauge-zone-warn");
        svg.appendChild(warnZone);
      }
      if (dangerRatio !== null) {
        const dangerZone = document.createElementNS(ns, "path");
        if (dir === "higher_is_worse") {
          dangerZone.setAttribute("d", arcD(RING_R, dangerRatio, 1));
        } else {
          dangerZone.setAttribute("d", arcD(RING_R, 0, dangerRatio));
        }
        dangerZone.setAttribute("class", "gauge-zone-danger");
        svg.appendChild(dangerZone);
      }
      // Value arc — the live "fill".
      const valueArc = document.createElementNS(ns, "path");
      valueArc.setAttribute("d", arcD(RING_R, 0, ratio));
      valueArc.setAttribute("class", "gauge-value-arc");
      svg.appendChild(valueArc);
      // Tick marks at 0, 0.25, 0.5, 0.75, 1.
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const a = angAt(t);
        const [x0, y0] = polar(RING_R - 3, a);
        const [x1, y1] = polar(RING_R + 1, a);
        const tick = document.createElementNS(ns, "line");
        tick.setAttribute("x1", x0.toFixed(2)); tick.setAttribute("y1", y0.toFixed(2));
        tick.setAttribute("x2", x1.toFixed(2)); tick.setAttribute("y2", y1.toFixed(2));
        tick.setAttribute("class", "gauge-tick");
        svg.appendChild(tick);
      }
      // Value text in the center.
      const valText = document.createElementNS(ns, "text");
      valText.setAttribute("x", "50"); valText.setAttribute("y", "55");
      valText.setAttribute("text-anchor", "middle");
      valText.setAttribute("class", "gauge-value");
      // Format: integer if value is integer-valued, else one decimal.
      const valFmt = Number.isInteger(value) ? String(value) : value.toFixed(1);
      valText.textContent = valFmt + (spec.unit || "");
      svg.appendChild(valText);
      // Label above center.
      if (spec.label) {
        const lbl = document.createElementNS(ns, "text");
        lbl.setAttribute("x", "50"); lbl.setAttribute("y", "30");
        lbl.setAttribute("text-anchor", "middle");
        lbl.setAttribute("class", "gauge-label");
        lbl.textContent = String(spec.label).slice(0, 24);
        svg.appendChild(lbl);
      }
      // Range bounds at the dial endpoints (small).
      const minTxt = document.createElementNS(ns, "text");
      const [mxX, mxY] = polar(RING_R + 6, angAt(0));
      minTxt.setAttribute("x", mxX.toFixed(2)); minTxt.setAttribute("y", (mxY + 2).toFixed(2));
      minTxt.setAttribute("text-anchor", "middle");
      minTxt.setAttribute("class", "gauge-range-tick");
      minTxt.textContent = String(min);
      svg.appendChild(minTxt);
      const maxTxt = document.createElementNS(ns, "text");
      const [mnX, mnY] = polar(RING_R + 6, angAt(1));
      maxTxt.setAttribute("x", mnX.toFixed(2)); maxTxt.setAttribute("y", (mnY + 2).toFixed(2));
      maxTxt.setAttribute("text-anchor", "middle");
      maxTxt.setAttribute("class", "gauge-range-tick");
      maxTxt.textContent = String(max);
      svg.appendChild(maxTxt);
      target.innerHTML = "";
      target.appendChild(svg);
      applyNaturalCellSize(target, 220);
    };
    lazyMount(target, renderGauge);
  } else if (c.cell_type === "ascii" && c.spec) {
    // ASCII substrate: monospace box-drawing block. Spec is { ascii, kind? }.
    // Pure <pre>; theme tokens (--fg, --bg, --accent) drive color so it
    // reads on every theme without per-substrate CSS branches.
    const target = el("div", "ascii-target");
    body.appendChild(target);
    const renderAscii = () => {
      const ascii = (c.spec && c.spec.ascii) || "";
      const pre = el("pre", "ascii-pre");
      pre.textContent = ascii;
      target.innerHTML = "";
      target.appendChild(pre);
      // Natural width: longest line × ~9.0px/ch (box-drawing glyphs
      // at 0.88rem mono render wider than ASCII — the wider multiplier
      // keeps the ┌─┐ ╔═╗ corners from being squeezed past readability).
      // Min raised to 280 so single-narrow-line ASCII doesn't render
      // as a sliver. Per user 2026-04-29 cell-1249 unreadable case.
      const lines = ascii.split("\n");
      const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
      const w = Math.min(720, Math.max(280, 24 + longest * 9.0));
      applyNaturalCellSize(target, w);
    };
    lazyMount(target, renderAscii);
  } else if (c.cell_type === "scene3d" && c.spec) {
    // Lazy + LRU-capped: Three.js renderer + scene are created on first
    // viewport entry, paused when scrolled past, and fully disposed if
    // the cell remains the least-recently-visible non-visible scene when
    // a new scene needs to init. Re-init from spec on scroll-back.
    const target = el("div", "scene3d-target");
    // Stash the spec on the target so click-to-zoom can re-instantiate
    // the scene in the dialog clone (cloneNode(true) of a <canvas>
    // produces a blank canvas — the rendered pixels aren't part of the
    // DOM, so a literal clone shows nothing). The dialog reads this and
    // calls initScene3D fresh on the cloned target.
    try { target.dataset.scene3dSpec = JSON.stringify(c.spec); } catch (e) {}
    body.appendChild(target);
    let ctrl = null;
    const entry = {
      target: target,                  // for cell-removal disposal lookup
      visible: false,
      lastVisible: 0,
      teardown: () => {
        const h = target.offsetHeight;
        if (ctrl) { ctrl.dispose(); ctrl = null; }
        if (h > 20) target.style.minHeight = h + "px";
      },
    };
    pauseOffScreen(
      target,
      () => {
        entry.visible = true;
        touchWebGL(entry);
        if (!ctrl) {
          target.style.minHeight = "";
          ctrl = initScene3D(target, c.spec, resolveColor);
          if (ctrl) registerWebGL(entry);
        }
        if (ctrl) ctrl.play();
      },
      () => {
        entry.visible = false;
        touchWebGL(entry);
        if (ctrl) ctrl.pause();
        evictWebGLIfOverCap();
      },
    );
  } else if (c.cell_type === "text" && c.caption) {
    // caption-only renders below
  } else if (c.classifier_reasoning || c.confidence !== null) {
    // Proposal cell: classifier metadata exists but no spec/html/image yet.
    // Surface the reasoning so the cell isn't visually broken-looking.
    const proposal = el("div", "cell-proposal");
    const labelText = c.confidence != null
      ? `proposal — awaiting ${c.cell_type} spec  ·  confidence ${c.confidence.toFixed(2)}`
      : `proposal — awaiting ${c.cell_type} spec`;
    proposal.appendChild(el("div", "cell-proposal-label", labelText));
    if (c.classifier_reasoning) {
      proposal.appendChild(el("div", "cell-proposal-reasoning", c.classifier_reasoning));
    }
    body.appendChild(proposal);
  } else {
    body.appendChild(el("div", "cell-empty", "(no content for this cell)"));
  }

  if (c.caption) {
    const cap = el("div", "cell-caption", c.caption);
    cap.title = c.caption;
    cap.tabIndex = 0;
    card.appendChild(cap);
  }

  // Trigger snippet + prompt + notes: bottom of cell, collapsed by default.
  // Source (trigger / notes / prompt) — debug info, not primary
  // surface. User 2026-05-01: "really a debug thing anyway no one
  // will ever click it. Move to a small icon in the title bar".
  // Lives inside cell-head as a tiny "{·}" icon; content drops
  // below the head when opened. Per #92/#93 density pass.
  if (c.trigger_snippet || c.prompt || c.notes !== undefined) {
    const src = el("details", "cell-source");
    const summary = el("summary", null, "");
    summary.title = "source: trigger snippet / notes / prompt";
    summary.setAttribute("aria-label", "show cell source");
    src.appendChild(summary);
    if (c.trigger_snippet) {
      const block = el("div", "cell-source-block");
      block.appendChild(el("div", "cell-source-label", "trigger"));
      block.appendChild(el("pre", null, c.trigger_snippet));
      src.appendChild(block);
    }
    if (c.notes !== undefined) {
      const n = el("div", "cell-source-block cell-prompt-notes");
      n.appendChild(el("div", "cell-source-label", "notes"));
      const text = c.notes || "(unrated)";
      const parts = text.split(/(\bcell-\d{4}\b)/g);
      const wrap = el("div");
      for (const part of parts) {
        if (/^cell-\d{4}$/.test(part)) {
          const a = el("a", "cell-id-link", part);
          a.href = "#" + part;
          wrap.appendChild(a);
        } else if (part) {
          wrap.appendChild(document.createTextNode(part));
        }
      }
      n.appendChild(wrap);
      src.appendChild(n);
    }
    if (c.prompt) {
      const block = el("div", "cell-source-block");
      block.appendChild(el("div", "cell-source-label", "prompt"));
      block.appendChild(el("pre", null, c.prompt));
      src.appendChild(block);
    }
    head.appendChild(src);
  }

  // Multi-version comparison strip: when this cell supersedes a previous
  // attempt (c.replaces is set), inline the predecessor below the main
  // body so retry diffs are visible without leaving the cell. Single-step
  // (does not recurse the chain — only the immediately-prior version).
  // Compact mode used by the recursive call hides the head/source chrome
  // so only the predecessor's substrate body shows. Per Task #79.
  if (c.replaces && cellsById && !opts.compact) {
    const prev = cellsById.get(c.replaces);
    if (prev) {
      const strip = el("div", "cell-prev-strip");
      const label = el("div", "cell-prev-label");
      label.appendChild(el("span", "cell-prev-label-tag", "previous"));
      const prevLink = el("a", "cell-prev-id", prev.id);
      prevLink.href = "#" + prev.id;
      label.appendChild(prevLink);
      strip.appendChild(label);
      strip.appendChild(renderCell(prev, snippetGroups, cellsById, { compact: true }));
      card.appendChild(strip);
    }
  }

  // Archetype backdrop — paint substrate's themed-ambient archetype
  // (graph / bars / lines / series / bar-meter / blocks; same dispatch
  // as _mixed3dDrawCellPreview) at low alpha behind the cell body.
  // Substrate-content sits on top via z-index 1. Empty cell space
  // shows the archetype pattern, so a sparse cell reads "data
  // archetype lives here" instead of "blank rectangle." User
  // 2026-05-23: "post render fill cells with decorative content ...
  // fills empty space with our decorative primitives". Task #183
  // (B-path; A-path was the static SVG glyph fill in 8b59df3, now
  // composes with this archetype layer underneath).
  //
  // Gated to mixed3d layout only — the canyon's depth fog + tower-
  // glass tint mask the low-alpha archetype perfectly, but in pack/
  // grid 2D layouts the same alpha reads as visible bleed-through
  // on the flat dark cell background (observed pack-2D 2026-05-23).
  const _mixed3dActive = document.body?.classList?.contains("layout-mixed3d");
  // Archetype backdrop is hackers-aesthetic specifically — code-glyph
  // decorations and cyan/pink palette. Other themes read the bg as
  // visual noise that competes with cell text. Gate to hackers only.
  const _activeTheme = document.body?.dataset?.theme || "";
  const _archetypeBgOk = _activeTheme === "hackers";
  if (!opts.compact && _mixed3dActive && _archetypeBgOk && typeof _mixed3dDrawCellPreview === "function") {
    _ensureArchetypeBgCleanup();
    // Defensive: if the card is being re-rendered (rare), disconnect
    // the prior RO before attaching a new one. Without this, repeated
    // renderCell on the same card would stack RO instances.
    if (card._archetypeBgRO) {
      try { card._archetypeBgRO.disconnect(); } catch (e) { /* ignore */ }
      card._archetypeBgRO = null;
    }
    const bg = el("canvas", "cell-archetype-bg");
    card.appendChild(bg);
    const paint = () => {
      const rect = card.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(2, Math.floor(rect.width * dpr));
      const h = Math.max(2, Math.floor(rect.height * dpr));
      if (bg.width !== w) bg.width = w;
      if (bg.height !== h) bg.height = h;
      bg.style.width = rect.width + "px";
      bg.style.height = rect.height + "px";
      const ctx = bg.getContext("2d");
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = 0.18;
      // Pull archetype backdrop colors from the active theme rather
      // than hardcoded hackers cyan/pink. Previously every mixed3d
      // cell carried the hackers palette in its backdrop even under
      // EARTH, mars-blue, etc. — read as "hackers decorative text" in
      // the wrong themes.
      let primary = "#00ddff", secondary = "#ff3a8c";
      try {
        const cs = getComputedStyle(document.documentElement);
        const accent = cs.getPropertyValue("--accent").trim();
        const accent2 = cs.getPropertyValue("--accent-2").trim()
                     || cs.getPropertyValue("--vis-tripped").trim();
        if (accent) primary = accent;
        if (accent2) secondary = accent2;
      } catch (e) { /* ignore — fall back to defaults */ }
      try {
        _mixed3dDrawCellPreview(ctx, card, 0, 0, w, h, primary, secondary);
      } catch (e) {
        /* preview throws on degenerate inputs; ignore */
      }
    };
    // Defer first paint until layout has sized the cell.
    requestAnimationFrame(() => requestAnimationFrame(paint));
    if (typeof ResizeObserver !== "undefined") {
      // Debounced re-paint on size changes (cell-body lazy substrates
      // mount asynchronously, growing the cell). Single rAF debounce
      // is enough; ResizeObserver coalesces internally.
      let rafId = 0;
      const ro = new ResizeObserver(() => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          paint();
        });
      });
      ro.observe(card);
      card._archetypeBgRO = ro;
    }
  }

  return card;
}


load().catch(err => {
  document.getElementById("notebook").textContent =
    "load error: " + err.message;
});

initSessionDropdownTrigger();
initLayoutDropdownTrigger();
initThemeDropdownTrigger();

// HUD click-to-pin: clicking the HUD toggles data-expanded so it stays
// open without requiring continuous hover. Click the HUD again to
// collapse. Avoid toggling when the click landed on the SESSION
// dropdown or its trigger (those have their own handlers).
function toggleHudExpanded(e) {
  // Skip if click bubbled from the session-dropdown trigger or its popover
  const sessionCell = document.getElementById("hud-session-cell");
  const dropdown = document.getElementById("session-dropdown");
  if (sessionCell?.contains(e.target)) return;
  if (dropdown && dropdown.contains(e.target)) return;
  const hud = e.currentTarget;
  hud.dataset.expanded = hud.dataset.expanded === "true" ? "false" : "true";
  hud.setAttribute("aria-expanded", hud.dataset.expanded);
}
const hudEl = document.getElementById("hud");
hudEl?.addEventListener("click", toggleHudExpanded);
// Keyboard accessibility: Enter or Space activates the same toggle —
// touch users get the click handler, keyboard users get this. The HUD
// is now a focusable region (tabindex 0) with role="button"-like
// semantics. Touch devices with no hover state benefit from the click
// path so the expand-on-hover behavior is never the only way in.
hudEl?.setAttribute("tabindex", "0");
hudEl?.setAttribute("role", "button");
hudEl?.setAttribute("aria-expanded", "false");
hudEl?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggleHudExpanded({ currentTarget: hudEl, target: hudEl });
  }
});

// Edge-trigger HUD: the top strip is the highest-real-estate slot a
// theme has for instrument-grade chrome, so the HUD slides offscreen
// when not in use and reveals when the mouse approaches the viewport
// top.  The `data-hud-revealed` body attribute is the single source of
// truth (CSS handles the transform).  An initial grace window keeps
// the HUD visible long enough for first-time visitors to notice it.
(function setupHudEdgeTrigger() {
  const body = document.body;
  const hud = document.getElementById("hud");
  const hint = document.getElementById("hud-edge-hint");
  if (!body || !hud) return;
  const ACTIVATION_PX = 32;     // top-edge zone height (friendly, generous)
  const HIDE_AFTER_MS = 1400;   // idle time before re-hide
  const INITIAL_HINT_MS = 30000; // grace window on first paint — long enough for the first-time visitor to actually notice the HUD
  let hideTimer = null;
  let isOverHud = false;
  let isOverHint = false;
  function reveal() {
    body.dataset.hudRevealed = "1";
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }
  function scheduleHide(delay) {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = null;
      // Don't hide if any dropdown is open, mouse is still in the
      // active region, or a HUD descendant has focus.
      const dropdownOpen = !!document.querySelector(".session-dropdown:not([hidden])");
      const hudFocused = document.activeElement && hud.contains(document.activeElement);
      if (dropdownOpen || isOverHud || isOverHint || hudFocused) {
        scheduleHide(HIDE_AFTER_MS);
        return;
      }
      body.dataset.hudRevealed = "0";
    }, delay);
  }
  reveal();
  scheduleHide(INITIAL_HINT_MS);
  window.addEventListener("mousemove", (e) => {
    if (e.clientY <= ACTIVATION_PX) {
      reveal();
      scheduleHide(HIDE_AFTER_MS);
    }
  }, { passive: true });
  hud.addEventListener("mouseenter", () => { isOverHud = true; reveal(); });
  hud.addEventListener("mouseleave", () => { isOverHud = false; scheduleHide(HIDE_AFTER_MS); });
  if (hint) {
    hint.addEventListener("mouseenter", () => { isOverHint = true; reveal(); });
    hint.addEventListener("mouseleave", () => { isOverHint = false; scheduleHide(HIDE_AFTER_MS); });
    // Click the hint to pin the HUD open until the user moves away.
    hint.addEventListener("click", () => { reveal(); scheduleHide(HIDE_AFTER_MS * 3); });
  }
  hud.addEventListener("focusin", reveal);
  hud.addEventListener("focusout", () => scheduleHide(HIDE_AFTER_MS));
})();

// HUD bootstraps and polls fast. Hackertyper-feel reveal happens
// inside typeInto() but only on actual value changes (cached), so the
// poll cadence doesn't cause header flicker. The since-last-mint
// counter ticks every second so the HUD feels alive even between polls.
loadHud().catch(() => {});
// 3000ms (was 1500ms): at saturation (~7000 cells, ~5MB cells.json)
// the JSON.parse floor is ~50-100ms per poll even when fingerprint
// short-circuits. Halving poll frequency halves the parse cost. UX
// is fine — organic mints land every ~30-50s on average, so 3s
// freshness is well under the inter-mint interval.
setInterval(() => loadHud().catch(() => {}), 3000);
setInterval(tickSinceLast, 1000);

// =====================================================================
// Transient cells — ambient "computer thinking fast" flair (Task #94)
// =====================================================================
// Iron-Man-HUD-style: ephemeral cells that imply detail without conveying
// it. Pure client-side decoration — never persisted, never in cells.json.
// Spawned on a randomized 12-20s timer when watcher has been active in
// the last 60s (otherwise they'd flicker over a dormant dashboard, which
// reads as "broken" rather than "thinking"). Live ~5-8s, fade out,
// Muuri-remove.
//
// Theme content (only meaningful in pack mode where the layout treats
// them as peers — alternate layouts skip them):
//   magi   → hex register dump (BIOS-style scrolling values, NERV digital)
//   gastown→ steam/pipe/gauge fluctuating (mechanical thinking-fast)
//   lab    → ECG-like waveform with rapid noise spikes
//   *      → generic flickering glyph storm
//
// All animation is CSS-driven so removing the node tears down the
// animation without leftover rAF loops.
//
// Tagged data-cell-type="transient" so connection-line drawing,
// replaces-strip recursion, session-thread routing, and the recent-mint
// HUD ticker all naturally skip these. They participate in Muuri layout
// (the point — they sit IN the dashboard like real cells).

const _transientState = {
  // Last time we saw a real cell mint (any append by liveAppendNewCells).
  // Spawning is gated on activity within the last 60s.
  lastRealMintTs: Date.now(),
  // Active transient cell elements, keyed by their generated id, so we
  // can dispose during a layout-mode change before they expire.
  active: new Map(),
};

function _transientNote(activity) {
  // Called by the livefeed path on real mint (and by load() at boot)
  // to keep the spawn gate fresh. On a real mint, also fire a small
  // burst of transients with random delays — Iron-Man-HUD-style
  // "thunderclap": one real readout lands and several secondary
  // flickers cascade with it. Reads as "system processed many things,
  // here's the one that crystallised". Per Task #96 option C.
  if (!activity) return;
  _transientState.lastRealMintTs = Date.now();
  // 0-2 burst spawns. Most mints get 0 (quiet), some get 1, occasional
  // 2 — keeps the burst from feeling metronomic. Stagger 200-900ms.
  const burst = Math.random() < 0.55 ? (Math.random() < 0.7 ? 1 : 2) : 0;
  for (let i = 0; i < burst; i++) {
    setTimeout(() => spawnTransientCell(), 200 + Math.random() * 700);
  }
}


// Transient cell body builders. THEME_REGISTRY[theme].transient names
// the builder; missing entries fall through to the generic builder.
const TRANSIENT_BUILDERS = {
  conclave:  _buildTransientConclave,
  gastown:   _buildTransientGastown,
  lab:       _buildTransientLab,
  vigil:     _buildTransientVigil,
  ops:       _buildTransientOps,
  noir:      _buildTransientNoir,
  terminus:  _buildTransientTerminus,
  circuit:   _buildTransientCircuit,
  mainframe: _buildTransientMainframe,
  renegade:  _buildTransientRenegade,
  minimal:   _buildTransientMinimal,
  "mars-blue": _buildTransientMarsBlue,
  drift:       _buildTransientDrift,
  earth:       _buildTransientEarth,
};

function _buildTransientBody(body, theme) {
  body.classList.add("transient-body");
  const key = THEME_REGISTRY[theme]?.transient;
  const builder = key ? TRANSIENT_BUILDERS[key] : null;
  return (builder || _buildTransientGeneric)(body);
}

// Per-theme motion default: "pack" since 2026-05-24. Edge-overlay was
// originally per-theme aesthetic (LCARS-style frame slide-ins, surveillance
// camera popups) but it covered real cells while flying over them — user
// 2026-05-24: "I don't know if the ephemeral cells should overlap real
// cells" + "more like tier-2 cells." Pack motion treats transients as
// peer Muuri items (small footprint, slot into gaps) instead of overlays.
// Themes can override via THEME_REGISTRY[theme].motion when needed.

function spawnTransientCell(opts) {
  // opts.mode: "active" (default — fires during active dashboard work)
  //            "standby" (slower, dimmer; fires during long idle to keep
  //                       the dashboard from reading as broken/dead)
  opts = opts || { mode: "active" };
  const isStandby = opts.mode === "standby";
  // Activity gate: in active mode, only spawn if a real cell minted in
  // the last 60s. In standby mode, the gate has been bypassed by the
  // caller — the loop has decided we're in the long-idle regime.
  if (!isStandby && Date.now() - _transientState.lastRealMintTs > 60000) return;
  const root = document.getElementById("notebook");
  if (!root) return;

  const theme = _transientThemeName();
  const motion = THEME_REGISTRY[theme]?.motion || "pack";
  // Pack-mode requires Muuri; alternate layouts (treemap, scatter,
  // organic) skip the pack variant entirely. Edge-slide is overlay-
  // positioned so it works in any layout mode.
  if (motion === "pack" && (getLayoutMode() !== "pack" || !_muuriGrid)) return;
  // Mixed3d (war room, mixed3d tower canyon): cells are hand-placed
  // CSS3DObjects on a dome / tower face — no slot system to pack
  // ephemerals into without overlap. Suppress transients entirely
  // here; ambient motion comes from holo spin + crossfade.
  if (getLayoutMode() === "mixed3d") return;

  const card = el("article", "cell cell-transient");
  card.classList.add("cell-transient-motion-" + motion);
  card.classList.add("cell-transient-enter");
  if (isStandby) card.classList.add("cell-transient-standby");
  const tid = "ephem-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  card.dataset.cellType = "transient";
  card.dataset.transientId = tid;
  card.dataset.transientMotion = motion;
  if (isStandby) card.dataset.transientMode = "standby";
  const w = 150 + Math.floor(Math.random() * 70);
  const h = 110 + Math.floor(Math.random() * 70);
  card.style.width = w + "px";
  card.style.height = h + "px";

  const head = el("div", "cell-head");
  head.appendChild(el("span", "cell-transient-tag", isStandby ? "STANDBY" : "—"));
  card.appendChild(head);
  const body = el("div", "cell-body");
  card.appendChild(body);
  _buildTransientBody(body, theme);

  if (motion === "pack") {
    // Use .pack-prep (opacity:0 + transition) instead of visibility:
    // hidden so the cell can't get stuck invisible if Muuri's layout
    // callback doesn't fire — even a late .pack-prep removal fades
    // smoothly. 2026-05-24 user: ephemeral cells flashed in a grid at
    // boot. Belt-and-suspenders unprep: callback + rAF + 300ms safety.
    card.classList.add("pack-prep");
    root.appendChild(card);
    try {
      _muuriGrid.add([card], { layout: true });
      const _unprep = () => card.classList.remove("pack-prep");
      _muuriGrid.layout(false, _unprep);
      requestAnimationFrame(_unprep);
      setTimeout(_unprep, 300);
    } catch (e) {
      card.classList.remove("pack-prep");
    }
  } else {
    // Edge-slide: position fixed-overlay anchored to a screen edge.
    // Pick a random edge per spawn so the screen doesn't feel like a
    // single-corner ticker.
    const edges = ["right", "left", "top", "bottom"];
    const edge = edges[(Math.random() * edges.length) | 0];
    card.dataset.transientEdge = edge;
    // Position depends on edge — the slide-in animation picks up the
    // anchor via data attribute and CSS handles the keyframe.
    card.style.position = "fixed";
    card.style.zIndex = "60";
    const margin = 32;
    const along = 80 + Math.random() * (window.innerHeight - 240);
    const acrossH = 80 + Math.random() * (window.innerWidth - 240);
    if (edge === "right")  { card.style.right  = margin + "px"; card.style.top  = along  + "px"; }
    if (edge === "left")   { card.style.left   = margin + "px"; card.style.top  = along  + "px"; }
    if (edge === "top")    { card.style.top    = margin + "px"; card.style.left = acrossH + "px"; }
    if (edge === "bottom") { card.style.bottom = margin + "px"; card.style.left = acrossH + "px"; }
    document.body.appendChild(card);
  }
  _transientState.active.set(tid, card);

  // Lifespan 5-8s. Fade out via class swap, then remove.
  const lifespan = 5000 + Math.floor(Math.random() * 3000);
  setTimeout(() => removeTransientCell(card), lifespan);
}

function removeTransientCell(card) {
  if (!card || !card.isConnected) return;
  card.classList.add("cell-transient-leave");
  const motion = card.dataset.transientMotion || "pack";
  setTimeout(() => {
    if (!card.isConnected) return;
    if (motion === "pack") {
      try { _muuriGrid && _muuriGrid.remove([card], { removeElements: true, layout: true }); }
      catch (e) { card.remove(); }
    } else {
      card.remove();
    }
    if (card.dataset.transientId) _transientState.active.delete(card.dataset.transientId);
  }, 450);
}

function _transientLoopTick() {
  // Activity-density-aware cadence (Task #96 option C). Buckets:
  //   <10s since last real mint  → 4-8s   (burst window — system busy)
  //   10-30s                      → 12-20s (steady ambient)
  //   30-60s                      → 30-60s (drift, low rate)
  //   60-180s                     → standby spawn every 45-90s
  //   >180s                       → standby spawn every 90-180s
  // Standby cells fire even past the 60s active gate so the dashboard
  // doesn't read as broken/dead during long idle — just slower, dimmer.
  const idle = Date.now() - _transientState.lastRealMintTs;
  let next;
  if (idle < 60000) {
    spawnTransientCell();  // active mode
    if (idle < 10000)      next =  4000 + Math.floor(Math.random() * 4000);
    else if (idle < 30000) next = 12000 + Math.floor(Math.random() * 8000);
    else                   next = 30000 + Math.floor(Math.random() * 30000);
  } else {
    spawnTransientCell({ mode: "standby" });
    if (idle < 180000) next = 45000 + Math.floor(Math.random() * 45000);
    else               next = 90000 + Math.floor(Math.random() * 90000);
  }
  setTimeout(_transientLoopTick, next);
}

// First spawn delay 6-10s after page load so initial render settles.
setTimeout(_transientLoopTick, 6000 + Math.floor(Math.random() * 4000));

// =====================================================================
// Mint-time scrubber — content-layer "thinking fast" overlay (Task #95)
// =====================================================================
// On each fresh cell mint, drop a rapid theme-tuned glyph storm OVER
// the cell body for ~700ms. The storm fades out and removes itself,
// revealing the real substrate render underneath. Pairs with the
// frame-layer wireframe-reveal animation that already runs during
// cell-fresh.
//
// Cheap: single absolute-positioned div, one setInterval that re-rolls
// glyph content every ~70ms, a setTimeout that tears it all down.
// Theme-tuned via the same palette helper that drives transient cells.

function attachMintScrubber(cellNode) {
  const body = cellNode && cellNode.querySelector(".cell-body");
  if (!body) return;
  // Mixed3d layouts have no cell wall packing; the scrubber overlay's
  // theme-tuned decorative-glyph storm (sparklines, bars) appears as
  // a "fake plot in the corner" of dome cells. Suppress in mixed3d
  // entirely — the WebGL holos + crossfade already cover ambient
  // motion. User 2026-05-31.
  if (getLayoutMode() === "mixed3d") return;
  // Don't double-attach (defensive — a cell shouldn't re-enter cell-fresh).
  if (body.querySelector(".mint-scrubber")) return;
  const theme = _transientThemeName();
  const overlay = el("div", "mint-scrubber");
  // Theme-coherent body: re-use the same transient body builder so each
  // cell is born out of the same theme-specific texture that ambient
  // transient cells use. The overlay tears down after ~700ms, so any
  // setInterval/setTimeout that gates on overlay.isConnected
  // self-terminates. Themes whose builders use heavyweight state
  // (mainframe punchcards, terminus boot sequence) still mount fine —
  // their 240-720ms cycle barely fires before tear-down, which reads
  // as a flash rather than a full body.
  _buildTransientBody(overlay, theme);
  body.appendChild(overlay);
  // Tear-down: fade-out class for 280ms, then remove. The transient
  // body's own intervals self-clear when overlay.isConnected goes false.
  setTimeout(() => {
    overlay.classList.add("mint-scrubber-leave");
    setTimeout(() => {
      overlay.remove();
    }, 280);
  }, 700);
}

// Expose for debugging / power-user manual triggers from console.
// The module-scoped declarations aren't visible globally otherwise.
window.spawnTransientCell = spawnTransientCell;
window._transientState = _transientState;
window.attachMintScrubber = attachMintScrubber;
