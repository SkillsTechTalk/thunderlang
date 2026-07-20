# ThunderLang Language Specification (draft v0.2)

> Status: draft, but no longer hypothetical. A deterministic reference compiler
> (`@skillstech/thunderlang`) implements everything in this document, with an extensive
> test suite. The language and its `intent-graph-v1` schema are versioned independently;
> both are pre-1.0, so constructs may still change. This spec is descriptive of the
> shipped compiler; where the two disagree, the compiler is the source of truth.

ThunderLang is an intent-oriented language: you declare *what* a system must be true of,
in a form that is human-readable, deterministically compilable (no AI required), and,
for decisions, lifecycles, and outcomes, directly executable. A mission compiles to the
canonical **Intent Graph** (`intent-graph-v1`) plus role-aware diagnostics, docs, a
contract graph, a test plan, and a proof artifact.

## 1. Files

- Source files use the `.thunder` extension and are UTF-8 text.
- A file contains one or more top-level declarations (section 4).
- Compilation is deterministic and pure: the same source always yields the same graph,
  diagnostics, and artifacts, with no network, filesystem, clock, or AI dependency.

## 2. Lexical rules

### 2.1 Comments
A comment starts with `#` and runs to end of line. There are no block comments.

```
mission CreateInvoice   # trailing comment
```

### 2.2 Indentation
ThunderLang is indentation-structured. A block keyword sits at one indentation level; its
contents are indented further (two spaces is canonical). Indentation defines block
membership. Use spaces; tabs are discouraged.

### 2.3 Lines, arguments, and children
Every non-blank line is `keyword [argument]`, optionally followed by an indented block of
child lines. Three child shapes recur:

- **List children** , one value per line (e.g. the items under `guarantees`).
- **Key/value children** , `key value` pairs (e.g. `baseline 48%` under `metric`).
- **Typed fields** , `name: Type` (under `input` / `output`).

### 2.4 Identifiers and names
- Entity/type identifiers are `PascalCase`: `Customer`, `Invoice`, `Email`.
- Field names are `camelCase`: `idempotencyKey`.
- Block keywords are lowercase (section 3). A block argument (a mission/decision/outcome
  name) is free text; it is slugified for its node id.

### 2.5 Strings and free text
Most block bodies are free-text lines, one statement per line. Double quotes are used
when a value should be captured verbatim (e.g. `problem "..."`, `target 60%` needs no
quotes but `description "a, b, c"` does). A leading/trailing quote pair is stripped.

## 3. Keywords

Every top-level block keyword the compiler recognizes:

```
always, api, approval, architecture, artifact, assumption, assumptions,
capability, command, component, confidence, conflict, constraints, customer,
data, database, decision, errors, event, eventually, evidence, examples,
experience, for, goal, guarantee, guarantees, implement, input, interface,
learning, lifecycle, metric, mission, never, non_goal, note, on, outcome,
outcome_contract, output, owner, pattern, persona, problem, question, release,
requires, result, risks, scope, selection, service, source, style, target,
test, title, unknown, until, use, verify, waiver, why
```

An unrecognized top-level keyword is an `info` diagnostic (`unknown-block`), not an
error, so files remain forward-compatible.

## 4. Profiles

A small shared **core** plus optional **profiles** keeps the language coherent without
forcing every role to learn everything. Declare the profiles a file uses:

```
use product
use experience
use system
use delivery
use design
```

The five profiles: **product** (opportunity, outcome, metric, scope, persona,
evidence), **experience** (experience contracts, journeys, states, patterns, design),
**system** (capability, interface), **delivery** (release, result, learning, outcome
contracts), and the **core** everything shares (mission, guarantee, never, requires,
verify, ...). `use` is advisory metadata; the compiler parses any construct regardless.

## 5. Core: the mission

`mission <Name>` is the unit of intent. Core blocks:

- `goal` , the outcome the mission exists to achieve (one or more lines).
- `why` / `because` , rationale.
- `requires` , preconditions, one per line.
- `input` / `output` , typed fields (`name: Type`), with indented modifiers.
- `guarantees` , properties that must always hold (list), or the attached `guarantee`
  form (5.1).
- `never` , forbidden behaviors, one per line.
- `constraints` , bounds (e.g. `token.ttl <= 15 minutes`).
- `assumptions`, `risks` , declared context.
- `verify` , the checks that establish the guarantees.
- `target`, `style`, `implementation` , generation hints.
- `owner`, `title`, `for` (actor), `note` (an ThunderLens annotation).

### 5.1 Attached guarantee / never
`guarantee` and `never` items may carry `because` and `verify`:

```
guarantee duplicate invoices are not created
  because duplicate billing damages customer trust
  verify duplicate prevention test
```

## 6. Product profile

```
use product
mission CertificationStudyPlan
title "Turn certification notes into a study plan"
for Learner

problem "Learners cannot organize study material into a plan."

evidence UserInterviews
  classification observed
  confidence high

outcome FasterStudyPlanCreation
  "Learners receive a useful study plan within five minutes."
metric PlanCreatedWithinFiveMinutes
  baseline 42 percent
  target 80 percent
  window 30 days after release

persona BusyLearner
customer EnterpriseAdmin
scope
  include study plan generation
  exclude payment
non_goal "replace human tutoring"
```

Emits `Outcome`, `Metric` (`Mission -measured_by-> Metric`), `Evidence`, `Persona`,
`Actor`. A metric with no `window` is `IL-PM-001` (blocks `release`). (`Opportunity` is a
canonical node type reserved for tooling that infers opportunities; it has no source
keyword.)

## 7. Classification and evidence

Every fact-like node carries a classification from the fixed set:

```
observed, inferred, proposed, assumed, unknown, decided, verified
```

Only `observed`, `decided`, and `verified` are **factual** (`isFactual`). This is how
AI-supplied or assumed content never silently becomes fact. `unknown`, `question`, and
`assumption` declarations are first-class:

```
unknown PricingModel
  owner Product
  resolve before pricing
question ShouldWeChargePerSeat
  asked_of Finance
  blocks pricing
assumption UsersHaveEmail
  confidence medium
```

An unresolved `unknown`/`question` that `blocks` a phase is a blocker for that phase
(`IL-GRAPH-010/011`).

## 8. Experience profile

```
use experience
experience UploadStudyMaterial
  actor Learner
  goal "upload notes and get them organized"
  state Uploading
  state Processing
  state Ready
  state Failed
    recover retry upload
pattern FormValidation
  requires inline errors
  accessible keyboard navigable
```

Emits `ExperienceContract`, `ExperienceState`, `Pattern`, `Journey`. A failure state
with no recovery path is `IL-EXP-004` (blocks `experience-approval`, `release`).

## 9. Design profile

```
use design
component AddressForm
  description "collects and validates a shipping address"
  variant default
  variant error
  token color.error
  implements AddressEntry        # an experience state or pattern
artifact CheckoutMockups
  kind figma
  ref "figma.com/file/abc"
  covers AddressForm
```

`component` -> `DesignComponent` (`Mission -requires->`); each `implements` resolves to
the experience state or pattern it realizes (`<target> -implemented_by-> component`).
`artifact` -> `DesignArtifact` (`ref` kept as `source`); each `covers` records
`DesignComponent -represented_by-> DesignArtifact`.

## 10. System profile

```
use system
capability Billing
  description "charge and invoice customers"
  implements ChargeCard          # a command or decision that realizes it
interface PaymentGateway
  provides charge
  requires idempotency_key
  slo "99.9% availability"
```

`capability` -> `Capability` (`Mission -requires->`); each `implements` links to the
command/decision via `implemented_by`. `interface` -> `SystemContract`.

## 11. Delivery profile

```
use delivery
release v1.2
  version "1.2.0"
  status planned
  date 2026-08-01
  includes CertificationAttempt
result Q3Conversion
  measures CheckoutConversion
  metric conversion_rate
  value 62%
  baseline 48%
learning AddressFriction
  description "users drop at address entry"
  from v1.2
```

Emits `Release` (`Mission -released_in->`), `OutcomeResult` (the measured `Outcome
-resulted_in-> OutcomeResult`), and `LearningArtifact` (`-derived_from->` its release).

## 12. Outcome contracts

An executable commitment binding an outcome to a target:

```
outcome_contract FasterCheckout
  outcome CheckoutConversion
  metric conversion_rate
  baseline 48%
  target 60%
  direction higher               # higher (default) | lower
  window 30 days after release
  owner GrowthPM
```

Emits `OutcomeContract` (`Mission -requires->`, `-targets-> Outcome`, `-measured_by->
Metric`). Evaluated against the delivery `result` measuring the same outcome:
met / missed / pending. Authoring checks `IL-OC-001..004`.

## 13. Decisions and rules

```
decision CertificationEligibility
  inputs
    age
    score
  rule adult
    when age >= 18 and score >= 70
    return Eligible
  default
    return NotEligible
  explanation required
  owner CertificationProduct
```

Emits `Decision` and `Rule` nodes. Static checks: `IL-DEC-001` missing default (blocker),
`IL-DEC-002` conflicting rules (blocker), `IL-DEC-003` redundant, `IL-DEC-004` no rules.
A decision is **executable** (section 18).

## 14. Lifecycles and temporal semantics

```
lifecycle Enrollment
  state Draft
  state Submitted
  state Approved
  transition submit
    from Draft
    to Submitted
    within 24 hours
  terminal Approved

always application is never lost
eventually application is decided
  within 48 hours
until payment confirmed
```

Emits `Lifecycle`, `LifecycleState`, and `transitions_to` edges (carrying `name` and
`within`). Static checks `IL-LIFE-001..004` (undefined-state reference, unreachable
state, dead-end, no initial). `eventually` with no bound is `IL-TEMP-001`. Lifecycles are
**executable** (section 18).

## 15. Distributed and failure semantics

```
command ChargeCard
  idempotency_key paymentId
  timeout 30 seconds
  retry 3 times
on ChargeFailed
  compensate refund
```

Emits `Command` and `FailureHandler`. Static checks `IL-DIST-001..005`
(retry-without-idempotency, no-timeout, at-least-once-without-dedup, missing
compensation, undeclared event).

## 16. Constraints, conflicts, and roles

Role-scoped constraints compose and are checked for contradictions. Each role
contributes independently via `<role> requires`:

```
security requires
  token.ttl <= 15 minutes
product requires
  token.ttl >= 60 minutes
conflict TokenLifetime
  resolution "security wins; ttl <= 15 minutes"
```

Role keywords: `product, experience, security, legal, operations, analytics,
engineering, accessibility, business, design, qa, ux`. A declared but unresolved
`conflict` is `IL-CONFLICT-001`; scope contradictions and direct contradictions are
`IL-CONFLICT-010/012`.

## 17. Governance, data privacy, and tests

### 17.1 Waivers (governance)
A governed exception to a blocking diagnostic:

```
waiver IL-PM-001
  reason "measurement window deferred to v2, tracked in JIRA-123"
  approved_by Head of Product
  scope mission.checkout
  expires 2026-12-31
```

Guarded by `IL-GOV-001..005` (missing code/reason/approver, dangling, expired).

### 17.2 Data purpose and privacy
```
data customer.ssn
  classification pii            # public | internal | confidential | pii | sensitive
  purpose "one-time identity verification"
  retention 30 days
  basis consent                 # a GDPR Art. 6 lawful basis
```

`pii`/`sensitive` data must state purpose, retention, and basis (`IL-DATA-001..006`).

### 17.3 Tests
Self-verifying blocks that run through the runtime:

```
test CertificationEligibility        # a decision
  case adult
    given age 20, score 90
    expect Eligible
test Enrollment                      # a lifecycle
  scenario happy
    events submit, approve
    expect Approved
    valid
```

## 18. Executable semantics

Decisions, lifecycles, and outcome contracts are not only declarative, they execute
deterministically with no AI:

- **Decisions** evaluate FIRST-hit: rules are tried in order, the first whose `when` is
  true wins, `default` is the catch-all.
- **Lifecycles** simulate against an event sequence, rejecting illegal or post-terminal
  transitions.
- **Outcome contracts** evaluate a measured result as met / missed.

### 18.1 Condition grammar (`when`)
Decision conditions are a small, safe, deterministic expression language (no `eval`).
Precedence low to high:

```
or      := and ( ('or' | '||') and )*
and     := not ( ('and' | '&&') not )*
not     := ('not' | '!') not | comparison
compare := add ( ('>=' | '<=' | '==' | '!=' | '=' | '>' | '<') add
               | 'in' '[' list ']' )?
add     := mul ( ('+' | '-') mul )*
mul     := unary ( ('*' | '/' | '%') unary )*
unary   := '-' unary | primary
primary := number | string | ('true'|'false') | ident('.'ident)*
         | '(' or ')' | '[' list ']'
```

Identifiers resolve against the inputs object (dotted paths supported). A bare
identifier that is not an input resolves to its own name, so `status == active` treats
`active` as the literal `"active"`. Numeric coercion applies to comparisons, so a string
input `"20"` compares numerically with `18`.

## 19. Semantic types

Prefer semantic types over primitives. Built-in vocabulary includes: `Email`, `Money`,
`Currency`, `Url`, `UserId`, `AccountId`, `Secret`, `Token`, `Jwt`, `Date`, `DateTime`,
`Duration`, `Percentage`, `IdempotencyKey`, `Version`, `EnvironmentName`, and others.
Container types use angle brackets: `List<Order>`.

## 20. Security modifiers

`Sensitive`, `Secret`, `Encrypted`, `Internal`, `Public`, `PII`, `AuditRequired`,
`RequiresPermission`, `NeverLog`, `NeverReturn`, `Redacted`. A `Secret` field is expected
to carry `never log` / `never return` behavior; OpenThunder verifies this downstream.

## 21. The Intent Graph (`intent-graph-v1`)

Compilation produces a canonical graph of typed nodes and directed, typed relationships.

- **Node types (39):** Mission, Actor, Persona, Evidence, Opportunity, Outcome, Metric,
  Requirement, Constraint, Guarantee, Never, Conflict, Journey, ExperienceContract,
  ExperienceState, Pattern, DesignArtifact, DesignComponent, Capability, SystemContract,
  ImplementationMapping, VerificationRule, VerificationResult, Approval, Release,
  OutcomeContract, OutcomeResult, LearningArtifact, Unknown, Assumption, Question,
  Lifecycle, LifecycleState, Temporal, Command, Event, FailureHandler, Decision, Rule.
- **Relationship types (20):** supported_by, derived_from, addresses, targets,
  measured_by, requires, constrained_by, implemented_by, represented_by, verified_by,
  approved_by, released_in, resulted_in, contradicts, supersedes, depends_on, blocks,
  teaches, generated_from, transitions_to.

This vocabulary is canonical and closed: the reference compiler only ever emits these
types (enforced by an anti-fork test), and consumers (OpenThunder, Repo Mastery,
SkillsTech Studio) build to it rather than forking it. `intentGraphJsonSchema()` emits a
draft-07 JSON Schema pinned to these enums.

## 22. Error model

Diagnostics carry a `level` (`error`, `warning`, `info`), a stable `code`, a `message`, a
`why`, optional `fix`, and role metadata. Two orthogonal ideas:

- **Validity** , `error` means an invalid program; `thunder check` fails on any error.
- **Phase gating** , `severity: 'blocker'` + `blocks: [phase]` mean a *valid* program is
  not yet ready to proceed to that phase (e.g. `release`). These surface as warnings so
  the file still compiles.

Diagnostic areas: product, evidence, graph, experience, conflict, governance, privacy,
outcome, and the lifecycle/distributed/decision families. The full catalog is
`DIAGNOSTIC_RULES`.

## 23. Tooling surface

The `thunder` CLI (`intent` is a legacy alias): `check`, `build`, `graph`, `proof`, `atlas`, `diff`, `merge`,
`export` (dmn|bpmn|smv), `import` (dmn|bpmn), `run`, `simulate`, `test`, `outcomes`,
`lift`, `approve`, `drift`, `index`, `schema`. The library
(`@skillstech/thunderlang`, and the browser-safe `@skillstech/thunderlang/core` subset)
exposes the same functions.

## 24. Versioning and determinism

The language and the `intent-graph-v1` schema version independently, both pre-1.0;
breaking changes bump the minor version below 1.0. Proof and graph artifacts carry a
schema version so consumers can adapt. Every compiler output is deterministic and pure,
which is what lets intent be diffed, merged, tested, and trusted.
