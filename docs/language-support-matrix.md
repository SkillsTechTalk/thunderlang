# Language support matrix

ThunderLang meets other languages on three distinct axes, and each axis has its own
surface area. This page is the single reference for which language is supported where.

- **Lift (code to intent).** `thunder lift` reads existing source code and infers a
  draft mission from it, the entry point for [adopting ThunderLang on an existing
  codebase](/docs/adopting-thunderlang). Fourteen languages.
- **Gen (intent to code).** `thunder gen` emits a deterministic code scaffold from a
  mission: the typed contract, the decision logic (already executable), and honest TODO
  markers for the business logic. Four languages.
- **Live execution (`--target`).** `thunder test --target <lang>` and `thunder conform`
  compile each decision into that language and run the in-file test cases through the
  real toolchain, grading executed code rather than fed results. Nine languages.

All three axes are deterministic and AI-free: the same input always produces the same
output, and nothing leaves your machine.

## The matrix

| Language   | Lift (`thunder lift`) | Gen (`thunder gen`) | Live execution (`--target`) |
| ---------- | --------------------- | ------------------- | --------------------------- |
| TypeScript | yes                   | yes (`typescript`, `ts`) | yes (in-process, no toolchain needed) |
| JavaScript | yes                   | via `typescript`    | yes (same in-process runner) |
| Python     | yes                   | yes (`python`, `py`) | yes (needs `python3`)       |
| C#         | yes                   | yes (`csharp`, `cs`) | yes (needs `dotnet`)        |
| Java       | yes                   | yes (`java`)        | yes (needs `java`)          |
| Go         | yes                   | no                  | yes (needs `go`)            |
| Rust       | yes                   | no                  | yes (needs `rustc`)         |
| C++        | yes                   | no                  | no                          |
| PHP        | yes                   | no                  | no                          |
| Ruby       | yes                   | no                  | no                          |
| Perl       | yes                   | no                  | no                          |
| Kotlin     | yes                   | no                  | yes (needs `kotlinc`)       |
| Scala      | yes                   | no                  | yes (needs `scala`)         |
| Elixir     | yes                   | no                  | yes (needs `elixir`)        |

Live execution is the widest of the two "write" axes: the four gen languages are a
subset of the nine live targets. `gen` emits an editable, TODO-marked scaffold, so it
carries a stronger promise and grows more deliberately; a live target only has to compile
and run the decision functions, so it can cover more languages. Every language you can
`gen` into you can also execute, and five more (Go, Rust, Kotlin, Scala, Elixir) can be
executed and conformed even though they do not yet have a full `gen` scaffold.

## Reading the axes

**Lift** is the widest axis because reading code is cheaper than writing it: every
language plugs in as an adapter that emits the same CodeFactsIR (function signatures,
thrown errors, test evidence), so all fourteen share one inference engine and produce
the same humble, evidence-carrying draft. Dynamically typed sources (JavaScript, Python,
Ruby, PHP, Perl, Elixir)
lift with lower confidence, and the compiler says so with an explicit limitation warning.
Use `thunder lift <file> [--from <lang>]` or point it at a directory for repo mode.

**Gen** is narrower because generated code carries a stronger promise: the contract types
and the decision functions are fully determined by the intent, and everything the intent
does not determine is a marked TODO, never a silent stub. Run
`thunder gen <file> --target typescript|csharp|java|python`, optionally with
`--out <dir>`.

**Live execution** is the proof axis. `thunder test <file> --target python` compiles the
decisions with the same expression translator `gen` uses, runs every declared test case
through a real interpreter or compiler, and grades the actual outputs.
`thunder conform <file> --all-targets` runs the same cases against every available
target at once. TypeScript is always available (it runs in-process); Python, C#, Java,
Go, Rust, Kotlin, Scala, and Elixir are probed on your machine and reported as skipped,
not failed, when the toolchain is absent. Aliases are accepted for every target
(`golang`, `rs`, `kt`, `sc`, `ex`, alongside the existing `ts`, `js`, `py`, `cs`).

## Related pages

- [Adopting ThunderLang](/docs/adopting-thunderlang) for the lift, review, check, gate loop.
- [Tests as a first-class construct](/docs/intent-tests) for the test blocks the live targets execute.
- [Testing and verification](/docs/testing-and-verification) for where target execution sits in the proof story.
