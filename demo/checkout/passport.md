# Thunder passport: web, orders, billing

A change from `b7993966e791`. **6 claims with evidence** (3 passed, 0 failed, 3 read from code), **5 unknowns**, **4 not verified**. This is an evidence record, not a certificate: each claim says what it rests on and what it does not cover.

## Purpose

Prevent duplicate charges when a payment request is retried: one press of Place order charges the customer once.

(Source: given with --purpose.)

## Verified by running (ran and passed)

- ✓ `python3 -m unittest` in billing exited with 0.
  - Basis: `python3 -m unittest` in `billing`, exit 0, output sha256:d90375e231be…
  - Does not cover: Only what these tests exercise. Thunder did not measure which lines or paths they cover.
  - Depends on 3 files (by content hash)
- ✓ `dotnet run -- --test` in orders exited with 0.
  - Basis: `dotnet run -- --test` in `orders`, exit 0, output sha256:0ccd1f913e96…
  - Does not cover: Only what these tests exercise. Thunder did not measure which lines or paths they cover.
  - Depends on 6 files (by content hash)
- ✓ `node --test checkout.test.ts` in web exited with 0.
  - Basis: `node --test checkout.test.ts` in `web`, exit 0, output sha256:ce3a23df0b56…
  - Does not cover: Only what these tests exercise. Thunder did not measure which lines or paths they cover.
  - Depends on 3 files (by content hash)

## Read from code (not run)

- ○ orders calls billing with POST /charges, and billing handles it.
  - Basis: orders@b6d519c:BillingClient.cs:20 → billing@b6d519c:server.py:13
  - Does not cover: Read from code; nothing was run. It does not show that the call succeeds or what it answers.
  - Depends on 2 files (by content hash)
- ○ web calls orders with POST /orders, and orders handles it.
  - Basis: web@b6d519c:checkout.ts:24 → orders@b6d519c:Program.cs:18
  - Does not cover: Read from code; nothing was run. It does not show that the call succeeds or what it answers.
  - Depends on 2 files (by content hash)
- ○ What the change does, read from both versions: 23 changes in meaning, 1 risk, 0 form-only.
  - Basis: review of b7993966e791 → b6d519c5e0de
  - Does not cover: What the code says before and after; not whether it runs or is right.
  - Depends on 8 files (by content hash)

## Not verified

- Deployment: how it is configured and run in a real environment.
- External services: real providers, their answers, and their outages (tests use what the code was given).
- More than one process or machine: anything kept in memory is not shared between copies.
- Load and timing: behavior under many requests at once, beyond what the tests ran.

## Behavior

### Charge (billing/billing.py, lines 37–53, changed)

```text
Charge (Billing)
  Author's note: Charge the customer once per idempotency key: asking again with the same key gives back the first payment.
  You give it: order ref, amount cents, idempotency key
  - Ask: Is amount cents at most 0?  (line 39)
    Yes:
      - Stop: ValueError: "The amount to charge must be more than zero"  (line 40)
    No: continue
  - Ask: Is idempotency key set?  (line 41)
    Yes: continue
    No:
      - Stop: ValueError: "A charge needs an idempotency key, so a retry is never char…"  (line 42)
  - Uses self.lock  (line 43)
    - Sets first to the idempotency key entry in by key  (line 44)
    - Ask: Is first set?  (line 45)
      Yes:
        - Ask: Is the first's amount cents amount cents?  (line 46)
          Yes: continue
          No:
            - Stop: ValueError: "This idempotency key was already used for a different amount"  (line 47)
        - Gives back first  (line 48)
      No: continue
    - Works out charge id from charge  (line 49)
    - `payment = Payment(charge_id, order_ref, amount_cents, "charged")` (code, not explained)  (line 50)
    - Adds payment to payments  (line 51)
    - Stores payment under idempotency key in by key  (line 52)
    - Gives back payment  (line 53)
```

### Make handler (billing/server.py, lines 11–39, changed)

```text
Make handler
  You give it: billing
  - `class Handler(BaseHTTPRequestHandler):` (code, not explained)  (line 12)
  - Gives back handler  (line 39)
```

### Do post (billing/server.py, lines 13–21, changed)

```text
Do post (Handler)
  When someone calls POST /charges
  You get back: the result of answer
  - Ask: Is path "/charges"?  (line 14)
    Yes: continue
    No:
      - Gives back the result of answer  (line 15)
  - Reads a worked-out value as JSON (as body)  (line 16)
  - Tries the next steps and handles the errors named below  (line 17)
    - Works out payment from charge  (line 18)
    If ValueError goes wrong:
      - Gives back the result of answer  (line 20)
  - Gives back the result of answer  (line 21)
```

### Charge async (orders/BillingClient.cs, lines 17–24, changed)

```text
Charge async (Billing client)
  You give it: order ref, amount cents, idempotency key
  - `var json = JsonSerializer.Serialize(new { order_ref = orderRef, amount_cents = amountCent…` (code, not explained)  (line 19)
  - Sends a POST request to /charges (as response)  (line 20)
  - Calls ensure success status code  (line 21)
  - Works out body from read from json async>  (line 22)
  - Gives back a new ChargeResult  (line 23)
```

### Place order async (orders/OrderService.cs, lines 19–26, changed)

```text
Place order async (Order service)
  You give it: request
  - Ask: The request's idempotency key is empty or missing?  (line 21)
    Yes:
      - Gives back a new OrderResult  (line 23)
    No: continue
  - Gives back the entry for the request's idempotency key in by key, made by place new order async if it is missing (a later call with the same idempotency key gets that same entry)  (line 25)
```

### Place new order async (orders/OrderService.cs, lines 28–48, changed)

```text
Place new order async (Order service)
  You give it: request
  - Ask: Is the request's items.Count 0?  (line 30)
    Yes:
      - Gives back a new OrderResult  (line 32)
    No: continue
  - Ask: `request.Items.Any(i => !Pricing.UnitPrices.ContainsKey(i.Sku))`? (code, not explained)  (line 34)
    Yes:
      - Gives back a new OrderResult  (line 36)
    No: continue
  - Ask: Inventory.Reserve(the request's items)?  (line 38)
    Yes: continue
    No:
      - Gives back a new OrderResult  (line 40)
  - Works out price from price of items  (line 42)
  - Sets order id to text built from its parts  (line 43)
  - Works out payment from charge async  (line 44)
  - Creates a new OrderResult as order  (line 45)
  - `lock (_orders) _orders.Add(order);` (code, not explained)  (line 46)
  - Gives back order  (line 47)
```

### Place order (web/checkout.ts, lines 16–38, changed)

```text
Place order
  Author's note: Place the order. A request that takes longer than timeoutMs is abandoned and sent again (the same order, by its key), up to `tries` times.
  You give it: cart, coupon, options
  You get back: a Promise<OrderAnswer>
  - Ask: Is the length of cart 0?  (line 17)
    Yes:
      - Gives back placed and message  (line 18)
    No: continue
  - Sets idempotency key to a new random ID  (line 20)
  - Turns items (cart), coupon and idempotency key into JSON text (as body)  (line 21)
  - Counts attempt from 1 while attempt is at most options.tries  (line 22)
    For each:
      - Tries the next steps and handles any error  (line 23)
        - Sends a POST request to …/orders (as response)  (line 24)
        - Gives back a response  (line 30)
        If anything goes wrong:
          - `const timedOut = error instanceof DOMException && (error.name === "TimeoutError" || error…` (code, not explained)  (line 32)
          - Ask: Timed out is not set or attempt is the options's tries?  (line 33)
            Yes:
              - Gives back placed and message  (line 34)
            No: continue
  - Gives back placed and message  (line 38)
```

## Effects (detected in code, not observed)

- Charge **reads**: Sets first to the idempotency key entry in by key (billing/billing.py:44)
- Charge **writes**: Stores payment under idempotency key in by key (billing/billing.py:52)
- Charge async **calls another part**: Sends a POST request to /charges (as response) (orders/BillingClient.cs:20)
- Place order **calls another part**: Sends a POST request to …/orders (as response) (web/checkout.ts:24)

## Dependencies

- orders calls billing: POST /charges (handled by Do post) (orders@b6d519c:BillingClient.cs:20 → billing@b6d519c:server.py:13)
- web calls orders: POST /orders (handled by Post /orders) (web@b6d519c:checkout.ts:24 → orders@b6d519c:Program.cs:18)
- calls POST computed/orders (web:checkout.ts:24)
- 12 files read, each recorded by content hash

## Unknowns

- not read: shown as code: payment = Payment(charge_id, order_ref, amount_cents, "charged") (billing/billing.py:50)
- not read: shown as code: class Handler(BaseHTTPRequestHandler): (billing/server.py:12)
- not read: shown as code: var json = JsonSerializer.Serialize(new { order_ref = orderRef, amount_cents = amountCent… (orders/BillingClient.cs:19)
- not read: shown as code: lock (_orders) _orders.Add(order); (orders/OrderService.cs:46)
- not read: shown as code: const timedOut = error instanceof DOMException && (error.name === "TimeoutError" || error… (web/checkout.ts:32)

## History

- Base: b7993966e79175daf466fb13d040fe85f4577ba1
- Head: b6d519c5e0dea246905508ea2e770e93a8c28163
- changed: web/checkout.test.ts
- changed: web/checkout.ts
- changed: orders/BillingClient.cs
- changed: orders/OrderService.cs
- changed: orders/SelfTests.cs
- changed: billing/billing.py
- changed: billing/server.py
- changed: billing/test_billing.py
- Built: 2026-11-26T07:52:51.267Z with Thunder 1.3.0
- Fingerprint: sha256:b62448412290e74089d201354b262ed0ee925ce5334d5a0e06fa73a45542d8cc
