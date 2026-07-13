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

## Continuous drift , Intent Guardian

The Scanner tells you the risk in a project *now*. **Intent Guardian** tells you what a *change*
did to it. Given a before and after state, `intent guardian <before> <after>` answers the one
question drift monitoring exists for:

> what changed, what intent it affects, what risk it introduced, what must be reverified, and
> what learning content should be refreshed.

```bash
intent guardian old/ new/
```

```
intent guardian: NEEDS-ATTENTION  (before.intent -> after.intent)
  changed    +0 / -1 / ~1 nodes
  affected   CreateInvoice
  introduced risk (2):
    [warning] guarantee-without-verification , Guarantee "no duplicate invoice" has no verification.
    [blocker] IL-SEC-001 , Event "Charged" payload field "token" is a Secret; secrets must not ...
  must reverify (2):
    Guarantee no duplicate invoice , contract element changed, its verification no longer holds
  learning to refresh:
    CreateInvoice , a governing intent artifact changed, lessons for it may be stale
```

It compares the two states by **mission identity** (not file path, so it survives a rename),
composing the [semantic diff](/docs/semantic-diff) with the Scanner: findings present after but
not before are *introduced risk*; contract elements (guarantees, never-rules, verifications,
decisions) that changed *must be reverified*; and the missions whose intent changed have lessons
that are now stale. `needs-attention` fires only when a change introduces *blocking* risk , an
improvement that merely adds a test is `review`, not an alarm. `--json` for the machine report;
exit is non-zero on `needs-attention`, so it gates a pull request.

## Look forward , Intent Simulator

Guardian looks back at a change that happened. **Intent Simulator** looks forward at one that has
not: `intent impact <base> <proposed>` estimates what a proposed change would touch *before* you
build it.

```bash
intent impact current/ proposed/
```

```
intent impact: REVIEW  (base -> proposed)
  change touches 2 node(s); ripples to 3 dependent(s)
  deterministic impact by type:  1 Mission, 1 Outcome, 1 Metric
  risk it would introduce (2):
    [warning] guarantee-without-verification , ...
    [blocker] IL-SEC-001 , Event "Charged" payload field "token" is a Secret; ...
  release risk: 1 blocking finding(s)
```

The Simulator computes a **blast radius** , the transitive reach of the change over the intent
graph , so you see which missions, outcomes, requirements, components, and tests a change would
ripple into. Crucially, it keeps the four kinds of impact the directive requires **separate and
honest**:

- **deterministic dependency impact** , the blast radius, traced over real relationships;
- **rule-derived risk** , the findings the proposed state would introduce;
- **AI-predicted impact** , explicitly `null` in deterministic mode (never fabricated);
- **unknown impact** , changed nodes whose ripple cannot be traced deterministically (non-factual
  classification, or no relationships), surfaced rather than hidden.

A change that introduces a release blocker or a contradiction is `REVIEW` (exit non-zero); a purely
additive, safe change is `SAFE`. Run it in a pull request to see the impact before the merge.

## Remember why , Intent Ledger

Scanner, Guardian, and Simulator all reason about intent at a point in time. **Intent Ledger** keeps
the part a project loses as it moves *through* time: the memory of *why*. It is an append-only,
hash-chained record of a project's meaning and decisions , provenance, assumptions, approvals,
rejections, corrections, accepted risks, verifications, and stale lessons.

```bash
intent ledger project.ledger.json --subject CreateInvoice
```

```
intent ledger project.ledger.json , CreateInvoice  (chain VALID)
  why built:
    - chose an idempotency key to prevent duplicate charges
  approved by: pm
  corrections (inferred intent fixed): 1
  accepted risks: 1
  verifications: 2
  change history: 6 entries
```

Every entry hashes over the previous one, so the ledger is **tamper-evident**: you cannot quietly
rewrite history. `intent ledger <file>` verifies the whole chain and, if it was altered, locates the
break to the exact entry:

```
intent ledger project.ledger.json: 6 entries, chain BROKEN at #1 , entry 1 hash does not match its content (tampered)
```

It answers the questions a project forgets over time , *why was this built, who approved it, what
did we assume, which inferred intent did a human correct, which risks did we accept, what proved it,
which lessons went stale.* The Ledger is deterministic (the caller supplies timestamps, so the record
is reproducible and testable) and append-only , `record` returns a new ledger rather than mutating
the old one. `--json` emits the machine-readable `intent-ledger-v1` report; exit is non-zero when the
chain does not verify, so a broken audit trail fails CI.
