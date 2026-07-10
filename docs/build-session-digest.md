# Build Session Digest

A **Build Session Digest** summarizes everything that changed during one work
session, whether the author was a human or an agent. It is the first thing you read
after Claude Code or Codex has been working: instead of scrolling a git log of file
changes, you read a change summary expressed in intent.

Part of the family of concepts for
[working with large changes](/docs/large-changes).

## What it answers

- What happened this session?
- What did the AI generate versus modify?
- What changed semantically (see [Semantic Diff](/docs/semantic-diff))?
- What is risky (see [Risk Radar](/docs/risk-radar))?
- What should I review first?

## Shape

```
Session: 2026-07-09 (Claude Code)
  13 missions generated
  2 missions modified
  3 mission chains created
  Headline: Full portal scaffolded across 4 feature areas; Billing is under-verified.
  Review first: CreateCheckoutSession, ActivateSubscription, RollbackPlan
```

A digest is a snapshot of one session. It carries the counts (generated, modified,
chains created), a one-line headline, and an ordered "review first" list that comes
straight from the [Risk Radar](/docs/risk-radar).

## Why a digest and not a git diff

A git diff shows files and lines. It cannot tell you that three payment missions
were generated with unverified never rules, or that a new chain appeared. The
digest speaks in missions, guarantees, never rules, chains, and proof, so the
review starts from meaning, not from text.

## Worked example

See `examples/mvp-customer-portal/intent-session-summary.json`. It records 13
missions generated, 2 modified, 3 chains created, and a review-first list led by the
under-verified billing missions.

## Where it comes from (planned)

`intent summarize ./intent --since today` and
`intent session summarize --from git` are **planned** commands owned by the
SkillsTech Compiler. This repo teaches the concept and ships the example fixture.
