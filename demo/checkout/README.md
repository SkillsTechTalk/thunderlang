# Lumen Supply checkout: one bug, three languages

A small shop, written for this demo. Lumen Supply is a made-up brand. Three parts talk over HTTP:

| Part | Language | What it does |
|---|---|---|
| `web/` | TypeScript | The checkout page's logic. It sends the cart, gives up after a second, and tries once more. It also says what shipping costs under the cart total (`shipping.ts`). |
| `orders/` | C# (ASP.NET minimal API) | Checks the shelf, holds the items, works out the price (coupon, shipping, 8% tax), asks billing to charge, and records the order. |
| `billing/` | Python (standard library) | Charges through a fake payment provider and records each payment. Prints the receipt lines, shipping included (`receipt.py`). |

**The bug.** The payment provider is slow, so the page gives up and tries again. Nothing tells the store that the second try is the same order. One press of "Place order" charges the customer twice, takes the items off the shelf twice, and then tells the customer it failed.

**The change.** "Prevent duplicate charges when a payment request is retried." Every try of one press now carries the same idempotency key, from the page through orders to billing. Orders gives a retry the first order, even while that order is still being placed. Billing charges once per key: a second request with the same key gets the first payment back, and the same key with a different amount is refused. The whole change is `change.patch`.

## The 90-second story

Every output below is real, copied from runs of `run-demo.sh` (Thunder 1.3.0 from this repository, plus the reader fixes in this PR).

**1. One press, before the fix: charged twice.** Run `demo/checkout/run-demo.sh --before`:

```text
== One customer presses "Place order" once (2 lamps, 2 bulbs, coupon SAVE10)
We couldn't reach the store. Please try again.

== What billing charged
  ch_1  ord-1001  $53.46
  ch_2  ord-1002  $53.46
  2 charges, $106.92 in total  <- the customer was charged more than once
== Lamps left on the shelf (10 at the start)
  lamps: 6
```

**2. Thunder reads the app you don't know: three languages, one picture.** Run `demo/checkout/run-demo.sh --thunder`. It reads three folders as three repositories and links them, each end cited to a file and line:

```text
Thunder Trace: 3 repositories, 2 links between them

Links between repositories
  orders → billing: Charge async sends POST /charges, handled by Do post
      orders@…:BillingClient.cs:20  →  billing@…:server.py:13
  web → orders: Place order sends POST /orders, handled by Post /orders (matched by path; the base address is set when it runs)
      web@…:checkout.ts:24  →  orders@…:Program.cs:18
```

The page's retry, read from the TypeScript (`thunder read demo/checkout --level flow --focus "Place order"`, after the fix):

```text
  • Sets idempotency key to a new random ID  (line 20)
  • Turns items (cart), coupon and idempotency key into JSON text (as body)  (line 21)
  ↻ Counts attempt from 1 while attempt is at most options.tries  (line 22)
      • Tries the next steps and handles any error  (line 23)
          • Sends a POST request to …/orders (as response)  (line 24)
```

**3. The change, read across all three languages.** Orders (C#), `--focus "Place order async"`:

```text
  ◆ The request's idempotency key is empty or missing?  (line 21)
      yes →
          ■ Gives back a new OrderResult  (line 23)
      no → carry on
  ■ Gives back the entry for the request's idempotency key in by key, made by place new order async if it is missing (a later call with the same idempotency key gets that same entry)  (line 25)
```

From `thunder review` of before → after (23 changes in meaning, 1 risk), the Python billing side:

```text
- Charge · billing/billing.py:42: Now stops with ValueError ("A charge needs an idempotency key, so a retry is never char…") when amount cents is not at most 0 and idempotency key is not set.
- Charge · billing/billing.py:47: Now stops with ValueError ("This idempotency key was already used for a different amount") when … first is set and the first's amount cents is not amount cents.
- Charge · billing/billing.py:48: Now also gives back first when amount cents is not at most 0 and first is set.
- Charge and 2 more · billing/billing.py:37: Now also takes idempotency key.   (also: Charge async in orders/BillingClient.cs)
- Place order async · orders/OrderService.cs:19: Its steps moved to Place new order async, a new function it now runs; …
- Place order · web/checkout.ts:20: Now also sets idempotency key to a new random ID when the length of cart is not 0.
- Order request · orders/OrderService.cs:5: Order request now also knows idempotency key (nothing at first).
```

What the change can affect across the three parts (`thunder trace impact --diff`):

```text
Thunder Trace impact: 3 findings, 1 high risk. Stops at the first hop.

HIGH   billing: POST /charges changed, and 1 caller in other repositories depends on it
         ← orders: Charge async (same path from another app)  orders@…:BillingClient.cs:20
MEDIUM orders: a POST request to /charges changed; it is handled in billing
MEDIUM web: a POST request to /orders changed; it is handled in orders
```

**4. After the fix: charged once.** Run `demo/checkout/run-demo.sh --tests`:

```text
== One customer presses "Place order" once (2 lamps, 2 bulbs, coupon SAVE10)
Thank you! Order ord-1001 is placed: $53.46 was charged.

== What billing charged
  ch_1  ord-1001  $53.46
  1 charge, $53.46 in total  <- charged once
== Lamps left on the shelf (10 at the start)
  lamps: 8
```

## The change's passport

`run-demo.sh --passport` builds the change's [Thunder passport](../../docs/passport.md) ([passport.json](passport.json),
[passport.md](passport.md)) from a scratch copy: base = the app before the fix, head = after. It runs each part's own
tests and records them as evidence:

```sh
thunder passport web orders billing --base HEAD~1 \
  --purpose "Prevent duplicate charges when a payment request is retried: one press of Place order charges the customer once." \
  --run "billing: python3 -m unittest" --run "orders: dotnet run -- --test" --run "web: node --test checkout.test.ts shipping.test.ts" \
  --out passport.json --md-out passport.md
```

```text
Thunder passport (change): web, orders, billing
Purpose: Prevent duplicate charges when a payment request is retried: one press of Place order charges the customer once.
6 claims with evidence (3 passed, 0 failed, 3 read from code), 5 unknowns, 4 not verified

Evidence
  ✓ ran and passed: `python3 -m unittest` in billing exited with 0.
  ✓ ran and passed: `dotnet run -- --test` in orders exited with 0.
  ✓ ran and passed: `node --test checkout.test.ts shipping.test.ts` in web exited with 0.
  ○ read from code, not run: orders calls billing with POST /charges, and billing handles it.
  ○ read from code, not run: web calls orders with POST /orders, and orders handles it.
  ○ read from code, not run: What the change does, read from both versions: 23 changes in meaning, 1 risk, 0 form-only.
```

Each claim records its basis (the command, its exit code and a digest of its output, or the two source lines of a
link), what it does not cover, and the exact files it depended on, by content hash. Then the script edits
`billing/billing.py` in the scratch copy and checks the passport again. Nothing is re-run:

```text
Thunder passport check: 4 current, 2 stale (nothing was re-run)

  ! stale: `python3 -m unittest` in billing exited with 0.
      billing/billing.py changed since the passport was built
  ✓ current: `dotnet run -- --test` in orders exited with 0.
  ✓ current: `node --test checkout.test.ts shipping.test.ts` in web exited with 0.
  ✓ current: orders calls billing with POST /charges, and billing handles it.
  ✓ current: web calls orders with POST /orders, and orders handles it.
  ! stale: What the change does, read from both versions: 23 changes in meaning, 1 risk, 0 form-only.
      billing/billing.py changed since the passport was built
```

## One Thunder change, three languages

The shop has a second problem, a quieter one: **one rule, written three times.** Free shipping from $50 is in the cart
page's note (`web/shipping.ts`, TypeScript), in what orders charges (`orders/Shipping.cs`, C#), and on billing's
receipt (`billing/receipt.py`, Python). Change one copy and forget another, and the page promises free shipping
that orders then charges for.

`run-demo.sh --change` makes free shipping start at $40 with **one** Thunder change, in a scratch copy. First the plan
(nothing is saved):

```text
== The plan: thunder write web orders billing --decision shippingNote --rule 1 --when "subtotal >= 40"
One rule, 3 implementations: subtotal is at least 50  →  subtotal is at least 40

billing/receipt.py  (python, shipping_fee, rule 1)
  why it is the same rule: the same condition: subtotal is at least 50 (names compared as words)
  was: If subtotal is at least 50, the answer is 0
  now: If subtotal is at least 40, the answer is 0
  line 7, column 20: 50  ->  40
orders/Shipping.cs  (csharp, ShippingFee, rule 1)
  why it is the same rule: the same condition: subtotal is at least 50 (names compared as words)
  was: If subtotal is at least 50, the answer is 0
  now: If subtotal is at least 40, the answer is 0
  line 9, column 25: 50m  ->  40m
web/shipping.ts  (typescript, shippingNote, rule 1)
  why it is the same rule: the rule you chose
  was: If subtotal is at least 50, the answer is "Free shipping"
  now: If subtotal is at least 40, the answer is "Free shipping"
  line 6, column 19: 50  ->  40

Checked by reading each file again: the rule reads as intended, and every other rule and function in each file reads exactly as before.

Plan only; nothing was saved. Add --write to change every implementation (all or none).
```

Then the same command with `--write`, each part's tests, and a passport
([shipping-change-passport.json](shipping-change-passport.json), [shipping-change-passport.md](shipping-change-passport.md)):

```text
Saved 3 files: web/shipping.ts, orders/Shipping.cs, billing/receipt.py.

Tests on the changed code:
  ✓ passed  billing: python3 -m unittest
  ✓ passed  orders: dotnet run -- --test
  ✓ passed  web: node --test checkout.test.ts shipping.test.ts

Thunder passport (change): web, orders, billing
9 claims with evidence (3 passed, 0 failed, 6 read from code), 0 unknowns, 4 not verified
```

The code change is exactly three characters' worth, one per language, each in the file's own spelling
(`git diff -- web orders billing`):

```text
-    if subtotal >= 50:
+    if subtotal >= 40:
-        if (subtotal >= 50m)
+        if (subtotal >= 40m)
-  if (subtotal >= 50) {
+  if (subtotal >= 40) {
```

Nobody opened the Python, the C#, or the TypeScript. The passport holds one claim per changed copy (each read again
after the change), the three test runs, the two links between the parts, and the review of what the change does.

**When tests pin the old rule, it says so.** `CHANGE_TO="subtotal >= 75" run-demo.sh --change` raises the limit
instead. The change is written the same way, and then three test runs fail, because a $55 cart now pays for shipping
and the tests say it ships free (`assert.equal(shippingNote(55), "Free shipping")` in TypeScript, and the $53.46 total in Python and C#). Each failure is
shown with its own output and the exit code is 1. Thunder never edits tests; a person decides whether the test or
the change is wrong.

The two sections below start from the passport. Anything they add beyond it is marked as such.

## Verified (and how)

**From the passport** (ran and passed): billing's 8 Python tests, orders' 7 C# checks, and web's 6 TypeScript tests,
each run by the passport with exit 0. **Read from code, not run:** the two Trace links (orders → billing
`POST /charges`, web → orders `POST /orders`) and the review of both versions.

**Shown by `run-demo.sh` but not yet recorded in the passport** (a passport cannot yet start the three services):

- **The bug, end to end.** One press charged $53.46 twice, took 4 lamps instead of 2, and said it failed. The run used the real billing, orders and web code over local HTTP (`run-demo.sh --before`).
- **The fix, end to end.** One press charged once, took 2 lamps, and said it succeeded (`run-demo.sh`).
- **Each part's own tests, before the fix**, each marked as a known bug in its own language:
  - Python: `expectedFailure`.
  - C#: a "known bug" check that must fail.
  - TypeScript: a `todo` test.
- **The same tests after the fix**, each passing, plus new ones:
  - Python, 5 tests: a retried charge is charged once (with a concurrent retry), a key reused for another amount is refused, and a charge without a key is refused.
  - C#, 7 checks: a retried order (concurrent) is charged once and takes stock once, different keys are different orders, and an order without a key is refused.
  - TypeScript, 4 tests: a retry carries the first try's key, and two presses have different keys.
- **Readings with source lines:** every Thunder line above names its file and line, and the two Trace links name both ends.

## Not verified

**From the passport** (always listed, because nothing here tests them):
- Deployment: how it is configured and run in a real environment.
- External services: real providers, their answers, and their outages (tests use what the code was given).
- More than one process or machine: anything kept in memory is not shared between copies.
- Load and timing: behavior under many requests at once, beyond what the tests ran.

Its unknowns also list the 5 changed steps it shows as code instead of words.

**Beyond the passport, from this walkthrough:**

- **A real payment provider** and its own idempotency rules. The provider here is a fake.
- **Deployment:** more than one copy of orders or billing. The key table is held in memory in one process, so two copies would not share it, and a restart forgets it.
- **Concurrency beyond the tests:** the tests cover two requests at once with the same key. Billing holds one lock around every charge, which is simple and correct but slow under load. That was not measured.
- **How long a key is kept:** forever, in memory.
- **Steps Thunder showed as code instead of words** (10 of 243 steps in the app, mostly in tests):
  - `items.Any(i => …)` conditions in `Inventory.Reserve` and `Place new order async`
  - `lock (_orders) _orders.Add(order)`
  - Python's `sum(… for p in … if …)` in `charged_total`
  - the `timedOut` line in the page's retry
  - the text template in `resultMessage`
- **The review's weaker spots:**
  - It reports that the C# charge call now passes the key only inside a group ("Thunder reads the same, but the code differs in details…").
  - It lists the new `IdempotencyKey` on the C# request record as a field ("Order request now also knows idempotency key"), not as a change to what `POST /orders` accepts.
  - Trace impact flags the requests to `/orders` and `/charges`, but it does not yet tie a change to a request's shape to the route that receives it.

## What this demo does and does not claim

The flagship story is "I changed an application written in three languages without editing any of them". **For one
kind of change, that is now true here:** a rule's number, comparison, or text value, written in several services.
`run-demo.sh --change` changes free shipping in TypeScript, C#, and Python with one Thunder change, and nobody edits
those files. Thunder finds the copies, changes only their characters, reads each file again, runs each part's tests,
and records the change in a passport.

**It is not true for a change of shape.** The duplicate-charge fix adds an input (the idempotency key) and threads it
from the page through orders to billing. That was written by hand in each language, and Thunder **read**, **linked**,
**reviewed**, and **scoped** it. Writing a new input, a new field, or a new call between services from one Thunder
change is not built.

**Copies Thunder does not find are not changed.** Code that computes the same rule in a different shape (a constant
named elsewhere, a lookup table, a rule split across two functions) is not recognised as the same rule. A rule with
the same shape but other names or another limit is listed as "check by hand", never changed.
