# Working with large changes

IntentLang is useful for one mission. It becomes essential when there are many.

A single day of Claude Code or Codex can generate dozens of `.intent` files. A
release can touch hundreds. Reviewing them one file at a time does not scale, and
it hides the questions that actually matter: what changed, what is risky, what is
verified, and what blocks deployment.

This page defines the concepts IntentLang uses to answer those questions across
many missions. Start with the [Mission Atlas](/docs/mission-atlas), which maps what
exists; the rest of this page covers what changed and whether it can ship.

Five teaching lines carry the whole model:

- **Mission Atlas** shows what exists.
- **Build Session Digest** shows what changed.
- **Proof Matrix** shows what is trusted.
- **Risk Radar** shows what to review first.
- **MVP Readiness Report** shows whether it can ship.

## Mission Chain

A **Mission Chain** is a connected sequence of missions that forms one user or
system flow. Individual missions can each pass their own checks while the flow
between them is still broken or incomplete.

```
New Customer Signup
  RegisterUser
  -> VerifyEmail
  -> CreateWorkspace
  -> InviteTeamMember
  -> AcceptInvite
  -> LoginUser
```

A mission answers "is this unit correct?" A chain answers "is this journey ready?"
A release with 200 green missions can still have a broken signup if one link in the
chain is unverified. Chains are how IntentLang tells end-to-end readiness from
per-file correctness.

## Build Session Digest

A **Build Session Digest** summarizes everything that changed during one work
session, whether the author was a human or an agent.

```
Session: 2026-07-09 (Claude Code)
  47 missions generated
  18 missions modified
  6 mission chains created
  Top risk: 3 payment missions with unverified never rules
  Review first: CreateCheckoutSession, ActivateSubscription
```

It answers: what happened today, what did AI generate, what changed semantically,
what is risky, and what should I review first. The digest is the entry point after
an agent has been working: instead of scrolling a git log of file changes, you read
a change summary expressed in intent.

## Release Story

A **Release Story** is a human-readable summary of what an MVP or release can do,
and what is not yet verified. It is not marketing copy. It is a trust-aware release
narrative: every capability it claims is tied to the missions and proof behind it,
and it states plainly what is unverified.

A Release Story is the output you can hand to a stakeholder. See a worked example at
`examples/mvp-customer-portal/release-story.md`.

## Proof Matrix

A **Proof Matrix** is a table showing verification status across many missions, so a
reviewer can scan a whole release quickly instead of opening each file.

| Mission | Risk | Guarantees | Never rules | Tests | Proof | Drift |
| --- | --- | --- | --- | --- | --- | --- |
| RegisterUser | medium | 3 | 2 | 5/5 | verified | in_sync |
| LoginUser | high | 2 | 2 | 4/4 | verified | in_sync |
| CreateCheckoutSession | high | 3 | 3 | 2/5 | partial | review |
| CreateInvoice | high | 4 | 1 | 3/3 | verified | in_sync |
| HealthCheck | low | 1 | 0 | 1/1 | verified | in_sync |

The Proof Matrix is what turns "the code compiles" into "here is exactly what we can
prove, and where the gaps are."

## Risk Radar

A **Risk Radar** is a priority list of the missions that deserve review first. It
exists so a team does not review 200 missions equally: attention goes where the blast
radius is largest.

Risk factors include: auth, payments, PII, secrets, external API calls, database
writes, missing tests, unverified never rules, AI-generated code, public endpoints,
and deployment impact. A mission that touches payments, writes to the database, and
has an unverified never rule ranks far above a read-only health check.

```
Risk Radar (top 3)
  1. CreateCheckoutSession , payments + external API + 3/5 tests + AI authored, unreviewed
  2. ActivateSubscription  , payments + db write + never rule unverified
  3. InviteTeamMember      , sends email + PII + public endpoint
```

## Semantic Diff

A **Semantic Diff** is a diff by meaning, not by file. A line diff shows that text
moved. A semantic diff shows how the intent changed.

```
Semantic diff (since HEAD~1)
  12 missions changed
  5 guarantees added
  3 never rules weakened
  8 verification rules added
  2 proof artifacts became stale
  1 new chain created
```

"3 never rules weakened" is invisible in a line diff and critical in a review. Semantic
Diff is how IntentLang improves code review and release review: it surfaces the changes
that change trust.

## MVP Readiness

**MVP Readiness** is a classifier for how far along a POC or MVP is. It lets teams ship
fast without pretending everything is production-ready.

| Level | Meaning |
| --- | --- |
| `demo_safe` | Fine to show in a controlled demo. Not for real users. |
| `internal_only` | Usable by the team, behind the wall. |
| `private_beta` | A small set of external users, with known gaps. |
| `production_candidate` | Close to production; specific blockers remain. |
| `production_ready` | Verified against its declared intent and proof. |

MVP Mode is honest about state. A readiness report names the exact missions and
unverified guarantees that hold a release back from the next level, so "ship the demo"
and "ship to production" are different, explicit decisions. See
`examples/mvp-customer-portal/mvp-readiness-report.json`.

## Tutorial: From 200 missions to one Release Story

This is the end-to-end path from a pile of `.intent` files to a shippable decision.
The commands are shown as they are planned to work; see the status table below.

1. **Start** with many `.intent` files (see `examples/mvp-customer-portal/intent/`).
2. **Index** them: `intent index ./intent` produces a mission inventory.
3. **View the Atlas**: `intent graph ./intent --view atlas` maps product to evidence.
4. **See the chains**: `intent chains ./intent` shows which missions form each flow.
5. **Digest the session**: `intent summarize ./intent --since today` shows what changed.
6. **Read the Proof Matrix**: `intent proof matrix ./intent` shows what is verified.
7. **Check the Risk Radar** (part of the summary) to decide what to review first.
8. **Run the Semantic Diff**: `intent diff ./intent --since HEAD~1`.
9. **Classify readiness**: `intent release ./intent --mvp` emits an MVP Readiness Report.
10. **Produce the Release Story**: the trust-aware narrative of what ships and what does not.

The worked example under `examples/mvp-customer-portal/` ships the fixtures each of
these steps would emit, so the tutorial can be followed today by reading the JSON and
the Release Story, before the commands exist.

## Command status

This repo teaches the concepts and ships the example fixtures. The commands that
produce these views across many missions are owned by the **SkillsTech Compiler** and
are documented here as **planned** until they ship. The single-mission commands that
already exist (`intent check`, `graph`, `proof`, `build`, `lift`, `approve`, `drift`,
`handoff`) are covered in the [compiler contract](/docs/compiler-contract).

| Command | Status | Produces |
| --- | --- | --- |
| `intent index ./intent` | planned | mission inventory (`mission-index.json`) |
| `intent graph ./intent --view atlas` | planned | Mission Atlas view |
| `intent chains ./intent` | planned | mission chains (`mission-chain-map.json`) |
| `intent summarize ./intent --since today` | planned | Build Session Digest |
| `intent session summarize --from git` | planned | Build Session Digest from git history |
| `intent diff ./intent --since HEAD~1` | planned | Semantic Diff |
| `intent proof matrix ./intent` | planned | Proof Matrix (`mission-proof-matrix.json`) |
| `intent release ./intent --mvp` | planned | MVP Readiness Report + Release Story |

Nothing here claims production readiness. These views report what the repo can prove
and what it cannot. Verifying the running code against the missions is
[OpenThunder](/docs/ecosystem-brief)'s job.
