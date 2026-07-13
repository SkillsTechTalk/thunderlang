# Language principles

These are the design rules IntentLang holds itself to. The manifesto says why the
language exists; this page says why the language is shaped the way it is. Every
construct, diagnostic, and compiler decision traces back to one of these.

## 1. Meaning is the source of truth

A `.intent` file records what software should do, why it matters, and what must
never happen, before any implementation exists. Code is a target, not the record.
When code and intent disagree, the intent is the thing under review, not silently
overwritten. This is what makes the file durable while prompts, branches, and
frameworks come and go.

## 2. Deterministic by default, AI by exception

The compiler must produce the same contract, plan, and proof from the same source
every time, with `--no-ai` and no network. AI is an optional assist that only ever
proposes; it never decides. Every AI action carries provider, model, prompt hash,
input and output hashes, and a human approval status. If a result cannot be
reproduced without a model, it is not part of the deterministic core.

## 3. A guarantee is only real when something proves it

An unverified guarantee is exactly where [Intent Drift](/docs/manifesto) hides, so
the language treats one as an unfinished thought. Every `guarantee` and `never`
should carry a `verify`, and the compiler warns
(`guarantee-without-verification`, `never-without-verification`) when it does not.
Claims and proofs are different kinds of thing, and the language keeps them
visibly separate: an `accessibility_target` or an inferred lift is always a
`proposed` claim, never an IntentLang-verified fact.

## 4. Say what must never happen, not only what should

Most specifications describe the happy path. Software fails on the paths nobody
wrote down. `never` rules are first-class precisely because forbidden behavior,
a leaked secret, a double charge, an unapproved action, is where the expensive
failures live. A mission is not complete until its prohibitions are as explicit as
its goals.

## 5. Structure over prose

Intent is written in blocks the compiler understands (`goal`, `input`, `output`,
`guarantee`, `never`, `decision`, `lifecycle`, `test`), not free text it has to
guess at. Structure is what lets the same file become a contract graph, a test
plan, a diagram, a runtime guard, and a proof, without a language model in the
loop. Prose belongs in [notes](/docs/intent-graph), which explain meaning to a
reader and are never mistaken for verification.

## 6. Above paradigms, not against them

IntentLang does not replace TypeScript, Python, Java, .NET, Rust, or Go, and it
does not pick object-oriented over functional or service-oriented over event-
driven. It sits above them and targets each through an adapter. The same mission
can emit clean-architecture C#, a functional core, an OpenAPI spec, or a Mermaid
diagram. The intent is portable; the idioms are the target's.

## 7. Explainable, never oracular

The compiler never says "a possible issue was detected." Every diagnostic names
its rule, the source it fired on, why it matters, and how to fix it. Every
decision is traceable to a rule; every finding is deterministic or explicitly
flagged as inferred and requiring human review. A person can always ask "why?" and
get a real answer, not a confidence score.

## 8. Humans own the result

The compiler proposes, gates, and proves; it does not approve. Approvals bind to a
reviewed hash and go stale the moment the thing they approved changes, so trust is
never inherited by accident. Governance is on the record: a blocker can be
[waived](/docs/governance), but only with an owner, a reason, and an expiry.

## 9. Additive and versioned

The language and its schemas are pre-1.0 and evolve, but they evolve without
breaking what already parses. New fields are additive; persisted graphs migrate
across schema versions deterministically. A `.intent` file written today should
still mean the same thing tomorrow, and old proofs should still verify.

## 10. Honest about its limits

IntentLang catches the mistakes prompts ship and the drift code accumulates. It
does not claim to prove a program correct. A lifted draft is inferred, not
verified; a passing check means "no violation was found," not "nothing can go
wrong." The value is in making purpose explicit and drift detectable, and the
language says so plainly rather than overclaiming.

---

See also: the [Manifesto](/docs/manifesto) for the vision,
[Intent-oriented programming](/docs/intent-oriented-programming) for the practice,
and the [Syntax overview](/docs/syntax-overview) for the mechanics.
