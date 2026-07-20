# ThunderLang Syntax Overview

> A tour of the language. ThunderLang has a deterministic reference compiler
> (`@skillstech/thunderlang`, the `thunder` CLI; `intent` is a legacy alias) that implements everything here, with no
> AI required. For the exhaustive grammar and every keyword, see the
> [language specification](/docs/spec); this page is the friendly overview.

ThunderLang files use the `.thunder` extension and are UTF-8 text.

## Style

Keywords are **lowercase** and introduce a block on their own line; the block's contents
are indented (two spaces is canonical). Indentation defines structure.

- Comments start with `#`.
- Entity and type identifiers are `PascalCase` (`Customer`, `Invoice`, `Email`).
- Lists are one item per line, indented under a block.
- `name: Type` declares a typed field.

## Profiles

A small shared core plus optional profiles keeps the language coherent without forcing
every role to learn everything. Declare the profiles a file uses:

```
use product
use experience
use system
use delivery
use design
```

The five profiles: **product** (outcome, metric, evidence, persona), **experience**
(experience contracts, states, patterns, design), **system** (capability, interface),
**delivery** (release, result, learning, outcome contracts), and the **core** everything
shares (mission, guarantee, never, requires, verify).

## The core mission

```
mission CreateInvoice

goal
  Generate an invoice from approved orders

why
  Customers need accurate, auditable invoices that are never duplicated.

input
  customer: Customer
  orders: List<Order>
output
  invoice: Invoice

guarantees
  invoice.total is never negative
  duplicate invoices are not created

never
  create invoice for an unapproved order
  expose payment token in logs

verify
  duplicate prevention test
  audit trail test
```

## Rationale: why / because

Rationale captures judgment, not just shape. Attach it to a guarantee or a `never` rule
(the attached form also carries `verify`):

```
guarantee duplicate invoices are not created
  because duplicate billing damages customer trust
  verify duplicate prevention test
```

## Three layers of precision

The same mission can be written at three levels.

**Layer 1, Human Intent** (readable):

```
mission ResetPassword
goal
  Let a user securely reset their password
guarantees
  token expires after 15 minutes
  token can only be used once
  password is never logged
```

**Layer 2, Typed Intent** (semantic types + constraints):

```
mission ResetPassword
input
  email: Email
  token: ResetToken
  newPassword: Secret
constraints
  token.ttl <= 15 minutes
  password.minLength >= 12
never
  log the new password
```

**Layer 3, Executable Intent** (target + verification):

```
mission ResetPassword
target
  DotNet
verify
  test token expiration
  test one time use
  test raw password not logged
```

## Decisions (executable)

A `decision` is a runnable specification: give it inputs and it decides, first matching
rule wins, with `default` as the catch-all.

```
decision CanEnroll
  inputs
    age
    score
  rule adult
    when age >= 18 and score >= 70
    return Eligible
  default
    return NotEligible
```

`thunder run mission.thunder --inputs '{"age":20,"score":90}'` evaluates it and prints the
result plus a per-rule trace, no AI, no generated code.

## Lifecycles, commands, and failures

```
lifecycle Enrollment
  state Draft
  state Submitted
  state Approved
  transition submit
    from Draft
    to Submitted
  terminal Approved

command ChargeCard
  idempotency_key paymentId
  timeout 30 seconds
on ChargeFailed
  compensate refund
```

`thunder simulate mission.thunder --events submit,approve` walks the lifecycle and rejects
any illegal transition.

## Outcome contracts

Bind an outcome to a target so it can be judged met or missed:

```
outcome_contract FasterCheckout
  outcome CheckoutConversion
  metric conversion_rate
  baseline 48%
  target 60%
  window 30 days after release
```

## Tests (first-class)

Tests live in the file, next to the intent they verify, and run through the same
deterministic runtime with `thunder test`:

```
test CanEnroll                 # a decision
  case adult
    given age 20, score 90
    expect Eligible
  case minor
    given age 10
    expect NotEligible

test Enrollment                # a lifecycle
  scenario happy
    events submit, approve
    expect Approved
    valid
```

## Semantic types

Prefer semantic types over primitives, so tools reason about meaning, not just shape:
`Email`, `Money`, `Secret`, `Token`, `Duration`, `Percentage`, `IdempotencyKey`,
`Version`, and more. Container types use angle brackets: `List<Order>`.

## Security modifiers

Security is first-class. `Secret`, `PII`, `Encrypted`, `NeverLog`, `NeverReturn`,
`AuditRequired`, `RequiresPermission`, `Redacted`, and others let the compiler and
OpenThunder enforce handling (a `Secret` field is expected to carry `never log` /
`never return` behavior).

## Governance and data

A `waiver` records a governed exception to a blocking diagnostic (with an approver and an
expiry); a `data` block declares a piece of data's classification, purpose, retention,
and lawful basis. See [Governance](/docs/governance) and
[Data privacy](/docs/data-privacy).

## The CLI

`thunder check` (diagnostics), `build` (docs, graph, test plan, proof), `run` /
`simulate` / `test` / `outcomes` (execute), `export` / `import` (DMN/BPMN), `graph` /
`source` / `migrate` (the Intent Graph), `atlas` / `diff` / `merge`, `lift` (code ->
intent), `drift` (intent vs code). Start with `thunder check` and the
[tutorial](/docs/tutorial).
