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
