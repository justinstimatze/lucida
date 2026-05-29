// Sanitization unit tests.
//
// _purifyHtml, _purifySvg, _scopeCellStyles are inlined module-scope
// functions inside index.html — exposed dev-only via window for this
// test surface.  Loads the page in headless Chromium, feeds crafted
// XSS / style-leak payloads, asserts the sanitized output.
//
// Audit-flagged: "the only choke point for LLM-sourced HTML/SVG; style-
// leak tripwire silently blanks the dashboard."  This test covers the
// sharpest known edges:
//   * <script> tag in html — stripped
//   * onerror attribute in html — stripped
//   * <script> tag in svg — stripped
//   * <style> in cell body — scoped to cell id (selectors prefixed)
//   * onload handler on <svg> root — stripped
//
//   python serve.py &
//   node tools/test_sanitization.mjs
//
// Exits 0 if every case passes, 1 if any fails.

import puppeteer from "puppeteer";

const BASE = process.argv[2] || "http://localhost:8766";

const CASES = [
  {
    name: "_purifyHtml strips <script> tag",
    fn: "_purifyHtml",
    input: "<div>safe<script>alert('xss')</script>also safe</div>",
    expect: (out) => !out.toLowerCase().includes("<script") && !out.toLowerCase().includes("alert("),
  },
  {
    name: "_purifyHtml strips onerror attribute",
    fn: "_purifyHtml",
    input: "<img src=x onerror=\"alert(1)\">",
    expect: (out) => !out.toLowerCase().includes("onerror"),
  },
  {
    name: "_purifyHtml strips onclick attribute",
    fn: "_purifyHtml",
    input: "<button onclick=\"alert(1)\">click</button>",
    expect: (out) => !out.toLowerCase().includes("onclick"),
  },
  {
    name: "_purifyHtml strips <iframe>",
    fn: "_purifyHtml",
    input: "<iframe src=\"https://evil.example\"></iframe>",
    expect: (out) => !out.toLowerCase().includes("<iframe"),
  },
  {
    name: "_purifyHtml preserves benign markup",
    fn: "_purifyHtml",
    input: "<div class=\"x\"><strong>hello</strong> <em>world</em></div>",
    expect: (out) =>
      out.includes("<strong>") && out.includes("<em>") && out.toLowerCase().includes("hello"),
  },
  {
    name: "_purifySvg strips <script> inside <svg>",
    fn: "_purifySvg",
    input: "<svg><circle r=\"5\"/><script>alert('xss')</script></svg>",
    expect: (out) => !out.toLowerCase().includes("<script") && out.includes("<circle"),
  },
  {
    name: "_purifySvg strips onload on <svg>",
    fn: "_purifySvg",
    input: "<svg onload=\"alert(1)\"><rect width=\"10\" height=\"10\"/></svg>",
    expect: (out) => !out.toLowerCase().includes("onload"),
  },
  {
    name: "_purifySvg strips <foreignObject>",
    fn: "_purifySvg",
    input: "<svg><foreignObject><div>x</div></foreignObject></svg>",
    expect: (out) => !out.toLowerCase().includes("<foreignobject"),
  },
];

// _scopeCellStyles is DOM-driven (mutates a passed-in container), so
// it needs a different harness — verify selectors are prefixed.
async function runStyleScopeTest(page) {
  return await page.evaluate(() => {
    const container = document.createElement("div");
    container.id = "test-cell-xyz";
    document.body.appendChild(container);
    // A style element with selectors that would leak (e.g. ".cell")
    container.innerHTML =
      "<style>.cell { opacity: 0; } body { color: red; } #foo { font-weight: bold; }</style>" +
      "<div class=\"cell\">x</div>";
    window._scopeCellStyles(container, "#test-cell-xyz");
    const styleEl = container.querySelector("style");
    const sheet = styleEl && styleEl.sheet;
    if (!sheet) return { ok: false, reason: "sheet not parsed" };
    const selectors = [];
    for (const rule of sheet.cssRules) {
      if (rule.selectorText) selectors.push(rule.selectorText);
    }
    container.remove();
    const allPrefixed = selectors.every((s) => s.includes("#test-cell-xyz"));
    return { ok: allPrefixed, selectors };
  });
}

async function main() {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));
  await page.goto(`${BASE}/?theme=lab`, { waitUntil: "domcontentloaded", timeout: 8000 });
  await page.waitForFunction(
    () => document.body.classList.contains("booted") &&
          typeof window._purifyHtml === "function" &&
          typeof window._purifySvg === "function" &&
          typeof window._scopeCellStyles === "function",
    { timeout: 8000 },
  );

  let pass = 0, fail = 0;

  for (const c of CASES) {
    const out = await page.evaluate(
      ({ fn, input }) => window[fn](input),
      { fn: c.fn, input: c.input },
    );
    const ok = c.expect(out);
    if (ok) { console.log(`  PASS  ${c.name}`); pass++; }
    else    { console.log(`  FAIL  ${c.name}\n        out=${JSON.stringify(out).slice(0, 200)}`); fail++; }
  }

  const styleRes = await runStyleScopeTest(page);
  if (styleRes.ok) {
    console.log(`  PASS  _scopeCellStyles prefixes selectors`);
    pass++;
  } else {
    console.log(`  FAIL  _scopeCellStyles prefixes selectors`);
    console.log(`        selectors=${JSON.stringify(styleRes.selectors)}`);
    fail++;
  }

  await browser.close();
  console.log(`\n[sanitize] ${pass}/${pass + fail} passed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`[sanitize] uncaught: ${e.stack || e.message}`);
  process.exit(2);
});
