"""Run lucida's static server + snap_receiver in one process.

  python3 serve.py [--static-port 8766] [--snap-port 8767]

Static server: serves the lucida project root over HTTP (index.html,
cells/, themes/, etc) on 127.0.0.1:8766. This is the page the browser
loads.

Snap receiver: accepts POST /cells/<id>.<substrate>.svg to persist
mermaid renders into cells/, plus the legacy screenshot path under
refs/gibson/live-shots/. Used by the #152d persistent SVG cache —
without it, mermaid cells re-render from scratch each session.

Ctrl-C stops both. Add to a shell alias or systemd user unit if you
want it always-on.
"""

from __future__ import annotations

import argparse
import functools
import os
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
TOOLS_DIR = os.path.join(THIS_DIR, "tools")
sys.path.insert(0, TOOLS_DIR)

# Import the snap_receiver Handler from tools/snap_receiver.py.
from snap_receiver import Handler as SnapHandler  # noqa: E402


class NoCacheHandler(SimpleHTTPRequestHandler):
    """Dev server: tell the browser never to cache, so edits show on a plain
    reload. index.html has no ?v= cache-bust, so without this the browser
    serves a stale index (and its inline JS) until a manual hard-reload —
    which is exactly the "I'm not seeing my changes" trap."""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def _serve_static(port: int) -> None:
    handler = functools.partial(NoCacheHandler, directory=THIS_DIR)
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"[serve] static -> http://127.0.0.1:{port}/  (root={THIS_DIR})", flush=True)
    server.serve_forever()


def _serve_snap(port: int) -> None:
    server = ThreadingHTTPServer(("127.0.0.1", port), SnapHandler)
    print(
        f"[serve] snap_receiver -> http://127.0.0.1:{port}/  (writes cells/, refs/gibson/live-shots/)",
        flush=True,
    )
    server.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--static-port", type=int, default=8766)
    parser.add_argument("--snap-port", type=int, default=8767)
    args = parser.parse_args()
    # Snap receiver runs in a daemon thread so Ctrl-C on the main
    # static-server loop tears the whole process down without
    # needing a custom signal handler.
    t = threading.Thread(target=_serve_snap, args=(args.snap_port,), daemon=True)
    t.start()
    try:
        _serve_static(args.static_port)
    except KeyboardInterrupt:
        print("\n[serve] shutting down", flush=True)


if __name__ == "__main__":
    main()
