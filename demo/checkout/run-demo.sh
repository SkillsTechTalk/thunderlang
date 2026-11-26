#!/usr/bin/env bash
# The Lumen Supply checkout, end to end: billing (Python), orders (C#), and the web checkout (TypeScript).
# The payment provider is slow (1.5 s) and the checkout page gives up after 1 s and tries once more,
# so this shows how many times one press of "Place order" charges the customer.
#
#   demo/checkout/run-demo.sh             the app as it is now (with the fix), end to end
#   demo/checkout/run-demo.sh --before    the app before the fix (change.patch taken back out), end to end
#   demo/checkout/run-demo.sh --tests     also each part's own tests (with --before: the known-bug tests)
#   demo/checkout/run-demo.sh --thunder   what Thunder reads: the big picture, the links, the change's impact,
#                                         and the review of the change (before -> after), from a scratch git repo
#   demo/checkout/run-demo.sh --passport  the change's Thunder passport (passport.json and passport.md here): it runs
#                                         each part's tests and records them as evidence; then it edits a billing
#                                         file in the scratch copy and shows the test evidence turning stale
#   demo/checkout/run-demo.sh --change    one Thunder change, written into three languages: free shipping from $40
#                                         instead of $50, in the page (TypeScript), orders (C#), and billing's receipt
#                                         (Python). The plan, then the change, the tests, and a passport
#                                         (shipping-change-passport.json and .md here). CHANGE_TO="subtotal >= 75"
#                                         tries another limit (a raise makes the tests that pin "$55 ships free" fail).
#
# Needs Python 3.10+, .NET 10, and Node 22.18+ (it runs the TypeScript directly). Scratch copies go in a new
# folder under the system's temp folder.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
BILLING_PORT=8101
ORDERS_PORT=8102
before=false; tests=false; thunder=false; passport=false; change=false
for a in "$@"; do
  case "$a" in
    --before) before=true ;;
    --tests) tests=true ;;
    --thunder) thunder=true ;;
    --passport) passport=true ;;
    --change) change=true ;;
    *) echo "run-demo.sh: there is no option $a (try --before, --tests, --thunder, --passport, --change)"; exit 2 ;;
  esac
done

# A scratch git repo with two commits: the app before the fix, then after it (the folder as it is here).
scratch() {
  local s; s="$(mktemp -d "${TMPDIR:-/tmp}/lumen-checkout.XXXXXX")"
  export GIT_AUTHOR_DATE="2026-11-26T12:00:00Z" GIT_COMMITTER_DATE="2026-11-26T12:00:00Z"   # the same commits every time
  (cd "$here" && tar --exclude bin --exclude obj --exclude __pycache__ -cf - .) | (cd "$s" && tar -xf -)
  (cd "$s" && git init -q && git apply -R change.patch && git add -A && git -c user.name=demo -c user.email=demo@example.invalid commit -qm "before: a retried checkout charges twice" \
    && git apply change.patch && git add -A && git -c user.name=demo -c user.email=demo@example.invalid commit -qm "after: one idempotency key from the page to billing")
  echo "$s"
}

if $thunder; then
  s="$(scratch)"
  thunder() { node "$repo/compiler/src/cli.mjs" "$@"; }
  cd "$s"
  echo "== thunder read . --level big-picture"; thunder read . --level big-picture
  echo; echo "== thunder trace web orders billing"; thunder trace web orders billing
  echo; echo "== thunder trace impact --diff --base HEAD~1 web orders billing"; thunder trace impact --diff --base HEAD~1 web orders billing
  echo; echo "== thunder review HEAD~1 HEAD"; thunder review HEAD~1 HEAD
  exit 0
fi

if $passport; then
  s="$(scratch)"
  thunder() { node "$repo/compiler/src/cli.mjs" "$@"; }
  cd "$s"
  echo "== thunder passport web orders billing --base HEAD~1 (running each part's tests)"
  thunder passport web orders billing --base HEAD~1 \
    --purpose "Prevent duplicate charges when a payment request is retried: one press of Place order charges the customer once." \
    --run "billing: python3 -m unittest" --run "orders: dotnet run -- --test" --run "web: node --test checkout.test.ts shipping.test.ts" \
    --out passport.json --md-out passport.md || true
  cp passport.json passport.md "$here/"
  echo; echo "== Someone edits billing/billing.py after the passport was built"
  printf '\n# an edit after the passport was built\n' >> billing/billing.py
  thunder passport check passport.json
  exit 0
fi

if $change; then
  s="$(scratch)"
  thunder() { node "$repo/compiler/src/cli.mjs" "$@"; }
  cd "$s"
  to="${CHANGE_TO:-subtotal >= 40}"
  echo "== The plan: thunder write web orders billing --decision shippingNote --rule 1 --when \"$to\""
  thunder write web orders billing --decision shippingNote --rule 1 --when "$to"
  echo; echo "== The change, the tests, and a passport (--write: every implementation changes, or none does)"
  status=0
  thunder write web orders billing --decision shippingNote --rule 1 --when "$to" --write \
    --run "billing: python3 -m unittest" --run "orders: dotnet run -- --test" --run "web: node --test checkout.test.ts shipping.test.ts" \
    --purpose "Free shipping from a new limit, the same in the cart page, the orders service, and billing's receipt." \
    --passport shipping-change-passport.json --md-out shipping-change-passport.md || status=$?
  echo; echo "== What changed in the code (git diff --stat; only the rule's characters)"; git diff --stat -- web orders billing; git diff -U0 -- web orders billing | grep -E '^[-+][^-+]' || true
  if [ -z "${CHANGE_TO:-}" ]; then cp shipping-change-passport.json shipping-change-passport.md "$here/"; fi
  exit $status
fi

app="$here"
if $before; then app="$(scratch)"; (cd "$app" && git checkout -q HEAD~1); echo "(the app before the fix, in $app)"; fi

if $tests; then
  echo "== billing (Python) tests";  (cd "$app/billing" && python3 -m unittest 2>&1 | tail -n 3)
  echo "== orders (C#) tests";       (cd "$app/orders" && dotnet run -- --test)
  echo "== web (TypeScript) tests";  (cd "$app/web" && node --test checkout.test.ts shipping.test.ts 2>&1 | grep -E '^# (pass|fail|todo)')
  echo
fi

pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT

(cd "$app/billing" && exec python3 server.py "$BILLING_PORT" 1.5) &
pids+=($!)
(cd "$app/orders" && dotnet build -v q -nologo >/dev/null && exec dotnet run --no-build -- "$ORDERS_PORT" "http://127.0.0.1:$BILLING_PORT") &
pids+=($!)

until curl -s "http://127.0.0.1:$BILLING_PORT/payments" >/dev/null 2>&1 && curl -s "http://127.0.0.1:$ORDERS_PORT/stock" >/dev/null 2>&1; do sleep 0.3; done

echo "== One customer presses \"Place order\" once (2 lamps, 2 bulbs, coupon SAVE10)"
(cd "$app/web" && node place-order.ts "http://127.0.0.1:$ORDERS_PORT")
sleep 2   # let the abandoned first request finish on the server

echo
echo "== What billing charged"
curl -s "http://127.0.0.1:$BILLING_PORT/payments" | python3 "$here/report.py"
echo "== Lamps left on the shelf (10 at the start)"
curl -s "http://127.0.0.1:$ORDERS_PORT/stock" | python3 -c 'import json,sys; print("  lamps:", json.load(sys.stdin)["lamp"])'
