// Server-side mermaid render via Puppeteer + system Chrome. Produces
// the same styled SVG the browser does — same mermaid version, same
// init config, same styling regex pipeline. Output goes to
// cells/<id>.mermaid.cN.v*.svg so the browser's existing cache
// manifest skips client-side mermaid entirely.
//
// Why Puppeteer and not jsdom: mermaid 10.x's dagre layout needs real
// SVG layout (getBBox, getCTM, etc) which jsdom can't compute. Real
// Chromium does. See memory/mermaid_offload_options.md.
//
// Why full puppeteer (not puppeteer-core): bundled Chromium means
// contributors / forkers don't need to install Chrome separately.
// Adds ~170MB to node_modules but the on-boarding gain is worth it
// (user 2026-05-25: "would like to not make people use chrome more
// than necessary").
//
// I/O:
//   stdin: JSON array of {cellId, spec, colspan} render jobs
//   stdout: one JSON line per completed job:
//           {cellId, ok, bytes?, error?}
//   exits 0 if every job succeeded, 1 if any failed.
//
// **STYLE_CSS must stay in sync with _mixed3dStyleMermaidSVG in
// index.html (~line 6171). STYLE_V must match index.html (~line 6592)
// and backfill_mermaid_svgs.py. Bump all three when changing CSS.

import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const STYLE_V = "v10";

const STYLE_CSS = `<style>
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

function styleSvg(svgString) {
  const upcased = svgString.replace(
    /(<tspan[^>]*>)([^<]+)(<\/tspan>)/g,
    (_m, open, txt, close) => {
      if (/&[#a-zA-Z]/.test(txt)) return open + txt + close;
      return open + txt.toUpperCase() + close;
    },
  );
  return upcased.replace(/(<svg[^>]*>)/, "$1" + STYLE_CSS);
}

function injectInitBlock(spec, colspan) {
  if (!/^\s*(flowchart|graph)\b/m.test(spec)) return spec;
  if (/%%\{init:/.test(spec)) return spec;
  const aspect = (192 * colspan) / 504;
  let nodeSp, rankSp;
  if (aspect < 0.6) { nodeSp = 20; rankSp = 90; }
  else if (aspect < 0.8) { nodeSp = 25; rankSp = 70; }
  else if (aspect > 2.5) { nodeSp = 110; rankSp = 18; }
  else if (aspect > 1.4) { nodeSp = 70; rankSp = 25; }
  else { nodeSp = 40; rankSp = 45; }
  return `%%{init: {'flowchart':{'nodeSpacing':${nodeSp},'rankSpacing':${rankSp},'padding':16,'curve':'step','useMaxWidth':false}}}%%\n` + spec;
}

// Inline HTML loaded into Chrome — imports the same mermaid version as
// index.html, exposes window.renderMermaid(spec) → Promise<svg>.
// Same initialize config as index.html ~line 770.
const PAGE_HTML = `<!doctype html>
<html><head><meta charset="utf-8"></head><body><div id="sink"></div>
<script type="module">
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10.9.6/dist/mermaid.esm.min.mjs";
mermaid.initialize({
  startOnLoad: false,
  flowchart: { htmlLabels: false, padding: 16, curve: "step" },
});
window.__renderMermaid = async (spec) => {
  await mermaid.parse(spec);
  const id = "_p_" + Math.random().toString(36).slice(2, 10);
  const { svg } = await mermaid.render(id, spec);
  return svg;
};
window.__mermaidReady = true;
</script></body></html>`;

async function main() {
  let stdinBuf = "";
  for await (const c of process.stdin) stdinBuf += c.toString();
  let jobs;
  try {
    jobs = JSON.parse(stdinBuf);
  } catch (e) {
    console.error("invalid json on stdin:", e.message);
    process.exit(2);
  }
  if (!Array.isArray(jobs) || jobs.length === 0) {
    console.error("expected non-empty JSON array of {cellId, spec, colspan}");
    process.exit(2);
  }
  const cellsDir = path.resolve("cells");
  fs.mkdirSync(cellsDir, { recursive: true });

  // No executablePath: full puppeteer manages its own bundled Chromium.
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  let nOk = 0, nFail = 0;
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.setContent(PAGE_HTML, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => window.__mermaidReady === true, { timeout: 15000 });

    for (const job of jobs) {
      const { cellId, spec, colspan } = job;
      if (!cellId || !spec) {
        process.stdout.write(JSON.stringify({ cellId, ok: false, error: "missing cellId or spec" }) + "\n");
        nFail++; continue;
      }
      const cs = Math.max(1, Math.min(3, colspan || 1));
      const outName = cs > 1
        ? `${cellId}.mermaid.c${cs}.${STYLE_V}.svg`
        : `${cellId}.mermaid.${STYLE_V}.svg`;
      const outPath = path.join(cellsDir, outName);
      const specWithInit = injectInitBlock(spec, cs);
      try {
        const svg = await page.evaluate((s) => window.__renderMermaid(s), specWithInit);
        const styled = styleSvg(svg);
        fs.writeFileSync(outPath, styled, "utf-8");
        nOk++;
        process.stdout.write(JSON.stringify({ cellId, ok: true, bytes: styled.length, out: outName }) + "\n");
      } catch (err) {
        nFail++;
        const msg = (err?.message || String(err)).split("\n")[0].slice(0, 300);
        process.stdout.write(JSON.stringify({ cellId, ok: false, error: msg }) + "\n");
      }
    }
  } finally {
    await browser.close();
  }
  process.stderr.write(`done: ok=${nOk} fail=${nFail}\n`);
  process.exit(nFail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("fatal:", e?.stack || e);
  process.exit(2);
});
