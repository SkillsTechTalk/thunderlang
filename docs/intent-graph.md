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

Status: IL Phase 1 slice 1 shipped (profiles, Product Mission, classification, the
Intent Graph, role diagnostics). Experience Contracts, design-system mappings, outcome
contracts, and the remaining profiles are the next IL slices; OT/RM/ST build to
`intent-graph-v1` in their own repos.
