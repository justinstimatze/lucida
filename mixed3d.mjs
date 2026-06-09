// mixed3d.mjs — 2D/3D-mixed FUI substrate (WebGL world + CSS3D / canvas cells).
// Powers the `hackers` theme (Gibson canyon-of-towers) and the war-room
// variants of unn/rocinante/belter (?layout=mixed3d).  Extracted from
// lucida.mjs in the per-theme module split (task #70); ~8.9k lines, the
// largest single slice and the last theme-runtime code remaining in the
// monolith.
//
// External deps:
//   buildScene3DMeshes  — scene3d substrate ports onto the war-room holo ring
//   el                  — DOM helper used in the hotkey-legend overlay
//   resolveColor        — CSS-var/$token color resolver used by scene3d ports
//   state               — top-level rendering state (cellsById lookups for
//                         tier-1 promotion + decorative paint)
//
// Exports:
//   applyMixed3DLayout       — entry point invoked by LAYOUT_REGISTRY
//   teardownMixed3DLayout    — idempotent reset (safe to call when no state)
//   _mixed3dDrawCellPreview  — archetype-bg painter called from renderCell
//                              when document.body has .layout-mixed3d
//
// Sub-extractions inside the block (camera tour / substrate renderers /
// decorative layer / tier management) deferred to a second pass — see
// memory/handoff_2026_06_08_mixed3d_extraction.md.

import { buildScene3DMeshes } from "./scene3d.mjs?v=2";

// Bridge to lucida.mjs internals (state / LOG / el / resolveColor /
// _normalizeMermaidSpec).  Populated by lucida.mjs once all five are
// defined (window.__LUCIDA = {...}).  Bound LAZILY at first call into
// the module — mixed3d is imported by lucida.mjs near the TOP, so at
// this module's evaluation time lucida hasn't assigned the bridge yet.
//
// Going through window avoids importing back from lucida.mjs.  ESM
// modules are scoped by URL string: if index.html loads `lucida.mjs?v=N`
// and a consumer does `from "./lucida.mjs"` (or a stale ?v=), the two
// URLs resolve to DIFFERENT modules and the browser double-loads lucida,
// each copy with its own _muuriGrid / state / LOG.  Reproduced 2026-06-08
// as a fatal Muuri "one item per element" on every theme.  The bridge
// closes that class of bug and matches the codebase convention
// (window.__LUCIDA_THEME from theme-mars-blue.mjs).
let el, resolveColor, state, LOG, _normalizeMermaidSpec;
function _bindLucida() {
  if (state) return;  // already bound
  ({ el, resolveColor, state, LOG, _normalizeMermaidSpec } = window.__LUCIDA);
}

// ----------------------------------------------------------------
// mixed3d: WebGL world + CSS3DRenderer cells on tower faces.
// Seed of the 2D/3D-mixed FUI family. World layer is Three.js native
// so a future WebXR phase can swap CSS3D for canvas-textured planes
// without touching world geometry. Theme tokens drive opts:
//   TOKENS.mixed3d = {
//     camera:      "dolly-canyon" | "drift" | "fixed-parallax",
//     arrangement: "towers" | "planes-on-wall" | "floating-grid",
//     material:    "glass" | "holographic" | "opaque" | "neon",
//     world: { floor, particles, sky, tower_tint, floor_grid, floor_accent },
//     danger: { tower_tint, beam, particles_color }
//   }
// Per memory/gibson_layout_arc.md.
// ----------------------------------------------------------------
let _mixed3dState = null;

function _mixed3dResolveOpts(opts) {
  const O = opts || {};
  return {
    // Default camera = swoopy-tour: bezier-arc passes that match
    // the Hackers Gibson scene's pacing. dolly-canyon and weave-grid
    // remain opt-in via tokens for themes that prefer corridor or
    // ping-pong motion. Was "dolly-canyon" — too tame as a default.
    camera: O.camera || "swoopy-tour",
    arrangement: O.arrangement || "towers",
    material: O.material || "glass",
    world: Object.assign(
      {
        floor: "circuit",
        particles: true,
        sky: "void",
        tower_tint: "#00ddff",
        floor_grid: "#003344",
        floor_accent: "#ff3a8c",
      },
      O.world || {},
    ),
    danger: Object.assign(
      { tower_tint: "#ff3030", beam: "#c040ff", particles_color: "#ffaa55" },
      O.danger || {},
    ),
  };
}

export function applyMixed3DLayout(opts) {
  _bindLucida();
  if (!window.THREE) return;
  const T = window.THREE;
  if (!T.CSS3DRenderer || !T.CSS3DObject) {
    console.warn("[mixed3d] CSS3DRenderer not loaded; bailing.");
    return;
  }
  const root = document.getElementById("notebook");
  if (!root) return;
  const O = _mixed3dResolveOpts(opts);
  // Arrangement dispatch: war-room (EARTH holo-table) is a separate
  // world (flat disc + ring of cells around its periphery) — too
  // different from the canyon-of-towers to share the body of this
  // function. Sibling owns its own renderer/scene/camera/loop and
  // writes into the same _mixed3dState slot so teardown remains
  // uniform.  Idempotent on poll: if war-room state already exists,
  // skip rebuild (the rAF loop is already animating; the ring is a
  // one-time placement and new cells stream in via future _sync work
  // not implemented in v1).
  if (O.arrangement === "war-room") {
    if (_mixed3dState && _mixed3dState._arrangement === "war-room") return;
    applyMixed3DWarRoom(O);
    return;
  }
  // Boot-time perf checkpoints. Each phase logs its wall-clock
  // duration in ms so we can spot which part of init dominates the
  // loading-screen-to-interactive gap (user 2026-05-04: "took like
  // 15 seconds after the loading screen disappeared to actually load").
  const _bootT0 = performance.now();
  const _bootDebug =
    new URLSearchParams(window.location.search).get("debug") === "1" ||
    new URLSearchParams(window.location.search).get("perf") === "1";
  // Update the boot-overlay title with a phase-appropriate phrase so
  // the user sees movement during the ~14s scene-construction gap
  // (was dead-air "INITIALIZING" the whole time — first-impression
  // killer for fans who load ?theme=hackers and see no progress).
  // overlayTitle is null for non-mixed3d themes; the call is safe.
  const _bootTitleEl = document.querySelector("#boot-overlay .boot-title");
  const _bootMark = (label, displayTitle) => {
    if (_bootTitleEl && displayTitle) _bootTitleEl.textContent = displayTitle;
    if (!_bootDebug) return;
    const t = performance.now();
    const dt = (t - _bootT0).toFixed(0);
    LOG.debug(`[mixed3d.boot] +${dt}ms ${label}`);
  };
  _bootMark("applyMixed3DLayout start", "WARMING CANYON");

  // Incremental: scene already exists for the same arrangement → just
  // sync cell placements (add fresh / drop stale). Mirrors Muuri's
  // incremental path — avoids "everything flies around" on poll.
  if (_mixed3dState && _mixed3dState.opts.arrangement === O.arrangement) {
    console.info(`[mixed3d] applyLayout: sync-cells path @ ${performance.now().toFixed(0)}ms`);
    _mixed3dSyncCells();
    return;
  }
  if (_mixed3dState) {
    console.warn(`[mixed3d] applyLayout: FULL REBUILD path (prev arr=${_mixed3dState.opts.arrangement} → ${O.arrangement}) @ ${performance.now().toFixed(0)}ms`);
    teardownMixed3DLayout();
  } else {
    console.info(`[mixed3d] applyLayout: first-time build @ ${performance.now().toFixed(0)}ms`);
  }

  // Wrap holds both renderers. position:fixed at z below HUD; pointer
  // events flow through to css renderer so cells stay interactive.
  const wrap = el("div");
  wrap.id = "mixed3d-wrap";
  document.body.appendChild(wrap);
  const webglMount = el("div");
  webglMount.id = "mixed3d-webgl";
  const cssMount = el("div");
  cssMount.id = "mixed3d-css";
  wrap.appendChild(webglMount);
  wrap.appendChild(cssMount);

  const w = window.innerWidth;
  const h = window.innerHeight;

  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  renderer.setClearColor(0x000000, 0);
  webglMount.appendChild(renderer.domElement);
  // Always-on context loss/restore logging. Default browser behavior
  // is to NOT restore after a loss — preventDefault makes restore
  // possible. We log timestamps so visible "all flashes at once" can
  // be cross-referenced against context events.
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    console.warn(`[mixed3d] WebGL context LOST @ ${performance.now().toFixed(0)}ms`, e);
  }, false);
  renderer.domElement.addEventListener("webglcontextrestored", (e) => {
    console.info(`[mixed3d] WebGL context RESTORED @ ${performance.now().toFixed(0)}ms`);
  }, false);
  // Click-to-park: raycast through cellObjects, lerp the camera to the
  // hit cell for inspection / screenshotting. Click empty space (or
  // press Escape) to release. Disabled during warmup so the user
  // doesn't accidentally fire it while the boot overlay is up.
  //
  // Listener attached on `window` with capture, because the WebGL
  // canvas itself has pointer-events:none (the CSS3D layer floats
  // above it and pointer-events flow to that for cell interactivity).
  // We don't need the listener to BE on the canvas — the event still
  // carries client coordinates, which is all the raycaster needs.
  window.addEventListener("click", (e) => {
    const S = _mixed3dState;
    if (!S || S._warmupActive) return;
    // (Earlier boot-ease-in guard removed 2026-05-23: it broke
    // legitimate left-click-to-lerp interactions. The actual stuck-
    // state was free-flight _userTookCamera, not click-during-boot;
    // R / Escape reset paths cover that.)
    // Ignore clicks on HUD chrome (dropdowns, dialogs, etc).
    if (e.target?.closest?.("#hud, #notebook-dialog, .dropdown, button, a")) return;
    const T2 = window.THREE;
    if (!T2 || !S.camera || !S.renderer) return;
    const rect = S.renderer.domElement.getBoundingClientRect();
    const mouse = new T2.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new T2.Raycaster();
    ray.setFromCamera(mouse, S.camera);
    const meshes = [];
    for (const o of S.cellObjects.values()) {
      if (!o.isInstanceHandle && o.visible !== false) meshes.push(o);
    }
    const hits = ray.intersectObjects(meshes, false);
    if (hits.length === 0) {
      if (S._park) window._mixed3dUnpark();
      return;
    }
    let hitId = null;
    for (const [id, o] of S.cellObjects) {
      if (o === hits[0].object) { hitId = id; break; }
    }
    if (!hitId) return;
    LOG.debug("[mixed3d] park", window._mixed3dParkAt(hitId));
    // Also copy id + metadata to clipboard so the user can paste it
    // to the assistant. Includes the bits needed to look up the cell
    // in cells.json + understand its rendering state.
    const hitObj = S.cellObjects.get(hitId);
    const hitEl = hitObj?.userData?.cellEl;
    const meta = {
      id: hitId,
      cellType: hitEl?.dataset?.cellType,
      mermaidSubtype: hitEl?.dataset?.mermaidSubtype,
      htmlLayout: hitEl?.dataset?.htmlLayout,
      title: hitEl?.querySelector(".cell-title")?.textContent?.trim(),
      tier: hitObj?.userData?.tier,
      colspan: hitObj?.userData?.colspan,
      cached: !!S._snapTexCache?.has(hitId),
      position: hitObj ? {
        x: +hitObj.position.x.toFixed(2),
        y: +hitObj.position.y.toFixed(2),
        z: +hitObj.position.z.toFixed(2),
      } : null,
    };
    const text = JSON.stringify(meta, null, 2);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }, true);
  // Mouselook on left-drag: distinguish click (≤10px movement) from
  // drag (>10px) so a stationary click still fires the click-to-park
  // raycaster above. On drag, suspend swoopy (set _userTookCamera +
  // seed _ffYaw/_ffPitch from current camera dir), accumulate
  // movementX/Y deltas. On mouseup if dragged, swallow the next
  // click so park doesn't fire. Reset via R / Escape per the
  // free-flight exit hatch added 2026-05-23. Trackpad-friendly
  // (no need for a right mouse button).
  //
  // INSTALL-ONCE: applyMixed3DLayout can be called multiple times
  // (layout switches, re-mounts). Without the guard, each call
  // attached fresh global mousedown/move/up/click/keydown listeners
  // — leaked N × switches handlers (audit 2026-05-23). State checks
  // inside the handlers (`if (!_mixed3dState) return`) cover the
  // case where the layout isn't mixed3d.
  if (!window._lucidaMouselookInstalled) {
    window._lucidaMouselookInstalled = true;
    const _mlState = { down: null, dragging: false, suppressNextClick: false };
    const DRAG_THRESHOLD_PX = 10;
    const MOUSELOOK_SENS = 0.003;
    window.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const S = _mixed3dState;
    if (!S || S._warmupActive) return;
    if (e.target?.closest?.("#hud, #notebook-dialog, .dropdown, button, a")) return;
    _mlState.down = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY };
    _mlState.dragging = false;
  });
  window.addEventListener("mousemove", (e) => {
    if (!_mlState.down) return;
    const dx = e.clientX - _mlState.down.x;
    const dy = e.clientY - _mlState.down.y;
    if (!_mlState.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      const S = _mixed3dState;
      if (!S || !S.camera) return;
      const T = window.THREE;
      const dir = new T.Vector3();
      S.camera.getWorldDirection(dir);
      S._ffYaw = Math.atan2(dir.x, dir.z);
      S._ffPitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
      S._userTookCamera = true;
      S._mouselookActive = true;
      _mlState.dragging = true;
    }
    if (_mlState.dragging) {
      const S = _mixed3dState;
      if (!S) return;
      const movX = e.clientX - _mlState.down.lastX;
      const movY = e.clientY - _mlState.down.lastY;
      S._ffYaw = (S._ffYaw || 0) - movX * MOUSELOOK_SENS;
      S._ffPitch = Math.max(-1.3, Math.min(1.3, (S._ffPitch || 0) + movY * MOUSELOOK_SENS));
      _mlState.down.lastX = e.clientX;
      _mlState.down.lastY = e.clientY;
    }
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button !== 0) return;
    if (!_mlState.down) return;
    const wasDragging = _mlState.dragging;
    if (wasDragging) _mlState.suppressNextClick = true;
    _mlState.down = null;
    _mlState.dragging = false;
    // Mouselook is a temporary peek — release → resume swoopy. User
    // 2026-05-23: "left click to mouselook isn't working" was partly
    // because _ffYaw/_ffPitch updates weren't being driven (fixed in
    // _mixed3dDriveCamera) AND because release left the camera
    // stranded in _userTookCamera state.
    if (wasDragging && typeof window._mixed3dResetSwoopy === "function") {
      window._mixed3dResetSwoopy();
    }
  });
  // Suppress the click event that fires after a drag-release so the
  // click-to-park raycaster doesn't fire on the mouseup of a drag.
  window.addEventListener("click", (e) => {
    if (_mlState.suppressNextClick) {
      _mlState.suppressNextClick = false;
      e.stopPropagation();
    }
  }, true);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        // Escape clears parked OR free-flight state. Without the latter
        // branch, pressing WASD/arrows then Escape left _userTookCamera
        // true and the swoopy never re-engaged (reported 2026-05-23).
        if (_mixed3dState?._park) window._mixed3dUnpark();
        if (_mixed3dState?._userTookCamera && typeof window._mixed3dResetSwoopy === "function") {
          window._mixed3dResetSwoopy();
        }
      }
    });
  } // end install-once guard

  const css3dRenderer = new T.CSS3DRenderer();
  css3dRenderer.setSize(w, h);
  cssMount.appendChild(css3dRenderer.domElement);

  // FOV 75°: wider than the typical 50–60° default to read as
  // "looming canyon" — Gibson scenes feel close to wide-angle.
  // Tunable via the FOV vocab in chat (cf. user's "fov is also odd").
  const camera = new T.PerspectiveCamera(75, w / h, 0.1, 240);
  // Initial position: low altitude inside the grid. Driver
  // (_mixed3dDriveCamera) takes over each tick. Initial lookAt
  // along +X to give a sensible starting frame before the weave
  // path initializes its own state. Hardcoded look-target
  // (12, 4, 0) since `spacing` is declared lower in the function.
  camera.position.set(0, 4, 0);
  camera.lookAt(12, 4, 0);

  const scene = new T.Scene();
  // Two CSS3D scenes for LOD throttling. cssScene = T1 (close cells,
  // rendered every 3rd frame ~ 20Hz). cssSceneFar = T2 (mid-range
  // cells, rendered every 12th frame ~ 5Hz). Cells migrate between
  // them based on distance via _mixed3dReassignTiers, with 4u
  // hysteresis (T1 below 23u, T2 above 27u). Cells beyond 55u get
  // visible=false in whichever scene they're in (cull). Single shared
  // cameraElement in the renderer means elements coexist in one DOM
  // subtree regardless of source scene.
  const cssScene = new T.Scene();
  const cssSceneFar = new T.Scene();
  // Heavier fog (0.06 vs prior 0.04) so back tower faces fade into
  // black void rather than contributing decorative text clutter to
  // mid-distance — user 2026-05-19 "we need more dark fog drop off
  // so that the back tower faces don't add too much visual clutter".
  // Towers ~50 units away ≈ 5% visible; ~80 units ≈ 1%.
  scene.fog = new T.FogExp2(0x000308, 0.06);

  // Lighting — bright key from above-canyon, low ambient, side fill.
  scene.add(new T.AmbientLight(0xffffff, 0.35));
  const tint = new T.Color(O.world.tower_tint);
  const key = new T.PointLight(tint, 1.4, 60);
  key.position.set(0, 14, 8);
  scene.add(key);
  // Field-wide floor uplight: a hemisphere with cyan ground color
  // and dark sky. Casts cyan onto the underside of every object —
  // every tower base picks up identical light, so distant and
  // near towers read with the SAME base color (was tinted unevenly
  // by a central PointLight whose falloff brightened middle towers
  // and dimmed edges; user 2026-05-02 "the floor of each tower
  // needs to be the same color").
  const hemi = new T.HemisphereLight(0x000308, tint, 1.0);
  hemi.position.set(0, 0, 0);
  scene.add(hemi);

  // Towers — 20×20 grid (was 8×2 canyon walls). User 2026-05-02:
  // "the grid of towers is much bigger. seemingly like 20 by 20
  // towers. the camera stays low and flies between the towers so
  // you rarely get a wide angle view so the field feels semi
  // infinite."
  // Square footprint per Gibson reference. 6:1 height ratio.
  // gap = towerW = 3.0 in both directions ("one tower's worth of
  // space between pairs of towers in both directions").
  // Per tower: 4 sides × 7 verts + 1 top = 29 slots → 11600 total,
  // far past the cell cap, but most towers stay empty/glass — that's
  // the architecture, the cells are the content.
  // 10×10 grid = 100 towers. Tower proportions tuned via Fisher
  // Stevens at video 5:54 (5'7"). Iterations: 4×4×12 → 4×4×16 →
  // 5×5×15 → 5×5×19 → 5×5×17 (user 2026-05-02: "a little too tall
  // now, bring them back down"). 3.4:1 aspect, gap = 7 (1.4× towerW).
  const towerCount = 10;
  const towerW = 5.0;
  const towerH = 17.0;
  const towerD = 5.0;
  const spacing = 12.0;
  const towerMeshes = [];
  _bootMark("renderer/scene/camera ready", "RAISING SCAFFOLD");
  const sharedBox = new T.BoxGeometry(towerW, towerH, towerD);
  // Edge-tube architecture: LineBasicMaterial.linewidth is clamped to
  // 1px in WebGL on most browsers, which made the previous wireframe
  // edges appear hairline-thin. Per refs the Gibson towers have
  // distinctly bold cyan corner edges that read as the structural
  // skeleton of the canyon. Replaced LineSegments with thin BoxGeometry
  // "tubes" at each of the 12 tower edges (4 X-aligned, 4 Y-aligned,
  // 4 Z-aligned), batched per-axis as InstancedMesh — 3 draw calls
  // total for all 1200 edge tubes across 100 towers.
  const edgeThick = 0.06;
  // X-axis edges span tower width, Y-axis spans height, Z-axis spans depth.
  // Each box is slightly oversized on its long axis so corner cubes overlap
  // cleanly with the perpendicular edges at the joins (no visible gap).
  const xEdgeGeo = new T.BoxGeometry(towerW + edgeThick, edgeThick, edgeThick);
  const yEdgeGeo = new T.BoxGeometry(edgeThick, towerH + edgeThick, edgeThick);
  const zEdgeGeo = new T.BoxGeometry(edgeThick, edgeThick, towerD + edgeThick);
  // Tower base glow — a billboarded sprite (always faces camera)
  // with a radial-gradient cyan texture, additive blend. Sprites
  // stay visible from any camera angle, where a flat disk goes
  // edge-on and disappears at low altitude. User 2026-05-02:
  // "the towers were lit from below, their bases glow and kind of
  // wash out where the tower meets the floor."
  const _glowCanvas = document.createElement("canvas");
  _glowCanvas.width = 256;
  _glowCanvas.height = 256;
  const _gctx = _glowCanvas.getContext("2d");
  const _grad = _gctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  _grad.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
  _grad.addColorStop(0.18, O.world.tower_tint);
  _grad.addColorStop(0.55, "rgba(0, 110, 140, 0.35)");
  _grad.addColorStop(1.0, "rgba(0, 0, 0, 0)");
  _gctx.fillStyle = _grad;
  _gctx.fillRect(0, 0, 256, 256);
  const sharedGlowTex = new T.CanvasTexture(_glowCanvas);
  const sharedGlowMat = new T.SpriteMaterial({
    map: sharedGlowTex,
    color: tint,
    transparent: true,
    opacity: 0.85,
    blending: T.AdditiveBlending,
    depthWrite: false,
    // Sprite sits inside the tower's bounding box (y=1.2). Without
    // depthTest:false, the tower's front face writes depth and the
    // sprite gets culled from most camera angles — only visible
    // briefly mid-pan when the camera crosses a face-grazing angle
    // (user 2026-05-02 "the glow doesn't appear until the first
    // sideways pan is about halfway done and then it disappears").
    // Flipping depthTest off makes the halo always render; price
    // is the halo may bleed through towers in front of it, which
    // reads as ambient atmosphere rather than a bug.
    depthTest: false,
  });
  // (Pad mesh removed 2026-05-03: gen_floor.py section 6 already
  // bakes a bright cyan tower-footprint into the floor texture, so
  // a runtime pad mesh on top was redundant. Its depthTest:false +
  // renderOrder=999 also caused it to paint OVER cells in towers
  // behind it when the camera looked through one tower's wall to
  // another's interior. With the runtime pad gone, the floor's
  // baked cyan square supplies the bright base and depth-tests
  // correctly against everything in the scene.)
  // Uplight cone: base matches the tower footprint exactly
  // (user 2026-05-02 "the glow cone base needs to be the same size
  // as the tower base"), widens upward to ~2× tower-width at the
  // top, and uses a vertical-gradient texture so the cone reads
  // as a SOFT glow rather than a hard mesh shape.
  // Cone glow: radial-gradient sprite billboard, replaces the prior
  // 4-sided CylinderGeometry which had visible hard silhouette edges
  // (cells crossing the cone's geometric edge popped from obscured
  // to sharp instantly). A sprite always faces camera, so its alpha
  // falloff is uniformly soft from any angle. Also fewer triangles
  // (2 per cone vs 8) and one fewer per-cone material to allocate.
  const _coneCanvas = document.createElement("canvas");
  _coneCanvas.width = 256;
  _coneCanvas.height = 256;
  const _coneCtx = _coneCanvas.getContext("2d");
  // 2D radial: bright at vertical-axis center column, full alpha
  // falloff at sprite edges. Vertical axis kept brighter at the
  // bottom (slightly elliptical falloff) so the glow reads as
  // rising from the tower base, matching the prior cone's intent.
  const _coneGrad = _coneCtx.createRadialGradient(128, 192, 0, 128, 192, 160);
  // #123: bump inner alphas from .18/.08/.02 to brighten the uplight halo
  // without hardening the silhouette — additive blending + soft falloff
  // mean a +50% center stop reads as glow intensification, not a disc.
  _coneGrad.addColorStop(0.0, "rgba(255, 255, 255, 0.27)");
  _coneGrad.addColorStop(0.35, "rgba(255, 255, 255, 0.13)");
  _coneGrad.addColorStop(0.7, "rgba(255, 255, 255, 0.03)");
  _coneGrad.addColorStop(1.0, "rgba(255, 255, 255, 0.0)");
  _coneCtx.fillStyle = _coneGrad;
  _coneCtx.fillRect(0, 0, 256, 256);
  const sharedConeTex = new T.CanvasTexture(_coneCanvas);
  const sharedConeMat = new T.SpriteMaterial({
    map: sharedConeTex,
    color: tint,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  // ONE shared MeshPhongMaterial across all towers — saves per-tower
  // material allocation and lets danger-mode lerp affect the whole
  // wall in one operation. Trade-off: no per-tower color animation
  // (e.g. a single tower flashing); we don't need that today.
  const sharedTowerMat = new T.MeshPhongMaterial({
    color: tint,
    transparent: true,
    // 0.025 (was 0.04) — even more translucent, so back towers
    // visibly read THROUGH front towers. User 2026-05-02 ref
    // tower_glass_closeup.png shows multiple tower silhouettes
    // overlapping through translucency.
    opacity: 0.025,
    emissive: tint,
    emissiveIntensity: 0.03,
    side: T.DoubleSide,
    shininess: 90,
  });
  // Edge-tube material: opaque MeshBasicMaterial (no lighting, no fog
  // attenuation, no per-pixel sort cost) shifted strongly toward white
  // so the cyan reads as luminous against the dim translucent towers.
  // toneMapped:false keeps the color saturated even with the renderer's
  // ACES tone curve enabled.
  const _edgeColor = new T.Color(tint).lerp(new T.Color(0xffffff), 0.55);
  const sharedEdgeMat = new T.MeshBasicMaterial({
    color: _edgeColor,
    toneMapped: false,
  });
  // Top-rim matches the body edge color. The 2026-05-19 veto rejected
  // brighter rims (read as white); the 2026-05-21 reversal of #122
  // rejected violet rims too — a tower is monochromatic-cyan-or-purple
  // overall, not a chromatic mix. Top-rim + body edges share one color.
  const _topRimColor = _edgeColor;
  const sharedTopRimMat = new T.MeshBasicMaterial({
    color: _topRimColor,
    toneMapped: false,
  });
  // Each face spec carries dx/dz (face center offset from tower
  // center), rotY (cell yaw), and hx/hz (in-plane horizontal axis
  // direction, used for column-offset positioning).
  // NORMAL-OUTWARD-CORRECTED 2026-05-19. The E and W rotY values were
  // previously swapped: E used -π/2 (which rotates +Z normal to -X,
  // pointing INTO the tower) and W used +π/2 (rotates to +X, also
  // INTO the tower). Probe via chrome MCP confirmed: tower 0's E and
  // W decorative planes had normals -X and +X respectively, opposite
  // to their outward direction. Effect: FrontSide culled E and W
  // faces from any outside camera, and DoubleSide showed the BACK of
  // those planes (texture mirrored). Real cells too — they've been
  // appearing left-right-flipped on E/W faces; users haven't noticed
  // because chart content is mostly symmetric. Corrected values:
  // E: rotY = +π/2 (+Z → +X, outward), W: rotY = -π/2 (+Z → -X).
  const NESW = [
    { dx: 0, dz: +towerD / 2 + 0.02, rotY: 0, hx: 1, hz: 0 },     // +Z (north)
    { dx: +towerW / 2 + 0.02, dz: 0, rotY: +Math.PI / 2, hx: 0, hz: 1 }, // +X (east)
    { dx: 0, dz: -towerD / 2 - 0.02, rotY: Math.PI, hx: -1, hz: 0 }, // -Z (south)
    { dx: -towerW / 2 - 0.02, dz: 0, rotY: -Math.PI / 2, hx: 0, hz: -1 }, // -X (west)
  ];
  const gridHalf = (towerCount - 1) / 2;
  // Per-axis edge instance count: 4 edges/tower × N towers. X and Z
  // axes split top vs body so the top rim can use a brighter material.
  const totalTowers = towerCount * towerCount;
  const xTopInst = new T.InstancedMesh(xEdgeGeo, sharedTopRimMat, totalTowers * 2);
  const xBodyInst = new T.InstancedMesh(xEdgeGeo, sharedEdgeMat, totalTowers * 2);
  const zTopInst = new T.InstancedMesh(zEdgeGeo, sharedTopRimMat, totalTowers * 2);
  const zBodyInst = new T.InstancedMesh(zEdgeGeo, sharedEdgeMat, totalTowers * 2);
  const yEdgeInst = new T.InstancedMesh(yEdgeGeo, sharedEdgeMat, totalTowers * 4);
  const _edgeMat4 = new T.Matrix4();
  let _xt = 0, _xb = 0, _zt = 0, _zb = 0, _yi = 0;
  const _hW = towerW / 2, _hH = towerH / 2, _hD = towerD / 2;
  for (let iz = 0; iz < towerCount; iz++) {
    for (let ix = 0; ix < towerCount; ix++) {
      const mesh = new T.Mesh(sharedBox, sharedTowerMat);
      mesh.position.x = (ix - gridHalf) * spacing;
      mesh.position.y = towerH / 2;
      mesh.position.z = (iz - gridHalf) * spacing;
      scene.add(mesh);
      const cx = mesh.position.x, cy = mesh.position.y, cz = mesh.position.z;
      // X-aligned edges: 4 per tower at (cx, cy±hH, cz±hD). Top two
      // (oy=+hH) go to the bright top-rim instance bucket; bottom two
      // go to the regular body bucket.
      _edgeMat4.makeTranslation(cx, cy + _hH, cz + _hD); xTopInst.setMatrixAt(_xt++, _edgeMat4);
      _edgeMat4.makeTranslation(cx, cy + _hH, cz - _hD); xTopInst.setMatrixAt(_xt++, _edgeMat4);
      _edgeMat4.makeTranslation(cx, cy - _hH, cz + _hD); xBodyInst.setMatrixAt(_xb++, _edgeMat4);
      _edgeMat4.makeTranslation(cx, cy - _hH, cz - _hD); xBodyInst.setMatrixAt(_xb++, _edgeMat4);
      // Z-aligned edges: 4 per tower at (cx±hW, cy±hH, cz). Same
      // top vs body split.
      _edgeMat4.makeTranslation(cx + _hW, cy + _hH, cz); zTopInst.setMatrixAt(_zt++, _edgeMat4);
      _edgeMat4.makeTranslation(cx - _hW, cy + _hH, cz); zTopInst.setMatrixAt(_zt++, _edgeMat4);
      _edgeMat4.makeTranslation(cx + _hW, cy - _hH, cz); zBodyInst.setMatrixAt(_zb++, _edgeMat4);
      _edgeMat4.makeTranslation(cx - _hW, cy - _hH, cz); zBodyInst.setMatrixAt(_zb++, _edgeMat4);
      // Y-aligned vertical edges: 4 per tower at (cx±hW, cy, cz±hD).
      _edgeMat4.makeTranslation(cx + _hW, cy, cz + _hD); yEdgeInst.setMatrixAt(_yi++, _edgeMat4);
      _edgeMat4.makeTranslation(cx + _hW, cy, cz - _hD); yEdgeInst.setMatrixAt(_yi++, _edgeMat4);
      _edgeMat4.makeTranslation(cx - _hW, cy, cz + _hD); yEdgeInst.setMatrixAt(_yi++, _edgeMat4);
      _edgeMat4.makeTranslation(cx - _hW, cy, cz - _hD); yEdgeInst.setMatrixAt(_yi++, _edgeMat4);
      // (Sprite halo dropped 2026-05-02: billboarded radial gradient
      // always reads as a "ball at the base," not as light shining
      // up. The square pyramid cone below carries the uplight.)
      // (Bright pad mesh removed 2026-05-03: gen_floor.py already
      // bakes the bright cyan tower footprint into the floor; the
      // runtime overlay drew over cells behind. Floor texture +
      // depth-correct cells = no over-draw.)
      // Uplight cone — base matches tower footprint, widens upward,
      // gradient texture for soft glow. Position center at y=height/2
      // so the base sits at floor (y=0). Rotate 45° around Y so the
      // four flat faces of the squared cross-section align with the
      // tower faces.
      const cone = new T.Sprite(sharedConeMat);
      // Sprite scale = world-space size of the billboard quad. Width
      // ~2× tower (matches old cone's top), height ~tower-height so
      // the halo extends roughly from base to top.
      cone.scale.set(towerW * 2.4, towerH * 1.2, 1);
      cone.position.set(
        mesh.position.x,
        towerH * 0.45, // slightly below tower-mid so falloff favours the base
        mesh.position.z,
      );
      scene.add(cone);
      const seed = (ix * 31 + iz * 17) % 4;
      const faces = [];
      for (let k = 0; k < 4; k++) faces.push(NESW[(k + seed) % 4]);
      towerMeshes.push({ mesh, ix, iz, index: iz * towerCount + ix, faces });
    }
  }
  // Commit edge-instance matrices and add the 5 InstancedMesh batches
  // to the scene (3 axes × top/body split = 5 draw calls).
  xTopInst.instanceMatrix.needsUpdate = true;
  xBodyInst.instanceMatrix.needsUpdate = true;
  zTopInst.instanceMatrix.needsUpdate = true;
  zBodyInst.instanceMatrix.needsUpdate = true;
  yEdgeInst.instanceMatrix.needsUpdate = true;
  scene.add(xTopInst);
  scene.add(xBodyInst);
  scene.add(zTopInst);
  scene.add(zBodyInst);
  scene.add(yEdgeInst);

  // Floor: large enough to fully underlie the grid even at the
  // furthest weave point. Field is towerCount × spacing on each side,
  // floor 1.5× that to give breathing room.
  const fieldSize = towerCount * spacing;
  const floorSize = fieldSize * 1.5;
  // Floor: baked PCB texture (assets/floor_baked.png, regenerated via
  // tools/gen_floor.py). Replaces ~480 lines of runtime A* + role
  // graph + lane bus + per-mesh stub codegen — one 4096² texture vs.
  // hundreds of transparent meshes, plus iterable offline (tweak
  // python args, view PNG, no browser needed).
  const floorTex = new T.TextureLoader().load("assets/floor_baked.png");
  floorTex.colorSpace = T.SRGBColorSpace;
  floorTex.anisotropy = 8;
  floorTex.minFilter = T.LinearMipmapLinearFilter;
  floorTex.magFilter = T.LinearFilter;
  // Opaque floor — was transparent: true / opacity 0.95 which forced
  // it through Three.js's transparent render pass. With many other
  // transparent meshes (tower glass, cones, beams, cells, additive
  // pads), the per-frame sort would intermittently hide the floor for
  // several seconds at a time (the "blink" of 2026-05-03). Opaque
  // draws in the opaque pass first, depth-tested, no sort needed.
  const floorMat = new T.MeshBasicMaterial({
    map: floorTex,
  });
  const floor = new T.Mesh(new T.PlaneGeometry(floorSize, floorSize), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.08;
  floor.frustumCulled = false;
  scene.add(floor);
  _bootMark("towers/edges/cones/floor built", "POURING FLOOR");
  // (Floor PCB codegen — A* router, role graph, lane buses,
  // chip-pad stubs — REMOVED 2026-05-03 in favor of static-baked
  // texture loaded above. Source: tools/gen_floor.py. Iterate by
  // re-running that script and refreshing the page.)

  // (Lane-light beams removed 2026-05-03: the bright additive cyan
  // corridor strips overpowered the new purple PCB floor traces and
  // pulled the whole canyon palette toward cyan-dominant. With the
  // baked floor providing visible corridor work on its own, the
  // runtime additive overlay was visual noise rather than signal.)

  // Particle dust drifting through the field volume.
  let particleSystem = null;
  if (O.world.particles) {
    const N = 400;
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      positions[i * 3] = (Math.random() - 0.5) * fieldSize;
      positions[i * 3 + 1] = Math.random() * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * fieldSize;
    }
    const pgeo = new T.BufferGeometry();
    pgeo.setAttribute("position", new T.BufferAttribute(positions, 3));
    const pmat = new T.PointsMaterial({
      color: new T.Color(O.world.tower_tint),
      size: 0.05,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
      depthWrite: false,
    });
    particleSystem = new T.Points(pgeo, pmat);
    scene.add(particleSystem);
  }

  // Fast light pulses — bright tiny dots zooming along the floor
  // circuit and through the air between towers, like Hackers/Gibson
  // flying cars in the city. Additive blending so they glow. Two
  // independent layers:
  //   ground pulses: y ≈ 0.05 (just above floor), constant axis-aligned
  //                  velocity, ~6 u/s. Mimic data zipping along PCB
  //                  traces.
  //   air pulses:    y ∈ [2, towerH-1], 3D random direction, ~9 u/s.
  //                  Read as flying cars / inter-tower traffic.
  // Respawn at field edges so the count stays constant. No per-pulse
  // pathfinding — just straight lines. Cheap.
  let pulseGround = null, pulseAir = null;
  {
    const halfField = fieldSize * 0.5;
    const N_GROUND = 80;
    const N_AIR = 60;
    // Build corridor-line positions for city-block routing. Towers
    // sit at (i - gridHalf) * spacing (i = 0..towerCount-1). Corridors
    // run between adjacent tower rows, so corridor X-positions are
    // (i + 0.5 - gridHalf) * spacing for i = 0..towerCount-2.
    const corridorLines = [];
    for (let i = 0; i < towerCount - 1; i++) {
      corridorLines.push((i + 0.5 - gridHalf) * spacing);
    }
    const pickCorridor = () => corridorLines[Math.floor(Math.random() * corridorLines.length)];
    const groundPos = new Float32Array(N_GROUND * 3);
    const groundVel = new Float32Array(N_GROUND * 3);
    for (let i = 0; i < N_GROUND; i++) {
      // Spawn on a random corridor line. Direction is along the OTHER
      // axis so the pulse travels down a street, not across towers.
      const onX = Math.random() < 0.5;
      const speed = 10 + Math.random() * 8;
      const dir = Math.random() < 0.5 ? 1 : -1;
      groundPos[i * 3] = onX ? (Math.random() - 0.5) * fieldSize : pickCorridor();
      groundPos[i * 3 + 1] = 0.04 + Math.random() * 0.06;
      groundPos[i * 3 + 2] = onX ? pickCorridor() : (Math.random() - 0.5) * fieldSize;
      groundVel[i * 3] = onX ? dir * speed : 0;
      groundVel[i * 3 + 1] = 0;
      groundVel[i * 3 + 2] = onX ? 0 : dir * speed;
    }
    const groundGeo = new T.BufferGeometry();
    groundGeo.setAttribute("position", new T.BufferAttribute(groundPos, 3));
    const groundMat = new T.PointsMaterial({
      // User 2026-05-25: "bright fast pulses should all be the tower
      // color, so cyan currently ... not purple on the floor".
      // Was #b48aff lavender. #80f0ff is bright cyan that survives
      // additive bloom and reads as the same family as the tower glass.
      color: new T.Color("#80f0ff"),
      size: 0.32,
      transparent: true,
      opacity: 1.0,
      sizeAttenuation: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    pulseGround = new T.Points(groundGeo, groundMat);
    pulseGround.userData = { velocities: groundVel, halfField };
    scene.add(pulseGround);

    const airPos = new Float32Array(N_AIR * 3);
    const airVel = new Float32Array(N_AIR * 3);
    for (let i = 0; i < N_AIR; i++) {
      // City-block routing: spawn on a corridor line, travel along
      // the OTHER axis. Same idea as ground pulses but at altitude
      // 2–16u. Y stays constant per pulse (no vertical drift) so
      // each flying car stays in its altitude lane.
      const onX = Math.random() < 0.5;
      const speed = 14 + Math.random() * 8;
      const dir = Math.random() < 0.5 ? 1 : -1;
      airPos[i * 3] = onX ? (Math.random() - 0.5) * fieldSize : pickCorridor();
      airPos[i * 3 + 1] = 2 + Math.random() * 14;
      airPos[i * 3 + 2] = onX ? pickCorridor() : (Math.random() - 0.5) * fieldSize;
      airVel[i * 3] = onX ? dir * speed : 0;
      airVel[i * 3 + 1] = 0;
      airVel[i * 3 + 2] = onX ? 0 : dir * speed;
    }
    const airGeo = new T.BufferGeometry();
    airGeo.setAttribute("position", new T.BufferAttribute(airPos, 3));
    const airMat = new T.PointsMaterial({
      // Cyan air pulses (was white). White under additive bloom read
      // as theme-neutral; #80f0ff stays in the tower-color family.
      color: new T.Color("#80f0ff"),
      size: 0.28,
      transparent: true,
      opacity: 1.0,
      sizeAttenuation: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    pulseAir = new T.Points(airGeo, airMat);
    pulseAir.userData = { velocities: airVel, halfField };
    scene.add(pulseAir);
  }

  // Inter-tower data streaks — DISABLED 2026-05-24 (user: "I only want
  // the short pulses"). Kept the block-scope so streaks[] stays an
  // empty array consumed by the animation loop without code changes
  // elsewhere. Flip N_STREAKS back to 5 to restore.
  const streaks = [];
  {
    const N_STREAKS = 0;
    const STREAK_LEN = 4.5;
    const half = fieldSize * 0.5;
    const corridorLines = [];
    for (let i = 0; i < towerCount - 1; i++) {
      corridorLines.push((i + 0.5 - gridHalf) * spacing);
    }
    const pickCorridor = () =>
      corridorLines[Math.floor(Math.random() * corridorLines.length)];
    for (let i = 0; i < N_STREAKS; i++) {
      const geo = new T.BoxGeometry(STREAK_LEN, 0.06, 0.06);
      const mat = new T.MeshBasicMaterial({
        color: new T.Color(0xb8f7ff),
        transparent: true,
        opacity: 0.75,
        blending: T.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new T.Mesh(geo, mat);
      const onX = Math.random() < 0.5;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const y = 5 + Math.random() * 8;
      const corridor = pickCorridor();
      if (onX) {
        mesh.position.set(dir * -half, y, corridor);
        mesh.rotation.set(0, 0, 0);
      } else {
        mesh.position.set(corridor, y, dir * -half);
        mesh.rotation.set(0, Math.PI / 2, 0);
      }
      scene.add(mesh);
      streaks.push({
        mesh,
        vx: onX ? dir * 2.5 : 0,
        vz: onX ? 0 : dir * 2.5,
        halfField: half,
        pickCorridor,
      });
    }
  }

  document.body.classList.add("layout-mixed3d");

  _mixed3dState = {
    opts: O,
    wrap,
    webglMount,
    cssMount,
    renderer,
    css3dRenderer,
    camera,
    scene,
    cssScene,
    cssSceneFar,
    towerMeshes,
    particleSystem,
    pulseGround,
    pulseAir,
    streaks,
    cellObjects: new Map(), // cell-id → CSS3DObject
    cellTier: new Map(), // cell-id → 1 (close) or 2 (far)
    cellSlotKeys: new Map(), // cell-id → "tower:face:col:i" key
    usedSlots: new Set(), // "tower:4:0:0" reserved for tower-top
    // Column-packing plan per face-column. Each entry is a list of
    // { y, h } pre-computed positions for that column with cells
    // packed tightly with hairline padding, end-flush with top and
    // bottom of the tower. Cells per column vary (5-7) and per-cell
    // heights vary so columns read like terminal scrollback rather
    // than a uniform grid.
    columnPlans: new Map(), // "tower:face:col" → { positions, nextIdx }
    // Per-tower count so we can spread cells across the field
    // before stacking — without this, the camera-aware picker fills
    // one tower's 29 slots completely before reaching the next
    // (~76 cells = ~3 fully-filled towers, user 2026-05-02
    // "only like 4 towers have cells").
    towerCellCount: new Array(towerCount * towerCount).fill(0),
    beams: [], // active danger-mode LineSegments awaiting expiry
    nextBeamAt: 0,
    sharedTowerMat,
    sharedEdgeMat,
    geometry: {
      towerCount,
      towerW,
      towerH,
      towerD,
      spacing,
      // 6 columns × 6 rows per side face. 6-column count is a rule
      // 6 narrow columns per face × 4 faces = 24 columns/tower.
      // Each column is a TERMINAL SCROLLBACK STREAM that packs cells
      // of varying heights until it fills the full tower height
      // (user 2026-05-03 "wall-height scrollback buffer ... variation
      // in the heights of the cells ... each column of cells
      // completely fills the height of the tower"). Not a grid.
      // slotsPerFaceY is the *target* number of cells per column at
      // average height; actual count varies because cells get random
      // heights between baseH × 0.55 and baseH × 1.6.
      // slotW = 5/6 ≈ 0.833, columns touch (slotMarginX = 0).
      // slotH = 17/6 ≈ 2.833 is the BASE per-cell height; the picker
      // randomly varies each cell.
      slotsPerFaceX: 6,
      slotsPerFaceY: 5,
      // slotW is the pitch between slot centers (positioning step).
      // cellW is the rendered cell width (smaller than slotW so cells
      // don't touch each other and don't kiss the cyan edge tubes).
      // Edge buffer per face side: (towerW - 5*slotW - cellW)/2 = 0.24u.
      // Inter-column gap: slotW - cellW = 0.16u.
      slotW: 0.78,
      cellW: 0.62,
      slotH: 2.833,
      slotMarginX: 0,
      slotMargin: 0,
      slotBaseY: 0,
      pixelsPerUnit: 400,
    },
    animation: { t0: performance.now(), running: true, danger: false },
  };

  // LOD scaffolding: cache theme colors once + build shared per-
  // substrate materials for tier-2 cells. Per-cell unique textures
  // hit a wall around 11000-12000 cells (GPU texture memory cap +
  // browser eviction). Sharing materials per substrate × N variants
  // collapses 14000+ textures down to ~156 (13 substrates × 12 var).
  // Cells of the same substrate look similar from far; column-pack
  // height variation supplies the visual diversity.
  {
    const _styles = getComputedStyle(document.body);
    const _cyan = (_styles.getPropertyValue("--accent-primary") || "#00ddff").trim();
    const _pink = (_styles.getPropertyValue("--accent-secondary") || "#ff3a8c").trim();
    _mixed3dState.colorCache = { cyan: _cyan, pink: _pink };
    // Lazy/chunked build: start with empty Map (each substrate maps to
    // an array that progressively fills via _mixed3dDrainMatBuilder).
    // Cells of a substrate that doesn't have ANY variants ready yet
    // fall through to the per-cell mini-texture path; this is bounded
    // because the chunked build finishes in <1s wall-time and drain
    // mounts at most ~3-6 cells/frame before the first variants land.
    _mixed3dState.sharedSubstrateMats = new Map();
    _mixed3dState.matBuilderQueue = [];
    // Per-cs variant count. cs=1 keeps full variety (12); wide cs gets
    // fewer because per-instance tint (_mixed3dCellTintSeed) provides
    // visual variation across instances. Memory: 13 substrates ×
    // (12×1 + 2×5) = 286 mats. cs=1 ~442KB ea = 69MB. cs=2-6 average
    // ~885KB ea = ~115MB. Total ~184MB shared (vs prior 300MB+ of
    // per-cell unique canvases for wide cells).
    const csVariants = { 1: 12, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 };
    for (const sub of _MIXED3D_SUBSTRATES) {
      for (const csKey of Object.keys(csVariants)) {
        const cs = parseInt(csKey, 10);
        _mixed3dState.sharedSubstrateMats.set(`${sub}:${cs}`, []);
        for (let v = 0; v < csVariants[csKey]; v++) {
          _mixed3dState.matBuilderQueue.push({ sub, v, cs });
        }
      }
    }
    // Sort by variant index so first tick covers v=0 across all
    // substrates × cs, giving every (substrate, cs) bucket at least
    // one variant available immediately.
    _mixed3dState.matBuilderQueue.sort((a, b) => a.v - b.v);
    requestAnimationFrame(() => _mixed3dDrainMatBuilder(_cyan, _pink));
  }
  // Tier-2 InstancedMesh state. One InstancedMesh per (substrate ×
  // variantIdx) bucket; each cell becomes one instance, baking its
  // (W, H) into the per-instance scale matrix. unitPlaneGeo is a
  // single shared 1×1 quad reused across all 156 buckets.
  _mixed3dState.unitPlaneGeo = new (window.THREE).PlaneGeometry(1, 1);
  _mixed3dState.tier2InstancedMeshes = new Map();
  _mixed3dState.tier1Count = 0;
  _mixed3dState._retierKeys = null;
  _mixed3dState._retierIdx = 0;

  _bootMark("state ready, before first syncCells", "WIRING CELLS");
  _mixed3dSyncCells();
  _bootMark("syncCells returned (cells queued)", "DRAWING SURFACES");
  _mixed3dBuildDecorativeLayer();
  _bootMark("decorative layer built", "FIRING UP");

  const onResize = () => {
    const w2 = window.innerWidth;
    const h2 = window.innerHeight;
    camera.aspect = w2 / h2;
    camera.updateProjectionMatrix();
    renderer.setSize(w2, h2);
    css3dRenderer.setSize(w2, h2);
  };
  window.addEventListener("resize", onResize);
  _mixed3dState.onResize = onResize;

  // D toggles danger mode. Skip when typing into anything (input/textarea
  // /contenteditable) so it doesn't fight cell editors. Also expose a
  // window hook so future HUD chips or auto-triggers can reach it.
  const onKey = (ev) => {
    // Danger toggle moved D → X to free D for free-flight WASD strafe.
    // User 2026-05-22.
    if (ev.key !== "x" && ev.key !== "X") return;
    const tgt = ev.target;
    const tagName = tgt && tgt.tagName ? tgt.tagName.toUpperCase() : "";
    if (tagName === "INPUT" || tagName === "TEXTAREA" || (tgt && tgt.isContentEditable)) return;
    _mixed3dToggleDanger();
  };
  window.addEventListener("keydown", onKey);
  _mixed3dState.onKey = onKey;
  window.lucidaToggleDanger = _mixed3dToggleDanger;
  // Debug hook — useful for poking the world from devtools/MCP.
  window._mixed3dState = _mixed3dState;

  // Frame-time gate: only screams when something's actually wrong.
  // 50ms is "missed 2+ frames at 60Hz" — visible as a flash/stutter.
  let _lastFrameTs = 0;
  // Visibility/opacity change detector — captures the binary "towers
  // vanish then reappear" symptom without requiring manual F8 pause.
  // Samples every ~10 frames; logs only on change.
  let _diagLast = null;
  let _diagFrameI = 0;
  const _diagSnapshot = () => {
    const t0 = _mixed3dState.towerMeshes[0];
    if (!t0) return null;
    const c = _mixed3dState.camera;
    return {
      childN: scene.children.length,
      towerVis: t0.mesh.visible,
      towerOp: t0.mesh.material.opacity.toFixed(3),
      towerCol: t0.mesh.material.color.getHexString(),
      floorVis: floor.visible,
      floorOp: floor.material.opacity.toFixed(3),
      // Round camera position to whole units; we only want to see big
      // jumps, not the per-frame motion.
      camY: c.position.y.toFixed(0),
      // Up vector: should normally be ~(0, 1, 0). Round to one decimal
      // — banking makes this drift slightly each frame, but only large
      // tilts (>~6°) will register at this precision.
      upX: c.up.x.toFixed(1),
      upY: c.up.y.toFixed(1),
      upZ: c.up.z.toFixed(1),
    };
  };
  // Diagnostic console output (frame-stalls, state-change deltas)
  // is useful when debugging but reads as noise in a freshly-opened
  // DevTools console (~50 lines in the first 10s of boot). Gate
  // behind ?debug=1 / ?perf=1 so the share-ready default page is
  // quiet. One-shot info logs (boot, mount drain done, snap driver
  // started) stay unconditional — they're informative without
  // being noisy.
  const _mixed3dDebug =
    new URLSearchParams(window.location.search).get("debug") === "1" ||
    new URLSearchParams(window.location.search).get("perf") === "1";
  const tick = () => {
    if (!_mixed3dState || !_mixed3dState.animation.running) return;
    requestAnimationFrame(tick);
    const now = performance.now();
    if (_lastFrameTs > 0) {
      const dt = now - _lastFrameTs;
      if (dt > 50 && _mixed3dDebug) {
        // log (not warn) so devtools doesn't append a stack trace per stall.
        LOG.debug(`[mixed3d] frame stall: ${dt.toFixed(0)}ms gap @ ${now.toFixed(0)}ms`);
      }
      // Long-pause safety net: only fire on genuinely long pauses
      // (tab background unthrottle, OS sleep/wake) — bumped from
      // 1000ms to 5000ms because at saturation the mount drain can
      // produce 1-2s frame stalls and resetting the camera every
      // few seconds reads as the camera "snapping back to start"
      // (user 2026-05-03 "the camera motion resets back to the
      // initial position every 4 seconds which seems bad").
      if (dt > 5000) {
        _mixed3dResetCameraTimer();
      }
      // Stable-frame counter for the boot-overlay fade. dt < 33ms =
      // ~30fps or better → frame is "good"; dt > 50ms resets to 0.
      // Used below to decide when to lift the loading overlay so the
      // user doesn't see ~5s of world-spawn-in jank with the booted
      // class already applied.
      if (dt < 33) {
        _mixed3dState._stableFrames = (_mixed3dState._stableFrames || 0) + 1;
      } else if (dt > 50) {
        _mixed3dState._stableFrames = 0;
      }
    }
    _lastFrameTs = now;
    // Sample state every 10 frames; log on change. Catches the binary
    // tower-vanish symptom in real time. Gated behind ?debug=1 —
    // useful when actively investigating, noisy in the default view.
    if (_mixed3dDebug && (++_diagFrameI) % 10 === 0) {
      const snap = _diagSnapshot();
      if (snap && _diagLast) {
        for (const k of Object.keys(snap)) {
          if (snap[k] !== _diagLast[k]) {
            LOG.debug(`[mixed3d] state-change @ ${now.toFixed(0)}ms: ${k} ${_diagLast[k]} → ${snap[k]}`);
          }
        }
      }
      _diagLast = snap;
    }
    const t = (now - _mixed3dState.animation.t0) / 1000;
    _mixed3dDriveCamera(t);
    if (_mixed3dState.particleSystem) {
      _mixed3dState.particleSystem.rotation.y = t * 0.015;
    }
    // Pulse animation — advance each point by its velocity, wrap at
    // field edges. Single dt per frame (no per-pulse rAF).
    // Camera-cull: any pulse that gets within CULL_R of the camera
    // gets teleported to the opposite side of the field. Prevents
    // bright dots flying right through the viewport up close, which
    // reads as visual noise rather than ambient depth.
    {
      const dt = Math.min(0.1, (now - (_mixed3dState._pulseLastT || now)) / 1000);
      _mixed3dState._pulseLastT = now;
      const camP = _mixed3dState.camera.position;
      const CULL_R_SQ = 4 * 4; // 4u no-fly bubble around camera
      const groundPS = _mixed3dState.pulseGround;
      if (groundPS && dt > 0) {
        const posAttr = groundPS.geometry.attributes.position;
        const pos = posAttr.array;
        const vel = groundPS.userData.velocities;
        const half = groundPS.userData.halfField;
        for (let i = 0; i < pos.length; i += 3) {
          pos[i] += vel[i] * dt;
          pos[i + 2] += vel[i + 2] * dt;
          if (pos[i] > half) pos[i] = -half;
          else if (pos[i] < -half) pos[i] = half;
          if (pos[i + 2] > half) pos[i + 2] = -half;
          else if (pos[i + 2] < -half) pos[i + 2] = half;
          const dx = pos[i] - camP.x, dz = pos[i + 2] - camP.z;
          if (dx * dx + dz * dz < CULL_R_SQ) {
            // Teleport to opposite side of camera, preserving direction.
            pos[i] = camP.x - dx * (half / Math.max(1, Math.abs(dx)));
            pos[i + 2] = camP.z - dz * (half / Math.max(1, Math.abs(dz)));
            // Clamp to field bounds
            pos[i] = Math.max(-half, Math.min(half, pos[i]));
            pos[i + 2] = Math.max(-half, Math.min(half, pos[i + 2]));
          }
        }
        posAttr.needsUpdate = true;
      }
      // Inter-tower streaks: slide along their corridor, wrap at the
      // far edge with a fresh altitude/corridor. Slow (~2.5 u/s) so
      // they read as "data flowing" rather than motion blur.
      const streakArr = _mixed3dState.streaks;
      if (streakArr && dt > 0) {
        for (const s of streakArr) {
          s.mesh.position.x += s.vx * dt;
          s.mesh.position.z += s.vz * dt;
          const half = s.halfField;
          if (
            Math.abs(s.mesh.position.x) > half + 5 ||
            Math.abs(s.mesh.position.z) > half + 5
          ) {
            // Wrap to opposite edge, new corridor + altitude.
            if (s.vx !== 0) {
              s.mesh.position.x = -Math.sign(s.vx) * (half + 4);
              s.mesh.position.z = s.pickCorridor();
            } else {
              s.mesh.position.z = -Math.sign(s.vz) * (half + 4);
              s.mesh.position.x = s.pickCorridor();
            }
            s.mesh.position.y = 5 + Math.random() * 8;
          }
        }
      }
      const airPS = _mixed3dState.pulseAir;
      if (airPS && dt > 0) {
        const posAttr = airPS.geometry.attributes.position;
        const pos = posAttr.array;
        const vel = airPS.userData.velocities;
        const half = airPS.userData.halfField;
        for (let i = 0; i < pos.length; i += 3) {
          pos[i] += vel[i] * dt;
          pos[i + 1] += vel[i + 1] * dt;
          pos[i + 2] += vel[i + 2] * dt;
          if (pos[i] > half) pos[i] = -half;
          else if (pos[i] < -half) pos[i] = half;
          if (pos[i + 1] > 17) pos[i + 1] = 2;
          else if (pos[i + 1] < 2) pos[i + 1] = 17;
          if (pos[i + 2] > half) pos[i + 2] = -half;
          else if (pos[i + 2] < -half) pos[i + 2] = half;
          const dx = pos[i] - camP.x;
          const dy = pos[i + 1] - camP.y;
          const dz = pos[i + 2] - camP.z;
          if (dx * dx + dy * dy + dz * dz < CULL_R_SQ) {
            pos[i] = camP.x - dx * (half / Math.max(1, Math.abs(dx)));
            pos[i + 2] = camP.z - dz * (half / Math.max(1, Math.abs(dz)));
            pos[i] = Math.max(-half, Math.min(half, pos[i]));
            pos[i + 2] = Math.max(-half, Math.min(half, pos[i + 2]));
          }
        }
        posAttr.needsUpdate = true;
      }
    }
    // Frustum + distance cull: cells outside camera view OR farther
    // than 55 units get obj.visible=false → CSS3DRenderer sets their
    // element display:none, skipping the (expensive) DOM matrix3d
    // write. Heavy CSS3DObjects + thousands of cells = 1fps without
    // this; user 2026-05-02 "the framerate is absolutely dead now."
    {
      const T2 = window.THREE;
      const projMat = new T2.Matrix4().multiplyMatrices(
        _mixed3dState.camera.projectionMatrix,
        _mixed3dState.camera.matrixWorldInverse,
      );
      if (!_mixed3dState._frustum) _mixed3dState._frustum = new T2.Frustum();
      _mixed3dState._frustum.setFromProjectionMatrix(projMat);
      const camPos = _mixed3dState.camera.position;
      // Distance cull only (75u). The previous per-cell frustum check
      // via `containsPoint(obj.position)` caused edge-of-viewport
      // flicker as camera rotation crossed the cell center across the
      // frustum boundary frame-to-frame (user 2026-05-02 "some of
      // them are flickering near the edges of the viewport"). Plane
      // meshes are cheap; the GPU clips offscreen geometry for free.
      const maxD2 = 75 * 75;
      for (const obj of _mixed3dState.cellObjects.values()) {
        // Tier-2 instanced cells live inside an InstancedMesh — they
        // have no per-instance visibility flag here. The parent
        // InstancedMesh has frustumCulled:false and always renders;
        // GPU vertex stage clips off-screen instances per-fragment.
        if (obj.isInstanceHandle) continue;
        const dx = obj.position.x - camPos.x;
        const dy = obj.position.y - camPos.y;
        const dz = obj.position.z - camPos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        obj.visible = d2 <= maxD2;
      }
    }
    // (LOD tier reassignment removed 2026-05-02 — cells are now WebGL
    // Plane meshes added directly to the main scene. Three.js auto-
    // updates their transforms each frame at much lower cost than DOM
    // matrix3d writes, so the close/far throttling is no longer needed.)
    // CSS3D-fog + occlusion dim. WebGL fog only fades native meshes,
    // and CSS3D doesn't read the WebGL depth buffer, so cells viewed
    // THROUGH a tower in front render too crisp (user 2026-05-02
    // "the tiles on the back side of the translucent towers need to
    // be dimmed like you're looking through at least two layers of
    // glass"). For each cell, check how many tower bounding boxes
    // the camera-cell line segment intersects (in xz), excluding
    // the cell's own tower. Multiply opacity by 0.55^N.
    //
    // Perf gates:
    //   1. Throttled to every 6th frame (10Hz). Camera moves at
    //      ~1.5u/s so opacity changes are gradual; dimming-step at
    //      100ms is below perceptual threshold.
    //   2. Skips visible=false cells (cull pass set them) — saves
    //      the inner 100-tower slab loop on culled cells, which is
    //      the dominant per-frame cost.
    if ((_mixed3dState._opacityTick = (_mixed3dState._opacityTick || 0) + 1) % 6 === 0) {
      // CSS3D fog density 0.02 (was 0.04): keeps cells legible at the
      // field's outer ring. WebGL fog stays at 0.04 so tower meshes
      // still fade into void as the user wants. The two densities
      // diverged 2026-05-02 because the unified 0.04 made cell text
      // invisible past ~30u (opacity ~0.13) while the user expected
      // outer-tower cells to read.
      const fogDen = 0.02;
      const camPos = _mixed3dState.camera.position;
      const towers = _mixed3dState.towerMeshes;
      const G = _mixed3dState.geometry;
      const boxR = G.towerW * 0.5;
      for (const [cellId, obj] of _mixed3dState.cellObjects) {
        if (!obj.visible) continue;
        // Tier 2 cells share their material with all cells of the
        // same substrate; we can't write per-cell opacity into a
        // shared material without affecting siblings. Distance fade
        // for tier-2 falls back to the scene's WebGL fog (density
        // 0.04, set at FogExp2 init) which is close enough to the
        // 0.02 per-cell density and runs in the shader for free.
        if (obj.userData?.tier === 2) continue;
        const dx = obj.position.x - camPos.x;
        const dy = obj.position.y - camPos.y;
        const dz = obj.position.z - camPos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const fogFactor = Math.exp(-fogDen * fogDen * d2);
        // Cell's own tower idx (parsed from slot key like "12:0:3:2")
        const slotKey = _mixed3dState.cellSlotKeys.get(cellId);
        const ownTower = slotKey ? parseInt(slotKey.split(":")[0], 10) : -1;
        let blockCount = 0;
        const lineDx = obj.position.x - camPos.x;
        const lineDz = obj.position.z - camPos.z;
        for (let i = 0; i < towers.length; i++) {
          if (i === ownTower) continue;
          const tw = towers[i];
          // Slab method (xz only): does segment p0→p1 enter the
          // axis-aligned box [tx±r, tz±r]?
          const tx = tw.mesh.position.x;
          const tz = tw.mesh.position.z;
          let tmin = 0, tmax = 1;
          if (Math.abs(lineDx) < 1e-9) {
            if (camPos.x < tx - boxR || camPos.x > tx + boxR) continue;
          } else {
            const t1 = (tx - boxR - camPos.x) / lineDx;
            const t2 = (tx + boxR - camPos.x) / lineDx;
            const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
            tmin = Math.max(tmin, lo);
            tmax = Math.min(tmax, hi);
            if (tmin > tmax) continue;
          }
          if (Math.abs(lineDz) < 1e-9) {
            if (camPos.z < tz - boxR || camPos.z > tz + boxR) continue;
          } else {
            const t1 = (tz - boxR - camPos.z) / lineDz;
            const t2 = (tz + boxR - camPos.z) / lineDz;
            const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
            tmin = Math.max(tmin, lo);
            tmax = Math.min(tmax, hi);
            if (tmin > tmax) continue;
          }
          blockCount++;
        }
        const occFactor = 0.55 ** blockCount;
        obj.material.opacity = fogFactor * occFactor;
      }
    }
    _mixed3dStepDanger(t);
    _mixed3dStepDecoratives(t);
    // LOD re-tier: walk a slice of cells per frame, swap material if
    // their camera-distance bucket changed. Bounded by RETIER_BUDGET
    // so a burst of promotions can't stall the frame (each promotion
    // paints a unique CanvasTexture, ~2ms each).
    _mixed3dRetierSweep();
    _mixed3dState.renderer.render(_mixed3dState.scene, _mixed3dState.camera);
    // (CSS3DRenderer no longer used — cells are WebGL Plane meshes
    // rendered by S.renderer above. CSS3D infrastructure left in
    // _mixed3dState for now; harmless but pending cleanup.)
    // First-frame boot signal: hide the loading overlay once the
    // first WebGL + CSS3D render has actually painted. Wait one extra
    // frame so the page repaints with the full scene before fading.
    // Hold the loading overlay until the world is actually live:
    //   1. Mount drain finished (no more cells streaming in)
    //   2. ~30 consecutive smooth frames (dt < 33ms) — proves render
    //      is stable, not just a single fluke frame
    // Without this, the user sees the overlay vanish then watches
    // ~5s of jank as cells spawn in and the camera moves at low fps.
    // The legacy 20s timeout in the boot script (index.html:81) still
    // serves as a hard fallback if something keeps frames unstable
    // forever, so we never strand the user behind a stuck loader.
    // On a hidden tab rAF runs at ~1Hz with dt=1000ms, so the dt<33 stable-
    // frame check never accumulates and _stableFrames stays at 0 forever —
    // boot never fires and the snap driver never starts. When hidden, drop
    // the frame-stability gate (it's meaningless without real rendering)
    // and fire as soon as mount drain finishes.
    if (!_mixed3dState._booted
        && !_mixed3dState.mountDraining
        && (document.hidden || (_mixed3dState._stableFrames || 0) >= 30)) {
      _mixed3dState._booted = true;
      // URL toggle: ?notier2=1 suppresses tier-2 cell rendering so user can
      // A/B compare tier-1 + decorative against the full mix.
      if (new URLSearchParams(window.location.search).get("notier2") === "1") {
        if (typeof window.toggleMixed3dTier2 === "function") {
          LOG.debug(window.toggleMixed3dTier2(false));
        }
      }
      // Path warmup (#152c): pre-render every cell the camera will
      // see, so stub→body pop never occurs in view. Camera is held
      // (gated in _mixed3dDriveCamera) until the warmup promise
      // settles. ?nowarmup=1 skips for fast iteration AND also skips
      // the steady-state snapshot driver — without a warmup-bound boot
      // path, no cells ever bind a tier-1 GL texture so snaps would
      // just accumulate (1.8GB in `_snapTexCache` over hours, user
      // 2026-05-23). Fast iteration shouldn't pay the leak tax.
      //
      // Boot dismissal split from camera-release: bootReadyP resolves
      // as soon as the first viewport-quota of camera-distance-sorted
      // cells are warm (~5-10s after warmup start). Camera still holds
      // for the full warmup. This lets users see the scene without
      // waiting for all 1244 cells — the snap driver fills off-camera
      // cells while the user looks around.
      const skipWarmup = new URLSearchParams(window.location.search).get("nowarmup") === "1";
      // Kick off tier-1 rich-substrate snapshot driver (#142). Skip in
      // ?nowarmup=1 mode (see comment above).
      if (!skipWarmup) _mixed3dStartSnapshotDriver();
      const warmupP = skipWarmup
        ? Promise.resolve()
        : _mixed3dRunPathWarmup(_mixed3dState);
      const bootReadyP = skipWarmup
        ? Promise.resolve()
        : (_mixed3dState._warmupBootReadyP || warmupP);
      bootReadyP.finally(() => {
        requestAnimationFrame(() => document.body.classList.add("booted"));
      });
      warmupP.finally(() => {
        // Reset camera timer here — the warmup's own finish() also
        // resets, but if warmup was skipped or hit the 30s cap we
        // still want a clean u=0 start.
        _mixed3dResetCameraTimer();
      });
    }
  };
  tick();
  _bootMark("applyMixed3DLayout complete (rAF loop running)");
}

// ----------------------------------------------------------------
// mixed3d: war-room arrangement — EARTH holo-table v2.
// VOLUMETRIC HOLOGRAM rebuild after v1 was called out as "a bad copy
// of the reference" (User 2026-05-30: "rethink the whole thing based
// on the 3d holograms in the reference videos / it's a lot more
// colored lines and wireframes in 3d with some floating windows").
//
// Scene composition matches refs/unn/00_04_02_un_warroom_seal_table
// _orbital_lines:
//   - Faint disc base at y=0 (the table surface, very subtle)
//   - WIREFRAME PLANETARY SPHERE rising from center, slow rotation
//   - Multiple ORBITAL ARCS at varied inclinations around the globe
//     (Line geometries with bright cyan/red coloring, drawn as 3D
//     curves rather than flat-disc circles)
//   - Traveling MARKERS (friendly cyan / threat red triangles or
//     spheres) sliding along each arc — the "tactical contacts"
//   - Cells distributed in TWO floating tiers at varied heights —
//     "floating windows" not "ring around a coffee table"
// Sibling of applyMixed3DLayout (tower-arrangement): writes into the
// same _mixed3dState slot so teardownMixed3DLayout cleans up uniformly.
// ----------------------------------------------------------------
function applyMixed3DWarRoom(O) {
  const T = window.THREE;
  const root = document.getElementById("notebook");
  if (_mixed3dState) teardownMixed3DLayout();
  // Set state sentinel IMMEDIATELY so re-entry from the poll loop (which
  // fires every ~3 s) is caught by the dispatch guard while the multi-
  // second build runs.  Without this the second poll sees state===null,
  // calls the builder again, and we get duplicated scenes / mode flips.
  // The full state object overwrites this at the end.
  _mixed3dState = { _arrangement: "war-room", _building: true, animation: { running: true } };

  const wrap = el("div");
  wrap.id = "mixed3d-wrap";
  document.body.appendChild(wrap);
  const webglMount = el("div");
  webglMount.id = "mixed3d-webgl";
  const cssMount = el("div");
  cssMount.id = "mixed3d-css";
  wrap.appendChild(webglMount);
  wrap.appendChild(cssMount);

  const w0 = window.innerWidth;
  const h0 = window.innerHeight;

  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w0, h0);
  renderer.setClearColor(0x000000, 0);
  webglMount.appendChild(renderer.domElement);

  const cssRenderer = new T.CSS3DRenderer();
  cssRenderer.setSize(w0, h0);
  cssMount.appendChild(cssRenderer.domElement);

  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x040814, 0.018);
  const cssScene = new T.Scene();

  // Camera: standing-INSIDE-the-hologram framing.  User 2026-05-30:
  // "you can get even closer to the center 3d viz, it's ok if you're
  // close because in the show people are basically standing inside
  // the extended hologram."  At z=13 the camera sits just outside the
  // largest orbital arc (R=9.4) so the arcs sweep around the viewer;
  // y=6 = globe equator so the globe centerpiece dominates the FOV.
  const camera = new T.PerspectiveCamera(48, w0 / h0, 0.1, 200);
  camera.position.set(0, 6, 13);
  camera.lookAt(0, 6, 0);

  // Lights: low ambient + cyan-blue key from above, hemisphere fill.
  // No sun — the disc itself is the brightest thing in the room.
  const tint = new T.Color(O.world.tower_tint || "#2f6fd0");
  scene.add(new T.AmbientLight(0xffffff, 0.36));
  const key = new T.PointLight(tint.getHex(), 1.0, 80);
  key.position.set(0, 22, 0);
  scene.add(key);
  scene.add(new T.HemisphereLight(0x000814, tint.getHex(), 0.4));

  // The holo-table base disc — the projection source for every cell
  // and centerpiece hologram in the room. Bumped from the faint v1
  // (opacity 0.10) to a real emissive surface: brighter main disc +
  // wider additive glow halo extending outward. User 2026-05-31:
  // "glowing table" — table is the holo source, should look like it.
  const discRadius = 16;
  const discGeo = new T.CylinderGeometry(discRadius, discRadius, 0.18, 64);
  const discMat = new T.MeshBasicMaterial({
    color: tint,
    transparent: true,
    opacity: 0.28,
    side: T.DoubleSide,
  });
  const disc = new T.Mesh(discGeo, discMat);
  disc.position.y = 0;
  scene.add(disc);

  // Glow halo: a wider, low-opacity additive disc that bleeds outward
  // from the table edge. Reads as the table's light spilling onto the
  // floor; doubles as the holo-table's "this is the projection source"
  // marker.
  const glowGeo = new T.CylinderGeometry(discRadius * 1.55, discRadius * 1.55, 0.04, 64);
  const glowMat = new T.MeshBasicMaterial({
    color: tint,
    transparent: true,
    opacity: 0.14,
    blending: T.AdditiveBlending,
    depthWrite: false,
    side: T.DoubleSide,
  });
  const glow = new T.Mesh(glowGeo, glowMat);
  glow.position.y = -0.04;
  scene.add(glow);

  // Volumetric haze: BILLBOARDED SPRITE with a vertical-gradient
  // canvas texture, additive-blended. Same approach as the hackers
  // tower glow — a sprite always faces camera, so the alpha falloff
  // is uniformly soft from any angle and the haze never reveals
  // geometric silhouette (the earlier cylinder mesh did at some
  // angles, reading as "fog pillar" not "atmosphere"). User
  // 2026-05-31 "haze doesn't really look right vs hackers tower glow."
  const _hazeCanvas = document.createElement("canvas");
  _hazeCanvas.width = 128;
  _hazeCanvas.height = 256;
  const _hCtx = _hazeCanvas.getContext("2d");
  // Vertical gradient: bright at bottom (rising from table), fading
  // to transparent at top. Horizontal soft edges.
  const _hGrad = _hCtx.createLinearGradient(0, 256, 0, 0);
  _hGrad.addColorStop(0.00, "rgba(255, 255, 255, 0.55)");
  _hGrad.addColorStop(0.20, "rgba(160, 200, 255, 0.32)");
  _hGrad.addColorStop(0.55, "rgba(80, 130, 200, 0.14)");
  _hGrad.addColorStop(1.00, "rgba(0, 0, 0, 0)");
  _hCtx.fillStyle = _hGrad;
  _hCtx.fillRect(0, 0, 128, 256);
  // Soft horizontal falloff — composite a radial gradient on top
  // so the sprite's left/right edges aren't sharp.
  const _hHalo = _hCtx.createRadialGradient(64, 256, 0, 64, 256, 128);
  _hHalo.globalCompositeOperation = "destination-in";
  _hCtx.globalCompositeOperation = "destination-in";
  _hHalo.addColorStop(0.0, "rgba(255, 255, 255, 1)");
  _hHalo.addColorStop(1.0, "rgba(255, 255, 255, 0)");
  _hCtx.fillStyle = _hHalo;
  _hCtx.fillRect(0, 0, 128, 256);
  _hCtx.globalCompositeOperation = "source-over";
  const hazeTex = new T.CanvasTexture(_hazeCanvas);
  const hazeMat = new T.SpriteMaterial({
    map: hazeTex,
    color: tint,
    transparent: true,
    opacity: 0.55,
    blending: T.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const haze = new T.Sprite(hazeMat);
  haze.scale.set(discRadius * 2.1, 14, 1);
  haze.position.set(0, 7, 0);
  haze.userData._isHaze = true;
  scene.add(haze);

  // 3 faint range rings inscribed on the disc — kept minimal so the
  // disc reads as a base, not the centerpiece.
  for (let i = 1; i <= 3; i++) {
    const r = (discRadius / 3) * i - 0.4;
    const ringGeo = new T.TorusGeometry(r, 0.04, 6, 64);
    const ringMat = new T.MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0.32 - i * 0.05,
    });
    const ring = new T.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    scene.add(ring);
  }

  // ── Centerpiece MODE selection ──
  // Per refs/unn the war-room hologram varies across council scenes:
  // sometimes a single planet (00_04_02), sometimes a solar-system
  // model (00_06_04), sometimes purely trajectories or 3D tactical
  // markers without any central body.  User 2026-05-30: "it's not
  // always a planetary sphere, sometimes it's trajectories or 3d
  // locations" + "more variety than just the globe" + "should slowly
  // iterate through the options unless the mode is set via url".
  //
  // All 4 modes build their centerpiece geometry into the scene; the
  // per-mode containers below let setActiveMode() toggle visibility +
  // re-bind the animation-loop's globe/moons/arcs to the active mode.
  // ?scene=<one-of> locks that scene/sub-view permanently; no override =
  // auto-iterate every ~28 s. (Legacy ?warmode= still accepted.)
  // The "scene" generalization is theme-agnostic — future themes that
  // need their own scene cycler can read the same URL param.
  // Disc, UN seal, projection beams, wall readouts, and cell wall are
  // SHARED across scenes.
  const WAR_MODES = ["planet", "solar", "trajectory", "tactical"];
  const _qs = new URLSearchParams(window.location.search);
  const _urlMode = _qs.get("scene") || _qs.get("warmode");
  const _cellCount = root.querySelectorAll(":scope > .cell").length;
  const initialMode = (_urlMode && WAR_MODES.includes(_urlMode))
    ? _urlMode
    : WAR_MODES[Math.floor((_cellCount + 7) / 20) % WAR_MODES.length];
  console.info(`[mixed3d.warroom] initialMode=${initialMode} (override=${_urlMode || "auto-cycle"}, cells=${_cellCount})`);

  // Per-mode containers populated below.  scene.addCenterpiece() helper
  // pushes objects to the right bin AND adds them to the scene so the
  // active-mode visibility flip is just a loop over the right bin.
  const centerpieceObjects = { planet: [], solar: [], trajectory: [], tactical: [] };
  const globeByMode = { planet: null, solar: null, trajectory: null, tactical: null };
  const moonsByMode = { planet: [], solar: [], trajectory: [], tactical: [] };
  const arcsByMode  = { planet: [], solar: [], trajectory: [], tactical: [] };
  const addToMode = (m, obj) => { centerpieceObjects[m].push(obj); scene.add(obj); };
  // Active-mode handles, re-bound by setActiveMode().  Animation reads
  // these directly each frame (null-safe for globe).
  let globe = null;
  let moons = [];
  let arcs = [];

  // ── PLANET mode: single wireframe globe + 2 small orbiting moons ──
  {
    const globeRadius = 4.2;
    const globeGeo = new T.SphereGeometry(globeRadius, 16, 12);
    const globeMat = new T.MeshBasicMaterial({
      color: tint, wireframe: true, transparent: true, opacity: 0.58,
    });
    const planetGlobe = new T.Mesh(globeGeo, globeMat);
    planetGlobe.position.y = 6;
    addToMode("planet", planetGlobe);
    globeByMode.planet = planetGlobe;
    const globeInnerGeo = new T.SphereGeometry(globeRadius * 0.94, 12, 8);
    const globeInnerMat = new T.MeshBasicMaterial({
      color: tint, transparent: true, opacity: 0.06,
    });
    const globeInner = new T.Mesh(globeInnerGeo, globeInnerMat);
    globeInner.position.y = 6;
    addToMode("planet", globeInner);
    const moonGeo = new T.SphereGeometry(0.7, 10, 8);
    const moonMatA = new T.MeshBasicMaterial({ color: 0xaad8e8, wireframe: true, transparent: true, opacity: 0.5 });
    const moonMatB = new T.MeshBasicMaterial({ color: 0x6f9fd0, wireframe: true, transparent: true, opacity: 0.45 });
    const moonA = new T.Mesh(moonGeo, moonMatA);
    const moonB = new T.Mesh(moonGeo, moonMatB);
    addToMode("planet", moonA); addToMode("planet", moonB);
    moonsByMode.planet.push({ mesh: moonA, r: 7.2, phase: 0,   incl: 0.4,  speed: 0.00018 });
    moonsByMode.planet.push({ mesh: moonB, r: 8.8, phase: 1.7, incl: -0.3, speed: 0.00012 });
  }

  // ── SOLAR mode: four smaller bodies orbiting an empty center ──
  {
    const bodyGeo1 = new T.SphereGeometry(1.6, 12, 9);
    const bodyGeo2 = new T.SphereGeometry(1.2, 10, 8);
    const bodyGeo3 = new T.SphereGeometry(0.9, 10, 8);
    const bodyGeo4 = new T.SphereGeometry(1.8, 14, 10);
    const bodySpecs = [
      { geo: bodyGeo1, color: 0x88c8ff, r: 4.2, phase: 0.0, incl:  0.18, speed: 0.00026 },
      { geo: bodyGeo2, color: 0xaad8e8, r: 6.2, phase: 1.4, incl: -0.30, speed: 0.00020 },
      { geo: bodyGeo3, color: 0xc0e0f0, r: 8.0, phase: 2.8, incl:  0.55, speed: 0.00016 },
      { geo: bodyGeo4, color: 0x3a7bb8, r: 9.6, phase: 4.2, incl: -0.10, speed: 0.00013 },
    ];
    for (const spec of bodySpecs) {
      const mat = new T.MeshBasicMaterial({
        color: spec.color, wireframe: true, transparent: true, opacity: 0.55,
      });
      const m = new T.Mesh(spec.geo, mat);
      addToMode("solar", m);
      moonsByMode.solar.push({ mesh: m, r: spec.r, phase: spec.phase, incl: spec.incl, speed: spec.speed });
    }
    const crossPts = new Float32Array([
      -0.6, 6, 0,  0.6, 6, 0,
       0, 6-0.6, 0,  0, 6+0.6, 0,
       0, 6, -0.6,  0, 6, 0.6,
    ]);
    const crossGeo = new T.BufferGeometry();
    crossGeo.setAttribute("position", new T.BufferAttribute(crossPts, 3));
    const crossMat = new T.LineBasicMaterial({ color: tint, transparent: true, opacity: 0.6 });
    addToMode("solar", new T.LineSegments(crossGeo, crossMat));
  }

  // ── Orbital / trajectory arcs ──
  // Mode-conditional geometry.  PLANET + SOLAR + TRAJECTORY all use
  // arcs (closed orbits in planet/solar; open parabolic paths in
  // trajectory).  TACTICAL mode skips arcs entirely.
  // Each arc is a Line; in animated modes a cone marker travels along
  // it, re-oriented to the tangent every frame.
  // Shared cone geometry for every marker (across all modes).
  const sharedMarkerGeo = new T.ConeGeometry(0.18, 0.5, 5);
  const ARC_PRESETS = {
    planet: { kind: "closed", specs: [
      { r: 5.6, color: 0x3a7bb8, tilt: [0.05, 0, 0.10],   speed: 0.00022, threat: false },
      { r: 6.4, color: 0x88c8ff, tilt: [-0.18, 0.4, 0.02],speed: 0.00018, threat: false },
      { r: 7.3, color: 0xd83a2e, tilt: [0.7, 0.0, 0.4],   speed: 0.00028, threat: true  },
      { r: 8.2, color: 0x2f6fd0, tilt: [0.2, 0.9, -0.15], speed: 0.00020, threat: false },
      { r: 9.4, color: 0xff6a4a, tilt: [1.0, 0.3, 0.6],   speed: 0.00024, threat: true  },
    ]},
    solar: { kind: "closed", specs: [
      { r: 4.2, color: 0x88c8ff, tilt: [ 0.18, 0,    0   ], speed: 0, threat: false, noMarker: true },
      { r: 6.2, color: 0xaad8e8, tilt: [-0.30, 0.3,  0   ], speed: 0, threat: false, noMarker: true },
      { r: 8.0, color: 0xc0e0f0, tilt: [ 0.55, 0.7,  0   ], speed: 0, threat: false, noMarker: true },
      { r: 9.6, color: 0x3a7bb8, tilt: [-0.10, 1.2,  0.2 ], speed: 0, threat: false, noMarker: true },
    ]},
    trajectory: { kind: "parabolic", specs: [
      { color: 0x88c8ff, theta: 0.0,        height: 4, span: 22, speed: 0.00026, threat: false },
      { color: 0xaad8e8, theta: Math.PI/3,  height: 6, span: 26, speed: 0.00022, threat: false },
      { color: 0xd83a2e, theta: 2*Math.PI/3,height: 5, span: 18, speed: 0.00030, threat: true  },
      { color: 0x6f9fd0, theta: Math.PI,    height: 7, span: 24, speed: 0.00020, threat: false },
      { color: 0xff6a4a, theta: 4*Math.PI/3,height: 4, span: 20, speed: 0.00028, threat: true  },
      { color: 0x3a7bb8, theta: 5*Math.PI/3,height: 6, span: 22, speed: 0.00018, threat: false },
    ]},
    tactical: null,   // no arcs
  };
  const SEG = 96;
  for (const [modeName, preset] of Object.entries(ARC_PRESETS)) {
    if (!preset) continue;
    for (let i = 0; i < preset.specs.length; i++) {
      const spec = preset.specs[i];
      const pts = new Float32Array((SEG + 1) * 3);
      if (preset.kind === "parabolic") {
        const sin = Math.sin(spec.theta), cos = Math.cos(spec.theta);
        for (let s = 0; s <= SEG; s++) {
          const u = s / SEG;
          const lx = (u - 0.5) * spec.span;
          const ly = spec.height * (1 - (2 * (u - 0.5)) ** 2);
          pts[s * 3 + 0] = cos * lx;
          pts[s * 3 + 1] = ly;
          pts[s * 3 + 2] = sin * lx;
        }
      } else {
        for (let s = 0; s <= SEG; s++) {
          const a = (s / SEG) * Math.PI * 2;
          pts[s * 3 + 0] = Math.cos(a) * spec.r;
          pts[s * 3 + 1] = 0;
          pts[s * 3 + 2] = Math.sin(a) * spec.r;
        }
      }
      // Arcs as tube + additive-halo (LineBasicMaterial.linewidth clamps to 1px
      // in WebGL). Per refs/unn the show's orbital arcs read with visible
      // weight + emission glow off the holo-table; the previous hairline lines
      // were undersold against that reference. Core tube = solid line, halo
      // tube = soft outer glow via additive blending.
      const curveClosed = preset.kind !== "parabolic";
      const ptsVec = new Array(curveClosed ? SEG : SEG + 1);
      for (let s = 0; s < ptsVec.length; s++) {
        ptsVec[s] = new T.Vector3(pts[s * 3], pts[s * 3 + 1], pts[s * 3 + 2]);
      }
      const curve = new T.CatmullRomCurve3(ptsVec, curveClosed);
      const coreGeo = new T.TubeGeometry(curve, SEG, 0.045, 6, curveClosed);
      const haloGeo = new T.TubeGeometry(curve, SEG, 0.130, 6, curveClosed);
      const coreMat = new T.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: spec.threat ? 0.85 : (modeName === "solar" ? 0.42 : 0.72),
        depthWrite: false,
      });
      const haloMat = new T.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: spec.threat ? 0.38 : (modeName === "solar" ? 0.14 : 0.26),
        blending: T.AdditiveBlending,
        depthWrite: false,
      });
      const core = new T.Mesh(coreGeo, coreMat);
      const halo = new T.Mesh(haloGeo, haloMat);
      const arcGroup = new T.Group();
      if (preset.kind === "parabolic") arcGroup.position.y = 4;
      else { arcGroup.rotation.set(spec.tilt[0], spec.tilt[1], spec.tilt[2]); arcGroup.position.y = 6; }
      arcGroup.add(halo);
      arcGroup.add(core);
      let marker = null;
      if (!spec.noMarker) {
        const markerMat = new T.MeshBasicMaterial({
          color: spec.color, transparent: true, opacity: 0.95, depthTest: false,
        });
        marker = new T.Mesh(sharedMarkerGeo, markerMat);
        marker.renderOrder = 5;
        arcGroup.add(marker);
      }
      addToMode(modeName, arcGroup);
      arcsByMode[modeName].push({
        group: arcGroup, core, halo, marker, spec,
        kind: preset.kind,
        phase: (i / preset.specs.length) * Math.PI * 2,
      });
    }
  }

  // ── TACTICAL central anchor (reticle + axis cross) ──
  {
    const reticleGeo = new T.TorusGeometry(1.4, 0.05, 8, 48);
    const reticleMat = new T.MeshBasicMaterial({
      color: tint, transparent: true, opacity: 0.55,
    });
    const reticle = new T.Mesh(reticleGeo, reticleMat);
    reticle.position.y = 6;
    reticle.rotation.x = Math.PI / 2;
    addToMode("tactical", reticle);
    const axisGeo = new T.BufferGeometry();
    axisGeo.setAttribute("position", new T.BufferAttribute(new Float32Array([
      -2.4, 6, 0,  2.4, 6, 0,
       0, 6, -2.4,  0, 6, 2.4,
    ]), 3));
    const axisMat = new T.LineBasicMaterial({
      color: tint, transparent: true, opacity: 0.42,
    });
    addToMode("tactical", new T.LineSegments(axisGeo, axisMat));
  }

  // ── Vertical caustics / projection beams ──
  // Three faint vertical lines anchored at table to globe altitude —
  // reads as "the hologram is projecting upward from the table". Very
  // subtle; not the centerpiece.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const x = Math.cos(a) * 1.8;
    const z = Math.sin(a) * 1.8;
    const beamGeo = new T.BufferGeometry();
    beamGeo.setAttribute("position", new T.BufferAttribute(new Float32Array([
      x, 0.18, z,
      x, 11, z,
    ]), 3));
    const beamMat = new T.LineBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0.18,
    });
    scene.add(new T.Line(beamGeo, beamMat));
  }

  // ── UN globe-laurel seal etched at disc center ──
  // Per refs/unn/00_04_02 the disc surface has the UN seal inlaid as
  // the visual anchor of the holo-table.  CanvasTexture (256x256) →
  // disposed in teardown via scene.traverse picking up material.map.
  // Drawn as concentric circles + radial laurel ticks; abstract
  // enough to read as "UN insignia" without imitating the actual
  // mark.  Disposed with material on teardown.
  const _sealCanvas = document.createElement("canvas");
  _sealCanvas.width = 256;
  _sealCanvas.height = 256;
  const _sCtx = _sealCanvas.getContext("2d");
  _sCtx.clearRect(0, 0, 256, 256);
  _sCtx.strokeStyle = "rgba(58, 123, 184, 0.6)";
  _sCtx.lineWidth = 1.5;
  // Outer + inner laurel frames
  _sCtx.beginPath(); _sCtx.arc(128, 128, 110, 0, Math.PI * 2); _sCtx.stroke();
  _sCtx.beginPath(); _sCtx.arc(128, 128, 100, 0, Math.PI * 2); _sCtx.stroke();
  // Globe meridians + equator
  _sCtx.strokeStyle = "rgba(96, 158, 215, 0.75)";
  _sCtx.lineWidth = 1.2;
  _sCtx.beginPath(); _sCtx.arc(128, 128, 60, 0, Math.PI * 2); _sCtx.stroke();
  _sCtx.beginPath(); _sCtx.ellipse(128, 128, 60, 22, 0, 0, Math.PI * 2); _sCtx.stroke();
  _sCtx.beginPath(); _sCtx.ellipse(128, 128, 22, 60, 0, 0, Math.PI * 2); _sCtx.stroke();
  // Latitude lines (3 horizontal arcs across the inner globe)
  for (const y of [-30, 0, 30]) {
    _sCtx.beginPath();
    _sCtx.ellipse(128, 128 + y, 60 * Math.cos(y / 60 * Math.PI / 2), 6, 0, 0, Math.PI * 2);
    _sCtx.stroke();
  }
  // Laurel ticks — 16 short radial ticks between the two outer frames
  _sCtx.strokeStyle = "rgba(58, 123, 184, 0.55)";
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x1 = 128 + Math.cos(a) * 100;
    const y1 = 128 + Math.sin(a) * 100;
    const x2 = 128 + Math.cos(a) * 110;
    const y2 = 128 + Math.sin(a) * 110;
    _sCtx.beginPath(); _sCtx.moveTo(x1, y1); _sCtx.lineTo(x2, y2); _sCtx.stroke();
  }
  const sealTex = new T.CanvasTexture(_sealCanvas);
  sealTex.anisotropy = 2;
  const sealGeo = new T.PlaneGeometry(7.2, 7.2);
  const sealMat = new T.MeshBasicMaterial({
    map: sealTex,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const seal = new T.Mesh(sealGeo, sealMat);
  seal.rotation.x = -Math.PI / 2;
  seal.position.y = 0.16;
  scene.add(seal);

  // ── Tactical contacts at 3D positions: "+" glyphs (NOT spheres) ──
  // Per refs/unn/00_08_05 the war-room holograms read as plus-shaped
  // markers in 3D space, not solid spheres or cones.  Each glyph is
  // three line segments crossed at origin; shared BufferGeometry
  // across all glyphs so we only allocate one.
  // User 2026-05-30: "it's not always a planetary sphere, sometimes
  // it's trajectories or 3d locations" + "we have an absolute ton of
  // reference footage" + "council tactical meetings are probably the
  // richest" — drawing on refs/unn/00_06_04 (solar-system + trajectory
  // arc) and 00_08_05 (plus-glyphs + trajectory lines).
  // Plus-glyph count + position generator varies by mode.  Tactical
  // mode gets a denser 3D grid (25 positions); trajectory gets 14
  // waypoints sprinkled along the parabolic field; planet/solar get
  // the canonical 10 markers.
  const _contactBase = [
    // Friendly contacts (light cyan plus-glyphs)
    [ 7.5,  4.5, -3.0, false], [-6.0,  7.5,  4.5, false],
    [ 3.0,  9.0,  6.0, false], [-9.0,  3.0, -5.0, false],
    [ 5.5,  7.0,  7.0, false], [-2.5,  5.0,  8.5, false],
    // Threats (red plus-glyphs)
    [ 9.5,  8.0,  2.0, true],  [-7.5,  5.5, -7.5, true],
    [ 4.0,  3.0, -9.0, true],  [-4.5, 10.0,  3.5, true],
  ];
  function _tacticalGrid() {
    // 5x5 grid stretched across the central volume, varied Y so it
    // reads as a 3D cloud not a flat sheet.  Half flagged threat.
    const out = [];
    for (let i = 0; i < 25; i++) {
      const u = (i % 5) - 2;       // -2..+2
      const v = Math.floor(i / 5) - 2;
      const wob = ((i * 7919) % 17) / 17 * 1.8;  // deterministic jitter
      out.push([u * 3.4, 5 + (i * 421 % 9) * 0.45, v * 3.4 + wob, (i * 13) % 5 === 0]);
    }
    return out;
  }
  function _trajectoryWaypoints() {
    // 14 markers, half placed near parabolic-arc apexes (visual waypoints
    // along the converging paths), half scattered for context.
    return [
      // Apex points roughly above the focal area at y=8-10
      [ 0,   9.5,  0, false], [ 2.0, 8.5,  1.5, false],
      [-2.0, 8.5, -1.5, false], [ 1.5, 9.0, -2.5, true],
      [-1.5, 9.0,  2.5, false], [ 0,   7.5,  3.0, false],
      [ 0,   7.5, -3.0, true],
      // Outer trajectory endpoints (entries/exits to the focal field)
      [ 9.0, 4.5,  0,   false], [-9.0, 4.5,  0,   false],
      [ 0,   4.5,  9.0, true],  [ 0,   4.5, -9.0, true],
      [ 6.5, 4.5,  6.5, false], [-6.5, 4.5, -6.5, false],
      [ 6.5, 4.5, -6.5, true],
    ];
  }
  const _plusG = new Float32Array([
    -0.35, 0, 0,  0.35, 0, 0,
     0, -0.35, 0,  0, 0.35, 0,
     0, 0, -0.35,  0, 0, 0.35,
  ]);
  const sharedPlusGeo = new T.BufferGeometry();
  sharedPlusGeo.setAttribute("position", new T.BufferAttribute(_plusG, 3));
  const _GLYPH_POSITIONS_BY_MODE = {
    planet:     _contactBase,
    solar:      _contactBase,
    trajectory: _trajectoryWaypoints(),
    tactical:   _tacticalGrid(),
  };
  for (const [modeName, positions] of Object.entries(_GLYPH_POSITIONS_BY_MODE)) {
    for (const [x, y, z, isThreat] of positions) {
      const mat = new T.LineBasicMaterial({
        color: isThreat ? 0xff4030 : 0x88c8ff,
        transparent: true,
        opacity: 0.92,
        depthTest: false,
      });
      const glyph = new T.LineSegments(sharedPlusGeo, mat);
      glyph.renderOrder = 6;
      glyph.position.set(x, y, z);
      addToMode(modeName, glyph);
    }
  }

  // ── Wall readout panels at outer distance ──
  // Per NOTES.md: "wall readout screens — left-wall panels, red-tinted
  // + blue, supporting the table".  3 floating planes beyond the cell
  // ring with stylized abstract chart imagery — reads as "operations-
  // center wall displays at distance" without needing real data.  Each
  // CanvasTexture is 128x96; teardown disposes via material.map path.
  function _makeReadoutTex(kind) {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 96;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "rgba(8, 16, 32, 0.92)";
    ctx.fillRect(0, 0, 128, 96);
    // Frame
    ctx.strokeStyle = kind === "threat" ? "rgba(216, 58, 46, 0.7)" : "rgba(58, 123, 184, 0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(2, 2, 124, 92);
    // Header bar
    ctx.fillStyle = kind === "threat" ? "rgba(216, 58, 46, 0.3)" : "rgba(58, 123, 184, 0.3)";
    ctx.fillRect(4, 4, 120, 10);
    // Content: abstract chart imagery
    ctx.strokeStyle = kind === "threat" ? "rgba(255, 120, 100, 0.85)" : "rgba(140, 200, 255, 0.85)";
    ctx.lineWidth = 1.2;
    if (kind === "linegraph") {
      ctx.beginPath(); ctx.moveTo(8, 70);
      for (let x = 8; x <= 120; x += 8) {
        const y = 50 - Math.sin(x * 0.25) * 12 - (x - 8) * 0.18;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else if (kind === "bars") {
      const heights = [22, 38, 18, 50, 30, 44, 28, 36, 18, 42];
      for (let i = 0; i < heights.length; i++) {
        ctx.fillStyle = "rgba(140, 200, 255, 0.75)";
        ctx.fillRect(8 + i * 11, 80 - heights[i], 8, heights[i]);
      }
    } else {  // threat — concentric arcs (range plot)
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(64, 54, i * 10, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255, 90, 70, 0.9)";
      ctx.fillRect(76, 50, 5, 5);
      ctx.fillRect(45, 38, 5, 5);
    }
    const tex = new T.CanvasTexture(c);
    tex.anisotropy = 2;
    return tex;
  }
  const wallPanels = [
    { tex: _makeReadoutTex("linegraph"), pos: [-26, 13, -18], rotY: Math.PI * 0.18 },
    { tex: _makeReadoutTex("bars"),      pos: [ 28, 11, -16], rotY: -Math.PI * 0.22 },
    { tex: _makeReadoutTex("threat"),    pos: [  0, 16,  30], rotY: Math.PI },
  ];
  const panelGeo = new T.PlaneGeometry(6.4, 4.8);
  for (const wp of wallPanels) {
    const mat = new T.MeshBasicMaterial({
      map: wp.tex,
      transparent: true,
      opacity: 0.7,
      side: T.DoubleSide,
      depthWrite: false,
    });
    const panel = new T.Mesh(panelGeo, mat);
    panel.position.set(wp.pos[0], wp.pos[1], wp.pos[2]);
    panel.rotation.y = wp.rotY;
    scene.add(panel);
  }

  // ── Trajectory connector lines (per mode) ──
  // Per refs/unn/00_08_05: yellow lines connect points of interest on
  // the tactical plot — the trajectory-overlay vocabulary.  Each mode
  // gets a few connectors between its own contact positions so the
  // visual makes sense per mode.  Connector pairs are picked at
  // friendly→threat / friendly→friendly indices within each mode's
  // contact list.
  const _connectorPairsByMode = {
    planet:     [[0, 6], [2, 8], [1, 4]],
    solar:      [[0, 6], [2, 8], [1, 4]],
    trajectory: [[0, 7], [2, 9], [3, 11]],
    tactical:   [[0, 6], [4, 14], [10, 20]],
  };
  for (const [connModeName, pairs] of Object.entries(_connectorPairsByMode)) {
    const positions = _GLYPH_POSITIONS_BY_MODE[connModeName] || [];
    for (const [aIdx, bIdx] of pairs) {
      const a = positions[aIdx];
      const b = positions[bIdx];
      if (!a || !b) continue;
      const trajGeo = new T.BufferGeometry();
      trajGeo.setAttribute("position", new T.BufferAttribute(new Float32Array([
        a[0], a[1], a[2],
        b[0], b[1], b[2],
      ]), 3));
      const trajMat = new T.LineDashedMaterial({
        color: 0xffc233,
        dashSize: 0.4,
        gapSize: 0.3,
        transparent: true,
        opacity: 0.6,
        depthTest: false,
      });
      const traj = new T.Line(trajGeo, trajMat);
      traj.computeLineDistances();   // required for LineDashedMaterial
      traj.renderOrder = 5;
      addToMode(connModeName, traj);
    }
  }

  // Cell mount: each notebook cell becomes a CSS3DObject placed
  // around the disc periphery.  Ring radius is 1.65× disc to give
  // the floor breathing room.  Y staggers every other cell so a
  // crowded ring doesn't read as a flat fence.  Cells face the disc
  // center (rotation.y = -angle + π/2).  Scale (0.024) tuned so a
  // 360px cell reads ~9u wide in scene space — sized to the disc.
  // Hide the 2D EARTH situations-board furniture while mixed3d is the
  // active layout — the holo-disc IS the situations-board in 3D, so
  // the CSS-fixed bottom-left widget would be a redundant duplicate
  // overlapping the disc.  Restored on teardown.
  const themeFurniture = document.getElementById("theme-furniture");
  let _prevFurnitureDisplay = null;
  if (themeFurniture) {
    _prevFurnitureDisplay = themeFurniture.style.display;
    themeFurniture.style.display = "none";
  }

  // Cells: two-tier floating windows, NOT a single ring around the
  // disc edge. Inner tier at lower altitude + shorter radius (~5
  // cells); outer tier higher up + wider radius (~9 cells). Each tier
  // staggers Y per index so adjacent windows don't read as a flat
  // fence. Per User 2026-05-30: "a lot more colored lines and
  // wireframes in 3d with some floating windows."
  // Cells form a CURVED WALL on the FAR SIDE of the globe relative to
  // camera (which sits near +Z eye level).  Two rows stacked vertically;
  // each row arranges cells along an arc in the -Z hemisphere so the
  // hero viz (globe + arcs + plus glyphs) is foreground centerpiece
  // and the cells are a backdrop wall.  Per User 2026-05-30: "the
  // central 3d viz should be front and centered with the cells behind
  // it."  Cells face the world origin via lookAt so they read flat to
  // the camera looking through them.
  // Scene3d substrate cells get display:none in mixed3d (their JSON
  // specs already feed the war-room holo ring via buildScene3DMeshes
  // — rendering a per-cell WebGL would clash with the room's globe
  // and burn a context slot). Filter them out of the dome candidate
  // pool BEFORE positioning so we always get N visible cells, not
  // some count diluted by phantom slots.
  const cells = [...root.querySelectorAll(":scope > .cell")]
    .filter(c => (c.dataset.cellType || "") !== "scene3d");
  const cellObjects = new Map();
  const cellSlotKeys = new Map();
  // Dome pack: cells live on the interior of a viewing hemisphere
  // with the top third cut off. Equator (y ≈ globe altitude, 6.5) is
  // the floor — NO cells below it — and rows curve inward toward the
  // y-axis as they climb, mimicking the dome's narrowing latitude.
  // User 2026-05-31 spec: "hemisphere with the top third cut off,
  // pack layout with minimal overlap". Curved cell faces (per-cell
  // CSS transform) skipped for now — perf risk on every frame.
  //
  // Back-wall arc: θ ∈ [π + 0.65, 2π - 0.65]. Cells form a backdrop
  // behind the holos. Arc inner margin (0.65 rad ≈ 37°) pulls edge
  // cells deep into z so their projected x stays well inside the
  // viewport.
  //
  // Numerically verified no-overlap: at scale 0.029, max-width 350px
  // and arc-inset 0.65, lower-row cells project to screen x ≈
  // 266 / 621 / 915 / 1270 with rendered widths 214–278 px (closer
  // edges project larger). Upper-row 3 cells at midpoints between
  // lowers (aFrac 0.167 / 0.5 / 0.833) at R=20, y=14 project to
  // ≈ 479 / 768 / 1057 with widths 227–255 px. Cross-row vertical
  // check (lower y=6.5 vs upper y=14) clears at max-height 36vh.
  const TOTAL_N = 7;
  const LOWER_N = 4;
  const UPPER_N = 3;
  // ARC inner margin 0.85 (was 0.65) — empirically the edge cells
  // were still projecting off-screen at 0.65 because CSS3D
  // perspective at our scale enlarges projected width more than the
  // simple x/z_rel × focal estimate. 0.85 pulls edge cells in to
  // x ≈ ±15 (was ±18) and deepens z to -17 (was -14), bringing the
  // projected screen position fully inside the viewport.
  const ARC_START = Math.PI + 0.85;
  const ARC_END   = 2 * Math.PI - 0.85;
  const ARC_SPAN = ARC_END - ARC_START;
  // Lower ring: at equator altitude. Upper ring: 9 world units
  // higher so a 40vh cell (~8.8 world units at scale 0.029) fits
  // between rows. Tighter gap made the very bottom of long bodies
  // (mermaid graphs, html tables) clip — user 2026-05-31 "cells
  // still seem to cut off just the very bottom of the content."
  // Smaller upper R closes the dome.
  const LOWER_Y = 6.5;
  const LOWER_R = 23.0;
  const UPPER_Y = 15.5;
  const UPPER_R = 20.0;
  cells.forEach((cell, i) => {
    if (i >= TOTAL_N) {
      cell.style.display = "none";
      return;
    }
    const isLower = i < LOWER_N;
    const idxInRow = isLower ? i : i - LOWER_N;
    const rowN = isLower ? LOWER_N : UPPER_N;
    const rowY = isLower ? LOWER_Y : UPPER_Y;
    const rowR = isLower ? LOWER_R : UPPER_R;
    // Spread BOTH rows across the full arc (idx/(N-1)). The earlier
    // midpoint formula for upper packed the 3 cells into 1/6..5/6 of
    // the arc, which at our scale projected with 7-10 px overlaps
    // between adjacent upper cells. Using the same edge-to-edge
    // spread as the lower row guarantees the upper cells' projected
    // width fits with positive gap.
    const aFrac = idxInRow / Math.max(1, rowN - 1);
    const a = ARC_START + aFrac * ARC_SPAN;
    const obj = new T.CSS3DObject(cell);
    obj.position.set(Math.cos(a) * rowR, rowY, Math.sin(a) * rowR);
    // Face the world center axis at the cell's own height so each cell
    // reads flat-on to the camera (which is also looking at center).
    obj.lookAt(0, rowY, 0);
    obj.scale.set(0.029, 0.029, 1);
    cssScene.add(obj);
    const id = cell.dataset.cellId || `cell-${i}`;
    cellObjects.set(id, obj);
    cellSlotKeys.set(id, isLower ? `wall1:${idxInRow}` : `wall2:${idxInRow}`);
  });

  // Resize
  function onResize() {
    const W = window.innerWidth, H = window.innerHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
    cssRenderer.setSize(W, H);
  }
  window.addEventListener("resize", onResize);

  // scene3d cells routed into the holo space. Scene3d cells are
  // skipped from the cell wall (_MIXED3D_SKIP_SUBSTRATES) — each owns
  // its own WebGLRenderer + GL context, so 50+ on a wall would
  // saturate the ~16-context cap. Instead, parse a few specs and drop
  // their meshes directly into the war-room scene at small scale.
  // The geometry IS the holo, not a textured screen of holos. Bound to
  // tactical mode because it's the only centerpiece without a globe —
  // empty holo space gets populated with sampled session geometry.
  //
  // Holder placement: only the right-hemisphere arc (-π/2 .. +π/2).
  // CSS3D cells are stacked on top of the WebGL layer (z-index 2 vs 1
  // in notebook.css), so cells permanently occlude any holder that
  // projects to the same screen region — and the cell wall fills the
  // LEFT half of the viewport. Restricting to the right hemisphere
  // keeps every holder in clear space.
  const _holoScene3DHolders = [];
  (() => {
    const targets = [...root.querySelectorAll(".scene3d-target[data-scene3d-spec]")]
      .slice(0, 6);
    if (!targets.length) return;
    const ringR = 7.5;
    const targetSize = 1.5;  // absolute world-units per holder bbox
    const arcStart = -Math.PI / 2;
    const arcSpan  =  Math.PI;       // 180° right hemisphere
    targets.forEach((target, i) => {
      let spec = null;
      try { spec = JSON.parse(target.dataset.scene3dSpec); }
      catch (err) { console.warn("[mixed3d.warroom] scene3d parse failed", err); return; }
      const built = buildScene3DMeshes(spec, T, resolveColor);
      if (!built || !built.root.children.length) return;
      // Normalize so any spec (regardless of native scale) becomes a
      // bounded ~targetSize-unit object. Recenter to origin first so
      // holder.position controls the visible center of the spec.
      const bbox = new T.Box3().setFromObject(built.root);
      const sz = bbox.getSize(new T.Vector3());
      const maxDim = Math.max(sz.x, sz.y, sz.z) || 1;
      const fit = targetSize / maxDim;
      const center = bbox.getCenter(new T.Vector3());
      built.root.position.sub(center).multiplyScalar(fit);
      built.root.scale.setScalar(fit);
      // Even distribution across the right-hemisphere arc.
      const angle = arcStart + (targets.length === 1 ? 0.5 : i / (targets.length - 1)) * arcSpan;
      const holder = new T.Group();
      holder.position.set(Math.cos(angle) * ringR, 6.5, Math.sin(angle) * ringR);
      // Slow self-spin baseline so even specs without rotation_speed
      // feel alive. Phase offset per holder so the ring doesn't pulse
      // in lockstep.
      holder.userData._spinSpeed = 0.00018 * (i % 2 ? -1 : 1);
      holder.userData._spinPhase = i * 0.7;
      holder.add(built.root);
      addToMode("tactical", holder);
      _holoScene3DHolders.push({ holder, animatables: built.animatables });
    });
    if (_holoScene3DHolders.length) {
      console.info(`[mixed3d.warroom] scene3d holo ring: ${_holoScene3DHolders.length} cells routed into tactical mode`);
    }

    // Swoopy trajectory lines between holo holders so the ring reads as a
    // coherent connected display rather than scattered shapes. Each pair
    // of adjacent holders gets a CatmullRom curve lifted above the chord
    // (control points pulled upward) — TubeGeometry core + additive halo
    // for the same FUI hologram feel as the EARTH orbital arcs.
    if (_holoScene3DHolders.length >= 2) {
      const trajColor = resolveColor("--accent") || "#4a86d8";
      for (let li = 0; li < _holoScene3DHolders.length - 1; li++) {
        const p1 = _holoScene3DHolders[li].holder.position;
        const p2 = _holoScene3DHolders[li + 1].holder.position;
        const mid = new T.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const lift = 2.4 + (li % 3) * 0.6;
        mid.y += lift;
        const cp1 = new T.Vector3().lerpVectors(p1, mid, 0.45);
        const cp2 = new T.Vector3().lerpVectors(p2, mid, 0.45);
        cp1.y += lift * 0.55;
        cp2.y += lift * 0.55;
        const curve = new T.CatmullRomCurve3([p1.clone(), cp1, mid, cp2, p2.clone()], false);
        const coreGeo = new T.TubeGeometry(curve, 48, 0.022, 6, false);
        const haloGeo = new T.TubeGeometry(curve, 48, 0.065, 6, false);
        const coreMat = new T.MeshBasicMaterial({
          color: trajColor, transparent: true, opacity: 0.50, depthWrite: false,
        });
        const haloMat = new T.MeshBasicMaterial({
          color: trajColor, transparent: true, opacity: 0.14,
          blending: T.AdditiveBlending, depthWrite: false,
        });
        const grp = new T.Group();
        grp.add(new T.Mesh(haloGeo, haloMat));
        grp.add(new T.Mesh(coreGeo, coreMat));
        addToMode("tactical", grp);
      }
      console.info(`[mixed3d.warroom] swoopy trajectory lines: ${_holoScene3DHolders.length - 1} arcs between holders`);
    }
  })();

  // Active-mode setup + auto-cycle.  setActiveMode starts a 1.5 s
  // opacity crossfade between the outgoing and incoming mode (rather
  // than hard-toggling visibility) and re-binds the animation loop's
  // globe / moons / arcs to the active mode's containers.  Both modes
  // stay .visible=true during the tween; outgoing flips false at end.
  // Without URL override, setInterval rotates through WAR_MODES every 28 s.

  // Stash each centerpiece material's natural opacity once so the
  // crossfade can lerp toward it. Forces transparent:true defensively
  // (LineBasicMaterial defaults to false; would clip the fade).
  const _xfStashed = new WeakSet();
  function _stashNaturalOpacities() {
    for (const m of WAR_MODES) {
      for (const obj of centerpieceObjects[m]) {
        obj.traverse(child => {
          const mat = child.material;
          if (!mat) return;
          const mats = Array.isArray(mat) ? mat : [mat];
          for (const x of mats) {
            if (_xfStashed.has(x)) continue;
            x.userData._naturalOpacity = x.opacity;
            x.transparent = true;
            _xfStashed.add(x);
          }
        });
      }
    }
  }
  _stashNaturalOpacities();

  const _modeFactors = { planet: 0, solar: 0, trajectory: 0, tactical: 0 };
  let _crossfade = null;   // { from, to, start, duration }
  const _XFADE_MS = 1500;

  function _applyModeFactor(modeName, factor) {
    _modeFactors[modeName] = factor;
    const vis = factor > 0.001;
    for (const obj of centerpieceObjects[modeName]) {
      obj.visible = vis;
      obj.traverse(child => {
        const mat = child.material;
        if (!mat) return;
        const mats = Array.isArray(mat) ? mat : [mat];
        for (const x of mats) {
          const nat = x.userData._naturalOpacity;
          if (nat != null) x.opacity = nat * factor;
        }
      });
    }
  }

  function _tickCrossfade(now) {
    if (!_crossfade) return;
    const u = Math.min(1, (now - _crossfade.start) / _crossfade.duration);
    // smoothstep ease so the cross isn't linear-mushy at the midpoint
    const e = u * u * (3 - 2 * u);
    _applyModeFactor(_crossfade.from, 1 - e);
    _applyModeFactor(_crossfade.to, e);
    if (u >= 1) {
      _applyModeFactor(_crossfade.from, 0);
      _applyModeFactor(_crossfade.to, 1);
      _crossfade = null;
    }
  }

  let activeMode = initialMode;
  function setActiveMode(next) {
    if (next === activeMode && !_crossfade) return;
    const prev = activeMode;
    activeMode = next;
    globe = globeByMode[next];
    moons = moonsByMode[next];
    arcs  = arcsByMode[next];
    if (prev === next) { _crossfade = null; return; }
    _crossfade = { from: prev, to: next, start: performance.now(), duration: _XFADE_MS };
    console.info(`[mixed3d.warroom] active mode → ${next} (crossfade ${prev}→${next})`);
  }

  // Paint initial state without a tween: chosen mode full, others zero.
  for (const m of WAR_MODES) _applyModeFactor(m, m === initialMode ? 1 : 0);
  globe = globeByMode[initialMode];
  moons = moonsByMode[initialMode];
  arcs  = arcsByMode[initialMode];

  let _warroomCycleId = null;
  if (!_urlMode) {
    // ~28s per mode → full cycle ~112s.  Long enough for the user to
    // settle into each mode; short enough to feel like the holo-table
    // is alive between visits.
    _warroomCycleId = setInterval(() => {
      const idx = WAR_MODES.indexOf(activeMode);
      setActiveMode(WAR_MODES[(idx + 1) % WAR_MODES.length]);
    }, 28000);
  }

  _mixed3dState = {
    opts: O,
    renderer,
    cssRenderer,
    scene,
    cssScene,
    camera,
    wrap,
    cellObjects,
    cellSlotKeys,
    animation: { running: true, danger: false, t0: performance.now() },
    onResize,
    _booted: false,
    _stableFrames: 0,
    _arrangement: "war-room",
    _warroomState: { centerpieceObjects, globeByMode, moonsByMode, arcsByMode, disc, getMode: () => activeMode },
    _warroomCycleId,
    _restoreThemeFurniture: () => {
      if (themeFurniture) themeFurniture.style.display = _prevFurnitureDisplay || "";
    },
  };
  // Expose state for diagnostics (chrome MCP probes, devtools).
  window._mixed3dState = _mixed3dState;

  // Pre-allocated work vectors so the rAF tick allocates zero per
  // frame.  Reused across marker tangent computations.
  const _pPrev = new T.Vector3();
  const _pCurr = new T.Vector3();
  const _pTangent = new T.Vector3();
  const _pUp = new T.Vector3(0, 1, 0);

  let lastT = performance.now();
  const tick = () => {
    if (!_mixed3dState || !_mixed3dState.animation.running) return;
    requestAnimationFrame(tick);
    const t = performance.now();
    const dt = t - lastT;
    lastT = t;
    if (dt < 33) _mixed3dState._stableFrames = (_mixed3dState._stableFrames || 0) + 1;
    else _mixed3dState._stableFrames = 0;

    _tickCrossfade(t);

    // Close standing-in-hologram parallax sweep — ±25° at R=13, full
    // sweep every ~38s.  Camera sits just outside the largest orbital
    // arc so the volumetric content surrounds the viewer; the cell
    // wall (R=22) stays comfortably behind the globe.
    const u = (t * 0.0000263) % 1;
    const sweep = Math.sin(u * Math.PI * 2) * (Math.PI / 7);  // ±~25°
    const camR = 13;
    camera.position.x = Math.sin(sweep) * camR;
    camera.position.z = Math.cos(sweep) * camR;
    camera.position.y = 6 + Math.cos(u * Math.PI * 2) * 0.4;
    camera.lookAt(0, 6, 0);

    // Globe slow spin — full revolution every ~36 s.  Skipped when
    // the active mode has no centerpiece globe (trajectory / tactical).
    if (globe) globe.rotation.y = t * 0.000175;

    // Volumetric haze: subtle opacity breathing on the billboard
    // sprite. No rotation (sprites always face camera).
    haze.material.opacity = 0.50 + Math.sin(t * 0.0006) * 0.10;

    // scene3d holo-ring: per-cell self-spin + any rotation_speed from
    // the source spec. Cheap to drive every frame regardless of which
    // mode is active — when tactical isn't visible, the holders are
    // invisible too via the crossfade factor, but their rotation keeps
    // advancing so a mode switch reveals them mid-motion (not frozen).
    // LLM-emitted rotation_speed has no calibration — values of 0.05-0.1
    // rad/frame translate to ~3-6 rad/s (full revolution every 1-2s),
    // which reads as a strobe. Clamp per-axis to ±0.012 rad/frame
    // (~0.7 rad/s ≈ 40°/s) so even an aggressive spec stays ambient.
    const MAX_SPIN_PER_FRAME = 0.012;
    for (let i = 0; i < _holoScene3DHolders.length; i++) {
      const h = _holoScene3DHolders[i];
      h.holder.rotation.y = h.holder.userData._spinPhase + t * h.holder.userData._spinSpeed;
      for (let j = 0; j < h.animatables.length; j++) {
        const a = h.animatables[j];
        const sx = Math.max(-MAX_SPIN_PER_FRAME, Math.min(MAX_SPIN_PER_FRAME, a.speed[0] || 0));
        const sy = Math.max(-MAX_SPIN_PER_FRAME, Math.min(MAX_SPIN_PER_FRAME, a.speed[1] || 0));
        const sz = Math.max(-MAX_SPIN_PER_FRAME, Math.min(MAX_SPIN_PER_FRAME, a.speed[2] || 0));
        a.mesh.rotation.x += sx;
        a.mesh.rotation.y += sy;
        a.mesh.rotation.z += sz;
      }
    }

    // Animation epoch — used by moon orbits + arc markers below.
    const t0 = _mixed3dState.animation.t0;

    // Orbiting bodies (moons in planet mode; system bodies in solar
    // mode).  Each carries r / phase / incl / speed.
    for (let i = 0; i < moons.length; i++) {
      const m = moons[i];
      const a = m.phase + (t - t0) * m.speed;
      m.mesh.position.set(
        Math.cos(a) * m.r,
        6 + Math.sin(a) * m.incl * m.r * 0.5,
        Math.sin(a) * m.r,
      );
      m.mesh.rotation.y = t * 0.0003 * (i % 2 ? -1 : 1);
    }

    // Per-arc: group rotation + marker travel.
    // CLOSED arcs (planet/solar): marker phase walks XZ unit circle.
    // PARABOLIC arcs (trajectory): marker walks the polyline u=0..1,
    //   ping-ponging so it traces each path back and forth.
    for (let i = 0; i < arcs.length; i++) {
      const a = arcs[i];
      a.group.rotation.y += dt * 0.000022 * (i % 2 ? -1 : 1);
      if (!a.marker) continue;     // solar mode: arcs are decorative only
      if (a.kind === "parabolic") {
        // Ping-pong u along the parabola; tangent comes from the
        // derivative of the polyline param.
        const period = 1 / a.spec.speed * 0.5;
        const cyc = ((t - t0) % (period * 2)) / period;
        const u = cyc < 1 ? cyc : 2 - cyc;
        const lx = (u - 0.5) * a.spec.span;
        const ly = a.spec.height * (1 - (2 * (u - 0.5)) ** 2);
        const sin = Math.sin(a.spec.theta), cos = Math.cos(a.spec.theta);
        a.marker.position.set(cos * lx, ly, sin * lx);
        // dy/dx = -8*peak*(u-0.5)/span; pick reasonable tangent magnitude.
        const dy = a.spec.height * -8 * (u - 0.5) / a.spec.span;
        _pTangent.set(cos, dy, sin).normalize();
        if (cyc >= 1) _pTangent.multiplyScalar(-1);  // reverse on return leg
        _pCurr.copy(a.marker.position).add(_pTangent);
        a.marker.lookAt(_pCurr);
        a.marker.rotateX(-Math.PI / 2);
      } else {
        const phase = a.phase + (t - t0) * a.spec.speed;
        const r = a.spec.r;
        a.marker.position.set(Math.cos(phase) * r, 0, Math.sin(phase) * r);
        _pTangent.set(-Math.sin(phase), 0, Math.cos(phase));
        _pCurr.copy(a.marker.position).add(_pTangent);
        a.marker.lookAt(_pCurr);
        a.marker.rotateX(-Math.PI / 2);
      }
    }

    renderer.render(scene, camera);
    cssRenderer.render(cssScene, camera);

    // Boot signal — same gate as the tower path: 30 stable frames
    // OR document.hidden (rAF runs at 1Hz on hidden tabs and would
    // otherwise never reach the stable-frame threshold).
    if (!_mixed3dState._booted
        && (document.hidden || (_mixed3dState._stableFrames || 0) >= 30)) {
      _mixed3dState._booted = true;
      document.body.classList.add("booted");
      if (window._mixed3dCancelSafetyBoot) window._mixed3dCancelSafetyBoot();
    }
  };
  tick();
}

// Toggle the danger phase. Idempotent if `on` matches current state.
// Bound to keyboard D when layout=mixed3d. Also exposed on window
// (window.lucidaToggleDanger) so future HUD chip / auto-trigger flows
// (retrigger storms, suppressed-mint bursts) can reach it.
function _mixed3dToggleDanger(on) {
  if (!_mixed3dState) return;
  const next = on === undefined ? !_mixed3dState.animation.danger : !!on;
  _mixed3dState.animation.danger = next;
}

// Spawn a purple beam-burst from a random tower roof, shooting outward
// into the canyon space at a random skyward angle. Lives ~1.6s with
// linear opacity fade. Aged out in _mixed3dStepDanger.
function _mixed3dSpawnBeam(state, t) {
  const T = window.THREE;
  const tw = state.towerMeshes[Math.floor(Math.random() * state.towerMeshes.length)];
  const origin = new T.Vector3(
    tw.mesh.position.x + (Math.random() - 0.5) * 1.2,
    tw.mesh.position.y + state.geometry.towerH / 2 - Math.random() * 1.5,
    tw.mesh.position.z,
  );
  const dir = new T.Vector3(
    (Math.random() - 0.5) * 1.2,
    Math.random() * 0.6 + 0.2,
    tw.row === 0 ? 0.7 + Math.random() * 0.3 : -(0.7 + Math.random() * 0.3),
  ).normalize();
  const length = 7 + Math.random() * 7;
  const end = origin.clone().add(dir.multiplyScalar(length));
  const beamGeo = new T.BufferGeometry().setFromPoints([origin, end]);
  const beamMat = new T.LineBasicMaterial({
    color: new T.Color(state.opts.danger.beam),
    transparent: true,
    opacity: 0.95,
  });
  const beam = new T.Line(beamGeo, beamMat);
  beam.userData = { spawn: t, life: 1.4 + Math.random() * 0.5 };
  state.scene.add(beam);
  state.beams.push(beam);
}

// Per-tick danger evolution: lerp tower / particle palette toward the
// active phase's tint, spawn fresh beams while danger is on, age out
// expired beams regardless of state so toggling off doesn't strand
// them in the scene.
function _mixed3dStepDanger(t) {
  if (!_mixed3dState) return;
  const T = window.THREE;
  const S = _mixed3dState;
  const danger = S.animation.danger;
  const calmTint = new T.Color(S.opts.world.tower_tint);
  const dangerTint = new T.Color(S.opts.danger.tower_tint);
  const target = danger ? dangerTint : calmTint;
  // Lerp factor 0.04 → ~0.5s to converge; reads as a noticeable but
  // not jarring palette swap when toggling. Towers share materials
  // so we lerp the shared instances once, not per-tower.
  if (S.sharedTowerMat) {
    S.sharedTowerMat.color.lerp(target, 0.04);
    if (S.sharedTowerMat.emissive) S.sharedTowerMat.emissive.lerp(target, 0.04);
  }
  if (S.sharedEdgeMat) S.sharedEdgeMat.color.lerp(target, 0.04);
  if (S.particleSystem) {
    const pTarget = danger ? new T.Color(S.opts.danger.particles_color) : calmTint;
    S.particleSystem.material.color.lerp(pTarget, 0.025);
  }
  // Spawn beams while active.
  if (danger && t > S.nextBeamAt) {
    _mixed3dSpawnBeam(S, t);
    S.nextBeamAt = t + 0.35 + Math.random() * 0.5;
  }
  // Age beams (always — survives toggling off).
  for (let i = S.beams.length - 1; i >= 0; i--) {
    const beam = S.beams[i];
    const age = t - beam.userData.spawn;
    if (age >= beam.userData.life) {
      S.scene.remove(beam);
      beam.geometry.dispose();
      beam.material.dispose();
      S.beams.splice(i, 1);
    } else {
      beam.material.opacity = 0.95 * (1 - age / beam.userData.life);
    }
  }
}

// Camera path. opts.camera selects the policy:
//   "weave-grid"   — low altitude, walks grid lanes, 90° turns
//   "dolly-canyon" — ping-pong sweep along canyon (legacy)
// Debug helpers — overlay tier-1 cell metadata onto each cached
// canvas (D key) and dump a contact sheet of currently-cached cells
// (Q key). Both are dev-time tools, no production impact.
let _mixed3dDebugOverlayOn = false;
function _mixed3dPaintDebugOverlay(canvas, id, obj) {
  const ctx = canvas.getContext("2d");
  const cs = obj?.userData?.colspan || 1;
  const ct = obj?.userData?.cellEl?.dataset?.cellType || "?";
  // Lower-right corner badge so it doesn't cover substrate content.
  ctx.save();
  ctx.font = "bold 14px 'Eurostile', 'Share Tech Mono', monospace";
  const label = `${id} cs=${cs} ${ct}`;
  const w = ctx.measureText(label).width + 12;
  const x = canvas.width - w - 4;
  const y = canvas.height - 22;
  ctx.fillStyle = "rgba(255, 100, 200, 0.85)";
  ctx.fillRect(x, y, w, 18);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";
  ctx.fillText(label, x + 6, y + 2);
  ctx.restore();
}
function _mixed3dToggleDebugOverlay() {
  const S = _mixed3dState;
  if (!S) return;
  _mixed3dDebugOverlayOn = !_mixed3dDebugOverlayOn;
  if (_mixed3dDebugOverlayOn) {
    for (const [id, c] of (S._snapTexCache || new Map())) {
      const obj = S.cellObjects.get(id);
      _mixed3dPaintDebugOverlay(c, id, obj);
      if (obj?.material?.map) { obj.material.map.needsUpdate = true; }
    }
    LOG.debug("[mixed3d] debug overlay: ON");
  } else {
    // Off: wipe the snap cache so the driver re-renders every cell
    // without the badge. Visible cells repaint within ~10-20s as the
    // driver works through the camera-priority queue. While the driver
    // catches up, fall back to the promote-stub so cells don't show the
    // stale badge texture. User 2026-05-22: "if I toggle debug mode off
    // and on the debug labels on the cells don't disappear again".
    const cache = S._snapTexCache;
    if (cache) {
      for (const [id, _c] of cache) {
        const obj = S.cellObjects.get(id);
        if (!obj || obj.isInstanceHandle || !obj.material?.map) continue;
        const cellData = state.rendering.cellsById?.get(id);
        const colspan = obj.userData?.colspan || 1;
        const H_full = obj.userData?.canvasH || 576;
        const stub = _mixed3dPaintPromoteStub(id, cellData, colspan, H_full);
        if (stub) {
          obj.material.map.image = stub;
          obj.material.map.needsUpdate = true;
        }
      }
      cache.clear();
    }
    LOG.debug("[mixed3d] debug overlay: OFF (cache wiped; cells repaint via snap driver)");
  }
}
async function _mixed3dDumpContactSheet() {
  const S = _mixed3dState;
  if (!S || !S._snapTexCache) return;
  const entries = [...S._snapTexCache.entries()].slice(0, 16);
  if (!entries.length) { console.warn("[mixed3d] contact sheet: cache empty"); return; }
  const cols = 4;
  const rows = Math.ceil(entries.length / cols);
  // Normalize each cell to a fixed-size thumbnail.
  const TW = 240, TH = 320, PAD = 10;
  const sheet = document.createElement("canvas");
  sheet.width = cols * (TW + PAD) + PAD;
  sheet.height = rows * (TH + PAD) + PAD;
  const sctx = sheet.getContext("2d");
  sctx.fillStyle = "#000814";
  sctx.fillRect(0, 0, sheet.width, sheet.height);
  for (let i = 0; i < entries.length; i++) {
    const [id, c] = entries[i];
    const obj = S.cellObjects.get(id);
    const r = Math.floor(i / cols);
    const col = i % cols;
    const x = PAD + col * (TW + PAD);
    const y = PAD + r * (TH + PAD);
    sctx.drawImage(c, x, y, TW, TH);
    sctx.strokeStyle = "#00ddff";
    sctx.lineWidth = 1;
    sctx.strokeRect(x, y, TW, TH);
    sctx.fillStyle = "#ff64c8";
    sctx.font = "bold 14px monospace";
    sctx.fillText(`${id}  cs=${obj?.userData?.colspan || "?"}  ${obj?.userData?.cellEl?.dataset?.cellType || "?"}`, x + 4, y + TH - 4);
  }
  const blob = await new Promise(res => sheet.toBlob(res, "image/png"));
  const arr = new Uint8Array(await blob.arrayBuffer());
  const ts = Date.now();
  const name = `qa-contact-sheet-${ts}.png`;
  try {
    const r = await fetch("http://127.0.0.1:8767/" + name, {
      method: "POST", body: arr, headers: { "content-type": "image/png" }
    });
    LOG.debug(`[mixed3d] contact sheet -> refs/gibson/live-shots/${name}`, r.ok ? "OK" : "FAIL");
  } catch (e) {
    console.warn("[mixed3d] contact sheet upload failed:", e);
  }
}
if (typeof window !== "undefined" && !window._mixed3dDebugKeysWired) {
  window._mixed3dDebugKeysWired = true;
  // Free-flight key state. Always-on (no toggle): pressing any movement
  // key takes camera control immediately; tour resumes from the current
  // position when no movement keys are held. WASD translate, QE up/down,
  // arrow keys yaw/pitch, Shift = boost. Debug-overlay + contact-sheet
  // hotkeys remapped off D/Q to avoid collision with strafe/down.
  // User 2026-05-22: "just remap the debug d and q keys, so there's no
  // collisions or mode switching".
  window._mixed3dFreeFlightKeys = new Set();
  window.addEventListener("keydown", (e) => {
    if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA") return;
    // Capture movement keys (any key press here also seeds yaw/pitch
    // from the current camera if this is the first input this session).
    const movementCodes = ["KeyW","KeyA","KeyS","KeyD","KeyQ","KeyZ","ArrowLeft","ArrowRight","ArrowUp","ArrowDown"];
    if (movementCodes.includes(e.code)) {
      const S = _mixed3dState;
      if (S) {
        const fresh = window._mixed3dFreeFlightKeys.size === 0
          && (S._ffYaw === undefined || S._ffPitch === undefined);
        window._mixed3dFreeFlightKeys.add(e.code);
        if (fresh) {
          if (S._park && typeof window._mixed3dUnpark === "function") {
            window._mixed3dUnpark();
          }
          const T = window.THREE;
          if (T && S.camera) {
            const dir = new T.Vector3();
            S.camera.getWorldDirection(dir);
            S._ffYaw = Math.atan2(dir.x, dir.z);
            S._ffPitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
          }
        }
        e.preventDefault();
      }
      return;
    }
    // Debug-overlay: remapped D → backtick.
    if (e.key === "`") { _mixed3dToggleDebugOverlay(); e.preventDefault(); return; }
    // Contact-sheet: remapped Q → P.
    if (e.key === "p" || e.key === "P") { _mixed3dDumpContactSheet(); e.preventDefault(); return; }
    // ? — toggle keybinding legend.
    if (e.key === "?") { _mixed3dToggleHotkeyLegend(); e.preventDefault(); return; }
    // R — reset to swoopy tour. Exit point from free-flight (WASD/arrow)
    // AND from any state where the camera is stuck (e.g. clicked
    // during boot ease-in left arcAccum=null). Mirrors window
    // _mixed3dResetSwoopy below so callers can fire it from JS too.
    if (e.key === "r" || e.key === "R") {
      if (typeof window._mixed3dResetSwoopy === "function") window._mixed3dResetSwoopy();
      e.preventDefault();
      return;
    }
  });
  window.addEventListener("keyup", (e) => {
    window._mixed3dFreeFlightKeys.delete(e.code);
  });
}

function _mixed3dToggleHotkeyLegend() {
  let el = document.getElementById("hotkey-legend");
  if (!el) {
    el = document.createElement("div");
    el.id = "hotkey-legend";
    el.style.cssText = [
      "position:fixed",
      "top:64px",
      "right:16px",
      "z-index:9998",
      "background:rgba(8,18,30,0.92)",
      "border:1px solid rgba(0,221,255,0.35)",
      "color:#cceeff",
      "font-family:'Eurostile','Share Tech Mono',monospace",
      "font-size:12px",
      "padding:14px 18px",
      "letter-spacing:0.04em",
      "line-height:1.55",
      "min-width:260px",
      "box-shadow:0 0 24px rgba(0,221,255,0.08)",
    ].join(";");
    el.innerHTML = `
      <div style="font-weight:bold;color:#9966ff;margin-bottom:8px;letter-spacing:0.12em;">> HOTKEYS</div>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;">
        <span style="color:#00ddff">W A S D</span><span>translate</span>
        <span style="color:#00ddff">Q · Z</span><span>up · down</span>
        <span style="color:#00ddff">← → ↑ ↓</span><span>yaw · pitch</span>
        <span style="color:#00ddff">Shift</span><span>boost (3×)</span>
        <span style="color:#00ddff">click cell</span><span>park camera</span>
        <span style="color:#00ddff">Esc</span><span>unpark</span>
        <span style="color:#00ddff">\`</span><span>debug overlay</span>
        <span style="color:#00ddff">P</span><span>contact sheet</span>
        <span style="color:#00ddff">X</span><span>danger toggle</span>
        <span style="color:#00ddff">?</span><span>this legend</span>
      </div>
    `;
    document.body.appendChild(el);
  } else {
    el.remove();
  }
}

function _mixed3dDriveFreeFlight(t) {
  const S = _mixed3dState;
  const T = window.THREE;
  if (!S || !T || !S.camera) return;
  const keys = window._mixed3dFreeFlightKeys || new Set();
  const boost = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 3.0 : 1.0;
  const speed = 0.35 * boost;  // world-units per frame
  const lookSpeed = 0.025 * boost;
  // Yaw/pitch from arrow keys.
  if (keys.has("ArrowLeft")) S._ffYaw = (S._ffYaw || 0) + lookSpeed;
  if (keys.has("ArrowRight")) S._ffYaw = (S._ffYaw || 0) - lookSpeed;
  // Flight-sim inversion: pushing Up pitches the nose DOWN (forward).
  // User 2026-05-22 "invert my arrow keys up down so it's more like
  // a flight sim too".
  if (keys.has("ArrowUp")) S._ffPitch = Math.max(-1.3, (S._ffPitch || 0) - lookSpeed);
  if (keys.has("ArrowDown")) S._ffPitch = Math.min(1.3, (S._ffPitch || 0) + lookSpeed);
  // Forward vector from yaw + pitch.
  const yaw = S._ffYaw || 0;
  const pitch = S._ffPitch || 0;
  const fwd = new T.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  // Right vector = cross(fwd, up). With up=(0,1,0) and fwd above,
  // right = (-fwd.z, 0, fwd.x). Strafe stays horizontal (pitch
  // ignored). Earlier formula (cos, 0, -sin) was reversed — A and D
  // swapped per user 2026-05-22.
  const right = new T.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
  const cam = S.camera;
  if (keys.has("KeyW")) cam.position.addScaledVector(fwd, speed);
  if (keys.has("KeyS")) cam.position.addScaledVector(fwd, -speed);
  if (keys.has("KeyA")) cam.position.addScaledVector(right, -speed);
  if (keys.has("KeyD")) cam.position.addScaledVector(right, speed);
  if (keys.has("KeyQ")) cam.position.y += speed;
  if (keys.has("KeyZ")) cam.position.y -= speed;
  // Bounds: don't fly through the floor or too far out of the city.
  // Half-field plus a small margin so the camera can graze edges but
  // not escape into the void. Floor stop at y=1.5 (above the floor
  // mesh + floor texture). User 2026-05-23 "probably shouldn't let
  // me fly the camera through the floor or too far away from the
  // city".
  const G = S.geometry;
  if (G) {
    const halfField = ((G.towerCount - 1) / 2) * G.spacing + G.spacing;
    cam.position.x = Math.max(-halfField, Math.min(halfField, cam.position.x));
    cam.position.z = Math.max(-halfField, Math.min(halfField, cam.position.z));
  }
  cam.position.y = Math.max(1.5, Math.min(28, cam.position.y));
  // Look in the direction we're facing.
  cam.lookAt(cam.position.x + fwd.x, cam.position.y + fwd.y, cam.position.z + fwd.z);
  cam.up.set(0, 1, 0);
}

function _mixed3dDriveCamera(t) {
  if (!_mixed3dState) return;
  // Hold camera at the initial pose while path warmup is filling the
  // tier-1 snap cache. Without this the curve advances during the
  // 5-20s warmup and cells start popping in before they're prerendered.
  if (_mixed3dState._warmupActive) return;
  // Park-at-cell takes priority — click-park works even after the user
  // has flown around (else click-to-park stops working post-flight,
  // user 2026-05-22). Park flag is set by _mixed3dParkAt.
  if (_mixed3dState._park) {
    const T = window.THREE;
    if (T) {
      const park = _mixed3dState._park;
      // Seed lookAtActual from the camera's CURRENT forward vector so
      // the look direction lerps smoothly from wherever the camera was
      // pointing (mid-swoopy / mid-mouselook) to the cell — instead
      // of snapping. User 2026-05-23 "smooth transition away from
      // current camera position instead of just snapping to zoom".
      if (!park.lookAtActual) {
        const dir = new T.Vector3();
        _mixed3dState.camera.getWorldDirection(dir);
        park.lookAtActual = _mixed3dState.camera.position
          .clone()
          .add(dir.multiplyScalar(8));
      }
      _mixed3dState.camera.position.lerp(park.target, 0.08);
      park.lookAtActual.lerp(park.lookAt, 0.08);
      _mixed3dState.camera.lookAt(park.lookAtActual);
    }
    return;
  }
  // Free-flight: any movement key held → drive camera from keys; tour
  // disabled once the user has ever pressed a movement key. The first
  // touch sets _userTookCamera; tour stays off for the page session.
  // User 2026-05-22.
  const _ffKeys = window._mixed3dFreeFlightKeys;
  const _hasMove = _ffKeys && (_ffKeys.has("KeyW") || _ffKeys.has("KeyA") || _ffKeys.has("KeyS") || _ffKeys.has("KeyD") || _ffKeys.has("KeyQ") || _ffKeys.has("KeyZ") || _ffKeys.has("ArrowLeft") || _ffKeys.has("ArrowRight") || _ffKeys.has("ArrowUp") || _ffKeys.has("ArrowDown"));
  if (_hasMove) _mixed3dState._userTookCamera = true;
  // Mouselook drag (left-click + motion) drives the camera via the
  // same freeflight function — without it, _ffYaw/_ffPitch are
  // updated by mousemove but never applied to the camera (bug
  // reported 2026-05-23 "left click to mouselook isn't working").
  if (_mixed3dState._mouselookActive || _hasMove) {
    _mixed3dDriveFreeFlight(t);
    return;
  }
  if (_mixed3dState._userTookCamera) {
    // User has flown via WASD/arrows — camera holds position; no tour.
    // (Mouselook above auto-resets on release so it doesn't reach here.)
    return;
  }
  const policy = _mixed3dState.opts.camera;
  // First-call announce so the active camera mode is visible in
  // DevTools — quick way to confirm new tokens loaded vs. stale
  // browser-cached JS using an old policy.
  if (!_mixed3dState._cameraAnnounced) {
    LOG.debug("[mixed3d] camera mode:", policy);
    _mixed3dState._cameraAnnounced = true;
  }
  if (policy === "swoopy-tour") {
    _mixed3dDriveSwoopyTour(t);
  } else if (policy === "weave-grid") {
    _mixed3dDriveWeaveGrid(t);
  } else if (policy === "dolly-canyon") {
    _mixed3dDriveDollyCanyon(t);
  } else {
    _mixed3dState.camera.lookAt(0, 8, 0);
  }
}

// Swoopy-tour camera: chained quadratic-bezier segments, each ~3.5–5.5s.
// Each segment picks a "focus tower" (preferring towers ahead of motion
// and within a few tower-spacings) and arcs the camera past one of its
// faces, with lookAt smoothly tracking the focus through the pass.
// Y rises mid-segment, dips on flyby — the looming-up-from-below
// shot from the Hackers Gibson scenes.
function _smoothstep01(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}
function _mixed3dBezier3(p0, p1, p2, t) {
  const u = 1 - t;
  const T = window.THREE;
  return new T.Vector3(
    u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z,
  );
}
// Quadratic bezier derivative: B'(t) = 2(1-t)(P1-P0) + 2t(P2-P1).
// Used to derive camera motion direction at any t along the curve —
// the camera looks AHEAD along this tangent rather than at a fixed
// focus tower, so passes don't trigger bearing-whip when the camera
// flies past a target.
function _mixed3dBezier3Tangent(p0, p1, p2, t) {
  const u = 1 - t;
  const T = window.THREE;
  return new T.Vector3(
    2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
    2 * u * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
    2 * u * (p1.z - p0.z) + 2 * t * (p2.z - p1.z),
  );
}
function _mixed3dPickSwoopFocus(fromPos, fromLookAt, motionDir) {
  const S = _mixed3dState;
  const G = S.geometry;
  // Use camera MOTION direction, not lookAt direction. Previously
  // the picker indexed off (lookAt - pos) which can drift far from
  // where the camera is actually heading — that's how we ended up
  // picking targets behind the motion vector and then doing a 180°
  // swing to reach them (user 2026-05-02 "we still did a fast 180
  // spin at some point").
  let fwdNX, fwdNZ;
  if (motionDir) {
    fwdNX = motionDir.x;
    fwdNZ = motionDir.z;
  } else {
    const fwdX = fromLookAt.x - fromPos.x;
    const fwdZ = fromLookAt.z - fromPos.z;
    const fwdLen = Math.hypot(fwdX, fwdZ) || 1;
    fwdNX = fwdX / fwdLen;
    fwdNZ = fwdZ / fwdLen;
  }
  const candidates = [];
  for (let i = 0; i < S.towerMeshes.length; i++) {
    const tw = S.towerMeshes[i];
    const dx = tw.mesh.position.x - fromPos.x;
    const dz = tw.mesh.position.z - fromPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < G.spacing * 2.0) continue;
    if (dist > G.spacing * 6.0) continue;
    const align = (dx * fwdNX + dz * fwdNZ) / Math.max(0.1, dist);
    if (align < 0.5) continue;
    // Inner-field bias: prefer towers nearer the field center so
    // the camera path circles the middle and most of the field
    // stretches back into the distance (user 2026-05-02 "camera
    // shouldn't get too close to the edges").
    const fieldHalf = ((S.geometry.towerCount - 1) / 2) * S.geometry.spacing;
    const innerRadius = fieldHalf * 0.55;
    const towerR = Math.hypot(tw.mesh.position.x, tw.mesh.position.z);
    if (towerR > innerRadius) continue;
    candidates.push({ tw, score: align * 2 - dist / (G.spacing * 8) });
  }
  if (candidates.length === 0) {
    // Fallback: any tower in range
    return S.towerMeshes[Math.floor(Math.random() * S.towerMeshes.length)];
  }
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, Math.min(4, candidates.length));
  return top[Math.floor(Math.random() * top.length)].tw;
}
function _mixed3dBuildSwoopSegment(t, fromPos, fromLookAt, motionDir) {
  const T = window.THREE;
  const G = _mixed3dState.geometry;
  const focus = _mixed3dPickSwoopFocus(fromPos, fromLookAt, motionDir);
  // Focus look-target Y at low cell-stack height (~4) — camera
  // stays low (user 2026-05-02: "camera level should stay low,
  // never above halfway up the columns. they should always feel
  // like they're towering above us a bit").
  const focusCenter = new T.Vector3(
    focus.mesh.position.x,
    4.0,
    focus.mesh.position.z,
  );
  const dx = focusCenter.x - fromPos.x;
  const dz = focusCenter.z - fromPos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const fwdNX = dx / dist;
  const fwdNZ = dz / dist;
  const perpX = -fwdNZ;
  const perpZ = fwdNX;
  const sideSign = Math.random() < 0.5 ? -1 : 1;
  // Pass-point: outside the half-column-width safety pad. Tower face
  // is at 0.5*towerW = 2 from center; user wants camera >= half a
  // tower-width OUTSIDE the face = 4 from center. Use 1.1× towerW
  // = 4.4 units off so we have a touch of buffer over the safe pad.
  const passOffset = G.towerW * (1.1 + Math.random() * 0.4);
  // Y always low — camera stays in lower half of tower height
  // so towers feel like they're looming overhead.
  const passY = 3 + Math.random() * 2; // 3-5
  const passPoint = new T.Vector3(
    focusCenter.x + perpX * passOffset * sideSign,
    passY,
    focusCenter.z + perpZ * passOffset * sideSign,
  );
  // Compute desired endPos, then SNAP to nearest lane-intersection
  // (point centered between four neighboring towers). Lane positions
  // are at (i + 0.5 - gridHalf) * spacing for i in 0..towerCount-2.
  // A bezier between two lane intersections threads safe corridors
  // far more reliably than free-form endpoints — push iterations
  // had been failing on long diagonals that crossed multiple towers.
  let endX = focusCenter.x + fwdNX * G.spacing * 1.2 + perpX * G.towerW * sideSign * 1.4;
  let endZ = focusCenter.z + fwdNZ * G.spacing * 1.2 + perpZ * G.towerW * sideSign * 1.4;
  const gridHalf = (G.towerCount - 1) / 2;
  const snapLane = (v) => {
    const idx = Math.round(v / G.spacing - 0.5 + gridHalf);
    const clamped = Math.max(0, Math.min(G.towerCount - 2, idx));
    return (clamped + 0.5 - gridHalf) * G.spacing;
  };
  endX = snapLane(endX);
  endZ = snapLane(endZ);
  const endPos = new T.Vector3(endX, 3 + Math.random() * 2, endZ);
  // Control = 2*passPoint − 0.5*(from + end) — quadratic bezier passes
  // exactly through passPoint at t=0.5 (algebra: B(0.5) = 0.25*P0 +
  // 0.5*P1 + 0.25*P2). So the camera actually flies BY the tower face.
  const control = new T.Vector3(
    2 * passPoint.x - 0.5 * (fromPos.x + endPos.x),
    2 * passPoint.y - 0.5 * (fromPos.y + endPos.y),
    2 * passPoint.z - 0.5 * (fromPos.z + endPos.z),
  );
  const seg = {
    from: fromPos.clone(),
    to: endPos,
    control,
    lookAtFrom: fromLookAt.clone(),
    lookAtTo: focusCenter.clone(),
    t0: t,
    // ~3× longer per segment than before — user 2026-05-02 "general
    // camera flying speed is still too high. it needs to be like 1/3
    // that." 30–45s per segment, smoothstep easing slows the
    // pass-through-tower-face moment to barely-moving.
    duration: 30.0 + Math.random() * 15.0,
    // Side sign cached for banking — camera leans INTO the turn.
    sideSign,
  };
  // Towers are solid — push the bezier control point out of any tower
  // it currently clips through, iterating until clear (or we hit max).
  // User 2026-05-02: "columns should be treated as solid, camera
  // can't fly through them."
  _mixed3dPushSegmentOutOfTowers(seg);
  return seg;
}

// Sample the curve and push the control point out of any tower it
// would intersect. Quadratic bezier midpoint moves by Δ/2 when
// control moves by Δ, so the push factor has to be ~2× the depth
// or it never escapes (was undersized at 2+depth, hence user 2026-
// 05-02 "I just saw the camera fly through a column"). Lifts y on
// each pass so chronic clipping converges on a higher arc as a
// final fallback.
// Push a single point outside any tower's xz safety zone.
// Used to repair seg.to (and seg.from on first segment) before
// running the full curve-push pass — endpoints inside a tower are
// unfixable by control-push alone (the curve is anchored there).
function _mixed3dPushPointOutOfTowers(point) {
  const G = _mixed3dState.geometry;
  const safe = G.towerW * 0.8;
  for (let iter = 0; iter < 5; iter++) {
    let worst = null;
    for (const tw of _mixed3dState.towerMeshes) {
      const dx = point.x - tw.mesh.position.x;
      const dz = point.z - tw.mesh.position.z;
      if (Math.abs(dx) >= safe || Math.abs(dz) >= safe) continue;
      const dist = Math.hypot(dx, dz) || 0.001;
      const depth = safe - dist;
      if (!worst || depth > worst.depth) {
        worst = { outX: dx / dist, outZ: dz / dist, depth };
      }
    }
    if (!worst) return;
    point.x += worst.outX * (worst.depth + 0.6);
    point.z += worst.outZ * (worst.depth + 0.6);
  }
}

function _mixed3dPushSegmentOutOfTowers(seg) {
  const G = _mixed3dState.geometry;
  // safe = 0.8×towerW gives ~1.5 units of pad past each face (was
  // 1× = 2.5 pad, but with spacing 12 the corridors between
  // safe-zones were only 2 units wide and bezier curves couldn't
  // thread them — iterations oscillated between adjacent towers
  // forever and the user kept seeing camera clipping). Trade-off:
  // closer passes than the "half a column past face" target, but
  // no clipping.
  const safe = G.towerW * 0.8;
  const SAMPLES = 50;
  // First: ensure the endpoints themselves aren't inside towers.
  // Quadratic bezier is anchored at from/to, so a from/to inside
  // a tower means the curve can't be cleared by control-push alone.
  _mixed3dPushPointOutOfTowers(seg.to);
  _mixed3dPushPointOutOfTowers(seg.from);
  let lastWorst = null;
  let oscillationCount = 0;
  for (let iter = 0; iter < 40; iter++) {
    let worst = null;
    for (let i = 1; i < SAMPLES; i++) {
      const t = i / SAMPLES;
      const p = _mixed3dBezier3(seg.from, seg.control, seg.to, t);
      // No y filter: camera y is hard-clamped low at render time,
      // so the actual camera path stays within tower y-range
      // regardless of where the bezier's y goes. Treat the curve
      // as 2D in xz — must thread between towers, can't fly over.
      for (const tw of _mixed3dState.towerMeshes) {
        const dx = p.x - tw.mesh.position.x;
        const dz = p.z - tw.mesh.position.z;
        if (Math.abs(dx) >= safe || Math.abs(dz) >= safe) continue;
        const dist = Math.hypot(dx, dz) || 0.001;
        const depth = safe - dist;
        if (!worst || depth > worst.depth) {
          worst = { outX: dx / dist, outZ: dz / dist, depth };
        }
      }
    }
    if (!worst) return;
    // Detect oscillation: if the worst-direction nearly inverts
    // between iterations, we're being shoved back and forth between
    // two towers. Snap control to the midpoint between fromand to
    // (best fallback for "two equally-bad sides") and break.
    if (lastWorst) {
      const dot = lastWorst.outX * worst.outX + lastWorst.outZ * worst.outZ;
      if (dot < -0.5) oscillationCount++;
      else oscillationCount = 0;
      if (oscillationCount >= 3) {
        seg.control.x = (seg.from.x + seg.to.x) * 0.5;
        seg.control.z = (seg.from.z + seg.to.z) * 0.5;
        // One last try with fresh state
        oscillationCount = 0;
        lastWorst = null;
        continue;
      }
    }
    lastWorst = worst;
    const push = 7.0 + worst.depth * 3.0;
    seg.control.x += worst.outX * push;
    seg.control.z += worst.outZ * push;
  }
}
// Swoopy tour, version 2 (lane-graph routing, 2026-05-02).
//
// Architecture: the field's lane intersections form a (towerCount-1)²
// grid graph. Each intersection is a point centered between four
// neighboring towers — guaranteed >=8.5 units from any tower center,
// well past the safe pad. Adjacent intersections (one-edge apart)
// are connected; an edge length is `spacing` (12).
//
// The camera traverses a sequence of intersections via Catmull-Rom
// spline. Catmull-Rom curves between adjacent grid points stay
// within ~spacing/8 (~1.5 units) of the polyline, which keeps them
// inside lane corridors that are ~spacing - towerW = 7 units wide
// (3.5 to either side). So the camera path CANNOT clip a tower —
// no iterative collision push needed.
//
// At each intersection arrival the queue advances and a new
// "next-next" intersection is generated. Direction choice biases
// toward inner field, avoids immediate U-turns, slight preference
// for continuing straight over turning.
const _LANE_DIRS = [
  { di: 0, dj: -1 }, // N (-Z)
  { di: 1, dj: 0 },  // E (+X)
  { di: 0, dj: 1 },  // S (+Z)
  { di: -1, dj: 0 }, // W (-X)
];
function _mixed3dLaneToWorld(i, j) {
  const T = window.THREE;
  const G = _mixed3dState.geometry;
  const gridHalf = (G.towerCount - 1) / 2;
  return new T.Vector3(
    (i + 0.5 - gridHalf) * G.spacing,
    0,
    (j + 0.5 - gridHalf) * G.spacing,
  );
}
function _mixed3dPickNextLane(currIdx, prevIdx) {
  const G = _mixed3dState.geometry;
  const halfField = ((G.towerCount - 1) / 2) * G.spacing;
  const innerR = halfField * 0.55;
  // Determine continuing direction (if we have a prev, the dir from
  // prev to curr is the "straight" direction — bias toward it for
  // visual smoothness).
  let straightDir = null;
  if (prevIdx) {
    const di = currIdx.i - prevIdx.i;
    const dj = currIdx.j - prevIdx.j;
    straightDir = { di, dj };
  }
  const candidates = [];
  for (const dir of _LANE_DIRS) {
    const ni = currIdx.i + dir.di;
    const nj = currIdx.j + dir.dj;
    if (ni < 0 || ni > G.towerCount - 2) continue;
    if (nj < 0 || nj > G.towerCount - 2) continue;
    const pos = _mixed3dLaneToWorld(ni, nj);
    if (Math.hypot(pos.x, pos.z) > innerR) continue;
    if (prevIdx && prevIdx.i === ni && prevIdx.j === nj) continue; // no U-turn
    // Weight: 3 if continuing straight, 1 otherwise — biases toward
    // forward motion, occasional turn.
    const isStraight = straightDir && straightDir.di === dir.di && straightDir.dj === dir.dj;
    const weight = isStraight ? 3 : 1;
    for (let k = 0; k < weight; k++) candidates.push({ i: ni, j: nj });
  }
  if (candidates.length === 0) {
    // Boxed in — allow any in-bounds neighbor (even U-turn).
    for (const dir of _LANE_DIRS) {
      const ni = currIdx.i + dir.di;
      const nj = currIdx.j + dir.dj;
      if (ni < 0 || ni > G.towerCount - 2) continue;
      if (nj < 0 || nj > G.towerCount - 2) continue;
      candidates.push({ i: ni, j: nj });
    }
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}
function _catmullRom3(p0, p1, p2, p3, t) {
  const T = window.THREE;
  const t2 = t * t;
  const t3 = t2 * t;
  return new T.Vector3(
    0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  );
}
function _catmullRom3Tangent(p0, p1, p2, p3, t) {
  const T = window.THREE;
  const t2 = t * t;
  return new T.Vector3(
    0.5 * ((-p0.x + p2.x) + 2 * (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t + 3 * (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t2),
    0,
    0.5 * ((-p0.z + p2.z) + 2 * (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t + 3 * (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t2),
  );
}
// Decide whether the segment p1→p2 is "straight" (colinear control
// points). Straight segments are safe for grazing-pan offsets: the
// curve doesn't bend, so a lateral perturbation toward one face
// stays inside the corridor (corridor halfwidth = 3.5; max graze
// = 2.5 → 1.0u clearance from face).
function _mixed3dSegmentIsStraight(p0, p1, p2, p3) {
  const eq = (a, b) => Math.abs(a - b) < 1e-3;
  const d01x = p1.x - p0.x, d01z = p1.z - p0.z;
  const d12x = p2.x - p1.x, d12z = p2.z - p1.z;
  const d23x = p3.x - p2.x, d23z = p3.z - p2.z;
  return eq(d01x, d12x) && eq(d01z, d12z) && eq(d12x, d23x) && eq(d12z, d23z);
}
// Clamp an XZ position to stay outside every tower bounding box, used
// to prevent the camera's smoothed position from crossing a tower
// interior. Two sites can otherwise push posActual into a wall:
//   (1) scan-target route-through bias attracts toward a cell on a
//       tower face; if the cell's tower sits between the curve lane
//       and the cell, the up-to-2u bias can punch through.
//   (2) unpark resume lerps posActual from a parked-outside-perimeter
//       position back to a corridor curve point — straight-line
//       interpolation can clip a perimeter tower.
// With spacing=12 and towerW=5, towers are 7u apart and only the
// single nearest grid cell can contain a given (x,z). Find it, then
// push out along whichever axis has smaller penetration so the camera
// grazes the wall instead of teleporting to the corridor center.
function _mixed3dClampOutsideTowers(pos) {
  const S = _mixed3dState;
  if (!S?.geometry) return;
  const G = S.geometry;
  if (G.towerCount == null || G.towerW == null || G.spacing == null) return;
  const gridHalf = (G.towerCount - 1) / 2;
  const hw = G.towerW / 2;
  // Margin bumped 2026-05-26 from 0.35 → 1.0u. User: "flew close to
  // a corner and slid along it" — the small buffer let the camera
  // graze tower edges. 1.0u gives visible breathing room.
  const margin = 1.0;
  const limit = hw + margin;
  // Check the 2x2 tower lanes surrounding the camera, not just the
  // rounded-nearest one. At corners (between four towers) the
  // rounded-nearest check missed adjacent tower edges, producing the
  // grazing-slide artifact. Iterate over floor and ceil of both axes
  // to cover all four cells.
  const fx = pos.x / G.spacing + gridHalf;
  const fz = pos.z / G.spacing + gridHalf;
  const xCandidates = [Math.floor(fx), Math.ceil(fx)];
  const zCandidates = [Math.floor(fz), Math.ceil(fz)];
  let bestPen = 0;
  let bestApply = null;
  for (const ix of xCandidates) {
    if (ix < 0 || ix >= G.towerCount) continue;
    for (const iz of zCandidates) {
      if (iz < 0 || iz >= G.towerCount) continue;
      const cx = (ix - gridHalf) * G.spacing;
      const cz = (iz - gridHalf) * G.spacing;
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      if (Math.abs(dx) >= limit || Math.abs(dz) >= limit) continue;
      const penX = limit - Math.abs(dx);
      const penZ = limit - Math.abs(dz);
      const pen = Math.min(penX, penZ);
      if (pen > bestPen) {
        bestPen = pen;
        bestApply = (penX <= penZ)
          ? () => { pos.x = cx + (dx >= 0 ? limit : -limit); }
          : () => { pos.z = cz + (dz >= 0 ? limit : -limit); };
      }
    }
  }
  if (bestApply) bestApply();
}

// Closed-loop tour: ONE Catmull-Rom curve through a fixed set of
// waypoints, traversed at constant arc-length speed. No segment
// advances, no random direction picks, no queue shift. The curve is
// the entire camera path; the only discontinuities are C² jumps at
// the control points (Catmull-Rom is C¹ but not C²) — those are
// smeared by the heading-history bank smoothing below.
//
// Replaces the previous queue-based "swoopy-tour" which had many
// problems at segment boundaries (smoothstep velocity halt, grazing
// flip whips, curvature jumps every 8s).
function _mixed3dDriveSwoopyTour(t) {
  const T = window.THREE;
  const S = _mixed3dState;
  const cam = S.camera;
  // Defensive: NaN/Infinity guards. _mixed3dResetCameraTimer can fire
  // mid-frame (dt > 1000ms safety net at boot under saturation), and
  // any race that leaves t non-finite would propagate to getPointAt
  // and throw — freezing the renderer without freezing the mount
  // drain, which manifests as "lots of cells minted but only the
  // first ~3500 visible" because childN grows but no frame repaints.
  if (!Number.isFinite(t) || t < 0) t = 0;
  if (!S.swoopCam) {
    const G = S.geometry;
    const gridHalf = (G.towerCount - 1) / 2;
    const ringIdx = G.towerCount - 2; // outermost lane
    const lane = (i) => (i + 0.5 - gridHalf) * G.spacing;
    // One lane in from the outermost so the curve's rounded corners
    // don't graze perimeter towers.
    const lo = lane(1);
    const hi = lane(ringIdx - 1);
    const mid = lane(Math.floor(ringIdx / 2));
    // 8 waypoints around the field perimeter (4 corners + 4 mids),
    // with varied Y heights so the path threads the full tower height
    // (~0..17u) instead of orbiting at fixed eye-level y=4.5. Without
    // Y variation, tier-1 promotion (distance-based) only ever fires
    // on the bottom band of cells — top cells stay tier-2-decorative
    // because the camera never approaches them. With this helix-ish
    // path, the camera passes through every Y band over one ~9 min
    // loop, so tier-1 distribution evens out across the tower face.
    // Heights chosen to alternate high/low so adjacent waypoints
    // produce diagonal sections rather than long climbs/dives.
    // Centripetal Catmull-Rom + closed loop → seamless at every pass.
    const pts = [
      new T.Vector3(lo, 4.5, lo),
      new T.Vector3(mid, 11.0, lo),
      new T.Vector3(hi, 7.0, lo),
      new T.Vector3(hi, 13.0, mid),
      new T.Vector3(hi, 5.0, hi),
      new T.Vector3(mid, 10.0, hi),
      new T.Vector3(lo, 14.0, hi),
      new T.Vector3(lo, 8.0, mid),
    ];
    const curve = new T.CatmullRomCurve3(pts, true, "centripetal", 0.5);
    S.swoopCam = {
      curve,
      totalLen: curve.getLength(),
      speed: 0.5, // world units per second (halved further 2026-05-21 #152: at 1.0 the camera-arrival rate exceeded snap throughput (~17.7/s) so a stub backlog persisted in view. 0.5 cuts arrivals roughly in half. Original 4.0 was the pre-polish target.)
      headingHistory: [],
    };
  }
  const sw = S.swoopCam;
  if (!sw || !Number.isFinite(sw.totalLen) || sw.totalLen <= 0) return;
  // Arc-length parameterization plus a 10-second boot ease-in. The
  // speed multiplier ramps linearly from 0.3 to 1.0 over τ ∈ [0, 10],
  // then stays at 1.0. Closed-form integral of speed × multiplier
  // gives the cumulative arc-length traveled at time t — used as the
  // u parameter so the curve is sampled smoothly through the speed
  // ramp without an accumulator (which would need per-frame dt).
  // User 2026-05-03: "start the camera moving slow and steady for
  // maybe 10 seconds first".
  // Slow-scan scheduling. Every ~30–50s, decelerate to ~15% speed for
  // 7s, drift the camera laterally toward one side, and rotate lookAt
  // 90° to face that side's tower wall. Lets the user actually read
  // cells on a face during the swoop, and gives the rare cell-conf-high
  // pink-highlight cells a chance to scroll past as a "this one
  // matters" surprise. After scan completes, schedule the next.
  if (t < 10) {
    // skip scan during boot ease-in. After boot, scans fire ~every 8-14s
    // (forward-fly), giving roughly 50/50 wall-facing to corridor-flying
    // ratio. User 2026-05-20: "swing the camera around to face the tower
    // walls more often ... like visually scanning across a 2d dashboard".
    sw.scanNextStart = 6 + Math.random() * 4;
    sw.scanFactor = 0;
    sw.scanSide = 0;
  } else {
    if (sw.scanNextStart == null) sw.scanNextStart = t + 6 + Math.random() * 4;
    if (t >= sw.scanNextStart) {
      const dts = t - sw.scanNextStart;
      // 5s ramp in, 12s hold, 5s ramp out → 22s total scan window.
      // Was 2.5/12/2.5 (17s) but the 2.5s ramp swung the lookAt ~90°
      // in 2.5s = peak 36°/s visible yaw, which read as a fast
      // direction change. Doubling the ramp to 5s drops peak yaw to
      // ~18°/s, "impressively slow and intentional" (user 2026-05-23).
      // Longer hold
      // + lower scanMult floor below = camera glides past more cells
      // per scan, not just parks-and-vertical-pans on one slot.
      let f;
      if (dts < 5.0) f = dts / 5.0;
      else if (dts < 17.0) f = 1;
      else if (dts < 22.0) f = (22.0 - dts) / 5.0;
      else {
        f = 0;
        // 6-10s forward fly between scans (was 8-14s) — more frequent
        // wall passes per user 2026-05-22.
        sw.scanNextStart = t + 6 + Math.random() * 4;
        sw.scanSide = 0;
        sw.scanTargetCell = null;
        sw.scanTargetPos = null;
      }
      sw.scanFactor = Math.max(0, Math.min(1, f));
      // scanSide assignment moved below — deferred until perp is computed
      // so the cell-aware picker can choose deterministically.
    } else {
      sw.scanFactor = 0;
      sw.scanSide = 0;
      sw.scanTargetCell = null;
      sw.scanTargetPos = null;
    }
  }
  const scanFactor = sw.scanFactor || 0;
  const scanSide = sw.scanSide || 0;
  // Smoothstep ease for visual feel; raw linear ramp is harsh at the
  // ramp-in/out transitions.
  const sf = scanFactor * scanFactor * (3 - 2 * scanFactor);

  let arc;
  if (t < 10) {
    // ∫(0..t) speed * (0.3 + 0.07τ) dτ = speed * (0.3t + 0.035t²)
    arc = sw.speed * (0.3 * t + 0.035 * t * t);
    sw.lastT = t;
    sw.arcAccum = arc;
  } else {
    // dt accumulator so slow-scan can modulate speed without breaking
    // arc continuity. arcAccum carries the closed-form value at t=10
    // (= speed * 6.5) into linear-time territory.
    if (sw.lastT == null || sw.arcAccum == null) {
      sw.lastT = t;
      sw.arcAccum = sw.speed * 6.5;
    }
    const dtReal = Math.max(0, Math.min(0.1, t - sw.lastT));
    sw.lastT = t;
    // Don't fully park during scan — keep 40% arc speed so the camera
    // glides PAST the tower face (more cells slide into view) instead
    // of dollying vertically on one slot. User 2026-05-22 "do more
    // slow passes across tower faces so cells more clearly visible
    // as temporarily a 2D viz".
    const scanMult = 1 - sf * 0.6;
    // Curvature-aware speed: at sharp curve corners the heading-rate
    // (avgRate, computed downstream from the heading-window) spikes,
    // and at full speed=4 these read as fast yaws. Use the previous
    // frame's avgRate (cached on sw) to slow the arc here.
    // |avgRate| 0 → 1.0, 0.3 → 0.7, 0.7 → 0.3 floor (tightened
    // 2026-05-26 from coeff 0.6/floor 0.4 → coeff 1.0/floor 0.25).
    // Big camera swoops were reading as stutter on a 30fps capture
    // because the per-frame yaw delta exceeded the temporal sampling
    // window. Slowing the arc more aggressively during high-yaw
    // segments makes each captured frame's content less different from
    // the next — smoother apparent motion at any capture framerate.
    // User feedback 2026-05-04: "still a few fast turns too, yawing".
    // User 2026-05-26: "capture framerate is terrible... especially
    // during the big camera swoops".
    const lastAvgRate = sw.lastAvgRate || 0;
    const cornerMult = Math.max(0.25, 1 - Math.abs(lastAvgRate) * 1.0);
    sw.arcAccum += sw.speed * scanMult * cornerMult * dtReal;
    arc = sw.arcAccum;
  }
  const u = (arc % sw.totalLen) / sw.totalLen;
  if (!Number.isFinite(u)) return;
  let desiredPos;
  try {
    desiredPos = sw.curve.getPointAt(u);
  } catch (e) {
    // CatmullRomCurve3 can throw on degenerate cache state during
    // boot races. Skip this frame; render loop continues. Log once
    // so we notice if it persists.
    if (!S._swoopErr) {
      console.warn("[mixed3d] swoopy-tour curve.getPointAt failed at u=" + u + ":", e);
      S._swoopErr = true;
    }
    return;
  }
  if (!desiredPos) return;
  // Light Y bob layered on top of the curve's varied-Y heights —
  // keeps the small organic float without flattening the helix.
  desiredPos.y += Math.sin(t * 0.22) * 0.6;
  // Slow-scan vertical pan: during the hold, sweep camera Y from near
  // the top of the tower down to near the floor over the scan window.
  // Combined with the perpendicular lookAt and parked X/Z, this scans
  // the tower face top-to-bottom like reading a directory listing —
  // cells scroll by vertically, which is the literal Hackers FUI move
  // (see refs/gibson/monitor_directory_listing.png). towerH is 17u so
  // [14, 2] covers most of the face's vertical extent. lookAt.y is
  // computed downstream from desiredPos.y so it tracks automatically.
  if (scanFactor > 0) {
    const dts = t - (sw.scanNextStart || t);
    // Reduced Y range (was 14→2). The camera now also glides
    // horizontally past the wall (scanMult floor=0.4 above), so the
    // vertical pan is a secondary cue, not the primary reveal.
    const SCAN_Y_TOP = 11;
    const SCAN_Y_BOT = 5;
    // panU stretched to match the 22s scan window (5 + 12 + 5).
    const panU = Math.max(0, Math.min(1, dts / 22.0));
    let scanY = SCAN_Y_TOP - (SCAN_Y_TOP - SCAN_Y_BOT) * panU;
    // Altitude follows the scan target so the camera rises to face
    // high tower-top cells and drops to face low cells, instead of
    // staying at swoopy-altitude and craning up/down (which produced
    // straight-up looks when the target was a y=18 cell with cam at
    // y=4). User pref 2026-05-24: smooth altitude changes are fine
    // as long as pitch stays controlled.
    if (sw.scanTargetPos) {
      // Park the camera AT scan-target altitude so lookAt is near
      // horizontal — pitch stays minimal even on tower-top cells.
      // Clamp to floor+1 so it never dips into the ground.
      const targetCamY = Math.max(1, sw.scanTargetPos.y);
      scanY = scanY * 0.2 + targetCamY * 0.8;
    }
    desiredPos.y = desiredPos.y * (1 - sf) + scanY * sf;
  }
  const tan = sw.curve.getTangentAt(u);
  tan.y = 0;
  if (tan.lengthSq() < 1e-6) tan.set(1, 0, 0);
  else tan.normalize();
  // Perpendicular to tangent in XZ plane (rotate 90° CCW).
  // Used for both the slow-scan lateral drift AND the lookAt swing.
  const perpX = -tan.z;
  const perpZ = tan.x;
  // Slow-scan lateral drift: zero. Path sits in the corridor center,
  // (spacing - towerW)/2 = 3.5u from the chosen face — about right for
  // a 60° FOV on a towerW=5 face, with cells reading at ~1u wide. Any
  // shift TOWARD the wall (the previous +1.1u behavior) overcrops the
  // face; shift AWAY would move toward the OPPOSITE tower instead.
  // User feedback 2026-05-04: "the pan and look is currently a little
  // too close to the tower wall, can't read anything that's actually
  // there which is the point. to temporarily make it basically a 2d
  // dashboard again".
  const SCAN_LATERAL = 0;
  // Deferred scan-side decision: now that perp is computed, pick a
  // specific tier-1 cell with a cached snap to face this scan window.
  // Falls back to a random side when no good candidate (e.g. corridor
  // is empty, snaps not yet rendered).
  if (sw.scanFactor > 0 && !sw.scanSide) {
    const target = _mixed3dPickScanTarget(S, cam.position, tan, perpX, perpZ);
    if (target) {
      sw.scanSide = target.side;
      sw.scanTargetCell = target.id;
      sw.scanTargetPos = target.pos.clone();
    } else {
      sw.scanSide = Math.random() < 0.5 ? -1 : 1;
      sw.scanTargetCell = null;
      sw.scanTargetPos = null;
    }
  }
  desiredPos.x += perpX * scanSide * sf * SCAN_LATERAL;
  desiredPos.z += perpZ * scanSide * sf * SCAN_LATERAL;
  // Route-through bias (task #194): during the scan window, pull
  // desiredPos toward scanTargetPos's X/Z so the camera passes
  // through (or close to) the cell rather than just lookAt-ing it
  // from the corridor lane. Y stays on the curve so we don't dive
  // into the floor. Bias scaled by sf (so the camera coasts in
  // smoothly during ramp-in) and capped at ROUTE_MAX so we can't
  // cross into adjacent tower bboxes (corridor half-width is ~3.5u
  // tower-to-tower; 2.0u keeps a 1.5u safety margin).
  const ROUTE_MAX = 2.0;
  // Bias gate is just sf. A previous "fade-tail" extension was
  // implemented backwards: at the frame sf hit 0, the tail logic
  // reset biasGate back to 1.0 and ramped it down over 2s — which
  // *introduced* a single-frame discontinuity (jump from sf~0 to
  // biasGate=1) instead of smoothing the post-scan return. The 5s
  // smoothstep ramp on sf already carries the bias smoothly to 0
  // within the scan window itself.
  const biasGate = sf;
  // Bias toward an ideal VIEWING POINT in front of the cell's face —
  // not the cell position itself. The viewing point is the cell's
  // world position offset along its face normal by the FOV-fit
  // distance for its plane size plus a 50% reading margin. This:
  //   (a) keeps the camera head-on instead of glancing the face
  //       obliquely as the curve sweeps by;
  //   (b) automatically lands the bias target OUTSIDE the tower,
  //       so the route never wants to cross the wall;
  //   (c) auto-scales by colspan — wide colspan-6 cells get framed
  //       at ~3u rather than 1.5u.
  if (sw.scanTargetCell && biasGate > 0) {
    const tObj = S.cellObjects?.get(sw.scanTargetCell);
    if (tObj && !tObj.isInstanceHandle) {
      const pw = tObj.geometry?.parameters?.width || 1.0;
      const ph = tObj.geometry?.parameters?.height || 1.0;
      const aspect = (S.renderer?.domElement?.clientWidth || 16) / (S.renderer?.domElement?.clientHeight || 9);
      const tanV = Math.tan((75 * Math.PI / 180) / 2);
      const tanH = tanV * aspect;
      const fitDist = Math.max(ph / (2 * tanV), pw / (2 * tanH)) * 1.5;
      // Face normal: cell's local +Z, rotated into world space by
      // its yaw-only rotation. Same construction used by park.
      const n = new T.Vector3(0, 0, 1).applyEuler(tObj.rotation);
      const viewX = tObj.position.x + n.x * fitDist;
      const viewZ = tObj.position.z + n.z * fitDist;
      const bx = viewX - desiredPos.x;
      const bz = viewZ - desiredPos.z;
      const bMag = Math.sqrt(bx * bx + bz * bz);
      if (bMag > 0.01) {
        const want = bMag * biasGate * 0.5;
        const scale = Math.min(ROUTE_MAX, want) / bMag;
        desiredPos.x += bx * scale;
        desiredPos.z += bz * scale;
      }
    }
  }
  // Clamp the LERP TARGET first so the asymptote is always outside
  // any tower bbox. Without this, posActual could lerp toward an
  // interior desiredPos for several frames before the post-lerp
  // clamp snapped it back out — read as a discontinuous jolt at the
  // bbox edge. With the target clamped, the lerp asymptotically
  // approaches an outside point, posActual stays outside, and the
  // post-lerp clamp becomes a sanity net that rarely fires.
  _mixed3dClampOutsideTowers(desiredPos);
  if (!sw.posActual) sw.posActual = desiredPos.clone();
  const dt = 1 / 60;
  sw.posActual.lerp(desiredPos, Math.min(1, dt * 6.0));
  _mixed3dClampOutsideTowers(sw.posActual);
  cam.position.copy(sw.posActual);
  // LookAt: blend forward-tan gaze with perp-tan gaze based on scan
  // factor. At full scan, the camera looks 90° to the side at the
  // wall surface (~3.5u, which is path-to-face distance), so the
  // focal point sits ON the cell wall rather than past it. Was 6.0
  // before — that put the focal point 2.5u INSIDE the tower, which
  // read as "looking past the cells" and fought the eye's depth cues.
  //
  // Cell-aware override: when scanTargetPos is set, the perp focal
  // point is the cell's actual world position rather than a fixed
  // distance offset. The camera literally looks at the cell we know
  // has rendered content. The pos lerp + lookAt lerp keep the motion
  // smooth; the existing scan-Y vertical pan still operates as the
  // FUI scroll-down cue.
  const fwdLookAhead = 12.0;
  const perpLookAhead = 3.5;
  const fwdMix = 1 - sf;
  const perpMix = sf;
  // Refresh sw.scanTargetPos from the live cell each frame — cells
  // can re-pack/move between scan-start and scan-end, and we want the
  // lookAt to track the moving target rather than freeze on a stale
  // clone from scan-start.
  if (sw.scanTargetCell && S.cellObjects) {
    const live = S.cellObjects.get(sw.scanTargetCell);
    if (live?.position) sw.scanTargetPos = live.position.clone();
  }
  let lookAtTarget;
  if (sw.scanTargetPos) {
    lookAtTarget = new T.Vector3(
      cam.position.x + tan.x * fwdLookAhead * fwdMix + (sw.scanTargetPos.x - cam.position.x) * perpMix,
      cam.position.y * fwdMix + sw.scanTargetPos.y * perpMix,
      cam.position.z + tan.z * fwdLookAhead * fwdMix + (sw.scanTargetPos.z - cam.position.z) * perpMix,
    );
  } else {
    lookAtTarget = new T.Vector3(
      cam.position.x + tan.x * fwdLookAhead * fwdMix + perpX * scanSide * perpLookAhead * perpMix,
      cam.position.y,
      cam.position.z + tan.z * fwdLookAhead * fwdMix + perpZ * scanSide * perpLookAhead * perpMix,
    );
  }
  if (!sw.lookAtActual) sw.lookAtActual = lookAtTarget.clone();
  // 2.5 (was 5.0): doubles the lookAt time constant from 0.2s to 0.4s.
  // At Catmull-Rom corners the curve tangent rotates ~45° in <0.5s; a
  // fast lookAt lerp turns that into a visible 225°/s yaw spike (user
  // 2026-05-23 "still a fast yaw"). Slower catch-up smears the same
  // angular change across more frames, dropping peak visible yaw rate.
  sw.lookAtActual.lerp(lookAtTarget, Math.min(1, dt * 2.5));
  // Banking: sliding heading-rate window. Smooths C² discontinuities
  // at curve control points.
  sw.headingHistory.push({ time: t, heading: Math.atan2(tan.z, tan.x) });
  // Window must be SHORTER than a corner-pass duration for cornerMult
  // (line 4645) to actually engage. A 1.5s window smoothed spikes across
  // an entire corner transit (~0.3s) so avgRate read ~0.03 at peak yaw
  // and the brake never fired — verified via 1176-sample chrome MCP
  // probe 2026-05-23 (9% of samples > 30°/s yaw with lastAvgRate ≈ 0).
  // 0.3s lets avgRate spike at the actual corner timescale.
  const HEADING_WIN = 0.3;
  while (sw.headingHistory.length > 0 && t - sw.headingHistory[0].time > HEADING_WIN) {
    sw.headingHistory.shift();
  }
  let avgRate = 0;
  if (sw.headingHistory.length >= 2) {
    const first = sw.headingHistory[0];
    const last = sw.headingHistory[sw.headingHistory.length - 1];
    let dH = last.heading - first.heading;
    while (dH > Math.PI) dH -= 2 * Math.PI;
    while (dH < -Math.PI) dH += 2 * Math.PI;
    const dT = last.time - first.time;
    if (dT > 0.05) avgRate = dH / dT;
  }
  // Cache avgRate so the next frame's arc accumulator can use it for
  // curvature-aware speed reduction (corner slowdown).
  sw.lastAvgRate = avgRate;
  const BANK_K = 2.0; // happy medium
  // Boot ease-in: bank multiplier ramps from 0 → 1 over the first
  // 10 seconds after camera-timer reset (loader-fade or
  // bfcache/visibility restore). Without this, the camera enters
  // the very first curve corner with full bank applied
  // immediately, reading as a sudden tilt to the right at t=0
  // (user 2026-05-03 "on first load there's an immediate bank to
  // the right, we don't want that. just start the camera moving
  // slow and steady for maybe 10 seconds first"). The position
  // path itself stays linear so motion is steady.
  const easeIn = Math.min(1, t / 10);
  // Slow-scan suppresses banking — looking sideways at a tower face,
  // the user wants the wall to read level, not tilted.
  const bankTarget = avgRate * BANK_K * easeIn * (1 - sf);
  if (sw.bankActual == null) sw.bankActual = 0;
  sw.bankActual += (bankTarget - sw.bankActual) * 0.04;
  const bankedUp = new T.Vector3(0, 1, 0).applyAxisAngle(tan, sw.bankActual);
  cam.up.copy(bankedUp);
  // Altitude-aware downward bias: when the camera is high in the
  // helix path (yesterday's waypoints climb to Y=14), looking forward
  // horizontally fills the upper FOV with sky/ceiling. Tilt lookAt
  // down proportionally to camera height ABOVE a "comfort" altitude
  // so high passes look INTO the canyon below instead of across at
  // sky. Low passes (Y <= COMFORT_Y) get no bias and keep their
  // horizontal forward-look. User 2026-05-26: "spiral up to near top
  // of towers is fine, just don't stare up at the ceiling for
  // extended periods."
  const COMFORT_Y = 7;
  const TILT_DOWN_PER_Y = 0.45;
  if (cam.position.y > COMFORT_Y) {
    const excess = cam.position.y - COMFORT_Y;
    sw.lookAtActual.y -= excess * TILT_DOWN_PER_Y;
  }
  // Pitch clamp safety: cap the lookAt y so the resulting pitch never
  // exceeds ±MAX_PITCH_DEG, even if the position-bias lerp above
  // hasn't caught up to a sharply-different scan-target altitude.
  // Without this the lookAt aims straight at the sky (pitch 70°+)
  // during the transition from low-cell to high-cell scan targets
  // (user 2026-05-24 "camera path is looking almost straight up").
  const MAX_PITCH_DEG = 18;
  const dx = sw.lookAtActual.x - cam.position.x;
  const dz = sw.lookAtActual.z - cam.position.z;
  const horizDist = Math.sqrt(dx * dx + dz * dz);
  if (horizDist > 0.5) {
    const maxDy = horizDist * Math.tan((MAX_PITCH_DEG * Math.PI) / 180);
    const dy = sw.lookAtActual.y - cam.position.y;
    if (dy > maxDy) sw.lookAtActual.y = cam.position.y + maxDy;
    else if (dy < -maxDy) sw.lookAtActual.y = cam.position.y - maxDy;
  }
  cam.lookAt(sw.lookAtActual);
}

// Weave-grid: camera walks one of four cardinal headings at a
// constant speed along the lanes BETWEEN towers. Lanes are at
// x = (i + 0.5 - gridHalf) * spacing for i in 0..towerCount-2;
// lane intersections are 3-wide clear gaps between four surrounding
// towers. Camera snaps both axes to the nearest lane on every turn
// so a 90° change always produces a corridor-aligned trajectory
// (was clipping through columns when turns happened mid-lane —
// user 2026-05-02).
const _WEAVE_DIR_X = [0, 1, 0, -1]; // heading 0=N(-Z), 1=E(+X), 2=S(+Z), 3=W(-X)
const _WEAVE_DIR_Z = [-1, 0, 1, 0];
function _mixed3dLaneSnap(v) {
  const G = _mixed3dState.geometry;
  const gridHalf = (G.towerCount - 1) / 2;
  let i = Math.round(v / G.spacing - 0.5 + gridHalf);
  i = Math.max(0, Math.min(G.towerCount - 2, i));
  return (i + 0.5 - gridHalf) * G.spacing;
}
function _mixed3dDriveWeaveGrid(t) {
  const S = _mixed3dState;
  const G = S.geometry;
  const cam = S.camera;
  if (!S.weaveCam) {
    S.weaveCam = {
      x: _mixed3dLaneSnap(0),
      z: _mixed3dLaneSnap(0),
      heading: Math.floor(Math.random() * 4),
      lastT: t,
      nextTurnAt: t + 1.5 + Math.random() * 1.5,
      // Smooth heading interpolation so a 90° turn doesn't snap
      // the camera direction in one frame.
      headingTarget: 0,
      headingActual: 0,
    };
    S.weaveCam.headingTarget = S.weaveCam.heading * Math.PI / 2;
    S.weaveCam.headingActual = S.weaveCam.headingTarget;
  }
  const w = S.weaveCam;
  const dt = Math.max(0.0, Math.min(0.1, t - w.lastT));
  w.lastT = t;
  // Smooth turn: interpolate actual heading toward target over ~0.6s.
  // Take the shortest angular path so a +π/2 target from -π/2 actual
  // doesn't sweep all the way around.
  let dh = w.headingTarget - w.headingActual;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  w.headingActual += dh * Math.min(1, dt * 4);
  // Forward motion follows the discrete heading (not the smoothed one)
  // so we always travel along grid lanes; the smoothing is only for
  // visual yaw.
  const speed = G.spacing * 0.9;
  const dirX = _WEAVE_DIR_X[w.heading];
  const dirZ = _WEAVE_DIR_Z[w.heading];
  w.x += dirX * speed * dt;
  w.z += dirZ * speed * dt;
  // Edge handling: if we'd leave the grid, turn around toward center.
  // On any turn (incl. edge bounce), snap both axes to the lane grid
  // so the new heading is along an unblocked corridor.
  const halfField = ((G.towerCount - 1) / 2) * G.spacing;
  if (Math.abs(w.x) > halfField || Math.abs(w.z) > halfField) {
    w.heading = (w.heading + 2) % 4;
    w.headingTarget = w.heading * Math.PI / 2;
    w.nextTurnAt = t + 1.0;
    w.x = _mixed3dLaneSnap(w.x);
    w.z = _mixed3dLaneSnap(w.z);
  } else if (t > w.nextTurnAt) {
    const turn = Math.random() < 0.5 ? 1 : -1;
    w.heading = ((w.heading + turn) % 4 + 4) % 4;
    w.headingTarget = w.heading * Math.PI / 2;
    w.nextTurnAt = t + 1.5 + Math.random() * 2.5;
    w.x = _mixed3dLaneSnap(w.x);
    w.z = _mixed3dLaneSnap(w.z);
  }
  cam.position.set(w.x, 4 + Math.sin(t * 0.25) * 0.25, w.z);
  // Use the smoothed heading for lookAt so visual yaw blends, but
  // pin lookAt point ahead in the smoothed direction.
  const lookX = w.x + Math.cos(-w.headingActual + Math.PI / 2) * 8;
  const lookZ = w.z - Math.sin(-w.headingActual + Math.PI / 2) * 8;
  cam.lookAt(lookX, 4 + Math.sin(t * 0.4) * 0.2, lookZ);
}

function _mixed3dDriveDollyCanyon(t) {
  const cam = _mixed3dState.camera;
  const sweepHalf = ((_mixed3dState.geometry.towerCount - 1) / 2) * _mixed3dState.geometry.spacing;
  const period = 24;
  const phase = (t % period) / period;
  const tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
  const x = (tri * 2 - 1) * sweepHalf * 0.85;
  cam.position.x = x;
  cam.position.z = 9 + Math.sin(t * 0.25) * 1.6;
  cam.position.y = 8 + Math.sin(t * 0.18) * 0.5;
  const dir = phase < 0.5 ? 1 : -1;
  cam.lookAt(x + dir * 1.2, 8 + Math.sin(t * 0.31) * 0.6, 0);
}

// Sync DOM cells onto/off CSS3DObjects mounted on tower faces.
// Runs on initial mount and on every applyActiveLayout (livefeed
// append, eviction, session reset).
//
// Two subtleties:
//   1. Multi-stream / ?session=auto wraps cells inside .session-column
//      divs under #notebook, so the selector descends — direct-child
//      selector misses them.
//   2. CSS3DRenderer.render() moves a CSS3DObject's element from
//      #notebook into its own internal cameraElement on first render.
//      "Cell still exists" therefore can't be tested by checking
//      #notebook membership; once mounted, the element lives elsewhere.
//      Eviction is detected via Node.isConnected (false only when
//      removed from the document entirely, e.g. RAM-cap eviction or
//      scoped reset — exactly when we want to dispose).
// Paint a cell's title + type chip onto a small canvas, return as
// CanvasTexture. Side faces use 80×240 (matches slot 0.65×2.0 aspect);
// top face uses 192×192. Per-cell texture memory ≈ 80*240*4 = 77KB ×
// ~2K cells = ~150MB worst case (most cells get evicted before
// allocating). Replaces CSS3DObject for cells 2026-05-02 — DOM
// matrix3d writes were the perf + jitter bottleneck.
// Tier-2 procedural preview — THEMED AMBIENT ARCHETYPES. Read this
// contract before editing:
//
//   1. The role of this function is "give the viewer a sense that
//      something visual lives here" at corridor distance. Cells are
//      not legible from afar; the snap-driver paints over this with
//      the actual tier-1 visual once the camera approaches and tier-1
//      renders. (See #4 snap path; this fills the gap before that.)
//
//   2. Most substrates render as DECORATIVE TEXT (Eurostile-bold cyan
//      tokens, matching the canyon's decorative layer). User
//      2026-05-23: "I'd rather they just be decorative cells which
//      look really great" — explicit pivot away from substrate-shaped
//      previews after the xy-plot / graph archetypes read as
//      out-of-place. The two exceptions stayed because they read as
//      "data instruments" and integrate with the canyon aesthetic:
//
//        bars     : varied-height bars          (vega, treemap)
//        bar-meter: horizontal bar + notch      (gauge)
//        TEXT     : decorative cyan tokens      (everything else)
//
//   3. NEVER add ctype-specific shapes here trying to mirror the
//      tier-1 renderer. The gauge dial drift (2026-05-23, user
//      "still see circular gauges and I thought we switched to
//      square") happened exactly because tier-2 tried to be
//      faithful to a tier-1 dial shape. Tier-1 changed; tier-2
//      didn't. Hours lost.
//
//   4. If you change a tier-1 substrate shape, you should NOT have
//      to update this file. If you find yourself wanting to, ask
//      first: "does this break the archetype rule?" — usually the
//      tier-2 archetype is fine as-is and the drift is illusory.
//
// Hash the cell id for deterministic randomness so the same cell
// always paints the same.

// Token pool for the TEXT archetype — mirrors the canyon's decorative
// layer vocabulary (see _mixed3dBuildDecorativeLayer). Module-scope so
// both the tier-2 preview and the cell backdrop pick from the same
// pool — visual consistency.
const _MIXED3D_DECO_TOKENS = [
  // Status / state
  "STATUS", "READY", "BUFFER", "TARGET", "PASS", "CALL", "RESP",
  "ACTIVE", "IDLE", "BUSY", "WAIT", "DONE", "ABORT", "RETRY", "QUEUE",
  "FLUSH", "SYNC", "DRAIN", "FAULT", "TRACE", "GUARD", "SENTRY",
  // Compound block titles (varied flavor — not all "REPORTS")
  "COMPANY_STATUS", "TROPIC_REPORTS", "INSTRUMENTATION", "RECRUITMENT",
  "DOMAIN_HEAD_BLOCK", "MEMORY_FENCE_TABLE", "COMPOSITE_PLANTS",
  "SHIPPING_FORECASTS", "ANNUAL_BUDGETS", "GARBAGE", "PAYROLL",
  "FUEL_REPORTS", "GRID_STATUS", "NODE_CENSUS", "SECTOR_INDEX",
  "RELAY_QUEUE", "TEMP_LOGS", "VAULT_LEDGER", "FRAME_MANIFEST",
  "RING_BUFFER", "CIPHER_TABLE", "DECK_REGISTER", "CHANNEL_MAP",
  "TRACE_VECTORS", "SHARD_INDEX", "ANCHOR_LEDGER", "GLYPH_TABLE",
  // Opcodes / short labels
  "RX", "TX", "OK", "EXEC", "JMP", "RET", "MOV", "POP", "INIT", "RUN",
  "PUSH", "LOAD", "STORE", "XOR", "AND", "ORR", "NOP", "SYSCALL",
  "AUTH", "KEY", "HASH", "CHKSUM", "PROC", "SOCK", "RECV", "BIND",
  "HEAP", "STACK", "FRAME", "DRAM", "CACHE", "PIPE", "FIFO", "MMIO",
  "ICMP", "ARP", "DNS", "TLS", "GPU", "FPU", "INT", "FENCE", "ATOMIC",
  // Numerics
  "0xABCD", "0x00FE", "0xFF", "$0042", "1.4e3", "12.4ms", "0/1",
  "0xC0DE", "0xDEAD", "0xBEEF", "0xF00D", "0x0001", "0x7E57",
  "$00FF", "$1000", "2.5e-3", "47.2ms", "100/2", "64KB", "4MB",
  "1.21GW", "0.997", "+0.04", "-1.23",
  // Symbols
  "==", "->", "::", ">>", "+--", "|>", "<-", "~/", "!=", "&&", "||",
];

function _mixed3dPaintDecorativeText(ctx, x0, y0, w, h, rng, cyan) {
  // Eurostile-bold cyan token rows, ~4% purple highlight to match the
  // canyon decoratives. Five layout variants picked per-cell so a wall
  // of cells reads as varied at glance distance instead of one tiled
  // pattern — variety stays inside the decorative idiom (no
  // substrate-shaped drift, per user 2026-05-23). The variant pick is
  // deterministic via the same seeded rng as the token pick, so a
  // re-paint of the same cell paints the same way.
  const fontSize = Math.max(8, Math.min(14, Math.floor(h / 12)));
  ctx.font = `bold ${fontSize}px "Eurostile", "Share Tech Mono", "Courier New", monospace`;
  ctx.textBaseline = "top";
  const rowH = fontSize * 1.3;
  const xPad = 4;
  const variant = Math.floor(rng() * 5);
  const pickToken = () => _MIXED3D_DECO_TOKENS[Math.floor(rng() * _MIXED3D_DECO_TOKENS.length)];
  const colorFor = () => rng() < 0.04 ? "#9966ff" : cyan;

  if (variant === 0) {
    // V0 dense rows (original look — still common, kept as default).
    for (let y = y0 + 2; y + fontSize < y0 + h; y += rowH) {
      ctx.globalAlpha = 0.55 + rng() * 0.4;
      ctx.fillStyle = colorFor();
      ctx.fillText(pickToken(), x0 + xPad, y);
    }
  } else if (variant === 1) {
    // V1 sparse rows with horizontal rules every 3 lines — gives the
    // cell visual rhythm without showing a chart shape.
    let row = 0;
    for (let y = y0 + 2; y + fontSize < y0 + h; y += rowH * 1.6) {
      ctx.globalAlpha = 0.55 + rng() * 0.4;
      ctx.fillStyle = colorFor();
      ctx.fillText(pickToken(), x0 + xPad, y);
      row++;
      if (row % 3 === 0 && y + rowH < y0 + h) {
        ctx.strokeStyle = cyan;
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0 + xPad, y + rowH);
        ctx.lineTo(x0 + w - xPad, y + rowH);
        ctx.stroke();
      }
    }
  } else if (variant === 2) {
    // V2 two-column tokens — left column word-ish, right column
    // numeric-ish. Approximates the "label : value" terminal look
    // without committing to a specific data shape.
    const xL = x0 + xPad;
    const xR = x0 + w * 0.55;
    for (let y = y0 + 2; y + fontSize < y0 + h; y += rowH) {
      ctx.globalAlpha = 0.55 + rng() * 0.4;
      ctx.fillStyle = colorFor();
      ctx.fillText(pickToken(), xL, y);
      ctx.globalAlpha = 0.55 + rng() * 0.4;
      ctx.fillStyle = colorFor();
      ctx.fillText(pickToken(), xR, y);
    }
  } else if (variant === 3) {
    // V3 header block (3 lines of bigger tokens at top) then dense
    // rows below — gives a sense of structure without imitating a
    // specific substrate.
    const headerSize = Math.min(fontSize + 4, Math.floor(h / 8));
    ctx.font = `bold ${headerSize}px "Eurostile", "Share Tech Mono", "Courier New", monospace`;
    let y = y0 + 2;
    for (let i = 0; i < 3 && y + headerSize < y0 + h * 0.45; i++) {
      ctx.globalAlpha = 0.7 + rng() * 0.3;
      ctx.fillStyle = colorFor();
      ctx.fillText(pickToken(), x0 + xPad, y);
      y += headerSize * 1.25;
    }
    ctx.font = `bold ${fontSize}px "Eurostile", "Share Tech Mono", "Courier New", monospace`;
    y += rowH * 0.3;
    for (; y + fontSize < y0 + h; y += rowH) {
      ctx.globalAlpha = 0.5 + rng() * 0.35;
      ctx.fillStyle = colorFor();
      ctx.fillText(pickToken(), x0 + xPad, y);
    }
  } else {
    // V4 right-aligned tokens with leading dot-leader — readout look.
    ctx.textAlign = "right";
    for (let y = y0 + 2; y + fontSize < y0 + h; y += rowH) {
      const txt = pickToken();
      ctx.globalAlpha = 0.55 + rng() * 0.4;
      ctx.fillStyle = colorFor();
      ctx.fillText(txt, x0 + w - xPad, y);
      // Leading dot-leader to the left.
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = cyan;
      const dotCount = Math.max(2, Math.floor(w / (fontSize * 1.6)));
      for (let i = 0; i < dotCount; i++) {
        ctx.fillText(".", x0 + xPad + i * fontSize * 0.9, y);
      }
    }
    ctx.textAlign = "start";
  }
  ctx.globalAlpha = 1.0;
}

export function _mixed3dDrawCellPreview(ctx, cell, x0, y0, w, h, cyan, pink) {
  if (h < 12 || w < 12) return;
  let seed = 0;
  const id = cell.id || "x";
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) | 0;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const ctype = cell.dataset.cellType || "";
  // ARCHETYPE DISPATCH — only TWO substrate-shaped exceptions (bars,
  // bar-meter); everything else → decorative-text. User 2026-05-23:
  // "I'd rather they just be decorative cells which look really
  // great. maybe the bar charts are ok but not the xy plots".
  let archetype;
  if (ctype === "vega" || ctype === "treemap") archetype = "bars";
  else if (ctype === "gauge") archetype = "bar-meter";
  else archetype = "text"; // mermaid, force_graph, html, code, ascii,
                           // sparkline, timeline_ribbon, trajectory,
                           // coord_plot, animated_svg, image, default
  ctx.save();
  if (archetype === "text") {
    _mixed3dPaintDecorativeText(ctx, x0, y0, w, h, rng, cyan);
  } else if (archetype === "bars") {
    const N = 5 + Math.floor(rng() * 4);
    const bw = w / N - 1;
    ctx.fillStyle = cyan;
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < N; i++) {
      const bh = (0.25 + rng() * 0.7) * h;
      ctx.fillRect(x0 + i * (bw + 1), y0 + h - bh, bw, bh);
    }
  } else if (archetype === "bar-meter") {
    // Tier-2 decorative gauge: rectilinear bar+notch (matches the
    // tier-1 hackers gauge variant added 2026-05-23). The earlier
    // arc/needle dial read as "analog instrument from another
    // system" against the bold square tower text. User
    // 2026-05-23: "still see circular gauges and I thought we
    // switched to square".
    const bx0 = x0 + w * 0.1;
    const bx1 = x0 + w * 0.9;
    const by = y0 + h * 0.55;
    const bh = Math.max(3, h * 0.08);
    ctx.fillStyle = cyan;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(bx0, by - bh / 2, bx1 - bx0, bh);
    const fill = 0.25 + rng() * 0.65;
    ctx.fillStyle = cyan;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(bx0, by - bh / 2, (bx1 - bx0) * fill, bh);
    // Notch marker at the value position.
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.95;
    const nx = bx0 + (bx1 - bx0) * fill;
    ctx.beginPath();
    ctx.moveTo(nx, by - bh / 2 - 3);
    ctx.lineTo(nx, by + bh / 2 + 3);
    ctx.stroke();
    // Tick marks beneath.
    ctx.strokeStyle = cyan;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const tx = bx0 + (bx1 - bx0) * f;
      ctx.beginPath();
      ctx.moveTo(tx, by + bh / 2 + 1);
      ctx.lineTo(tx, by + bh / 2 + 4);
      ctx.stroke();
    }
  }
  ctx.restore();
}
// Restart the swoopy-tour camera state. Used at loader-fade, on
// bfcache restore (pageshow with persisted=true), and on R-key
// reset. Previously this nulled posActual and arcAccum, which made
// the next frame teleport: posActual was re-seeded from
// curve.getPointAt(0), camera jumped from wherever it was to the
// curve's t=0 waypoint (~1.6u jump observed in per-rAF trace 2026-
// 05-25). Now reset finds the closest-u to the current camera
// position and resumes there, seeding posActual at the current
// pose so the lerp asymptotes smoothly. Same logic _mixed3dUnpark
// uses for click-park exit.
function _mixed3dResetCameraTimer() {
  const S = _mixed3dState;
  if (!S) return;
  const sw = S.swoopCam;
  // Fresh-boot path: no curve yet → fall back to the old null-state
  // reset. The swoopy driver builds the curve on first call and the
  // boot ease-in (t<10) absorbs any initial cam-pose mismatch.
  if (!sw || !sw.curve || !Number.isFinite(sw.totalLen) || sw.totalLen <= 0) {
    S.animation.t0 = performance.now();
    if (sw) {
      sw.posActual = null;
      sw.lookAtActual = null;
      sw.headingHistory = [];
      sw.bankActual = 0;
      sw.scanFactor = 0;
      sw.scanSide = 0;
      sw.scanNextStart = null;
      sw.lastT = null;
      sw.arcAccum = null;
      sw.scanTargetCell = null;
      sw.scanTargetPos = null;
    }
    return;
  }
  // Closest-u search (matches _mixed3dUnpark). 256 uniform samples +
  // 6 binary refines = ~0.01% u precision, cheap one-shot.
  const T = window.THREE;
  const camP = S.camera.position;
  let bestU = 0;
  let bestD2 = Infinity;
  const N = 256;
  for (let i = 0; i < N; i++) {
    const u = i / N;
    const p = sw.curve.getPointAt(u);
    const dx = p.x - camP.x, dy = p.y - camP.y, dz = p.z - camP.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; bestU = u; }
  }
  let lo = Math.max(0, bestU - 1 / N);
  let hi = Math.min(1, bestU + 1 / N);
  for (let k = 0; k < 6; k++) {
    const mid = (lo + hi) / 2;
    const pl = sw.curve.getPointAt(Math.max(0, mid - 1e-4));
    const pr = sw.curve.getPointAt(Math.min(1, mid + 1e-4));
    const dl2 = (pl.x - camP.x) ** 2 + (pl.y - camP.y) ** 2 + (pl.z - camP.z) ** 2;
    const dr2 = (pr.x - camP.x) ** 2 + (pr.y - camP.y) ** 2 + (pr.z - camP.z) ** 2;
    if (dl2 < dr2) hi = mid; else lo = mid;
    bestU = (lo + hi) / 2;
  }
  // Back-date t0 past the 10s boot ease-in so we don't double-ease.
  S.animation.t0 = performance.now() - 11000;
  const tNow = 11.0;
  sw.arcAccum = bestU * sw.totalLen;
  sw.lastT = tNow;
  sw.lastAvgRate = 0;
  sw.headingHistory = [];
  sw.bankActual = 0;
  sw.scanFactor = 0;
  sw.scanSide = 0;
  sw.scanNextStart = tNow + 6 + Math.random() * 4;
  sw.scanTargetCell = null;
  sw.scanTargetPos = null;
  sw.posActual = S.camera.position.clone();
  if (T) {
    const fwd = new T.Vector3();
    S.camera.getWorldDirection(fwd);
    sw.lookAtActual = S.camera.position.clone().add(fwd.multiplyScalar(8));
  }
}

// Pick a tier-1 cell to anchor the next scan window on. "We made them,
// may as well let the user look at them" (user 2026-05-23). Filters to
// cells that (a) have a cached snap in _snapTexCache (so the user
// actually sees rendered content, not a stub), (b) are ahead of the
// camera along the path, (c) sit off to one side of the path so a
// side-scan can show them. Picks the closest matching cell; returns
// {id, pos, side} or null if no good candidate.
//
// `side` is +1 or -1 indicating which scan side faces this cell, so
// scanSide can be set deterministically instead of randomly.
function _mixed3dPickScanTarget(S, camPos, tan, perpX, perpZ) {
  if (!S?.cellObjects || !S._snapTexCache || !camPos) return null;
  let best = null;
  let bestD2 = Infinity;
  for (const [id, obj] of S.cellObjects) {
    if (obj.isInstanceHandle) continue;
    if (!S._snapTexCache.has(id)) continue;
    const p = obj.position;
    if (!p) continue;
    const dx = p.x - camPos.x;
    const dz = p.z - camPos.z;
    const fwd = dx * tan.x + dz * tan.z;
    if (fwd < 2 || fwd > 14) continue;
    const lat = dx * perpX + dz * perpZ;
    const absLat = Math.abs(lat);
    if (absLat < 1.5 || absLat > 8) continue;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = { id, pos: p, side: lat > 0 ? 1 : -1 };
    }
  }
  return best;
}

// Public reset: clears free-flight + park + mouselook state so the
// swoopy tour reclaims control. Without this, _userTookCamera stays
// true for the page session and the swoopy never re-engages — exactly
// the trap reported 2026-05-23 ("entered free-flying mode, can't
// exit"). Bound to R key, Escape, and exposed on window for JS callers.
window._mixed3dResetSwoopy = () => {
  const S = _mixed3dState;
  if (!S) return;
  S._userTookCamera = false;
  S._ffYaw = undefined;
  S._ffPitch = undefined;
  S._mouselookActive = false;
  if (window._mixed3dFreeFlightKeys) window._mixed3dFreeFlightKeys.clear();
  if (S._park && typeof window._mixed3dUnpark === "function") {
    window._mixed3dUnpark();
  }
  _mixed3dResetCameraTimer();
};

// bfcache restore: when the user navigates back via the browser back
// button, pageshow fires with persisted=true and the JS state is
// alive but performance.now() advanced while the page was cached.
// Reset the camera path so it doesn't try to catch up across the
// cache duration. Registered once globally; safe noop if no mixed3d
// world is active.
window.addEventListener("pageshow", (e) => {
  if (e.persisted && _mixed3dState) {
    _mixed3dResetCameraTimer();
  }
});

// Tab visibility: when the tab is hidden, browsers throttle or stop
// requestAnimationFrame entirely, but performance.now() keeps
// ticking. On return-to-visible, t = (now - t0) is much larger than
// the last actual frame so desiredPos jumps far ahead on the curve
// and the lerp catches up in a visible "speed gets weird" snap.
// Same fix as bfcache restore — reset to u=0 when the tab becomes
// visible again. We only reset on the visible→ track to avoid
// resetting when entering background.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && _mixed3dState) {
    _mixed3dResetCameraTimer();
  }
});

// LOD: distance-tier rendering. Tier 1 (close, < ~30u) cells get a
// unique 80×240 CanvasTexture with title + full substrate preview;
// tier 2 (far) cells get a unique 32×96 mini-texture — same substrate
// preview drawing but at small resolution, no title strip. Per-cell
// unique at both tiers means each far cell shows ITS content rather
// than a shared substrate stamp. Memory at 15000 cells: ~110MB GPU
// (vs ~1.1GB for 80×240-everywhere); the 5× cut comes from the
// resolution drop on far cells, not from sharing.
// Tightened 2026-05-21 (#152): was 30/35, but at camera speed 1.0 the
// arrival rate into the 30u radius exceeded snap throughput, leaving
// ~60 stub cells visible at any time. Pulling promote in to 22u
// halves the eligible-cells count; the hysteresis gap (22→26) still
// prevents thrash at the boundary.
// Widened 2026-05-24 (28/32): "still seem a little sparse" feedback
// — bumping the promote radius ~25% to expand the eligible-cells set
// while keeping the 4u hysteresis gap. Pairs with PROMOTE_BUDGET 2→4
// in the retier sweep so the larger eligible set actually gets
// promoted instead of just queued. Snap-cached cells paint instantly
// (no canvas re-render), so the cost mostly hits cells that haven't
// snapped yet.
// Bumped 2026-05-26 (28->36 / 32->40): user "I lerp toward them then
// promote to tier 1 but I expected them to promote earlier based on
// the camera path." Cells along the swoopy curve now flip to tier-1
// at 36u (was 28u), 8u sooner. Pairs naturally with the snap-driver's
// pre-render lead (TIER1_DIST_SQ * 1.4 = ~43u) so the cache is ready
// before the cell enters tier-1 range. 4u hysteresis gap preserved.
const _MIXED3D_TIER1_DIST_SQ = 36 * 36;
const _MIXED3D_TIER2_DIST_SQ = 40 * 40;
const _MIXED3D_TIER1_CAP = 400;
const _MIXED3D_RETIER_BUDGET_MS = 4;

// Hysteresis: cells must move out past TIER2_DIST to demote, in past
// TIER1_DIST to promote. Prevents thrash for cells parked near the
// boundary as camera jitters.
function _mixed3dPickTierForPos(meshPos, camPos, currentTier) {
  const dx = meshPos.x - camPos.x;
  const dy = meshPos.y - camPos.y;
  const dz = meshPos.z - camPos.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (currentTier === 1) {
    return d2 > _MIXED3D_TIER2_DIST_SQ ? 2 : 1;
  } else {
    return d2 < _MIXED3D_TIER1_DIST_SQ ? 1 : 2;
  }
}

// Swap a cell's material between unique (tier 1) and shared (tier 2).
// Demote: dispose unique mat+tex. Promote: paint a fresh CanvasTexture
// + new material; the old shared material is left alone (other cells
// still reference it).
function _mixed3dSwapCellTier(obj, id, newTier, cyan, pink) {
  const S = _mixed3dState;
  if (!S) return;
  const T = window.THREE;
  const cell = obj.userData?.cellEl;
  if (!cell) return;
  const oldTier = obj.userData.tier || S.cellTier.get(id) || 2;
  if (oldTier === newTier) return;
  const substrate = cell.dataset.cellType || "html";
  const isTop = Math.abs(obj.rotation.x + Math.PI / 2) < 0.01;

  // Tier 1 holds unique materials, tier 2 holds shared ones. Only
  // dispose when we're moving away from a UNIQUE material (i.e.
  // demoting 1 → 2). Promotion 2 → 1 doesn't dispose the shared
  // outgoing material because other cells of the same substrate
  // still reference it.
  if (oldTier === 1 && obj.material) {
    if (obj.material.map) obj.material.map.dispose();
    obj.material.dispose();
  }
  if (newTier === 1) {
    // Gate promotion on cache presence — never show a tier-1 cell
    // without its real rendered content. Without a cache hit we leave
    // the cell as tier-2 (shared decorative material) and let the
    // snap-driver render+cache it. The next retier sweep will then
    // see the cache and complete the promotion. User 2026-05-22:
    // "i just want the rendered cells to be rendered before they're
    // on camera period."
    const cachedSnap = _mixed3dSnapCacheGet(S, id);
    if (!cachedSnap) {
      // Cache miss: don't promote. Stays tier-2 (visually the
      // decorative bed); snap-driver picks it up via the cache-miss
      // search below (modified to include in-range tier-2 cells).
      return;
    }
    // Build CanvasTexture directly from the cached canvas — don't go
    // through _mixed3dCellTexture which constructs a placeholder
    // canvas at potentially mismatched dimensions, then reassigns
    // image. Mismatched constructor dimensions vs cached canvas
    // dimensions caused only the top region (title) to upload to
    // GPU; body region was sampling outside the original placeholder
    // bounds → blank. User 2026-05-22 "blank" on cell-4271 etc.
    const tex = new T.CanvasTexture(cachedSnap);
    tex.minFilter = T.LinearFilter;
    tex.magFilter = T.LinearFilter;
    // Force GPU upload BEFORE the material swap so the very next
    // render samples the actual texture instead of default-1×1-white.
    if (S.renderer?.initTexture) {
      try { S.renderer.initTexture(tex); } catch (_) {}
    }
    obj.material = new T.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 1.0,
      // DoubleSide so cells stay visible when the camera sees them
      // through the opposite face of their tower (or through an
      // adjacent transparent tower). Without this, back-facing tier-1
      // cells were invisible and whole towers read as empty when
      // viewed from behind. Texture appears horizontally mirrored on
      // the reverse side, which is acceptable at ambient viewing
      // distance through tinted glass.
      side: T.DoubleSide,
      depthWrite: false,
    });
    S.tier1Count = (S.tier1Count || 0) + 1;
  } else {
    // Demote 1->2. Pick a shared variant from the (substrate, cs)
    // bucket. The per-cs variant has the right aspect baked in (no
    // horizontal stretch like the cs=1 variant applied to wide planes
    // produced) AND uses ctx.scale(2,2) so text weight matches cs=1
    // shared cells. Replaces the per-cell _mixed3dCellTextureMini path
    // entirely — that abstraction was the wrong primitive (user
    // 2026-05-26: "why is a tier 2 cell harder than just filling with
    // actual decorative cells").
    const cs = obj.userData?.colspan || 1;
    obj.material = _mixed3dPickSharedMat(S, cell, cs)
      || S.sharedSubstrateMats?.get("html:1")?.[0];
    S.tier1Count = Math.max(0, (S.tier1Count || 0) - 1);
  }
  obj.userData.tier = newTier;
  S.cellTier.set(id, newTier);
}

// Promote a tier-2 instance handle into a tier-1 Mesh in place.
// Pops the cell out of the InstancedMesh (swap-and-pop, existing
// helper) and rebuilds it as a unique-material Mesh using the mount
// metadata stashed when the instance was first added. Replaces the
// handle in cellObjects so subsequent re-tier sweeps treat it as a
// regular Mesh — meaning later demotion 1→2 goes through the standard
// _mixed3dSwapCellTier path (back to a shared mat on a Mesh, not back
// into an InstancedMesh slot — keeping the demote side simple).
function _mixed3dPromoteInstanceToTier1(handle, id, cyan, pink) {
  const S = _mixed3dState;
  if (!S) return null;
  const T = window.THREE;
  const cell = handle.userData?.cellEl;
  if (!cell) return null;
  // Stashed mount metadata is required. Older instance handles created
  // before this field was stashed have undefined mountTx — skip those
  // (they'll just stay tier-2 forever, same as the prior behavior).
  if (handle.mountTx == null) return null;
  _mixed3dRemoveTier2Instance(S, handle);
  const isTop = !!handle.mountIsTop;
  const cs = handle.userData?.colspan || 1;
  // Same placeholder-dimension-mismatch bug fix as
  // _mixed3dSwapCellTier (commit e317751) — build texture directly
  // from cached canvas. Without cache hit, fall through to the stub
  // (also has correct dimensions because _mixed3dPaintPromoteStub
  // matches canvas size from cellData/colspan/canvasH).
  const cachedSnap = _mixed3dSnapCacheGet(S, id);
  let tex;
  if (cachedSnap) {
    tex = new T.CanvasTexture(cachedSnap);
  } else {
    const stub = _mixed3dPaintPromoteStub(id, state.rendering.cellsById?.get(id), handle?.userData?.colspan || 1, handle?.userData?.canvasH);
    tex = stub ? new T.CanvasTexture(stub) : _mixed3dCellTexture(cell, isTop, cyan, pink, cs, handle.userData?.canvasH);
  }
  tex.minFilter = T.LinearFilter;
  tex.magFilter = T.LinearFilter;
  // Pre-upload to GPU before the material sees this texture, so the
  // first render with the new mesh samples real content not white.
  if (S.renderer?.initTexture) {
    try { S.renderer.initTexture(tex); } catch (_) {}
  }
  const mat = new T.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 1.0,
    // DoubleSide — see comment in _mixed3dSwapCellTier. Required for
    // back-of-tower visibility through transparent glass.
    side: T.DoubleSide,
    depthWrite: false,
  });
  const planeGeo = _mixed3dGetSharedPlaneGeo(handle.mountPlaneW, handle.mountPlaneH);
  const obj = new T.Mesh(planeGeo, mat);
  obj.position.set(handle.mountTx, handle.mountTy, handle.mountTz);
  obj.rotation.set(handle.mountRotX, handle.mountRotY, 0);
  obj.frustumCulled = true;
  obj.userData.cellEl = cell;
  obj.userData.tier = 1;
  obj.userData.colspan = cs;
  obj.userData.canvasW = handle.userData?.canvasW;
  obj.userData.canvasH = handle.userData?.canvasH;
  S.scene.add(obj);
  S.cellObjects.set(id, obj);
  S.cellTier.set(id, 1);
  S.tier1Count = (S.tier1Count || 0) + 1;
  return obj;
}

// Per-frame re-tier sweep. Walks a slice of cells, checks if their
// camera-distance bucket has changed, swaps material if so. Bounded
// by _MIXED3D_RETIER_BUDGET_MS so promotions (which run a full canvas
// paint) can't stall the frame. Round-robins across all cells in
// _retierKeys; refreshes the snapshot when one cycle completes.
function _mixed3dRetierSweep() {
  const S = _mixed3dState;
  if (!S || !S.cellObjects) return;
  const T = window.THREE;
  if (!T) return;
  if (!S._retierKeys || S._retierIdx >= S._retierKeys.length) {
    // Sort by recency so cells with newer timestamps are visited first
    // per sweep. Combined with the distance gate + PROMOTE_BUDGET=2,
    // this biases the 400-cell tier-1 set toward the freshest cells
    // the camera passes (user 2026-05-19: "whatever the camera is
    // looking at or about to look at is as usefully relevant and
    // recent as possible"). Cells without a timestamp fall to the
    // back (-Infinity).
    const keys = [...S.cellObjects.keys()];
    const recencyOf = (id) => {
      const obj = S.cellObjects.get(id);
      const el = obj && obj.userData && obj.userData.cellEl;
      if (!el) return -Infinity;
      const ts = el.dataset && el.dataset.timestamp;
      if (!ts) return -Infinity;
      const n = Date.parse(ts);
      return Number.isFinite(n) ? n : -Infinity;
    };
    keys.sort((a, b) => recencyOf(b) - recencyOf(a));
    S._retierKeys = keys;
    S._retierIdx = 0;
  }
  if (S._retierKeys.length === 0) return;
  const camPos = S.camera.position;
  const cyan = S.colorCache?.cyan || "#00ddff";
  const pink = S.colorCache?.pink || "#ff3a8c";
  const start = performance.now();
  // Split budgets: demotions (1→2) just swap material refs and dispose
  // — cheap, ~0.1ms each. Promotions (2→1) paint a unique 80×240
  // CanvasTexture, ~2ms each, and a burst stalls the frame. Walk many
  // cells per frame to catch all demotions, but cap promotions.
  // 2 → 4 (2026-05-24, 28u radius)
  // 4 → 12 → 6 (2026-05-26): bumped to 12 to chase the 36u promote
  //   radius but worst-case 24ms/frame stall during dense fly-through
  //   manifested as visible stutter on screen capture. Compromise at
  //   6 keeps 50% throughput headroom over the original 4 while
  //   halving the worst-case stall to ~12ms (under the 16.67ms 60fps
  //   frame budget). Cells along the path still promote faster than
  //   pre-bump; cells right at the edge of the 36u radius rely on the
  //   snap cache being warm (which warmup pre-renders).
  const PROMOTE_BUDGET = 6;
  let promotesDone = 0;
  let i = S._retierIdx;
  while (i < S._retierKeys.length) {
    if (i > S._retierIdx && performance.now() - start > _MIXED3D_RETIER_BUDGET_MS) break;
    const id = S._retierKeys[i++];
    const obj = S.cellObjects.get(id);
    if (!obj) continue;
    // Tier-2 instanced handle: promote to tier-1 Mesh when the camera
    // is close enough. Once promoted the entry becomes a regular Mesh
    // and the next sweeps go through the standard 1↔2 swap path. Read
    // world position from the InstancedMesh matrix since handles
    // don't carry a `position` field.
    if (obj.isInstanceHandle) {
      const inst = S.tier2InstancedMeshes.get(obj.meshKey);
      if (!inst) continue;
      const m4 = new T.Matrix4();
      inst.mesh.getMatrixAt(obj.idx, m4);
      const pos = new T.Vector3().setFromMatrixPosition(m4);
      const desired = _mixed3dPickTierForPos(pos, camPos, 2);
      if (desired !== 1) continue;
      if ((S.tier1Count || 0) >= _MIXED3D_TIER1_CAP) continue;
      if (promotesDone >= PROMOTE_BUDGET) continue;
      const promoted = _mixed3dPromoteInstanceToTier1(obj, id, cyan, pink);
      if (promoted) promotesDone++;
      continue;
    }
    const cur = obj.userData.tier || S.cellTier.get(id) || 2;
    const desired = _mixed3dPickTierForPos(obj.position, camPos, cur);
    if (desired === cur) continue;
    if (desired === 1) {
      if ((S.tier1Count || 0) >= _MIXED3D_TIER1_CAP) continue;
      if (promotesDone >= PROMOTE_BUDGET) continue;
      promotesDone++;
    }
    _mixed3dSwapCellTier(obj, id, desired, cyan, pink);
  }
  S._retierIdx = i;
}

// Geometry cache: cells share PlaneGeometry instances bucketed by
// (width, height) at 0.05u resolution. The mount path called
// `new T.PlaneGeometry(...)` 14000+ times per saturation drain,
// each producing a fresh BufferGeometry + Float32Arrays — that
// alloc churn is what created the multi-second GC pauses visible
// as "frame stall: 5011ms" entries in the saturation console log.
// At 5 cells/col × 24 cols × 100 towers = 12000 cells with heights
// in ~1.4u-4u and slotW=0.833 fixed, the cache settles at ~50-80
// unique geometries — a >150× cut on alloc.
function _mixed3dGetSharedPlaneGeo(w, h) {
  const S = _mixed3dState;
  if (!S) return new window.THREE.PlaneGeometry(w, h);
  if (!S.sharedGeometries) S.sharedGeometries = new Map();
  const wKey = Math.round(w * 20) / 20;
  const hKey = Math.round(h * 20) / 20;
  const key = wKey + "x" + hKey;
  let geo = S.sharedGeometries.get(key);
  if (!geo) {
    geo = new window.THREE.PlaneGeometry(wKey, hKey);
    S.sharedGeometries.set(key, geo);
  }
  return geo;
}

// Build shared per-substrate materials for tier-2 cells. 13
// substrates × 12 variants = 156 unique materials, one CanvasTexture
// each. Each variant draws a different random sample of the
// substrate-typical preview so cells of the same type don't all
// look bit-identical from a distance. Total GPU memory ≈ 156 ×
// 28KB ≈ 4.4MB — flat, doesn't grow with cell count.
const _MIXED3D_VARIANTS_PER_SUBSTRATE = 12;
const _MIXED3D_SUBSTRATES = [
  "mermaid", "html", "timeline_ribbon", "animated_svg", "force_graph",
  "vega", "treemap", "gauge", "sparkline", "trajectory",
  "text", "code", "image",
];
// Build ONE (substrate, cs, variant) shared material. Extracted so the
// chunked drainer below can build them progressively across frames.
// cs (colspan) lets wide cells use shared variants too — instead of
// per-cell unique canvases that drifted to wrong text scales as the
// canvas dim formula tuned. With per-cs shared variants AND the same
// ctx.scale(2,2) + same drawCellPreview body proportions, text
// renders at the same visual weight regardless of cs.
function _mixed3dBuildOneSharedMat(cyan, pink, substrate, v, cs) {
  const T = window.THREE;
  cs = Math.max(1, cs || 1);
  const canvas = document.createElement("canvas");
  // 192x576 baseline for cs=1; W scales with cs for wider planes so the
  // texture aspect tracks the typical wide-cell plane aspect.
  // ctx.scale(2,2) gives 2px stroke weight at the design level,
  // matching the decorative tier's stroke weight (user 2026-05-19).
  canvas.width = 192 * cs;
  canvas.height = 576;
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);
  // No bg fill — canvas stays fully transparent.
  const fakeCell = {
    id: `__shared:${substrate}:c${cs}:${v}`,
    dataset: { cellType: substrate },
    querySelector: () => null,
  };
  // Body region scales horizontally with cs. Design space after
  // ctx.scale(2,2) is (96*cs) × 288. Pad 4px each side.
  _mixed3dDrawCellPreview(ctx, fakeCell, 4, 4, 96 * cs - 8, 280, cyan, pink);
  const tex = new T.CanvasTexture(canvas);
  tex.minFilter = T.LinearFilter;
  tex.magFilter = T.LinearFilter;
  return new T.MeshBasicMaterial({
    map: tex,
    // Transparent pass alpha-blend. Earlier alphaTest:0.5 attempt
    // produced near-blank cells for most substrates — canvas-alpha
    // probe (2026-05-03) showed mermaid 1.8%, html 0.0%, gauge 1.1%
    // pixels above the 0.5 threshold. With the tier-2 instancing
    // landed below, the back-to-front sort sees ~156 InstancedMesh
    // objects (one per substrate × variant) instead of ~12000
    // individual cells, so the sort is cheap again.
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    side: T.DoubleSide,
  });
}

// Chunked drainer: builds the sharedSubstrateMats Map progressively,
// 5ms of work per rAF tick, until all 156 (substrate × variant) pairs
// are built. Replaces the old monolithic build that ran inside
// applyMixed3DLayout and contributed ~1.5s to the boot-time longtask.
// Variants are interleaved (v=0 across all substrates first, then v=1,
// etc.) so every substrate has at least one variant available after
// the first tick.
function _mixed3dDrainMatBuilder(cyan, pink) {
  const S = _mixed3dState;
  if (!S || !S.matBuilderQueue) return;
  const start = performance.now();
  let built = 0;
  while (S.matBuilderQueue.length > 0) {
    if (built > 0 && performance.now() - start > 5) break;
    const { sub, v, cs } = S.matBuilderQueue.shift();
    const mat = _mixed3dBuildOneSharedMat(cyan, pink, sub, v, cs);
    const arr = S.sharedSubstrateMats.get(`${sub}:${cs}`);
    if (arr) arr.push(mat);
    built++;
  }
  if (S.matBuilderQueue.length > 0) {
    requestAnimationFrame(() => _mixed3dDrainMatBuilder(cyan, pink));
  }
}

// Pick a deterministic variant from a cell id + colspan, so cells with
// the same id always get the same look (avoids flicker on re-mount).
function _mixed3dPickSharedMat(S, cell, cs) {
  const info = _mixed3dPickSharedMatVariantIdx(S, cell, cs);
  return info ? info.mat : null;
}

// Same as above but returns (substrate, cs, variantIdx) too — needed
// by the tier-2 instancing path so cells of the same (substrate, cs,
// variant) group into one InstancedMesh. Wide cells (cs>=2) get their
// own per-cs variant set so text scale stays consistent with cs=1
// cells (same ctx.scale(2,2), same drawCellPreview body proportions).
// Falls back through cs progression and finally to html:1 if a bucket
// hasn't been built yet (chunked drainer still running).
function _mixed3dPickSharedMatVariantIdx(S, cell, cs) {
  const requested = cell.dataset?.cellType || "html";
  const csClamped = Math.max(1, Math.min(6, cs || 1));
  const tries = [
    [requested, csClamped],
    [requested, 1],
    ["html", csClamped],
    ["html", 1],
  ];
  let variants = null, substrate = requested, csUsed = csClamped;
  for (const [sub, c] of tries) {
    const key = `${sub}:${c}`;
    const arr = S.sharedSubstrateMats?.get(key);
    if (arr && arr.length) {
      variants = arr;
      substrate = sub;
      csUsed = c;
      break;
    }
  }
  if (!variants) return null;
  let h = 0;
  const id = cell.id || "";
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % variants.length;
  return { mat: variants[idx], variantIdx: idx, substrate, cs: csUsed };
}

// Tier-2 instancing helpers. Average bucket fill is ~12100/156 ≈ 78
// at full saturation; capacity 300 absorbs hash skew. Cells that
// would overflow a bucket fall through to the per-cell Mesh fallback
// path (still works, just doesn't get the instancing benefit for
// those cells).
const _MIXED3D_INST_CAPACITY = 300;

function _mixed3dGetTier2InstMesh(S, mat, substrate, variantIdx, cs) {
  const T = window.THREE;
  const csKey = cs || 1;
  const key = `${substrate}:c${csKey}:${variantIdx}`;
  let inst = S.tier2InstancedMeshes.get(key);
  if (inst) return inst;
  const mesh = new T.InstancedMesh(S.unitPlaneGeo, mat, _MIXED3D_INST_CAPACITY);
  mesh.count = 0;
  // Per-mesh frustum culling disabled — once the canyon is full,
  // every InstancedMesh has at least some visible instance, so
  // mesh-level culling rarely helps. The GPU's vertex stage clips
  // off-screen instances per-fragment for free, and total instance
  // count is trivial (~12100 quads ≈ 50k verts).
  mesh.frustumCulled = false;
  mesh.userData.tier2Group = key;
  S.scene.add(mesh);
  inst = { mesh, count: 0, capacity: _MIXED3D_INST_CAPACITY, key, cellAtIdx: [] };
  S.tier2InstancedMeshes.set(key, inst);
  return inst;
}

// Deterministic per-cell tint seed. Hash the cell id to a [0, 1) float.
// Used by tier-2 instance fill to break the "every cell looks identical"
// effect — without this, all instances of a given (substrate, variant)
// pair shared the InstancedMesh material's single CanvasTexture and
// read as duplicates across the canyon.
function _mixed3dCellTintSeed(cellId) {
  let h = 0x811c9dc5;
  const s = String(cellId);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h & 0xffffff) / 0xffffff;
}

const _MIXED3D_INST_COLOR = (() => {
  const T = window.THREE;
  return T ? new T.Color() : null;
})();

function _mixed3dAddTier2Instance(S, inst, cellId, tx, ty, tz, rotX, rotY, scaleW, scaleH) {
  if (inst.count >= inst.capacity) return -1;
  const T = window.THREE;
  const m = new T.Matrix4();
  const e = new T.Euler(rotX, rotY, 0, "XYZ");
  const q = new T.Quaternion().setFromEuler(e);
  const p = new T.Vector3(tx, ty, tz);
  const s = new T.Vector3(scaleW, scaleH, 1);
  m.compose(p, q, s);
  const idx = inst.count;
  inst.mesh.setMatrixAt(idx, m);
  // Per-instance multiplicative tint, seeded by cellId. setColorAt
  // multiplies with the material's base/texture color so we get
  // brightness + slight RGB jitter without per-cell unique textures.
  // Range: brightness 0.7 - 1.15, RGB jitter ±0.10. Channels biased
  // toward the cyan/magenta palette to stay in theme.
  const seed = _mixed3dCellTintSeed(cellId);
  const seed2 = _mixed3dCellTintSeed(cellId + ":g");
  const seed3 = _mixed3dCellTintSeed(cellId + ":b");
  const bright = 0.7 + seed * 0.45;
  const tint = _MIXED3D_INST_COLOR || new T.Color();
  tint.setRGB(
    bright + (seed2 - 0.5) * 0.20,
    bright + (seed3 - 0.5) * 0.20,
    bright + (seed - 0.5) * 0.20,
  );
  inst.mesh.setColorAt(idx, tint);
  inst.count++;
  inst.mesh.count = inst.count;
  inst.cellAtIdx[idx] = cellId;
  inst.mesh.instanceMatrix.needsUpdate = true;
  if (inst.mesh.instanceColor) inst.mesh.instanceColor.needsUpdate = true;
  return idx;
}

// Swap-and-pop removal: O(1) regardless of position. Moves the last
// instance into the evicted slot, updates the moved cell's handle so
// its idx points to the new slot, shrinks count by 1.
function _mixed3dRemoveTier2Instance(S, handle) {
  const inst = S.tier2InstancedMeshes.get(handle.meshKey);
  if (!inst || inst.count === 0) return;
  const T = window.THREE;
  const lastIdx = inst.count - 1;
  if (handle.idx !== lastIdx) {
    const m = new T.Matrix4();
    inst.mesh.getMatrixAt(lastIdx, m);
    inst.mesh.setMatrixAt(handle.idx, m);
    // Carry per-instance color along with the moved instance; without
    // this swap, the evicted instance's color persists at handle.idx
    // and the moved cell adopts a stranger's tint.
    if (inst.mesh.instanceColor) {
      const c = _MIXED3D_INST_COLOR || new T.Color();
      inst.mesh.getColorAt(lastIdx, c);
      inst.mesh.setColorAt(handle.idx, c);
    }
    const movedCellId = inst.cellAtIdx[lastIdx];
    if (movedCellId) {
      const movedHandle = S.cellObjects.get(movedCellId);
      if (movedHandle && movedHandle.isInstanceHandle) {
        movedHandle.idx = handle.idx;
      }
      inst.cellAtIdx[handle.idx] = movedCellId;
    }
  }
  inst.cellAtIdx[lastIdx] = undefined;
  inst.cellAtIdx.length = lastIdx;
  inst.count--;
  inst.mesh.count = inst.count;
  inst.mesh.instanceMatrix.needsUpdate = true;
  if (inst.mesh.instanceColor) inst.mesh.instanceColor.needsUpdate = true;
}

// Tier-2 mini-texture. No title, no glyph — just the substrate's
// own preview drawing at small resolution. Far cells then read as
// "tiny dim cells" instead of billboards. Per-cell unique (so each
// cell shows ITS content, not a substrate-class stamp).
//
// Background is fully OPAQUE here (not rgba 0.78). Rationale: tier-2
// is the bulk path — at saturation ~6500 cells visible. Transparent
// materials go through Three.js's transparent pass (sorted by depth,
// no early-Z cull). Pre-baking the dim-cyan-tint into the canvas bg
// lets us run tier-2 in the opaque pass — depth-tested, no sort,
// huge per-frame savings. The glass-tower-behind look is preserved
// because the tinted bg already approximates that.
function _mixed3dCellTextureMini(cell, isTop, cyan, pink, colspan, planeW, planeH) {
  const T = window.THREE;
  // Side cells: canvas sized to match the cell's plane aspect at ~80
  // canvas-px per plane-unit. Was 48*cs × 144 (fixed 2:1 aspect)
  // regardless of plane shape, which stretched decorative text
  // vertically on near-square planes (e.g. cs=6 with 3.7×3.7 plane:
  // 288×144 canvas mapped to square plane → 2x vertical stretch,
  // text glyphs read as thin vertical bars at distance — user
  // 2026-05-26 cell-5451 case). When planeW/planeH not provided,
  // falls back to the old fixed dims.
  const cs = Math.max(1, colspan || 1);
  let W, H;
  if (isTop) {
    W = 96; H = 96;
  } else if (planeW && planeH) {
    // 200 canvas-px per plane-unit — matches the shared cs=1 variant's
    // ratio (192/0.83 ≈ 230 X, 576/2.78 ≈ 207 Y). The first pass at
    // 80 px/u (commit 54f8c72) gave correct ASPECT but ~3x too low
    // resolution, so 14px decorative text appeared ~3x larger relative
    // to plane than its shared cs=1 counterpart. Bumping to 200
    // matches text-per-plane-unit across narrow and wide tier-2 cells.
    // Memory: cs=2 cells (plane ~1.25x2.8) → 250x560 = 561KB.
    // cs=6 cells (plane ~3.7x4.25) → capped at 576x576 = 1.3MB.
    // ~300 wide-cs2 + ~100 wide-cs6 = ~300MB total worst-case.
    // Bg decorative-cell oversize regression caught 2026-05-26 (cell-5983);
    // the per-unit budget below is the fix.
    const PX_PER_U = 200;
    W = Math.max(48, Math.min(576, Math.round(planeW * PX_PER_U)));
    H = Math.max(96, Math.min(576, Math.round(planeH * PX_PER_U)));
  } else {
    W = 48 * cs;
    H = 144;
  }
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  // No bg fill, no border, no accent strip — etched-glass look.
  // Substrate-preview marks render with alpha > 0 over a fully
  // transparent canvas, so empty pixels stay transparent and let
  // the tower glass behind blend through. Material's transparent
  // pass alpha-blends correctly. Earlier opaque-pass + dim-cyan
  // bg + cyan border read as "panel embedded in glass"; dropping
  // those for the etched look (user 2026-05-03 "the cell
  // backgrounds are basically transparent").
  const pad = 3;
  if (W - pad * 2 >= 12 && H - pad * 2 >= 12) {
    _mixed3dDrawCellPreview(ctx, cell, pad, pad, W - pad * 2, H - pad * 2 - 8, cyan, pink);
  }
  const tex = new T.CanvasTexture(canvas);
  tex.minFilter = T.LinearFilter;
  tex.magFilter = T.LinearFilter;
  return tex;
}

// Tier-1 rich-substrate snapshot pipeline (#142 Option 1, phase 1: mermaid).
// Decoupled from rAF + mount drain. setInterval kicks off ONE mermaid
// render per ~1.5s, only after mount drain has settled. Renders cell.spec
// → SVG (via mermaid.render) → drawImage to canvas → swap material.map's
// image. No DOM dependency. ~56% of cells are mermaid; remaining
// substrate-specific renderers can plug in here later.
// Inject a <style> block into a mermaid SVG that recolors strokes/fills
// to hackers cyan/purple and thickens line weights so the rendered graph
// reads boldly at canyon distance. Mermaid's default theme is thin neutral
// gray which disappears against the tower glass — user 2026-05-20
// "diagrams are pretty thin and uninspiring".
function _mixed3dStyleMermaidSVG(svgString) {
  // COMMENT-FREE — CSS comments inside an injected <style> block broke
  // SVG-as-Image parsing on Chrome (94 "mermaid snap fail: Event"
  // warnings traced to here). Likely an em-dash/smart-quote/elision
  // (`...`) character in a comment that the SVG-CSS parser choked on.
  // Bisect on 2026-05-22: stripping comments made the styled SVG load
  // cleanly. Keep all CSS comment-free here; commentary belongs in JS
  // comments above the function, not embedded in the CSS string.
  const css = `<style>
    svg, svg * { background: transparent !important; background-color: transparent !important; }
    [fill^="rgba(8"], [style*="fill:rgba(8"], .labelBkg { fill: transparent !important; }
    .node rect, .node polygon, .node circle, .node ellipse, .node path {
      fill: transparent !important;
      stroke: #00ddff !important;
      stroke-width: 2.5px !important;
    }
    /* State diagrams (stateDiagram-v2): default theme paints state
       rects/composites with a solid dark-blue fill which fights the
       hackers theme's "cyan lines on transparent glass" rule.
       cell-4062 surfaced this 2026-05-25. Mermaid's state-diagram
       node classes don't match .node above, hence this explicit
       parallel block. */
    .statediagram .state, .statediagram-state, .stateGroup,
    .composit, .composit rect, .composit path,
    .statediagram rect, .statediagram circle, .statediagram path:not(.transition),
    .statediagram-cluster, .statediagram-cluster path, .statediagram-cluster rect,
    .start-state, .start-state circle,
    .end-state, .end-state circle, .end-state path,
    .noteText, .noteBkg, .note rect, .note path,
    g.classGroup rect, g.classGroup line, g.classGroup polyline,
    g.entityBox, g.entityBox rect,
    g.actor rect, g.actor line,
    g.commit-message-box, g.commit-circle {
      fill: transparent !important;
      stroke: #00ddff !important;
      stroke-width: 2px !important;
    }
    .statediagram .transition, .statediagram path.transition,
    g.classGroup .relation, g.classGroup path,
    g.actor line {
      stroke: #66e6ff !important;
      fill: none !important;
    }
    .node .label, .nodeLabel, .label foreignObject div, .label text, text.label,
    .label tspan, .nodeLabel tspan, text tspan,
    .mindmap-node text, .mindmap-node tspan,
    g[class*="section-"] text, g[class*="section-"] tspan {
      fill: #e8f8ff !important;
      color: #e8f8ff !important;
      text-transform: uppercase !important;
      font-family: "Eurostile", "trebuchet ms", sans-serif !important;
      font-size: 12px !important;
    }
    /* Mindmaps have more breathing room than flowcharts — labels can
       be bigger without overflowing nodes. cell-3221 (TRIZ mindmap)
       was 12px at colspan=3 and read as too small (user 2026-05-23).
       Bump mindmap to 14px, root node to 17px+bold. Flowcharts still
       use the validated 12px text-fit pin (memory:
       feedback_mermaid_text_fit_validated). */
    g.mindmap-node text, g.mindmap-node tspan,
    g.mindmap-nodes text, g.mindmap-nodes tspan {
      font-size: 14px !important;
    }
    g.mindmap-node.section-root text, g.mindmap-node.section-root tspan,
    .section-root text, .section-root tspan {
      font-size: 17px !important;
      font-weight: 700 !important;
    }
    .edgePath path, .flowchart-link, .messageLine0, .messageLine1 {
      stroke: #66e6ff !important;
      stroke-width: 2px !important;
      fill: none !important;
    }
    .marker, .arrowheadPath, marker path { fill: #66e6ff !important; stroke: #66e6ff !important; }
    .edgeLabel, .edgeLabel rect, .edgeLabel foreignObject div, .edgeLabel text {
      background-color: transparent !important;
      fill: #ccf3ff !important;
      color: #ccf3ff !important;
    }
    /* Dark halo around edge label glyphs so the edge line passing beneath
       the label is masked by the per-glyph stroke instead of bleeding
       through the transparent label background. Paint-order rule at
       .edgeLabel (below) draws stroke first, fill on top — without a
       stroke value the rule is a no-op; setting it here completes the
       intent. User 2026-05-26 cell-5148. */
    .edgeLabel text, .edgeLabel foreignObject div, g.edgeLabel text {
      stroke: #000814 !important;
      stroke-width: 4px !important;
      paint-order: stroke fill !important;
      stroke-linejoin: round !important;
    }
    .edgeLabel rect, g.edgeLabel > g > rect, foreignObject rect { fill: transparent !important; }
    .cluster rect, .cluster path {
      stroke: #9966ff !important;
      stroke-width: 2px !important;
      fill: rgba(153, 102, 255, 0.06) !important;
    }
    .section-root rect, .section-0 rect, .section-1 rect, .section-2 rect,
    .section-3 rect, .section-4 rect, .section-5 rect, .section-6 rect,
    .section-root circle, .section-0 circle, .section-1 circle,
    .section-2 circle, .section-3 circle, .section-4 circle,
    .mindmap-node rect, .mindmap-node circle {
      fill: transparent !important;
      stroke: #00ddff !important;
    }
    /* Mindmap node-bkg (the rect/path behind each label) defaults to a
       dark gray that clashes with the hackers cyan/dark scheme. Force
       transparent so only the stroke shows. User 2026-05-22. */
    .node-bkg, .node-no-border, .node-circle, .node-bkg.node-no-border,
    g.mindmap-node > rect, g.mindmap-node > path, g.mindmap-node > circle,
    .mindmap-node > .label > rect, .mindmap-node foreignObject {
      fill: transparent !important;
      background: transparent !important;
      background-color: transparent !important;
    }
    .node-line-0, .node-line-1, .node-line-2, .node-line-3, .node-line-4 {
      stroke: #00ddff !important;
      stroke-width: 1.5px !important;
    }
    .edge, g.edges path, .mindmap-edges path,
    .edgePath, .edgePath path, g.edgePaths path,
    path.section-edge {
      stroke: #66e6ff !important;
      fill: none !important;
      stroke-width: 1.8px !important;
    }
    .nodeLabel, .edgeLabel, .label {
      paint-order: stroke fill !important;
    }
  </style>`;
  // Uppercase every visible text node (between <tspan> open + close).
  // CSS text-transform is unreliable across SVG renderers, so we
  // rewrite content. Only touches the inner-tspan text run; doesn't
  // affect attribute values, ids, etc. Matches the rest of the
  // theme's caps-everywhere convention (titles, decoratives, html
  // cells, timeline labels). User 2026-05-21.
  //
  // Entity-safe: XML entities are case-sensitive (`&amp;` valid,
  // `&AMP;` invalid). Naïve toUpperCase() on text containing `&lt;`
  // turned it into `&AMP;LT;` (mermaid double-escapes `&` → `&amp;`),
  // which strict SVG-as-Image parsing in Chrome rejected → blob
  // Image.onerror → rasterize fail → stub-cached cell. Symptom:
  // user 2026-05-22 cell-4513 "no real content, just title + faded
  // bands" — node label was `claude --resume <sid>` (escaped
  // `&lt;sid&gt;`). Skip the uppercase pass on tspans containing
  // entities — they're rare enough that mixed-case text in those
  // cells is acceptable.
  const upcased = svgString.replace(
    /(<tspan[^>]*>)([^<]+)(<\/tspan>)/g,
    (_m, open, txt, close) => {
      if (/&[#a-zA-Z]/.test(txt)) return open + txt + close;
      return open + txt.toUpperCase() + close;
    },
  );
  // Inject right after the opening <svg ...> tag.
  return upcased.replace(/(<svg[^>]*>)/, "$1" + css);
}
if (typeof window !== "undefined") window._mixed3dStyleMermaidSVG = _mixed3dStyleMermaidSVG;

// Paint the cell's caption into the body region below whatever the
// substrate renderer drew. Caller provides the y-band that's free; this
// word-wraps and truncates to fit. Cyan-white text @0.85 alpha so caption
// reads as supporting detail, not the headline (title block above is the
// headline). Shared across all substrate renderers to keep the "anchor
// the viz to the top, caption fills below" pattern consistent.
// Paint the standard tier-1 title block (72px purple bold uppercase
// with cyan divider rule). Shared by the async snap composite and the
// synchronous promote stub so they agree on title layout.
function _mixed3dPaintTitleBlock(ctx, title, fullW) {
  const TITLE_H = 72;
  const padX = 8;
  const W = fullW || 192;
  // Char width scales with W so colspan=2 cells fit ~32 chars per line
  // (was ~36 at smaller font).
  const fontPx = 22;
  const lineH = 26;
  const charsPerLine = Math.max(14, Math.floor(W / (fontPx * 0.55)));
  ctx.save();
  // Title in cyan to match decorative bed + the new tier-1 body
  // renderer (also cyan). Was #d8c0ff lavender, but that read as
  // "different system" alongside the all-cyan body rows (user
  // 2026-05-24). Full alpha keeps the title bright/dominant against
  // the alpha-jittered body rows below.
  ctx.fillStyle = "#00ddff";
  ctx.font = `bold ${fontPx}px 'Eurostile', 'Share Tech Mono', monospace`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const text = String(title || "").toUpperCase();
  const words = text.split(/\s+/);
  let y = 6, cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (next.length > charsPerLine) {
      if (cur) ctx.fillText(cur, padX, y);
      y += lineH;
      if (y + lineH > TITLE_H - 2) { cur = ""; break; }
      cur = w.length > charsPerLine ? w.slice(0, charsPerLine - 1) + "…" : w;
    } else cur = next;
  }
  if (cur && y + lineH <= TITLE_H - 2) ctx.fillText(cur, padX, y);
  // Divider removed — when the cell backdrop is transparent the line
  // sat on the tower-glass scanlines behind, reading as a "dotted
  // line above the cell" (user 2026-05-21). The title→body break
  // is already clear from the typographic difference; no need for
  // a visible rule.
  ctx.restore();
}

// Synchronous stopgap at tier-2→tier-1 promote when no full snapshot
// is cached yet. Paints title block + caption so the cell is legible
// the moment it crosses the LOD boundary. The async snap driver
// replaces this with the proper substrate render (mermaid/vega/etc)
// ~100-500ms later. ~3-5ms per call — cheap enough to run in the
// retier-sweep budget without blowing PROMOTE_BUDGET.
function _mixed3dPaintPromoteStub(id, cellData, colspan, canvasH) {
  const cs = Math.max(1, Math.min(6, colspan || 1));
  const W = 192 * cs;
  const H = canvasH || 576;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  // No background fill — transparent backdrop is intentional.
  _mixed3dPaintTitleBlock(ctx, cellData?.title || id, W);
  // Body region: render decorative-style scrolling text bands instead
  // of "RENDERING". User 2026-05-21: cells whose content never arrives
  // (no spec/html in cellsById) should look like ambient tower content
  // rather than a failure state. Same vocabulary as tier-2 decoratives:
  // mono shorts/meds/arrows with occasional purple highlight. Static
  // (no scroll, no per-frame redraw — CanvasTexture budget).
  const TITLE_H = 72;
  ctx.font = '14px "Share Tech Mono", "Eurostile", monospace';
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const shorts = ["RX", "TX", "OK", "FF", "00", "FAIL", "INIT", "RUN", "EXEC", "HLT", "JMP", "RET", "MOV", "POP", "PUSH", "ACK", "NAK"];
  const meds = ["STATUS", "READY", "BUFFER", "PASS", "CALL", "RESP", "BIND", "STORE", "LOAD", "DUMP", "WAIT", "INVOICE", "FREIGHT"];
  const arrows = ["->", "=>", "<-", ">>", "::"];
  const longs = ["INSTRUCTION_PIPELINE", "COMPANY_STATUS", "WAREHOUSE_LOCATIONS", "MEMORY_FENCE_TABLE", "SHIPPING_FORECASTS"];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const lineGen = () => {
    const r = Math.random();
    if (r < 0.10) return pick(longs);
    if (r < 0.30) return `${pick(meds)} ${pick(arrows)} ${pick(meds)}`;
    if (r < 0.50) return `${pick(meds)}=${(Math.random()*99|0).toString().padStart(2,"0")}.${(Math.random()*999|0)}`;
    if (r < 0.65) return `${pick(shorts)} ${pick(shorts)} ${pick(shorts)}`;
    if (r < 0.75) return `+-- ${pick(meds)}`;
    if (r < 0.85) return ".".repeat(6 + Math.floor(Math.random() * 14));
    return pick(meds);
  };
  const rowH = 20;
  for (let y = TITLE_H + 8; y < H - 8; y += rowH) {
    if (Math.random() < 0.04) {
      ctx.fillStyle = `rgba(153, 102, 255, ${(0.7 + Math.random() * 0.3).toFixed(2)})`;
    } else {
      ctx.fillStyle = `rgba(0, 221, 255, ${(0.55 + Math.random() * 0.25).toFixed(2)})`;
    }
    ctx.fillText(lineGen(), 8, y);
  }
  return canvas;
}

function _mixed3dPaintCaption(ctx, caption, y0, y1, w, opts) {
  const text = String(caption || "").trim();
  if (!text) return;
  if (y1 - y0 < 24) return;
  const padX = (opts && opts.padX) || 8;
  const charsPerLine = (opts && opts.charsPerLine) || 22;
  const lineH = (opts && opts.lineH) || 17;
  const font = (opts && opts.font) || "13px 'Eurostile', 'Share Tech Mono', monospace";
  ctx.save();
  ctx.fillStyle = "#ccf3ff";
  ctx.globalAlpha = 0.85;
  ctx.font = font;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const maxLines = Math.max(1, Math.floor((y1 - y0) / lineH));
  const lines = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    const next = cur ? cur + " " + word : word;
    if (next.length > charsPerLine) {
      if (cur) lines.push(cur);
      cur = word.length > charsPerLine ? word.slice(0, charsPerLine - 1) + "…" : word;
    } else cur = next;
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  let y = y0;
  for (const L of lines) { ctx.fillText(L, padX, y); y += lineH; }
  ctx.restore();
}

// Persistent SVG cache (#152d): if a cell has been rendered before,
// the styled SVG lives at /cells/<id>.mermaid.svg on disk. Skip
// mermaid.parse + mermaid.render (~63ms blocking main-thread on
// average, 213ms p100) and load the cached SVG via Image directly.
// First render still does mermaid.render then POSTs the styled SVG
// to snap_receiver on :8767 so future loads hit the cache.
//
// Why this works for the throughput problem: mermaid is 92% of total
// per-render cost (treemap/sparkline/etc are <1ms). Caching only
// mermaid removes the bottleneck for ~32% of tier-1 cells. After a
// warm session the steady-state stub backlog should drop dramatically.
function _mixed3dRasterizeSvgToCanvas(svgString, w, h, extras) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      const aspectImg = img.naturalWidth / img.naturalHeight;
      // Fit to canvas preserving aspect, then center vertically so the
      // leftover space splits above/below the diagram instead of all
      // sitting below it. User 2026-05-21: "lot of whitespace below
      // the diagram although I think the width is good overall".
      //
      // Earlier MAX_GRAPH_DIM cap (720px, a389592, intended to shrink
      // cs=6 mermaid text vs cs=1) removed 2026-05-26: user reported
      // cell-5816 (cs=6 mermaid) reading "weirdly small for how many
      // cells it takes up." A cs=6 plane is 6x wider in world units;
      // proportionally larger text IS the correct behavior — the
      // earlier "too big" complaint on cell-5323 was really about
      // canvas-aspect mismatch (square plane → square canvas → graph
      // forced into wrong aspect), now fixed via dynamic canvasH
      // upstream.
      let graphW, graphH;
      if (aspectImg > w / h) {
        graphW = w;
        graphH = w / aspectImg;
      } else {
        graphH = h * 0.95;
        graphW = graphH * aspectImg;
      }
      const dx = (w - graphW) / 2;
      const dy = (h - graphH) / 2;
      ctx.drawImage(img, dx, dy, graphW, graphH);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      const id = extras?.id || "unknown";
      // Track failures on _mixed3dState so we can surface them in HUD
      // and debug. Without this the rasterize-fail-then-stub path was
      // invisible — cells silently stayed as decorative stubs.
      // User 2026-05-22: "instrument this so it doesn't happen,
      // I think it's been a long standing issue".
      const S = _mixed3dState;
      if (S) {
        if (!S._rasterizeFails) S._rasterizeFails = new Map();
        const prev = S._rasterizeFails.get(id) || 0;
        S._rasterizeFails.set(id, prev + 1);
        if (prev === 0) {
          const head = svgString.slice(0, 200).replace(/\s+/g, " ");
          console.warn(`[mixed3d] rasterize fail cell=${id} svgLen=${svgString.length} head="${head}"`);
        }
      }
      const err = new Error(`rasterize-fail cell=${id} svgLen=${svgString.length}`);
      err.cellId = id;
      err.svgHead = svgString.slice(0, 200);
      reject(err);
    };
    img.src = url;
  });
}

// Two-pass aspect check: after mermaid renders once, inspect the SVG's
// natural aspect against the cell's aspect. If they fight (wide graph
// in a tall cell, or vice versa), rewrite the `flowchart`/`graph`
// direction and re-render. Only meaningful for flowchart-family
// subtypes; sequence/gantt/pie are axis-fixed.
// User 2026-05-22: "two-pass is what I had in mind" — graph rerouted
// to match the slot it has to live in.
function _mixed3dMaybeFlipMermaidDirection(spec, svg, cellW, cellH) {
  // Only flowchart/graph have a flippable direction.
  if (!/^\s*(flowchart|graph)\b/m.test(spec)) return null;
  // Parse SVG viewBox to get the graph's natural aspect.
  const m = svg.match(/viewBox="[\d.-]+\s+[\d.-]+\s+([\d.-]+)\s+([\d.-]+)"/);
  if (!m) return null;
  const svgW = parseFloat(m[1]);
  const svgH = parseFloat(m[2]);
  if (!(svgW > 0) || !(svgH > 0)) return null;
  const svgAspect = svgW / svgH;
  const cellAspect = cellW / cellH;
  // Categorize each: <0.8 = tall, 0.8-1.2 = squareish, >1.2 = wide.
  const svgIsTall = svgAspect < 0.8;
  const svgIsWide = svgAspect > 1.2;
  const cellIsTall = cellAspect < 0.8;
  const cellIsWide = cellAspect > 1.2;
  // Compatible: both tall, both wide, or either squareish.
  if (svgIsTall && cellIsTall) return null;
  if (svgIsWide && cellIsWide) return null;
  if (!svgIsTall && !svgIsWide) return null;  // graph squareish — no flip helps
  if (!cellIsTall && !cellIsWide) return null;  // cell squareish — no flip needed
  // Mismatch confirmed. Cell-tall + graph-wide → force TD; cell-wide +
  // graph-tall → force LR.
  const newDir = cellIsTall ? "TD" : "LR";
  const lines = spec.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const fm = lines[i].match(/^(\s*)(flowchart|graph)(\s+(TD|TB|BT|LR|RL))?(\s.*|\s*$)/);
    if (fm) {
      const currentDir = fm[4];
      if (currentDir === newDir) return null;  // already correct (shouldn't happen given mismatch, but defensive)
      lines[i] = `${fm[1]}${fm[2]} ${newDir}${fm[5] || ""}`;
      return lines.join("\n");
    }
  }
  return null;
}

// Normalize mermaid spec — convert literal `\n` (backslash + n,
// two characters) in labels/notes to `<br/>` so mermaid renders them
// as line breaks. Specialists generating mermaid sometimes encode line
// breaks as JSON-escaped `\n` thinking mermaid will interpret them,
// but mermaid only understands `<br>` in labels. User 2026-05-24:
// cell-4586 (sequenceDiagram) had participants like "PortAudio Mic\n
// (16 kHz mono)" rendering with literal "\n" in the box. Actual
// mermaid statement-separator newlines are 0x0A characters and not
// touched by this substitution.
function _mixed3dRenderMermaidToCanvas(spec, w, h, extras) {
  if (!spec || typeof window.mermaid !== "object") return Promise.resolve(null);
  spec = _normalizeMermaidSpec(spec);
  const cellId = extras?.id;
  // Cache key now includes colspan since wide cells need a wider
  // canvas — re-rasterizing a 192-wide SVG into a 384-wide cell is
  // technically OK (SVG scales) but content like edge labels would
  // be undersized in the wider context. Keep variants separate.
  const cs = Math.max(1, Math.min(3, extras?.colspan || 1));
  // Style version baked into the cache filename — bump when
  // _mixed3dStyleMermaidSVG changes so stale renders don't haunt
  // future sessions. v4 = aspect-fit init-block + mindmap node-bkg
  // transparent + entity-safe tspan upper (2026-05-22).
  // v10 = state/sequence/class/ER diagram nodes forced transparent
  // (2026-05-25); previously inherited mermaid default dark-blue
  // fills only the .node block was overriding.
  const STYLE_V = "v12";
  const cacheKey = cs > 1 ? `mermaid.c${cs}.${STYLE_V}` : `mermaid.${STYLE_V}`;
  const filename = cellId ? `${cellId}.${cacheKey}.svg` : null;
  // Boot-time manifest tells us which SVGs exist on disk. Without
  // this check, every cache-miss render fired a fetch that 404'd
  // and Chrome devtools logged it as an error — 70+ red lines per
  // session even though the fallback was clean.
  // Dev escape hatch: ?nocache=1 disables the manifest lookup so every
  // mermaid render goes through freshRender. Useful during styling
  // changes so old cached SVGs aren't mistaken for unfixed bugs.
  // User 2026-05-22: "always clear cache so I'm not mistaking old
  // cache entries for unfixed".
  const _nocache = window._mixed3dNoCache
    || new URLSearchParams(window.location.search).get("nocache") === "1";
  const haveCache = !_nocache && filename && window._mixed3dSvgManifest?.has(filename);
  // Cache hit path: fetch only when manifest says it exists. Also
  // retroactively check the cached SVG's aspect against the cell —
  // if it's mismatched, reject the cache and fall through to fresh
  // render (which goes through two-pass direction-flip). Without
  // this, cells minted before the two-pass landed keep their wrong-
  // direction graphs forever. User 2026-05-22 on cell-4398: "this
  // one probably should have been vertical or something".
  const tryCache = haveCache
    ? fetch(`/cells/${encodeURIComponent(cellId)}.${cacheKey}.svg`)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error("cache-miss"))))
        .then((svg) => {
          const flipped = _mixed3dMaybeFlipMermaidDirection(spec, svg, w, h);
          if (flipped) {
            // Cache says wrong direction — bust manifest entry so we
            // don't re-check next time, and force a fresh render.
            window._mixed3dSvgManifest?.delete(filename);
            return Promise.reject(new Error("cache-aspect-mismatch"));
          }
          return _mixed3dRasterizeSvgToCanvas(svg, w, h, extras);
        })
    : Promise.reject(new Error("no-cache-or-id"));
  // Fresh render path: parse + render + style, then fire-and-forget
  // POST to snap_receiver:8767 so the next load hits the cache.
  const freshRender = () => {
    const id = "_m3d_snap_" + Math.random().toString(36).slice(2, 10);
    // Explicitly load Eurostile (the font mermaid will render text in)
    // BEFORE measuring. document.fonts.ready only awaits already-loading
    // fonts; @font-face fonts are lazy-loaded on first use. mermaid's
    // hidden render div might not trigger that load in time, so its
    // getBBox uses fallback (Share Tech Mono / monospace, narrower)
    // widths — then the real render shows Eurostile (wider) and
    // text exceeds rect bounds. Triple-load the sizes mermaid uses.
    const fontsP = document.fonts ? Promise.all([
      document.fonts.load("16px Eurostile"),
      document.fonts.load("bold 16px Eurostile"),
      document.fonts.load("14px Eurostile"),
    ]).then(() => document.fonts.ready) : Promise.resolve();
    // Aspect-aware spec: inject mermaid init-block tuning so the graph
    // packs into the cell shape it actually has. Tall cells get tight
    // nodeSpacing + loose rankSpacing (graph stretches vertically);
    // wide cells get the opposite. Only flowchart/graph honors these.
    // User 2026-05-22 "chase them both yeah" (substrate-fit pass).
    const aspect = w / h;
    let specForRender = spec;
    if (/^\s*(flowchart|graph)\b/m.test(spec) && !/%%\{init:/.test(spec)) {
      let nodeSp, rankSp;
      if (aspect < 0.6) { nodeSp = 20; rankSp = 90; }      // very tall: stretch vertically
      else if (aspect < 0.8) { nodeSp = 25; rankSp = 70; } // tall: pack vertically
      else if (aspect > 2.5) { nodeSp = 110; rankSp = 18; }// extra-wide colspan=3: spread horizontally
      else if (aspect > 1.4) { nodeSp = 70; rankSp = 25; } // wide: pack horizontally
      else { nodeSp = 40; rankSp = 45; }                    // squareish: balanced
      const initBlock = `%%{init: {'flowchart':{'nodeSpacing':${nodeSp},'rankSpacing':${rankSp},'padding':16,'curve':'step','useMaxWidth':false}}}%%\n`;
      specForRender = initBlock + spec;
    }
    return fontsP
      .then(() => window.mermaid.parse(specForRender))
      .then(() => window.mermaid.render(id, specForRender))
      .then(({ svg }) => {
        // Aspect-fit two-pass: if graph aspect fights the cell, rewrite
        // direction and re-render. Costs an extra mermaid.render for
        // mismatched cells but cache absorbs the cost from second load on.
        const flipped = _mixed3dMaybeFlipMermaidDirection(spec, svg, w, h);
        if (flipped) {
          const id2 = "_m3d_snap_" + Math.random().toString(36).slice(2, 10);
          return window.mermaid.parse(flipped)
            .then(() => window.mermaid.render(id2, flipped))
            .then(({ svg: svg2 }) => ({ chosen: svg2, source: "flipped" }))
            .catch((e) => {
              // Re-render failed (mermaid parse error on flipped spec).
              // Fall back to the original.
              console.warn("[mixed3d] aspect-flip render failed, using original:", e?.message || e);
              return { chosen: svg, source: "original-fallback" };
            });
        }
        return { chosen: svg, source: "original" };
      })
      .then(({ chosen }) => {
        const styledSvg = _mixed3dStyleMermaidSVG(chosen);
        if (cellId) {
          fetch(`http://127.0.0.1:8767/cells/${encodeURIComponent(cellId)}.${cacheKey}.svg`, {
            method: "POST",
            body: styledSvg,
            headers: { "content-type": "image/svg+xml" },
          }).then(() => {
            // Update the in-memory manifest so subsequent renders of
            // this cell hit the cache path instead of doing fresh work.
            if (window._mixed3dSvgManifest) window._mixed3dSvgManifest.add(filename);
          }).catch(() => {}); // receiver may be down; non-fatal
        }
        return _mixed3dRasterizeSvgToCanvas(styledSvg, w, h, extras);
      });
  };
  return tryCache.catch(() => freshRender()).catch((e) => {
    console.warn("[mixed3d] mermaid snap fail:", e?.message || e);
    return null;
  });
}

// Toggle tier-2 cell visibility. URL: ?notier2=1 calls this at boot for
// A/B-comparing tier-1 + decorative against the full mix. Sets a persistent
// flag — the snapshot driver re-applies it every tick because tier-2
// Meshes get regenerated when cells demote from tier-1.
let _mixed3dTier2Suppressed = false;
function _mixed3dApplyTier2Visibility(visible) {
  const S = _mixed3dState;
  if (!S) return 0;
  let n = 0;
  if (S.tier2InstancedMeshes) {
    for (const [, inst] of S.tier2InstancedMeshes) {
      if (inst && inst.mesh && inst.mesh.visible !== visible) {
        inst.mesh.visible = visible;
        n++;
      }
    }
  }
  if (S.cellObjects) {
    for (const [, obj] of S.cellObjects) {
      if (obj.isInstanceHandle) continue;
      if (obj.userData?.tier === 2 && obj.visible !== visible) {
        obj.visible = visible;
        n++;
      }
    }
  }
  return n;
}
window.toggleMixed3dTier2 = (visible) => {
  _mixed3dTier2Suppressed = !visible;
  const n = _mixed3dApplyTier2Visibility(visible);
  return `tier-2 visible: ${visible} (${n} updated)`;
};

// Custom-canvas renderers for non-mermaid tier-1 substrates. Each
// returns a Promise<canvas> rendering the cell's actual spec data into
// a hackers-palette canvas. Synchronous draws wrapped in resolved
// Promise to match the mermaid pipeline shape.

function _mixed3dRenderGaugeToCanvas(spec, w, h, extras) {
  // Gauge spec: { value, min, max, label, unit? }
  let value, min, max, label;
  try {
    const s = typeof spec === "string" ? JSON.parse(spec) : spec;
    value = +s.value; min = +s.min; max = +s.max; label = s.label;
  } catch (e) { return Promise.resolve(null); }
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return Promise.resolve(null);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  // Rectilinear horizontal bar — gauges in hackers/mixed3d match the
  // Gibson aesthetic (no curves) per task #176. Replaces the previous
  // 270° dial which read as out-of-theme in the canyon view.
  const cx = w / 2;
  const cy = h * 0.42;
  const barW = w * 0.78;
  const barH = 14;
  const barX = (w - barW) / 2;
  const barY = cy - barH / 2;
  const norm = Math.max(0, Math.min(1, (value - min) / (max - min)));
  // Track — cyan ghost (was purple #9966ff). Same hackers-decorative
  // discipline: one hue, alpha hierarchy. 2026-05-24 substrate sweep.
  ctx.fillStyle = "#00ddff";
  ctx.globalAlpha = 0.18;
  ctx.fillRect(barX, barY, barW, barH);
  // Fill
  ctx.fillStyle = "#00ddff";
  ctx.globalAlpha = 1;
  ctx.fillRect(barX, barY, barW * norm, barH);
  // Bracket frame
  ctx.strokeStyle = "#00ddff";
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(barX, barY, barW, barH);
  // Value — cyan at full alpha (was #ccf3ff cyan-white).
  ctx.fillStyle = "#00ddff";
  ctx.globalAlpha = 1;
  ctx.font = "bold 36px 'Eurostile', 'Share Tech Mono', monospace";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const vs = (Number.isInteger(value) ? value.toString() : value.toFixed(1));
  ctx.fillText(vs, cx, cy - 36);
  // Label below bar — cyan at 0.6 alpha (was purple #9966ff full).
  if (label) {
    ctx.fillStyle = "#00ddff";
    ctx.globalAlpha = 0.6;
    ctx.font = "16px 'Eurostile', 'Share Tech Mono', monospace";
    ctx.fillText(String(label).toUpperCase().slice(0, 18), cx, cy + 28);
    ctx.globalAlpha = 1;
  }
  return Promise.resolve(canvas);
}

function _mixed3dRenderSparklineToCanvas(spec, w, h, extras) {
  // Sparkline spec, accept all common shapes (matches treemap renderer
  // multi-key tolerance pattern):
  //   { data: [...], label? }
  //   { series: [...], label? }
  //   { values: [...], label? }
  //   [...]
  // The ambient/synthetic cells (e.g. cell-amb-NNNN) use `series`
  // because that's the gen_ambient.py output shape; previously they
  // all returned null → stub-cached.
  let data, label;
  try {
    const s = typeof spec === "string" ? JSON.parse(spec) : spec;
    if (Array.isArray(s)) { data = s; }
    else {
      data = s.data || s.series || s.values;
      label = s.label;
    }
  } catch (e) { return Promise.resolve(null); }
  if (!Array.isArray(data) || data.length < 1) return Promise.resolve(null);
  // Single-value path: render the current value as a big number with
  // a label below — gen_ambient.py emits series=[N] for fresh-day
  // sparklines (only one day's data).
  if (data.length === 1) {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#00ddff";
    ctx.font = "bold 56px 'Eurostile', 'Share Tech Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const v = data[0];
    const vs = Number.isInteger(v) ? v.toString() : v.toFixed(2);
    ctx.fillText(vs, w / 2, h * 0.45);
    if (label) {
      ctx.fillStyle = "#00ddff";
      ctx.globalAlpha = 0.6;
      ctx.font = "14px 'Eurostile', 'Share Tech Mono', monospace";
      ctx.fillText(String(label).toUpperCase().slice(0, 22), w / 2, h * 0.45 + 40);
      ctx.globalAlpha = 1;
    }
    return Promise.resolve(canvas);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  const pad = 16;
  // Plot fills as much of body as possible. Label gets a fixed top
  // band when present; without a label, the line starts near the top.
  // User 2026-05-22 cell-3793: "good graph but doesn't take up all
  // the vertical height of the cell".
  const py0 = label ? 28 : 8;
  const py1 = h - 12;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  ctx.strokeStyle = "#00ddff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = pad + (w - pad * 2) * (i / (data.length - 1));
    const y = py1 - ((data[i] - min) / range) * (py1 - py0);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // End dot — bright cyan-white, not pink (pink is tower-attack-state only).
  const xL = pad + (w - pad * 2);
  const yL = py1 - ((data[data.length - 1] - min) / range) * (py1 - py0);
  ctx.fillStyle = "#ccf3ff";
  ctx.beginPath();
  ctx.arc(xL, yL, 6, 0, Math.PI * 2);
  ctx.fill();
  // End value
  ctx.fillStyle = "#ccf3ff";
  ctx.font = "bold 20px 'Eurostile', 'Share Tech Mono', monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  const last = data[data.length - 1];
  const lastStr = (Number.isInteger(last) ? last.toString() : last.toFixed(2));
  ctx.fillText(lastStr, xL - 12, yL - 8);
  // Label
  if (label) {
    ctx.fillStyle = "#9966ff";
    ctx.font = "14px 'Eurostile', 'Share Tech Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(String(label).toUpperCase().slice(0, 22), pad, py0 - 22);
  }
  return Promise.resolve(canvas);
}

function _mixed3dRenderTreemapToCanvas(spec, w, h, extras) {
  // Treemap spec, accept all common shapes:
  //   { items: [{label, value}, ...] }
  //   { children: [{name, value}, ...] }
  //   { data: [...] }
  //   [{...}, ...]
  // Plus per-item key flexibility: label OR name OR title; value OR size.
  // The specialist has minted both items and children variants over time;
  // before this normalization the renderer silently returned null on the
  // mismatch — observed as treemap cells getting cached as title-only stubs.
  let items;
  try {
    const s = typeof spec === "string" ? JSON.parse(spec) : spec;
    items = Array.isArray(s) ? s : (s.items || s.children || s.data || []);
  } catch (e) { return Promise.resolve(null); }
  if (!Array.isArray(items) || !items.length) return Promise.resolve(null);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  // Small-n branch: ≤3 items in a treemap renders as 99%-vs-1% slivers
  // (cell-3682 case) — outline-only treemap reads as an empty cell with
  // labels in a corner. User 2026-05-22 picked "swap to a different
  // substrate" — we render as stacked big-number+label rows instead.
  if (items.length <= 3) {
    const pad = 12;
    const usableH = h - pad * 2;
    // Cap rowH so small-n treemaps don't sprawl to full canvas height
    // (user 2026-05-25 on cell-5972 "way too spaced out, needs to be
    // compressed"). 110px keeps big number ~60px + label ~16px + 30px
    // padding per row. Three rows × 110px = 330px content; the rest
    // anchors top + leaves clean trailing space rather than stretched
    // 160px rows. Even-spread still wins for narrow n=1/n=2 cases.
    const MAX_ROW_H = 110;
    const evenRowH = Math.floor(usableH / items.length);
    const rowH = Math.min(evenRowH, MAX_ROW_H);
    // Cyan family at varying alpha — was [cyan, purple, cyan-white].
    // Decorative discipline: one hue, alpha hierarchy.
    const colors = ["rgba(0,221,255,1)", "rgba(0,221,255,0.75)", "rgba(0,221,255,0.55)"];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const label = String(it.label || it.name || it.title || "").toUpperCase();
      const value = Math.max(0, +(it.value ?? it.size ?? 1));
      const ry = pad + i * rowH;
      const color = colors[i % colors.length];
      // Big number — scaled to row height.
      const numFont = Math.min(Math.floor(rowH * 0.55), 72);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.95;
      ctx.font = `bold ${numFont}px 'Eurostile', 'Share Tech Mono', monospace`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(String(value), pad, ry + rowH * 0.45);
      // Label — wraps under the number.
      const labelFont = Math.max(14, Math.min(20, Math.floor(rowH * 0.13)));
      ctx.fillStyle = "#e8f8ff";
      ctx.font = `${labelFont}px 'Eurostile', 'Share Tech Mono', monospace`;
      const charW = labelFont * 0.55;
      const maxChars = Math.floor((w - pad * 2) / charW);
      const words = label.split(/\s+/);
      const lines = [];
      let cur = "";
      for (const wrd of words) {
        const next = cur ? cur + " " + wrd : wrd;
        if (next.length > maxChars) { if (cur) lines.push(cur); cur = wrd; }
        else cur = next;
        if (lines.length >= 2) break;
      }
      if (cur && lines.length < 2) lines.push(cur);
      const lineH = labelFont + 4;
      for (let li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], pad, ry + rowH * 0.75 + li * lineH);
      }
      // Divider between rows.
      if (i < items.length - 1) {
        ctx.strokeStyle = "#00ddff";
        ctx.globalAlpha = 0.18;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad, ry + rowH);
        ctx.lineTo(w - pad, ry + rowH);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    return Promise.resolve(canvas);
  }
  const pad = 8;
  const x0 = pad, y0 = pad, x1 = w - pad, y1 = h - pad;
  const total = items.reduce((a, it) => a + Math.max(0, +(it.value ?? it.size ?? 1)), 0) || 1;
  // Cyan family with alpha alternation (was cyan + purple). One hue,
  // alpha hierarchy — decorative discipline. 2026-05-24 substrate sweep.
  const colors = ["rgba(0,221,255,1)", "rgba(0,221,255,0.6)"];
  let curX = x0, curY = y0, remW = x1 - x0, remH = y1 - y0;
  const horizontal = remW > remH;
  let i = 0;
  for (const it of items.slice(0, 12)) {
    const v = Math.max(0, +(it.value ?? it.size ?? 1));
    const frac = v / total;
    let rw, rh;
    if (horizontal) {
      rw = remW * frac; rh = remH;
    } else {
      rw = remW; rh = remH * frac;
    }
    if (i === items.length - 1 || i === 11) { rw = remW; rh = remH; }
    const color = colors[i % colors.length];
    // Outlines only — user 2026-05-22: "treemap cells should also not
    // have their backgrounds filled, just lines like the bar charts".
    // Drops the 0.18-alpha fill that competed with the cyan label.
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.strokeRect(curX, curY, rw, rh);
    // Label
    if (rw > 40 && rh > 24) {
      // Label sized to tile area: bigger tiles get bigger labels.
      // User 2026-05-21: "labels too small" on treemap.
      const labelFont = Math.max(14, Math.min(28, Math.floor(Math.sqrt(rw * rh) / 8)));
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 1;
      ctx.font = `bold ${labelFont}px 'Eurostile', 'Share Tech Mono', monospace`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      const name = String(it.label || it.name || it.title || "")
        .toUpperCase()
        .slice(0, Math.floor(rw / (labelFont * 0.55)));
      ctx.fillText(name, curX + 6, curY + 6);
      if (rh > labelFont * 2 + 8) {
        const valFont = Math.max(12, Math.floor(labelFont * 0.75));
        ctx.font = `${valFont}px 'Eurostile', 'Share Tech Mono', monospace`;
        ctx.fillStyle = color;
        ctx.fillText(String(v), curX + 6, curY + labelFont + 10);
      }
    }
    if (horizontal) { curX += rw; remW -= rw; }
    else { curY += rh; remH -= rh; }
    i++;
  }
  ctx.globalAlpha = 1;
  return Promise.resolve(canvas);
}

function _mixed3dRenderTimelineRibbonToCanvas(spec, w, h, extras) {
  let stages, axisLabel;
  try {
    const s = typeof spec === "string" ? JSON.parse(spec) : spec;
    stages = s.stages; axisLabel = s.axis_label;
  } catch (e) { return Promise.resolve(null); }
  if (!Array.isArray(stages) || !stages.length) return Promise.resolve(null);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  // VERTICAL layout: tower cells are tall-and-narrow (W:H ≈ 1:2). The
  // old horizontal axis crammed 5+ stage labels into 60-80px slots and
  // truncated everything. Vertical gives each stage a full-width row
  // for label + detail. User 2026-05-22: "maybe the timeline ribbon
  // should be vertical".
  return Promise.resolve(_mixed3dRenderTimelineRibbonVertical(canvas, ctx, w, h, stages, axisLabel));
}

function _mixed3dRenderTimelineRibbonVertical(canvas, ctx, w, h, stages, axisLabel) {
  const n = Math.min(stages.length, 8);
  const axisX = 56;            // x of axis line + dots; leaves halo room on left
  const padTop = axisLabel ? 36 : 16;
  const padBot = 16;
  // Cap stepY so 3-stage timelines on a 1080px canvas don't spread the
  // dots 500px apart and read as "visually sparse" (user 2026-05-22 on
  // cell-3909). Rows anchor to the top; axis continues to bottom edge
  // as a "scaffold awaiting more events" — fits the Gibson terminal
  // aesthetic. Even-spread still wins when stage count exceeds what
  // MAX_STEP_Y can pack.
  // Tightened 2026-05-25 from 180 → 100: timelines still read too
  // spaced-out at 180, especially in tier-1 mixed3d cells where
  // adjacent substrates pack tighter content. 100 keeps labels +
  // detail readable (label 16px / detail 10.4px / dotR 8 = ~42px
  // content per row, ~58px headroom) while halving the vertical
  // footprint of sparse-stage timelines.
  const MAX_STEP_Y = 100;
  const evenSpreadStepY = (h - padTop - padBot) / (n - 1 || 1);
  const stepY = Math.min(evenSpreadStepY, MAX_STEP_Y);
  const lineW = 3;
  const dotR = Math.min(12, Math.max(8, Math.round(stepY / 14)));
  const activeR = Math.round(dotR * 1.4);
  const haloR = Math.round(dotR * 2.6);
  const labelFontSize = Math.min(22, Math.max(16, Math.round(stepY / 7)));
  const detailFontSize = Math.max(12, Math.round(labelFontSize * 0.65));
  const labelX = axisX + haloR + 12;
  const availW = w - labelX - 12;
  // Vertical axis line — cyan dim (was purple). 2026-05-24 sweep.
  // Alpha lifted 0.35 → 0.6 (user 2026-05-25: "timelines and html are
  // surprisingly dim in comparison to other things in the render").
  // Whole supporting-chrome layer of the timeline was too retreating
  // against the high-density tier-2 decorative bed.
  ctx.strokeStyle = "#00ddff";
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = lineW;
  ctx.beginPath();
  ctx.moveTo(axisX, padTop);
  ctx.lineTo(axisX, h - padBot);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Axis label across the top — cyan, brightened (was 0.6).
  if (axisLabel) {
    ctx.fillStyle = "#00ddff";
    ctx.globalAlpha = 0.85;
    ctx.font = "bold 13px 'Eurostile', 'Share Tech Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(String(axisLabel).toUpperCase(), 12, 10);
    ctx.globalAlpha = 1;
  }
  // Helper: measure-based wrap that splits on spaces and falls back to
  // hard-wrap for over-long single words. Returns array of lines.
  const wrapToWidth = (text, maxPx, font) => {
    ctx.font = font;
    const raw = String(text || "");
    if (!raw) return [];
    if (ctx.measureText(raw).width <= maxPx) return [raw];
    const words = raw.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    for (const word of words) {
      const next = cur ? cur + " " + word : word;
      if (ctx.measureText(next).width <= maxPx) {
        cur = next;
      } else if (cur) {
        lines.push(cur);
        cur = word;
      } else {
        // single word longer than width: hard-wrap
        let rem = word;
        while (rem && ctx.measureText(rem).width > maxPx) {
          let k = rem.length;
          while (k > 1 && ctx.measureText(rem.slice(0, k)).width > maxPx) k--;
          lines.push(rem.slice(0, k));
          rem = rem.slice(k);
        }
        cur = rem;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };
  for (let i = 0; i < n; i++) {
    const y = Math.round(padTop + i * stepY);
    const st = stages[i] || {};
    const status = String(st.status || "");
    const isActive = status === "active";
    const isDone = status === "complete" || status === "done";
    const isFailed = status === "failed";
    const isSkipped = status === "skipped";
    const isPending = status === "pending";
    // Cyan family with alpha hierarchy (was cyan + purple). 2026-05-24
    // substrate sweep. Active = bright cyan; done = dim cyan; pending /
    // skipped = ghost cyan; failed keeps red (failure signal).
    // Alphas lifted 2026-05-25: 0.7→0.9, 0.3→0.6, 0.4→0.65, 0.5→0.75.
    // The hierarchy preserved (each state still readably distinct from
    // its neighbors) but the dim floor is way up. Per-pixel intensity
    // now competes with the tier-2 decorative bed instead of getting
    // visually steamrolled by it.
    const baseColor = isActive ? "#00ddff"
                    : isFailed ? "#f87171"
                    : isDone ? "rgba(0,221,255,0.9)"
                    : isSkipped ? "rgba(0,221,255,0.6)"
                    : isPending ? "rgba(0,221,255,0.65)"
                    : "rgba(0,221,255,0.75)";
    // Active halo.
    if (isActive) {
      ctx.strokeStyle = "#00ddff";
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = Math.max(2, Math.round(lineW * 0.8));
      ctx.beginPath();
      ctx.arc(axisX, y, haloR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Dot — solid for done/active/failed, ring for pending, X for skipped.
    if (isSkipped) {
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      const r = dotR;
      ctx.beginPath();
      ctx.moveTo(axisX - r, y - r); ctx.lineTo(axisX + r, y + r);
      ctx.moveTo(axisX - r, y + r); ctx.lineTo(axisX + r, y - r);
      ctx.stroke();
    } else if (isPending) {
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(axisX, y, dotR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.arc(axisX, y, isActive ? activeR : dotR, 0, Math.PI * 2);
      ctx.fill();
      if (isFailed) {
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    // Label (bold, right of dot).
    const labelFont = `bold ${labelFontSize}px 'Eurostile', 'Share Tech Mono', monospace`;
    const detailFont = `${detailFontSize}px 'Eurostile', 'Share Tech Mono', monospace`;
    const rawLabel = String(st.label || "").toUpperCase();
    const labelLines = wrapToWidth(rawLabel, availW, labelFont);
    const detailLines = st.detail ? wrapToWidth(String(st.detail), availW, detailFont) : [];
    const labelLineH = labelFontSize + 2;
    const detailLineH = detailFontSize + 2;
    const totalRowH = labelLines.length * labelLineH + (detailLines.length ? 4 + detailLines.length * detailLineH : 0);
    const rowTop = y - Math.round(totalRowH / 2);
    ctx.fillStyle = "#ffffff";
    ctx.font = labelFont;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (let li = 0; li < labelLines.length; li++) {
      ctx.fillText(labelLines[li], labelX, rowTop + li * labelLineH);
    }
    if (detailLines.length) {
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = detailFont;
      const detailTop = rowTop + labelLines.length * labelLineH + 4;
      for (let di = 0; di < detailLines.length; di++) {
        ctx.fillText(detailLines[di], labelX, detailTop + di * detailLineH);
      }
    }
    // Status chip — right-aligned, small, only for non-done/non-complete.
    if (status && !isDone) {
      ctx.fillStyle = baseColor;
      ctx.font = `bold ${Math.max(10, detailFontSize - 2)}px 'Eurostile', 'Share Tech Mono', monospace`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(status.toUpperCase(), w - 10, y);
    }
  }
  return canvas;
}

function _mixed3dRenderVegaToCanvas(spec, w, h, extras) {
  let values;
  try {
    const s = typeof spec === "string" ? JSON.parse(spec) : spec;
    values = s.data?.values || s.values || s.data;
  } catch (e) { return Promise.resolve(null); }
  if (!Array.isArray(values) || !values.length) return Promise.resolve(null);
  const sample = values[0];
  if (!sample || typeof sample !== "object") return Promise.resolve(null);
  // Find first numeric field as the value axis.
  const numericKey = Object.keys(sample).find(k => typeof sample[k] === "number");
  const labelKey = Object.keys(sample).find(k => typeof sample[k] === "string");
  if (!numericKey) return Promise.resolve(null);
  const items = values.slice(0, 8).map(v => ({ label: labelKey ? String(v[labelKey]) : "", value: +v[numericKey] || 0 }));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  const pad = 16;
  const py0 = h * 0.18;
  const py1 = h * 0.85;
  const maxV = Math.max(...items.map(it => it.value)) || 1;
  const bw = (w - pad * 2) / items.length - 4;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const bx = pad + i * (bw + 4);
    const bh = (py1 - py0) * (it.value / maxV);
    // Bars as outlines only — user 2026-05-21: "numbers hard to
    // read, maybe bars should just be outlines instead of filled".
    // Filled cyan rectangles competed with the cyan value labels
    // sitting above each bar.
    ctx.strokeStyle = "#00ddff";
    ctx.lineWidth = 2;
    ctx.globalAlpha = 1;
    ctx.strokeRect(bx, py1 - bh, bw, bh);
    // Value — cyan full alpha (was #e8f8ff cyan-white).
    ctx.fillStyle = "#00ddff";
    ctx.font = "bold 13px 'Eurostile', 'Share Tech Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(String(Math.round(it.value)), bx + bw / 2, py1 - bh - 4);
    // Label — cyan dim (was purple).
    ctx.fillStyle = "rgba(0,221,255,0.6)";
    ctx.font = "10px 'Eurostile', 'Share Tech Mono', monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.save();
    ctx.translate(bx + bw / 2, py1 + 8);
    ctx.rotate(Math.PI / 4);
    ctx.fillText(it.label.slice(0, 18), 0, 0);
    ctx.restore();
  }
  return Promise.resolve(canvas);
}

function _mixed3dRenderForceGraphToCanvas(spec, w, h, extras) {
  let nodes, edges;
  try {
    const s = typeof spec === "string" ? JSON.parse(spec) : spec;
    nodes = s.nodes; edges = s.edges || s.links || [];
  } catch (e) { return Promise.resolve(null); }
  if (!Array.isArray(nodes) || !nodes.length) return Promise.resolve(null);
  const N = Math.min(nodes.length, 10);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  // Real spring-repulsion layout. Earlier path placed nodes on a regular
  // circle, so every force_graph cell collapsed to the same regular
  // N-gon (user 2026-05-25 "kind of weird that all the force graphs end
  // up in this same polygon shape"). This runs ~80 relaxation steps
  // with Coulomb-style node repulsion + spring forces along edges,
  // converging to graph-specific layouts (chain reads as line, hub
  // reads as star, cycle reads as ring, etc.). Deterministic per-cell
  // seed via the spec hash so a cell paints the same way across
  // re-renders.
  let seedRaw = 0;
  const seedSrc = String(extras?.id || nodes.map(n => n.id || n.label).join(",")).slice(0, 64);
  for (let i = 0; i < seedSrc.length; i++) seedRaw = (seedRaw * 31 + seedSrc.charCodeAt(i)) | 0;
  let seed = seedRaw || 1;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pad = 30;
  const minX = pad, maxX = w - pad;
  const minY = pad + 8, maxY = h - pad - 20;
  const positions = [];
  for (let i = 0; i < N; i++) {
    positions.push({
      x: minX + rng() * (maxX - minX),
      y: minY + rng() * (maxY - minY),
      vx: 0, vy: 0,
      node: nodes[i],
    });
  }
  // Edge index pairs for the force pass — resolve once outside the loop.
  const idToIdx = new Map();
  for (let i = 0; i < positions.length; i++) idToIdx.set(positions[i].node.id, i);
  const edgeIdx = [];
  for (const e of edges.slice(0, 30)) {
    const a = idToIdx.get(e.source || e.from);
    const b = idToIdx.get(e.target || e.to);
    if (a === undefined || b === undefined || a === b) continue;
    edgeIdx.push([a, b]);
  }
  // Force-sim constants tuned for canvas-pixel scale (not unit-normalized).
  // REPEL keeps nodes apart; SPRING_K pulls connected nodes; SPRING_L is
  // the natural edge length. DAMP < 1 bleeds energy each step. WALL
  // softly pushes nodes back inside the bounded rect.
  const REPEL = (w * h) / 12;
  const SPRING_K = 0.04;
  const SPRING_L = Math.min(w, h) * 0.22;
  const DAMP = 0.82;
  const STEPS = 80;
  for (let step = 0; step < STEPS; step++) {
    for (let i = 0; i < N; i++) {
      const p = positions[i];
      let fx = 0, fy = 0;
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const q = positions[j];
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const d2 = dx * dx + dy * dy + 0.01;
        const f = REPEL / d2;
        const d = Math.sqrt(d2);
        fx += (dx / d) * f;
        fy += (dy / d) * f;
      }
      // Spring forces from incident edges.
      for (const [a, b] of edgeIdx) {
        if (a !== i && b !== i) continue;
        const other = positions[a === i ? b : a];
        const dx = other.x - p.x;
        const dy = other.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const stretch = d - SPRING_L;
        fx += (dx / d) * stretch * SPRING_K;
        fy += (dy / d) * stretch * SPRING_K;
      }
      // Soft walls.
      if (p.x < minX) fx += (minX - p.x) * 0.2;
      if (p.x > maxX) fx -= (p.x - maxX) * 0.2;
      if (p.y < minY) fy += (minY - p.y) * 0.2;
      if (p.y > maxY) fy -= (p.y - maxY) * 0.2;
      p.vx = (p.vx + fx) * DAMP;
      p.vy = (p.vy + fy) * DAMP;
    }
    for (let i = 0; i < N; i++) {
      const p = positions[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < minX) p.x = minX;
      else if (p.x > maxX) p.x = maxX;
      if (p.y < minY) p.y = minY;
      else if (p.y > maxY) p.y = maxY;
    }
  }
  // Edges (only edges between visible nodes — already resolved as
  // edgeIdx pairs during the force pass).
  ctx.strokeStyle = "#66e6ff";
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 4;
  for (const [a, b] of edgeIdx) {
    ctx.beginPath();
    ctx.moveTo(positions[a].x, positions[a].y);
    ctx.lineTo(positions[b].x, positions[b].y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Nodes
  for (const p of positions) {
    ctx.fillStyle = "#00ddff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,221,255,0.65)";
    ctx.lineWidth = 3;
    ctx.stroke();
    // Label — dark halo via strokeText first, then fillText. Makes
    // labels read cleanly over edge lines passing behind them. User
    // 2026-05-22 cell-3744 "labels should draw over the graph lines".
    ctx.font = "bold 16px 'Eurostile', 'Share Tech Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const label = String(p.node.label || p.node.id || "").toUpperCase().slice(0, 14);
    ctx.lineWidth = 5;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0, 8, 20, 0.85)";
    ctx.strokeText(label, p.x, p.y + 12);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, p.x, p.y + 12);
  }
  return Promise.resolve(canvas);
}

// Cache version for animated_svg self-cache. Bump when theme substitution
// rules change OR the body-canvas layout logic shifts. Independent of
// STYLE_V (mermaid) since the substrate paint pipelines differ.
const _ANIMATED_SVG_CACHE_V = "v6";

function _mixed3dRenderAnimatedSvgToCanvas(spec, w, h, extras) {
  if (!spec || typeof spec !== "string" || !spec.includes("<svg")) {
    const S = _mixed3dState;
    if (S) {
      if (!S._animatedSvgNulls) S._animatedSvgNulls = { pre_check: 0, decode_fail: 0, samples: [] };
      S._animatedSvgNulls.pre_check++;
      if (S._animatedSvgNulls.samples.length < 5) {
        S._animatedSvgNulls.samples.push({ id: extras?.id, reason: "pre_check", head: typeof spec === "string" ? spec.slice(0, 80) : `<${typeof spec}>` });
      }
    }
    return Promise.resolve(null);
  }
  const cellId = extras?.id;
  const cs = Math.max(1, Math.min(3, extras?.colspan || 1));
  const cacheKey = cs > 1
    ? `animated_svg.c${cs}.${_ANIMATED_SVG_CACHE_V}`
    : `animated_svg.${_ANIMATED_SVG_CACHE_V}`;
  const cacheFilename = cellId ? `${cellId}.${cacheKey}.png` : null;
  const _nocache = window._mixed3dNoCache
    || new URLSearchParams(window.location.search).get("nocache") === "1";
  const haveCache = !_nocache && cacheFilename && window._mixed3dSvgManifest?.has(cacheFilename);
  // Fast-path: manifest says a rasterized PNG exists. Fetch + Image
  // decode (~5-10ms for PNG vs ~50-100ms for SVG-parse path below).
  // Self-caching: browser writes the PNG on first render via the
  // fire-and-forget POST below; this branch picks it up on the second
  // and all subsequent encounters of the same cell.
  if (haveCache) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas);
      };
      img.onerror = () => {
        // Cache file 404/corrupt — fall through to fresh render.
        if (window._mixed3dSvgManifest) window._mixed3dSvgManifest.delete(cacheFilename);
        _mixed3dRenderAnimatedSvgFresh(spec, w, h, cellId, cacheKey, cacheFilename).then(resolve);
      };
      img.src = `/cells/${encodeURIComponent(cellId)}.${cacheKey}.png`;
    });
  }
  return _mixed3dRenderAnimatedSvgFresh(spec, w, h, cellId, cacheKey, cacheFilename);
}

function _mixed3dRenderAnimatedSvgFresh(spec, w, h, cellId, cacheKey, cacheFilename) {
  // Substitute theme placeholders → hackers palette. $pink collapses to
  // purple in normal scenes (pink is reserved for tower-attack state);
  // animated SVGs that explicitly want danger framing should re-introduce
  // pink via the danger-state path, not via this default substitution.
  // $stroke3 was missing from the substitution table — 39 specs used it
  // and rendered with literal `stroke="$stroke3"` (invalid attribute),
  // producing invisible/black strokes on the dark theme that read as
  // empty cells. Maps to purple per themes/hackers.tokens.json palette.
  let themed = spec
    .replace(/\$accent\b/g, "#00ddff")
    .replace(/\$muted\b/g, "#9966ff")
    .replace(/\$pink\b/g, "#9966ff")
    .replace(/\$stroke1\b/g, "#00ddff")
    .replace(/\$stroke2\b/g, "#9966ff")
    .replace(/\$stroke3\b/g, "#9966ff")
    .replace(/\$bg\b/g, "#0a0e14")
    .replace(/\$panel\b/g, "#0f1620")
    .replace(/\$fg\b/g, "#ccf3ff");
  // Strip full-canvas opaque dark background rects. Specs occasionally
  // hardcode <rect width="..." height="..." fill="#0d0d0d"/> as the
  // first child, turning the cell into a grey block that hides the
  // animated foreground. Hit so far: #0d0d0d (cell-5307), #0a0e14
  // (cell-5297), #0d0d14 with rx="6" (cell-5834). Generalized regex:
  //   - lookaheads for width / height / fill so attribute order and
  //     extra attributes (rx, ry, stroke, opacity) don't break the
  //     match
  //   - any near-black hex color (each RGB channel < 0x40) or its
  //     3-digit shortform — catches arbitrary dark grays/blues/blacks
  // Foreground panels with smaller dimensions are untouched because
  // the lookaheads require width AND height to match the SVG viewport.
  const darkHex = "#[0-3][0-9a-f][0-3][0-9a-f][0-3][0-9a-f]";
  const darkShort = "#[0-3][0-3][0-3]";
  const darkFills = `(?:${darkHex}|${darkShort})`;
  const svgRootMatch = themed.match(/<svg\b[^>]*\bwidth="([^"]+)"\s+height="([^"]+)"/);
  if (svgRootMatch) {
    const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const w = escapeRe(svgRootMatch[1]);
    const h = escapeRe(svgRootMatch[2]);
    const fullCanvasRectRe = new RegExp(
      `<rect\\b(?=[^>]*\\bwidth="${w}")(?=[^>]*\\bheight="${h}")(?=[^>]*\\bfill="${darkFills}")[^>]*\\/?>`,
      "i",
    );
    themed = themed.replace(fullCanvasRectRe, "");
  }
  // Strip background-color declarations from the SVG root style attribute.
  // Hit by cell-5829: <svg ... style="background:#0a0e14"> — not a rect
  // child, so the prior rect-strip missed it. SVG-as-Image renders the
  // style:background as a full-viewport fill, same grey-block effect.
  // Surgically removes "background[-color]:..." from the style attribute,
  // leaving other style properties intact.
  themed = themed.replace(
    /(<svg\b[^>]*\bstyle=")([^"]*)(")/i,
    (_m, pre, style, post) => {
      // Remove background and background-color properties; keep semicolons clean.
      const cleaned = style
        .replace(/\bbackground(-color)?\s*:[^;]*;?/gi, "")
        .replace(/;\s*;/g, ";")
        .replace(/^\s*;\s*|\s*;\s*$/g, "")
        .trim();
      return pre + cleaned + post;
    },
  );
  // Strict-parse defense: SVG-as-Image fails silently (white square)
  // when the root <svg> uses xlink:href but doesn't declare the xlink
  // namespace. Inject it if missing. User 2026-05-24 cell-4049: blank
  // canvas; spec used xlink:href on <animateTransform> without xmlns:xlink.
  if (themed.includes("xlink:") && !/xmlns:xlink=/.test(themed)) {
    themed = themed.replace(/<svg\b([^>]*)>/, '<svg$1 xmlns:xlink="http://www.w3.org/1999/xlink">');
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      // Aspect-preserving contain-fit centered in the body region.
      // Top-anchored width-fill (the previous behavior) made wide
      // animated SVGs (420×160 is a common spec shape) look like a
      // small floating panel at the top of a tall cell with huge
      // empty space below — read as "weird filled background"
      // (user 2026-05-25, cell-4937). Centering at least balances
      // the empty regions vertically; a future task can fill them
      // with decorative tokens.
      const aspectImg = img.naturalWidth / img.naturalHeight;
      const availH = h * 0.95;
      const containerAspect = w / availH;
      let dw, dh;
      if (aspectImg > containerAspect) {
        dw = w;
        dh = w / aspectImg;
      } else {
        dh = availH;
        dw = dh * aspectImg;
      }
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
      URL.revokeObjectURL(img.src);
      resolve(canvas);
      // Fire-and-forget cache write — deferred via requestIdleCallback
      // (setTimeout fallback) so the encoding + POST overhead never
      // delays the snap pipeline's consumption of `canvas`. The
      // renderer's profiler stops at resolve(); whatever happens after
      // is amortized into idle time. Persists rasterized canvas as
      // PNG to snap_receiver so subsequent encounters of this cell
      // (this session or future loads) hit the fast PNG-decode path.
      if (cellId && cacheFilename) {
        const cacheWrite = () => {
          canvas.toBlob((blob) => {
            if (!blob) return;
            fetch(`http://127.0.0.1:8767/cells/${encodeURIComponent(cellId)}.${cacheKey}.png`, {
              method: "POST",
              body: blob,
              headers: { "content-type": "image/png" },
            }).then(() => {
              if (window._mixed3dSvgManifest) window._mixed3dSvgManifest.add(cacheFilename);
            }).catch(() => {}); // receiver down → next encounter renders fresh, no harm
          }, "image/png");
        };
        if (window.requestIdleCallback) window.requestIdleCallback(cacheWrite, { timeout: 2000 });
        else setTimeout(cacheWrite, 0);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      const S = _mixed3dState;
      if (S) {
        if (!S._animatedSvgNulls) S._animatedSvgNulls = { pre_check: 0, decode_fail: 0, samples: [] };
        S._animatedSvgNulls.decode_fail++;
        if (S._animatedSvgNulls.samples.length < 5) {
          S._animatedSvgNulls.samples.push({ id: cellId, reason: "decode_fail", head: themed.slice(0, 200).replace(/\s+/g, " ") });
        }
        if (S._animatedSvgNulls.decode_fail === 1) {
          console.warn(`[mixed3d] animated_svg decode fail cell=${cellId} head="${themed.slice(0, 120).replace(/\s+/g, " ")}"`);
        }
      }
      resolve(null);
    };
    const blob = new Blob([themed], { type: "image/svg+xml;charset=utf-8" });
    img.src = URL.createObjectURL(blob);
  });
}

// html cells: draw a "summary card" with cell title + caption. Not a real
// html render (avoiding html2canvas + DOM dependency) but conveys the
// cell's content as readable text vs the abstract sketch placeholder.
// Extract rows of plain text from a cell's html field per html_layout.
// Returns an array of arrays — each inner array is one display row's
// columns. Returns null if the html doesn't yield anything renderable.
//
// Layout coverage (counts from cells.json 2026-05-21):
//   callouts (271): <div class="callout"> with .big + .label per item
//   table    (246): <table> header + body rows
//   dl       (210): <dl> with <dt>/<dd> pairs
//   kanban    (10): <div class="kanban-column"> with cards
// Earlier version only handled table + a misnamed "definitions"
// matching layout==="definitions" (cells.json uses "dl") — most
// callouts+dl cells fell through to null and got stub-cached.
function _mixed3dExtractHtmlRows(html, layout) {
  if (!html || typeof html !== "string") return null;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const root = tpl.content;
  const tableEl = root.querySelector("table");
  const ulEl = root.querySelector("ul, ol");
  const dlEl = root.querySelector("dl");
  const calloutEls = root.querySelectorAll(".callout");
  const kanbanEls = root.querySelectorAll(".kanban-column, .column");
  if (layout === "table" || tableEl) {
    if (!tableEl) return null;
    const rows = [];
    for (const tr of tableEl.querySelectorAll("tr")) {
      const cols = [];
      for (const cell of tr.querySelectorAll("th, td")) {
        cols.push((cell.textContent || "").replace(/\s+/g, " ").trim());
      }
      if (cols.length) rows.push(cols);
    }
    return rows.length ? rows : null;
  }
  if ((layout === "dl" || layout === "definitions") || dlEl) {
    if (!dlEl) return null;
    const pairs = [];
    const kids = [...dlEl.children];
    for (let i = 0; i < kids.length; i++) {
      if (kids[i].tagName !== "DT") continue;
      const key = (kids[i].textContent || "").replace(/\s+/g, " ").trim();
      const dd = kids[i + 1]?.tagName === "DD" ? kids[i + 1] : null;
      const val = dd ? (dd.textContent || "").replace(/\s+/g, " ").trim() : "";
      pairs.push([key, val]);
    }
    return pairs.length ? pairs : null;
  }
  if (layout === "callouts" || calloutEls.length) {
    const rows = [];
    for (const cEl of calloutEls) {
      const big = (cEl.querySelector(".big")?.textContent || "").replace(/\s+/g, " ").trim();
      const label = (cEl.querySelector(".label")?.textContent || "").replace(/\s+/g, " ").trim();
      if (big || label) rows.push([big, label]);
    }
    return rows.length ? rows : null;
  }
  if (layout === "kanban" || kanbanEls.length) {
    const rows = [];
    for (const col of kanbanEls) {
      const head = (col.querySelector(".column-title, .kanban-title, h3, h4")?.textContent || "").replace(/\s+/g, " ").trim();
      const cards = col.querySelectorAll(".card, .kanban-card, li");
      const summary = head || "column";
      const cardText = [...cards].map(c => (c.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" / ");
      rows.push([summary, cardText.slice(0, 80)]);
    }
    return rows.length ? rows : null;
  }
  if (layout === "list" || ulEl) {
    if (!ulEl) return null;
    const items = [];
    for (const li of ulEl.querySelectorAll(":scope > li")) {
      const t = (li.textContent || "").replace(/\s+/g, " ").trim();
      if (t) items.push([t]);
    }
    return items.length ? items : null;
  }
  return null;
}

function _mixed3dRenderHtmlToCanvas(cellData, w, h, extras) {
  if (!cellData) return Promise.resolve(null);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  const html = cellData.html || "";
  const layout = cellData.html_layout || "";
  const rows = _mixed3dExtractHtmlRows(html, layout);
  // No structured content → return null. Substrate driver will keep
  // the title-only stub. Matches [[feedback_text_cells_uninteresting]]:
  // silence > caption-prose for html cells that aren't actually tables/
  // lists/definitions.
  if (!rows) return Promise.resolve(null);
  // Decorative-text aesthetic: no chip, no card frame. Mono dim cyan
  // text + faint horizontal scanlines so the cell visually melts into
  // the decorative bed. Title in purple at top, content rows below.
  // User 2026-05-21: "html type cells need to look a lot more like
  // the decorative text style. if we have them at all". Approach A+B
  // with B-emphasis — show the table/list content, styled to merge.
  const pad = 10;
  // Faint scanlines across the body region.
  ctx.save();
  ctx.strokeStyle = "#00ddff";
  ctx.globalAlpha = 0.05;
  ctx.lineWidth = 1;
  for (let y = pad; y < h - pad; y += 4) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  // No body-level title: _mixed3dCompositeAndCacheSnap already paints
  // a 72px title block at the top of the final canvas. The old "> ..."
  // purple line here duplicated that title. User 2026-05-22 cell-3356:
  // "duplicating titles now, one purple one white".
  let cy = pad;
  const yMax = h - pad - 12;
  // Row rendering is uniform across layouts (see block below) —
  // bold cyan Eurostile with row-to-row alpha jitter to match the
  // tier-2 decorative bed. Earlier per-layout treatments (callouts
  // big-number, table grid, severity bars) read as a different
  // visual system and were collapsed 2026-05-24.
  if (rows && rows.length) {
    // DECORATIVE-STYLE rendering. User 2026-05-24 (repeated): tier-1
    // html cells must "look similar enough to the decoration cells".
    // Earlier paths (callouts big-number-purple, table grid + severity
    // bars, dl two-col with bright labels) all read as a different
    // visual system. This collapses them onto the same shape as
    // _mixed3dPaintDecorativeText: bold Eurostile, cyan #00ddff, alpha
    // jittered row-to-row, font proportional to cell height.
    //
    // The only structural concession: dl + callouts get a two-column
    // layout (left ≈ key/big, right ≈ value/label) because that
    // separation matches what's in the source data and the cell is
    // unreadable when collapsed to one stream. Tables / lists / kanban
    // flatten to a single space-joined string per row.
    //
    // Font size is clamp(14, 22, h/26) — proportional like decoratives
    // (h/12 → 8-14px) but bumped 1.8× for tier-1 viewing distance.
    const fontSize = Math.max(14, Math.min(22, Math.floor(h / 26)));
    const rowH = Math.max(Math.floor(fontSize * 1.45), 22);
    const ucase = (s) => String(s || "").trim().replace(/\s+/g, " ").toUpperCase();
    // Deterministic alpha jitter — same cell paints the same way.
    let seed = 0;
    const seedSrc = (cellData?.id || cellData?.title || "x");
    for (let i = 0; i < seedSrc.length; i++) seed = (seed * 31 + seedSrc.charCodeAt(i)) | 0;
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    ctx.font = `bold ${fontSize}px 'Eurostile', 'Share Tech Mono', 'Courier New', monospace`;
    ctx.textBaseline = "top";
    ctx.textAlign = "start";
    // Stroke pass on top of fill — visually chunkier glyphs without
    // changing font weight or size. User 2026-05-25 round 2: "still
    // could be bolder and brighter". Stroke width scales with font;
    // 1px at 14pt, ~1.5px at 22pt. Cyan matches fill, alpha 0.55 so
    // stroke layers without over-saturating.
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const STROKE_W = Math.max(1, Math.round(fontSize / 14));
    const isTwoCol = layout === "dl" || layout === "definitions" || layout === "callouts";
    const leftColW = isTwoCol ? Math.floor(w * 0.36) : 0;
    const rightColX = isTwoCol ? pad + leftColW : pad;
    const rightColMaxW = isTwoCol ? (w - pad - rightColX) : (w - pad * 2);
    const leftColMaxW = leftColW - pad;
    // Word-wrap to fit pixel width (was missing — text overflowed cell
    // right edge, user 2026-05-24 "text just falls off the right edge").
    // Max 2 lines per row; ellipsize beyond. Returns array of lines.
    const wrap = (text, maxPx, maxLines) => {
      if (!text) return [];
      if (ctx.measureText(text).width <= maxPx) return [text];
      const words = text.split(" ");
      const lines = [];
      let cur = "";
      for (const w of words) {
        const next = cur ? cur + " " + w : w;
        if (ctx.measureText(next).width <= maxPx) {
          cur = next;
        } else {
          if (cur) lines.push(cur);
          cur = w;
          // If a single word is longer than maxPx, hard-truncate it.
          if (ctx.measureText(cur).width > maxPx) {
            while (cur.length > 1 && ctx.measureText(cur + "…").width > maxPx) {
              cur = cur.slice(0, -1);
            }
            cur += "…";
          }
          if (lines.length >= maxLines - 1) break;
        }
      }
      if (cur && lines.length < maxLines) lines.push(cur);
      // Ellipsize the last line if there was more content.
      if (lines.length >= maxLines) {
        let last = lines[maxLines - 1];
        while (last.length > 1 && ctx.measureText(last + "…").width > maxPx) {
          last = last.slice(0, -1);
        }
        lines[maxLines - 1] = last + "…";
      }
      return lines;
    };
    // Drop the table header row — column labels are chrome, not content.
    const dataRows = (layout === "table" && rows.length > 1) ? rows.slice(1) : rows;
    // Pre-measure pass: compute total content height by simulating wrap()
    // per row so we can vertically center short content in the cell
    // instead of leaving a fat strip of empty pixels at the bottom.
    // User 2026-05-25 on cell-4120 (callouts): "should be more
    // vertically centered so there isn't a bunch of whitespace at the
    // bottom". Single extra pass over rows; wrap() runs on the same
    // font/ctx as the paint pass so the simulation is exact.
    let totalRowsH = 0;
    for (let ri = 0; ri < dataRows.length; ri++) {
      const r = dataRows[ri] || [];
      let n;
      if (isTwoCol) {
        const ll = wrap(ucase(r[0]), leftColMaxW, 3).length;
        const rl = wrap(ucase(r[1]), rightColMaxW, 3).length;
        n = Math.max(ll, rl, 1);
      } else {
        const txt = r.filter(Boolean).map(ucase).join("  ");
        n = Math.max(wrap(txt, rightColMaxW, 3).length, 1);
      }
      totalRowsH += n * rowH;
    }
    const availH = yMax - pad;
    if (totalRowsH < availH) {
      cy = pad + Math.floor((availH - totalRowsH) / 2);
    }
    for (let ri = 0; ri < dataRows.length; ri++) {
      if (cy + fontSize > yMax) break;
      const r = dataRows[ri] || [];
      // Alpha 0.78–0.98 (was 0.55–0.95). Lifting the floor so html
      // content rows read bright against the decorative backdrop now
      // painted underneath. Pre-backdrop the 0.55 floor was readable
      // on transparent; against an alpha=0.22 token bed, 0.55 rows
      // got perceptually flattened. User 2026-05-25 round 2: "still
      // could be bolder and brighter to match the decorative cells".
      const rowAlpha = 0.78 + rng() * 0.2;
      ctx.fillStyle = "#00ddff";
      ctx.strokeStyle = "#00ddff";
      // Paint each glyph as stroke-then-fill: stroke at 0.55× the row's
      // fill alpha thickens the visible weight without doubling color
      // saturation. Stroke under fill (not over) keeps glyph interiors
      // crisp; the stroke just halos the outline.
      const drawText = (txt, x, y) => {
        ctx.globalAlpha = rowAlpha * 0.55;
        ctx.lineWidth = STROKE_W;
        ctx.strokeText(txt, x, y);
        ctx.globalAlpha = rowAlpha;
        ctx.fillText(txt, x, y);
      };
      let linesUsed = 1;
      if (isTwoCol) {
        const leftLines = wrap(ucase(r[0]), leftColMaxW, 3);
        const rightLines = wrap(ucase(r[1]), rightColMaxW, 3);
        const n = Math.max(leftLines.length, rightLines.length, 1);
        // Vertically center each column within the row's used height.
        // Without this, a 1-line value next to a 2-line label stuck
        // to the top with dead space below — read as "weird wrap"
        // (user 2026-05-24). Now: short side floats to vertical
        // middle, tall side fills.
        const leftOffset = Math.floor((n - leftLines.length) * rowH / 2);
        const rightOffset = Math.floor((n - rightLines.length) * rowH / 2);
        for (let li = 0; li < leftLines.length; li++) {
          drawText(leftLines[li], pad, cy + leftOffset + li * rowH);
        }
        for (let li = 0; li < rightLines.length; li++) {
          drawText(rightLines[li], rightColX, cy + rightOffset + li * rowH);
        }
        linesUsed = n;
      } else {
        const txt = r.filter(Boolean).map(ucase).join("  ");
        const lines = wrap(txt, rightColMaxW, 3);
        for (let li = 0; li < lines.length; li++) {
          drawText(lines[li], pad, cy + li * rowH);
        }
        linesUsed = Math.max(lines.length, 1);
      }
      cy += linesUsed * rowH;
    }
    ctx.globalAlpha = 1;
  }
  return Promise.resolve(canvas);
}

let _mixed3dSnapInterval = null;
// Cells currently being rendered (id → true). Prevents double-dispatch
// while a render is in flight without blocking the rest of the queue —
// each tick can kick BATCH_SIZE new renders in parallel.
const _mixed3dSnapInflight = new Set();
// Tighter caps after OOM 2026-05-20: 8/4 saturated GPU+JS heap on a hot
// reload. Each in-flight render holds a ~440KB transient canvas; cap of
// 3 keeps peak transient at ~1.3MB instead of ~3.5MB, with negligible
// throughput cost (mermaid is wall-bound at ~150-300ms anyway).
const _MIXED3D_SNAP_MAX_INFLIGHT = 3;
// BATCH 1 (was 2): mermaid renders run on main thread (no worker —
// see memory/mermaid_worker_blocked.md) and avg ~200ms each. Two
// chained back-to-back blocked rAF for ~400ms → "all decorative
// animations pause" stutter. One-at-a-time halves the worst-case
// blocking. Snap throughput drops accordingly, but most cells aren't
// mermaid (html ~1ms, vega ~1ms, force_graph ~2ms — the average snap
// is cheap; mermaid is the outlier).
const _MIXED3D_SNAP_BATCH = 1;
// LRU cap on _snapTexCache. Each cached entry is a 384-576px wide
// canvas, 446-1152px tall — averaging ~1.5MB. Over hours of camera
// movement the cache grew unbounded to 1249 entries / 1.8GB before this
// cap landed (user 2026-05-23). 300 entries × ~1.5MB ≈ 450MB ceiling.
// Eviction priority: oldest-touched first. The current swoopy scan
// target is exempted (see _mixed3dSnapCacheSet) so the cell the camera
// is actively visiting can't be evicted mid-look.
const _MIXED3D_SNAP_CACHE_CAP = 300;

// Set a canvas into _snapTexCache with LRU semantics. Centralizes the
// "lazy-init the Map, refresh insertion order, evict oldest over cap"
// pattern across 6 call sites. JS Map preserves insertion order, so
// delete+set bumps an existing key to the most-recent slot.
//
// Eviction: when evicting an entry whose cell is currently bound to a
// GL CanvasTexture (tier-1 plane), dispose the texture so the canvas
// can actually be GC'd — otherwise tex.image keeps it alive and the
// cap is cosmetic. Cell stays in scene; the next snap-driver pass
// re-renders it when back in tier-1 range.
// Read a cached snap canvas AND bump its insertion order to the most
// recent slot, giving the Map true access-LRU semantics. JS Map orders
// keys by insertion; without this delete+set on read, mermaid cells
// (rendered once, never re-snapped per the 8213 skip) sit at the
// bottom of the insertion order and get evicted by newer cells even
// while the user is actively looking at them. Symptom: tier-1 cells
// the user sees with a title + decorative-text body instead of the
// real mermaid graph — the cache evicted the snap, the cell rendered
// from the stub, and the snap driver hasn't re-rendered yet.
function _mixed3dSnapCacheGet(S, id) {
  if (!S || !id || !S._snapTexCache) return undefined;
  const canvas = S._snapTexCache.get(id);
  if (canvas == null) return undefined;
  S._snapTexCache.delete(id);
  S._snapTexCache.set(id, canvas);
  return canvas;
}

function _mixed3dSnapCacheSet(S, id, canvas) {
  if (!S || !id || !canvas) return;
  if (!S._snapTexCache) S._snapTexCache = new Map();
  if (!S._snapLastAt) S._snapLastAt = new Map();
  S._snapTexCache.delete(id);
  S._snapTexCache.set(id, canvas);
  S._snapLastAt.set(id, performance.now());
  if (S._snapTexCache.size <= _MIXED3D_SNAP_CACHE_CAP) return;
  const sticky = S.swoopCam?.scanTargetCell || null;
  let evicted = 0;
  const overage = S._snapTexCache.size - _MIXED3D_SNAP_CACHE_CAP;
  for (const oldest of S._snapTexCache.keys()) {
    if (evicted >= overage) break;
    if (oldest === id || oldest === sticky) continue;
    const obj = S.cellObjects?.get(oldest);
    if (obj && !obj.isInstanceHandle && obj.userData?.tier === 1 && obj.material?.map) {
      // Don't null the material map — that left tier-1 cells showing
      // pure white (default MeshBasicMaterial color) until the snap
      // driver re-rendered them, producing the wave-of-white-flashes
      // during warmup as the LRU rolled over (~1000 evictions when
      // pre-rendering 1300 cells against a 300-cap). Instead, replace
      // the cached canvas with a stub (title + decorative rows) so
      // the cell still reads while waiting for the next snap. Stub
      // texture pre-uploaded via initTexture so even the swap doesn't
      // produce its own flash. User 2026-05-24 "still white blink".
      const T = window.THREE;
      const cellData = state.rendering.cellsById?.get(oldest);
      const stubCanvas = _mixed3dPaintPromoteStub(oldest, cellData, obj.userData?.colspan || 1, obj.userData?.canvasH);
      if (T && stubCanvas) {
        const stubTex = new T.CanvasTexture(stubCanvas);
        stubTex.minFilter = T.LinearFilter;
        stubTex.magFilter = T.LinearFilter;
        if (S.renderer?.initTexture) {
          try { S.renderer.initTexture(stubTex); } catch (_) {}
        }
        const oldMap = obj.material.map;
        obj.material.map = stubTex;
        obj.material.needsUpdate = true;
        if (oldMap) oldMap.dispose();
      } else {
        // Fallback: keep the old behavior if stub can't be built.
        obj.material.map.dispose();
        obj.material.map = null;
        obj.material.needsUpdate = true;
      }
    }
    S._snapTexCache.delete(oldest);
    S._snapLastAt?.delete(oldest);
    evicted++;
  }
}

// Dispatch table: substrate type → render function. Returns Promise<canvas|null>.
// Note: html renderer takes (cellData, w, h) — uses caption/title from cells.json,
// not spec. Driver passes the right arg below.
const _MIXED3D_RENDERERS = {
  mermaid: _mixed3dRenderMermaidToCanvas,
  gauge: _mixed3dRenderGaugeToCanvas,
  sparkline: _mixed3dRenderSparklineToCanvas,
  treemap: _mixed3dRenderTreemapToCanvas,
  timeline_ribbon: _mixed3dRenderTimelineRibbonToCanvas,
  vega: _mixed3dRenderVegaToCanvas,
  force_graph: _mixed3dRenderForceGraphToCanvas,
  animated_svg: _mixed3dRenderAnimatedSvgToCanvas,
  html: _mixed3dRenderHtmlToCanvas,
};

// Two small fixed-position callouts in opposite corners of the body
// region. Lives entirely in margin (top-right + bottom-left), 80×42px
// each. Cyan Eurostile, decorative-style. Deterministic per-cell seed
// from cell.id so each cell's tokens are stable across reloads —
// reads as ambient instrumentation. User 2026-05-25 density-without-
// fighting-content option E: "floating callouts in unused corners".
//
// Tokens drawn from _MIXED3D_DECO_TOKENS (the decorative-text pool),
// not labelled with metric prefixes (CONF, RANK, etc) — the earlier
// CONF·0.87 framing implied real numbers and these are deterministic-
// random. Plain decorative tokens read as flair without implying
// they're derived from anything (user 2026-05-25 review).
function _mixed3dPaintCornerCallouts(ctx, fullCanvasW, fullCanvasH, titleH, cellData, targetId) {
  const id = String(targetId || cellData?.id || "x");
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) | 0;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pickToken = () => _MIXED3D_DECO_TOKENS[Math.floor(rng() * _MIXED3D_DECO_TOKENS.length)];

  const fontPx = 10;
  const lineH = 13;
  ctx.save();
  ctx.font = `bold ${fontPx}px "Eurostile", "Share Tech Mono", "Courier New", monospace`;
  ctx.textBaseline = "top";
  ctx.fillStyle = "#00ddff";

  ctx.globalAlpha = 0.85;
  ctx.textAlign = "right";
  const trX = fullCanvasW - 8;
  const trY = titleH + 6;
  ctx.fillText(pickToken(), trX, trY);
  ctx.fillText(pickToken(), trX, trY + lineH);

  ctx.globalAlpha = 0.78;
  ctx.textAlign = "left";
  const blX = 8;
  const blY = fullCanvasH - 6 - lineH * 2;
  ctx.fillText(pickToken(), blX, blY);
  ctx.fillText(pickToken(), blX, blY + lineH);

  ctx.restore();
}

function _mixed3dCompositeAndCacheSnap(S, targetId, bodyCanvas, cellData, colspan, canvasH) {
  if (!bodyCanvas) return;
  // Bail if teardown happened mid-render — S is stale, _mixed3dState has
  // moved on (or gone null). Without this we'd write into a defunct
  // _snapTexCache and try to mutate a disposed material.
  if (S !== _mixed3dState) return;
  const TITLE_H = 72;
  const obj = S.cellObjects.get(targetId);
  const cs = Math.max(1, Math.min(6, colspan || obj?.userData?.colspan || 1));
  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = obj?.userData?.canvasW || (192 * cs);
  fullCanvas.height = canvasH || obj?.userData?.canvasH || 576;
  const ctx = fullCanvas.getContext("2d");
  // Transparent body backdrop — city aesthetic shows through. The
  // dark fill was a red herring during the "blank cells" hunt; root
  // cause was the WebGL texture dimension-binding bug (composite
  // mutated .map.image inside the existing __webglTexture instead
  // of recreating the CanvasTexture; old dimensions clipped re-
  // uploads of larger cached canvases). User 2026-05-22.
  _mixed3dPaintTitleBlock(ctx, cellData?.title || targetId, fullCanvas.width);
  ctx.drawImage(bodyCanvas, 0, TITLE_H);
  _mixed3dPaintCornerCallouts(ctx, fullCanvas.width, fullCanvas.height, TITLE_H, cellData, targetId);
  _mixed3dSnapCacheSet(S, targetId, fullCanvas);
  const curObj = S.cellObjects.get(targetId);
  if (curObj && !curObj.isInstanceHandle
      && curObj.userData?.tier === 1
      && curObj.material) {
    // Build a fresh CanvasTexture rather than mutating .map.image —
    // mutating works ONLY if the new image has the same dimensions
    // as the WebGL texture binding (created at first upload). When
    // the promote-time placeholder canvas had different dimensions
    // than the cached canvas, the WebGL texture was sized to the
    // placeholder; subsequent uploads via gl.texImage2D inside the
    // existing texture binding clipped to those original dimensions.
    // Fresh CanvasTexture → fresh WebGLTexture → correct dimensions.
    // User 2026-05-22: "the cell is blank" on the tower face.
    const T = window.THREE;
    if (T) {
      const tex = new T.CanvasTexture(fullCanvas);
      tex.minFilter = T.LinearFilter;
      tex.magFilter = T.LinearFilter;
      // Pre-upload the new texture to GPU BEFORE swapping the material
      // map. Without this, the swap creates a render-frame where the
      // material points at a not-yet-uploaded texture → samples default
      // 1×1 white → cell flashes white for one frame. The previous
      // visible-false + 2-rAF defense only covered initial MOUNT, not
      // this snap-replace path (user 2026-05-24 "still a white blink on
      // all the tier 1 cells").
      if (S.renderer?.initTexture) {
        try { S.renderer.initTexture(tex); } catch (_) {}
      }
      const oldMap = curObj.material.map;
      curObj.material.map = tex;
      curObj.material.needsUpdate = true;
      // Dispose AFTER the swap — disposing first leaves the material
      // pointing at a disposed texture for a moment, which can cause
      // GL warnings on hot reloads.
      if (oldMap) oldMap.dispose();
    }
  }
}

function _mixed3dUpdateRenderHud(S) {
  if (!S || !S.cellObjects) return;
  let pending = 0, total = 0;
  for (const [id, obj] of S.cellObjects) {
    if (obj.isInstanceHandle) continue;
    if (obj.userData?.tier !== 1) continue;
    total++;
    if (!S._snapTexCache?.has(id)) pending++;
  }
  const fails = S._rasterizeFails?.size || 0;
  const cell = document.getElementById("hud-render-cell");
  const val = document.getElementById("hud-render-val");
  if (!cell || !val) return;
  // Threshold of 5: ambient LOD-boundary churn typically keeps 0-3
  // cells in flight at any moment as the camera moves. Showing
  // "1/197" forever for those transient cycles reads as "stuck".
  // Only surface the chip when there's actual catch-up work OR any
  // rasterize fails (those persist as stub-cached cells — surface
  // them so they don't hide silently).
  if (pending > 5 || fails > 0) {
    cell.hidden = false;
    val.textContent = fails > 0
      ? `${pending}/${total} · ${fails}✕`
      : `${pending}/${total}`;
  } else {
    cell.hidden = true;
  }
}

function _mixed3dStartSnapshotDriver() {
  if (_mixed3dSnapInterval) return;
  LOG.debug("[mixed3d] tier-1 snapshot driver started (substrates: " + Object.keys(_MIXED3D_RENDERERS).join(",") + ")");
  _mixed3dSnapInterval = setInterval(() => {
    const S = _mixed3dState;
    if (!S || !S.cellObjects) return;
    // Update RENDER chip every snap tick — cheap (1 pass over cellObjects).
    _mixed3dUpdateRenderHud(S);
    // Persistent tier-2 suppression: re-apply each tick since cells demote
    // between tier-1 and tier-2 dynamically, creating fresh visible Meshes.
    if (_mixed3dTier2Suppressed) _mixed3dApplyTier2Visibility(false);
    if (S.mountDraining) return;
    // Cap concurrent renders to keep the main thread responsive (mermaid
    // can spike to ~200ms each, animated_svg parses SVG, etc).
    const capacity = _MIXED3D_SNAP_MAX_INFLIGHT - _mixed3dSnapInflight.size;
    if (capacity <= 0) return;
    const dispatch = Math.min(capacity, _MIXED3D_SNAP_BATCH);
    const TITLE_H = 72;
    const BODY_H = 576 - TITLE_H;
    // Camera-distance priority dispatch: when snap throughput is below
    // tier-1 churn rate (~1.3/s actual vs ~15/s theoretical, single-thread
    // bottleneck), iteration order matters. Build the eligible set, then
    // process closest-to-camera first so pending placeholders stay
    // off-screen rather than at eye-level. Doesn't fix throughput.
    const camPos = S.camera?.position;
    const candidates = [];
    if (!window._snapSkipReasons) window._snapSkipReasons = {};
    const _sr = window._snapSkipReasons;
    // Camera frustum, computed once per tick. Used only to filter
    // animated_svg RE-SNAP candidates (cache-hit + tier-1 + over
    // ANIMATED_RESNAP_MS). Profiling 2026-05-26 found animated_svg
    // re-snap was ~17% of total CPU (4745 calls × 15.6ms over the
    // session). Most of those re-snaps target cells that aren't even
    // in the camera FOV — no visual benefit. Initial snaps + pre-
    // render lead path don't get frustum-filtered; we still want
    // cells about to come into view to have their snap ready.
    const T_ = window.THREE;
    let snapFrustum = null;
    if (T_ && S.camera) {
      snapFrustum = new T_.Frustum();
      const m = new T_.Matrix4().multiplyMatrices(
        S.camera.projectionMatrix,
        S.camera.matrixWorldInverse,
      );
      snapFrustum.setFromProjectionMatrix(m);
    }
    // Eligibility: cell must be cache-miss AND in tier-1 distance OR
    // already tier-1. Including in-range tier-2 cells lets the driver
    // PRE-RENDER cells before they actually promote, so the retier
    // sweep never sees a tier-2 cell crossing the boundary without a
    // ready cache entry. User 2026-05-22: "rendered cells to be
    // rendered before they're on camera period". Instance handles
    // (decorative bed) still skipped — they don't have an obj.position
    // and aren't promoted via this path.
    for (const [id, obj] of S.cellObjects) {
      if (obj.isInstanceHandle) continue;
      const tier = obj.userData?.tier;
      // Distance gate for tier-2: only pre-render cells within tier-1
      // range. Don't render every distant tier-2 cell — would never
      // finish.
      let distSq = 0;
      if (camPos) {
        const dx = obj.position.x - camPos.x;
        const dy = obj.position.y - camPos.y;
        const dz = obj.position.z - camPos.z;
        distSq = dx * dx + dy * dy + dz * dz;
      }
      if (tier === 2 && distSq > _MIXED3D_TIER1_DIST_SQ * 1.4) continue;  // small lead time
      // Cache check: cached cells skip re-snap, EXCEPT animated_svg
      // cells that haven't been re-snapped in ANIMATED_RESNAP_MS.
      // Gives animation back to tier-1 animated_svg cells (user
      // 2026-05-23 "wish there was more tier 1 cell animation")
      // at snap-rate. Only fires if cell is in tier-1 distance so
      // it doesn't burn snap budget on far-tier cells.
      if (S._snapTexCache?.has(id)) {
        const ctRaw = state.rendering.cellsById?.get(id)?.cell_type;
        if (ctRaw !== "animated_svg" || tier !== 1) continue;
        const ANIMATED_RESNAP_MS = 1500;
        const last = S._snapLastAt?.get(id) || 0;
        if (performance.now() - last < ANIMATED_RESNAP_MS) continue;
        // Frustum filter: skip re-snap for cells not currently in the
        // camera's field of view. Animation is invisible to the viewer
        // for these — re-rendering them wastes CPU. Saves ~60-70% of
        // animated_svg re-snap work since only ~30-40% of tier-1 cells
        // are in-frustum at any moment. When the camera rotates toward
        // a previously-deferred cell, the cell enters the frustum and
        // re-snap fires on the next snap-driver tick (<= 120ms later)
        // before the user can fixate. (_sr.outFrustum tracks the skip
        // count for debug.)
        if (snapFrustum && !snapFrustum.containsPoint(obj.position)) {
          _sr.outFrustum = (_sr.outFrustum || 0) + 1;
          continue;
        }
      }
      if (_mixed3dSnapInflight.has(id)) { _sr.inflight = (_sr.inflight||0)+1; continue; }
      const el = obj.userData?.cellEl;
      if (!el) { _sr.no_el = (_sr.no_el||0)+1; continue; }
      const ct = el.dataset?.cellType || "";
      const renderer = _MIXED3D_RENDERERS[ct];
      if (!renderer) { _sr.no_renderer = (_sr.no_renderer||0)+1; continue; }
      const cellData = state.rendering.cellsById?.get(id);
      if (!cellData) { _sr.no_cellData = (_sr.no_cellData||0)+1; continue; }
      let arg;
      if (ct === "html") {
        if (!cellData.title && !cellData.caption) { _sr.html_empty = (_sr.html_empty||0)+1; continue; }
        arg = cellData;
      } else {
        if (!cellData.spec || cellData.spec === "None") { _sr.no_spec = (_sr.no_spec||0)+1; continue; }
        arg = cellData.spec;
      }
      candidates.push({ id, ct, cellData, arg, distSq });
    }
    if (candidates.length === 0) return;
    candidates.sort((a, b) => a.distSq - b.distSq);
    const slice = candidates.slice(0, dispatch);
    for (const cand of slice) {
      const { id, ct, cellData, arg } = cand;
      _mixed3dSnapInflight.add(id);
      const targetId = id;
      const targetCellData = cellData;
      const targetCt = ct;
      const renderer = _MIXED3D_RENDERERS[ct];
      // Read colspan + per-cell canvas dimensions stored at mount time.
      const obj = S.cellObjects.get(id);
      const colspan = obj?.userData?.colspan || 1;
      const W_full = obj?.userData?.canvasW || (192 * colspan);
      const H_full = obj?.userData?.canvasH || 576;
      const H_body = H_full - TITLE_H;
      // 10s per-render timeout — earlier debugging found cells stuck at
      // 28% after 30 min, consistent with renderers hanging without
      // rejecting (e.g. mermaid Image.onload never firing on a malformed
      // SVG). Without a timeout, hung promises eat the 3 inflight slots
      // permanently and the driver appears alive but makes no progress.
      const t0 = performance.now();
      const renderP = renderer(arg, W_full, H_body, { id: id, colspan, canvasH: H_full, caption: cellData?.caption, title: cellData?.title });
      const timeoutP = new Promise((_, rej) => setTimeout(() => rej(new Error("snap-render-timeout-10s")), 10000));
      Promise.race([renderP, timeoutP]).then((bodyCanvas) => {
        _mixed3dSnapInflight.delete(targetId);
        const dt = performance.now() - t0;
        if (!window._snapProfBySubstrate) window._snapProfBySubstrate = {};
        const p = (window._snapProfBySubstrate[targetCt] ||= { n: 0, totalMs: 0, maxMs: 0 });
        p.n++; p.totalMs += dt; if (dt > p.maxMs) p.maxMs = dt;
        if (!bodyCanvas) {
          // Renderer returned null (unparseable spec, missing data,
          // etc). Without this branch the snap driver would retry
          // this same cell every 120ms forever — observed 22,891
          // redundant treemap renders before this fix. Cache the
          // promote-time stub so the driver skips on next tick.
          const stub = _mixed3dPaintPromoteStub(targetId, targetCellData, colspan, H_full);
          if (stub) {
            _mixed3dSnapCacheSet(S, targetId, stub);
            const curObj = S.cellObjects.get(targetId);
            if (curObj && !curObj.isInstanceHandle && curObj.userData?.tier === 1 && curObj.material?.map) {
              curObj.material.map.image = stub;
              curObj.material.map.needsUpdate = true;
            }
          }
          return;
        }
        _mixed3dCompositeAndCacheSnap(S, targetId, bodyCanvas, targetCellData, colspan, H_full);
      }).catch((e) => {
        _mixed3dSnapInflight.delete(targetId);
        console.warn("[mixed3d] snap fail", targetCt, targetId, e?.message || e);
        // Cache a stub on persistent failure so we don't loop on the
        // same broken cell every tick. (Mirrors the null-bodyCanvas
        // branch above — keep them in sync.)
        const stub = _mixed3dPaintPromoteStub(targetId, targetCellData, colspan, H_full);
        if (stub) _mixed3dSnapCacheSet(S, targetId, stub);
      });
    }
  }, 120);
}

// One-shot scripted-path warmup. Walks the swoopy-tour Catmull-Rom
// curve, finds every cell that will ever be tier-1 (within the LOD
// promote radius from some sampled camera position along the path),
// and snap-renders the entire union into _snapTexCache before the
// camera starts moving. Goal: when the dolly starts, no cell pops
// from stub→body in view — the cache is already warm.
//
// Concurrency is higher than the steady-state driver (CONCURRENCY=4
// vs MAX_INFLIGHT=3 BATCH=2) because main thread is otherwise idle
// during warmup. Hard 30s wall-clock cap so a regression in a single
// substrate can't strand the user on the boot overlay.
function _mixed3dRunPathWarmup(S) {
  if (!S || S._warmupComplete) return Promise.resolve();
  const T = window.THREE;
  if (!T) return Promise.resolve();
  // Force-init the camera curve. _mixed3dDriveSwoopyTour caches
  // S.swoopCam on first call; passing t=0 won't move the camera (the
  // ease-in arc at t=0 is 0).
  if (!S.swoopCam) {
    try { _mixed3dDriveSwoopyTour(0); } catch (e) { /* fall through */ }
  }
  // Fetch the disk SVG cache manifest once so cache-miss renders
  // can skip the fetch step entirely (avoiding the 404 devtools
  // spam). Fire-and-forget — if snap_receiver is down, the manifest
  // stays empty, and renderers fall straight to fresh-render every
  // time. Same behavior as before this commit, just no cache lookup.
  if (!window._mixed3dSvgManifest) {
    window._mixed3dSvgManifest = new Set();
    fetch("http://127.0.0.1:8767/cells-index.json").then(r => r.ok ? r.json() : null).then(j => {
      if (j && Array.isArray(j.files)) {
        for (const f of j.files) window._mixed3dSvgManifest.add(f);
        LOG.debug(`[mixed3d] svg cache manifest: ${window._mixed3dSvgManifest.size} entries`);
      }
    }).catch(() => {});
  }
  const sw = S.swoopCam;
  if (!sw || !sw.curve) return Promise.resolve();
  // Pre-render EVERY cell that could ever promote to tier-1 — not just
  // those near the camera path. User 2026-05-21: "basically nothing
  // is prerendered even when I see the bar fill on a new fresh hard
  // reload". The spatial filter missed cells outside the boot-position
  // LOD radius but reachable during the swoopy tour; those showed up
  // as stubs as the camera arrived.
  //
  // Cost: ~250-300 substrate-having cells × ~50ms avg = 12-15s of
  // warmup time (run at concurrency=4). Disk-cache hits drop later
  // sessions back to ~3-5s.
  // Enumerate from state.rendering.cellsById, NOT S.cellObjects — at
  // boot time cellObjects is mostly empty (mount drain populates it
  // gradually over seconds), so iterating it gives a tiny warmupSet
  // that completes in ~26ms with nothing actually rendered. cellsById
  // is populated synchronously the moment cells.json loads.
  // User 2026-05-21: "they're all empty or saying pending still" — root
  // cause was this enumeration source.
  const warmupSet = new Set();
  const cbi = state?.rendering?.cellsById;
  if (cbi) {
    for (const [id, cellData] of cbi) {
      const ct = cellData?.cell_type || "";
      if (!ct) continue;
      if (ct === "scene3d" || ct === "text") continue;
      // Need a renderer for this substrate type.
      if (!_MIXED3D_RENDERERS[ct]) continue;
      // Need spec or html to render against.
      if (!cellData.spec && !cellData.html) continue;
      warmupSet.add(id);
    }
  }
  if (warmupSet.size === 0) return Promise.resolve();
  S._warmupActive = true;
  S._warmupTotal = warmupSet.size;
  S._warmupCount = 0;
  S._warmupStart = performance.now();
  // Warmup has its own HARD_CAP_MS=30s safety; cancel the page-level
  // 45s safety fallback so it doesn't race warmupP.finally and dismiss
  // boot mid-warmup. Worst case both fire — body.classList.add is
  // idempotent — but typically warmup's natural finish wins.
  if (typeof window._mixed3dCancelSafetyBoot === "function") {
    window._mixed3dCancelSafetyBoot();
  }
  LOG.debug(`[mixed3d] path warmup: ${warmupSet.size} cells to pre-render`);
  _mixed3dUpdateWarmupProgress(S);
  // Sort by camera-distance — render visible cells first so when boot
  // dismisses (or HARD_CAP_MS trips) the cells the camera can see are
  // warm, distant cells fill via the snap driver as the camera moves.
  // Without this, todo iterates in cellsById insertion order, which is
  // grid-spatial but uncorrelated with the camera's spawn pose.
  const todoIds = Array.from(warmupSet);
  const camPos = S.camera?.position;
  const distEntries = todoIds.map((id) => {
    const obj = S.cellObjects.get(id);
    let distSq = 0;
    if (camPos && obj && !obj.isInstanceHandle && obj.position) {
      const dx = obj.position.x - camPos.x;
      const dy = obj.position.y - camPos.y;
      const dz = obj.position.z - camPos.z;
      distSq = dx * dx + dy * dy + dz * dz;
    } else {
      // No mounted obj yet — push to the back, snap driver will catch them.
      distSq = Number.POSITIVE_INFINITY;
    }
    return { id, distSq };
  });
  distEntries.sort((a, b) => a.distSq - b.distSq);
  const todo = distEntries.map((e) => e.id);
  const BODY_H = 576 - 72;
  const CONCURRENCY = 4;
  // Hard cap bumped 30s -> 90s so warmup actually finishes 1244 cells
  // on cold cache (~30 cells/sec observed = ~42s for full set, with
  // slack). User 2026-05-22 prefers a longer splash to seeing pending
  // stubs after dismissal.
  const HARD_CAP_MS = 90000;
  // Boot-ready quota: previously 40 (dismiss boot once viewport-quota
  // warm). User 2026-05-22 reversed direction after seeing pending
  // cells: "I'd much rather have a longer loading bar than have half
  // the column faces just full of pending cells." Quota now == total,
  // so bootReadyP only resolves when warmupP does. Splash carries
  // the load with its progress counter; users wait but see no stubs.
  const BOOT_READY_QUOTA = todo.length;
  let nextIdx = 0;
  // Diagnostics (#warmup-shortresolve): track who calls finish() and
  // what state was when it fired. Cleared after the resolve.
  S._warmupFinishReason = null;
  S._warmupSkipCounts = { no_cellData: 0, no_renderer: 0, no_arg: 0, already_cached: 0, render_ok: 0, render_null: 0, render_throw: 0, sync_renderer_throw: 0 };
  // Boot-ready promise: resolves at the BOOT_READY_QUOTA milestone OR
  // when the full warmup settles, whichever first. Boot dismissal
  // listens to this; camera-release listens to the full warmup.
  let _bootReadyResolve = null;
  S._warmupBootReadyP = new Promise((r) => { _bootReadyResolve = r; });
  S._warmupBootReady = false;
  const _maybeBootReady = () => {
    if (!S._warmupBootReady && S._warmupCount >= BOOT_READY_QUOTA) {
      S._warmupBootReady = true;
      const wall = performance.now() - S._warmupStart;
      LOG.debug(`[mixed3d] boot-ready: ${S._warmupCount}/${S._warmupTotal} cells warm in ${wall.toFixed(0)}ms (quota=${BOOT_READY_QUOTA})`);
      if (_bootReadyResolve) _bootReadyResolve();
    }
  };
  return new Promise((resolve) => {
    const finish = (reason) => {
      const wall = performance.now() - S._warmupStart;
      S._warmupFinishReason = reason || "natural";
      LOG.debug(`[mixed3d] path warmup done: ${S._warmupCount}/${S._warmupTotal} in ${wall.toFixed(0)}ms (reason=${S._warmupFinishReason}, inflight=${inflight.size}, nextIdx=${nextIdx}/${todo.length}, skips=${JSON.stringify(S._warmupSkipCounts)})`);
      S._warmupActive = false;
      S._warmupComplete = true;
      // If we got here without crossing the boot-ready quota (e.g.
      // small dashboard, hard-cap fired early), resolve bootReadyP
      // so the splash still dismisses.
      if (!S._warmupBootReady) {
        S._warmupBootReady = true;
        if (_bootReadyResolve) _bootReadyResolve();
      }
      _mixed3dResetCameraTimer();
      resolve();
    };
    const inflight = new Set();
    const kick = () => {
      if (performance.now() - S._warmupStart > HARD_CAP_MS) {
        console.warn("[mixed3d] path warmup hit 30s cap, releasing camera");
        if (inflight.size === 0) finish("hard_cap");
        return;
      }
      while (inflight.size < CONCURRENCY && nextIdx < todo.length) {
        const id = todo[nextIdx++];
        const cellData = state.rendering.cellsById?.get(id);
        if (!cellData) { S._warmupSkipCounts.no_cellData++; _advance(); continue; }
        const ct = cellData.cell_type || "";
        const renderer = _MIXED3D_RENDERERS[ct];
        if (!renderer) { S._warmupSkipCounts.no_renderer++; _advance(); continue; }
        let arg;
        if (ct === "html") {
          if (!cellData.title && !cellData.caption) { S._warmupSkipCounts.no_arg++; _advance(); continue; }
          arg = cellData;
        } else {
          if (!cellData.spec || cellData.spec === "None") { S._warmupSkipCounts.no_arg++; _advance(); continue; }
          arg = cellData.spec;
        }
        if (S._snapTexCache?.has(id)) { S._warmupSkipCounts.already_cached++; _advance(); continue; }
        // Derive colspan from cellData when obj isn't mounted yet
        // (cellObjects is sparse during boot). Mirrors the heuristic in
        // _mixed3dColspanForCell but reads from cell_type / mermaid_subtype /
        // html_layout off the data object.
        const obj = S.cellObjects.get(id);
        let colspan;
        if (obj && !obj.isInstanceHandle && obj.userData?.colspan) {
          colspan = obj.userData.colspan;
        } else {
          const sub = cellData.mermaid_subtype || "";
          const hl = cellData.html_layout || "";
          if (ct === "mermaid") {
            colspan = (sub === "flowchart" || sub === "gitGraph" || sub === "gantt"
                       || sub === "sankey-beta" || sub === "erDiagram") ? 3
                    : (sub === "timeline" || sub === "quadrantChart" || sub === "mindmap") ? 3
                    : 2;
          } else if (ct === "html") {
            colspan = (hl === "table") ? 3 : 2;
          } else if (ct === "vega" || ct === "force_graph" || ct === "timeline_ribbon"
                     || ct === "animated_svg" || ct === "treemap") {
            colspan = 2;
          } else { colspan = 1; }
        }
        inflight.add(id);
        const W_full = obj?.userData?.canvasW || (192 * colspan);
        const H_full = obj?.userData?.canvasH || 576;
        const H_body = H_full - 72;  // TITLE_H
        // Wrap the renderer() call: any substrate that throws synchronously
        // (before returning a Promise) would otherwise strand the inflight
        // slot AND propagate up through the kick() recursion, rejecting the
        // warmupP executor. That's the #warmup-shortresolve symptom: boot
        // dismisses at ~10s with warmupCount well below total, no
        // "warmup done" log, no "warmup fail" log.
        let renderP;
        try {
          renderP = renderer(arg, W_full, H_body, { id: id, colspan, canvasH: H_full, caption: cellData?.caption, title: cellData?.title });
        } catch (syncErr) {
          inflight.delete(id);
          S._warmupSkipCounts.sync_renderer_throw++;
          console.warn("[mixed3d] warmup sync-throw", ct, id, syncErr?.message || syncErr);
          const stub = _mixed3dPaintPromoteStub(id, cellData, colspan, H_full);
          if (stub) _mixed3dSnapCacheSet(S, id, stub);
          _advance();
          continue;
        }
        // Belt-and-suspenders: if renderer returned something that isn't
        // thenable, coerce to Promise.resolve so the .then chain still wires.
        if (!renderP || typeof renderP.then !== "function") {
          renderP = Promise.resolve(renderP);
        }
        const timeoutP = new Promise((_, rej) => setTimeout(() => rej(new Error("warmup-render-timeout-10s")), 10000));
        Promise.race([renderP, timeoutP]).then((bodyCanvas) => {
          inflight.delete(id);
          if (!bodyCanvas) {
            // Null-render stub-cache (mirrors steady-state driver).
            const stub = _mixed3dPaintPromoteStub(id, cellData, colspan, H_full);
            if (stub) _mixed3dSnapCacheSet(S, id, stub);
            S._warmupSkipCounts.render_null++;
          } else {
            _mixed3dCompositeAndCacheSnap(S, id, bodyCanvas, cellData, colspan, H_full);
            S._warmupSkipCounts.render_ok++;
          }
          _advance();
        }).catch((e) => {
          inflight.delete(id);
          S._warmupSkipCounts.render_throw++;
          console.warn("[mixed3d] warmup fail", ct, id, e?.message || e);
          const stub = _mixed3dPaintPromoteStub(id, cellData, colspan, H_full);
          if (stub) _mixed3dSnapCacheSet(S, id, stub);
          _advance();
        });
      }
      if (inflight.size === 0 && nextIdx >= todo.length) finish("natural");
    };
    const _advance = () => {
      S._warmupCount++;
      if (S._warmupCount % 8 === 0) {
        try { _mixed3dUpdateWarmupProgress(S); }
        catch (e) { console.warn("[mixed3d] warmup progress-update throw", e?.message || e); }
      }
      // Boot-ready milestone: first BOOT_READY_QUOTA cells warm. Boot
      // overlay dismisses here; full warmup keeps running.
      _maybeBootReady();
      // Defensive: kick() could throw via a sync-renderer escape we
      // haven't covered. Catch here so the warmup chain self-heals
      // instead of bubbling up to the Promise executor / unhandled
      // rejection. If kick throws, we still want to keep advancing.
      try { kick(); }
      catch (e) {
        console.error("[mixed3d] warmup kick-throw (caught in _advance)", e?.stack || e?.message || e);
        // Don't call kick() again — we'd re-enter the same throw.
        // Just declare done so boot proceeds.
        if (!S._warmupComplete) finish("kick_throw_in_advance");
      }
    };
    // Outer kick() runs synchronously in the Promise executor; a throw
    // here would silently reject warmupP. Catch it explicitly and
    // resolve via finish() so boot still proceeds, AND we log a
    // diagnostic instead of dropping the error on the floor.
    try { kick(); }
    catch (e) {
      console.error("[mixed3d] warmup outer-kick throw", e?.stack || e?.message || e);
      if (!S._warmupComplete) finish("outer_kick_throw");
    }
  });
}

function _mixed3dUpdateWarmupProgress(S) {
  const titleEl = document.querySelector("#boot-overlay .boot-title");
  const barEl = document.querySelector("#boot-overlay .boot-bar-fill");
  const counterEl = document.querySelector("#boot-overlay .boot-counter");
  // Title stays "PRE-RENDERING" — the counter lives on its own line
  // below the bar so the title text width doesn't make the 220px
  // progress bar look truncated relative to the heading.
  if (titleEl) titleEl.textContent = "PRE-RENDERING";
  if (barEl && S._warmupTotal > 0) {
    // Replace the indeterminate slide animation with a determinate fill.
    barEl.style.animation = "none";
    barEl.style.left = "0";
    barEl.style.width = (100 * S._warmupCount / S._warmupTotal).toFixed(1) + "%";
  }
  if (counterEl) counterEl.textContent = `${S._warmupCount} / ${S._warmupTotal}`;
}

// Dev hooks for diagnosing snap-driver state from console / MCP probes.
// The driver's setInterval handle + inflight Set live in module scope
// (so they survive teardown cleanly) but were unreachable from outside,
// which made "is the driver actually running?" probes return false even
// when it was.
// Park the camera at a specific cell for inspection / screenshotting.
// Sets _mixed3dState._park = { target, lookAt, cellId }; the camera
// drive lerps toward target each frame and looks at the cell center.
// Call _mixed3dUnpark() to release. Used by the canvas click handler
// (registered in applyMixed3DLayout) and from console for diagnostics.
window._mixed3dParkAt = (cellId, offset) => {
  const S = _mixed3dState;
  if (!S) return null;
  const T = window.THREE;
  if (!T) return null;
  const obj = S.cellObjects.get(cellId);
  if (!obj || obj.isInstanceHandle) return { err: "not a tier-1 mesh" };
  // Cell mesh dims (bucketed via _mixed3dGetSharedPlaneGeo) drive both
  // pull-back distance and lookAt bias. Without these:
  //  - tall cells overshoot the frustum vertically at the old fixed
  //    2.0u offset
  //  - content "near the top of the cell" lands above the visible
  //    frame because lookAt = geometric center puts content at
  //    +planeH/2 above the framing point, off-screen at 75° FOV
  //    when planeH is large (user 2026-05-24, cell-4479).
  const planeW = obj.geometry?.parameters?.width || 1.0;
  const planeH = obj.geometry?.parameters?.height || 1.0;
  // FOV-fit distance: vertical needs planeH / (2*tan(37.5°)) ≈
  // planeH * 0.65; horizontal at the renderer's live aspect ratio
  // needs planeW / (2*tan(hFov/2)). Take the max so neither axis
  // overflows, then 20% margin. Floor at 2.0u for small cells.
  // 0.85 multiplier underframed wide colspan-6 cells (user 2026-05-25
  // "camera still getting super close to the face in unhelpful ways").
  const aspect = (_mixed3dState.renderer?.domElement?.clientWidth || 16) / (_mixed3dState.renderer?.domElement?.clientHeight || 9);
  const tanV = Math.tan((75 * Math.PI / 180) / 2);
  const tanH = tanV * aspect;
  const fitDist = Math.max(planeH / (2 * tanV), planeW / (2 * tanH)) * 1.2;
  const parkOffset = offset || Math.max(2.0, fitDist);
  // The plane mesh's local +Z is the front face; rotate it by the
  // mesh's world rotation to get the camera-side normal in world space.
  const normal = new T.Vector3(0, 0, 1).applyEuler(obj.rotation);
  const target = new T.Vector3(
    obj.position.x + normal.x * parkOffset,
    obj.position.y + normal.y * parkOffset,
    obj.position.z + normal.z * parkOffset
  );
  // Bias lookAt upward by planeH * 0.18 so content near the top of a
  // tall cell lands at the upper-third of the visible frame instead of
  // above it. Cells are yaw-only (no pitch), so world +Y is also
  // screen-up for the framing point.
  const lookAt = obj.position.clone();
  lookAt.y += planeH * 0.18;
  S._park = { target, lookAt, cellId };
  return { parked: cellId, at: { x: target.x.toFixed(2), y: target.y.toFixed(2), z: target.z.toFixed(2) }, planeH: +planeH.toFixed(2), offset: +parkOffset.toFixed(2) };
};
window._mixed3dUnpark = () => {
  const S = _mixed3dState;
  if (!S) return "unparked";
  S._park = null;
  // Resume swoopy on the curve at the closest u to the camera's
  // current position rather than rebooting from t=0. The driver's
  // posActual lerp toward desiredPos smears the residual gap over ~10
  // frames, so re-entry reads as a smooth lerp instead of a teleport.
  const T = window.THREE;
  const sw = S.swoopCam;
  if (!T || !sw || !sw.curve || !Number.isFinite(sw.totalLen) || sw.totalLen <= 0) {
    // Curve not built yet (parked before tour ever ran) — fall back to
    // the full reset so the next frame can boot the swoopy state.
    _mixed3dResetCameraTimer();
    return "unparked";
  }
  // Closest-u search: 256 uniform samples then 6 binary-refine passes
  // for ~0.01% u precision. Cheap (one-shot per unpark).
  const camP = S.camera.position;
  let bestU = 0;
  let bestD2 = Infinity;
  const N = 256;
  for (let i = 0; i < N; i++) {
    const u = i / N;
    const p = sw.curve.getPointAt(u);
    const dx = p.x - camP.x, dy = p.y - camP.y, dz = p.z - camP.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; bestU = u; }
  }
  let lo = Math.max(0, bestU - 1 / N);
  let hi = Math.min(1, bestU + 1 / N);
  for (let k = 0; k < 6; k++) {
    const mid = (lo + hi) / 2;
    const pl = sw.curve.getPointAt(Math.max(0, mid - 1e-4));
    const pr = sw.curve.getPointAt(Math.min(1, mid + 1e-4));
    const dl2 = (pl.x - camP.x) ** 2 + (pl.y - camP.y) ** 2 + (pl.z - camP.z) ** 2;
    const dr2 = (pr.x - camP.x) ** 2 + (pr.y - camP.y) ** 2 + (pr.z - camP.z) ** 2;
    if (dl2 < dr2) hi = mid; else lo = mid;
    bestU = (lo + hi) / 2;
  }
  // Skip the 10s boot ease-in — we're not booting, we're resuming. Set
  // t0 so the next animation t lands at ~11s, past the t<10 gate.
  S.animation.t0 = performance.now() - 11000;
  const tNow = 11.0;
  sw.arcAccum = bestU * sw.totalLen;
  sw.lastT = tNow;
  sw.lastAvgRate = 0;
  sw.headingHistory = [];
  sw.bankActual = 0;
  sw.scanFactor = 0;
  sw.scanSide = 0;
  sw.scanNextStart = tNow + 6 + Math.random() * 4;
  sw.scanTargetCell = null;
  sw.scanTargetPos = null;
  // Seed posActual/lookAtActual at the current camera pose. Without
  // these, the driver re-inits posActual = desiredPos.clone() and the
  // camera teleports to the curve point on the next frame.
  sw.posActual = S.camera.position.clone();
  const fwd = new T.Vector3();
  S.camera.getWorldDirection(fwd);
  sw.lookAtActual = S.camera.position.clone().add(fwd.multiplyScalar(8));
  return "unparked";
};

window._mixed3dSnapDebug = () => ({
    intervalActive: _mixed3dSnapInterval !== null,
    inflightSize: _mixed3dSnapInflight.size,
    inflightIds: Array.from(_mixed3dSnapInflight),
    cap: _MIXED3D_SNAP_MAX_INFLIGHT,
    batch: _MIXED3D_SNAP_BATCH,
  });
window._mixed3dStartSnapshotDriver = _mixed3dStartSnapshotDriver;

function _mixed3dCellTexture(cell, isTop, cyan, pink, colspan, canvasH) {
  const T = window.THREE;
  // Per-cell canvas dimensions: width scales with colspan; height
  // passed in so canvas aspect matches mesh aspect (variable cell
  // heights post-#159). Fallback for legacy callers: 192*cs × 576.
  const cs = Math.max(1, Math.min(6, colspan || 1));
  const W = isTop ? 384 : (192 * cs);
  const H = isTop ? 384 : (canvasH || 576);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  // Caller hoists getComputedStyle out of the mount loop (saves ~5-10%
  // per-cell paint cost at saturation). Fall back to the lookup if a
  // legacy caller doesn't pass colors.
  if (!cyan || !pink) {
    const styles = getComputedStyle(document.body);
    cyan = (styles.getPropertyValue("--accent-primary") || "#00ddff").trim();
    pink = (styles.getPropertyValue("--accent-secondary") || "#ff3a8c").trim();
  }
  // No bg fill, no border — etched-glass look. Title text + title
  // rule + substrate preview + type chip all paint over a fully
  // transparent canvas. Material's transparent pass alpha-blends
  // through to whatever's behind (tower glass).
  //
  // Title color: cyan — pulled into the decorative palette 2026-05-24
  // (was purple #9966ff). Same decorative discipline as the tier-1
  // body rows + html title block: one hue, alpha hierarchy.
  const titleColor = "#00ddff";
  const titleEl = cell.querySelector(".cell-title");
  const title = (titleEl?.textContent || cell.id || "").trim().toUpperCase();
  ctx.fillStyle = titleColor;
  // Fonts scaled 2.4× to match the canvas resolution bump. 11→26 side,
  // 16→38 top, 8→19 chip. Title text now readable at corridor distance.
  ctx.font = isTop ? "bold 38px 'Eurostile', 'Share Tech Mono', monospace" : "bold 26px 'Eurostile', 'Share Tech Mono', monospace";
  ctx.textBaseline = "top";
  const padX = 10;
  const lineH = isTop ? 44 : 32;
  let y = padX;
  let line = "";
  const maxW = W - padX * 2;
  for (const word of title.split(/\s+/)) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxW) {
      ctx.fillText(line, padX, y);
      y += lineH;
      line = word;
      if (y > H * 0.35) break;
    } else line = test;
  }
  if (line) { ctx.fillText(line, padX, y); y += lineH; }
  // Title rule — purple to match title text.
  ctx.strokeStyle = titleColor;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, y + 5);
  ctx.lineTo(W - padX, y + 5);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  // Body area intentionally blank: dropped the decorative-bands
  // placeholder (user 2026-05-22 "drop the faded decorative cell
  // content"). Tier-1 cells should show real substrate content or
  // nothing — the title block + dark fill alone read more cleanly
  // than a stand-in that competes with real content visually. The
  // placeholder canvas is overwritten the same tick when promote
  // resolves the cached snap, so the empty body is rarely seen.
  const ctype = (cell.dataset.cellType || "").toUpperCase();
  if (ctype) {
    ctx.fillStyle = cyan;
    ctx.font = isTop ? "bold 26px 'Eurostile', 'Share Tech Mono', monospace" : "bold 19px 'Eurostile', 'Share Tech Mono', monospace";
    ctx.fillText(ctype, padX, H - (isTop ? 38 : 28));
  }
  const tex = new T.CanvasTexture(canvas);
  tex.minFilter = T.LinearFilter;
  tex.magFilter = T.LinearFilter;
  return tex;
}
function _mixed3dSyncCells() {
  if (!_mixed3dState) return;
  const root = document.getElementById("notebook");
  const _syncStart = performance.now();
  // Descend past .session-column wrappers; only count cells still
  // parented inside #notebook (un-mounted). Already-mounted cells
  // are tracked in the cellObjects map; pending cells (queued for
  // mount but not yet drained) live in mountPending.
  // Skip WebGL-heavy substrates inside the mixed3d world — each
  // scene3d cell allocates its own WebGLRenderer / context, and
  // browsers cap at ~16 active contexts. With 50+ cells and many
  // scene3d in the corpus, the world's renderer kept losing its
  // context. Substrate types listed here render with side-effects
  // we don't want contesting the mixed3d world's GL slot.
  const _MIXED3D_SKIP_SUBSTRATES = new Set(["scene3d"]);

  // Lazy-init mount queue state. Lives on _mixed3dState so teardown
  // drops it cleanly along with the rest of the layout.
  if (!_mixed3dState.mountQueue) {
    _mixed3dState.mountQueue = [];
    _mixed3dState.mountPending = new Set();
    _mixed3dState.mountDraining = false;
  }

  const map = _mixed3dState.cellObjects;
  const pending = _mixed3dState.mountPending;
  // Cap visible cell count to keep draw calls + GPU memory bounded.
  // 2026-05-24 progression:
  //   300  — original cap; throttled tier-1 density visibly
  //   1500 — too generous; ballooned tab RAM to 2.3GB at 1338 cells
  //   800  — compromise; ~2.6× the 300 baseline, enough room for the
  //          22→28 promote radius bump to actually grow tier-1 count
  //          (60→~150) without exploding GPU texture memory. Override
  //          higher via ?mixed3dCap=N if a stress test wants saturation.
  // The 2D notebook DOM still holds every cell; mixed3d renders the
  // most-recent N (DOM is reverse-chrono so .slice(0, N) takes newest).
  const capRaw = new URLSearchParams(window.location.search).get("mixed3dCap");
  const capN = capRaw && Number.isFinite(+capRaw) && +capRaw > 0 ? +capRaw : 800;
  const allCellEls = [...root.querySelectorAll(".cell")];
  const capped = allCellEls.slice(0, capN);
  const fresh = capped.filter(
    c => c.id
      && !map.has(c.id)
      && !pending.has(c.id)
      && !_MIXED3D_SKIP_SUBSTRATES.has(c.dataset.cellType || ""),
  );
  for (const c of fresh) {
    _mixed3dState.mountQueue.push(c);
    pending.add(c.id);
  }

  // Eviction: drop meshes whose element has been removed from the
  // document entirely (RAM cap, scoped reset, session clear).
  // isConnected is false only when the node is detached from the doc.
  // Tier 1 holds unique materials/textures — dispose. Tier 2 uses
  // shared per-substrate materials — DON'T dispose (would break the
  // other 1000s of cells using the same material).
  for (const [id, obj] of [...map.entries()]) {
    const el = obj.userData?.cellEl;
    if (el && el.isConnected) continue;
    if (obj.isInstanceHandle) {
      // Tier-2 instanced cell: swap-and-pop from the InstancedMesh.
      _mixed3dRemoveTier2Instance(_mixed3dState, obj);
    } else {
      // Tier-1 unique-mat Mesh OR tier-2 fallback Mesh.
      if (obj.parent) obj.parent.remove(obj);
      const wasTier1 = obj.userData?.tier === 1;
      if (wasTier1) {
        if (obj.material?.map) obj.material.map.dispose();
        if (obj.material) obj.material.dispose();
        _mixed3dState.tier1Count = Math.max(0, (_mixed3dState.tier1Count || 0) - 1);
      }
    }
    // Geometry NOT disposed — every cell shares an entry from the
    // sharedGeometries cache. Disposing would invalidate the buffer
    // for any other cell currently using the same (W, H) bucket.
    map.delete(id);
    if (_mixed3dState.cellTier) _mixed3dState.cellTier.delete(id);
    // Drop the cached composite canvas. Without this every cell whose
    // DOM gets evicted (RAM cap, session clear, synthetic-backfill cull)
    // leaks ~440KB of canvas + GPU texture mirror. Unbounded over time.
    _mixed3dState._snapTexCache?.delete(id);
    const key = _mixed3dState.cellSlotKeys.get(id);
    if (key) {
      _mixed3dState.usedSlots.delete(key);
      _mixed3dState.cellSlotKeys.delete(id);
      const towerIdxStr = key.split(":")[0];
      const ti = parseInt(towerIdxStr, 10);
      if (Number.isFinite(ti) && _mixed3dState.towerCellCount[ti] > 0) {
        _mixed3dState.towerCellCount[ti]--;
      }
    }
  }

  const _syncMs = performance.now() - _syncStart;
  if (fresh.length > 0 || _syncMs > 5) {
    LOG.debug(`[mixed3d] syncCells: +${fresh.length} queued in ${_syncMs.toFixed(0)}ms (queue: ${_mixed3dState.mountQueue.length}) @ ${performance.now().toFixed(0)}ms`);
  }
  if (!_mixed3dState.mountDraining && _mixed3dState.mountQueue.length > 0) {
    _mixed3dState.mountDraining = true;
    _mixed3dState.mountDrainStart = performance.now();
    _mixed3dState.mountDrainTotal = 0;
    _mixed3dScheduleDrain();
  }
}

// rAF is throttled to 0Hz on hidden tabs (Chrome backgrounding), so the
// queue stalls indefinitely if the user navigates away or — more often
// — if MCP/automation probes the page without focusing the tab. Fall
// back to setTimeout when hidden so drain keeps making progress.
function _mixed3dScheduleDrain() {
  if (document.hidden) {
    setTimeout(_mixed3dDrainMountQueue, 16);
  } else {
    requestAnimationFrame(_mixed3dDrainMountQueue);
  }
}

// Time-sliced cell-mount worker. Drains _mixed3dState.mountQueue at
// up to BUDGET_MS per frame. Replaces the old syncCells "mount all
// fresh cells synchronously" path which froze the main thread for
// ~12s when 6755 cells landed at once. Each cell still costs the same
// (canvas paint + CanvasTexture upload + scene.add); we just spread
// it across rAF frames so the page stays interactive while it fills.
function _mixed3dDrainMountQueue() {
  const S = _mixed3dState;
  if (!S || !S.mountQueue) return;
  const T = window.THREE;
  if (!T) { S.mountDraining = false; return; }
  const G = S.geometry;
  const map = S.cellObjects;
  const pending = S.mountPending;
  const start = performance.now();
  // Trickle-mode drain. User feedback 2026-05-04: "they don't need to
  // appear all at once or as fast as possible" — at 12k cells the
  // greedy drain (BUDGET=9 unchecked) was producing continuous 70–
  // 200ms stalls while the camera flew over an empty world and then
  // got slammed at saturation. A small per-frame CAP makes mount
  // count predictable regardless of how fast individual cells are.
  // 3 cells × 60fps = 180/s → 12k cells take ~67s to fully saturate,
  // but the camera flight and HUD stay smooth throughout.
  // Live operation (1–2 cells/minute) lands in one frame either way,
  // so the cap is invisible after boot.
  const BUDGET_MS = 9;
  // Hidden tabs throttle setTimeout to ~1Hz, so cap 3 means 3 cells/sec.
  // Bump the cap when hidden to keep boot time bearable for MCP probing,
  // but NOT so high it floods Mesh/CanvasTexture allocations in a single
  // tick. 60 OOM'd a session on 2026-05-20; 12 is a 4× speedup over the
  // visible-tab default with bounded burst.
  const PER_FRAME_CAP = document.hidden ? 12 : 3;

  // Hoist style lookups out of the per-cell paint loop. Theme changes
  // teardown the layout (rebuild path), so this is stable across one
  // drain cycle.
  const styles = getComputedStyle(document.body);
  const cyan = (styles.getPropertyValue("--accent-primary") || "#00ddff").trim();
  const pink = (styles.getPropertyValue("--accent-secondary") || "#ff3a8c").trim();

  let mounted = 0;
  while (S.mountQueue.length > 0 && mounted < PER_FRAME_CAP) {
    if (mounted > 0 && performance.now() - start > BUDGET_MS) break;
    const cell = S.mountQueue.pop();
    if (!cell) continue;
    pending.delete(cell.id);
    if (!cell.isConnected) continue;
    if (map.has(cell.id)) continue;

    const desiredColspan = _mixed3dColspanForCell(cell);
    const placement = _mixed3dPickSlotForNewCell(desiredColspan);
    if (!placement) {
      // Field is full — drop the rest of the queue. Future syncCells
      // calls will re-enqueue fresh cells if eviction frees slots.
      S.mountQueue.length = 0;
      pending.clear();
      break;
    }
    const { towerIdx, facePri, col, key, y: cellY, h: cellH, p: claimedP, colspan: gotColspan, spanKeys } = placement;
    const tower = S.towerMeshes[towerIdx];
    const isTop = facePri === 4;
    const cs = gotColspan || 1;
    // Hide decorative-tier instances at every slot this cell covers,
    // PLUS any decorative in the spanned columns whose y-range
    // overlaps the wide cell's vertical extent. Per-column height
    // variance means col=N+1's other rows can sit at a world-y that
    // the wide cell's mesh extends through — without this extra
    // sweep those decoratives bleed through the wide cell's
    // transparent pixels.
    if (!isTop && typeof claimedP === "number") {
      for (let k = 0; k < cs; k++) {
        _mixed3dHideDecorativeAtSlot(towerIdx, facePri, col + k, claimedP);
      }
      if (cs > 1) {
        // placement.y/h are bestCol's slot — that's where the wide
        // mesh actually sits in world space.
        const wideYLo = placement.y;
        const wideYHi = placement.y + placement.h;
        for (let k = 1; k < cs; k++) {
          const planK = _mixed3dState.columnPlans.get(`${towerIdx}:${facePri}:${col + k}`);
          if (!planK) continue;
          for (let pp = 0; pp < planK.positions.length; pp++) {
            if (pp === claimedP) continue;
            const s = planK.positions[pp];
            const yLo = s.y, yHi = s.y + s.h;
            if (yHi > wideYLo && yLo < wideYHi) {
              _mixed3dHideDecorativeAtSlot(towerIdx, facePri, col + k, pp);
            }
          }
        }
      }
    }
    let tx, ty, tz, rotX = 0, rotY = 0;
    let mountedH = G.towerW * 0.95;
    if (isTop) {
      tx = tower.mesh.position.x;
      ty = G.towerH + 0.02;
      tz = tower.mesh.position.z;
      rotX = -Math.PI / 2;
    } else {
      const faceSpec = tower.faces[facePri];
      // Center across the spanned columns: the left edge sits at
      // col, the right edge at col+cs-1, so the cell-center column
      // index is col + (cs-1)/2.
      const centerCol = col + (cs - 1) / 2;
      const colOffset = (centerCol - (G.slotsPerFaceX - 1) / 2) * G.slotW;
      const outwardBoost = 0.12;
      const dxNorm = faceSpec.dx === 0 ? 0 : (faceSpec.dx > 0 ? 1 : -1);
      const dzNorm = faceSpec.dz === 0 ? 0 : (faceSpec.dz > 0 ? 1 : -1);
      tx = tower.mesh.position.x + faceSpec.dx + faceSpec.hx * colOffset + dxNorm * outwardBoost;
      // cellY is the cell's BOTTOM in tower-local coords; ty is the
      // cell CENTER in world coords. Cells sit on the column floor
      // (tower base) so towerLocalY=0 maps to worldY=0.
      ty = cellY + cellH / 2;
      tz = tower.mesh.position.z + faceSpec.dz + faceSpec.hz * colOffset + dzNorm * outwardBoost;
      rotY = faceSpec.rotY;
      mountedH = cellH;
      // Substrate-aware height cap. Gauges/sparklines are intrinsically
      // square-ish single-value indicators; without a cap they inherit
      // the column slot.h (~3.4u avg) which leaves huge dead space
      // around the dial. Cap them to 2x planeW so the cell is roughly
      // square — content fills it. User 2026-05-21: "I'm not sure the
      // gauge needs to be bigger, it just has a lot of space around it".
      const ct_for_h = cell.dataset.cellType || "";
      if (ct_for_h === "gauge" || ct_for_h === "sparkline") {
        const cap = G.cellW * cs * 2.0;
        if (mountedH > cap) {
          // Recenter the cell within its original slot so it sits
          // at the same vertical anchor; reduces visual jumps if the
          // user is comparing two adjacent cells (one capped, one not).
          const yShift = (mountedH - cap) / 2;
          ty -= yShift;
          mountedH = cap;
        }
      } else if (ct_for_h === "html") {
        // html cells render as bold cyan rows (decorative-style) — they
        // don't need a tall portrait slot. Cap at 1.4× planeW for a
        // landscape-ish aspect that fits 4-8 wrapped rows. User
        // 2026-05-24: "should be multiple columns wide and also shorter".
        const cap = G.cellW * cs * 1.4;
        if (mountedH > cap) {
          const yShift = (mountedH - cap) / 2;
          ty -= yShift;
          mountedH = cap;
        }
      }
    }

    const planeW = isTop ? G.towerW * 0.95 : (G.cellW * cs);
    const planeH = mountedH;
    // Per-cell canvas dimensions sized to match the mesh aspect, so
    // pixel-to-world scale is uniform on both axes (no horizontal
    // squeeze or vertical stretch when the texture samples to the
    // plane). Was hardcoded 192*cs × 576 → mismatched mesh aspect
    // when slot heights varied. canvasH stays a multiple of 64 for
    // GPU mipmap friendliness.
    const canvasW = 192 * cs;
    const meshAspect = planeH / planeW;
    let canvasH;
    if (isTop) {
      canvasH = 384;
    } else {
      // h:w ratio of canvas matches mesh. Clamp to [192, 1152] so
      // very small or very tall cells don't blow GPU memory or
      // generate pixelated tiny textures.
      canvasH = Math.max(192, Math.min(1152, Math.round(canvasW * meshAspect)));
    }
    // Geometry sharing: cells with similar dimensions reuse one
    // PlaneGeometry instance instead of allocating a fresh one per
    // cell. Bucket dims to 0.05u — cells that were 2.30u and 2.32u
    // tall now share the same geometry (visual diff < 0.025u =
    // imperceptible at swoopy-tour distance). Result: 14000+
    // unique geometries → ~80 shared, killing GC pressure from
    // PlaneGeometry/BufferGeometry/Float32Array alloc cycles which
    // were producing multi-second frame stalls during mount drain.
    const planeGeo = _mixed3dGetSharedPlaneGeo(planeW, planeH);

    // Pick tier at mount based on camera distance. Tier-2 cells reuse
    // a shared substrate material — no per-cell paint, no per-cell
    // GPU upload. The TIER1_CAP keeps unique-material cells bounded
    // even if 400+ cells happen to mount near the camera.
    const camPos = S.camera.position;
    const mdx = tx - camPos.x;
    const mdy = ty - camPos.y;
    const mdz = tz - camPos.z;
    const md2 = mdx * mdx + mdy * mdy + mdz * mdz;
    const wantTier1 = md2 < _MIXED3D_TIER1_DIST_SQ
      && (S.tier1Count || 0) < _MIXED3D_TIER1_CAP;
    const tier = wantTier1 ? 1 : 2;
    // Tier 1 cells (close, < ~30u, capped at 400) get a unique
    // CanvasTexture with title + full preview. Tier 2 cells (the
    // bulk path, often 6000-14000 at saturation) reuse one of N
    // SHARED per-substrate materials — giving up per-cell content
    // uniqueness in exchange for flat O(1) GPU memory regardless of
    // cell count. Per-cell unique tier-2 textures hit a hard wall
    // around 11000-12000 cells where GPU eviction stalled the tab
    // for 12-25s at a stretch (user 2026-05-03).
    // Tier-2 instanced path: try to add as an InstancedMesh instance
    // before allocating a per-cell Mesh. Falls through to the Mesh
    // path if the shared mat isn't built yet (chunked builder still
    // running) or if the (substrate, variant) bucket overflows
    // _MIXED3D_INST_CAPACITY. cellObjects entry is a "handle" (plain
    // object with isInstanceHandle: true) — eviction path detects
    // this and dispatches to swap-and-pop instead of scene.remove.
    // ALL tier-2 cells (including cs>=2) use the InstancedMesh path
    // 2026-05-26: shared mat is now per-(substrate, cs), so wide
    // cells get a texture sized for their colspan and join the
    // batched draw call. Replaces the earlier _mixed3dCellTextureMini
    // per-cell unique canvas path (commit 38d0fe7), which drifted to
    // wrong text scales and 400+ unique draw calls.
    if (tier === 2) {
      const matInfo = _mixed3dPickSharedMatVariantIdx(S, cell, cs);
      if (matInfo) {
        const inst = _mixed3dGetTier2InstMesh(S, matInfo.mat, matInfo.substrate, matInfo.variantIdx, matInfo.cs);
        const idx = _mixed3dAddTier2Instance(S, inst, cell.id, tx, ty, tz, rotX, rotY, planeW, planeH);
        if (idx >= 0) {
          const handle = {
            isInstanceHandle: true,
            userData: { tier: 2, cellEl: cell },
            meshKey: inst.key,
            idx,
            // Mount metadata stashed so the re-tier sweep can rebuild
            // this instance as a tier-1 Mesh (unique CanvasTexture)
            // when the camera approaches. Without these the sweep had
            // to skip instance handles, leaving 90% of cells locked at
            // the shared 96×288 texture even when 3.5u from camera —
            // user feedback 2026-05-04: "when the camera slow scans a
            // wall there usually isn't anything readable there".
            mountTx: tx, mountTy: ty, mountTz: tz,
            mountRotX: rotX, mountRotY: rotY,
            mountPlaneW: planeW, mountPlaneH: planeH,
            mountIsTop: isTop,
          };
          handle.userData.colspan = cs;
          handle.userData.canvasW = canvasW;
          handle.userData.canvasH = canvasH;
          map.set(cell.id, handle);
          S.cellTier.set(cell.id, 2);
          S.cellSlotKeys.set(cell.id, key);
          if (isTop) S.usedSlots.add(key);
          S.towerCellCount[towerIdx]++;
          mounted++;
          continue;
        }
      }
      // Fall through to Mesh-based fallback below.
    }

    let mat;
    if (tier === 1) {
      // Build texture directly from cached canvas when available — see
      // commit e317751 note in _mixed3dSwapCellTier: the placeholder-
      // canvas-then-reassign-image pattern caused Three.js to bind the
      // placeholder's smaller dimensions, clipping the body region.
      const cachedSnap = _mixed3dSnapCacheGet(S, cell.id);
      let tex;
      if (cachedSnap) {
        tex = new T.CanvasTexture(cachedSnap);
      } else {
        tex = _mixed3dCellTexture(cell, isTop, cyan, pink, cs);
      }
      tex.minFilter = T.LinearFilter;
      tex.magFilter = T.LinearFilter;
      mat = new T.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1.0,
        // DoubleSide so cells stay visible when the camera looks at
        // them through the opposite tower face. Otherwise back-facing
        // tier-1 cells are culled and the tower reads as empty from
        // behind.
        side: T.DoubleSide,
        depthWrite: false,
      });
      S.tier1Count = (S.tier1Count || 0) + 1;
    } else {
      // Tier-2 fallback Mesh: shared mat not ready yet OR instance
      // bucket overflow. Try the per-(substrate, cs) shared variant
      // first — gives correct text scale and aspect. Falls back to
      // the cs=1 html variant as last resort.
      const sharedMat = _mixed3dPickSharedMat(S, cell, cs)
        || S.sharedSubstrateMats?.get("html:1")?.[0];
      if (sharedMat) {
        mat = sharedMat;
      } else {
        // Truly nothing built yet (very early boot). Use mini-texture
        // as deep fallback. The chunked drainer will populate variants
        // shortly; cells caught in this window will keep their unique
        // canvas until they next demote/remount.
        const tex = _mixed3dCellTextureMini(cell, isTop, cyan, pink, cs, planeW, planeH);
        mat = new T.MeshBasicMaterial({
          map: tex, transparent: true, opacity: 1.0,
          side: T.DoubleSide, depthWrite: false,
        });
      }
    }

    const obj = new T.Mesh(planeGeo, mat);
    obj.position.set(tx, ty, tz);
    obj.rotation.set(rotX, rotY, 0);
    // frustumCulled enabled so off-screen cells skip the GPU
    // submission. With 7000+ cells on swoopy-tour, the camera sees
    // maybe 200-400 at any given moment — culling drops 95% of the
    // per-frame mesh submission work.
    obj.frustumCulled = true;
    obj.userData.cellEl = cell;
    obj.userData.tier = tier;
    obj.userData.colspan = cs;
    obj.userData.canvasW = canvasW;
    obj.userData.canvasH = canvasH;
    // Hide-until-first-paint: cells flash WHITE for a frame between
    // scene.add and the first texture upload because Three.js samples
    // the not-yet-uploaded GL texture as default-white. visible=false
    // skips the render, then we flip true after the GPU upload has
    // actually happened.
    //
    // SINGLE rAF was not enough (user 2026-05-24 follow-up: "still
    // white tiles at load, some blinking"). The rAF callback runs
    // BEFORE that frame's renderer.render() call — so visible=true,
    // then the render samples the still-default 1×1 white tex, and
    // only the NEXT render uses the uploaded texture. Chain two rAFs
    // so the upload-on-first-render has completed before we reveal.
    // Also force the upload synchronously via renderer.initTexture
    // when available — cuts the race entirely for browsers that have
    // it. Belt-and-suspenders because the load-burst mounts dozens of
    // cells in one tick and even one slipping through is visible.
    obj.visible = false;
    if (S.renderer?.initTexture && obj.material?.map) {
      try { S.renderer.initTexture(obj.material.map); } catch (_) {}
    }
    requestAnimationFrame(() => requestAnimationFrame(() => { obj.visible = true; }));
    S.scene.add(obj);
    map.set(cell.id, obj);
    S.cellTier.set(cell.id, tier);
    S.cellSlotKeys.set(cell.id, key);
    // usedSlots is only used to mark the single tower-top slot; side
    // columns track fullness via columnPlans.nextIdx (advanced in
    // the picker).
    if (isTop) S.usedSlots.add(key);
    S.towerCellCount[towerIdx]++;
    mounted++;
  }

  S.mountDrainTotal = (S.mountDrainTotal || 0) + mounted;
  if (S.mountQueue.length > 0) {
    _mixed3dScheduleDrain();
  } else {
    S.mountDraining = false;
    const wall = performance.now() - (S.mountDrainStart || start);
    LOG.debug(`[mixed3d] mount drain done: ${S.mountDrainTotal} cells in ${wall.toFixed(0)}ms wall @ ${performance.now().toFixed(0)}ms`);
  }
}

// Lookup helper: if any column on the (tower, face) already has a
// plan, reuse its positions so all 6 columns share the same row
// heights. Without this, a wide colspan=2 cell at row p in col=N
// can sit at a y/h that overlaps col=N+1's other rows because their
// independent random heights diverged. Per-column variance kept
// only WITHIN a column (no, actually: the positions array IS the
// per-column variance — by sharing the positions, all columns on
// a face line up horizontally row-by-row).
function _mixed3dGetFaceSharedPlan(S, towerIdx, face) {
  const G = S.geometry;
  for (let c = 0; c < G.slotsPerFaceX; c++) {
    const ck = `${towerIdx}:${face}:${c}`;
    const p = S.columnPlans.get(ck);
    if (p) return p;
  }
  return null;
}

// Plan one column's cell stack. Picks a random cell count near
// slotsPerFaceY, generates per-cell heights with ±50% variance, then
// distributes any leftover space as inter-cell padding so the first
// cell sits flush at y=0 and the last cell ends flush at y=towerH —
// no whitespace at top or bottom (user 2026-05-03 "first/last cell
// crisply flush ... pretty dense ... variation in heights").
function _mixed3dPlanColumn(towerH, targetCount, cellW) {
  // Variable heights — clamp removed 2026-05-21 per
  // "abandon the idea of a fixed vertical height cell + muuri six
  // column layout on each tower face". Per-cell canvas dims now
  // match the cell's mesh aspect at mount time so texture sampling
  // stays uniform regardless of slot.h variance.
  const MAX_H = Infinity;
  const N = targetCount;
  // User 2026-05-19: 'the top and bottom of each face need some
  // padding too'. Inset 0.5u from both tower base and top so cells
  // don't kiss the cyan edge tubes on the top/bottom rims either.
  // Reverses the 2026-05-03 "flush" decision.
  const baseY = 0.5;
  const topPad = 0.5;
  const usableH = towerH - baseY - topPad;
  // Inter-cell padding: each gap drawn from [0.28u, 0.52u] for a
  // visibly varied "evenly-but-randomly-spaced" feel (user 2026-05-03
  // "or a little randomly spaced out actually, that could be nice").
  // Cell heights ALSO vary randomly within the column. The two
  // sources of variation compose without explicit coordination —
  // heights are normalized so they sum to (usableH - sumPads),
  // pinning first cell at y=baseY=0 and last cell ending at y=towerH.
  const padBase = 0.4;
  const padVariance = 0.3; // factor: pads in [padBase*0.7, padBase*1.3]
  const pads = [];
  let sumPad = 0;
  for (let i = 0; i < N - 1; i++) {
    const p = padBase * (1 - padVariance + Math.random() * padVariance * 2);
    pads.push(p);
    sumPad += p;
  }
  const cellTotal = usableH - sumPad;
  const fractions = [];
  for (let i = 0; i < N; i++) fractions.push(0.55 + Math.random() * 1.05);
  const sumF = fractions.reduce((a, b) => a + b, 0);
  let heights = fractions.map(f => f * cellTotal / sumF);
  // Apply the 3:1 max-aspect clamp. Any pixels above the cap become
  // additional inter-cell padding so the column still fills towerH.
  if (MAX_H !== Infinity) {
    const clamped = heights.map(h => Math.min(h, MAX_H));
    const extra = heights.reduce((a, b) => a + b, 0) - clamped.reduce((a, b) => a + b, 0);
    if (extra > 0 && N > 1) {
      const perGap = extra / (N - 1);
      for (let i = 0; i < pads.length; i++) pads[i] += perGap;
      sumPad += extra;
    }
    heights = clamped;
  }
  const positions = [];
  let y = baseY;
  for (let i = 0; i < N; i++) {
    positions.push({ y, h: heights[i] });
    y += heights[i];
    if (i < N - 1) y += pads[i];
  }
  // Floating-point drift: nudge final cell so its top is exactly
  // at towerH - topPad (last cell flush with the top-pad edge).
  const last = positions[positions.length - 1];
  last.h = (towerH - topPad) - last.y;
  // Consumption-order bias: sort by distance-from-camera-altitude so the
  // first-consumed slots are the ones the swoopy camera (y ~4.5) can
  // actually read at low pitch. Random shuffle within each (small) bin
  // keeps the field from looking grid-striped while still keeping pitch
  // <20° on every real cell the camera approaches. Replaces the pure-
  // random shuffle (user 2026-05-24 "camera path is looking almost
  // straight up at a cell" — tower-top slots forced 70°+ pitch).
  // Earlier pure-bottom-up pattern was disliked too (user 2026-05-19);
  // this is the camera-altitude-anchored middle ground.
  const CAM_Y = 4.5;
  const BIN_SIZE = 2.0;  // ~2u bins → ~6-8 bins per tower
  const tagged = positions.map((p, i) => ({
    p,
    rank: Math.floor(Math.abs((p.y + p.h * 0.5) - CAM_Y) / BIN_SIZE),
    jitter: Math.random(),
  }));
  tagged.sort((a, b) => a.rank - b.rank || a.jitter - b.jitter);
  const sorted = tagged.map(t => t.p);
  return { positions: sorted, nextIdx: 0 };
}

// Decorative layer — fills every tower face slot with an InstancedMesh
// quad of a generic hackers-themed texture, so the tower city always
// looks fully populated. Real cells (tier-1 / tier-2) mount in front
// of the decoratives at the same slot positions; depth-test handles
// occlusion. No DOM, no cellObjects map entry, no tier-1 promotion
// eligibility. User 2026-05-19: "decorative tier also probably
// similar to what we used to call ephemeral viz cells, just little
// animations that match the theme" and "we should be hovering around
// full towers at all times".
//
// Capacity: 100 towers × 4 faces × 6 cols × 5 rows = 12000 instances.
// One shared CanvasTexture (96×288 procedural scanline+block pattern)
// reused across all instances; per-instance instanceColor jitter
// breaks visual repetition.
function _mixed3dBuildDecorativeLayer() {
  const S = _mixed3dState;
  if (!S || S._decorativeBuilt) return;
  const T = window.THREE;
  if (!T || !S.towerMeshes || !S.geometry) return;
  // Defer until Eurostile is ready — without this, the canvas paints
  // before the @font-face WOFF2 has loaded and falls back to system
  // monospace. User 2026-05-19: "note we have the actual font
  // available in the repo, don't just use a random monospace font".
  // document.fonts.check returns true once Eurostile is decoded.
  if (typeof document !== "undefined" && document.fonts && !document.fonts.check('14px "Eurostile"')) {
    document.fonts.load('14px "Eurostile"').then(() => _mixed3dBuildDecorativeLayer());
    return;
  }
  S._decorativeBuilt = true;

  // Procedural terminal-text texture. User 2026-05-19: "the content
  // in the movie is mostly terminal text" + "be sure to use the right
  // font for terminal text". Real monospace glyphs (system mono ->
  // Share Tech Mono / Eurostile fallback) drawn as random hackers-
  // aesthetic tokens. 256×768 canvas so 14px-tall chars are crisp
  // when sampled by the GPU at tower-face distance.
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");
  // Background stays fully transparent. User 2026-05-19: "the cells
  // should basically have no background ... bright text on
  // transparent glass (behind which is a dark background)". The dark
  // void behind the towers + the tower-edge cyan supplies all the
  // backdrop; the decorative is glyphs only.
  // Token pools, grouped by length so row-template generators can
  // pick the right-shaped token. Ref-driven (monitor_directory_
  // listing.png mixes long ALL-CAPS phrases, short codes, numeric
  // dumps, arrows, indented continuations, and filler bars).
  const TOK_LONG = [
    "SHIPPING_FORECASTS", "ACCOUNTANTS", "COMPANY_STATUS",
    "WAREHOUSE_LOCATIONS", "COMPOSITE_PLANTS", "INSTRUCTION_PIPELINE",
    "ANNUAL_BUDGETS", "TROPIC_REPORTS", "INSTRUMENTATION_FLAG",
    "SEABOARD_LAWS", "KINEMATICS", "TROPIC_EXPEND",
    "MEMORY_FENCE_TABLE", "DOMAIN_HEAD_BLOCK", "RECRUITMENT",
    "CARRIAGE_RETURN", "RUBBER_RECOVERY",
  ];
  const TOK_MED = [
    "STATUS", "READY", "BUFFER", "TARGET", "PASS", "CALL", "RESP",
    "BIND", "STORE", "LOAD", "DUMP", "WAIT", "ACK", "NAK", "GARBAGE",
    "PAYROLL", "TIME_CHECK", "SCREEN_BUF", "INVOICE", "FREIGHT",
  ];
  const TOK_SHORT = [
    "RX", "TX", "OK", "Q", "z", "FF", "00", "FAIL", "INIT", "RUN",
    "EXEC", "HLT", "JMP", "RET", "MOV", "POP", "PUSH", "TIK", "ETA",
  ];
  // Trimmed from 11 → 4 entries 2026-05-19 (user 'we can have less
  // hex code in the decorative cells'). Plus dropped the weight of
  // templates 3 (word+hex) and 7 (hex chain) below.
  const TOK_HEX = [
    "0xABCD", "0x00FE", "0xFF", "0x0042",
  ];
  const TOK_NUM = [
    "1.4e3", "0.998", "-0001", "+1923", "12.4ms", "0/1", "1/0",
    "::1", "0.0", "127.0.0.1", "$00FE", "$0042",
  ];
  const ARROWS = ["->", "=>", "<-", ">>", "<<", "==", "::"];
  const FILLER_CHARS = [".", "-", "=", "_", "+"];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  ctx.font = '18px "Share Tech Mono", "Eurostile", "Consolas", "Courier New", monospace';
  ctx.textBaseline = "top";

  // 9 row templates, each producing a distinct shape so the visual
  // density of any column doesn't flatten into "uniform length blocks".
  // template id → string-producer.
  const templates = [
    () => null, // 1. blank line
    () => pick(TOK_LONG), // 2. one long word
    () => `${pick(TOK_MED)} ${pick(TOK_HEX)}`, // 3. word + hex
    () => `${pick(TOK_LONG)} ${pick(ARROWS)} ${pick(TOK_MED)}`, // 4. word -> word
    () => `${pick(TOK_SHORT)} ${pick(TOK_SHORT)} ${pick(TOK_SHORT)}`, // 5. three short codes
    () => `${pick(TOK_MED)}=${pick(TOK_NUM)}`, // 6. key=value
    () => `${pick(TOK_HEX)} ${pick(ARROWS)} ${pick(TOK_HEX)}`, // 7. hex chain
    () => `${pick(FILLER_CHARS).repeat(4 + Math.floor(Math.random() * 18))}`, // 8. filler bar
    () => `+-- ${pick(TOK_MED)}`, // 9. tree-branch indent
  ];
  // Weighted bias: short/medium templates more common than long.
  // Hex-using templates 3 (word+hex) and 7 (hex chain) weights dialed
  // back 2026-05-19 per user 'less hex code in the decorative cells'.
  // Indices: [blank, long, word+hex, word->word, three-shorts, key=val,
  //           hex-chain, filler-bar, tree-branch]
  const templateWeights = [3, 3, 1, 3, 4, 3, 0, 1, 2];
  const totalWeight = templateWeights.reduce((a, b) => a + b, 0);
  const pickTemplate = () => {
    let r = Math.random() * totalWeight;
    for (let i = 0; i < templates.length; i++) {
      r -= templateWeights[i];
      if (r <= 0) return templates[i];
    }
    return templates[0];
  };

  // Paint helper — called N times to generate N distinct decorative
  // canvases. Math.random() inside the row loop gives unique content
  // per canvas. User 2026-05-19: 'I'm seeing some duplication in
  // decorative cell text, like several "kinematics" cells next to
  // each other ... we need a lot more variety'.
  const paintDecoCanvas = () => {
    const can = document.createElement("canvas");
    can.width = 256;
    can.height = 768;
    const c2 = can.getContext("2d");
    c2.fillStyle = "rgba(0, 221, 255, 0.06)";
    for (let y = 0; y < 768; y += 6) c2.fillRect(0, y, 256, 1);
    c2.font = '18px "Share Tech Mono", "Eurostile", "Consolas", "Courier New", monospace';
    c2.textBaseline = "top";
    const rH = 24;
    for (let y = 2; y < 760; y += rH) {
      const tmpl = pickTemplate();
      const txt = tmpl();
      if (!txt) continue;
      const rowAlpha = 0.85 + Math.random() * 0.15;
      // 4% of rows highlight in purple — "cyan with purple highlights"
      // per the tightened normal-scene rule. Was pink (#ff3a8c) for the
      // "rare highlight" framing; pink now reserved for under-attack
      // tower state only.
      if (Math.random() < 0.04) {
        c2.fillStyle = `rgba(153, 102, 255, ${rowAlpha.toFixed(2)})`;
      } else {
        c2.fillStyle = `rgba(0, 221, 255, ${rowAlpha.toFixed(2)})`;
      }
      c2.fillText(txt, 4, y);
    }
    const t = new T.CanvasTexture(can);
    t.minFilter = T.LinearFilter;
    t.magFilter = T.LinearFilter;
    // RepeatWrapping so texture.offset.y can scroll the content
    // continuously without showing a hard edge. User 2026-05-19: 'in
    // the movie there are clearly text typing, lists scrolling etc'.
    t.wrapS = T.RepeatWrapping;
    t.wrapT = T.RepeatWrapping;
    return t;
  };

  // Bumped 16→32 (2026-05-21) — user saw lots of duplicate decoratives
  // near each other when looking closely. 32 variants × ~440KB ≈ 14MB
  // GPU still fits comfortably; visible duplication per face drops
  // by ~half. Hash spread (col*47 ^ p*31) gives ~independent draws
  // across adjacent slots at the larger pool.
  const N_TEXTURES = 32;
  const textures = [];
  for (let i = 0; i < N_TEXTURES; i++) textures.push(paintDecoCanvas());

  const materials = textures.map((tex) => new T.MeshBasicMaterial({
    map: tex,
    transparent: false,
    alphaTest: 0.1,
    depthWrite: true,
    toneMapped: false,
    side: T.DoubleSide,
  }));

  const G = S.geometry;
  const totalSlots = S.towerMeshes.length * 4 * G.slotsPerFaceX * G.slotsPerFaceY;
  const perMeshCap = Math.ceil(totalSlots / N_TEXTURES) + 100;

  // 16 InstancedMeshes, one per texture. Each slot deterministically
  // picks a mesh via hash, so adjacent slots usually land on different
  // textures = visible variety. Per-instance instanceColor adds another
  // brightness/RGB jitter layer on top.
  const planeGeo = new T.PlaneGeometry(1, 1);
  const meshes = materials.map((mat) => {
    const m = new T.InstancedMesh(planeGeo, mat, perMeshCap);
    m.count = 0;
    m.frustumCulled = false;
    m.renderOrder = -1;
    S.scene.add(m);
    return m;
  });
  S._decorativeMeshes = meshes;

  const m4 = new T.Matrix4();
  const q = new T.Quaternion();
  const e = new T.Euler();
  const v = new T.Vector3();
  const sc = new T.Vector3();
  const colorTmp = new T.Color();

  // Slot → decorative instance index, so a real cell mount can call
  // _mixed3dHideDecorativeAtSlot to suppress the decorative behind
  // it. Otherwise the decorative's terminal text bleeds through any
  // transparent pixels in the real cell's substrate render.
  S._decorativeSlotIdx = new Map();

  for (let towerIdx = 0; towerIdx < S.towerMeshes.length; towerIdx++) {
    const tower = S.towerMeshes[towerIdx];
    for (let face = 0; face < 4; face++) {
      const faceSpec = tower.faces[face];
      const dxNorm = faceSpec.dx === 0 ? 0 : faceSpec.dx > 0 ? 1 : -1;
      const dzNorm = faceSpec.dz === 0 ? 0 : faceSpec.dz > 0 ? 1 : -1;
      // outBoost +0.05 sits behind real cells (real uses +0.12), in
      // front of the tower glass (+0.0). Real cells naturally win the
      // depth test; decoratives only show where no real cell exists.
      const outBoost = 0.05;
      for (let col = 0; col < G.slotsPerFaceX; col++) {
        // Reuse the existing column plan if real cells already touched
        // this column — keeps decoratives aligned to the same y/h slots
        // real cells use. Otherwise build + store one so future real
        // cells inherit it.
        const planKey = `${towerIdx}:${face}:${col}`;
        let plan = S.columnPlans.get(planKey);
        if (!plan) {
          // Share positions across columns on the same face (#157
          // overlap fix). nextIdx stays per-column.
          const facePlan = _mixed3dGetFaceSharedPlan(S, towerIdx, face);
          const positions = facePlan
            ? facePlan.positions
            : _mixed3dPlanColumn(G.towerH, G.slotsPerFaceY, G.cellW).positions;
          plan = { positions, nextIdx: 0 };
          S.columnPlans.set(planKey, plan);
        }
        const colOffset = (col - (G.slotsPerFaceX - 1) / 2) * G.slotW;
        const tx = tower.mesh.position.x + faceSpec.dx + faceSpec.hx * colOffset + dxNorm * outBoost;
        const tz = tower.mesh.position.z + faceSpec.dz + faceSpec.hz * colOffset + dzNorm * outBoost;
        const rotY = faceSpec.rotY;
        for (let p = 0; p < plan.positions.length; p++) {
          const slot = plan.positions[p];
          const ty = slot.y + slot.h / 2;
          v.set(tx, ty, tz);
          e.set(0, rotY, 0, "XYZ");
          q.setFromEuler(e);
          sc.set(G.cellW, slot.h, 1);
          m4.compose(v, q, sc);
          // Pick which of the N decorative textures this slot uses.
          // Deterministic hash so the same slot always gets the same
          // texture; spread keys ensure adjacent slots usually differ.
          const h = ((towerIdx * 1009) ^ (face * 113) ^ (col * 47) ^ (p * 31)) >>> 0;
          const meshIdx = h % N_TEXTURES;
          const targetMesh = meshes[meshIdx];
          const instIdx = targetMesh.count;
          targetMesh.setMatrixAt(instIdx, m4);
          S._decorativeSlotIdx.set(`${towerIdx}:${face}:${col}:${p}`, { meshIdx, instIdx });
          // Per-instance brightness + slight RGB jitter — keep range
          // tight (0.85-1.0) so each cell stays crisp; the variation is
          // about breaking the "identical wallpaper" effect, not dimming.
          const s1 = ((towerIdx * 31 + face * 17 + col * 11 + p * 7) % 100) / 100;
          const s2 = ((towerIdx * 13 + face * 23 + col * 5 + p * 29) % 100) / 100;
          const bright = 0.85 + s1 * 0.15;
          colorTmp.setRGB(
            bright * (0.95 + s2 * 0.05),
            bright * (1.0 + s1 * 0.04),
            bright * (1.0 + s2 * 0.05),
          );
          targetMesh.setColorAt(instIdx, colorTmp);
          targetMesh.count++;
        }
      }
    }
  }
  let totalCount = 0;
  for (const m of meshes) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    totalCount += m.count;
  }
  LOG.debug(`[mixed3d] decorative layer built: ${totalCount} instances across ${N_TEXTURES} textures`);
}

// Per-frame animation step for decoratives. User 2026-05-19: 'in the
// movie there are clearly text typing, lists scrolling etc' +
// 'blinking'. Three layers of per-MATERIAL animation (cheap — one
// uniform update per mesh, not per-instance):
//   1. Texture UV.y scroll: each mesh rolls its texture at its own
//      rate, so cells using that mesh appear to scroll terminal
//      output. Different meshes scroll at different rates → variety.
//   2. Brightness pulse: smooth sine oscillation around 0.92 ± 0.08,
//      each mesh with its own period and phase. Reads as gentle
//      breathing on each mesh group, never all-in-sync.
//   3. Discrete blink: once every ~4s a random mesh briefly dims to
//      ~0.25 brightness for 80ms. Reads as a "this terminal just
//      ACKed something" flash across the canyon.
function _mixed3dStepDecoratives(t) {
  const S = _mixed3dState;
  if (!S || !S._decorativeMeshes) return;
  if (!S._decoBlink) S._decoBlink = { nextT: t + 4 + Math.random() * 3, meshIdx: -1, until: 0 };
  const blink = S._decoBlink;
  if (blink.until > 0 && t > blink.until) {
    blink.meshIdx = -1;
    blink.until = 0;
  }
  if (t >= blink.nextT) {
    blink.meshIdx = Math.floor(Math.random() * S._decorativeMeshes.length);
    blink.until = t + 0.08;
    blink.nextT = t + 3 + Math.random() * 4;
  }
  const meshes = S._decorativeMeshes;
  // Per-mesh scroll state. UV scroll was sloppy because partial rows
  // were visible at the wrap edge (user 2026-05-19: 'scrolling a
  // partial line into or out of visibility just looks like sloppy').
  // Now: at each scroll tick, shift the canvas contents up by exactly
  // ROW_H px and paint a fresh line at the bottom. Texture re-uploads
  // to GPU once per scroll event (cheap — once every 2-4s per mesh).
  const ROW_H = 24;
  const CAN_W = 256, CAN_H = 768;
  if (!S._decoScrollState) {
    // First-scroll fires within ~80ms of init across all meshes so the
    // dashboard starts moving as soon as the boot overlay clears,
    // instead of staying static for 0.2–1.4s of staring at frozen
    // text. User 2026-05-21: "the decorative tiles don't start
    // scrolling for a while".
    S._decoScrollState = meshes.map((_, i) => ({
      nextT: t + 0.02 + (i * 0.005),
      period: 0.8 + (i * 0.13) % 1.2,
    }));
    // Shared scratch canvas so canvas-to-self drawImage with
    // overlapping source/dest rects can't produce undefined-behavior
    // smear (user 2026-05-19 'I think maybe your lines are overwriting
    // each other'). Reused across all 16 meshes — scroll events are
    // sequential within a single tick.
    S._decoScrollTempCan = document.createElement("canvas");
    S._decoScrollTempCan.width = CAN_W;
    S._decoScrollTempCan.height = CAN_H;
    S._decoLineGen = (() => {
      const longs = [
        "INSTRUCTION_PIPELINE", "COMPANY_STATUS", "RECRUITMENT",
        "WAREHOUSE_LOCATIONS", "COMPOSITE_PLANTS", "ANNUAL_BUDGETS",
        "TROPIC_EXPEND", "INSTRUMENTATION_FLAG", "DOMAIN_HEAD_BLOCK",
        "MEMORY_FENCE_TABLE", "SHIPPING_FORECASTS",
      ];
      const meds = [
        "STATUS", "READY", "BUFFER", "PASS", "CALL", "RESP", "BIND",
        "STORE", "LOAD", "DUMP", "WAIT", "ACK", "NAK", "GARBAGE",
        "PAYROLL", "TIME_CHECK", "SCREEN_BUF", "INVOICE", "FREIGHT",
      ];
      const shorts = [
        "RX", "TX", "OK", "FF", "00", "FAIL", "INIT", "RUN", "EXEC",
        "HLT", "JMP", "RET", "MOV", "POP", "PUSH",
      ];
      const arrows = ["->", "=>", "<-", ">>", "::"];
      const nums = ["1.4e3", "0.998", "12.4ms", "127.0.0.1", "$00FE", "0xABCD"];
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      return () => {
        const r = Math.random();
        if (r < 0.10) return pick(longs);
        if (r < 0.25) return `${pick(meds)} ${pick(arrows)} ${pick(meds)}`;
        if (r < 0.40) return `${pick(meds)}=${pick(nums)}`;
        if (r < 0.55) return `${pick(shorts)} ${pick(shorts)} ${pick(shorts)}`;
        if (r < 0.65) return `+-- ${pick(meds)}`;
        if (r < 0.78) return `${pick(meds)} ${pick(nums)}`;
        if (r < 0.85) return ".".repeat(6 + Math.floor(Math.random() * 14));
        if (r < 0.92) return `${pick(longs)} ${pick(arrows)} ${pick(shorts)}`;
        return pick(meds);
      };
    })();
  }
  for (let i = 0; i < meshes.length; i++) {
    const m = meshes[i];
    if (!m.material || !m.material.map) continue;
    m.material.map.offset.y = 0;
    const state = S._decoScrollState[i];
    if (t >= state.nextT) {
      const can = m.material.map.image;
      const ctx = can.getContext("2d");
      const tempCan = S._decoScrollTempCan;
      const tempCtx = tempCan.getContext("2d");
      // Copy upper-shifted content into temp; clear original; copy
      // back. Two non-overlapping drawImage calls — defined behavior.
      tempCtx.clearRect(0, 0, CAN_W, CAN_H);
      tempCtx.drawImage(can, 0, ROW_H, CAN_W, CAN_H - ROW_H, 0, 0, CAN_W, CAN_H - ROW_H);
      ctx.clearRect(0, 0, CAN_W, CAN_H);
      ctx.drawImage(tempCan, 0, 0, CAN_W, CAN_H - ROW_H, 0, 0, CAN_W, CAN_H - ROW_H);
      ctx.font = '18px "Share Tech Mono", "Eurostile", "Consolas", "Courier New", monospace';
      ctx.textBaseline = "top";
      const rowAlpha = 0.85 + Math.random() * 0.15;
      // Mirror the initial-paint rule: 4% purple highlight, rest cyan.
      // Pink reserved for under-attack tower state.
      ctx.fillStyle = Math.random() < 0.04
        ? `rgba(153, 102, 255, ${rowAlpha.toFixed(2)})`
        : `rgba(0, 221, 255, ${rowAlpha.toFixed(2)})`;
      const tok = S._decoLineGen();
      ctx.fillText(tok, 4, CAN_H - ROW_H + 2);
      m.material.map.needsUpdate = true;
      state.nextT = t + state.period + Math.random() * 0.6;
    }
    let pulse = 0.92 + 0.08 * Math.sin((t / (1.5 + (i * 0.137) % 2)) * 2 * Math.PI + i * 0.6);
    if (i === blink.meshIdx) pulse = 0.25;
    m.material.color.setRGB(pulse, pulse, pulse);
  }
}

// Suppress the decorative instance behind a slot a real cell just
// claimed. Move it far off-screen so the GPU still processes its
// vertex but it never lands in the frustum. Without this, the
// decorative's terminal text bleeds through any transparent pixels
// in the real cell's substrate render.
function _mixed3dHideDecorativeAtSlot(towerIdx, face, col, p) {
  const S = _mixed3dState;
  if (!S || !S._decorativeMeshes || !S._decorativeSlotIdx) return;
  const key = `${towerIdx}:${face}:${col}:${p}`;
  const slot = S._decorativeSlotIdx.get(key);
  if (!slot) return;
  const mesh = S._decorativeMeshes[slot.meshIdx];
  if (!mesh) return;
  const T = window.THREE;
  const m4 = new T.Matrix4().makeTranslation(0, -99999, 0);
  mesh.setMatrixAt(slot.instIdx, m4);
  mesh.instanceMatrix.needsUpdate = true;
  S._decorativeSlotIdx.delete(key);
}

// Find a slot for a freshly minted cell, biased toward where the user
// is currently looking. Sorts towers by lowest cell count + nearest
// to camera target. Within the picked tower, walks col→face and uses
// the column-pack plan to return the next { y, h } slot in that
// column. Returns null if every column on every tower is fully packed.
// Derive horizontal span (1..3) for a cell from its substrate/subtype.
// Wider cells get more body area; the visual signature of narrow
// columns is preserved by leaving most cells at colspan=1.
// User 2026-05-21: "diagrams and graphs just don't like good squished
// into the tall vertical cell default" — graph-shaped substrates get
// 2 columns so mermaid flowcharts / vega / force_graph have aspect
// closer to 1:1.5 instead of 1:3.
function _mixed3dColspanForCell(cell) {
  if (!cell || !cell.dataset) return 1;
  const ct = cell.dataset.cellType || "";
  // At required tier-1 font sizes, content substrates need 4-6 columns
  // to stay legible. Decorative singletons (tier-2 procedural fill) keep
  // colspan=1 and pack the gaps between tier-1 cells, preserving the
  // visual 6-column read.
  const SUBSTRATES_NEEDING_BREADTH = new Set([
    "mermaid", "html", "vega", "force_graph", "timeline_ribbon",
    "animated_svg", "treemap",
  ]);
  if (ct === "mermaid") {
    const sub = cell.dataset.mermaidSubtype || "";
    // Flowcharts + their wide cousins (gitGraph, gantt, sankey, ER)
    // take the full 6-col face. User 2026-05-25 on cell-6080: "this
    // should be a full 6 colspan diagram" — flowcharts with non-
    // trivial branching are illegible at colspan=3 (was the prior
    // setting). Trade-off: colspan=6 means one diagram occupies the
    // whole tower-face row, no neighbors pack alongside.
    if (sub === "flowchart" || sub === "gitGraph" || sub === "gantt"
        || sub === "sankey-beta" || sub === "erDiagram") {
      return 6;
    }
    if (sub === "timeline" || sub === "quadrantChart" || sub === "mindmap") {
      return 3;
    }
    return 2;
  }
  // All structured html layouts default to colspan=3 (was 2 →
  // bumped 2026-05-24 with the decorative-text renderer). With the
  // new bold cyan rows + 2-line wrap, wider cells give the text
  // landscape aspect instead of tall portrait — matches user request
  // "should be multiple columns wide and also shorter". Combined
  // with the html height cap at mount (cellW * cs * 1.4) the cells
  // come out roughly landscape-1.4:1 — content fills the frame.
  if (ct === "html") {
    return 3;
  }
  if (ct === "vega" || ct === "force_graph" || ct === "timeline_ribbon"
      || ct === "animated_svg" || ct === "treemap") {
    return 2;
  }
  if (ct === "gauge" || ct === "sparkline") return 1;
  return 1;
}

function _mixed3dPickSlotForNewCell(desiredColspan) {
  const S = _mixed3dState;
  if (!S) return null;
  const G = S.geometry;
  const cam = S.camera;
  // Allow up to colspan=4 — flowcharts and other wide mermaid types
  // benefit from 2/3 of the face. Face is 6 cols, so 4 leaves 2
  // remaining for narrower neighbours.
  const colspan = Math.max(1, Math.min(6, desiredColspan || 1));
  let targetX = cam.position.x;
  let targetZ = cam.position.z;
  // Lookahead: pick towers about to enter view, not towers in the
  // far distance. Earlier value (1.5×spacing ≈ 18u, ~5s ahead at
  // swoopy-tour speed) meant new cells landed on towers the user
  // wouldn't reach for several seconds — the cell had already aged
  // out of "fresh" by the time it appeared in view (user 2026-05-04
  // "we should be sure we're placing new cells along that visual
  // path so they're seen by the user shortly after minting").
  // 0.6×spacing ≈ 7u keeps new cells on the tower the camera is
  // about to fly past — visible within ~1-2 seconds of mint.
  const _lookahead = G.spacing * 0.6;
  if (S.opts.camera === "weave-grid" && S.weaveCam) {
    const dirX = _WEAVE_DIR_X[S.weaveCam.heading];
    const dirZ = _WEAVE_DIR_Z[S.weaveCam.heading];
    targetX += dirX * _lookahead;
    targetZ += dirZ * _lookahead;
  } else if (S.opts.camera === "dolly-canyon") {
    const t = (performance.now() - S.animation.t0) / 1000;
    const phase = (t % 24) / 24;
    const dir = phase < 0.5 ? 1 : -1;
    targetX += dir * _lookahead;
  } else {
    const fwd = new window.THREE.Vector3();
    cam.getWorldDirection(fwd);
    targetX += fwd.x * _lookahead;
    targetZ += fwd.z * _lookahead;
  }
  // 2026-05-20: cells were spreading evenly across all 100 towers (probe
  // showed every tower at 12-13 cells) because cell-count load-balanced.
  // First fix attempted inner-radius filter — but probe revealed the camera
  // path is at radius 37-50 from origin (the OUTER half of the grid), so
  // "inner towers" sat 20u behind whatever camera was actually next to.
  //
  // Real fix: compute each tower's distance to the camera path (bezier
  // curve), filter to towers within one spacing-unit of the path. Camera
  // grazes these towers directly. Path-adjacent set computed once per
  // picker call but cached on swoopCam since the curve is static after init.
  const sw = S.swoopCam;
  let pathDistByTower;
  if (sw && sw.curve && sw._pathDistByTower) {
    pathDistByTower = sw._pathDistByTower;
  } else if (sw && sw.curve) {
    // Sample 60 points along the curve, compute each tower's min distance.
    const samples = [];
    for (let i = 0; i < 60; i++) {
      const p = sw.curve.getPointAt(i / 60);
      samples.push([p.x, p.z]);
    }
    pathDistByTower = new Array(S.towerMeshes.length);
    for (let i = 0; i < S.towerMeshes.length; i++) {
      const tw = S.towerMeshes[i];
      let minD = Infinity;
      for (const [sx, sz] of samples) {
        const d = Math.hypot(tw.mesh.position.x - sx, tw.mesh.position.z - sz);
        if (d < minD) minD = d;
      }
      pathDistByTower[i] = minD;
    }
    sw._pathDistByTower = pathDistByTower;
  }
  const PATH_R = G.spacing * 1.2;  // ~14u: tower within ~1 spacing of path
  let ranked;
  if (pathDistByTower) {
    ranked = S.towerMeshes
      .map((tw, idx) => ({
        idx,
        count: S.towerCellCount[idx] || 0,
        dist: Math.hypot(tw.mesh.position.x - targetX, tw.mesh.position.z - targetZ),
        pathDist: pathDistByTower[idx],
      }))
      .filter(t => t.pathDist < PATH_R)
      .sort((a, b) => a.count - b.count || a.dist - b.dist);
  } else {
    ranked = [];
  }
  // Defensive fallback if no path-adjacent towers (no curve yet, e.g.
  // boot race) — fall back to full set sorted by current-camera distance.
  if (!ranked.length) {
    const fallback = S.towerMeshes.map((tw, idx) => ({
      idx,
      count: S.towerCellCount[idx] || 0,
      dist: Math.hypot(tw.mesh.position.x - targetX, tw.mesh.position.z - targetZ),
    })).sort((a, b) => a.count - b.count || a.dist - b.dist);
    ranked.push(...fallback);
  }
  // PASS 1: try to place at the desired colspan on every ranked
  // tower before falling back. Earlier loop fell back to colspan=1
  // on the same tower if no K-wide run was found, which made
  // wide-eligible cells (mermaid flowcharts, vega, force_graph)
  // mount as single-column when even a slightly-fragmented tower
  // was picked first. User saw it as a "tiny diagram" with extra
  // empty placeholder space.
  for (const { idx } of ranked) {
    let bestKey = null, bestFace = -1, bestCol = -1, bestNext = Infinity, bestSpanKeys = null;
    for (let face = 0; face < 4; face++) {
      for (let col = 0; col + colspan <= G.slotsPerFaceX; col++) {
        const spanKeys = [];
        let runP = -1, ok = true;
        for (let k = 0; k < colspan; k++) {
          const ck = `${idx}:${face}:${col + k}`;
          let plan = S.columnPlans.get(ck);
          if (!plan) {
            const facePlan = _mixed3dGetFaceSharedPlan(S, idx, face);
            const positions = facePlan
              ? facePlan.positions
              : _mixed3dPlanColumn(G.towerH, G.slotsPerFaceY, G.cellW).positions;
            plan = { positions, nextIdx: 0 };
            S.columnPlans.set(ck, plan);
          }
          if (plan.nextIdx >= plan.positions.length) { ok = false; break; }
          if (runP === -1) runP = plan.nextIdx;
          else if (plan.nextIdx !== runP) { ok = false; break; }
          spanKeys.push(ck);
        }
        if (!ok) continue;
        if (runP < bestNext) {
          bestNext = runP;
          bestKey = `${idx}:${face}:${col}`;
          bestFace = face;
          bestCol = col;
          bestSpanKeys = spanKeys;
        }
      }
    }
    if (bestKey !== null) {
      const plan = S.columnPlans.get(bestKey);
      const claimedP = plan.nextIdx;
      const slot = plan.positions[claimedP];
      for (const ck of bestSpanKeys) S.columnPlans.get(ck).nextIdx++;
      return {
        towerIdx: idx, facePri: bestFace, col: bestCol, key: bestKey,
        y: slot.y, h: slot.h, p: claimedP,
        colspan, spanKeys: bestSpanKeys,
      };
    }
  }
  // PASS 2: every tower failed at the desired colspan. Now fall
  // back to colspan=1 across all towers (also covers the
  // top-face top-slot case if no side slot worked).
  if (colspan > 1) {
    for (const { idx } of ranked) {
      let bestKey1 = null, bestFace1 = -1, bestCol1 = -1, bestNext1 = Infinity;
      for (let col = 0; col < G.slotsPerFaceX; col++) {
        for (let face = 0; face < 4; face++) {
          const key = `${idx}:${face}:${col}`;
          const plan = S.columnPlans.get(key);
          if (!plan || plan.nextIdx >= plan.positions.length) continue;
          if (plan.nextIdx < bestNext1) {
            bestNext1 = plan.nextIdx;
            bestKey1 = key;
            bestFace1 = face;
            bestCol1 = col;
          }
        }
      }
      if (bestKey1 !== null) {
        const plan = S.columnPlans.get(bestKey1);
        const claimedP = plan.nextIdx;
        const slot = plan.positions[claimedP];
        plan.nextIdx++;
        return {
          towerIdx: idx, facePri: bestFace1, col: bestCol1, key: bestKey1,
          y: slot.y, h: slot.h, p: claimedP,
          colspan: 1, spanKeys: [bestKey1],
        };
      }
    }
  }
  // PASS 3: top-face slot (one per tower). Tower tops are oriented
  // horizontally on the canyon — typically less visible during dolly
  // but still claimable if every side face is packed.
  for (const { idx } of ranked) {
    const topKey = `${idx}:4:0:0`;
    if (!S.usedSlots.has(topKey)) {
      return { towerIdx: idx, facePri: 4, col: 0, key: topKey, y: 0, h: 0 };
    }
  }
  return null;
}

export function teardownMixed3DLayout() {
  if (!_mixed3dState) return;
  const S = _mixed3dState;
  S.animation.running = false;
  // Stop the snap driver — it's a module-level setInterval that survives
  // _mixed3dState=null otherwise, ticking every 120ms forever on every
  // theme/layout switch. Inflight Set cleared so the stale-state guard
  // in _mixed3dCompositeAndCacheSnap doesn't have to handle them either.
  if (_mixed3dSnapInterval) {
    clearInterval(_mixed3dSnapInterval);
    _mixed3dSnapInterval = null;
  }
  _mixed3dSnapInflight.clear();
  // Cells are now WebGL Plane meshes — their DOM elements never
  // moved (stayed in #notebook hidden via CSS), so no DOM reset is
  // needed. Just dispose the meshes; the scene.traverse below picks
  // up textures + materials + geometries via the same disposal path.
  S.cellObjects.clear();
  if (S.cellTier) S.cellTier.clear();
  // Dispose Three.js resources. Material.dispose() does NOT dispose
  // attached textures — the code-rain CanvasTextures must be released
  // explicitly or they leak GPU memory across layout switches.
  S.scene.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    }
  });
  try { S.renderer.dispose(); } catch (e) { /* swallow */ }
  if (S.wrap && S.wrap.parentElement) S.wrap.parentElement.removeChild(S.wrap);
  if (S.onResize) window.removeEventListener("resize", S.onResize);
  // war-room sibling hides #theme-furniture while live; restore it
  // here so a subsequent switch back to layout=warroom shows the 2D
  // situations-board.
  if (S._restoreThemeFurniture) {
    try { S._restoreThemeFurniture(); } catch (e) { /* swallow */ }
  }
  if (S._warroomCycleId) {
    clearInterval(S._warroomCycleId);
    S._warroomCycleId = null;
  }
  if (S.onKey) window.removeEventListener("keydown", S.onKey);
  if (window.lucidaToggleDanger) delete window.lucidaToggleDanger;
  document.body.classList.remove("layout-mixed3d");
  _mixed3dState = null;
}


