# Release Story: MVP Customer Portal

> This is a trust-aware release narrative, not marketing copy. Every capability it
> claims is backed by missions and proof; every gap is stated plainly. It is the
> human-readable output of `intent release ./intent --mvp` (planned command).

## Readiness: demo_safe

All 15 missions of the Customer Portal MVP are authored across four feature areas.
It is safe to demo in a controlled setting. It is not ready for real customers.
Billing is the weakest journey and gates the release. Authoring a mission is not the
same as verifying it.

## What it can do (verified)

- **Sign in.** `LoginUser` is verified: valid credentials issue a session, repeated
  failures lock out, and secrets are never logged.
- **Confirm an email.** `VerifyEmail` is verified, including one-time-use tokens.
- **Create a workspace.** `CreateWorkspace` is verified, including tenant isolation.
- **Accept an invite.** `AcceptInvite` is verified, including one-time-use invites.
- **Invoice a completed order.** `CreateInvoice` is verified: idempotent, never
  negative, and it rejects unapproved orders.
- **Cancel a subscription.** `CancelSubscription` is verified: no charge after
  cancellation, access retained until period end.
- **Observe the service.** `HealthCheck`, `ErrorMonitoring`, and `AuditLog` are
  verified, including secret scrubbing and an append-only audit trail.

## What works but is not fully proven (review before trusting)

- **Register.** `RegisterUser` has one failing test (`4/5`).
- **Manage sessions.** `ManageSession` is partial (`1/2`): expiry is tested,
  revocation is not.
- **Invite a teammate.** `InviteTeamMember` is partial (`1/2`) and is a public,
  PII-touching endpoint. It weakens the New Customer Signup chain.

## What it cannot yet do safely (authored, under-verified)

- **Take a payment.** `CreateCheckoutSession` is drifting (`1/5` tests) and touches
  an external payment API, with unverified never rules.
- **Activate a subscription.** `ActivateSubscription` has no passing test (`0/1`), so
  the Subscription Billing chain is not proven end to end.
- **Recover from a bad deploy.** `RollbackPlan` has no passing test (`0/1`), so
  recovery is unproven.

## Journeys

- **New Customer Signup:** at risk. Weakest link `InviteTeamMember`.
- **Subscription Billing:** blocked. The paid path is under-verified.
- **Operate and Recover:** at risk. Weakest link `RollbackPlan`.

## To reach the next level (internal_only for the whole MVP)

1. Verify `CreateCheckoutSession` (raise `1/5` to full).
2. Verify `ActivateSubscription` to prove the billing chain end to end.
3. Verify `RollbackPlan` so recovery is trusted.
4. Finish `InviteTeamMember` tests.

This story reports declared intent and repo-provable status only. Verifying the
running code against these missions is OpenThunder's job.
