# IntentLang Ecosystem Brief

> The shared reference every SkillsTech sibling product should understand.
> IntentLang is the intent language for AI-era software. Proof is the
> through-line: each product proves a different thing about the same mission.

## One sentence per sibling

- **IntentLang** defines what software should do.
- **SkillsTech Compiler** turns intent into deterministic artifacts.
- **OpenThunder** verifies whether implementation matches intent.
- **Repo Mastery** teaches humans to understand the intent.
- **SkillsTech Talk** trains humans to defend the intent.
- **SkillsTech Certified** certifies understanding of intent-oriented engineering.
- **SkillsTech IDE** helps engineers author and inspect intent.
- **SkillsTech Workspace** stores and signs proof of intent, verification, and ownership.
- **SkillsTech Social** lets engineers share learning and milestones around intent.

## Roles and boundaries

| Product | Role | Owns | Does not own | Core question |
| --- | --- | --- | --- | --- |
| SkillsTech Compiler | Compile intent into deterministic artifacts | parser, AST, semantic analysis, graphs, generators, proof, CLI, no-AI execution | repo verification, learning, certification, defense, signing | Can the language produce artifacts? |
| OpenThunder | Verify repo vs declared intent | Intent Inventory, Coverage, Drift, Can-I-Ship, Verification Pack | parsing, compiler semantics, learning, exams | Does the implementation still satisfy the intent? |
| Repo Mastery | Teach the human the mission | learning paths, mission mastery, flashcards, quizzes, reality checks, ownership proof | compiler, repo verification, final exam | Can the engineer explain and safely change it? |
| SkillsTech Talk | Explain and defend intent | defense drills, review rooms, exec summary, pushback practice | compiler, verification, learning, exam content | Can the engineer defend it under pressure? |
| SkillsTech Certified | Certify the method | curriculum, lessons, quizzes, mock exams, labs, readiness, track | compiler, drift detection, mission learning, signing | Does the learner understand the method? |
| SkillsTech IDE | Author and visualize intent | editing, highlighting, command runner, graph/diagnostics/proof viewers | compiler semantics, repo verification, certification, signing | Can a developer write and run it comfortably? |
| SkillsTech Workspace | Store, govern, sign proof | proof portfolio, team visibility, signed artifacts, audit, billing | compiler, verification, learning, defense, certification content | Can the org prove who defined and approved it? |
| SkillsTech Social | Share milestones | milestone sharing | compiler, verification, certification, signing | Can engineers share credible progress without spam? |

## Shared artifact contracts

Every sibling should recognize these artifact types.

**Intent source**
- `*.intent`

**Compiler outputs**
- `.intent-proof.json`
- `contract-graph.json`
- `architecture-graph.json`
- `implementation-plan.json`
- `docs/*.md`
- `graphs/*.mmd`
- `tests/*.testplan.md`
- `openapi/*.yaml`

**Compiler -> OpenThunder handoff**
- `il-to-ot-drift-v1`, emitted by `intent handoff <approved.intent>`. Names the
  mission, approval + source hash, `mapsTo`, and `expectations[]` (per guarantee /
  never / input / api) with the `check` OpenThunder must run against real repo
  evidence. The compiler does not verify repo-wide; OpenThunder does.

**OpenThunder output**
- `intent-verification-pack-v1`
- `intent-drift-report-v1`
- `intent-coverage-v1`
- `can-i-ship-with-intent-v1`

**Running the drift round-trip**

The compiler emits the handoff; OpenThunder consumes it against real repo evidence.

```bash
# IntentLang side: approve the intent in place (adds the approval + source hash),
# then emit the handoff pack to a file.
intent approve CreateInvoice.intent --by "you"
intent handoff CreateInvoice.intent > intent-handoff.json

# OpenThunder side: check the repo against the pack.
openthunder intent drift --pack intent-handoff.json --repo .
```

`openthunder intent drift` prints an `intent-drift-report-v1` and exits non-zero when
the implementation has drifted from the approved intent.

**Can-I-Ship gate (`--intent-pack`)**

The same pack plugs into OpenThunder's signature verb so a drifted intent stops a
ship the code-level checks alone would pass:

```bash
openthunder can-i-ship --intent-pack intent-handoff.json
```

The drift report is folded into the ship verdict and can only tighten it, never
loosen it:

- `drift` (a declared input, guarantee, or never rule is unmet) -> **HOLD**
- `review` (a declared expectation lacks repo evidence) -> **CAUTION**
- `in_sync` -> no change to the code-level verdict

It is surfaced in the text output, in `--json` (an `intentDrift` block), and in
`--pr-comment`. Without `--intent-pack`, Can-I-Ship behaves exactly as before, so the
intent gate is strictly opt-in.

**Repo Mastery output**
- `intent-learning-pack-v1`
- `intent-mission-mastery-v1`
- `intent-ownership-proof-v1`

**SkillsTech Talk output**
- `intent-defense-proof-v1`
- `intent-explanation-score-v1`

**SkillsTech Certified output**
- `intent-certification-progress-v1`
- `intent-oriented-programming-cert-v1`

**SkillsTech Workspace output**
- `signed-intent-proof-v1`
- `workspace-intent-portfolio-v1`

## The canonical example

All siblings use `examples/CreateInvoice.intent` as the shared example. It is
small enough to teach and serious enough to show the value.

## The first demo (whole-ecosystem story)

1. Write `CreateInvoice.intent`.
2. Run `intent check`.
3. The compiler warns if duplicate prevention lacks idempotency.
4. Add `idempotencyKey`.
5. Run `intent build`.
6. Generate Markdown docs, a Mermaid graph, a test plan, and proof JSON.
7. OpenThunder checks whether the implementation matches the mission.
8. Repo Mastery creates flashcards and reality checks.
9. SkillsTech Talk asks the engineer to defend the mission.
10. Workspace stores the proof.

## Why it matters

Most tools handle one part of the lifecycle. IntentLang can be the bridge between
requirements, architecture, AI coding, implementation, tests, verification,
documentation, learning, communication, certification, proof, and governance, a
shared language across the whole ecosystem.
