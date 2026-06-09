// Viewport / visibility utilities — auto-pan animation for overflowing cell
// content, and a pause-off-screen hook for animations that should freeze
// when their host element scrolls out of view. Extracted from lucida.mjs as
// part of task #70 (per-theme/per-concern module split). Both helpers have
// zero external state deps, so they live cleanly in their own module.
//
// Public exports:
//   pauseOffScreen(el, onShow, onHide) — IntersectionObserver wrapper
//   setupAutoPan(container, content, opts) — Furnas focus+context pan tour

// Pause off-screen 3D content (Three.js render loops, A-Frame scenes) via
// IntersectionObserver. Multiple live WebGL contexts in one page wedge the
// render thread; this only animates what's visible.
export function pauseOffScreen(targetEl, onShow, onHide) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) onShow();
      else onHide();
    }
  }, { rootMargin: "200px" });
  // Stash on the element so rerenderNotebook can disconnect on teardown.
  // Without this, every cell that's ever scrolled out of view leaves a
  // live IntersectionObserver behind across rerenders. Per audit
  // 2026-04-28.
  targetEl._pauseObserver = io;
  io.observe(targetEl);
}
// Auto-pan camera tour for cells whose intrinsic content exceeds the
// cell viewport (dense mermaid SVGs, wide html tables). Furnas
// focus+context principle (design-references.md) applied with animated
// camera moves: detect overflow, compute waypoints across the content,
// animate transform: translate(x,y) between them with a dwell at each
// position, loop. Automatic — no user interaction required. Honors
// prefers-reduced-motion (no animation), pauses on hover (so the
// reader can stop and inspect a frame), and pauses when the cell is
// offscreen via IntersectionObserver (no cycles burned in periphery).
//
// Caller is responsible for setting `content` to its natural size
// BEFORE calling this — for mermaid, that means overriding the SVG's
// auto-fit width/height so the natural pixel dimensions are used.
export function setupAutoPan(container, content, opts) {
  if (!container || !content) return;
  const reducedMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) return;

  // Defer one frame so the browser has measured the rendered content.
  requestAnimationFrame(() => {
    const cRect = container.getBoundingClientRect();
    const iRect = content.getBoundingClientRect();
    if (cRect.width < 80 || cRect.height < 60) return;  // too small to bother

    const overflowX = iRect.width - cRect.width > 20;
    const overflowY = iRect.height - cRect.height > 20;
    if (!overflowX && !overflowY) return;

    // Try column-anchored pan for tables: when content holds a single
    // <table> and overflow is horizontal, waypoints snap to column
    // boundaries so the camera reads column-by-column rather than
    // edge-to-edge. Decision 2026-04-29: "should pan from column to
    // column probably and not edge to edge."
    let columnAnchors = null;
    if (overflowX && !overflowY) {
      const table = (content.tagName === "TABLE")
        ? content
        : content.querySelector("table");
      if (table) {
        const headerRow = table.querySelector("thead tr") || table.querySelector("tr");
        if (headerRow && headerRow.children.length >= 2) {
          const cells = Array.from(headerRow.children);
          const baseLeft = (content.tagName === "TABLE"
            ? content.getBoundingClientRect()
            : iRect).left;
          const overflow = iRect.width - cRect.width;
          // Anchor x = column's left edge relative to content; clamp
          // the resulting translate to the total overflow so the last
          // column lands flush-right instead of overshooting.
          columnAnchors = cells.map(td => {
            const dx = td.getBoundingClientRect().left - baseLeft;
            return -Math.min(Math.max(0, dx), overflow);
          });
        }
      }
    }

    // Strip-pan fallback for non-table overflow (mermaid SVGs, etc).
    // Generate evenly-distributed frames per axis: at least 3 frames
    // (start / middle / end) when overflow is meaningful, more if
    // needed to keep ≤70% jump between frames. Decision 2026-04-29:
    // the prior floor()-based stride generated only corner waypoints
    // for typical overflow sizes, so the camera tour skipped the
    // interior of the diagram and "shows almost only the edges."
    const axisFrames = (overflow, containerSize) => {
      if (overflow <= 20) return [0];
      const minFrames = overflow > containerSize * 0.4 ? 3 : 2;
      const overlapStep = (opts && opts.overlap != null ? 1 - opts.overlap : 0.7);
      const byStride = Math.ceil(overflow / (containerSize * overlapStep)) + 1;
      const n = Math.max(minFrames, byStride);
      const frames = [];
      for (let i = 0; i < n; i++) {
        frames.push(-(i * overflow / (n - 1)));
      }
      return frames;
    };

    const waypoints = [];
    if (columnAnchors) {
      for (const x of columnAnchors) waypoints.push({ x, y: 0 });
    } else if (overflowX && !overflowY) {
      for (const x of axisFrames(iRect.width - cRect.width, cRect.width)) {
        waypoints.push({ x, y: 0 });
      }
    } else if (overflowY && !overflowX) {
      for (const y of axisFrames(iRect.height - cRect.height, cRect.height)) {
        waypoints.push({ x: 0, y });
      }
    } else {
      const xFrames = axisFrames(iRect.width - cRect.width, cRect.width);
      const yFrames = axisFrames(iRect.height - cRect.height, cRect.height);
      // Row-major sweep with serpentine reversal — left-to-right on
      // even rows, right-to-left on odd rows. Avoids the long diagonal
      // jump from row-end back to row-start that would feel like a
      // teleport between dwells.
      yFrames.forEach((y, r) => {
        const xs = (r % 2 === 0) ? xFrames : [...xFrames].reverse();
        for (const x of xs) waypoints.push({ x, y });
      });
    }
    // De-duplicate AND collapse near-duplicates. Strip-pan with 30%
    // overlap on small-overflow content produces clusters of waypoints
    // within a few px of each other (e.g., -350/-400/-400 when overflow
    // is just slightly past one stride). Animating between them looks
    // like jitter rather than a tour. Collapse anything within 25% of
    // the container's smaller dimension into a single endpoint, taking
    // the more-extreme value so the final overflow is still reached.
    const minSpacing = 0.25 * Math.min(cRect.width, cRect.height);
    const dedup = [];
    for (const wp of waypoints) {
      const last = dedup[dedup.length - 1];
      if (!last) { dedup.push(wp); continue; }
      const dx = Math.abs(last.x - wp.x);
      const dy = Math.abs(last.y - wp.y);
      if (dx > minSpacing || dy > minSpacing) {
        dedup.push(wp);
      } else {
        // Replace previous with whichever is more extreme (further from 0)
        if (Math.abs(wp.x) + Math.abs(wp.y) > Math.abs(last.x) + Math.abs(last.y)) {
          dedup[dedup.length - 1] = wp;
        }
      }
    }
    if (dedup.length < 2) return;

    // Append a zoom-out "overview" beat to the cycle so the user sees
    // the whole diagram/table once per tour, then resumes panning. Per
    // decision 2026-04-29 evening: scanning at zoomed-in level only made it
    // hard to get a sense for the whole. Scale chosen so content fits
    // inside container with small margin; only added when overflow is
    // big enough that an overview is meaningfully different from any
    // pan frame (otherwise it's redundant). transformOrigin top-left
    // means scale(<1) at translate(0,0) anchors content to the cell's
    // top-left corner — natural reading entry point.
    const fitScale = Math.min(
      cRect.width  / Math.max(iRect.width,  1),
      cRect.height / Math.max(iRect.height, 1)
    );
    if (fitScale < 0.92) {
      // Center the shrunk content inside the container instead of
      // anchoring top-left — top-left would read as "content shrunk
      // into the corner" rather than "camera pulled back to see the
      // whole thing." With transformOrigin: top-left, the centering
      // translate is computed in the un-scaled coordinate system, so
      // the actual visual offset is (cRect - iRect*scale) / 2.
      const overviewX = (cRect.width  - iRect.width  * fitScale) / 2;
      const overviewY = (cRect.height - iRect.height * fitScale) / 2;
      // Overview dwell is longer (1.4x) so the user has time to take
      // the whole structure in before the next pan begins.
      dedup.push({ x: overviewX, y: overviewY, scale: fitScale, dwellOverride: 1.4 });
    }

    container.style.overflow = "hidden";
    content.style.transformOrigin = "top left";
    content.style.transition = "transform 1500ms cubic-bezier(0.4, 0.0, 0.2, 1)";
    content.style.willChange = "transform";

    let i = 0;
    let timer = null;
    let paused = false;
    let visible = true;
    // Dwell long enough to actually read a column or region. Decision
    // 2026-04-29: prior 3.2s felt rushed. 5.5s gives ~4s of stillness
    // after the 1.5s transition completes — enough to read a table
    // column without scanning frantically.
    const dwell = (opts && opts.dwellMs != null) ? opts.dwellMs : 5500;

    const tick = () => {
      timer = null;
      if (paused || !visible) return;
      const wp = dedup[i];
      const scale = (wp.scale != null) ? wp.scale : 1;
      content.style.transform =
        `translate(${wp.x.toFixed(1)}px, ${wp.y.toFixed(1)}px) scale(${scale.toFixed(3)})`;
      i = (i + 1) % dedup.length;
      const stepDwell = wp.dwellOverride ? Math.round(dwell * wp.dwellOverride) : dwell;
      timer = setTimeout(tick, stepDwell);
    };

    container.addEventListener("mouseenter", () => { paused = true; });
    container.addEventListener("mouseleave", () => {
      paused = false;
      if (visible && timer === null) tick();
    });

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        visible = e.isIntersecting;
        if (visible && !paused && timer === null) {
          tick();
        } else if (!visible && timer !== null) {
          clearTimeout(timer); timer = null;
        }
      }
    }, { rootMargin: "200px" });
    io.observe(container);

    // Stash on container so cell tear-down (rerenderNotebook clears
    // _lazyObserver, etc) can find and disconnect.
    container._autoPanObserver = io;
    container._autoPanTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };

    // Kick off after first paint settles.
    setTimeout(tick, 600);
  });
}

// Token expansion for cell specs: $accent, $stroke1, $stroke2, $stroke3,
// $fg, $muted, $bg, $panel. Substituted before innerHTML / scene3d render
// so cell content re-colors with theme.
