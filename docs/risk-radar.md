# Risk Radar

A **Risk Radar** is a priority list of the missions that deserve review first. It
exists so a team does not review 200 missions as if they were equal: attention goes
where the blast radius is largest.

Part of the family of concepts for
[working with large changes](/docs/large-changes).

## Risk factors

A mission's risk is raised by any of:

- authentication
- payments
- PII
- secrets
- external API calls
- database writes
- missing tests
- unverified never rules
- AI-generated code
- public endpoints
- deployment impact

A read-only health check scores near zero. A mission that touches payments, calls an
external API, has failing tests, and was AI-authored without review scores near the
top.

## Why ordering matters

Reviewing everything equally means the risky missions get the same attention as the
trivial ones, which in practice means the risky ones get too little. The Radar makes
the review order explicit and defensible: reviewers start at rank 1 and stop when
time or risk tolerance runs out.

## Worked example

From `examples/mvp-customer-portal/intent-session-summary.json`:

```
Risk Radar (top 3)
  1. CreateCheckoutSession , payments + external API + 1/5 tests + AI authored, unreviewed
  2. ActivateSubscription  , payments + database write + 0/1 tests + AI authored, unreviewed
  3. RollbackPlan          , deployment impact + destructive migration + 0/1 tests
```

The three most dangerous missions in the portal rise to the top; the verified,
low-risk `HealthCheck` never appears.

## Relationship to the Proof Matrix

The [Proof Matrix](/docs/proof-matrix) shows the full grid; the Risk Radar is the
Matrix sorted by risk and filtered to what is not yet trusted. Read the Radar to
decide what to open; read the Matrix to see everything.

## Where it comes from (planned)

The Risk Radar is part of the output of `intent summarize ./intent`, a **planned**
command owned by the SkillsTech Compiler. This repo teaches the concept and ships
the example fixture.
