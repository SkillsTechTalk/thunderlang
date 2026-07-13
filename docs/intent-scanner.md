# Intent Scanner and Fable

Software is generated and changed faster than humans can understand it. The Intent Scanner closes
that gap for a project's intent: it turns a repository's `.intent` files into one shared semantic
representation , [Intent IR](/docs/intent-graph) , and a set of **explainable findings** grouped
by risk. Deterministic, no AI, no key required; the whole pipeline runs locally.

```bash
intent scan .
```

```
intent scan .: 6 finding(s) across 1 mission(s) in 1 file(s)
  severity   1 blocker, 0 error, 4 warning, 1 info  ,  Intent IR: 3 nodes
  risk themes:
      4  Intent risk
      1  Implementation risk
      1  Security risk  (1 blocker)
  highest-impact remediation first:
    [blocker] IL-SEC-001 (1x) , Remove the secret from the surface, or gate it behind an auth requirement; ...
```

## The pipeline

`intent scan` is a staged pipeline: **discover → parse → normalize into Intent IR → run
deterministic Fable rules → produce findings → group into risk themes → report.** Pass `--json`
for the machine-readable `intent-scan-v1` report, or `--ir <path>` to write the Intent IR the rest
of the ecosystem (Atlas, Repo Mastery, OpenThunder) consumes.

## Fable , the rule authority

Findings come from **Fable**, the versioned, explainable rule authority. Fable is not a new rule
engine; it is a rule-metadata layer over IntentLang's shipped [diagnostics catalog](/docs/diagnostics),
adding what a finding needs: a **risk category**, a detection strategy (deterministic vs inferred),
required evidence, remediation, and suppression / risk-acceptance policy. The universal pack covers
every catalog rule; technology, domain, and organization packs extend it.

## The finding model

Every finding is explainable , never "AI detected a possible issue." Each carries:

| Field | Meaning |
| --- | --- |
| `ruleId` / `ruleVersion` | which Fable rule fired |
| `category` | one of the canonical risk categories (Intent, Security, Privacy, Reliability, ...) |
| `detected` / `why` | what was found and why it matters |
| `evidence` | the source location(s) the check fired on |
| `affectedNodes` | the Intent IR nodes involved |
| `severity` / `confidence` | how bad, and how sure (deterministic checks are `Observed`) |
| `detectionType` | `deterministic` or `inferred` |
| `remediation` / `suggestedVerification` | how to fix it and how to prove it stays fixed |
| `humanReviewRequired` | true only when the detection is inferred, not deterministic |
| `suppressed` / `riskAccepted` | governance state |

Deterministic findings are trustworthy on their own; inferred findings are flagged for review, so
an AI-suggested issue is never presented as a confirmed fact.

## Risk themes and remediation order

Findings roll up into **risk themes** (one per risk category) and a **highest-impact remediation
sequence** , blockers first, then the most common rules , so a team knows what to fix first. The
Scanner is the deterministic spine; inferred rules and role-aware explanations layer on top.
