# Testing and verification

Testing is a first-class part of ThunderLang, not something delegated entirely to Jest, PyTest, or JUnit.

> **ThunderLang tests prove that an implementation matches intent.**

A traditional test asks "does this code produce the expected result?" ThunderLang additionally asks: does the behavior match the declared goal, are all guarantees enforced, are prohibited behaviors impossible, does every target behave consistently, did an AI change introduce drift, and what evidence proves the change is safe.

The public promise:

> **Write the requirement once. Run it as a test. Prove every implementation still matches.**

---

## What works today

The deterministic compiler already ships a real, tested slice of this. All of the following run offline with no AI:

| Command | What it does |
|---|---|
| `thunder test <file>` | Runs example and decision tests (`test` / `case` / `given` / `expect`) through the deterministic interpreter, before any target code exists. `--json` for machine output. |
| `thunder test <file> --contracts` | Derives one obligation from every `guarantee` and `never`, mapped to the *specific* test that verifies it: **PASS** (proven by a named passing test), **FAIL** (its test fails), **DECLARED** (a verification is named or classified but runs in target mode, not in-file), **UNVERIFIED** (nothing verifies it). Add `--strict` to fail the run on any UNVERIFIED obligation (CI gate: nothing left unproven). |
| `thunder coverage <file>` | Reports how many declared claims carry a verification. |
| `thunder prove <file>` | Runs the tests, evaluates every `guarantee` and `never` as an obligation, and emits a durable `intent-proof-v1` artifact. Unverified claims are reported as **UNVERIFIED**, never as passed. `--json` for the raw proof. |
| `thunder verify <proof.json> <source>` | Re-checks a proof against its source (hash + claims) to detect tampering or drift. |

Example, honest by construction:

```text
$ thunder prove CreateInvoice.thunder
Proof created: proof-176a82

  Intent:        CreateInvoice
  Intent hash:   sha256:176a82...
  Compiler:      ThunderLang 0.1.x
  Syntax:        PASS
  Semantics:     PASS
  Guarantees:    3/3 carry a verification
  Prohibitions:  1/2 carry a verification  (1 UNVERIFIED)
  Proof status:  DRAFT  (has unverified claims)

  UNVERIFIED (this is where drift hides):
    - never create-invoice-for-unapproved-order: create invoice for unapproved order
```

The rest of this document is the design ThunderLang is being built toward. It is a roadmap, not a claim of current capability.

---

## The four test types

### 1. Example tests

Specific inputs, expected outputs. Runnable through the interpreter today.

```thunder
test CanEnroll
  case qualified adult
    given
      age: 20
      score: 90
    expect
      result == Eligible
      matchedRule == qualifiedAdult
```

### 2. Contract tests

Every `guarantee` and `never` is a test obligation. Developers should not rewrite each declared guarantee as a conventional test; the compiler derives it. This is one of ThunderLang's biggest differentiators.

### 3. Property tests

Example tests cover known cases; property tests explore many generated cases and shrink to the smallest reproducible failure. Supported today for decisions via `thunder test <file> --properties [--cases N] [--seed S]`:

```thunder
property AdultsWithHighScoreAreEligible
  forAll
    age: Integer where age >= 18 and age <= 60
    score: Integer where score >= 70 and score <= 100
  decide CanEnroll
  expect
    result == Eligible
```

```text
$ thunder test enroll.thunder --properties
  PASS  AdultsWithHighScoreAreEligible  (100 cases, seed 424242)
  FAIL  EveryoneEligible  (seed 424242)
        smallest failure: age=0, score=0  ->  result == Eligible (got NotEligible)
```

Generation is seeded (reproducible), and failures binary-shrink each input toward its bound.

### 4. Scenario tests

Workflows across components (`given` / `when` / `then` / `never`), the ThunderLang equivalent of acceptance and behavior testing, connected to the canonical Intent Graph. `thunder test <file> --scenarios` checks each scenario deterministically for self-contradiction (an outcome listed under both `then` and `never` **FAILS**); otherwise it is **DECLARED**, structurally valid but needing runtime evidence (which OpenThunder supplies).

```text
$ thunder test checkout.thunder --scenarios
  DECLARED  CustomerCompletesPurchase  (2 given, 2 then, 1 never)
  FAIL      BrokenSpec , contradiction: "charge customer twice" both expected and prohibited
```

---

## Two execution modes

- **Semantic mode** (`--mode semantic`): run decisions, rules, and contracts through ThunderLang's own deterministic interpreter. Answers "does the declared intent behave correctly?" No implementation required.
- **Target mode** (`--target typescript|python|...`): run the same tests against generated or hand-written implementations. Answers "does the actual implementation conform to the declared intent?" `--all-targets` compares every target side by side, so a Python implementation that violates a contract is visible immediately.

---

## Verification is not one thing

Not every guarantee is a simple assertion. ThunderLang classifies how a claim is verified. The classified `verify by <kind>` form is supported today, and the kind flows through to `thunder prove` and `thunder test --contracts`:

| Type | Used for |
|---|---|
| Assertion | Inputs, outputs, rules, state |
| Static analysis | Types, dependencies, architecture, security |
| Runtime evidence | Logs, events, traces, database effects |
| External attestation | Scanner, CI system, deployment platform |
| Human approval | Architecture, legal, compliance, product judgment |
| Formal proof | Properties that can be mathematically established |

```thunder
guarantee EveryInvoiceIsAuditable
  verify by evidence
    database contains AuditRecord
    emitted InvoiceCreated
```

## Honest verification states

`PASS` `FAIL` `UNVERIFIED` `INCONCLUSIVE` `STALE` `BLOCKED` `NOT_APPLICABLE`

**UNVERIFIED must never silently become PASS.** (`thunder prove` already enforces this: a `guarantee` or `never` with nothing attached is reported UNVERIFIED and never counted as proven.) Honesty about what is not yet proven is a core trust advantage.

## Stable identities

Goals, requirements, guarantees, prohibitions, scenarios, and tests need stable IDs so semantic diffs, traceability, and proof survive renames and moved files.

An explicit `id` on a guarantee or `never` rule is supported today and flows through to the proof; without one, the compiler falls back to a slug of the statement.

```thunder
guarantee total is never negative
  id INV-G-001
  verify total test

never expose payment token in logs
  id INV-N-004
```

## Proof freshness

A proof is valid only for a specific combination of intent, implementation, dependencies, and environment. When any of those change, the proof becomes `STALE` and must never keep displaying an old green status.

This is supported today. `thunder prove` records a freshness tuple (intent hash, compiler version, git commit, dependency-lockfile hash, environment), and `thunder verify` recomputes it: if the intent still matches but the implementation, dependencies, or compiler moved, the proof reads **STALE** (exit 1) with the reason, rather than a false green.

```text
$ thunder verify CreateInvoice.thunder-proof.json CreateInvoice.thunder
thunder verify CreateInvoice.thunder-proof.json: STALE (source CreateInvoice.thunder)
  ! proof is STALE , the intent still matches, but the world moved since it was generated:
      implementation moved: proof at 0000000, now 3f08713
    regenerate: thunder prove CreateInvoice.thunder
```

## Independent verification

The same agent must not write the feature, write the tests, claim they passed, approve the result, and generate the proof.

> **The agent may author the test. OpenThunder and ThunderLang determine whether it passed.**

```text
Agent proposes implementation
  -> ThunderLang compiler evaluates semantics
  -> independent test runner executes tests
  -> OpenThunder observes commands and repo state
  -> policy engine evaluates evidence
  -> human or automated gate approves
  -> proof record is created
```

## AI evaluations

AI behavior is probabilistic, so it is graded, not asserted. An `evaluation` declares a dataset and metric thresholds; `thunder test <file> --evals` reports each as **DECLARED** (the bar, awaiting results) and, given measured metrics via `--results`, grades them **PASS/FAIL**. `--strict` fails the run on any still-declared evaluation.

```thunder
evaluation SupportAgentSafety
  dataset support-safety-v3
  require
    prohibitedDisclosureRate == 0
    escalationRecall >= 0.95
    groundedAnswerRate >= 0.90
```

```text
$ thunder test agent.thunder --evals --results metrics.json
  FAIL      SupportAgentSafety  (dataset support-safety-v3)
    ✓ prohibitedDisclosureRate == 0     (0)
    ✓ escalationRecall >= 0.95          (0.97)
    ✗ groundedAnswerRate >= 0.90        (0.88)
```

ThunderLang declares the bar; you run the eval and feed the numbers; the engine gates. It never pretends an AI result is deterministic.

## Semantic coverage

Line coverage is not enough. ThunderLang tracks goal, requirement, rule, guarantee, prohibition, scenario, target, trace, and change coverage, so "12 of 15 prohibitions challenged" is meaningful in a way "82% line coverage" is not.

`thunder test <file> --coverage` reports the meaning-level metrics today, including decision-rule coverage (which rules a test actually matched). `--strict` fails on any gap.

```text
$ thunder test grade.thunder --coverage
thunder test grade.thunder --coverage: 38% overall

  Goals                1/1   100%
  Decision rules       1/2    50%
  Guarantees           1/2    50%
  Prohibitions         0/1     0%
  Targets tested       0/2     0%

  Unverified:
    - rule Grade/b , never matched by a test
    - guarantee score-is-never-negative , no verification
    - never expose-raw-score , not challenged
```

---

## Conformance across targets

`thunder conform <file> [--targets ts,py] [--results <json>]` runs the same test cases against every implementation target. The deterministic engine defines the canonical result each case must produce; target outputs fed via `--results` are graded against it, and any divergence is a **CONFORMANCE FAILURE**. ThunderLang can't execute generated TypeScript or Python itself, so it defines the contract and grades the outputs your target runners produce, honestly.

```text
$ thunder conform CreateInvoice.thunder --results targets.json
                     Semantic  Typescript  Python
  CanEnroll / adult  PASS      PASS        PASS
  CanEnroll / minor  PASS      PASS        FAIL

  CONFORMANCE FAILURE
    Target:   Python
    Case:     CanEnroll / minor
    Expected: NotEligible
    Actual:   Eligible
```

Without `--results`, targets show as declared (the contract, awaiting each target's outputs).

For the TypeScript/JS target, ThunderLang can execute the generated code itself: `thunder test <file> --target typescript` runs the tests against the executed generated decision (proving the codegen is faithful to the intent), and `thunder conform <file> --run typescript` fills the TypeScript column from that live run instead of fed results.

```text
$ thunder test enroll.thunder --target typescript
thunder test enroll.thunder --target typescript: 2/2 passed (executed generated code)
```

## Change-impact selection

`thunder test --changed [<range>]` is supported today. It does not merely inspect modified files: it uses the Intent Graph to select the changed intents plus any intent that shares an event, service, or API symbol with a changed one, then runs their tests. A change to a producer selects its consumers, even though their files were untouched.

```text
$ thunder test --changed
thunder test --changed HEAD..working-tree: 1 changed, 2 intent(s) selected
  PASS   CreateInvoice.thunder         [changed]
  PASS   portal/CreateInvoice.thunder  [impacted via system CreateInvoice]
```

Future selection will also follow the call graph, data dependencies, and historical failure patterns.

## Build order

**Build first (toward 1.0):** stable IDs; deterministic decision execution *(done)*; example tests *(done)*; automatic guarantee/`never` obligations *(partial, surfaced by `prove`)*; fixtures; PASS/FAIL/UNVERIFIED/STALE states *(partial)*; JSON evidence output *(done for `prove`/`test`)*; TypeScript target adapter; intent coverage *(partial)*; OpenThunder Change Ledger integration; proof invalidation on change; a reference conformance suite.

**Build next:** state/event assertions; Python and C# adapters; security and privacy policies; AI evaluations. *(Scenario tests, property-based testing, change-impact selection, and mutation testing already ship , see below.)*

### Mutation testing

`thunder test <file> --mutate [--strict]` injects small faults into a decision's rules (flip a comparison, `and`->`or`, return the default, remove a rule) and re-runs the tests. A mutant no test detects **survives** and is reported as a weak spot; the mutation score is `killed / total`. This catches tests that pass but do not actually protect the system, the classic failure mode of AI-authored tests. `--strict` fails the run when any mutant survives.

```text
$ thunder test grade.thunder --mutate
thunder test grade.thunder --mutate: mutation score 50%  (3 killed, 3 survived of 6)
  survived , the tests did not catch these (weak spots):
    - flip >= in b of Grade
    - b returns the default instead of B
    - remove b from Grade
```

**Defer:** full formal theorem proving; every implementation target; distributed model checking; production runtime enforcement; a hosted test cloud; enterprise approval workflows.

---

## The architecture this serves

```text
Prompt
  -> ThunderLang intent
  -> contracts and test obligations
  -> implementation
  -> independent execution and observation
  -> OpenThunder Change Ledger
  -> verification evidence
  -> fresh or stale proof
```

> **ThunderLang defines the intent. ThunderLang tests the intent. OpenThunder verifies the implementation and preserves the proof.**

That is what turns **"Define it. Build it. Prove it."** from a tagline into an enforceable engineering system.
