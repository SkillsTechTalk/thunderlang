# Tests as a First-Class Construct

A specification you cannot run is a hope. A specification you can run but never check is
a liability. ThunderLang makes the third thing possible: **tests live in the language**,
next to the intent they verify, and `thunder test` runs them through the deterministic
[Intent Runtime](/docs/intent-runtime). No AI, no generated code. The spec proves
itself.

## Cases for decisions

A `test` block targets a decision by name. Each `case` supplies inputs with `given` and
asserts the result with `expect`:

```
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

test CanEnroll
  case adult high
    given age 20, score 90
    expect Eligible
  case adult low
    given age 20, score 50
    expect Provisional
  case minor
    given age 10
    expect NotEligible
```

```
intent test eligibility.thunder
  intent test eligibility.thunder: 3/3 passed
    PASS  CanEnroll / adult high
    PASS  CanEnroll / adult low
    PASS  CanEnroll / minor
```

`given` values are coerced the obvious way: `20` is a number, `true` is a boolean,
everything else is a string. A failing case exits non-zero and names the gap:

```
    FAIL  CanEnroll / edge  , expected Provisional, got NotEligible
```

## Scenarios for lifecycles

The same block tests a lifecycle. A `scenario` walks a sequence of `events` and asserts
the final state and/or whether the walk was legal:

```
test Enrollment
  scenario happy path
    events submit, approve
    expect Approved
    valid
  scenario cannot skip
    events approve
    invalid
```

`valid` / `invalid` assert that every event was (or was not) a legal transition;
`expect <state>` asserts where the machine ended. So you can prove both that the happy
path reaches the right place and that an illegal path is actually rejected.

## Why tests belong in the intent

Because the runtime is deterministic, these tests are not approximations of behavior,
they are the behavior. They make three things true at once:

- **The intent is verified.** A decision with passing cases is a decision whose logic
  is demonstrated, not merely described.
- **Regressions are caught for free.** Change a rule and the cases re-run; if the
  meaning drifted, a case goes red, with no separate test harness to maintain.
- **Anyone can author them.** A product manager writes the cases in the same file as
  the decision, in the same plain vocabulary, and runs them. No code, no framework.

Drop `thunder test ./intent` into CI next to `thunder check`, and every `.thunder` file
that carries `test` blocks becomes self-verifying on every commit.

## The surface

- CLI: `thunder test <file>` (add `--json` for machine output). Exit code is `0` when
  every case passes, `1` otherwise.
- Library (`@skillstech/thunderlang`, schema `intent-test-v1`): `runTests(ast)` returns
  the full pass/fail report.
