# The Intent Runtime: executable intent

Prompt engineering asks a model to write code and hopes the result matches what you
meant. There is no durable record of the intent, no way to check the behavior except
by running the generated code, and every regeneration risks drift.

The Intent Runtime is the other path. Intent is not a wish handed to a model, it is a
**program that runs**. A decision evaluates against real inputs. A lifecycle simulates
against real events. You get the answer, and a full trace of how it was reached, with
**zero AI and zero code generation**. The intent itself is the executable, verifiable
artifact. That is what it means to move beyond prompt software engineering: the
behavior is decided by the intent, deterministically, before any implementation exists.

## Run a decision

A `decision` block is an executable specification. Give it inputs and it decides,
first-matching-rule wins, with the mission `default` as the catch-all:

```
mission Eligibility
decision CanEnroll
  inputs
    age
    score
  rule adult
    when age >= 18 and score >= 70
    return Eligible
  rule provisional
    when age >= 18
    return Provisional
  default
    return NotEligible
```

```
intent run eligibility.thunder --inputs '{"age": 20, "score": 90}'
  decision CanEnroll: Eligible  [rule: adult]
    x adult: when age >= 18 and score >= 70
    x provisional: when age >= 18
```

The trace shows every rule that was tried and why the winner won. A non-engineer can
write the decision, run it against a dozen cases, and confirm it is right, without
asking anyone to build anything.

### Conditions are a real, safe language

The `when` conditions are evaluated by a small deterministic expression engine, not by
`eval` and not by a model. It supports comparisons (`>= <= > < == !=`), boolean logic
(`and or not`, `&& || !`), membership (`region in [US, CA]`), arithmetic, dotted paths
(`candidate.age >= 18`), and bare enum tokens (`status == active`). The same condition
and inputs always produce the same result.

## Simulate a lifecycle

A `lifecycle` is a state machine you can walk. Give it a sequence of events and it
traces the path, rejecting any event that is not a legal transition from the current
state, and stopping cleanly at terminal states:

```
intent simulate enrollment.thunder --events submit,approve
  lifecycle Enrollment: Draft -> Submitted -> Approved  (valid, terminal)
    ok  Draft --submit--> Submitted
    ok  Submitted --approve--> Approved

intent simulate enrollment.thunder --events approve
  lifecycle Enrollment: Draft  (INVALID)
    X   Draft --approve--> Draft  (no transition "approve" from "Draft")
```

An invalid flow fails with a non-zero exit code, so a lifecycle becomes a checkable
contract in CI, not just a diagram.

## Decisions as self-checking specs

Because decisions execute, they can be regression-tested with no code. `checkDecisionCases`
runs a decision against a table of `{ inputs, expect }` cases and reports pass/fail:

```js
import { parseIntent, checkDecisionCases } from '@skillstech/thunderlang';
const dec = parseIntent(src).decisions[0];
checkDecisionCases(dec, [
  { inputs: { age: 20, score: 90 }, expect: 'Eligible' },
  { inputs: { age: 20, score: 50 }, expect: 'Provisional' },
  { inputs: { age: 10 },            expect: 'NotEligible' },
]);
// -> { total: 3, passed: 3, results: [...] }
```

## The surface

- CLI: `thunder run <file> --inputs '<json>' [--decision <name>]` and
  `thunder simulate <file> --events a,b,c`. Both support `--json` and set exit codes.
- Library (`@skillstech/thunderlang`, schema `intent-runtime-v1`): `evaluateDecision`,
  `simulateLifecycle`, `checkDecisionCases`, and the expression engine `compileExpr` /
  `evalExpr`.

Everything is deterministic and pure. The runtime does not call a model, touch the
network, or read the filesystem. It turns intent into something you can execute, test,
and trust, which is the whole point: durable intent, proven before code.
