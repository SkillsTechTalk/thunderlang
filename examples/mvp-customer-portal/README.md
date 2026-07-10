# Example: MVP Customer Portal

A worked example for the [Mission Atlas](../../docs/mission-atlas.md) and
[Working with large changes](../../docs/large-changes.md) docs. It shows how
IntentLang scales from one `.intent` file to a whole MVP.

## Feature areas and missions (15 authored)

- **Identity and Access:** RegisterUser, LoginUser, ManageSession
- **Onboarding:** VerifyEmail, CreateWorkspace, InviteTeamMember, AcceptInvite
- **Billing:** CreateCheckoutSession, CreateInvoice, ActivateSubscription, CancelSubscription
- **Deployment Readiness:** HealthCheck, AuditLog, ErrorMonitoring, RollbackPlan

All 15 are authored and pass `intent check`. Several are deliberately
under-verified (Billing and RollbackPlan) so the Proof Matrix, Risk Radar, and MVP
Readiness examples stay honest: authoring a mission is not the same as verifying it.

## Files

| File | What it teaches | Planned command |
| --- | --- | --- |
| `intent/*.intent` | The individual missions (all pass `intent check`) | `intent check` (real) |
| `mission-index.json` | Mission Atlas inventory | `intent index ./intent` |
| `mission-chain-map.json` | Mission Chains (Signup, Billing) | `intent chains ./intent` |
| `mission-proof-matrix.json` | Proof Matrix | `intent proof matrix ./intent` |
| `intent-session-summary.json` | Build Session Digest + Risk Radar + Semantic Diff | `intent summarize ./intent --since today` |
| `mvp-readiness-report.json` | MVP Readiness Report | `intent release ./intent --mvp` |
| `release-story.md` | Trust-aware Release Story | `intent release ./intent --mvp` |

The `.intent` files are real and valid today. The JSON files are **teaching
fixtures**: they show the exact shape the planned aggregation commands will emit, so
the "200 missions to one Release Story" tutorial can be followed now by reading them.
The machine-readable indexing itself is owned by the SkillsTech Compiler.

## Try it

```bash
# Validate every mission in this example (real command):
node scripts/intent-check.mjs examples/mvp-customer-portal

# Build artifacts for one mission (real command):
node compiler/src/cli.mjs build examples/mvp-customer-portal/intent/CreateInvoice.intent
```
