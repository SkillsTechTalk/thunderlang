# Mission Chains

A **Mission Chain** is a connected sequence of missions that forms one user or
system flow. Missions measure per-unit correctness. Chains measure end-to-end
readiness. A release with 200 green missions can still ship a broken signup if one
link in the chain is unverified.

This is one page in the family of concepts for
[working with large changes](/docs/large-changes). See also the
[Mission Atlas](/docs/mission-atlas), which places chains between feature areas and
individual missions.

## Why chains

Reviewing missions one at a time answers "is this unit correct?" It never answers
"can a real user get through the journey?" Those are different questions:

- A mission can be fully verified while the mission before it in the flow is not.
- A flow can be blocked by a single missing step even when every other step is green.
- A "done" feature area can still have no working end-to-end path.

Chains make the journey a first-class thing you can check.

## Shape

```
New Customer Signup
  RegisterUser
  -> VerifyEmail
  -> CreateWorkspace
  -> InviteTeamMember
  -> AcceptInvite
  -> LoginUser
```

A chain has a name, the journey it represents, an ordered list of missions, a
readiness verdict, and a weakest link. The readiness of a chain is bounded by its
weakest step: one `partial` or `drift` mission caps the whole chain.

## Readiness verdicts

- **ready** , every step is verified and in sync.
- **at_risk** , the chain works but at least one step is only partially verified.
- **blocked** , a step is drifting, missing, or unverified enough that the journey
  cannot be trusted.

## Worked example

The [customer portal example](/examples) declares three chains
(`mission-chain-map.json`):

| Chain | Steps | Readiness | Weakest link |
| --- | --- | --- | --- |
| New Customer Signup | RegisterUser to LoginUser (6) | at_risk | InviteTeamMember |
| Subscription Billing | CreateCheckoutSession to CancelSubscription (4) | blocked | CreateCheckoutSession |
| Operate and Recover | HealthCheck to RollbackPlan (4) | at_risk | RollbackPlan |

Every mission in Subscription Billing passes `intent check`, yet the chain is
blocked, because `CreateCheckoutSession` is drifting and `ActivateSubscription` has
no passing test. That gap is invisible if you review missions one file at a time.

## Where chains come from (planned)

Chains are detected from mission inputs, outputs, and references. The command
`intent chains ./intent` is **planned** and owned by the SkillsTech Compiler; this
repo teaches the concept and ships the example fixture that shows its output shape.
