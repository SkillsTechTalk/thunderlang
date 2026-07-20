# ThunderLang Compiler Contract

> Status: this describes the contract the reference compiler upholds. It is implemented
> in this repository (`compiler/`, published as `@skillstech/thunderlang`) and is
> deterministic, no AI required. Pre-1.0, so the contract can still change; the emitted
> Intent IR has its own committed [schema stability policy](/docs/schema-stability),
> which versions independently of the package.

The compiler does not merely convert syntax into code. It converts intent into
validated engineering artifacts. It must be **deterministic first**: every stage
below runs without AI when invoked with `--no-ai`.

## Pipeline

    .thunder source
      → parse            (syntax → Intent AST)
      → semantic analysis (types, missing requirements, impossible guarantees)
      → contract graph   (missions, guarantees, never, assumptions, risks)
      → architecture graph (services, APIs, events, data, dependencies, owners)
      → implementation plan (deterministic, before code generation)
      → target generation (adapter-driven artifacts)
      → verification     (checks that guarantees hold)
      → proof artifact   (.thunder-proof.json)

## Stages

### 1. Parse
Input: `.thunder` files. Output: a typed Intent AST. Parsing runs in three
deterministic sub-stages, no lookahead grammar and no AI:

1. **Lex into rows.** The source is split into significant lines, each carrying its
   indentation depth. Blank lines are dropped; `#` comments are stripped here, so
   they never reach the tree (semantic `note` blocks are kept, they are meaning, not
   comments).
2. **Build the indentation tree (the concrete tree).** Rows nest by indentation into
   a tree of `{ text, children, line }` nodes. Indentation *is* the block structure,
   so the concrete tree mirrors the source one-to-one and every node keeps its source
   line for diagnostics and spans.
3. **Lower to the typed AST.** Per-construct parsers walk the tree, one per block
   kind (`parseFields`, `parseDecision`, `parseLifecycle`, `parseService`,
   `parseApi`, `parseEvent`, `parseCommand`, ...), producing the typed Intent AST:
   missions, goals, inputs, outputs, guarantees, never rules, decisions, lifecycles,
   targets, verification requirements, and attached `note`s with their spans.

Because the tree is derived purely from indentation and the lowering is a fixed walk,
the same source always yields the same AST, byte for byte.

### 2. Semantic analysis
Validates type usage and detects missing requirements, impossible or ambiguous
guarantees, security-sensitive fields, and target incompatibilities. Semantic
warnings are valuable on their own. Example:

> Mission CreateInvoice guarantees duplicate prevention but declares no
> idempotency key, unique order reference, or lookup rule.

It also runs deterministic security and type checks , the mistakes that slip past a
prompt: a secret-typed field on an event payload (`IL-SEC-001`, secrets must not ride the
event bus), a sensitive value returned from an API with no auth requirement (`IL-SEC-002`),
and a field whose type is unrecognized and almost certainly a typo (`IL-TYPE-001`). See the
full [diagnostics catalog](/docs/diagnostics).

### 3. Contract graph
A graph of missions, requirements, guarantees, assumptions, risks, forbidden
behavior, and verification rules. Foundation for OpenThunder drift detection.

### 4. Architecture graph
A graph of services, APIs, events, databases, dependencies, owners, boundaries,
consumers, and publishers.

### 5. Implementation plan
A deterministic, ordered plan produced before any code generation, emitted as
`implementation-plan.json`. The steps are derived from the AST in a fixed category
order, so the plan is reproducible and diffable: **APIs → preconditions (`requires`)
→ guarantees → never rules → events → verifications**, each category in source order,
numbered from 1. No AI, no heuristics, no reordering.

```json
{
  "compilerVersion": "0.1.0",
  "generatedAt": "2026-07-13T00:00:00.000Z",
  "mission": "CreateInvoice",
  "steps": [
    { "order": 1,  "description": "Validate precondition: Customer" },
    { "order": 2,  "description": "Validate precondition: ApprovedOrders" },
    { "order": 3,  "description": "Enforce guarantee: invoice.total is never negative" },
    { "order": 4,  "description": "Enforce guarantee: duplicate invoices are not created" },
    { "order": 5,  "description": "Enforce guarantee: every invoice is auditable" },
    { "order": 6,  "description": "Prevent forbidden behavior: create invoice for unapproved order" },
    { "order": 7,  "description": "Prevent forbidden behavior: expose payment token in logs" },
    { "order": 8,  "description": "Add verification: unit tests" },
    { "order": 9,  "description": "Add verification: duplicate prevention test" },
    { "order": 10, "description": "Add verification: audit trail test" },
    { "order": 11, "description": "Add verification: security scan" }
  ]
}
```

Each `description` names the AST element it came from, so a downstream tool (or a human
reviewer) can trace every planned step back to the intent that required it. `generatedAt`
is the only non-deterministic field; everything else is a pure function of the source.

### 6. Target generation (adapters)
Each target is produced by a modular adapter. No target is hardcoded into the
compiler. An adapter answers: can I generate this target, what source blocks do I
need, what artifacts do I produce, what verification can I run, and what proof can
I emit. Planned adapters: `dotnet`, `typescript`, `python`, `openapi`, `mermaid`,
`markdown`, `tests`.

### 7. Verification
Runs type checks, tests, lint, security checks, architecture boundary checks,
contract checks, and generated-test validation.

### 8. Proof artifact
Emits `.thunder-proof.json`. Shape:

```json
{
  "schemaVersion": "0.1.0",
  "missionName": "CreateInvoice",
  "sourceFile": "CreateInvoice.thunder",
  "sourceHash": "sha256:...",
  "compilerVersion": "0.1.0",
  "generatedAt": "2026-07-09T00:00:00Z",
  "targetsRequested": ["Markdown", "Mermaid", "Tests", "Proof"],
  "targetsGenerated": [
    "docs/CreateInvoice.md",
    "graphs/CreateInvoice.mmd",
    "tests/CreateInvoice.testplan.md"
  ],
  "guarantees": [
    {
      "text": "duplicate invoices are not created",
      "status": "planned",
      "evidence": ["tests/CreateInvoice.testplan.md"]
    }
  ],
  "neverRules": [
    {
      "text": "expose payment token in logs",
      "status": "needs_verification",
      "evidence": []
    }
  ],
  "verification": {
    "syntaxPassed": true,
    "semanticPassed": true,
    "targetsGenerated": true
  },
  "ai": { "used": false },
  "humanApproval": { "required": true, "approved": false },
  "proofStatus": "draft"
}
```

Guarantee and never-rule `status` values: `planned`, `needs_verification`,
`verified`, or `failed`. `proofStatus` is `draft` until a human approves.

A proof can be **verified** against its source: `thunder verify <proof.json> [source]`
first checks the envelope is a well-formed `intent-proof-v1` document, then re-hashes the
source and re-derives the proof's claims, confirming the source has not drifted or been
tampered with since the proof was generated (exit non-zero on a mismatch). Commit a
`.thunder-proof.json` next to its source and verify it in CI to keep the proof honest.

### The proof is a canonical, signable envelope

The proof shape is published as a versioned contract, `intent-proof-v1`, so other products
sign it and re-verify it against one schema instead of each re-describing the proof. Emit the
JSON Schema with `thunder proof --schema`, and validate any envelope with `validateProof(proof)`
(exported from `@skillstech/thunderlang`, and browser-safe via `/core` so a signing service or
cert renderer needs no Node build). `validateProof` returns `{ valid, errors }` , a
deterministic structural check with no dependencies. Claim statuses are `planned`,
`needs_verification`, `verified`, `failed`; the proof as a whole is `draft` until a human
approves or rejects it. IL owns the envelope shape; signing, holder binding, and signature
scope are the signer's concern layered on top.

## Determinism and AI

The following must succeed with `--no-ai`:

    intent check   CreateInvoice.thunder
    intent graph   CreateInvoice.thunder
    intent build   CreateInvoice.thunder   # docs, test plan, proof
    intent proof   CreateInvoice.thunder

Optional AI-assisted commands (`thunder plan`, `thunder generate`, `thunder explain`,
`thunder translate`, and prompt-to-intent drafting) must record provider, model,
prompt hash, input hashes, output hashes, verification result, and human approval
status. AI assists; humans approve, verify, and own the result.

## The CLI

Shipped and deterministic (run `thunder help` for the full reference):

    intent check · build · graph · proof · schema · rules # author & check
    intent run · simulate · test · outcomes              # execute (no AI)
    intent export · import · source · migrate            # interop
    intent atlas · index · diff · merge                  # navigate & compare
    intent lift · approve · drift                        # code <-> intent

Proposed (AI-assisted; humans approve, verify, and own the result):

    intent init · plan · generate · verify · explain · translate

## Continuous integration

`thunder check` is deterministic, dependency-free, and exits non-zero on any
error, so it drops straight into CI to keep a broken intent from merging. Pass
`--json` for a machine-readable `intent-check-v1` report (`ok`, a summary, and the
full diagnostics with codes, severities, and any waivers) that editors, CI, and
OpenThunder can consume directly.

### Code scanning (SARIF)

`thunder check <path> --format sarif` emits a **SARIF 2.1.0** log, so ThunderLang diagnostics
show up natively where teams already look: GitHub / GitLab code scanning (inline PR
annotations and the Security tab) and any SARIF-aware IDE. Each diagnostic becomes a SARIF
result with its stable rule id, a level (`blocker`/error → `error`, `warning` → `warning`,
`info` → `note`), a file location, and a precise line when known; every rule carries its
catalog description and a link to the [diagnostics catalog](/docs/diagnostics). SARIF output
is a *report* (exit 0) , keep a plain `thunder check .` step as the gate.

```yaml
name: Intent code scan
on: [push, pull_request]
jobs:
  intent-scan:
    runs-on: ubuntu-latest
    permissions: { security-events: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx @skillstech/thunderlang check . --format sarif > intent.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: intent.sarif }
```

For a triage view rather than a pass/fail gate, `thunder report [dir]` aggregates every
`.thunder` file into an intent-health summary: diagnostics by severity and area, the most common
codes, and coverage signals (are guarantees verified, do missions have tests, are outcomes
contracted). Pass `--json` for a machine-readable `intent-report-v1` a dashboard can consume.

`thunder check` accepts a directory and recurses it, so gating a whole repo is one
command , `thunder check .` , with no wrapper script. Any project can add the gate in
three lines with the published GitHub Action:

```yaml
- uses: SkillsTechTalk/intent-language@main
  with:
    paths: ./intent   # a file or directory; default is the whole repo
```

This repo gates itself on push and pull request with
`.github/workflows/intent-check.yml`, which also runs the test suite, docs-consistency,
and schema-sync checks. Warnings do not fail the build; errors do.

A minimal workflow for any repo:

```yaml
name: Intent Check
on: [push, pull_request]
jobs:
  intent-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm run intent:check
```

## Scope

The compiler does **not** generate production code. It makes intent, contracts,
architecture, and verification explicit, and it *executes* the executable parts
(decisions, lifecycles, outcome contracts) without generating code. It produces:
Markdown docs, Mermaid diagrams, a test plan, JSON Schema / OpenAPI from typed fields, a
proof JSON, the canonical Intent Graph, and semantic diagnostics, plus DMN/BPMN/NuSMV
export and DMN/BPMN import. Language code generation (TypeScript, Python, .NET, Java
scaffolding, tests, patches) is an adapter concern for later phases.
