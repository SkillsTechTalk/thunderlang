# Road to ThunderLang™ 2.0

Twenty items, adopted 2026-11-27 from an outside review of 1.6.1, plus the Design Recipe pieces OpenThunder asked
for. **Reordered by return on investment on 2026-11-27:** 2.0 is the work in *Before 2.0* below (finished in 2026,
then tested and released). The items under *After 2.0* are still planned, for 2.x, but nobody is waiting on them yet and each
is large. From 2.0 on, programs stay compatible (see the compatibility policy), so every change to the language
lands before the specification is frozen.

How the order was chosen: who gains now (OpenThunder, people trying Thunder, the evidence graph) against the size
of the work. Items keep their numbers, so pull requests and notes still point to the right place.

Rules that apply to every item:
- Each item ships as its own pull request with tests, docs, and a review record (DESIGN.md §10).
- Advertise only what works. The README status table and `src/lib/capabilities.ts` change only when the item
  works and is tested.
- "Done" means merged to `main` with the full compiler suite green, not just written.

Status: **done** · **in progress** · **in review** (PR open) · **next** · **planned**

## Done

| # | Item | Status |
|---|---|---|
| 1.1 | Unify the syntax, specification, and documentation | **done: #185, #188** |
| 1.2 | Better semantic round-trip and behavioral testing | **done: #189** |
| 1.3 | ThunderBench, a public benchmark | **done in this repo: #191** (its own public repo awaits founder approval; the people track awaits participants) |
| 1.4 | A polished browser playground | **done: #192** |
| 1.5 | One compelling end-to-end demonstration | **done: #194** |
| 2.1 | TypeScript/npm package interoperability | **done: #186** |
| 2.2 | C#/.NET package interoperability | **done: #193** |
| D.1 | `examplesOf(source)`: every example in a file, as data | **done: #198** |

## Before 2.0, in this order

### First: what people and OpenThunder are waiting for

| Order | # | Item | Done when | Why now | Status |
|---|---|---|---|---|---|
| 1 | 2.3a | Saved data | `Store … as a list of …` keeps records between runs, in one file format on every engine that supports it | The reference app needs it | **done**: Python and the Thunder engine (#199), TypeScript (#200), Go (#201) |
| 2 | D.2 | Typed holes | `Give ?number` is a valid draft that never runs or ships; the diagnostic says what is available (inputs, expected kind) and asks, never fills in a value | Small; OpenThunder asked; changes the language, so before the freeze | **done: #203** |
| 3 | D.3 | Either/or data types | A data type with alternatives (`successful`, `declined`, `pending`); a function that misses a case is a diagnostic at its line; recursive data (lists, trees) | OpenThunder asked; real apps need it; changes the language | **done: #206** (showing an alternative in words is a follow-up) |
| 4 | 2.3b | HTTP | Serve and call HTTP from Core on Python and TypeScript, with the same meaning on both | The reference app needs it | **in review: #208**: endpoints and calls on Python, TypeScript, and the Thunder engine |
| 5 | 2.5 | One complete reference application | A real app (data, sign-in, API, screens, tests) written in Thunder that someone can use, built only from shipped features | The strongest proof that Thunder works; building it finds the real gaps | planned |
| 6 | 3.4 + D.5 | Behaviour changes across services, and change impact | Thunder Review shows which *behaviours* changed across services ("$100 refunds now go to review"), with stable rule identities; `affectedBy(change)` lists the functions, examples, and guarantees to look at again | What sets Thunder apart; builds on Trace (#125) and `write --behaviour` (#194); feeds the evidence graph | planned |
| 7 | Speed | Everyday commands under 80 ms | The targets in *Speed* below | Every person feels it on every command; a 2.0 gate anyway | planned |

### Then: cut to a first useful version

| Order | # | Item | First version (the rest moves to 2.x) | Status |
|---|---|---|---|---|
| 8 | D.4 | Templates from data | A deterministic library call turns a data definition into a code template (atomic, compound, either/or, recursive); small once D.3 is in | planned |
| 9 | 2.4 | VS Code extension | Go to definition, references, and rename, for Core and mission files. Code actions with previewed fixes later | planned |
| 10 | 4.5 | Evidence words | Proven, Tested, Partially checked, Unverified, Violated used the same way everywhere. More solver proofs later | planned |
| 11 | 3.1 | Thunder's meaning in its own words | Decimals, division, rounding, text, nothing, mutation, errors, overflow, and effects written down, each rule tied to the cross-target conformance tests that already check it | planned |
| 12 | 4.1 | A stable language specification | The 2.0 spec: grammar, meaning, diagnostics, and compatibility promise, frozen for 2.x. Last, after every language change above | planned |
| — | 1.3 | ThunderBench's own public repository | Almost no work; waits for founder approval | waiting |

## After 2.0 (planned for 2.x)

Valuable, but large, and nobody is waiting on them yet. Each comes back when there is demand: real users, a
community, outside contributors, or an app that needs it.

| # | Item | Done when | Comes back when |
|---|---|---|---|
| 2.3c | Saved data: SQLite, and stored lists on C#, Java, and Rust | Explicit adapters (SQLite first) and the same meaning on every target | An app outgrows JSON files, or people build for those targets |
| 3.2 | A permission and effect system | Functions state what they may touch (`May:` files, network, database, secrets); the compiler checks it, and libraries are unverified boundaries unless declared | A small version may come early if agents writing Thunder need it |
| 3.3 | Distributed workflows and reliability primitives | Publish/handle events, retries with back-off, duplicate protection, and failed-message handling, with adapters that state each provider's real guarantees | An app needs events |
| 3.5 | An external language adapter SDK | A documented, tested way for others to add a language reader or target | Outside contributors ask |
| 4.2 | Community-driven package bindings | Shared bindings that describe a library's functions and capabilities in Thunder terms, with review and versioning | There is a community |
| 4.3 | Multilingual programming | The same program in English, Spanish, and French keywords, with localized diagnostics and one shared meaning | People ask for it |
| 4.4 | Production observability and debugging | The Time Machine on real runs: OpenTelemetry traces shown as Thunder steps, with external effects replayed, not repeated | Thunder runs in production |
| D.6 | The design model | Per function: data, signature, purpose, examples, template, holes, obligations, provenance, as a versioned shape (`thunder-design-v1`) and a library call | After 3.1, and when OpenThunder's use of D.2–D.4 shows what it needs |
| D.7 | Levels and modes | Beginner to Verified as one language with a compiler option, diagnostics that adapt; professionals keep writing without ceremony | After D.6 |
| D.8 | `design.*` tools for agents | Stateless MCP operations from analyse to review; an agent may propose design changes but never edits an approved expected answer to make code pass | After D.6 |

## The Design Recipe (asked for by OpenThunder, 2026-11-27)

The Design Recipe from *How to Design Programs* (Felleisen, Findler, Flatt, Krishnamurthi): data design, signature
and purpose, examples, template, implementation, testing. Pyret and Mio support parts of it already; Thunder does not
claim to be first. ThunderLang owns the language side, in its one semantic model; OpenThunder builds the screens on
top and does not keep a second model. D.1–D.5 change the language or its library, so they land before 2.0 freezes
the syntax; D.6–D.8 follow in 2.x.

## The 2.0 gate

- Everything under *Before 2.0* done.
- Full compiler suite, cross-target conformance, and docs checks green on every supported toolchain.
- A performance pass: compile and run times measured on the benchmark programs, with regressions fixed and the
  numbers published. Measured with `compiler/scripts/speed.mjs` (everyday commands, CPU time) and
  `compiler/scripts/perf.mjs` (reading a whole repository).
- Release notes, the README, the site, OpenThunder, and Skills Tech Talk updated together.

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
