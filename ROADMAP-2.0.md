# Road to ThunderLang™ 2.0

Twenty items in four phases, adopted 2026-11-27 from an outside review of 1.6.1. The goal is to finish them in 2026,
then release **2.0** once everything is tested and performance is solid. From 2.0 on, programs stay compatible
(see the compatibility policy), so the stable language specification has to land before it.

Rules that apply to every item:
- Each item ships as its own pull request with tests, docs, and a review record (DESIGN.md §10).
- Advertise only what works. The README status table and `src/lib/capabilities.ts` change only when the item
  works and is tested.
- "Done" means merged to `main` with the full compiler suite green, not just written.

Status: **done** · **in review** (PR open) · **next** · **planned**

## Phase 1: Foundation

| # | Item | Done when | Status |
|---|---|---|---|
| 1.1 | Unify the syntax, specification, and documentation | One language reference covers missions and Core and how they coexist; a file's kind can be told from the file itself; editor docs use Thunder names (compatibility aliases kept) | **done: #185, #188** |
| 1.2 | Better semantic round-trip and behavioral testing | Read → Core → write round-trips checked by behaviour (same outputs), not just parsing; Thunder write's proof is backed by compiling and running the result | **done: #189** |
| 1.3 | ThunderBench, a public benchmark | Benchmark tasks, hidden tests, and a runner published with honest results, including where Python does better. Creating the public repo needs founder approval | **done in this repo: #191** (own public repo awaits approval; people track awaits participants) |
| 1.4 | A polished browser playground | thunderlang.dev runs Core in the browser on the Thunder engine: edit, run, see the result and the steps, with nothing to install | **done: #192** |
| 1.5 | One compelling end-to-end demonstration | One recorded flow: read an unfamiliar repo in Thunder → change a rule → verified patch → behaviour-level review | **in review: #194** |

## Phase 2: Real applications

| # | Item | Done when | Status |
|---|---|---|---|
| 2.1 | TypeScript/npm package interoperability | `Use "<package>" from npm as <name>` on the TypeScript target, exact values across the boundary, TC408 everywhere else | **done: #186** |
| 2.2 | C#/.NET package interoperability | `Use "<type>" from .NET as <name>` and `from NuGet "<package>" version "<v>"` on the C# target, same rules as npm | **in review: #193** |
| 2.3 | Persistent data and HTTP abstractions | Save/find records and serve/call HTTP from Core, with explicit adapters (SQLite first) and the same meaning on every supported target | **in progress**: first slice, stored lists saved to JSON on Python and the Thunder engine, in review; SQLite, other targets, and HTTP next |
| 2.4 | A production-quality VS Code extension | Go to definition, references, rename, code actions with previewed fixes, Core and mission files both first-class | planned |
| 2.5 | One complete reference application | A real app (data, sign-in, API, screens, tests) written in Thunder that someone can use, built only from shipped features | planned |

## Phase 3: Depth

| # | Item | Done when | Status |
|---|---|---|---|
| 3.1 | A language-independent semantic engine | Thunder's meaning (decimals, division, rounding, text, nothing, mutation, errors, overflow, effects) is written down in its own words and every backend conforms to it; nothing is defined as "whatever Python does" | planned |
| 3.2 | A permission and effect system | Functions state what they may touch (`May:` files, network, database, secrets); the compiler checks it, and libraries are unverified boundaries unless declared | planned |
| 3.3 | Distributed workflows and reliability primitives | Publish/handle events, retries with back-off, duplicate protection, and failed-message handling, with adapters that state each provider's real guarantees | planned |
| 3.4 | Cross-service semantic change analysis | Thunder Review shows which *behaviours* changed across services ("$100 refunds now go to review"), with stable rule identities | planned |
| 3.5 | An external language adapter SDK | A documented, tested way for others to add a language reader or target | planned |

## Phase 4: Stability and reach

| # | Item | Done when | Status |
|---|---|---|---|
| 4.1 | A stable language specification | The 2.0 spec: grammar, meaning, diagnostics, and compatibility promise, frozen for 2.x | planned |
| 4.2 | Community-driven package bindings | Shared bindings that describe a library's functions and capabilities in Thunder terms, with review and versioning | planned |
| 4.3 | Multilingual programming | The same program in English, Spanish, and French keywords, with localized diagnostics and one shared meaning | planned |
| 4.4 | Production observability and debugging | The Time Machine on real runs: OpenTelemetry traces shown as Thunder steps, with external effects replayed, not repeated | planned |
| 4.5 | Broader formal verification | Evidence words used everywhere (Proven, Tested, Partially checked, Unverified, Violated) and more rules proven by the solver where that's feasible | planned |

## The Design Recipe (asked for by OpenThunder, 2026-11-27)

The Design Recipe from *How to Design Programs* (Felleisen, Findler, Flatt, Krishnamurthi): data design, signature
and purpose, examples, template, implementation, testing. Pyret and Mio support parts of it already; Thunder does not
claim to be first. ThunderLang owns the language side, in its one semantic model; OpenThunder builds the screens on
top and does not keep a second model. These change the language, so they land before 2.0 freezes the syntax.

| # | Item | Done when | Status |
|---|---|---|---|
| D.1 | `examplesOf(source)` | A library call returns every example (Core `Test`/`Expect` and mission `test`/`case`) with its function, inputs, and expected answer, so OpenThunder stops parsing text. The example syntax stays as it is, or OpenThunder is told first | **next** (small; unblocks OpenThunder) |
| D.2 | Typed holes | `Give ?number` is a valid draft that never runs or ships; the diagnostic says what is available (inputs, expected kind) and asks, never fills in a value | planned |
| D.3 | Either/or data types | A data type with alternatives (`successful`, `declined`, `pending`); a function that misses a case is a diagnostic at its line; recursive data (lists, trees) | planned |
| D.4 | Templates from data | A deterministic library call turns a data definition into a code template (atomic, compound, either/or, recursive), and says when structural recursion is the wrong tool | planned |
| D.5 | Change impact | `affectedBy(change)`: which functions, examples, and guarantees to look at again when a data definition changes (add `suspended` → everything that does not handle it) | planned |
| D.6 | The design model | Per function: data, signature, purpose, examples, template, holes, obligations, provenance, as a versioned shape (`thunder-design-v1`) and a library call | planned (with 3.1) |
| D.7 | Levels and modes | Beginner to Verified as one language with a compiler option, diagnostics that adapt; professionals keep writing without ceremony | planned |
| D.8 | `design.*` tools for agents | Stateless MCP operations from analyse to review; an agent may propose design changes but never edits an approved expected answer to make code pass | planned |

## The 2.0 gate

- All twenty items done.
- Full compiler suite, cross-target conformance, and docs checks green on every supported toolchain.
- A performance pass: compile and run times measured on the benchmark programs, with regressions fixed and the
  numbers published. Measured with `compiler/scripts/speed.mjs` (everyday commands, CPU time) and
  `compiler/scripts/perf.mjs` (reading a whole repository).

## Speed

Thunder has to feel instant. Baseline on 2026-11-27 (Node 22, CPU time; Node itself is 20 ms):

| command | 1.6.1 | after #190 | target for 2.0 |
|---|---|---|---|
| `thunder check` (a mission) | 180 ms | 140 ms (merged) | under 80 ms |
| `thunder run` / `test` (Thunder engine) | 180 ms | 140 ms | under 80 ms |
| `thunder read` (a small file) | 200 ms | 170 ms | under 100 ms |
| `thunder read` (4,300 lines of Go) | 600 ms | 570 ms | under 250 ms |

Done: the Unicode collation data no longer loads at start, and Node's compile cache is on (#190). Next: load only
the modules a command needs (today every command loads all ~95), and the reader's hot spots (statement
classification, comments stripped again for each nested block, garbage collection on large files).
- Release notes, the README, the site, OpenThunder, and Skills Tech Talk updated together.
