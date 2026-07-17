# @skillstech/thunderlang

Deterministic ThunderLang compiler and CLI. **No AI required.** Turns a `.intent` file into
the canonical **Intent Graph** plus diagnostics, docs, a test plan, and a proof artifact,
and, for decisions, lifecycles, and outcomes, **executes the intent directly** (no code
generated). Every output is pure and deterministic: the same source always yields the same
result, so intent can be diffed, merged, tested, and trusted.

Part of [ThunderLang](https://thunderlang.dev), the intent-oriented language for AI-era software.

> Previously published as `@skillstech/intentlang`. The package was renamed to
> `@skillstech/thunderlang`; the old name remains as a deprecated alias.

## Install

```bash
npm install -g @skillstech/thunderlang     # then: intent check path/to/Mission.intent
npx @skillstech/thunderlang help           # or run without installing
```

## Commands

```bash
# Author & check
intent init [Name]           # scaffold a runnable starter mission
intent check <file|dir>      # semantic diagnostics (exit 1 on error); a dir gates the repo
intent fmt <file|dir> -w     # canonical formatting (whitespace only; comments preserved)
intent build <file>          # docs, contract graph, test plan, .intent-proof.json
intent graph <file>          # the canonical Intent Graph (intent-graph-v1)
intent check . --format sarif   # SARIF 2.1.0 for GitHub/GitLab code scanning
intent schema                # emit the graph schema + diagnostic catalog
intent rules  ·  intent explain <CODE>   # the full diagnostic catalog / one code
intent proof --schema        # the canonical proof envelope schema (intent-proof-v1)

# Execute (no AI, no generated code)
intent run <file> --inputs '{"age":20}'    # evaluate the decision(s) against inputs
intent simulate <file> --events submit,approve  # walk the lifecycle(s)
intent test <file>                          # run in-file test blocks (case/scenario)
intent outcomes <file>                      # evaluate outcome contracts vs results
intent style <file>                         # resolve style intents vs the canonical token space

# Interop  (9 export formats)
intent export <file> --format dmn|bpmn|smv|jsonschema|openapi|tokens|css|mermaid|playwright
intent import <file> [--format dmn|bpmn] [--json]   # lift DMN/BPMN into intent
intent source <file|graph.json>             # regenerate .intent from a graph
intent migrate <graph.json> [--to <ver>]    # upgrade a persisted graph
intent verify <proof.json> [src]            # confirm a proof matches its source

# Navigate & compare
intent atlas <dir> [--search q]   intent index <dir>
intent diff <before> <after>      intent merge <base> <ours> <theirs>

# Code <-> intent
intent lift <file>   intent approve <file>   intent drift <file>
```

Run `intent help` for the full reference.

## Executable intent

A decision is a runnable specification, and tests live in the same file:

```
mission CanEnroll
decision Eligibility
  inputs
    age
    score
  rule adult
    when age >= 18 and score >= 70
    return Eligible
  default
    return NotEligible
test Eligibility
  case adult
    given age 20, score 90
    expect Eligible
```

```bash
intent run mission.intent --inputs '{"age":20,"score":90}'   # -> Eligible, with a trace
intent test mission.intent                                    # -> 1/1 passed
```

No AI, no generated code. The intent itself decides.

## Brand as intent, checked and exported

`style_intent` models brand and visual language as a governed extension of the experience
profile: tokens bind to a **canonical, lockable address space** (off-namespace tokens are
flagged), and an `accessibility_target` is always a `proposed` claim, never asserted as met.
Export the tokens to **W3C Design Tokens**, a drop-in **CSS** sheet, the whole graph to
**Mermaid**, or an experience to a **Playwright** test scaffold.

The compiler also catches the mistakes prompts ship: a secret-typed field on an event payload
(`IL-SEC-001`), a sensitive API output with no auth (`IL-SEC-002`), a mistyped field
(`IL-TYPE-001`), and more , the full catalog is `intent rules` / [docs](https://thunderlang.dev/docs/diagnostics).

## Use as a library

Both the CLI and the ES module share one core (ships `index.d.ts`).

```js
import {
  parseIntent, compileSource, buildIntentGraph,
  evaluateDecision, simulateLifecycle, runTests, evaluateOutcomes,
  toDMN, toBPMN, toJSONSchema, toOpenAPI, toDesignTokens, toCss, toMermaid, toPlaywright,
  fromDMN, fromBPMN, importReport, graphToSource, migrateGraph, validateGraph,
  diffGraphs, mergeGraphs, securityDiagnostics, analyzeStyle,
  validateProof, intentProofJsonSchema, toSarif,
} from '@skillstech/thunderlang';

const ast = parseIntent(source);
const graph = buildIntentGraph(ast);                 // canonical intent-graph-v1
const run = evaluateDecision(ast.decisions[0], { age: 20 });
```

### One compiler, five consumers

`@skillstech/thunderlang/core` is the **universal** entry point , the whole compiler with zero
Node.js dependencies, so the *same code* runs in Node (this CLI, OpenThunder), the browser
(SkillsTech Studio, Repo Mastery web), and React Native (SkillsTech Mobile). No fork, no
re-implementation.

```js
import {
  parseIntent, buildIntentGraph, compileSource, scanProject,
  buildAtlas, searchAtlas, buildFocusGraph, intentBrief,   // navigate + focus (Intent Lens)
  diffGraphs, graphToSource, coverageView, sha256,          // the shared join-key hash
} from '@skillstech/thunderlang/core';
```

It ships TypeScript types (`core.d.ts`), and a conformance test guarantees the surface never
gains a Node-only or engine-specific dependency (`node:` builtin, `TextEncoder`, `Buffer`, …),
so it keeps bundling everywhere. The `.` entry is this same surface plus the Node-only helpers
(the CLI, LSP, filesystem lift/drift). See
[One compiler, five consumers](https://thunderlang.dev/docs/single-compiler).

## The Intent Graph (`intent-graph-v1`)

Compilation produces a canonical graph of 40 typed node kinds and 20 directed
relationship types, across five profiles (product, experience, system, delivery, design).
The vocabulary is closed and enforced (an anti-fork test guarantees the compiler only
emits canonical types); `intent schema` emits its draft-07 JSON Schema, also shipped as
the static `intent-graph.schema.json` in this package (CI-guaranteed in sync with the
code). Consumers (OpenThunder, Repo Mastery, SkillsTech Studio) build to this graph, and
`intent validate <graph.json>` self-checks a graph against the canonical vocabulary.

## Output location

Artifacts are written to **`.intent/<mission-slug>/`** (not `dist/`), a committed,
scannable location: `contract-graph.json`, `architecture-graph.json`,
`implementation-plan.json`, `.intent-proof.json`, and `<mission>.md` / `.mmd` /
`.testplan.md`.

## Status

Deterministic and tested (330+ tests: unit, property, fuzz, composition). Five-profile
language with an executable runtime, first-class tests, outcome contracts, style intent,
governance/privacy, and security/type checks; nine export adapters
(DMN/BPMN/NuSMV/JSON-Schema/OpenAPI/Design-Tokens/CSS/Mermaid/Playwright), DMN/BPMN import,
native graph<->source round-trip, schema migrations, a canonical proof envelope
(`intent-proof-v1`), and SARIF code-scanning output. Draft (pre-1.0): the language and
`intent-graph-v1` schema version independently and may still change. See the
[docs](https://thunderlang.dev/docs) and the [spec](https://thunderlang.dev/docs/spec).
