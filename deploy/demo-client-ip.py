"""Temporary operator-IP discovery on the owned VM; no request logging."""
from http.server import BaseHTTPRequestHandler, HTTPServer
import json


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/client-ip":
            self.send_error(404)
            return
        body = json.dumps({"ip": self.client_address[0]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


HTTPServer(("0.0.0.0", 80), Handler).serve_forever()
