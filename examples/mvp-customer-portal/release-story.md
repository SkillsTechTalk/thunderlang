# Release Story: MVP Customer Portal

> This is a trust-aware release narrative, not marketing copy. Every capability it
> claims is backed by missions and proof; every gap is stated plainly. It is the
> human-readable output of `intent release ./intent --mvp` (planned command).

## Readiness: demo_safe

The Customer Portal MVP is safe to demo in a controlled setting. It is not ready for
real customers. Billing is the weakest journey and gates the release.

## What it can do (verified)

- **Sign in.** `LoginUser` is verified: valid credentials issue a session, repeated
  failures lock out, and secrets are never logged.
- **Confirm an email.** `VerifyEmail` is verified, including one-time-use tokens.
- **Create a workspace.** `CreateWorkspace` is verified, including tenant isolation.
- **Accept an invite.** `AcceptInvite` is verified, including one-time-use invites.
- **Invoice a completed order.** `CreateInvoice` is verified: idempotent, never
  negative, and it rejects unapproved orders.
- **Report health.** `HealthCheck` is verified.

## What works but is not fully proven (review before trusting)

- **Register.** `RegisterUser` has one failing test (`4/5`). Duplicate-email and
  hashing paths are covered; treat sign-up as not yet trusted end to end.
- **Manage sessions.** `ManageSession` is partial (`1/2`): expiry is tested,
  revocation is not.
- **Invite a teammate.** `InviteTeamMember` is partial (`1/2`) and is a public,
  PII-touching endpoint. It weakens the New Customer Signup chain.

## What it cannot yet do (not shippable)

- **Take a payment.** `CreateCheckoutSession` is drifting (`1/5` tests) and touches
  an external payment API. It has unverified never rules.
- **Activate a subscription.** `ActivateSubscription` is not yet authored, so the
  Subscription Billing chain is incomplete.
- **Operate safely in production.** `AuditLog`, `ErrorMonitoring`, and `RollbackPlan`
  are not yet authored.

## Journeys

- **New Customer Signup:** at risk. The weakest link is `InviteTeamMember`.
- **Subscription Billing:** blocked. The paid path is under-verified and missing
  `ActivateSubscription`.

## To reach the next level (internal_only for the whole MVP)

1. Verify `CreateCheckoutSession` (raise `1/5` to full).
2. Author `ActivateSubscription` to complete the billing chain.
3. Finish `InviteTeamMember` tests.

This story reports declared intent and repo-provable status only. Verifying the
running code against these missions is OpenThunder's job.
