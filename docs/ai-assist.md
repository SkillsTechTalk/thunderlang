# Optional AI assist

ThunderLang is deterministic first. The compiler produces the same contract, plan, and
proof from the same source every time, with `--no-ai` and no network. AI is an optional
assist that only ever *proposes*; it never decides, and nothing it produces is trusted
until a human approves it. This page describes where AI can help and, just as important,
where the deterministic compiler already does the work with no model at all.

> Every stage below runs today without AI. The AI layer is additive, traced, and gated.

## The rule

- **AI is optional.** `--no-ai` is the default posture; the full pipeline (check, run,
  test, build, graph, proof) needs no model and no key.
- **AI never decides.** It drafts, suggests, and generates candidates. A human reviews,
  a deterministic check gates, and a person owns the result.
- **Every AI action is traceable.** Each one records provider, model, prompt hash, input
  and output hashes, a verification result, and a human approval status. An unapproved AI
  output does not ship.

## 1. Prompt to intent

Turning a prompt into a rigorous mission is split into a deterministic half and an
optional AI half.

- **Deterministic:** `thunder draft --brief <json|->` (`draftIntent`) takes a structured
  brief and produces a canonically-formatted `.thunder` draft **plus a review checklist**
  of what a human must still decide, an unverified guarantee, a decision with no default,
  an unguarded secret, a missing goal. The draft is labeled a proposal, never verified.

  ```
  echo '{"name":"CancelSubscription","goal":"Let a customer cancel",
         "guarantees":["access continues until the period ends"],
         "nevers":["charge after cancellation"]}' | intent draft --brief -

  mission CancelSubscription
  use product

  goal
    Let a customer cancel

  guarantee access continues until the period ends
  never charge after cancellation

  review (fill these in , the draft is a proposal, not verified):
    - Guarantee "access continues until the period ends" has no verification , add a test that proves it.
    - Never-rule "charge after cancellation" has no verification.
  ```

- **Optional AI:** an agent can produce that brief from a free-form prompt. It does so
  through the MCP tool `intent_draft` (see [editor support](/docs/editor-support) and the
  MCP server), so the model writes the brief and ThunderLang makes it rigorous. The human
  clears the checklist before the mission is real.

## 2. Intent review

Review is deterministic. `thunder check` runs the whole [diagnostics catalog](/docs/diagnostics)
over a mission and explains every finding, its rule, the source it fired on, why it
matters, and how to fix it, with no model involved. `thunder explain <IL-CODE>` expands any
code:

```
intent explain IL-SEC-001
  IL-SEC-001  (area: security)
  Secret-typed field travels over the event bus.
  severity: blocker  |  blocks: release
```

An AI can *summarize* a review for a given audience, but the findings themselves are
deterministic facts, not model opinions, so a review never depends on a model being right.

## 3. Missing guarantee, risk, and test suggestions

The most valuable suggestions are the ones the compiler makes on its own, because they are
deterministic and always correct about *what* is missing:

- `guarantee-without-verification` / `never-without-verification`, a claim with nothing to
  prove it, exactly where drift hides.
- `secret-without-never-log`, a sensitive field with no rule forbidding it in logs or
  responses.
- `IL-SEC-001` / `IL-SEC-002`, a secret on an event payload, or a sensitive API output with
  no auth requirement.
- `IL-DEC-001`, a decision with no default branch.

These are surfaced by `thunder check`, so the "you forgot a test / a guardrail / a risk"
prompt is answered without AI. An AI can *propose the wording* of a new guarantee or test
case; the diagnostic decides whether one is required.

## 4. Target planning

The [implementation plan](/docs/compiler-contract) is deterministic. `thunder build` emits
`implementation-plan.json` in a fixed category order (preconditions, guarantees, never
rules, events, verifications), each step traceable to the AST element that required it. No
AI is needed to sequence the work; an AI can annotate a step with a suggested approach, but
the plan itself is reproducible.

## 5. Explanation generation

Two deterministic surfaces already generate explanation:

- `thunder explain <CODE>` for diagnostics.
- [ThunderLens notes](/docs/intent-graph) (`note pm:`, `note beginner:`, `note security:`,
  ...), authored comments that compile into audience-specific understanding with source
  spans, and are never mistaken for verification.

An AI can draft a note or a plain-language walkthrough, but a note is documentation, not a
proof, and the language keeps that line bright.

## 6. AI implementations (the generation layer)

When AI *writes code*, it does so under the gated `intent-ai-v1` model, not as a free
rewrite. An `implement with ai { ... }` block declares a region; the compiler builds a
provider-neutral prompt (`buildImplementationPrompt`), tracks the result through a
nine-state lifecycle, and refuses to ship it until it is verified and approved:

- `thunder ai list` / `thunder ai generate` , inspect regions and produce the handoff prompt.
- `thunder ai gate` and `thunder build --mode production` , block production on any region
  that is pending, modified, or unverified.
- `thunder ai approve` / `thunder ai reject` , bind a decision to the reviewed hashes; the
  approval goes stale the moment the code or contract changes.
- `thunder ai select` , pick among candidates by *measurable* criteria, never by asking a
  model which it prefers.

The full model, states, proof shape, and selection rules are in
[AI implementations](/docs/ai-implementations).

## In one line

The deterministic compiler is the authority; AI is a labeled, hash-traced, human-approved
assistant that speeds up authoring and never gets the final say.

---

See also: the [Manifesto](/docs/manifesto) on AI-era not AI-magic,
[AI implementations](/docs/ai-implementations) for the generation contract, and
[AI-age best practices](/docs/ai-age-best-practices) for working this way.
