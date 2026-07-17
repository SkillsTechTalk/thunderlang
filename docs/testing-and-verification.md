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

Example tests cover known cases; property tests explore many generated cases and shrink to the smallest reproducible failure.

### 4. Scenario tests

Workflows across components (`given` / `when` / `then` / `never`), the ThunderLang equivalent of acceptance and behavior testing, but connected to the canonical Intent Graph.

---

## Two execution modes

- **Semantic mode** (`--mode semantic`): run decisions, rules, and contracts through ThunderLang's own deterministic interpreter. Answers "does the declared intent behave correctly?" No implementation required.
- **Target mode** (`--target typescript|python|...`): run the same tests against generated or hand-written implementations. Answers "does the actual implementation conform to the declared intent?" `--all-targets` compares every target side by side, so a Python implementation that violates a contract is visible immediately.

---

## Verification is not one thing

Not every guarantee is a simple assertion. ThunderLang classifies how a claim is verified:

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

## Semantic coverage

Line coverage is not enough. ThunderLang tracks goal, requirement, rule, guarantee, prohibition, scenario, target, trace, and change coverage, so "12 of 15 prohibitions challenged" is meaningful in a way "82% line coverage" is not.

---

## Build order

**Build first (toward 1.0):** stable IDs; deterministic decision execution *(done)*; example tests *(done)*; automatic guarantee/`never` obligations *(partial, surfaced by `prove`)*; fixtures; PASS/FAIL/UNVERIFIED/STALE states *(partial)*; JSON evidence output *(done for `prove`/`test`)*; TypeScript target adapter; intent coverage *(partial)*; OpenThunder Change Ledger integration; proof invalidation on change; a reference conformance suite.

**Build next:** scenario tests; state/event assertions; property-based testing; Python and C# adapters; mutation testing; change-impact selection via the Intent Graph; security and privacy policies; AI evaluations.

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
