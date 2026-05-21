"""Tiny localhost screenshot+SVG receiver for lucida dev workflows.

Listens on 127.0.0.1:8767. Accepts:
  POST /<filename>                body = data:image/png;base64,<...> OR raw PNG bytes
                                  → refs/gibson/live-shots/<filename>
  POST /cells/<id>.<sub>.svg      body = raw SVG text
                                  → cells/<id>.<sub>.svg  (persistent substrate cache)
  GET  /                          health check

CORS open so a page served from localhost:8766 can POST without
preflight grief. Cells-cache path is the load-bearing one for the
#152d "persistent SVG cache for heavy substrates" pattern — mermaid
renders once via the client, gets saved here, subsequent loads pull
the cached SVG and skip the ~63ms mermaid.parse+render.

Run alongside the static server while iterating on visual changes;
tear it down when you're done. Won't auto-start with python3 -m
http.server. Safe to leave running — only writes under
refs/gibson/live-shots/ or cells/.
"""

from __future__ import annotations

import base64
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LUCIDA_ROOT = "/home/gas6amus/Documents/lucida"
SHOTS_DEST = os.path.join(LUCIDA_ROOT, "refs/gibson/live-shots")
CELLS_DEST = os.path.join(LUCIDA_ROOT, "cells")
os.makedirs(SHOTS_DEST, exist_ok=True)
os.makedirs(CELLS_DEST, exist_ok=True)

# Bound the persistent substrate cache so it can't grow unbounded as
# cells.json keeps minting. Current scale: 731 mermaid cells + room for
# growth. 2500 files x ~30KB avg SVG ~= 75MB on disk — generous but
# bounded. Eviction is LRU by mtime, runs after every cells/ write so a
# burst of new mints can't blow past the cap by more than a write or two.
CELLS_CACHE_MAX = 2500
_evict_counter = [0]


def _evict_if_over_cap():
    """LRU-evict cells/*.*.svg files when over CELLS_CACHE_MAX. Cheap to
    call on every write — scandir + sort + a handful of unlinks at most.
    Doesn't touch the cells/<id>.png image-cell pngs (different suffix
    pattern), so it can't accidentally delete real cell image content."""
    try:
        # Match the <id>.<substrate>.svg pattern. Cell-image PNGs are
        # named cell-XXXX.png (no second dot) so they're filtered out.
        entries = []
        with os.scandir(CELLS_DEST) as it:
            for e in it:
                if not e.is_file():
                    continue
                name = e.name
                if not name.endswith(".svg"):
                    continue
                # Require <stem>.<substrate>.svg — at least two dots.
                if name.count(".") < 2:
                    continue
                try:
                    entries.append((e.stat().st_mtime, e.path))
                except OSError:
                    continue
        if len(entries) <= CELLS_CACHE_MAX:
            return
        entries.sort()  # oldest first
        n_to_remove = len(entries) - CELLS_CACHE_MAX
        for _, p in entries[:n_to_remove]:
            try:
                os.unlink(p)
            except OSError:
                pass
        print(f"[snap_receiver] evicted {n_to_remove} oldest cells-cache SVGs", flush=True)
    except Exception as e:
        print(f"[snap_receiver] eviction failed: {e}", flush=True)


def _safe_under(root: str, raw_name: str) -> str | None:
    """Resolve raw_name under root, refusing anything that climbs out
    via .. tricks or symlinks. Returns absolute path or None on reject."""
    candidate = os.path.realpath(os.path.join(root, raw_name))
    root_real = os.path.realpath(root)
    if not candidate.startswith(root_real + os.sep) and candidate != root_real:
        return None
    return candidate


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "POST, OPTIONS, GET")
        self.send_header("access-control-allow-headers", "*")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        # Manifest: GET /cells-index.json returns a list of cached SVG
        # filenames so the browser can skip 404-noisy fetches on cells
        # that aren't yet cached. Without this, every cache-miss render
        # logs a 404 in DevTools — visible to the user as red error
        # spam even though the fall-through to fresh-render is fine.
        if self.path == "/cells-index.json":
            import json

            names = []
            try:
                with os.scandir(CELLS_DEST) as it:
                    for e in it:
                        if e.is_file() and e.name.endswith(".svg") and e.name.count(".") >= 2:
                            names.append(e.name)
            except OSError:
                pass
            body = json.dumps({"files": names}).encode()
            self.send_response(200)
            self._cors()
            self.send_header("content-type", "application/json")
            self.send_header("cache-control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(200)
        self._cors()
        self.send_header("content-type", "text/plain")
        self.end_headers()
        self.wfile.write(f"snap_receiver ok, shots={SHOTS_DEST}, cells={CELLS_DEST}\n".encode())

    def do_POST(self):
        n = int(self.headers.get("content-length", 0))
        body = self.rfile.read(n)
        raw_path = self.path.lstrip("/")
        # Cells-cache target: POST /cells/<id>.<substrate>.svg → save
        # under lucida/cells/. SVG body is written verbatim.
        if raw_path.startswith("cells/") and raw_path.endswith(".svg"):
            name = raw_path[len("cells/") :]
            target = _safe_under(CELLS_DEST, name)
            if target is None:
                self.send_response(400)
                self._cors()
                self.end_headers()
                self.wfile.write(b"refused: path escapes cells/\n")
                return
            with open(target, "wb") as f:
                f.write(body)
            _evict_counter[0] += 1
            # Every write triggers an eviction check — operation is
            # cheap (scandir + maybe a few unlinks) and the cap should
            # be approached rarely in practice.
            _evict_if_over_cap()
            self.send_response(200)
            self._cors()
            self.send_header("content-type", "text/plain")
            self.end_headers()
            self.wfile.write(f"cached {target} ({len(body)} bytes)\n".encode())
            return
        # Legacy screenshot path: filename from URL, write under shots dest.
        raw_name = raw_path.replace("..", "_") or "shot.png"
        if "/" in raw_name:
            raw_name = raw_name.replace("/", "_")
        if not raw_name.lower().endswith((".png", ".jpg", ".jpeg")):
            raw_name += ".png"
        path = os.path.join(SHOTS_DEST, raw_name)
        data = body
        if body.startswith(b"data:"):
            comma = body.find(b",")
            data = base64.b64decode(body[comma + 1 :])
        with open(path, "wb") as f:
            f.write(data)
        self.send_response(200)
        self._cors()
        self.send_header("content-type", "text/plain")
        self.end_headers()
        self.wfile.write(f"wrote {path} ({len(data)} bytes)\n".encode())

    def log_message(self, *a, **k):
        # quiet
        pass


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8767
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"snap_receiver listening on http://127.0.0.1:{port}", flush=True)
    print(f"  shots -> {SHOTS_DEST}", flush=True)
    print(f"  cells -> {CELLS_DEST} (cap {CELLS_CACHE_MAX})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
