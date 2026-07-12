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

A proof can be **verified** against its source: `intent verify <proof.json> [source]`
first checks the envelope is a well-formed `intent-proof-v1` document, then re-hashes the
source and re-derives the proof's claims, confirming the source has not drifted or been
tampered with since the proof was generated (exit non-zero on a mismatch). Commit a
`.intent-proof.json` next to its source and verify it in CI to keep the proof honest.

### The proof is a canonical, signable envelope

The proof shape is published as a versioned contract, `intent-proof-v1`, so other products
sign it and re-verify it against one schema instead of each re-describing the proof. Emit the
JSON Schema with `intent proof --schema`, and validate any envelope with `validateProof(proof)`
(exported from `@skillstech/intentlang`, and browser-safe via `/core` so a signing service or
cert renderer needs no Node build). `validateProof` returns `{ valid, errors }` , a
deterministic structural check with no dependencies. Claim statuses are `planned`,
`needs_verification`, `verified`, `failed`; the proof as a whole is `draft` until a human
approves or rejects it. IL owns the envelope shape; signing, holder binding, and signature
scope are the signer's concern layered on top.

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

    intent check · build · graph · proof · schema · rules # author & check
    intent run · simulate · test · outcomes              # execute (no AI)
    intent export · import · source · migrate            # interop
    intent atlas · index · diff · merge                  # navigate & compare
    intent lift · approve · drift                        # code <-> intent

Proposed (AI-assisted; humans approve, verify, and own the result):

    intent init · plan · generate · verify · explain · translate

## Continuous integration

`intent check` is deterministic, dependency-free, and exits non-zero on any
error, so it drops straight into CI to keep a broken intent from merging. Pass
`--json` for a machine-readable `intent-check-v1` report (`ok`, a summary, and the
full diagnostics with codes, severities, and any waivers) that editors, CI, and
OpenThunder can consume directly.

`intent check` accepts a directory and recurses it, so gating a whole repo is one
command , `intent check .` , with no wrapper script. Any project can add the gate in
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
