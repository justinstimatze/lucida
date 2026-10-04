// motion.mjs unit tests (animated_svg declarative timelines → GSAP).
//
// Self-contained: serves the repo root on an ephemeral port (GSAP from
// node_modules, so no CDN / no `python serve.py` needed), loads a bare
// page with GSAP + plugins as classic scripts and motion.mjs as a module,
// then drives timelines with seek() so every assertion is deterministic.
//
//   npm install && node tools/test_motion.mjs
//
// Exits 0 if every case passes, 1 if any fails. Set PUPPETEER_EXECUTABLE_PATH
// to use a preinstalled Chromium.

import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".mjs": "text/javascript", ".js": "text/javascript", ".html": "text/html" };

const PAGE = `<!doctype html><meta charset="utf-8">
<script src="/node_modules/gsap/dist/gsap.min.js"></script>
<script src="/node_modules/gsap/dist/DrawSVGPlugin.min.js"></script>
<script src="/node_modules/gsap/dist/MorphSVGPlugin.min.js"></script>
<script src="/node_modules/gsap/dist/MotionPathPlugin.min.js"></script>
<body>
<div id="outside"><svg><circle id="m-dot" r="3" opacity="1"/></svg></div>
<div id="host"></div>
<script type="module">
  import * as motion from "/motion.mjs";
  window.motion = motion;
  window.ready = true;
</script>`;

// Runs in the page. Each case mounts a fresh SVG into #host and returns
// whatever the assertion needs.
const SVG = `<svg id="cell" width="200" height="100" viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
  <path id="m-track" d="M10 50 L190 50" fill="none" stroke="#0ff" stroke-width="2"/>
  <path id="m-a" d="M20 20 L60 20 L60 60 Z" fill="#f0f"/>
  <defs><path id="m-b" d="M100 10 L140 90 L60 90 Z"/></defs>
  <circle id="m-dot" class="m-pass" cx="10" cy="50" r="5" fill="#00ff00" opacity="1"/>
  <circle id="m-dot2" class="m-pass" cx="50" cy="50" r="5" opacity="1"/>
</svg>`;

const CASES = [
  {
    name: "sanitizeTimeline drops non-whitelisted props, selectors, ops",
    run: () => window.motion.sanitizeTimeline({
      steps: [
        { target: "#m-dot", op: "to", props: { href: "javascript:alert(1)", onload: "x", opacity: 9 } },
        { target: "svg *", op: "to", props: { opacity: 0 } },
        { target: "#m-dot", op: "eval", props: { opacity: 0 } },
        { target: "#m-dot", op: "to", props: { fill: "url(javascript:x)" } },
      ],
    }),
    expect: (r) => r && r.steps.length === 1 && JSON.stringify(r.steps[0].props) === '{"opacity":1}',
  },
  {
    name: "from: starts at props, ends at the rest frame",
    run: (svg) => {
      const c = window.motion.playTimeline(svg, {
        repeat: 0, steps: [{ target: "#m-dot", op: "from", dur: 1, ease: "none", props: { opacity: 0, x: 40 } }],
      }, { alwaysPlay: true, ignoreReducedMotion: true });
      const dot = svg.querySelector("#m-dot");
      c.timeline.pause().seek(0);
      const start = Number(getComputedStyle(dot).opacity);
      c.timeline.seek(1);
      const end = Number(getComputedStyle(dot).opacity);
      return { start, end, played: c.played };
    },
    expect: (r) => r.start === 0 && r.end === 1 && r.played === 1,
  },
  {
    name: "draw: stroke is hidden at t=0 and fully drawn at end",
    run: (svg) => {
      const c = window.motion.playTimeline(svg, {
        repeat: 0, steps: [{ target: "#m-track", op: "draw", dur: 1 }],
      }, { alwaysPlay: true, ignoreReducedMotion: true });
      const p = svg.querySelector("#m-track");
      c.timeline.pause().seek(0);
      const a = getComputedStyle(p).strokeDasharray;
      c.timeline.seek(1);
      const b = getComputedStyle(p).strokeDasharray;
      return { a, b };
    },
    expect: (r) => /^0px,/.test(r.a.replace(/ /g, "")) && r.a !== r.b,
  },
  {
    name: "morph: path d changes to the morph_to shape",
    run: (svg) => {
      const p = svg.querySelector("#m-a");
      const before = p.getAttribute("d");
      const c = window.motion.playTimeline(svg, {
        repeat: 0, steps: [{ target: "#m-a", op: "morph", morph_to: "#m-b", dur: 1 }],
      }, { alwaysPlay: true, ignoreReducedMotion: true });
      c.timeline.pause().seek(1);
      return { before, after: p.getAttribute("d") };
    },
    expect: (r) => r.before !== r.after && /^M/.test(r.after),
  },
  {
    name: "follow: target moves along the path",
    run: (svg) => {
      const c = window.motion.playTimeline(svg, {
        repeat: 0, steps: [{ target: "#m-dot", op: "follow", path: "#m-track", dur: 1, ease: "none" }],
      }, { alwaysPlay: true, ignoreReducedMotion: true });
      const dot = svg.querySelector("#m-dot");
      c.timeline.pause().seek(0);
      const x0 = dot.getBoundingClientRect().x;
      c.timeline.seek(1);
      const x1 = dot.getBoundingClientRect().x;
      return { dx: x1 - x0 };
    },
    expect: (r) => r.dx > 100,
  },
  {
    name: "$token colors resolve through resolveColor",
    run: (svg) => {
      const c = window.motion.playTimeline(svg, {
        repeat: 0, steps: [{ target: "#m-dot", op: "to", dur: 1, props: { fill: "$accent" } }],
      }, { alwaysPlay: true, ignoreReducedMotion: true, resolveColor: (v) => (v === "$accent" ? "#ff0000" : v) });
      c.timeline.pause().seek(1);
      return getComputedStyle(svg.querySelector("#m-dot")).fill;
    },
    expect: (r) => r === "rgb(255, 0, 0)",
  },
  {
    name: "class target + stagger animates every match",
    run: (svg) => {
      const c = window.motion.playTimeline(svg, {
        repeat: 0, steps: [{ target: ".m-pass", op: "from", dur: 0.5, stagger: 0.5, ease: "none", props: { opacity: 0 } }],
      }, { alwaysPlay: true, ignoreReducedMotion: true });
      c.timeline.pause().seek(0.5);
      const [a, b] = [...svg.querySelectorAll(".m-pass")].map((e) => Number(getComputedStyle(e).opacity));
      return { a, b };
    },
    expect: (r) => r.a === 1 && r.b === 0,
  },
  {
    name: "targets resolve inside the cell svg only",
    run: (svg) => {
      const c = window.motion.playTimeline(svg, {
        repeat: 0, steps: [{ target: "#m-dot", op: "to", dur: 1, props: { opacity: 0 } }],
      }, { alwaysPlay: true, ignoreReducedMotion: true });
      c.timeline.pause().seek(1);
      return Number(getComputedStyle(document.querySelector("#outside #m-dot")).opacity);
    },
    expect: (r) => r === 1,
  },
  {
    name: "missing targets are skipped; all-missing returns null",
    run: (svg) => {
      const some = window.motion.playTimeline(svg, {
        steps: [
          { target: "#m-nope", op: "to", props: { opacity: 0 } },
          { target: "#m-dot", op: "to", props: { opacity: 0 } },
        ],
      }, { alwaysPlay: true, ignoreReducedMotion: true });
      const none = window.motion.playTimeline(svg, {
        steps: [{ target: "#m-nope", op: "to", props: { opacity: 0 } }],
      }, { alwaysPlay: true, ignoreReducedMotion: true });
      const r = { played: some.played, skipped: some.skipped, tag: svg.dataset.motion, none };
      some.kill();
      return r;
    },
    expect: (r) => r.played === 1 && r.skipped === 1 && r.tag === "1/2" && r.none === null,
  },
  {
    name: "kill() reverts to the rest frame",
    run: (svg) => {
      const dot = svg.querySelector("#m-dot");
      const c = window.motion.playTimeline(svg, {
        repeat: -1, steps: [{ target: "#m-dot", op: "to", dur: 1, props: { opacity: 0.2, r: 30, x: 50 } }],
      }, { alwaysPlay: true, ignoreReducedMotion: true });
      c.timeline.pause().seek(0.9);
      c.kill();
      return {
        r: dot.getAttribute("r"),
        style: dot.getAttribute("style") || "",
        active: window.gsap.getTweensOf(dot).length,
      };
    },
    expect: (r) => r.r === "5" && !/opacity|transform/.test(r.style) && r.active === 0,
  },
  {
    name: "prefers-reduced-motion leaves the rest frame static",
    reducedMotion: true,
    run: (svg) => window.motion.playTimeline(svg, {
      steps: [{ target: "#m-dot", op: "from", props: { opacity: 0 } }],
    }),
    expect: (r) => r === null,
  },
  {
    name: "no GSAP loaded → null (static fallback)",
    run: (svg) => {
      const g = window.gsap;
      window.gsap = undefined;
      try {
        return window.motion.playTimeline(svg, {
          steps: [{ target: "#m-dot", op: "from", props: { opacity: 0 } }],
        }, { ignoreReducedMotion: true });
      } finally { window.gsap = g; }
    },
    expect: (r) => r === null,
  },
];

async function main() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(PAGE);
    }
    const file = path.join(ROOT, path.normalize(url.pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404); res.end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });
  let failed = 0;
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("pageerror:", e.message));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => window.ready === true && !!window.gsap);
    for (const c of CASES) {
      await page.emulateMediaFeatures([
        { name: "prefers-reduced-motion", value: c.reducedMotion ? "reduce" : "no-preference" },
      ]);
      let out;
      try {
        out = await page.evaluate((svgSrc, fnSrc) => {
          const host = document.getElementById("host");
          host.innerHTML = svgSrc;
          const fn = new Function(`return (${fnSrc});`)();
          return fn(host.querySelector("svg"));
        }, SVG, c.run.toString());
      } catch (e) {
        out = { error: String(e) };
      }
      const ok = !out?.error && c.expect(out);
      if (!ok) failed++;
      console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}${ok ? "" : `  → ${JSON.stringify(out)}`}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${CASES.length - failed}/${CASES.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
