// Theme × layout boot smoke test.
//
// For every theme in THEME_REGISTRY and every layout in LAYOUT_REGISTRY,
// load `index.html?theme=X&layout=Y` in real Chromium (Puppeteer) and
// assert:
//   1. The page boots without an Uncaught console error.
//   2. body[data-theme] matches the requested theme (catches the
//      theme_valid_list_tripwire allowlist bootstrap fallback, which
//      silently degrades to "lab" on unknown keys).
//   3. notebook[data-layout] matches the requested layout.
//   4. At least one .cell rendered (cells.json had something to show).
//
// This is the audit's #1 frontend test — closes the bootstrap-allowlist
// tripwire forever and catches half a dozen other silent-failure modes
// (style-leak blanking, missing furniture builder, mermaid parse error)
// without anyone needing to eyeball pixels.
//
// I/O:
//   stdout: per-combo pass/fail line + final summary
//   exits 0 if every combo passed, 1 if any failed.
//
// Usage:
//   python serve.py &              # static server on :8766
//   node tools/smoke_themes.mjs    # smoke
//   node tools/smoke_themes.mjs --base http://localhost:8766 --quick
//
// --quick: only test each theme's DEFAULT layout (one combo per theme,
// not the N×M cross-product). Fast smoke (~10 combos vs ~80).

import puppeteer from "puppeteer";

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) {
    const key = a.slice(2);
    const next = process.argv[i + 1];
    if (next && !next.startsWith("--")) { args.set(key, next); i++; }
    else args.set(key, true);
  }
}
const BASE = args.get("base") || "http://localhost:8766";
const QUICK = !!args.get("quick");
const BOOT_TIMEOUT_MS = 8000;
const VERBOSE = !!args.get("verbose");

// THEMES + LAYOUTS are extracted from the running page after first load,
// so adding a theme/layout doesn't require updating this script.
async function probeRegistries(browser) {
  const page = await browser.newPage();
  await page.goto(`${BASE}/?theme=lab`, { waitUntil: "domcontentloaded", timeout: BOOT_TIMEOUT_MS });
  // Module script runs after DOMContentLoaded; wait for the global flag
  // that index.html sets when the boot path completes.
  await page.waitForFunction(
    () => document.body.classList.contains("booted"),
    { timeout: BOOT_TIMEOUT_MS },
  );
  const data = await page.evaluate(() => ({
    themes: Object.keys(window._debugTHEME_REGISTRY || {}),
    layouts: Object.keys(window._debugLAYOUT_REGISTRY || {}),
  }));
  await page.close();
  return data;
}

async function smokeOne(browser, theme, layout) {
  const page = await browser.newPage();
  const errors = [];
  const warnings = [];
  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error") errors.push(msg.text());
    else if (t === "warning") warnings.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));

  const url = layout
    ? `${BASE}/?theme=${encodeURIComponent(theme)}&layout=${encodeURIComponent(layout)}`
    : `${BASE}/?theme=${encodeURIComponent(theme)}`;
  let bootOk = false;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: BOOT_TIMEOUT_MS });
    await page.waitForFunction(
      () => document.body.classList.contains("booted"),
      { timeout: BOOT_TIMEOUT_MS },
    );
    bootOk = true;
  } catch (e) {
    errors.push(`[boot] ${e.message}`);
  }

  let observed = { theme: null, layout: null, cellCount: 0 };
  if (bootOk) {
    try {
      observed = await page.evaluate(() => {
        // Theme is applied as a `theme-<id>` class on <html> by the
        // synchronous bootstrap (anti-FOUC); not as data-theme on body.
        const cls = (document.documentElement.className || "").match(/theme-([a-z]+)/);
        return {
          theme: cls ? cls[1] : null,
          layout: document.getElementById("notebook")?.getAttribute("data-layout"),
          cellCount: document.querySelectorAll("#notebook > .cell").length,
        };
      });
    } catch (e) {
      errors.push(`[probe] ${e.message}`);
    }
  }
  await page.close();

  const failures = [];
  if (!bootOk) failures.push("boot");
  if (observed.theme !== theme) failures.push(`theme=${observed.theme}≠${theme}`);
  // In quick mode (layout=null) we don't assert the specific layout,
  // just that one was picked.  Otherwise assert it matches.
  if (layout && observed.layout !== layout) failures.push(`layout=${observed.layout}≠${layout}`);
  if (observed.cellCount === 0 && bootOk) failures.push("0 cells");
  if (errors.length) failures.push(`${errors.length} console error(s)`);

  return { theme, layout, ok: failures.length === 0, failures, errors, warnings, observed };
}

async function main() {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  let registries;
  try {
    registries = await probeRegistries(browser);
  } catch (e) {
    console.error(`[smoke] could not probe registries (is ${BASE} running?): ${e.message}`);
    process.exit(2);
  }

  const themes = registries.themes;
  const layouts = registries.layouts;
  if (themes.length === 0 || layouts.length === 0) {
    console.error(
      `[smoke] registries empty (themes=${themes.length}, layouts=${layouts.length}). ` +
      `Did index.html expose window._debugTHEME_REGISTRY / _debugLAYOUT_REGISTRY?`,
    );
    await browser.close();
    process.exit(2);
  }

  // --quick: one combo per theme — no explicit layout, letting the
  // theme's tokens.json `layout` field (applyTokenLayout) pick. We don't
  // assert the resulting layout in quick mode, only that it booted and
  // the theme attr is right.
  // --full: theme × layout cross product.
  const combos = [];
  if (QUICK) {
    for (const t of themes) combos.push({ theme: t, layout: null });
  } else {
    for (const t of themes) for (const l of layouts) combos.push({ theme: t, layout: l });
  }

  console.log(
    `[smoke] base=${BASE} themes=${themes.length} layouts=${layouts.length} ` +
    `combos=${combos.length} mode=${QUICK ? "quick" : "full"}`,
  );

  const results = [];
  for (const { theme, layout } of combos) {
    const r = await smokeOne(browser, theme, layout);
    results.push(r);
    const tag = r.ok ? "PASS" : "FAIL";
    const detail = r.ok ? `${r.observed.cellCount} cells` : r.failures.join(", ");
    console.log(`  ${tag}  ${theme.padEnd(10)} ${(layout || "(default)").padEnd(10)}  ${detail}`);
    if (!r.ok && VERBOSE) {
      for (const e of r.errors) console.log(`         ${e}`);
    }
  }
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n[smoke] ${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`[smoke] uncaught: ${e.stack || e.message}`);
  process.exit(2);
});
