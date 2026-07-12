# @skillstech/intentlang

Deterministic IntentLang compiler and CLI. **No AI required.** Turns a `.intent` file into
the canonical **Intent Graph** plus diagnostics, docs, a test plan, and a proof artifact,
and, for decisions, lifecycles, and outcomes, **executes the intent directly** (no code
generated). Every output is pure and deterministic: the same source always yields the same
result, so intent can be diffed, merged, tested, and trusted.

Part of [IntentLang](https://intentlanguage.dev), the intent language for AI-era software.

## Install

```bash
npm install -g @skillstech/intentlang     # then: intent check path/to/Mission.intent
npx @skillstech/intentlang help           # or run without installing
```

## Commands

```bash
# Author & check
intent init [Name]           # scaffold a runnable starter mission
intent check <file|dir>      # semantic diagnostics (exit 1 on error); a dir gates the repo
intent fmt <file|dir> -w     # canonical formatting (whitespace only; comments preserved)
intent build <file>          # docs, contract graph, test plan, .intent-proof.json
intent graph <file>          # the canonical Intent Graph (intent-graph-v1)
intent schema                # emit the graph schema + diagnostic catalog

# Execute (no AI, no generated code)
intent run <file> --inputs '{"age":20}'    # evaluate the decision(s) against inputs
intent simulate <file> --events submit,approve  # walk the lifecycle(s)
intent test <file>                          # run in-file test blocks (case/scenario)
intent outcomes <file>                      # evaluate outcome contracts vs results

# Interop
intent export <file> --format dmn|bpmn|smv|jsonschema|openapi
intent import <file> [--format dmn|bpmn] [--json]   # lift DMN/BPMN into intent
intent source <file|graph.json>             # regenerate .intent from a graph
intent migrate <graph.json> [--to <ver>]    # upgrade a persisted graph

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

## Use as a library

Both the CLI and the ES module share one core (ships `index.d.ts`).

```js
import {
  parseIntent, compileSource, buildIntentGraph,
  evaluateDecision, simulateLifecycle, runTests, evaluateOutcomes,
  toDMN, toBPMN, toJSONSchema, toOpenAPI, fromDMN, fromBPMN, importReport,
  graphToSource, migrateGraph, validateGraph, diffGraphs, mergeGraphs,
} from '@skillstech/intentlang';

const ast = parseIntent(source);
const graph = buildIntentGraph(ast);                 // canonical intent-graph-v1
const run = evaluateDecision(ast.decisions[0], { age: 20 });
```

The browser-safe subset (zero Node deps) is `@skillstech/intentlang/core`: the schema
constants, classification helpers, and the pure runtime.

## The Intent Graph (`intent-graph-v1`)

Compilation produces a canonical graph of 39 typed node kinds and 20 directed
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

Deterministic and tested (230+ tests). Five-profile language with an executable runtime,
first-class tests, outcome contracts, governance/privacy, DMN/BPMN/JSON-Schema/OpenAPI
export, DMN/BPMN import, native graph<->source round-trip, and schema migrations. Draft
(pre-1.0): the language and `intent-graph-v1` schema version independently and may still
change. See the [docs](https://intentlanguage.dev/docs) and the
[spec](https://intentlanguage.dev/docs/spec).
