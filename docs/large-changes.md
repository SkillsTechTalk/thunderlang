# Working with large changes

IntentLang is useful for one mission. It becomes essential when there are many.

A single day of Claude Code or Codex can generate dozens of `.intent` files. A
release can touch hundreds. Reviewing them one file at a time does not scale, and it
hides the questions that actually matter: what changed, what is risky, what is
verified, and what blocks deployment.

This is the hub for the concepts IntentLang uses to answer those questions across
many missions. Start with the [Mission Atlas](/docs/mission-atlas), which maps what
exists; each concept below has its own page, and the
[tutorial](/docs/release-story-tutorial) walks all of them end to end on one example.

Five teaching lines carry the whole model:

- **[Mission Atlas](/docs/mission-atlas)** shows what exists.
- **[Build Session Digest](/docs/build-session-digest)** shows what changed.
- **[Proof Matrix](/docs/proof-matrix)** shows what is trusted.
- **[Risk Radar](/docs/risk-radar)** shows what to review first.
- **[MVP Readiness](/docs/mvp-readiness)** shows whether it can ship.

## The concepts

### Mission Chain

A connected sequence of missions that forms one user or system flow. Missions measure
per-unit correctness; chains measure end-to-end readiness. A release with 200 green
missions can still ship a broken signup if one link is unverified.
Full page: [Mission Chains](/docs/mission-chains).

### Build Session Digest

A summary of everything that changed during one work session, expressed in intent
rather than files. It is what you read after an agent has been working.
Full page: [Build Session Digest](/docs/build-session-digest).

### Semantic Diff

A diff by meaning, not by file: guarantees added, never rules weakened, proof gone
stale. It surfaces the changes that change trust.
Full page: [Semantic Diff](/docs/semantic-diff).

### Proof Matrix

A table of verification status across many missions, so a reviewer can scan a whole
release quickly instead of opening each file.
Full page: [Proof Matrix](/docs/proof-matrix).

### Risk Radar

A priority list of the missions that deserve review first, so a team does not review
200 missions as if they were equal.
Full page: [Risk Radar](/docs/risk-radar).

### MVP Readiness

A classifier (`demo_safe` .. `production_ready`) that lets teams ship fast without
pretending everything is production-ready.
Full page: [MVP Readiness](/docs/mvp-readiness).

### AI-generated missions

The review model for volume: how IntentLang keeps dozens of agent-authored missions
reviewable through provenance, risk, and proof.
Full page: [AI-generated missions](/docs/ai-generated-missions).

## Release Story

A **Release Story** is a human-readable summary of what an MVP or release can do, and
what is not yet verified. It is not marketing copy. It is a trust-aware release
narrative: every capability it claims is tied to the missions and proof behind it,
and it states plainly what is unverified. It is the output you can hand to a
stakeholder.

See a worked example at `examples/mvp-customer-portal/release-story.md`, produced (in
the planned model) by `intent release ./intent --mvp` alongside the
[MVP Readiness](/docs/mvp-readiness) report.

## Tutorial

[From 200 missions to one Release Story](/docs/release-story-tutorial) walks the whole
path on the customer portal example: index, atlas, chains, digest, proof matrix, risk
radar, semantic diff, readiness, and the release story.

## Command status

This repo teaches the concepts and ships the [example fixtures](/examples). The first
aggregation command, `intent index`, is **shipped**; the rest are owned by the
**SkillsTech Compiler** and documented here as **planned** until they ship. The
single-mission commands that already exist (`intent check`, `graph`, `proof`,
`build`, `lift`, `approve`, `drift`, `handoff`) are covered in the
[compiler contract](/docs/compiler-contract).

| Command | Status | Produces |
| --- | --- | --- |
| `intent index ./intent [--json]` | shipped | mission inventory (`mission-index.json`) |
| `intent atlas ./intent [--search \| --expand]` | shipped | navigable/searchable whole-system Atlas |
| `intent diff <before> <after>` | shipped | Semantic Diff (by meaning + invalidated approvals) |
| `intent merge <base> <ours> <theirs>` | shipped | deterministic 3-way semantic merge |
| `intent diff ./intent --since HEAD~1` | planned | Semantic Diff over a git range |
| `intent graph ./intent --view atlas` | planned | rendered visual Atlas view |
| `intent chains ./intent` | planned | mission chains (`mission-chain-map.json`) |
| `intent summarize ./intent --since today` | planned | Build Session Digest |
| `intent proof matrix ./intent` | planned | Proof Matrix (`mission-proof-matrix.json`) |
| `intent release ./intent --mvp` | planned | MVP Readiness Report + Release Story |

Nothing here claims production readiness. These views report what the repo can prove
and what it cannot. Verifying the running code against the missions is
[OpenThunder](/docs/ecosystem-brief)'s job.
