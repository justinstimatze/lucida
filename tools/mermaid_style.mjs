// Single source for mermaid SVG post-processing — keep in sync with
// _mixed3dStyleMermaidSVG and STYLE_V in index.html (~line 6171, 6592).
// Both index.html (client-side render fallback path) and the puppeteer-
// based render_mermaid.mjs apply the same styling, so the CSS string
// and version constant must agree.
//
// To bump:
//   1. Edit STYLE_CSS here
//   2. Increment STYLE_V here
//   3. Mirror both changes inside index.html's _mixed3dStyleMermaidSVG
//      (the inline copy is required because index.html has no build
//      step — it can't `import` from this file)
//   4. Mirror STYLE_V in tools/backfill_mermaid_svgs.py
//
// Yes that's three mirrors. The browser-side copy is the unavoidable
// one (no build step); the python copy is one constant only, not the
// whole CSS. Reducing past this would require a build step or a
// runtime fetch of this file from the browser, both of which violate
// the project's "one big index.html, no build" stance.

export const STYLE_V = "v10";

export const STYLE_CSS = `<style>
    svg, svg * { background: transparent !important; background-color: transparent !important; }
    [fill^="rgba(8"], [style*="fill:rgba(8"], .labelBkg { fill: transparent !important; }
    .node rect, .node polygon, .node circle, .node ellipse, .node path {
      fill: transparent !important;
      stroke: #00ddff !important;
      stroke-width: 2.5px !important;
    }
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

export function applyStyleToSvg(svgString) {
  const upcased = svgString.replace(
    /(<tspan[^>]*>)([^<]+)(<\/tspan>)/g,
    (_m, open, txt, close) => {
      if (/&[#a-zA-Z]/.test(txt)) return open + txt + close;
      return open + txt.toUpperCase() + close;
    },
  );
  return upcased.replace(/(<svg[^>]*>)/, "$1" + STYLE_CSS);
}
