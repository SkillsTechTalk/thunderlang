# Intent for every role

Intent is not only for engineers. The same canonical Intent serves Product Managers,
UX Designers, researchers, engineers, architects, QA, security, analytics, and business
stakeholders, through a representation appropriate to each. One source of truth, many
views, no drift.

> One intent. Every role. Verified execution.

This page documents the IntentLang-owned foundation (contract `intent-graph-v1`). The
lifecycle it supports:

> Evidence → Opportunity → Outcome → Requirement → Experience → Design → Contract →
> Implementation → Verification → Release → Result → Learning

## Five views of one model

The same canonical Intent is available as: an **Intent Canvas** (visual), an **Intent
Spec** (readable structured language), **Typed Intent** (strict types + diagnostics),
**Executable Intent** (validation, tests, contracts), and **Verified Proof**. They are
views of the same **Intent Graph** and must not become disconnected documents.

## Profiles

A small shared core with optional profiles keeps the language coherent without forcing
every role to learn everything. Declare the profiles a file uses:

```
use product
use experience
use assurance
```

Profiles extend the same AST and type system: `core` (mission, evidence, outcome,
guarantee, never, verify, ...), `product` (opportunity, outcome, metric, scope,
non_goal, ...), `experience` (journey, screen, state, accessibility, ...), `system`,
`assurance`, and `delivery`.

## Product Mission

A readable Product Mission, understandable without code:

```
use product
mission CertificationStudyPlan
title "Turn certification notes into a study plan"
for Learner

problem
  "Learners have study material but cannot organize it into a plan."

evidence UserInterviews
  classification observed
  confidence high

outcome FasterStudyPlanCreation
  "Learners receive a useful study plan within five minutes."

metric PlanCreatedWithinFiveMinutes
  baseline 42 percent
  target at_least 70 percent
  window 30 days after release

scope
  include PDFUpload
  exclude VideoUpload

unknown MaximumUploadSize
  owner Product
  resolve before Implementation

never
  expose PrivateStudyMaterial

approval required from
  Product
  UX
  Engineering
  Security
```

See `examples/CertificationStudyPlan.intent`.

## Experience Contract

UX behavior is a first-class contract, so a designer can define complete experience
behavior without writing implementation code:

```
use experience
experience UploadStudyMaterial
  actor Learner
  goal
    "Turn my notes into a study plan."

  journey HappyPath
    start at MaterialUpload
    when Upload completes
    show ProcessingStatus

  state Empty
    offer PasteText
  state UploadFailure
    preserve SelectedDocument
    offer Retry

  responsive
    support Mobile
    support Desktop
  accessible
    target WCAG_2_2_AA
    keyboard complete

  follows RecoverableUpload

pattern RecoverableUpload
  requires
    retry available
```

Each experience parses into typed journeys, states (with their recovery affordances),
responsive targets, accessibility requirements, and reusable patterns, and becomes
`ExperienceContract` / `Journey` / `ExperienceState` / `Pattern` nodes in the Intent
Graph. A failure state with no recovery path is a UX blocker (`IL-EXP-004`) that reads
per role. See `examples/UploadStudyMaterial.intent`. OpenThunder's Experience
Completeness Lens derives the required states from these declarations plus applied
patterns and policy.

## Constraints and conflicts

The reconciliation layer, and the point of the whole system: **every role declares what
must be true, independently, and Intent detects when they disagree.**

```
mission CertificationCheckout

product requires
  purchase_completion at_least 70 percent
experience requires
  guest_checkout available
security requires
  strong_authentication for HighRiskPurchase

conflict GuestCheckoutAuthentication
  between
    Experience.GuestCheckout
    Security.StrongAuthentication
  options
    authenticate after payment
    authenticate before payment
  resolve_by Product, UX, Security
  before ExperienceApproval
```

IntentLang composes role-scoped constraints **deterministically and order-independently**
and detects: author-declared conflicts, scope contradictions (an item both included and
excluded), redundant constraints (the same rule from two roles), and direct negations. An
unresolved conflict is a blocker (`IL-CONFLICT-001`) that names the **owners required to
resolve it**, the **phase it blocks**, and the **options** to choose from, rendered per
role. The conflict becomes a first-class `Conflict` node in the Intent Graph, with
`contradicts` edges to the constraints and `blocks` to the phase. An LLM never decides the
resolution: IntentLang surfaces the conflict, SkillsTech Studio runs the resolution
workspace, OpenThunder verifies the accepted resolution survives implementation, and Repo
Mastery teaches why the decision was made. See `examples/CertificationCheckout.intent`.

## Classification and evidence

Every evidence-backed statement carries a **classification**, so AI-generated content
never silently becomes observed fact:

| Classification | Meaning |
| --- | --- |
| `observed` | Directly supported by a source. |
| `inferred` | Derived from evidence, not explicitly stated. |
| `proposed` | A recommendation or possible solution. |
| `assumed` | Treated as true, but requires validation. |
| `unknown` | Required information, not yet resolved. |
| `decided` | A human-approved choice. |
| `verified` | Supported by deterministic verification evidence. |

Only `observed`, `decided`, and `verified` may be presented as established fact
(`isFactual`). Unknowns and questions can **block** a declared phase (product-approval,
ux-approval, implementation, verification, release) rather than being ordinary warnings.

## The Intent Graph

The canonical model is the **Intent Graph** (`buildIntentGraph`, schema
`intent-graph-v1`): typed nodes (Mission, Evidence, Outcome, Metric, Requirement,
Guarantee, Never, Unknown, Assumption, Question, Approval, ...) connected by typed
relationships (`supported_by`, `targets`, `measured_by`, `requires`, `constrained_by`,
`approved_by`, `blocks`, `depends_on`, `verified_by`, ...). Every node has a stable id,
type, status, owner, classification, and confidence. `intent build` emits it as
`intent-graph.json`. This is what OpenThunder, Repo Mastery, and SkillsTech Studio
consume; they do not re-parse `.intent`.

## Temporal and lifecycle

Behavior over time is first-class. Temporal primitives (`always`, `eventually ... within`,
`never A before B`, `until C restrict X from Y`) and a formal **lifecycle** state machine:

```
lifecycle CertificationAttempt
  state NotStarted
  state InProgress
  state Scored
  transition Start
    from NotStarted
    to InProgress
  transition Score
    from InProgress
    to Scored
    within 30 seconds
  terminal Scored

eventually
  Submitted becomes Scored
  within 30 seconds
```

IntentLang builds the formal IR (states, typed transitions, initial state, reachable
set) and statically checks the **declared model**: undefined-state references
(`IL-LIFE-001`, an error), terminal states with outgoing transitions (`IL-LIFE-002`),
unreachable states (`IL-LIFE-003`), and dead ends (`IL-LIFE-004`). An `eventually` with
no time bound is `IL-TEMP-001`. The lifecycle becomes `Lifecycle` / `LifecycleState`
nodes with `transitions_to` edges. OpenThunder verifies the **implemented reality**
against this same IR and produces counterexample traces. See
`examples/CertificationAttempt.intent`.

## Distributed and failure semantics

Partial failure is modeled explicitly. Commands carry a failure policy; events carry
delivery semantics; handlers define duplicate and permanent-failure behavior:

```
command CreateStudyPlan
  idempotency_key Request.id
  timeout 30 seconds
  retry at_most 2
    with exponential_backoff

event StudyPlanCreated
  delivery at_least_once
  ordered_by Learner.id

on duplicate StudyPlanCreated
  ignore when Event.id was_processed
on permanent_failure
  compensate RemovePartialStudyPlan
  preserve UploadedMaterial
```

IntentLang statically checks the **declared** failure policy is safe: a command that
retries without an `idempotency_key` (`IL-DIST-001`, the classic duplicate-work bug) or
without a `timeout` (`IL-DIST-002`); an `at_least_once` event with no duplicate handler
(`IL-DIST-003`); a `permanent_failure` handler with no compensation (`IL-DIST-004`); a
handler referencing an undeclared event (`IL-DIST-005`, an error). `Command` /
`FailureHandler` nodes join the graph. OpenThunder verifies the **implementation**
honors the policy (retry safety, duplicate handling, failure simulation). See
`examples/CreateStudyPlan.intent`.

## Decisions and rules

Business decisions are declarative and checkable:

```
decision CertificationEligibility
  inputs
    Candidate.completed_courses
    Certification.prerequisites
  rule Eligible
    when all prerequisites completed
    return Eligible
  rule EligibleWithWaiver
    when prerequisite_waiver approved
    return EligibleWithWaiver
  default
    return NotEligible
  explanation required
  owner CertificationProduct
```

IntentLang statically checks the **declared** decision: a decision with rules but no
`default` (`IL-DEC-001`, undefined when nothing matches), two rules with the same
condition but different results (`IL-DEC-002`, ambiguous), redundant rules
(`IL-DEC-003`), and empty decisions (`IL-DEC-004`). `Decision` / `Rule` nodes join the
graph. OpenThunder verifies rule coverage and that the implementation matches the
decision. See `examples/CertificationEligibility.intent`.

## Design system

The design profile connects the experience layer to the concrete design system, so a
designer's components and mockups live in the same graph as the journeys and states they
realize. A `component` is a reusable piece of the design system; an `artifact` is a
design deliverable (a Figma file, a mockup) that depicts it.

```
use design

component AddressForm
  description "collects and validates a shipping address"
  variant default
  variant error
  token color.error
  token spacing.md
  implements AddressEntry        # an experience state or pattern it realizes
  implements FormValidation

artifact CheckoutMockups
  kind figma
  ref "figma.com/file/abc"
  covers AddressForm
```

A `component` becomes a `DesignComponent` node (`Mission -requires-> DesignComponent`),
carrying its variants and design tokens. Each `implements` resolves to the experience
state or pattern it realizes, and the edge runs the way UX reads it: the experience state
is `implemented_by` the component. An `artifact` becomes a `DesignArtifact` node whose
`ref` is kept as the node's source; each `covers` link records that a component is
`represented_by` that mockup. So the chain is complete and navigable: a journey's state
is implemented by a component, which is represented by a Figma file, all resolvable
without leaving the graph. Unresolved references fall back to the mission, never dangle.

## System profile

The system profile lets an architect say what the mission needs from the system, in the
same graph as everything else. A `capability` groups the work a mission delivers; an
`interface` (a system contract) states what a dependency provides, requires, and
guarantees.

```
use system

capability Billing
  description "charge and invoice customers"
  implements ChargeCard
  implements Eligibility

interface PaymentGateway
  provides charge
  requires idempotency_key
  slo "99.9% availability"
```

A `capability` becomes a `Capability` node under the mission (`Mission -requires->
Capability`), and each `implements` link resolves to the command or decision that
realizes it (`Capability -implemented_by-> ...`), when that node exists, so the edge is
never dangling. An `interface` becomes a `SystemContract` node. `Capability` is the
Atlas hierarchy level between Mission and its implementation, and it is the same node
type OpenThunder infers when it discovers capabilities from an existing codebase.

## Delivery profile

The delivery profile closes the loop from intent to shipped result. A `release` records
what went out; a `result` records what actually happened to an outcome; a `learning`
records what the team took away.

```
use delivery

release v1.2
  version "1.2.0"
  status planned
  date 2026-08-01
  includes CertificationAttempt

result ConversionUp
  measures FasterCheckout
  metric conversion
  value "62%"
  baseline "48%"

learning AddressFriction
  description "users drop at address entry"
  from v1.2
```

These use relationships the canonical schema already reserves: `Mission -released_in->
Release`, `Outcome -resulted_in-> OutcomeResult` (the result resolves the outcome it
measures), and `LearningArtifact -derived_from-> Release`. So a mission carries its
whole arc in one graph: the outcome it targets, the release that shipped it, the result
that outcome produced, and the learning that came back.

## Canonical schema (no forks)

Every product must speak the same node types, relationship types, classifications, and
diagnostic rule IDs. IntentLang owns and versions the canonical schema, and consumers
**generate bindings from it** rather than hand-recreating enums:

```bash
intent schema            # emits the JSON Schema + node/relationship/classification enums + rule catalog
```

`intent schema` outputs a draft-07 JSON Schema (`$id`
`https://intentlanguage.dev/schema/intent-graph-v1.json`), the canonical `NODE_TYPES`
(30) and `RELATIONSHIP_TYPES` (19), and the `DIAGNOSTIC_RULES` catalog with stable IDs.
The compiler is tested so that `buildIntentGraph` can only emit node and relationship
types that exist in this schema, so OpenThunder, Repo Mastery, and SkillsTech Studio can
rely on it without drift.

## Role-aware diagnostics

Diagnostics render per role. The same finding reads differently for a PM vs an engineer,
and carries `severity` + `blocks` metadata for phase gates. Examples:

- **Product:** "The success metric has no measurement period." (`IL-PM-001`, blocks release)
- **Engineer:** "Unknown `MaximumUploadSize` gates Implementation." (`IL-GRAPH-010`)

`intent check` stays valid (these are warning/info): a well-formed spec can still be
not-ready-to-proceed, which is a phase gate, not a syntax error.

## Product responsibilities

- **IntentLang** owns the language, types, AST, compiler, validation, the Intent Graph,
  and the interoperable contracts (this page).
- **OpenThunder** deterministically verifies that designs, implementations, tests,
  analytics, and releases satisfy the declared Intent (it consumes the Intent Graph; it
  does not re-parse or duplicate the compiler).
- **Repo Mastery** teaches every role the product, journeys, decisions, and
  implementation the Intent represents.
- **SkillsTech Studio** provides visual authoring (Canvas, builders), collaboration,
  review, approvals, and role-specific experiences.

Status: shipped , all five profiles (core, product, experience, system, delivery) and
the assurance concepts, Product Mission, classification, Experience Contracts,
constraints/conflicts, temporal/lifecycle, distributed/failure, decisions/rules, and the
canonical Intent Graph with role diagnostics. OT/RM/ST build to `intent-graph-v1` in
their own repos.

## Intent Atlas

The **Intent Atlas** is the navigable, searchable map of a whole system, built over the
Intent Graph, not a fork of it. Missions are the entry points (progressive disclosure:
you never start from files or a 1000-node dump). Deterministic, no AI.

```bash
intent atlas ./examples                     # overview: missions + node-type counts
intent atlas ./examples --search checkout   # exact + substring search (deterministic)
intent atlas ./examples --expand <node-id>  # a node + its inbound/outbound neighbors
```

`buildAtlas` assembles many mission Intent Graphs into one; `searchAtlas` and
`expandNode` are the navigation primitives. The per-mission focused map is
`mission-index-v1` (`intent index`). SkillsTech Studio renders the Atlas UX; OpenThunder
surfaces findings (intent-with-no-impl, impl-with-no-intent) as Atlas nodes; Repo Mastery
teaches through it. All consume this one Atlas, owned by IntentLang.

## Semantic diff

`intent diff` compares two snapshots (files or directories) by **meaning**, not text:

```bash
intent diff ./before ./after        # + / - / ~ nodes, + / - edges, by type
```

`diffGraphs` reports added / removed / changed nodes (a node "changed" when the same id
has different content), added / removed relationships, and , the load-bearing feature ,
**which approvals the change invalidates**: an approval is invalidated when its mission's
contract (its `requires` / `constrained_by` / `targets` / `measured_by` nodes) changed. A
note-only edit invalidates nothing. This is how "an intent change invalidates affected
approvals" is enforced deterministically. SkillsTech Studio renders the Atlas diff and
re-requests the invalidated approvals; OpenThunder keys drift on the same diff.
