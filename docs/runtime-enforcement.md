# Runtime Enforcement

Intent that only lives in a `.thunder` file is advisory , a good intention a diff can quietly
break. Intent that **runs** is load-bearing: it blocks the forbidden action when the software
actually executes. `compileGuard` turns an intent into exactly that , a guard you drop into your
application. Deterministic, no AI, and browser-safe (`@skillstech/thunderlang/core`), so the same
guard runs in a Node service or a browser app.

Two things an intent declares are deterministically enforceable at runtime, and the guard
compiles both.

## Secrets never leak

Every field the intent declares secret , a `Secret` / `Password` / `Token` type, a `pii` /
`sensitive` [data element](/docs/data-privacy), or a secret-looking name , the guard will mask.
Wrap a logger or a response with `redact` and the secret cannot reach it:

```js
import { compileGuard } from "@skillstech/thunderlang/core";

const guard = compileGuard(intentSource);

logger.info("charging", guard.redact({ amount, paymentToken }));
// -> { amount: 50, paymentToken: "[redacted]" }   (deeply, through nested objects and arrays)
```

That is the never-rule "never expose the payment token in logs" enforced , not hoped.

## Decisions become a hard gate

A [decision](/docs/intent-graph) is already executable; the guard makes it a production gate.
`assertAllowed` runs the declared rules and **throws** if the intent denies the action:

```js
try {
  guard.assertAllowed("RefundDecision", { amount, approved });
  await issueRefund();
} catch (e) {
  if (e.code === "INTENT_GUARD_DENIED") return reject(e.result); // the intent said no
  throw e;
}
```

The intent's rules , not a comment, not a code review , decide at runtime. By default the guard
treats results like `Deny`, `Blocked`, `Refuse`, `Reject`, `Escalate`, `NeedsReview` as a block;
pass `denyResults` to state the blocking results explicitly:

```js
compileGuard(intentSource, { denyResults: ["Deny", "NeedsReview"] });
```

## Preview what a guard enforces

`thunder guard <file>` shows what the compiled guard would do , which fields it redacts and which
decisions it gates , so it can be reviewed and audited before it ships:

```bash
thunder guard Refund.thunder
#   redacts fields   paymentToken, ssn
#   enforces decisions RefundDecision
```

## Honest scope

The guard enforces what is *structurally* enforceable: the secrets the intent declares, and the
decisions the intent makes executable. It does not turn a free-text never-rule into a runtime
check on its own , that still needs the rule expressed as a decision or a typed field. What it
gives you is the part that *can* be made load-bearing, made load-bearing , so the highest-cost
mistakes (a leaked secret, a forbidden action) are blocked by the intent itself, in production.
