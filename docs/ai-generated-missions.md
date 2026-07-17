# AI-generated missions

Claude Code and Codex can generate missions far faster than a human can read them. A
single session can produce dozens of `.thunder` files. That speed is the point, and
it is also the risk: volume hides what changed, what is risky, and what is
unverified. ThunderLang is the layer that keeps AI-generated intent reviewable.

Part of the family of concepts for
[working with large changes](/docs/large-changes).

## The problem with volume

When an agent writes 47 missions, the failure mode is not that any single mission is
wrong. It is that:

- No human reads all 47, so risky ones slip through.
- "It compiles" and "the tests pass" say nothing about weakened never rules.
- The intent and the code can diverge silently over a day of edits.

Speed without a review model produces confident, unverified software.

## How ThunderLang keeps it reviewable

Every mission records its provenance: whether it was AI-authored and whether a human
reviewed it. That metadata flows into the tools that make volume tractable:

- The [Build Session Digest](/docs/build-session-digest) says what the AI generated
  and modified this session.
- The [Risk Radar](/docs/risk-radar) counts `AI-generated code` and `unreviewed` as
  risk factors, so AI-authored, unreviewed missions rise to the top.
- The [Proof Matrix](/docs/proof-matrix) shows which AI-generated missions are
  actually verified.
- [OpenThunder](/docs/ecosystem-brief) checks the generated code against the declared
  intent (drift).

## The discipline

- **AI proposes, humans approve.** A mission carries `aiAuthored` and `humanReviewed`
  flags; `thunder approve` records the human sign-off.
- **Verification is not optional.** An AI-generated guarantee with no test is a claim,
  not a proof. The Proof Matrix makes that visible.
- **Review by risk, not by order.** Use the Risk Radar; do not read 47 missions
  top to bottom.

## Worked example

In the [customer portal example](/examples), most missions are `aiAuthored: true` and
`humanReviewed: false`. The Risk Radar surfaces the AI-authored, unreviewed billing
missions first, and the MVP Readiness report keeps the product at `demo_safe` until
they are verified. That is the whole point: move fast, and still know what you can
trust.
