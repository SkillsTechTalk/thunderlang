# Thunder passport: web, orders, billing

A change from `e43409d286c3`. **9 claims with evidence** (3 passed, 0 failed, 6 read from code), **0 unknowns**, **4 not verified**. This is an evidence record, not a certificate: each claim says what it rests on and what it does not cover.

## Purpose

Free shipping from a new limit, the same in the cart page, the orders service, and billing's receipt.

(Source: given with --purpose.)

## Verified by running (ran and passed)

- ✓ `python3 -m unittest` in billing exited with 0.
  - Basis: `python3 -m unittest` in `billing`, exit 0, output sha256:850daafee4e9…
  - Does not cover: Only what these tests exercise. Thunder did not measure which lines or paths they cover.
  - Depends on 5 files (by content hash)
- ✓ `dotnet run -- --test` in orders exited with 0.
  - Basis: `dotnet run -- --test` in `orders`, exit 0, output sha256:0ccd1f913e96…
  - Does not cover: Only what these tests exercise. Thunder did not measure which lines or paths they cover.
  - Depends on 7 files (by content hash)
- ✓ `node --test checkout.test.ts shipping.test.ts` in web exited with 0.
  - Basis: `node --test checkout.test.ts shipping.test.ts` in `web`, exit 0, output sha256:2435ac83cedb…
  - Does not cover: Only what these tests exercise. Thunder did not measure which lines or paths they cover.
  - Depends on 5 files (by content hash)

## Read from code (not run)

- ○ orders calls billing with POST /charges, and billing handles it.
  - Basis: orders@e43409d+changes:BillingClient.cs:20 → billing@e43409d+changes:server.py:13
  - Does not cover: Read from code; nothing was run. It does not show that the call succeeds or what it answers.
  - Depends on 2 files (by content hash)
- ○ web calls orders with POST /orders, and orders handles it.
  - Basis: web@e43409d+changes:checkout.ts:24 → orders@e43409d+changes:Program.cs:18
  - Does not cover: Read from code; nothing was run. It does not show that the call succeeds or what it answers.
  - Depends on 2 files (by content hash)
- ○ What the change does, read from both versions: 2 changes in meaning, 0 risks, 0 form-only.
  - Basis: review of e43409d286c3 → e43409d286c3
  - Does not cover: What the code says before and after; not whether it runs or is right.
  - Depends on 3 files (by content hash)
- ○ billing/receipt.py: shipping_fee, rule 1 now reads "If subtotal is at least 40, the answer is 0" (was "If subtotal is at least 50, the answer is 0").
  - Basis: {"schema":"thunder-write-across-v1","line":7,"change":[{"line":7,"column":20,"before":"50","after":"40"}],"check":"read again after the change: this rule reads as intended, and every other rule and function in the file reads exactly as before"}
  - Does not cover: How the code reads, not whether it runs. Code that computes the same thing in a different shape is not found or changed.
  - Depends on 1 file (by content hash)
- ○ orders/Shipping.cs: ShippingFee, rule 1 now reads "If subtotal is at least 40, the answer is 0" (was "If subtotal is at least 50, the answer is 0").
  - Basis: {"schema":"thunder-write-across-v1","line":9,"change":[{"line":9,"column":25,"before":"50m","after":"40m"}],"check":"read again after the change: this rule reads as intended, and every other rule and function in the file reads exactly as before"}
  - Does not cover: How the code reads, not whether it runs. Code that computes the same thing in a different shape is not found or changed.
  - Depends on 1 file (by content hash)
- ○ web/shipping.ts: shippingNote, rule 1 now reads "If subtotal is at least 40, the answer is "Free shipping"" (was "If subtotal is at least 50, the answer is "Free shipping"").
  - Basis: {"schema":"thunder-write-across-v1","line":6,"change":[{"line":6,"column":19,"before":"50","after":"40"}],"check":"read again after the change: this rule reads as intended, and every other rule and function in the file reads exactly as before"}
  - Does not cover: How the code reads, not whether it runs. Code that computes the same thing in a different shape is not found or changed.
  - Depends on 1 file (by content hash)

## Not verified

- Deployment: how it is configured and run in a real environment.
- External services: real providers, their answers, and their outages (tests use what the code was given).
- More than one process or machine: anything kept in memory is not shared between copies.
- Load and timing: behavior under many requests at once, beyond what the tests ran.

## Behavior

### Shipping fee (billing/receipt.py, lines 5–9, changed)

```text
Shipping fee: a rule
  Author's note: Shipping on the receipt: free for larger orders.
  You give it: subtotal
  - Ask: Subtotal is at least 40?  (line 7)
    Yes:
      - Answer: 0  (line 7)
    No:
      - Answer: 5.99  (line 9)
```

### Shipping fee (orders/Shipping.cs, lines 7–13, changed)

```text
Shipping fee (Shipping): a rule
  You give it: subtotal
  - Ask: Subtotal is at least 40?  (line 9)
    Yes:
      - Answer: 0  (line 9)
    No:
      - Answer: 5.99  (line 13)
```

### Shipping note (web/shipping.ts, lines 5–9, changed)

```text
Shipping note: a rule
  Author's note: The line under the cart total.
  You give it: subtotal
  - Ask: Subtotal is at least 40?  (line 6)
    Yes:
      - Answer: "Free shipping"  (line 6)
    No:
      - Answer: "Shipping: $5.99"  (line 9)
```

## Effects (detected in code, not observed)

None detected.

## Dependencies

- orders calls billing: POST /charges (handled by Do post) (orders@e43409d+changes:BillingClient.cs:20 → billing@e43409d+changes:server.py:13)
- web calls orders: POST /orders (handled by Post /orders) (web@e43409d+changes:checkout.ts:24 → orders@e43409d+changes:Program.cs:18)
- calls POST computed/orders (web:checkout.ts:24)
- 17 files read, each recorded by content hash

## Unknowns

Nothing Thunder failed to read or link.

## History

- Base: e43409d286c337149c0d0f9269859a2f3623c177
- Head: e43409d286c337149c0d0f9269859a2f3623c177 (with uncommitted changes)
- changed: web/shipping.ts
- changed: orders/Shipping.cs
- changed: billing/receipt.py
- Built: 2026-11-26T08:50:07.323Z with Thunder 1.3.0
- Fingerprint: sha256:fa26701d47b3b5adf1662ab5baae0f29fa925d73082b737a97ff22d3421363d3
