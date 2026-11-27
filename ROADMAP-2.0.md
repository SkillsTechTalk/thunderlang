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
| 1.1 | Unify the syntax, specification, and documentation | One language reference covers missions and Core and how they coexist; a file's kind can be told from the file itself; editor docs use Thunder names (compatibility aliases kept) | in review: first fixes in #185; **next** |
| 1.2 | Better semantic round-trip and behavioral testing | Read → Core → write round-trips checked by behaviour (same outputs), not just parsing; Thunder write's proof is backed by compiling and running the result | planned |
| 1.3 | ThunderBench, a public benchmark | Benchmark tasks, hidden tests, and a runner published with honest results, including where Python does better. Creating the public repo needs founder approval | planned |
| 1.4 | A polished browser playground | thunderlang.dev runs Core in the browser on the Thunder engine: edit, run, see the result and the steps, with nothing to install | planned |
| 1.5 | One compelling end-to-end demonstration | One recorded flow: read an unfamiliar repo in Thunder → change a rule → verified patch → behaviour-level review | planned |

## Phase 2: Real applications

| # | Item | Done when | Status |
|---|---|---|---|
| 2.1 | TypeScript/npm package interoperability | `Use "<package>" from npm as <name>` on the TypeScript target, exact values across the boundary, TC408 everywhere else | **in review: #186** |
| 2.2 | C#/.NET package interoperability | `Use "<package>" from NuGet as <name>` on the C# target, same rules as npm | planned |
| 2.3 | Persistent data and HTTP abstractions | Save/find records and serve/call HTTP from Core, with explicit adapters (SQLite first) and the same meaning on every supported target | planned |
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

## The 2.0 gate

- All twenty items done.
- Full compiler suite, cross-target conformance, and docs checks green on every supported toolchain.
- A performance pass: compile and run times measured on the benchmark programs, with regressions fixed and the
  numbers published.
- Release notes, the README, the site, OpenThunder, and Skills Tech Talk updated together.
