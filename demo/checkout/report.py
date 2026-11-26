"""Prints what billing charged (run-demo.sh pipes GET /payments into it)."""
import json
import sys

data = json.load(sys.stdin)
for p in data["payments"]:
    print(f"  {p['payment_id']}  {p['order_ref']}  ${p['amount_cents'] / 100:.2f}")
n = len(data["payments"])
total = data["charged_total_cents"] / 100
note = "the customer was charged more than once" if n > 1 else "charged once"
print(f"  {n} charge{'' if n == 1 else 's'}, ${total:.2f} in total  <- {note}")
