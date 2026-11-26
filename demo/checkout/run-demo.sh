#!/usr/bin/env bash
# The Lumen Supply checkout, end to end: billing (Python), orders (C#), and the web checkout (TypeScript).
# The payment provider is slow (1.5 s) and the checkout page gives up after 1 s and tries once more,
# so this shows how many times one press of "Place order" charges the customer.
#
#   demo/checkout/run-demo.sh            the app, end to end
#   demo/checkout/run-demo.sh --tests    also each part's own tests
#
# Needs Python 3.10+, .NET 10, and Node 22.18+ (it runs the TypeScript directly).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
BILLING_PORT=8101
ORDERS_PORT=8102

if [[ "${1:-}" == "--tests" ]]; then
  echo "== billing (Python) tests";  (cd "$here/billing" && python3 -m unittest -v 2>&1 | tail -n 4)
  echo "== orders (C#) tests";       (cd "$here/orders" && dotnet run -- --test)
  echo "== web (TypeScript) tests";  (cd "$here/web" && node --test checkout.test.ts 2>&1 | grep -E '^# (pass|fail|todo)')
  echo
fi

pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

(cd "$here/billing" && exec python3 server.py "$BILLING_PORT" 1.5) &
pids+=($!)
(cd "$here/orders" && dotnet build -v q -nologo >/dev/null && exec dotnet run --no-build -- "$ORDERS_PORT" "http://127.0.0.1:$BILLING_PORT") &
pids+=($!)

until curl -s "http://127.0.0.1:$BILLING_PORT/payments" >/dev/null 2>&1 && curl -s "http://127.0.0.1:$ORDERS_PORT/stock" >/dev/null 2>&1; do sleep 0.3; done

echo "== One customer presses \"Place order\" once (2 lamps, 2 bulbs, coupon SAVE10)"
(cd "$here/web" && node place-order.ts "http://127.0.0.1:$ORDERS_PORT")
sleep 2   # let the abandoned first request finish on the server

echo
echo "== What billing charged"
curl -s "http://127.0.0.1:$BILLING_PORT/payments" | python3 "$here/report.py"
echo "== Lamps left on the shelf (10 at the start)"
curl -s "http://127.0.0.1:$ORDERS_PORT/stock" | python3 -c 'import json,sys; print("  lamps:", json.load(sys.stdin)["lamp"])'
