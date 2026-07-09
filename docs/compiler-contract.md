# IntentLang Compiler Contract

> Status: draft specification. This describes the intended contract of a future
> SkillsTech Compiler for IntentLang. No implementation lives in this repository.

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
  "mission": "CreateInvoice",
  "intentFile": "CreateInvoice.intent",
  "sourceHash": "...",
  "compilerVersion": "0.1.0",
  "targets": ["markdown", "mermaid", "openapi", "tests"],
  "guarantees": [
    {
      "text": "duplicate invoices are not created",
      "status": "verified",
      "evidence": ["DuplicateInvoicePrevention.test.ts"]
    }
  ],
  "never": [
    {
      "text": "expose payment token in logs",
      "status": "needs_review",
      "evidence": []
    }
  ],
  "verification": {
    "testsPassed": true,
    "securityScanPassed": null,
    "architectureCheckPassed": true
  },
  "ai": {
    "used": true,
    "provider": "example",
    "model": "example",
    "promptHash": "...",
    "humanApproved": true
  }
}
```

## Determinism and AI

The following must succeed with `--no-ai`:

    intent check   CreateInvoice.intent --no-ai
    intent graph   CreateInvoice.intent --no-ai
    intent docs    CreateInvoice.intent --no-ai
    intent proof   CreateInvoice.intent --no-ai

Optional AI-assisted commands (`intent plan`, `intent generate`, `intent explain`,
`intent translate`, and prompt-to-intent drafting) must record provider, model,
prompt hash, input hashes, output hashes, verification result, and human approval
status. AI assists; humans approve, verify, and own the result.

## Proposed CLI

    intent init
    intent check
    intent plan
    intent generate
    intent verify
    intent explain
    intent graph
    intent docs
    intent testplan
    intent build
    intent proof

## MVP scope

The first useful version does **not** generate production code. It makes intent,
contracts, architecture, and verification explicit by producing: Markdown docs,
Mermaid diagrams, a test plan, an OpenAPI draft when an `api` block exists, a
proof JSON, contract and architecture graphs, and semantic warnings. Language
code generation (TypeScript, Python, .NET, Java scaffolding, tests, patches)
comes in later phases.
