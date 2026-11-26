"""The billing service over HTTP: POST /charges charges a customer; GET /payments lists what was charged."""

import json
import sys
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from billing import Billing, FakeProvider


def make_handler(billing):
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != "/charges":
                return self.answer(404, {"error": "There is no such page"})
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            try:
                payment = billing.charge(body["order_ref"], body["amount_cents"])
            except ValueError as problem:
                return self.answer(400, {"error": str(problem)})
            return self.answer(200, asdict(payment))

        def do_GET(self):
            if self.path != "/payments":
                return self.answer(404, {"error": "There is no such page"})
            return self.answer(200, {"payments": [asdict(p) for p in billing.payments], "charged_total_cents": billing.charged_total()})

        def answer(self, status, data):
            raw = json.dumps(data).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def log_message(self, *args):
            pass

    return Handler


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8101
    delay = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
    server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(Billing(FakeProvider(delay))))
    print(f"billing listening on {port} (provider delay {delay}s)", flush=True)
    server.serve_forever()
