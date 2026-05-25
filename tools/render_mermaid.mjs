// Server-side mermaid render via Puppeteer + bundled Chromium.
// Produces the same styled SVG the browser does — same mermaid
// version, same init config, same styling regex pipeline. Output
// goes to cells/<id>.mermaid.cN.v*.svg so the browser's existing
// cache manifest skips client-side mermaid entirely.
//
// Why Puppeteer and not jsdom: mermaid 10.x's dagre layout needs
// real SVG layout (getBBox, getCTM, etc) which jsdom can't compute.
// Real Chromium does. See memory/mermaid_offload_options.md.
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
// Styling: STYLE_V + STYLE_CSS imported from ./mermaid_style.mjs so
// there's a single Node-side source. The browser-side copy in
// index.html still has to mirror it manually (no build step) — see
// the comment block in mermaid_style.mjs for the bump checklist.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";
import { STYLE_V, applyStyleToSvg } from "./mermaid_style.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const LOCAL_MERMAID = path.join(PROJECT_ROOT, "node_modules", "mermaid", "dist", "mermaid.esm.min.mjs");
if (!fs.existsSync(LOCAL_MERMAID)) {
  console.error(`local mermaid not found at ${LOCAL_MERMAID}; run \`npm install\``);
  process.exit(2);
}
const LOCAL_MERMAID_URL = pathToFileURL(LOCAL_MERMAID).href;

function injectInitBlock(spec, colspan) {
  if (!/^\s*(flowchart|graph)\b/m.test(spec)) return spec;
  if (/%%\{init:/.test(spec)) return spec;
  // Aspect-aware init: colspan=1 → 192x504 (tall), colspan=2 → 384x504,
  // colspan=3 → 576x504. Matches index.html aspect bands.
  const aspect = (192 * colspan) / 504;
  let nodeSp, rankSp;
  if (aspect < 0.6) { nodeSp = 20; rankSp = 90; }
  else if (aspect < 0.8) { nodeSp = 25; rankSp = 70; }
  else if (aspect > 2.5) { nodeSp = 110; rankSp = 18; }
  else if (aspect > 1.4) { nodeSp = 70; rankSp = 25; }
  else { nodeSp = 40; rankSp = 45; }
  return `%%{init: {'flowchart':{'nodeSpacing':${nodeSp},'rankSpacing':${rankSp},'padding':16,'curve':'step','useMaxWidth':false}}}%%\n` + spec;
}

// Load mermaid from the local node_modules copy via a file:// URL.
// Earlier draft pulled from jsdelivr CDN, which made the renderer
// hang under CI/offline conditions. Local file load is instant and
// offline-safe — but ES-module file:// imports only work when the
// page itself is at a file:// origin (setContent → about:blank
// blocks the import). So we write the bootstrap HTML to a temp file
// and goto() it. Cleaned up after the run.
function buildPageHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8"></head><body><div id="sink"></div>
<script type="module">
import mermaid from "${LOCAL_MERMAID_URL}";
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
}

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

  // Write bootstrap HTML to a temp file inside the project — file://
  // module imports require the importing page to also be at file://
  // origin, which means we navigate to a real local HTML file rather
  // than feeding HTML through setContent (which lands at about:blank).
  const bootstrapPath = path.join(PROJECT_ROOT, `.mermaid-bootstrap-${process.pid}.html`);
  fs.writeFileSync(bootstrapPath, buildPageHtml(), "utf-8");
  const bootstrapUrl = pathToFileURL(bootstrapPath).href;

  // No executablePath: full puppeteer manages its own bundled Chromium.
  // --allow-file-access-from-files: Chrome blocks ES module imports
  // across file:// origins by default; this re-enables the same-origin
  // case so our bootstrap HTML can `import mermaid from "file://..."`.
  // Sandbox flags: stable headless launch on Linux without setuid root.
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--allow-file-access-from-files",
    ],
  });
  let nOk = 0, nFail = 0;
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(bootstrapUrl, { waitUntil: "domcontentloaded" });
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
        const styled = applyStyleToSvg(svg);
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
    try { fs.unlinkSync(bootstrapPath); } catch { /* fine */ }
  }
  process.stderr.write(`done: ok=${nOk} fail=${nFail}\n`);
  process.exit(nFail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("fatal:", e?.stack || e);
  process.exit(2);
});
