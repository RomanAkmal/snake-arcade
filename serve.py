# serve.py — local dev server for snake-arcade.
#
#   python serve.py           # http://localhost:8000
#   python serve.py 5500      # pick a port
#   python serve.py -v        # log every request
#
# Three things this does that `python -m http.server` does not:
#
# 1. Threads. The stdlib default is single-threaded, and Chrome opens
#    speculative connections it never sends a request on. The server
#    accepts one, blocks waiting for a request line, and the whole site
#    stops loading until that socket times out. That is the "it just
#    hangs forever" bug.
# 2. MIME types. On Windows, Python asks the registry for them and can
#    get back `text/plain` for .js. Browsers refuse to execute ES
#    modules served as text/plain, so the game loads a blank page.
# 3. No caching. Editing style.css and getting the old one back from
#    the browser cache has cost us more than one debugging session.

import argparse
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

MAX_PORT_TRIES = 10  # 8000 busy? walk up to 8009 before giving up


class Handler(SimpleHTTPRequestHandler):
    # HTTP/1.1 keeps the connection alive between the ~10 module files,
    # which is safe here because SimpleHTTPRequestHandler always sends a
    # Content-Length.
    protocol_version = "HTTP/1.1"

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".html": "text/html",
        ".json": "application/json",
        ".svg": "image/svg+xml",
    }

    verbose = False

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def send_head(self):
        # Drop conditional requests so we can never answer 304 with a
        # file the browser cached before the last edit.
        del self.headers["If-Modified-Since"]
        del self.headers["If-None-Match"]
        return super().send_head()

    def log_message(self, fmt, *args):
        # Quiet by default. Every line printed here is a blocking write
        # to the console, and a Windows terminal in QuickEdit mode (you
        # clicked in the window) stalls that write — which stalls the
        # server. Errors are worth the risk; 200s are not.
        status = args[1] if len(args) > 1 else ""
        if self.verbose or not str(status).startswith("2"):
            super().log_message(fmt, *args)


class DevServer(ThreadingHTTPServer):
    daemon_threads = True  # never let a stuck socket hold up Ctrl-C

    # The stdlib turns SO_REUSEADDR on. On Linux that just skips
    # TIME_WAIT; on Windows it lets a second server bind a port someone
    # is already listening on, so you end up with two servers and half
    # your requests going to the stale one. Off there, which also makes
    # the "port busy" fallback below actually fire.
    allow_reuse_address = sys.platform != "win32"

    # Bind v6 + v4 together where we can: browsers resolve `localhost`
    # to ::1 first, and an IPv4-only socket makes them wait for that to
    # fail before retrying 127.0.0.1.
    dualstack = socket.has_dualstack_ipv6()
    address_family = socket.AF_INET6 if dualstack else socket.AF_INET

    def server_bind(self):
        if self.address_family == socket.AF_INET6:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


def serve(port, verbose):
    Handler.verbose = verbose

    for candidate in range(port, port + MAX_PORT_TRIES):
        try:
            httpd = DevServer(("", candidate), Handler)
        except OSError as err:
            if err.errno in (48, 98, 10048):  # address already in use
                print(f"port {candidate} busy, trying {candidate + 1}")
                continue
            raise
        break
    else:
        sys.exit(f"no free port in {port}–{port + MAX_PORT_TRIES - 1}")

    # ASCII only: the Windows console is cp1252 and a stray arrow or
    # ellipsis here crashes the server before it serves a byte.
    print(f"snake-arcade on http://localhost:{candidate}  (Ctrl-C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="dev server for snake-arcade")
    parser.add_argument("port", nargs="?", type=int, default=8000)
    parser.add_argument("-v", "--verbose", action="store_true",
                        help="log every request, not just errors")
    args = parser.parse_args()
    serve(args.port, args.verbose)
