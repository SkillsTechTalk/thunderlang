# Ecosystem current-state map

A grounded inventory of the SkillsTech Intent Intelligence ecosystem, taken before making
broad changes, so new work reuses what exists instead of forking it. This page records what
is already built, where concepts are duplicated, and, most importantly, **what IntentLang
does and does not own**.

> Headline: the shared semantic backbone the vision asks for already largely exists. The risk
> is not missing foundations, it is **duplicate graphs and overlapping engines** across repos.
> The right work is consolidation and filling narrow gaps, not rebuilding.

## Who owns what

| Product | Role | Owns | Status |
| --- | --- | --- | --- |
| **IntentLang** (this repo) | The language + shared schema | `intent-graph-v1`, `intent-ir-v1` (superset IR), Fable rules (`intent-fable-v1`), the Scanner spine (`intent-scan-v1`), Ledger, Guardian, Simulator, Atlas, Lift, Draft, the AI-implementation contract | Built |
| **OpenThunder** | Verify code vs intent | Verification verdicts (`verification-verdict-v1`), evidence packs, risk (`risk-assessment-v1`), SARIF-with-ship-verdict, `can-i-ship`; consumes `il-to-ot-drift-v1` / `mission-index-v1` | Built |
| **RepoMastery** | Learn / master a codebase | Comprehension learning: `intent-learning-pack-v1`, the **Atlas Learning Compiler** (`CompiledLearningPath`, `teach-this-session-v1`), `intent-mission-mastery-v1`; consumes `intent-graph-v1` + `mastery-pack-v1` | Built |
| **SkillsTech Runtime (STRU)** | Provider-neutral AI gateway | `run({ product, task, privacyMode })`, provider registry (Anthropic/OpenAI-compat/Ollama/local/private), BYOK, **no-silent-fallback + fail-closed privacy**, audit-without-content | Built |
| **SkillsTech (monorepo)** | Studio + site + IDE | Intent/Mission Atlas UI (`app/atlas`, `ide/…/intentatlas`), `@skillstech/studio-model` (graph precursor), authz/entitlements SDK | Built |
| **Skills Tech Talk** | Explain / defend / voice drills | External SaaS (`skillstechtalk.com`); consumes approved Atlas + mastery output | External |
| **SkillsTech Workspace** | Control plane | Identity, entitlements, proof aggregation, provider policy | Partial |

## The shared Intent IR already exists , do not fork it

IntentLang's `intent-ir-v1` (`compiler/src/intent-ir.mjs`) is a strict superset of the
canonical `intent-graph-v1` and already carries everything the vision's node envelope asks
for: `id, type, title, summary, description, status, owner, source, sourceLocation,
sourceType, version, hash, createdTime, updatedTime, confidence, provenance, reviewStatus,
approvalStatus, permissions, sensitivity, retention, tags, evidence, metadata`. It ships the
exact confidence taxonomy (`Confirmed / Observed / Derived / Inferred / Speculative /
Conflicted`), the provenance list (user-authored → human-corrected) with a **factual subset**,
and a `validateIR()` **honesty guard** (non-factual provenance must carry a confidence and
cannot be `approved` unless reviewed). It even declares the learning node vocabulary
(`LearningModule, LearningPath, Drill, Quiz, Flashcard, Misconception, LearnerConceptState`).

**Consequence:** every product must project onto `intent-graph-v1` / `intent-ir-v1`, never
define a competing canonical graph. RepoMastery's dead `architecture-ir-v1` proposal was
correctly abandoned as "subsumed by `intent-graph-v1`."

## Duplication to consolidate (the real backlog)

1. **OpenThunder ArchGraph** (`packages/archgraph`) , a real second deterministic graph. It is
   reconciled up into `intent-ir-v1` via `archGraphToIR`, and the ADRs treat IL as schema
   owner, but it remains the graph most at risk of drift.
2. **SkillsTech has three graph copies** , `@skillstech/studio-model` vs
   `app/studio/shared/*` vs `ide/…/graph/*` (a hand-copied mirror + a TS variant). The repo's
   own docs flag this as the #1 consolidation risk.
3. **RepoMastery** , two `mastery-pack-v1` copies (consumer-lean vs producer-rich), and its
   learning generators overlap ~80% with SkillsTech Talk's in-app "Repository Mastery."
4. **Two IntentLang compilers** , this repo's `.mjs` implementation (upstream owner) and
   `SkillsTech/compiler` (a TypeScript `@skillstech/intentlang` that ST vendors). Divergent
   siblings, not a file-identical fork.

## Boundaries this repo will respect

- **IntentLang does not build a learning / mastery engine.** RepoMastery owns comprehension
  learning and already has the Atlas Learning Compiler; a learning compiler here would be the
  "second divergent mastery engine" the ecosystem constitution forbids. IntentLang's job is to
  emit a faithful Intent IR (`intent scan --ir`) that RepoMastery projects into lessons.
- **IntentLang does not add AI SDKs or a provider router.** SkillsTech Runtime (STRU) is the
  provider-neutral gateway with BYOK and no-silent-fallback. IntentLang's AI surface stays
  provider-neutral (`intent draft` builds a brief; STRU executes it).
- **IntentLang owns the schema and the deterministic Scanner.** Filling scanner gaps
  (`intent risks / gaps / unverified / coverage / unknowns / contradictions`) and keeping the
  IR faithful (e.g. never-rule verification edges) is squarely in charter.

## Shared identifiers and deep links

- `missionId` (slug) + `intentProofHash` (= `.intent-proof.json` `sourceHash`) are the ratified
  declared↔verified join keys across IL / OT / RM / STT.
- `mission-index-v1` carries `missionId` + `area`; OpenThunder and RepoMastery join on it with
  no remapping.
- Deep-link shape (RepoMastery): `?tab=atlas&mission=<missionId>&v=<intentProofHash>`.

## Highest technical risks

- **Graph duplication drift** (ArchGraph, studio-model copies) diverging from `intent-ir-v1`.
- **Compiler fork drift** between this repo's `.mjs` and `SkillsTech/compiler`'s TypeScript.
- **Overclaiming confidential-use readiness** before STRU/STW privacy controls are wired in
  every consumer.
- **Learning-engine overlap** (RepoMastery vs SkillsTech Talk) if the shared contract is not held.

## Open questions (not answerable from code)

- Which repo becomes the single home of the IntentLang compiler (this `.mjs` vs ST's TS)?
- When does SkillsTech Workspace take ownership of the ecosystem contracts from STT?
- Is ArchGraph intended to remain OT-internal indefinitely, or collapse into `intent-ir-v1`?
