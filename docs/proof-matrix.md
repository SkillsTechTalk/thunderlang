# Proof Matrix

A **Proof Matrix** is a table showing verification status across many missions, so a
reviewer can scan a whole release quickly instead of opening each file. It turns
"the code compiles" into "here is exactly what we can prove, and where the gaps
are."

Part of the family of concepts for
[working with large changes](/docs/large-changes).

## Columns

- **Mission** , the unit of intent.
- **Risk** , low / medium / high (feeds the [Risk Radar](/docs/risk-radar)).
- **Guarantees** , how many things it promises are always true.
- **Never rules** , how many things it forbids.
- **Tests** , passing over total.
- **Proof** , `verified`, `partial`, or `stale`.
- **Drift** , `in_sync`, `review`, or `drift` (from OpenThunder).

## How to read it

Scan the **proof** and **drift** columns first, filtered by **risk**. A `high` risk
mission that is `partial` or `drift` is exactly where trust is missing and review
should start. A `low` risk mission that is `verified` needs no attention.

## Worked example

From the [customer portal example](/examples)
(`mission-proof-matrix.json`, 15 missions):

| Mission | Risk | Guarantees | Never rules | Tests | Proof | Drift |
| --- | --- | --- | --- | --- | --- | --- |
| LoginUser | high | 2 | 2 | 3/3 | verified | in_sync |
| RegisterUser | high | 2 | 2 | 4/5 | partial | in_sync |
| CreateCheckoutSession | high | 2 | 2 | 1/5 | partial | drift |
| ActivateSubscription | high | 2 | 1 | 0/1 | partial | review |
| CreateInvoice | high | 2 | 1 | 3/3 | verified | in_sync |
| RollbackPlan | high | 2 | 1 | 0/1 | partial | review |
| HealthCheck | low | 1 | 0 | 1/1 | verified | in_sync |

Totals across the 15 missions: 9 verified, 6 partial, 1 drifting. The four high-risk
`partial`/`drift` rows are the review list.

## Where it comes from (planned)

`thunder proof matrix ./intent` is a **planned** command owned by the SkillsTech
Compiler. The proof and drift columns combine compiler proof artifacts with
[OpenThunder](/docs/ecosystem-brief) drift results. This repo teaches the concept
and ships the example fixture.
