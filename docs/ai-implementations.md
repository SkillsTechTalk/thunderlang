# AI implementations

An **AI implementation** is an intentionally deferred, AI-assisted implementation
that ThunderLang treats as a first-class, traceable, verifiable, reviewable concept —
not an ordinary TODO comment.

The principle across the SkillsTech ecosystem:

> **AI writes a candidate. ThunderLang defines what is allowed. OpenThunder proves
> whether it is safe and correct. Repo Mastery proves that humans understand it.
> SkillsTech connects the entire experience.**

This page documents the ThunderLang-owned foundation (contract `intent-ai-v1`). It is
deterministic and needs no AI provider: declaring, listing, hashing, the manifest, the
marker format, and the provider-neutral prompt all run locally.

## Declaring an implementation

A mission declares the contract and boundaries; the body is written by AI later:

```
mission CalculateRiskScore

input
  customer: Customer
output
  score: RiskScore

requires
  customer.id is not empty
guarantees
  same customer produces same score
never
  call external network services
  use nondeterministic randomness

implement with ai
  id: calculate-risk-score
  scope: function_body
  strategy: generate_once
  editing: collaborative
  risk: medium
  approval: required
  may_modify
    CalculateRiskScore.body
  must_not_modify
    CalculateRiskScore.contract
    Customer
    RiskScore
    architecture
```

Concise form:

```
implement with ai pending
```

This is **not** treated as accidentally-missing code. `thunder check` reports it as an
informational `INTENT-AI-001`, and the compiler tracks its state.

### Fields

- `id` — stable identifier (defaults to the mission slug).
- `scope` — `expression` | `function_body` | `method` | `test` | `adapter`. No
  repository-wide generation in the MVP.
- `strategy` — `generate_once` | `regenerate`.
- `editing` — `managed` | `collaborative` | `adopted`.
- `risk` — `low` | `medium` | `high` | `critical`. High and critical **require human
  approval** even after automated verification.
- `approval` — `none` | `required` | a reviewer role (e.g. `security_reviewer`).
- `may_modify` / `must_not_modify` — the permitted and forbidden targets. Any change
  outside `may_modify` fails verification.

## State lifecycle

One shared state model across all four products:

| State | Meaning |
| --- | --- |
| `PENDING` | Declared; no implementation exists. |
| `GENERATED` | Code exists, not yet verified. |
| `VERIFIED` | Automated verification passed. |
| `VERIFIED_AWAITING_APPROVAL` | Passed, but policy requires human approval. |
| `APPROVED` | Required human approval recorded. |
| `MODIFIED` | Code or contract changed after verification. |
| `INVALID` | Verification failed or proof integrity broken. |
| `REJECTED` | A reviewer explicitly rejected the candidate. |
| `ADOPTED` | The AI region became human-owned code. |

Any change to a verified implementation invalidates its verification. Any change to
the contract invalidates the proof. `PENDING`, `GENERATED`, `MODIFIED`, `INVALID`,
`REJECTED`, and `VERIFIED_AWAITING_APPROVAL` all block a production build; so does
`VERIFIED` when approval is required. Only `APPROVED` and `ADOPTED` ship.

## Managed-region markers

Generated target code carries machine-readable markers. These are authoritative; any
human-readable comment is optional decoration. The marker token is the same in every
language; only the comment prefix differs (`//` for TS/JS/C#/Java/Go/Rust, `#` for
Python).

```
// <intent:ai-implementation
// id="calculate-risk-score"
// mission="CalculateRiskScore"
// contract-hash="sha256:..."
// implementation-hash="sha256:..."
// generation-id="gen-00042"
// status="verified"
// editing="collaborative"
// risk="medium"
// >
function calculateRiskScore(customer) { /* ... */ }
// </intent:ai-implementation>
```

Short form: `// <intent:ai-implementation id="calculate-risk-score" status="generated">`.
After adoption, the marker becomes `<intent:implementation id="..." origin="ai"
ownership="human">`. A single shared parser (`parseMarkers`) handles all languages, so
no product re-implements marker parsing.

## Manifest

Project-level metadata lives in `.thunder/ai-implementations.json` (schema `1.0`):

```json
{
  "schemaVersion": "1.0",
  "projectId": "payments-service",
  "implementations": [
    {
      "id": "calculate-risk-score",
      "mission": "CalculateRiskScore",
      "sourceLocation": "src/risk.thunder",
      "scope": "function_body",
      "editing": "collaborative",
      "risk": "medium",
      "approval": "required",
      "status": "PENDING",
      "contractHash": "sha256:...",
      "implementationHash": null,
      "proofLocation": ".thunder/proofs/calculate-risk-score.json"
    }
  ]
}
```

## Architecture rules

A mission (or project) can declare dependency constraints that the AI implementation
must not violate:

```
architecture
  domain must not depend on infrastructure
  application may depend on domain
  infrastructure may implement application ports
```

ThunderLang parses these into structured rules (`from`, `relation`, `to`) and includes
them in the contract graph and the contract hash. OpenThunder's Architecture Lens
checks the real dependency graph against them; a forbidden edge is `INTENT-ARCH-307`.
A line the rule parser cannot understand is a `INTENT-ARCH-001` warning, not an error.

## Candidate selection

The AI may generate several candidates; **ThunderLang and OpenThunder pick the winner
by measurable rules — an LLM never decides.** Declare the policy:

```
selection
  require all verification checks
  prefer lower complexity
  prefer fewer dependencies
  prefer smaller implementation
  prefer better mutation score
```

`require` filters out candidates whose verification failed (a smaller candidate that
fails its checks never wins). `prefer` rules rank the survivors lexicographically, and
ties break stably by id, so selection is fully deterministic and reproducible.
ThunderLang derives `size` / `complexity` / `dependencies` from the region; OpenThunder
supplies the verified metrics (`mutationScore`, `allocation`). `thunder ai select`
applies the policy over `.thunder/candidates/<id>/`.

## Hashing and proof validity

Two independent hashes, both deterministic:

- **Contract hash** — normalized inputs, outputs, requires, guarantees, never rules,
  constraints, errors, verify, architecture, and risk/approval policy. Order-insensitive
  where the language is; formatting-insensitive.
- **Implementation hash** — the managed region only, after normalization (strip marker
  lines, normalize line endings, trim trailing whitespace, drop leading/trailing blank
  lines). Formatting-only edits do not invalidate a proof; a real code change does.

A proof is valid only when `current contract hash == proof contract hash` **and**
`current implementation hash == proof implementation hash`. When either changes, the
proof is stale, the status becomes `MODIFIED`, and production eligibility is revoked
until re-verification.

## CLI (ThunderLang)

```bash
intent check                          # reports pending implementations, stale proofs, approvals
intent ai list ./examples             # the manifest, per implementation + state
intent ai generate <file.thunder>      # provider-neutral prompt for an external agent (Path 1)
intent ai gate ./examples             # production gate: resolve real state, block if unshippable
intent ai gate ./examples --allow-pending   # dev build: tolerate PENDING only
intent ai approve <dir> <id> --by <reviewer> [--role <role>] [--note <note>]   # record approval
intent ai reject  <dir> <id> --by <reviewer> [--note <note>]                  # record rejection
intent ai adopt <targetFile> <id>     # rewrite an AI region to human-owned, preserving provenance
intent ai select <dir> <id>           # deterministically pick a winning candidate by measurable rules
intent build <file> --mode production # refuses to build while an AI implementation is unshippable
```

`thunder ai generate` produces a structured prompt (mission, contract, scope, allowed
and forbidden targets, architecture rules, verification requirements, and the exact
marker format) with **no AI required**.

`thunder ai gate` resolves each implementation's **real state** from three inputs — the
declaration, the generated region (parsed from its markers), and the proof — then
blocks unless every implementation ships (`APPROVED` / `ADOPTED`). `--allow-pending`
forgives `PENDING` for a dev build but never `MODIFIED` / `INVALID` / missing approval.
`thunder build --mode production` applies the same gate before generating.

`thunder ai approve` / `reject` record a human decision in `.thunder/ai-approvals.json`,
**bound to the exact contract and implementation hashes reviewed**. The compiler
refuses to approve stale or unverified work, and once the code or contract changes the
recorded approval no longer counts (the implementation returns to `MODIFIED`). Each
decision emits a versioned `IntentAiImplementationApproved` / `Rejected` event.

`thunder ai adopt` rewrites `<intent:ai-implementation>` to
`<intent:implementation origin="ai" ownership="human">`, keeping the provenance while
removing active AI management. `verify` is driven by OpenThunder — see the workflow below.

## Provider-neutral generation

ThunderLang never requires an embedded LLM, and **no code is sent anywhere unless you
explicitly configure a provider**. Three paths:

1. **External agent handoff** — `thunder ai generate` emits a prompt you paste into
   Claude Code / Codex / Cursor; import the returned patch.
2. **BYOK** — your configured provider key, with explicit consent before any code is sent.
3. **Local model** — a local provider (e.g. Ollama).

Verification, status tracking, proof viewing, and Repo Mastery learning never require a
provider.

## Product responsibilities

- **ThunderLang** owns the language, the contract, the state model, the manifest, the
  marker format, and the hashes (this page).
- **OpenThunder** verifies (region integrity, syntax, types, contract, effects,
  architecture, security, tests, determinism), generates the proof at
  `.thunder/proofs/{id}.json`, emits SARIF, and gates CI/production. Reuses its
  Architecture Lens and Security Lens.
- **Repo Mastery** turns a verified implementation into human understanding
  (explanation, walkthrough, reviewer checklist, flashcards, quiz, explain-back,
  handoff notes) and tracks ownership.
- **SkillsTech** provides the unified IDE experience: status indicators, and the
  generate / import / verify / approve / reject / regenerate / adopt code actions, with
  deep links between the three.

## Migration from TODO comments

Before:

```typescript
function calculateRiskScore(customer: Customer): RiskScore {
  // TODO: implement with AI
  throw new Error("Not implemented");
}
```

After — declare the contract and boundaries in a mission:

```
implement with ai
  id: calculate-risk-score
  scope: function_body
  editing: collaborative
  risk: medium
```

Generated target:

```typescript
// <intent:ai-implementation id="calculate-risk-score" status="generated">
function calculateRiskScore(customer: Customer): RiskScore { /* ... */ }
// </intent:ai-implementation>
```

The difference: the TODO is invisible to tooling, while the declared implementation is
tracked, hashed, verifiable, gated, and teachable across all four products.
