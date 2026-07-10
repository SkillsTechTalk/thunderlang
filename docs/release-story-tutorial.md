# Tutorial: From 200 missions to one Release Story

This is the end-to-end path from a pile of `.intent` files to a shippable decision.
It ties together every concept in [working with large changes](/docs/large-changes)
using the [customer portal example](/examples), which ships 15 real missions and the
teaching fixtures each step produces.

The aggregation commands shown here are **planned** (owned by the SkillsTech
Compiler). You can follow the whole tutorial today by reading the fixtures under
`examples/mvp-customer-portal/`, which show exactly what each command will emit. The
single-mission commands (`intent check`, `build`) are real now.

## The setup

You (or an agent) have produced many `.intent` files. In the example, that is 15
missions across four feature areas: Identity and Access, Onboarding, Billing, and
Deployment Readiness. Reading them one by one does not scale. Here is the path that
does.

## 1. Validate every mission (real)

```bash
node scripts/intent-check.mjs examples/mvp-customer-portal
```

This runs `intent check` on all 15 missions. It answers "does each file parse and
satisfy its own rules?" It does not answer the bigger questions. That is the rest of
this tutorial.

## 2. Index the missions

```bash
intent index ./intent            # planned -> mission-index.json
```

The [Mission Atlas](/docs/mission-atlas) inventory: every mission with its feature
area, risk, proof, drift, and provenance. This is the map of what exists.

## 3. View the Atlas

```bash
intent graph ./intent --view atlas   # planned
```

The same inventory as a tree from product down to code evidence. See
[Mission Atlas](/docs/mission-atlas).

## 4. See the chains

```bash
intent chains ./intent           # planned -> mission-chain-map.json
```

The [Mission Chains](/docs/mission-chains): Signup, Subscription Billing, and Operate
and Recover. This is where you learn the billing journey is blocked even though every
billing mission passes `intent check`.

## 5. Digest the session

```bash
intent summarize ./intent --since today   # planned -> intent-session-summary.json
```

The [Build Session Digest](/docs/build-session-digest): what the AI generated and
modified, plus the [Risk Radar](/docs/risk-radar) ordering of what to review first.

## 6. Read the Proof Matrix

```bash
intent proof matrix ./intent     # planned -> mission-proof-matrix.json
```

The [Proof Matrix](/docs/proof-matrix): 9 verified, 6 partial, 1 drifting. Scan the
high-risk `partial`/`drift` rows first.

## 7. Check the Risk Radar

Part of the summary from step 5. The top three are the under-verified billing and
rollback missions. Review those, not all 15 equally. See
[Risk Radar](/docs/risk-radar).

## 8. Run the Semantic Diff

```bash
intent diff ./intent --since HEAD~1   # planned
```

The [Semantic Diff](/docs/semantic-diff): guarantees added, never rules weakened,
proof gone stale. The trust-relevant changes, not the line churn.

## 9. Classify readiness

```bash
intent release ./intent --mvp    # planned -> mvp-readiness-report.json
```

The [MVP Readiness](/docs/mvp-readiness) report: the portal is `demo_safe`, bounded by
Billing, with the exact blockers to reach `internal_only`.

## 10. Produce the Release Story

The trust-aware narrative of what ships and what does not:
`examples/mvp-customer-portal/release-story.md`. It states plainly what is verified,
what is authored but unproven, and what cannot yet ship.

## The takeaway

- Do not make people read 200 missions.
- Make the system answer what exists, what changed, what is risky, what is verified,
  and what blocks deployment.
- The [Atlas](/docs/mission-atlas) shows what exists; the
  [Digest](/docs/build-session-digest) shows what changed; the
  [Proof Matrix](/docs/proof-matrix) shows what is trusted; the
  [Risk Radar](/docs/risk-radar) shows what to review first; and
  [MVP Readiness](/docs/mvp-readiness) shows whether it can ship.
