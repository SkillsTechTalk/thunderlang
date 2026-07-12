# IntentLang Compiler Contract

> Status: this describes the contract the reference compiler upholds. It is implemented
> in this repository (`compiler/`, published as `@skillstech/intentlang`) and is
> deterministic, no AI required. Pre-1.0, so the contract can still change.

The compiler does not merely convert syntax into code. It converts intent into
validated engineering artifacts. It must be **deterministic first**: every stage
below runs without AI when invoked with `--no-ai`.

## Pipeline

    .intent source
      → parse            (syntax → Intent AST)
      → semantic analysis (types, missing requirements, impossible guarantees)
      → contract graph   (missions, guarantees, never, assumptions, risks)
      → architecture graph (services, APIs, events, data, dependencies, owners)
      → implementation plan (deterministic, before code generation)
      → target generation (adapter-driven artifacts)
      → verification     (checks that guarantees hold)
      → proof artifact   (.intent-proof.json)

## Stages

### 1. Parse
Input: `.intent` files. Output: an Intent AST. Validates syntax and identifies
missions, goals, inputs, outputs, guarantees, never rules, targets, and
verification requirements.

### 2. Semantic analysis
Validates type usage and detects missing requirements, impossible or ambiguous
guarantees, security-sensitive fields, and target incompatibilities. Semantic
warnings are valuable on their own. Example:

> Mission CreateInvoice guarantees duplicate prevention but declares no
> idempotency key, unique order reference, or lookup rule.

### 3. Contract graph
A graph of missions, requirements, guarantees, assumptions, risks, forbidden
behavior, and verification rules. Foundation for OpenThunder drift detection.

### 4. Architecture graph
A graph of services, APIs, events, databases, dependencies, owners, boundaries,
consumers, and publishers.

### 5. Implementation plan
A deterministic, ordered plan produced before any code generation. Example:

    Plan CreateInvoice
    1. Add CreateInvoice API endpoint
    2. Validate approved orders
    3. Check existing invoice by orderId
    4. Create invoice transactionally
    5. Publish InvoiceCreated event
    6. Add duplicate prevention tests
    7. Add audit log tests
    8. Update API docs

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
Emits `.intent-proof.json`. Shape:

```json
{
  "schemaVersion": "0.1.0",
  "missionName": "CreateInvoice",
  "sourceFile": "CreateInvoice.intent",
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

## Determinism and AI

The following must succeed with `--no-ai`:

    intent check   CreateInvoice.intent
    intent graph   CreateInvoice.intent
    intent build   CreateInvoice.intent   # docs, test plan, proof
    intent proof   CreateInvoice.intent

Optional AI-assisted commands (`intent plan`, `intent generate`, `intent explain`,
`intent translate`, and prompt-to-intent drafting) must record provider, model,
prompt hash, input hashes, output hashes, verification result, and human approval
status. AI assists; humans approve, verify, and own the result.

## The CLI

Shipped and deterministic (run `intent help` for the full reference):

    intent check · build · graph · proof · schema        # author & check
    intent run · simulate · test · outcomes              # execute (no AI)
    intent export · import · source · migrate            # interop
    intent atlas · index · diff · merge                  # navigate & compare
    intent lift · approve · drift                        # code <-> intent

Proposed (AI-assisted; humans approve, verify, and own the result):

    intent init · plan · generate · verify · explain · translate

## Continuous integration

`intent check` is deterministic, dependency-free, and exits non-zero on any
error, so it drops straight into CI to keep a broken intent from merging.

This repo gates every `.intent` file on push and pull request with
`.github/workflows/intent-check.yml`, which runs `npm run intent:check`
(`node scripts/intent-check.mjs`). The wrapper finds every authored `.intent`
file (skipping the `.intent/` output directory) and runs the real `intent check`
on each, failing the build if any file has errors. Warnings do not fail the build.

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
