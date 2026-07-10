# MVP Readiness

**MVP Readiness** is a classifier for how far along a POC or MVP is. It lets teams
ship fast without pretending everything is production-ready. Authoring a mission is
not the same as verifying it, and "ship the demo" and "ship to production" should be
different, explicit decisions.

Part of the family of concepts for
[working with large changes](/docs/large-changes).

## Levels

| Level | Meaning |
| --- | --- |
| `demo_safe` | Fine to show in a controlled demo. Not for real users. |
| `internal_only` | Usable by the team, behind the wall. |
| `private_beta` | A small set of external users, with known gaps. |
| `production_candidate` | Close to production; specific blockers remain. |
| `production_ready` | Verified against its declared intent and proof. |

## How the level is decided

Readiness is computed per feature area from the [Proof Matrix](/docs/proof-matrix)
and [Mission Chains](/docs/mission-chains), then the whole MVP is bounded by its
weakest area. A single drifting payment mission holds the whole product at
`demo_safe` even if everything else is verified. The report names the exact missions
and unverified guarantees that block the next level.

## Worked example

From `examples/mvp-customer-portal/mvp-readiness-report.json`:

| Feature area | Readiness | Top blocker |
| --- | --- | --- |
| Identity and Access | internal_only | ManageSession revocation untested |
| Onboarding | private_beta | InviteTeamMember partial |
| Billing | demo_safe | CreateCheckoutSession drift, ActivateSubscription 0/1 |
| Deployment Readiness | production_candidate | RollbackPlan 0/1 |
| **Overall MVP** | **demo_safe** | bounded by Billing |

All 15 missions are authored, but the portal is honestly `demo_safe`: the paid path
is not verified. The report lists the exact steps to reach `internal_only`.

## Not a production claim

MVP Readiness reports what the repo can prove, not that the running code is correct.
It never labels something `production_ready` on authored intent alone. Verifying the
code against the missions is [OpenThunder](/docs/ecosystem-brief)'s job.

## Where it comes from (planned)

`intent release ./intent --mvp` is a **planned** command owned by the SkillsTech
Compiler. It emits the readiness report and the
[Release Story](/docs/large-changes#release-story). This repo teaches the concept
and ships the example fixtures.
