# @intentlang/compiler (MVP emit stage)

Deterministic IntentLang compiler. **No AI** (`--no-ai` is the only mode today). Turns a `.intent` file into
the artifacts the Skills Tech ecosystem consumes. This is the first, smallest compiler slice: parse → semantic
diagnostics → contract graph → architecture graph → implementation plan → proof. Code generation comes later.

> Placement (founder decision, 2026-07-09): the compiler **stays in the IntentLang repo for now** (in `compiler/`).
> It has zero coupling to the website, so it can still move to a dedicated SkillsTech Compiler repo later if needed.

## Commands

```bash
node src/cli.mjs check <file.intent>                 # parse + semantic diagnostics (exit 1 on error)
node src/cli.mjs graph <file.intent> [--out .intent] # contract-graph.json + architecture-graph.json + proof
node src/cli.mjs proof <file.intent> [--out .intent] # .intent-proof.json
node src/cli.mjs build <file.intent> [--out .intent] # all artifacts + docs.md + mermaid.mmd + testplan.md
```

## Output location (important for OpenThunder)

Artifacts are written to **`.intent/<mission-slug>/`** by default, **not `dist/`**. OpenThunder's scanner
excludes `dist/` and `node_modules/`, so proof artifacts must live in a committed, scannable location. `.intent/`
mirrors the ecosystem dot-dir convention (`.openthunder/`). Emitted per mission:

- `contract-graph.json` — missions, guarantees, never-rules, apis, events, services (stable slug IDs)
- `architecture-graph.json` — services, apis, events, databases, dependencies
- `implementation-plan.json` — deterministic ordered plan (no code gen)
- `.intent-proof.json` — schema-versioned proof (source hash, compiler version, guarantee/never status, diagnostics)
- `<mission>.md`, `<mission>.mmd`, `<mission>.testplan.md` — Markdown docs, Mermaid graph, test plan

## What the semantic pass catches (slice 1)

missing mission / missing goal · guarantee or never-rule without verification · **duplicate-prevention guarantee
without an idempotency mechanism** (the signature demo) · Secret/Token field without a never-log rule.

## Consumed by

OpenThunder reads `contract-graph.json` / `architecture-graph.json` / `.intent-proof.json` for Intent Inventory,
Coverage, and Drift (its `packages/intent` reader, flag `OPENTHUNDER_INTENTLANG`). Stable slug IDs let OT key drift
precisely. See the ecosystem vault: `il-to-ot-intent-v1`.

## Status

MVP, deterministic, tested against `examples/CreateInvoice.intent`. Not production-ready. Parser covers the core +
architecture constructs; full grammar, OpenAPI target, and richer semantics are the next slices (see `../TODO.md`).
