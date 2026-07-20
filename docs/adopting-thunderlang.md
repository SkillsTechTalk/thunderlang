# Adopting ThunderLang on an Existing Codebase

You do not start with intent. You start with a codebase , thousands of lines that already do
something, whose original intent lives in people's heads, commit messages, and tickets. The way
to adopt ThunderLang is not to stop and write intent for everything. It is to **lift what you
have, review it honestly, and gate the parts that matter** , one mission at a time.

Everything here is deterministic (no AI) and works from source today; the published package is
[`@skillstech/thunderlang`](https://www.npmjs.com/package/@skillstech/thunderlang).

## 1. Lift code into an inferred draft

Point IntentLift at a file. It reads the functions, tests, and error types and writes a
**humble** `.thunder` draft , source-mapped, with evidence and confidence, and marked as needing
review. It covers the top languages (TypeScript, JavaScript, Python, Java, C#, Go, Rust, C++,
PHP, Ruby, Perl):

```bash
thunder lift src/billing/invoice.ts
# -> writes .thunder/createinvoice.thunder
#    [warning] INTENT_LIFT_NEEDS_HUMAN_REVIEW: a human must review goal, never rules, verification
#    [warning] INTENT_LIFT_NO_TEST_EVIDENCE: no tests found to ground guarantees
```

The draft never claims to be verified. It is a starting point that says what it *inferred* and
what it *could not*:

```
mission CreateInvoice
use product

input
  orderId: OrderId
  total: Money
  key: IdempotencyKey

guarantee a duplicate invoice is not created
```

## 2. Review and own it

This is the important step, and it is a human's. The lifted draft is a proposal; you make it a
commitment. Add the goal in your words, the guarantees you actually stand behind, the things
that must **never** happen, and how each is **verified**:

```
mission CreateInvoice
use product

goal
  Create exactly one invoice for an approved order.

guarantee a duplicate invoice is not created
  because double-billing a customer is a trust-breaking error
  verify idempotency test on orderId

never expose the payment token in logs
  verify a secret-scan of log output
```

ThunderLang keeps you honest about the difference between "inferred" and "decided" , the
[classification model](/docs/intent-graph) means an assumption is never silently treated as a
fact.

## 3. Check it

`thunder check` runs the deterministic [diagnostics](/docs/diagnostics) , the mistakes that slip
past code review: a guarantee with no verification, a secret on an event payload, a
duplicate-prevention promise with no idempotency key, a contradiction between constraints.

```bash
thunder check intent/CreateInvoice.thunder
```

Errors fail; warnings inform. Fix what matters, waive what you have governed, move on.

## 4. See the whole picture

Once you have lifted a handful of missions, `thunder report` gives the health of your intent as a
whole , not pass/fail, but a dashboard for triage:

```bash
thunder report intent/
# thunder report intent/: 12 mission(s) in 12 file(s), 40 diagnostic(s)
#   severity   0 blocker, 0 error, 38 warning, 2 info
#   coverage   guarantees verified 22/31 (71%), missions with tests 5/12 (42%)
#   top codes  guarantee-without-verification (9), missing-goal (2)
```

That coverage line is the adoption metric: how much of your intent is actually grounded in
verification and tests. Pass `--json` to feed it to a dashboard.

## 5. Gate it in CI

`thunder check` is dependency-free and exits non-zero on any error, so it drops straight into CI
to keep a broken intent from merging , and `--format sarif` puts the diagnostics in GitHub /
GitLab code scanning as inline annotations:

```bash
thunder check intent/ --format sarif > intent.sarif   # upload to code scanning
thunder check intent/                                  # the gate (fails on errors)
```

The published [GitHub Action](/docs/compiler-contract) makes it three lines.

## 6. Keep code and intent in sync

Intent is only worth having if it stays true. Approve a mission to set a baseline, then let
`thunder drift` tell you when the code and the intent have diverged:

```bash
thunder approve intent/CreateInvoice.thunder --by you@team.com
thunder drift src/billing/invoice.ts --intent intent/CreateInvoice.thunder
# -> IN_SYNC, or the specific guarantees/inputs that no longer match
```

This is the loop that makes intent durable: code changes, drift surfaces it, a human reconciles
the intent or the code.

## The shape of adoption

You do not need a big-bang rewrite. Adopt ThunderLang the way it is meant to be adopted:

1. **Lift** the mission you care about most from the code you already have.
2. **Review** it into a real commitment , goal, guarantees, never rules, verification.
3. **Check** it, and **gate** it in CI.
4. **Report** across everything you have lifted to see coverage grow.
5. **Approve** and watch for **drift** so it stays honest.

Then do it again for the next mission. Intent becomes a durable layer over the code you already
have , not a rewrite, a lens.
