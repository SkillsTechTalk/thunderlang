# One compiler, five consumers

IntentLang (`@skillstech/intentlang`) is the **single source of truth** for parsing, graph
building, analysis, and navigation across the ecosystem. OpenThunder, Repo Mastery, SkillsTech
(Studio + site), SkillsTech Mobile, and the `intent` CLI all run the *same* compiler code, not
a re-implementation. This page is the consumption contract.

> The rule: no product re-parses `.intent`, re-derives the Intent Graph, or forks the Intent IR.
> They import this package. A finding, a hash, or a graph is identical no matter who computed it.

## Two entry points

| Import | Runtime | Use it in |
| --- | --- | --- |
| `@skillstech/intentlang` (`.`) | Node.js | the `intent` CLI, OpenThunder server, any build step; adds filesystem/CLI helpers on top of everything in `/core` |
| `@skillstech/intentlang/core` | **Universal** (Node, browser, React Native) | SkillsTech Studio (browser), Repo Mastery web, SkillsTech Mobile, and any bundler target |

`/core` is the whole compiler minus the two Node-only entry points (`cli.mjs`, `drift.mjs`,
which touch the filesystem). Everything a consumer needs to go from source to a focused,
navigable, analyzed graph is universal.

## What `/core` gives every consumer

```js
import {
  parseIntent, buildIntentGraph,        // .intent source -> AST -> intent-graph-v1
  compileSource,                        // -> docs, graphs, plan, proof (in memory)
  scanIntent, scanProject,              // -> Intent IR + Fable findings + risk themes
  coverageView, unverifiedView, risksView, gapsView, unknownsView, contradictionsView,
  buildAtlas, searchAtlas, expandNode,  // whole-system map + navigation
  buildFocusGraph, intentBrief, makeScope, // Intent Lens: a focused subgraph + brief
  diffGraphs, mergeGraphs,              // Change Lens: diff by meaning + 3-way merge
  graphToSource,                        // graph -> editable .intent (round-trip)
  validateIR, graphToIR,                // the shared intent-ir-v1
  sha256, sha256hex,                    // the canonical join-key hash (intentProofHash)
} from '@skillstech/intentlang/core';
```

Studio can author + navigate in the browser; Repo Mastery can project the graph into lessons;
SkillsTech Mobile can render a Focus Graph and Intent Brief; OpenThunder can parse and verify,
all from the same functions.

## Why it is safe to share

- **Deterministic and AI-free.** The whole `/core` surface is pure computation. No model, no
  network, same input → same output, in every runtime.
- **One hash everywhere.** The ecosystem join key `intentProofHash` is SHA-256. `/core` ships a
  pure `sha256` whose output is **byte-identical** to Node's `node:crypto`, so a hash computed
  in a React Native app equals one computed on the OpenThunder server. There is no "browser
  hash vs server hash" split.
- **The boundary is enforced, not hoped for.** A conformance test walks `/core`'s entire
  transitive import graph and fails CI if any module imports a `node:` builtin. The universal
  guarantee cannot silently regress when someone adds a feature.

## Ownership boundaries (what this package does NOT do)

The single compiler owns the *semantic representation*. It deliberately stops there:

- **AI provider calls** go through **SkillsTech Runtime (STRU)**, never an SDK in this package.
  `intent draft` builds a provider-neutral brief; STRU executes it.
- **Deterministic comprehension / mastery** (source-grounded knowledge, quizzes, flashcards,
  spaced repetition) is **Repo Mastery**, which *consumes* this graph via its own projection.
  The compiler ships the vocabulary, not the engine.
- **AI-driven practice / training** (asking more questions, teaching more, adaptive dialogue,
  voice) is **Skills Tech Talk**, which calls SkillsTech Runtime for the model. Repo Mastery
  is deterministic; Skills Tech Talk is the generative pedagogy layer on top of it.
- **Verification of code against intent** is **OpenThunder**, which consumes the intent
  artifacts and emits its own evidence.

So the layering is clean: this package is the shared truth about *what the intent is*; the
siblings decide what to *do* with it.

## Adopting it (per consumer)

Once the package is published, each consumer retires its fork/copy and imports this one.

- **The `intent` CLI** , already this package. Nothing to do.
- **OpenThunder** (Node / TypeScript) , `npm i @skillstech/intentlang`. Import `parseIntent`,
  `buildIntentGraph`, `scanProject`, `graphToIR` from `.` (Node) or `/core`. Keep ArchGraph as
  a *language extractor* that projects up via `graphToIR` into `intent-ir-v1`; delete any local
  `.intent` parsing or graph re-derivation.
- **Repo Mastery** (web / TypeScript) , import from `/core`. It can now parse `.intent` directly
  (previously it only ingested JSON) and feed its `projectIntentGraph` from `buildIntentGraph`.
- **SkillsTech** (browser / TypeScript) , import from `/core`. Replace the `SkillsTech/compiler`
  TypeScript fork and the three graph copies (`studio-model`, `app/studio/shared`,
  `ide/.../graph`) with this package's `buildIntentGraph` / `buildAtlas` / `graphToIR`.
- **SkillsTech Mobile** (React Native / Hermes) , import from `/core`. The compiler is now
  engine-safe: it uses no `TextEncoder`, `Buffer`, or other non-guaranteed global (enforced by
  the conformance test). A **verified, turnkey drop-in** (a `missionLens` data module + jest
  test + steps) is in
  [`examples/adoption/skillstech-mobile/`](https://github.com/SkillsTech/intent-language-site/tree/main/examples/adoption/skillstech-mobile)
  , it typechecks against the packed tarball. **Metro caveat:** Metro must resolve the package
  `exports` map , on React Native < 0.79 set `resolver.unstable_enablePackageExports = true` in
  `metro.config.js` (it is the default from 0.79, and SkillsTech Mobile is on 0.81, so no change
  is needed there).

Every consumer gets the same functions, the same graph shape, and the same `intentProofHash`.

## For contributors

- Anything importable from `/core` must stay Node-free. Need a filesystem or process API? It
  belongs in `cli.mjs` (or another Node-only entry), not in a module `/core` can reach.
- Need a hash? Use `sha256` from `hash.mjs` (re-exported by `emit.mjs` and `/core`). Never
  `import 'node:crypto'` in the analysis layer.
- The conformance test (`test/core-universal.test.mjs`) is the guardrail; if it fails, a Node
  dependency leaked into the universal surface.
