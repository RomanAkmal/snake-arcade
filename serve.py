# serve.py — tiny local dev server: python serve.py [port]
#
# Why not just `python -m http.server`? On Windows, Python asks the
# registry for MIME types and can get back `text/plain` for .js files.
# Browsers refuse to execute ES modules served as text/plain, so the
# game would load a blank page. This forces the correct types.

import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".html": "text/html",
        ".json": "application/json",
        ".svg": "image/svg+xml",
    }


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
print(f"Serving snake-arcade at http://localhost:{port}")
HTTPServer(("", port), Handler).serve_forever()
