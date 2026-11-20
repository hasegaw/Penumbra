"""Serve the cinema on loopback or a LAN, optionally through one shared slow link."""
import argparse
import mimetypes
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


PUBLIC_ROOT = Path(__file__).resolve().parents[1] / "cinema"
MIME = {".js": "text/javascript", ".woff2": "font/woff2", ".webp": "image/webp"}


class SharedLink:
    def __init__(self, kbps):
        self.bytes_per_second = kbps * 1000 / 8
        self.next_slot = 0.0
        self.lock = threading.Lock()

    def wait_for(self, size):
        if not self.bytes_per_second:
            return
        with self.lock:
            self.next_slot = max(time.monotonic(), self.next_slot) + size / self.bytes_per_second
            scheduled = self.next_slot
        time.sleep(max(0, scheduled - time.monotonic()))


class CinemaHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.serve(send_body=True)

    def do_HEAD(self):
        self.serve(send_body=False)

    def serve(self, send_body):
        if self.server.latency:
            time.sleep(self.server.latency)
        prefix = self.server.prefix
        path = unquote(urlsplit(self.path).path)
        if prefix != "/" and path in ("/", prefix[:-1]):
            self.send_response(302)
            self.send_header("Location", prefix)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if not path.startswith(prefix) or "\0" in path:
            self.send_error(404)
            return
        relative = path[len(prefix):]
        if ".." in relative.split("/"):
            self.send_error(404)
            return
        target = (PUBLIC_ROOT / (relative + "index.html" if path.endswith("/") else relative)).resolve()
        if PUBLIC_ROOT not in target.parents:
            self.send_error(404)
            return
        try:
            source = target.open("rb")
        except (FileNotFoundError, IsADirectoryError, NotADirectoryError, PermissionError):
            self.send_error(404)
            return
        with source:
            self.send_response(200)
            mime = MIME.get(target.suffix) or mimetypes.guess_type(target.name)[0]
            self.send_header("Content-Type", mime or "application/octet-stream")
            self.send_header("Content-Length", str(target.stat().st_size))
            self.send_header("Cache-Control", "no-store" if self.server.link.bytes_per_second else "no-cache")
            self.end_headers()
            if send_body:
                try:
                    while chunk := source.read(8192):
                        self.server.link.wait_for(len(chunk))
                        self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    pass  # Navigating away cancels outstanding asset downloads.


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", default="127.0.0.1", help="listen address (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--kbps", type=int, default=0, help="shared downstream kbit/s; 0 is unlimited")
    parser.add_argument("--latency-ms", type=int, default=0, help="delay before each response")
    parser.add_argument("--prefix", default="/", help="mount path, e.g. /Penumbra/")
    args = parser.parse_args()
    if not 0 <= args.port <= 65535 or min(args.kbps, args.latency_ms) < 0:
        parser.error("use a valid port and nonnegative link values")
    if any(char in args.prefix for char in "?#\\") or ".." in args.prefix.split("/"):
        parser.error("use a URL path for --prefix")
    prefix = "/" + args.prefix.strip("/")
    if prefix != "/":
        prefix += "/"
    with ThreadingHTTPServer((args.bind, args.port), CinemaHandler) as server:
        server.prefix = prefix
        server.latency = args.latency_ms / 1000
        server.link = SharedLink(args.kbps)
        rate = f"{args.kbps} kbit/s shared" if args.kbps else "unlimited"
        print(f"Serving cinema at http://{args.bind}:{server.server_port}{prefix} ({rate}, {args.latency_ms} ms)", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
