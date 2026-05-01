// Validates a mermaid spec read from stdin. Exit 0 on parse OK,
// exit 1 with the parser's error message on stderr otherwise.
//
// Used by orchestrator.py to lint mermaid output from the
// mermaid specialist before persisting the cell. Pre-2026-05-01
// bad specs would land in cells.json and the renderer would hide
// them with a "mermaid render error" stub. Now they get caught at
// mint time and routed to the auto-fixer (also in specialists.py).
//
// jsdom polyfill: mermaid 10's parser eagerly initializes DOMPurify,
// which expects a DOM. Wire jsdom into globalThis BEFORE importing
// mermaid so DOMPurify finds its host environment.
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.SVGElement = dom.window.SVGElement;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
const { default: mermaid } = await import("mermaid");

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const spec = Buffer.concat(chunks).toString();
if (!spec.trim()) {
  console.error("empty spec");
  process.exit(1);
}
try {
  const ok = await mermaid.parse(spec);
  if (ok === false) {
    console.error("mermaid.parse returned false");
    process.exit(1);
  }
  process.exit(0);
} catch (e) {
  // Jison-style errors carry .str (formatted error) and .hash with
  // {text, token, line, expected}. Mermaid 10's plain .message often
  // truncates to "Parse error on line N:" with no specifics — the
  // hash is where the actually-useful info lives.
  const parts = [];
  if (e?.message) parts.push(e.message.split("\n")[0]);
  if (e?.hash) {
    if (e.hash.text) parts.push(`token=${JSON.stringify(e.hash.text)}`);
    if (e.hash.expected) parts.push(`expected=${JSON.stringify(e.hash.expected).slice(0, 200)}`);
    if (e.hash.line != null) parts.push(`line=${e.hash.line}`);
  }
  if (e?.str) parts.push(e.str.split("\n").slice(0, 4).join(" / ").slice(0, 400));
  console.error(parts.join(" | ") || String(e));
  process.exit(1);
}
