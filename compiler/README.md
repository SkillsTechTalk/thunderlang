# @intentlang/compiler

Deterministic IntentLang compiler and CLI. **No AI required.** Turns a `.intent` file into the
artifacts the SkillsTech ecosystem consumes: contract and architecture graphs, an implementation
plan, Markdown docs, a Mermaid diagram, a test plan, and a proof artifact. The pipeline is
parse → semantic diagnostics → contract graph → architecture graph → implementation plan → proof.

Part of [IntentLang](https://intentlanguage.dev), the intent language for AI-era software.

## Install

```bash
npm install -g @intentlang/compiler   # then run: intent check path/to/Mission.intent
```

Or run without installing:

```bash
npx @intentlang/compiler check path/to/Mission.intent
```

## Commands

```bash
intent check <file.intent>                 # parse + semantic diagnostics (exit 1 on error)
intent graph <file.intent> [--out .intent] # contract-graph.json + architecture-graph.json + proof
intent proof <file.intent> [--out .intent] # .intent-proof.json
intent build <file.intent> [--out .intent] # all artifacts + docs.md + mermaid.mmd + testplan.md
```

Gate your `.intent` files in CI with GitHub Actions: see the
[compiler contract](https://intentlanguage.dev/docs/compiler-contract) (Continuous integration).

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

missing subject (mission/service/event/api/database) / missing goal · guarantee or never-rule without
verification · **duplicate-prevention guarantee without an idempotency mechanism** (the signature demo) ·
Secret/Token field without a never-log rule.

## Consumed by

OpenThunder reads `contract-graph.json` / `architecture-graph.json` / `.intent-proof.json` for Intent Inventory,
Coverage, and Drift (its `packages/intent` reader, flag `OPENTHUNDER_INTENTLANG`). Stable slug IDs let OT key drift
precisely. See the ecosystem vault: `il-to-ot-intent-v1`.

## Status

MVP, deterministic, tested against `examples/CreateInvoice.intent`. Not production-ready. Parser covers the core +
architecture constructs; full grammar, OpenAPI target, and richer semantics are the next slices (see `../TODO.md`).
