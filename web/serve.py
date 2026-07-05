#!/usr/bin/env python3
"""Simple static file server that proxies /api/* to the backend."""
import http.server
import urllib.request
import os

BACKEND = "http://127.0.0.1:8720"
DIR = os.path.join(os.path.dirname(__file__), "dist")

class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api/"):
            # Proxy to backend
            try:
                url = BACKEND + self.path
                with urllib.request.urlopen(url, timeout=30) as resp:
                    data = resp.read()
                    self.send_response(resp.status)
                    self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
                    # CORS handled by backend middleware
                    self.end_headers()
                    self.wfile.write(data)
            except (urllib.error.URLError, urllib.error.HTTPError) as e:
                self.send_error(502, f"Proxy error: {e}")
        else:
            super().do_GET()

    def do_OPTIONS(self):
        self.send_response(204)
        # CORS handled by backend middleware
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()

if __name__ == "__main__":
    os.chdir(DIR)
    server = http.server.HTTPServer(("0.0.0.0", 5180), ProxyHandler)
    print(f"Serving {DIR} on :5180, proxying /api/* -> {BACKEND}")
    server.serve_forever()
