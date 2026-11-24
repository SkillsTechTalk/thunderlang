# Unreleased

**Semantic Zoom: one model, read from the big picture down to one decision.**
- **`thunder-model-v1`** (`thunderModel(files)`, `/core`): the one meaning every Thunder view is drawn from.
  Things (classes: what they know and how they start, what they can do), Data (records and choices, from
  dataclasses, pydantic, TypeScript interfaces, enums), members (actions, rules, steps, setup) with their **flow as
  a graph** (start, questions with Yes/No sides, steps, loops, stops, answers), links between members ("Can borrow?"
  opens the rule it uses), source lines, and every unknown. Python and TypeScript classes today; other languages
  list their classes as unknowns and still read every function.
- Questions are asked the positive way round for a kid: `if book.status != Status.ON_SHELF: raise` becomes "Is the
  book's status on shelf?" with the Stop on **No**. A call to a rule is asked by the rule's own name ("Can
  borrow?"). Rules are drawn as questions in order, each Yes giving its answer in words ("No fee"), otherwise the
  fallback.
- **`modelText(model, id)`**: Thunder Text projected from the same model nodes as the picture, so the two views
  cannot disagree.
- **Thunder symbols as data** (`THUNDER_VISUAL.symbols`, `does`, `beginner`): one shape per kind of thing (Thing,
  Data, Record, Choices, Action, Rule, Steps, Starts with, Stop, Not read yet, App, Area, File) as SVG path data, and
  what each step does in a kid's words (find, keep only, check, ask, work out, save, tell someone, ask another
  part, for each, give back, stop). Six are beginner concepts.
- Wording: enum values read as words (`Status.ON_SHELF` is "on shelf"); `book.status = …` is "Sets the book's
  status"; `self.max_books = max_books` is "Keeps the max books it is given"; `student.books.append(book)` is "Adds
  book to student's books".
- Site: `/zoom`, Semantic Zoom (preview): How deep (Big picture, Flow, Details) and Show as (Thunder, Thunder Text,
  Original), breadcrumbs, the symbols, Try the rule (runs the rule as read), and line links to the original.

**Thunder V1: the Thunder Programming Language.** Thunder is a human-native programming language: people work
with the meaning of software while machines handle most of the implementation. Specified in `docs/spec.md`,
which replaces the mission specification draft v0.2 (kept as `docs/spec-v0.2.md`).

- **`thunder-visual-v1`**, the visual grammar as data, exported from `/core` and the root: `THUNDER_VISUAL`
  (zoom levels shared with the Thunder Atlas, color roles with green/red reserved for checks that ran, step marks,
  elements with honest status, provenance, the eleven languages with SQL marked planned, and the rules every view
  follows), `visualFor(item)` (how to draw any reader item), `visualForStep(step)`, and `thunderText(item)` (the
  same item as Thunder Text). The picture and the text are rendered from the same reading, so they cannot disagree.
  A decision's docstring becomes its Thunder Text `Why:` line.
- Yes/no properties read as sentences: `if order.refunded` is "If order is refunded"; `!user.isAdmin` is "user is
  not admin". Other property paths are left as they are.
- A test keeps `docs/spec.md` naming every element, step, and language in the grammar.
- **Learn Thunder** (thunderlang.dev/learn), the Thunder V1 tutorial: seven lessons on reading software in Thunder,
  built on one pizza-delivery app and produced by this compiler at build time. `test/learn-thunder.test.mjs` proves
  each lesson shows what it teaches, including identical Thunder for one rule in Python, TypeScript, Java, and Go.
- Wording: a collection used as a condition reads "order has items" / "order has no items"; `total += item.price`
  reads "Adds item price to total"; a parenthesized calculation is a computed value, not "an object".

Read a whole app, not just its decisions: every Python endpoint is found, the author's docstring is kept as the
function's meaning, and steps that only restate code are no longer counted as read.

**Behavior changes**
- **Stricter `stepsReadable`.** A step that only puts the code's syntax into English ("Works out actives", "Returns
  the result of any", "Calls set") is marked `restates: true` and does not count as read. Scores drop where steps
  only restated code. The eleven-repository benchmark is now 78% of 12,087 functions at least 80% readable (was
  94% under the old rule); see `docs/thunder-repo-results.md`.

**Read code in Thunder**
- **Python headers that span lines.** Functions whose parameters run over several lines (FastAPI `Depends(...)`
  one per line, wrapped return types) were skipped; they are read now, with their decorators. Multi-line route
  decorators (`@router.get(\n "/x",\n response_model=...)`) give the route. On a 111-file FastAPI backend: 516 of
  516 functions read (was 254), 234 endpoints recognized (was 19). psf/requests: 708 functions (was 632).
- **The author's words: `doc`.** Each function or decision carries `doc`, the first paragraph of its docstring or
  doc comment (Python docstrings, JSDoc `/** */`, `///`, Go `//`, Ruby `#`), without Args/Returns sections. It is
  the author's statement, kept apart from the reading inferred from code. `thunder read` shows it as "The author
  says".
- **Steps that explain.** Python comprehensions and `any`/`all`/`sum`/`min`/`max`/`len` read as what they produce
  ("the items in rules where active", "whether any item in actives matches"); common shapes read as what they are
  in every language: a new object (`&Command{`, `Server::new(`), a value by key (`headers.get("content-type")`),
  text built from parts, a copy, a conversion, JSON in or out, a boolean result ("Returns whether …"), several
  returned values, `seen[k] = …` ("Records k in seen"), `.set("Key", v)`, `.append(x)`.
- Types: `ReadItem.doc`, `ReadItem.steps`, `ReadStep` (with `restates`) in `read.d.mts`.

Not yet: identifiers in other languages (French names, for example) are still turned into English-looking words.

# 0.5.4

Read code in Thunder, change a rule safely, and review AI changes against stricter evidence. Pre-1.0: the stricter
evidence rules intentionally change some earlier permissive results (see **Behavior changes**). 0.5.3 was not
published to npm; its additions (below) ship for the first time in this release.

**Behavior changes**
- **Strict named evidence.** CLI, MCP, and embedding products share `resolveObligations`. References must match a complete, case-sensitive target (`verify Target` or `verify test Target`). Previously fuzzy references such as `verify Target test` stay declared (unverified) until rewritten. All references must resolve and pass; one passing subset cannot verify a claim.
- **Fail closed on invalid tests.** Evaluation errors cannot pass through a matching fallback. Cases need assertions, empty test blocks fail, and lifecycle paths must be valid unless explicitly asserted invalid. Files with no test blocks still report zero cases; zero cases do not establish verified behavior.
- **Generated code is typed.** `thunder gen` decision parameters now carry types (see Fixes), and Java is written to `<Class>.java` instead of a lowercase file name.

**Read code in Thunder**
- **Thunder steps (`thunder-steps-v1`).** Every function that is not a decision reads as a short list of steps: checks, branches, loops, assignments, and calls (payments, HTTP, database, events, email). Statements Thunder cannot explain are kept as their original code, never guessed. On eleven public repositories (all ten languages), 94% of 12,011 functions are at least 80% readable as steps. `STEPS_SCHEMA` and `classifyStatement` are exported from `/core`.
- **More decisions read.** One-expression boolean functions read as decisions in all ten languages; the statement splitter keeps object literals, destructuring, struct literals, and JSX whole; Python lines with a trailing `#` comment are read (the comment is kept).
- **Lossless anchoring (`thunder-anchor-v1`).** Every step points at its exact place in the file (character offsets; whole lines for PHP), with per-function anchor coverage. `editStep` replaces one step's code and verifies the result by reading it again, keeping a Python or Ruby line's trailing comment. `thunder anchor <file>` shows it. Exported from `/core`: `spanRange`, `spanText`, `replaceSpan`, `editStep`, `anchorReport`.
- **Thunder Text (`thunder-plain-v1`, experimental).** A readable written form of a Thunder rule: `thunder text <file>` (alias `thunder plain`) runs its examples. Exported from `/core`: `parsePlainContract`, `renderPlainContract`, `plainToThunder`, `compilePlainContract`, `previewPlainContract`, `explainPlain`.
- **`thunder repo <owner/repo | GitHub URL | folder>`.** Reads a whole repository in Thunder (shallow clone for GitHub; read-only, nothing is executed) and prints a brief: languages, decisions, functions read as steps, and what was not read.
- **Code reader exports (from 0.5.3).** `readCode`, `readRepo`, `searchRepo`, `groupByFile`, `readableLanguage`, and `promoteDecision` from the main entry and `/core`, plus `collectReadableFiles` from the main entry.
- **Typed round trips.** Thunder source carries input types, so code read into Thunder and generated back keeps `bool` and number types.

**Change a rule (Thunder write, experimental)**
- `thunder write <file> --decision <name> --rule <n|otherwise> --when "<condition>" | --answer <Outcome> [--write]` changes a number, comparison, text value, or answer in a recovered decision and writes only those characters back, keeping the file's own spelling (`===`, `100.0`, `100m`, quote style). It reads the file again and refuses, leaving it untouched, unless the edited rule reads as intended and everything else reads as before. It lists the boundary inputs whose answer changes. Previews by default; `--write` saves. Rule shape changes and new enum names are refused.
- Exported from the package and `/core`: `writeRule`, `changedCases`, `ruleParts`, `joinRuleParts`, `COMPARISON_CHOICES`.

**Review AI changes**
- **Review Atlas.** `thunder atlas --review` executes contract cases, preserves invalid files, ranks evidence gaps, and exports `intent-review-atlas-v1`. `--agent-brief` produces bounded review context; `--strict` exits 2 for incomplete evidence and 1 for evaluated failures. `--openthunder <report.json>` compares source hashes and compiler versions without promoting imported claims. The browser-safe `buildReviewAtlas`, `renderReviewBrief`, and `reviewAtlasExitCode` and the `intent_atlas` MCP tool share this policy. Original graph navigation is unchanged.
- **Browser-safe evidence API.** `/core` exports `runTests`, `TEST_SCHEMA`, and `resolveObligations` with public types. Passing results cover the declared cases, not arbitrary inputs or repository implementation.

**Fixes**
- **`thunder gen` TypeScript, Java, and C# compile.** Decision parameters were untyped (`unknown`, `Object`, `dynamic`), so comparisons such as `amount >= 0` did not compile, and typed Thunder inputs (`amount: number`) produced broken signatures. Each input now gets one type: its declared type, else the decision's example values, else how the rules use it. Python gains type hints. The TypeScript mission stub is named `run` when a decision shares the mission's name (it was a duplicate function), a C# decision named like its class becomes `Decide` (CS0542), and C# numbers are `double`, matching the live C# target. Verified with tsc (strict), javac, and dotnet, and against the Thunder runtime.
- **Python rules with trailing comments.** `if amount <= 100:  # limit` was read as "does more than choose an answer"; it now reads as a rule.

# 0.5.3

- Export the code reader from the package: `readCode`, `readRepo`, `searchRepo`, `groupByFile`, `readableLanguage`, and `promoteDecision` (turn a recovered decision into a contract with edge-case examples) from both the main entry and the browser-safe `/core` entry, plus `collectReadableFiles` (read a folder on disk) from the main entry. Tools such as OpenThunder can now import them directly instead of going through the MCP tool interface. Additive; no behavior changes.

# 0.5.2

- Add named example inputs with one `->` arrow, optional primitive input annotations, and multiline cases in human-v1. Existing tables and canonical source remain supported.
- Generate example tables from the canonical parsed cases; preserve separate contract and application evidence.

# 0.5.1

- Add experimental `thunder human` shorthand, readable decision preview, example tables, and canonical source output.
- Expose the browser-safe human contract helpers through `/core`. Existing grammar and commands are unchanged.
- Preview reports contract examples separately from application evidence.

# Changelog

All notable changes to `@skillstech/thunderlang`. Pre-1.0: the language and the
`intent-graph-v1` schema version independently and may still change.

## 0.5.0

The executable-targets release. Additive; no breaking changes. Minor bump to keep the 0.x lockstep
with OpenThunder.

- **Five more live execution targets.** `thunder test <file> --target <lang>`,
  `thunder conform <file> --run <lang>`, and `--all-targets` now compile and run the
  generated decision in Go, Rust, Kotlin, Scala, and Elixir, grading real executed
  outputs. Live execution now spans nine languages (TypeScript, Python, C#, Java, Go,
  Rust, Kotlin, Scala, Elixir); each target is probed with a real compile+run smoke and
  skips cleanly (never fails) when its toolchain is absent. New aliases: `golang`, `rs`,
  `kt`, `sc`, `ex`. The expression translator gained matching dialects (`exprToGo`,
  `exprToRust`, `exprToKotlin`, `exprToScala`, `exprToElixir`); existing JS/C#/Java/Python
  output is unchanged.
- **Language support matrix.** `docs/language-support-matrix.md` updated: lift (14), gen
  (4), live execution (9).

## 0.4.2

The evidence-graph release. Additive; no breaking changes.

- **Evidence projections.** ThunderLang can now project its verification into `evidence-event-v1`
  events (`evidenceType: tool_verified`) for the shared SkillsTech proof spine: `thunder evidence
  <file>` emits `intent.proven`, and `--evidence` on `verify-diff` / `conform` / `drift` emits
  `change.gated` / `conformance.verified` / `intent.drift`. The projections are pure, offline, and
  safe-derived (ids, hashes, verdicts, diagnostic codes, and counts only , never source, secret
  values, finding messages, or expected/actual values). The library exports `toEvidenceEvents`,
  `verifyDiffToEvidence`, `conformToEvidence`, and `driftToEvidence`. The network push to the spine
  is intentionally left to the org-layer/CI, so the compiler stays offline and deterministic.
- **Fix: `thunder lift` emits canonical `.thunder` drafts** instead of the legacy `.intent`
  extension, on both single-file and repo lifts.

## 0.4.1

The coherence release. Additive; no breaking changes. Version chosen to align with OpenThunder
(TL and OT version in lockstep; OT is moving from 0.4.0 to match).

- **Python code generation.** `thunder gen <file> --target python` now emits a typed Python 3
  scaffold, aligning the codegen axis with live execution. Also fixes a real gap: C# and Java `gen`
  silently dropped `requires` preconditions that TypeScript emitted; they are now emitted as guided
  TODOs.
- **Language support matrix.** New `docs/language-support-matrix.md` documents the three axes , lift
  (14 languages), gen, and live target execution (4) , and makes them discoverable.
- **VS Code extension.** `editors/vscode/` ships a real extension: syntax highlighting and a Language
  Server client that launches `thunder lsp`. Packageable with `vsce package`.
- **Grouped, scannable CLI help.** `thunder --help` is reorganized into nine labeled groups with a
  one-line mental model. Command behavior is unchanged (help text only); a test guards that no
  command was dropped.
- **Verify-real-code loop, productized.** New MCP tools `intent_prove`, `intent_conform`, and
  `intent_drift` let AI agents drive the full loop. `docs/verifying-ai-changes.md` is rewritten as
  the headline workflow (author intent, write code, prove conformance, gate the merge) with a CI
  recipe.
- **Honest Playwright scaffolds.** The exported Playwright tests now open with `test.fixme` so an
  unfilled scaffold cannot pass vacuously.
- **intent-graph-v1 stability policy.** New `docs/schema-stability.md` commits to additive-only type
  sets within v1, an IR version that moves independently of the package, a deprecation policy, and a
  road to 1.0, so consumers like OpenThunder can depend on the IR safely.

## 0.3.0

The 14-language lift release. Additive; no breaking changes. Restores the OpenThunder -> ThunderLang
recover-intent loop for every language OpenThunder's archgraph core can now discover.

- **Kotlin, Scala, and Elixir lift adapters.** `thunder lift` now extracts candidate intent from
  `.kt`/`.kts`, `.scala`/`.sc`, and `.ex`/`.exs`, bringing the supported-language count to 14. A new
  `name: Type` parameter parser handles the JVM signature shape; Elixir joins the dynamic-language set.
- **Fix: repo-walk language coverage.** `LIFT_EXTS` was stale and silently skipped Python, Java, C#,
  Go, C++, PHP, and Ruby during repo/`--all` lifts; it now mirrors the full adapter set.
- **Fix: single-file lift language detection.** `thunder lift <file>` now auto-detects the language by
  extension instead of defaulting to TypeScript, consistent with `--all`/repo modes.

## 0.2.0

The cross-language target execution release. Additive; no breaking changes.

Version alignment: starting with 0.2.0, ThunderLang and OpenThunder version in lockstep, since most
OpenThunder changes land in the language first. (0.1.8 and 0.1.9 were never published; the last
release on npm was 0.1.7.)

- **Live target adapters.** `thunder test <file> --target typescript|python|csharp|java` and
  `thunder conform <file> --run <targets>` now compile the generated decision(s) and execute them
  for real, grading the actual outputs instead of fed results. TypeScript/JS runs in-process,
  Python through `python3`, C# through a throwaway `dotnet` console project, and Java through the
  JDK 11+ single-file launcher (`java ThunderTarget.java`).
- **`--all-targets`.** `thunder test <file> --all-targets` and `thunder conform <file> --all-targets`
  run every target whose toolchain is available in one pass, side by side, and skip any target whose
  runtime is absent (it stays declared in the conformance matrix) rather than failing.
- **Static-target type inference.** Because C# and Java are statically typed, each decision
  parameter's type is inferred from the test-case values it receives (numeric wins, then boolean,
  else string), and each language gets its own equality translation.
- Missing toolchains are detected via cached smoke checks and skipped cleanly, so builds never fail
  for a runtime that is not installed.

## 0.1.8

The testing and verification release. Additive; no breaking changes.

- **Rename to ThunderLang.** Package is `@skillstech/thunderlang`; the CLI binary is `thunder`
  (with `intent` kept as a legacy alias). `.thunder` is the canonical source extension; `.tl` and
  `.intent` are accepted. The Intent Graph and Intent-Oriented Programming vocabulary are retained.
- **`thunder prove`** emits an `intent-proof-v1` artifact with honest per-claim verdicts
  (verified / failed / declared / needs_verification, with `provenBy`). An unverified claim never
  reads as proven.
- **`thunder test --contracts [--strict]`** derives an obligation from every `guarantee` and
  `never`, resolved against the specific test that verifies it. `--strict` fails CI on any unverified.
- **Verification classification**: `verify by assertion|static|runtime|evidence|tool|approval|formal`.
- **Stable IDs**: explicit `id INV-G-001` on guarantees / never-rules (slug fallback).
- **Proof freshness**: the proof records intent hash, compiler, git commit, dependency-lockfile hash,
  and environment; `thunder verify` marks a proof STALE when the implementation, dependencies, or
  compiler move since it was generated.

## 0.1.6

The agent-conformance release (skills on intents + 12-factor scoring). Additive; no breaking
changes to 0.1.5.

### Added

- **12-Factor Agents conformance lens (`twelve-factor-v1`).** Deterministically scores an intent
  against the 13 principles of [humanlayer/12-factor-agents](https://github.com/humanlayer/12-factor-agents),
  which map onto structure IL already models (decisions, lifecycles, typed I/O, approvals,
  errors/handlers, events, a pure runtime). `twelveFactorReport(ast)` returns a per-factor verdict
  (`satisfied` | `partial` | `absent`) with evidence + a fix and a 0–100 score; `twelveFactorSummary`
  is the compact form. `compileSource` and the proof envelope now carry a `twelveFactor` summary, so
  "12-factor compliant" is a claim the proof asserts. CLI: `thunder twelve-factor <file> [--json]`.
  Findings catalogued as `IL-12F-01..13`. Exported from `/core` and the root. See
  `docs/twelve-factor-agents.md` and `examples/TwelveFactorAgent.intent` (scores 100/100).

- **Skills + required-understanding on intents (the Ownership Graph skill↔intent join).** A mission
  can declare the skills it requires and what a human must be able to explain to own it:
  ```
  requires_skill Distributed Systems, Idempotency
  demonstrates understands the idempotency-key guarantee
  ```
  - `requires_skill` (inline comma list or a block) normalizes each skill to the shared
    `skill:<slug>` id (`skillRefId`); `demonstrates` captures the understanding a human must show.
  - New `Skill` node type (`NODE_TYPES` 41 → 42) + `requires_skill` relationship (20 → 21) in
    `intent-graph-v1`; the mission `requires_skill` each Skill node. Additive for consumers that
    subset the vocabulary.
  - The proof envelope and `compileSource` now carry `skillsRequired` (the `skill:` ids) and
    `demonstrates` (prose), so producers drop `skillsRequired` straight into
    `evidence-event-v1` `skillIds[]`, and `demonstrates` feeds Skills Tech Talk defense.
  - `requires_skill` round-trips through `graphToSource`.

## 0.1.5

The rule-catalog namespace release. Additive; no breaking changes to 0.1.4.

### Added

- **Verify-time rule namespace.** The canonical rule catalog is now one id space across two phases:
  author-time (ThunderLang) and verify-time (OpenThunder). Every rule row self-describes `owner`
  (`IL` | `OT`) and `phase` (`author` | `verify`); `RULE_NAMESPACES` declares prefix ownership
  (`IL-*` author, `OT-*` verify); `VERIFICATION_RULES` reserves the OpenThunder verify namespace
  (`OT-REQ-*`, `reserved: true` until OT defines them); `ruleNamespace(ruleId)` resolves owner+phase
  for any id. `ALL_DIAGNOSTICS` now spans both phases. Existing consumers keying on `ruleId` are
  unaffected (owner/phase are additive fields). Exported from `/core` and the root.

## 0.1.4

The shared-skill-namespace release. Additive; no breaking changes to 0.1.3.

### Added

- **Canonical skill id (`skillRefId`).** IL owns the `skill:` id namespace (founder decision
  2026-07-14); SkillsTech Certified owns the curated content (which skills exist, cert->skill maps).
  `skillRefId('TypeScript') -> 'skill:typescript'` , deterministic, browser-safe, so every product
  emits the SAME skill id in Workspace `evidence-event-v1` `skillIds[]`. The id primitive only; the
  curated taxonomy list lands separately (STCE, post-loop). Exported from `/core` and the root.

### Fixed

- **`compileSource` type now includes `origin`.** The `.d.ts` opts omitted `origin?: string` even
  though the runtime has honored it since 0.1.1 (OpenThunder confirmed `origin: 'recovered'`
  round-trips). Typed consumers can now pass it without a cast. Runtime behavior unchanged.

## 0.1.3

The Ownership-Loop seam release. Additive; no breaking changes to 0.1.2.

### Added

- **Canonical intent reference id (`intentRefId`).** The stable string every SkillsTech product
  puts in Workspace `evidence-event-v1` / `proof-bundle-v1` `intentReferences[]` so an evidence
  record or Ownership Proof cites the exact intent it supports:
  `intent:<mission-slug>` (subject-level) and `intent:<mission-slug>@<sha8>` (version-pinned to the
  proof `sourceHash`). Deterministic, browser-safe, exported from `/core` and the root.
- **`compileSource` returns `intentRef` + `intentRefPinned`,** so a producer that already compiled
  a mission gets both ids for free (no need to recompute). This closes the `ThunderLang -> evidence
  model` seam of the Skills Ownership Loop.

## 0.1.2

The ecosystem-consumption release. Additive; no breaking changes to 0.1.1.

### Added

- **Dual CommonJS + ESM build.** The package now ships a `require`-able CommonJS build
  (`dist/index.cjs`, `dist/core.cjs`) alongside the ESM sources, via conditional exports.
  CommonJS consumers (OpenThunder, the SkillsTech backend) can now
  `const { NODE_TYPES } = require('@skillstech/thunderlang/core')` synchronously , no async
  bootstrap, no ESM migration. The runtime stays zero-dependency (esbuild is dev-only).
- **Seeded lift.** `liftSource(source, { seeds })` accepts OpenThunder's `intent-ir-v1` nodes
  (`IntentSeed`: `nodeId` + `evidenceRef` with `signals`, `sourceLocations`, optional
  `ledgerRef` , see `SEED_SCHEMA`). The lifted draft then references OT's exact node ids in
  `maps_to` (no divergent second reading of the repo) and returns the linkage structurally via
  `result.seeds` / `summary.seeds`. Additive: with no `seeds`, output is byte-identical to 0.1.1.
  Exports `SEED_SCHEMA` and `normalizeSeeds` from `/core` and the root.

## 0.1.1

The executable + interoperable release. Everything is deterministic and requires no AI.

### Added

- **Executable intent (the Intent Runtime).** `evaluateDecision` (FIRST-hit, full trace),
  `simulateLifecycle` (walk a state machine, reject illegal transitions), and
  `checkDecisionCases`, powered by a safe no-`eval` expression engine. CLI: `thunder run`,
  `thunder simulate`.
- **First-class tests.** `test` blocks (`case` / `scenario`) inside a `.intent` file, run
  with `thunder test` and `runTests`. The spec proves itself.
- **Outcome contracts.** `outcome_contract` binds an outcome to a target; `evaluateOutcomes`
  and `thunder outcomes` judge it met / missed / pending against a delivery `result`.
- **Full five-profile language.** System (`capability`, `interface`), delivery (`release`,
  `result`, `learning`), and design (`component`, `artifact`) profiles join core, product,
  and experience. Governance (`waiver`) and data privacy (`data`) too.
- **Interop.** Export to DMN, BPMN, NuSMV, JSON Schema, OpenAPI, W3C Design Tokens, and
  Mermaid , the whole Intent Graph as a paste-anywhere diagram , (`thunder export`, `toMermaid`);
  import from DMN and BPMN with a fidelity report (`thunder import`, `importReport`); native
  graph <-> source round-trip (`graphToSource`, `thunder source`); schema migrations
  (`migrateGraph`, `validateGraph`, `thunder migrate` / `validate`); semantic diff + 3-way
  merge (`thunder diff` / `merge`).
- **Editor support.** A Language Server (`thunder lsp`, `startLspServer`) providing
  diagnostics, completion, and hover over LSP; a TextMate grammar
  (`syntaxes/intent.tmLanguage.json`) for syntax highlighting.
- **Onboarding + CI.** `thunder init` scaffolds a runnable starter; `thunder check <dir>`
  recurses and gates a whole repo; `thunder check --json` and `thunder explain <CODE>` for
  tooling; a composite GitHub Action.
- **Style intent.** `style_intent` models brand + visual language as a governed
  Experience-profile extension: design tokens bind to a canonical, lockable address space,
  and `accessibility_target` is always a `proposed` claim (never IL-verified). `analyzeStyle`,
  `styleDiagnostics`, `thunder style`, diagnostics `IL-STYLE-001..005`, canonical `StyleIntent`
  node with graph round-trip. Browser-safe via `/core`. Exports to **W3C Design Tokens
  (DTCG)** via `thunder export --format tokens` / `toDesignTokens` (`intent-design-tokens-v1`)
  and to a ready-to-use **CSS** custom-property sheet via `--format css` / `toCss`. Experiences
  export to a **Playwright** E2E test scaffold via `--format playwright` / `toPlaywright`.
- **Security + type diagnostics.** Deterministic checks for the mistakes prompts ship:
  `IL-SEC-001` (secret-typed field on an event payload), `IL-SEC-002` (API returns a secret
  with no auth requirement), `IL-TYPE-001` (unrecognized, likely-mistyped field type).
  `securityDiagnostics`, `isRecognizedType`, catalog now 49 rules.
- **Human <-> Structured <-> ThunderLang sync (`intent-sync-v1`).** `parseToStructured(source)`
  returns the canonical graph + flat PM fields; `proposeIntent(structured, { base })` regenerates
  ThunderLang source with a reviewable diff, surfaced ambiguities (non-factual nodes), round-trip
  fidelity gaps, and validation , never a silent rewrite. Browser-safe via `/core` (for Studio).
- **Comment-preserving structural editing (`intent-patch-v1`).** `applyEdits(source, edits)`
  applies field-level edits (`setField`, `add/removeGuarantee`, `add/removeNever`,
  `add/removeField`, `setFieldType` on inputs/outputs, `add/removeMetric`, `setMetricField`,
  `add/removeOutcome`, and decision rules `add/removeRule`/`setRule`/`setDefault`) directly to
  the `.intent` source, touching
  only the target lines so comments, formatting, and untouched blocks stay byte-identical. Closes
  the sync fidelity gap: a PM edits fields and IL keeps the comments. Field removal takes the
  field's indented modifiers with it (no orphans). Unmatched/unsupported edits are reported,
  never applied blindly. Browser-safe. Also a CLI: `thunder edit <file> --edits <json|-> |
  --set-goal | --add-guarantee | ... [--write]`.
- **Verify a code change against its intent (`intent-verify-diff-v1`).** `thunder verify-diff
  <intent> --after <code> [--before <code>]` / `verifyDiff()` proves, deterministically and with
  no AI, which of the intent's guarantees/never-rules a change upholds or breaks, and returns a
  gate verdict (PASS/BLOCK, non-zero exit on BLOCK). Blocks on regressions (a claim that held
  before and broke after) and guardrail hits (an added line pushing a never-rule's protected
  secret into a log/response). The keystone of the AI generate-verify loop; honest (catches
  mechanical violations, does not claim to prove correctness).
- **Intent Atlas + lift-all.** `liftAll(source)` / `thunder lift <file> --all` lifts EVERY public
  function in a file into its own inferred mission (not just the first), filtering internal
  helpers (Go: exported-only; Python/Ruby: top-level, non-underscore) , so a whole module reads
  as intent. Powers the Intent Atlas: `scripts/build-atlas.mjs` lifts well-known OSS projects
  (Requests, Express, Flask, gorilla/mux, chi) into a browsable /atlas of ~99 inferred missions.
- **Prompt -> intent (`intent-draft-v1`).** `draftIntent(brief)` / `thunder draft --brief <json|->`
  turns a structured brief into a rigorous, canonically-formatted intent draft PLUS a review
  checklist of what a human must still fill in (unverified guarantee, decision with no default,
  unguarded secret, missing goal). The deterministic half of prompt->intent , an agent produces
  the brief (MCP tool `intent_draft`), IL makes it rigorous, a human approves. Never verified.
  Browser-safe.
- **Runtime enforcement (`intent-guard-v1`).** `compileGuard(intentSource)` / `buildGuard(ast)`
  turns intent into a guard that runs IN the application: `redact(obj)` masks every field the
  intent declares secret (Secret/Password/Token type, pii/sensitive data, or a secret-looking
  name), deeply , so wrapping a logger enforces "never expose the token"; `assertAllowed(name,
  inputs)` runs a declared decision and THROWS `INTENT_GUARD_DENIED` when the intent denies the
  action , the intent's rules become a hard production gate. `thunder guard <file>` previews it.
  Browser-safe.
- **MCP server for AI agents.** `thunder mcp` / `startMcpServer` speaks the Model Context
  Protocol over stdio, exposing ThunderLang as native tools for coding agents (Claude Code,
  Cursor, ...): `intent_verify_diff` (the gate), `intent_check`, `intent_lift`, `intent_run`,
  `intent_test`, `intent_graph`, `intent_explain`. The agent checks its own output against the
  intent before shipping.
- **Hardening: two runtime correctness bugs fixed + a focus performance fix.**
  - *Divide/modulo by zero* leaked `Infinity`/`NaN` into comparisons, so a decision rule like
    `when balance / count > threshold` would silently MATCH when `count == 0` (`Infinity > 1`
    is true). Non-finite arithmetic is now neutralized to `null`.
  - *Unknown-operand ordering* was inconsistent: `null < 1` was `true` (JS coerces `null` to 0)
    while `null > 1` was `false`. Every ordering comparison against an unknown / neutralized
    value (a missing input, a divide-by-zero) is now `false` , unknowns are un-orderable.
  - *Lifecycle initial state* was picked as "the first state with no inbound transition," which
    is wrong when the start state is in a cycle (`A -> B -> A`: every cyclic state has inbound, so
    it wrongly chose an isolated terminal). A legal first transition was then reported invalid.
    The initial state is now the first declared state (the canonical start).
  - *Guard `redact` could stack-overflow* on a pathologically deep object (it was cycle-safe but
    not depth-bounded). Since it runs in production wrapping a logger, it must never throw; it is
    now depth-capped and stops descending instead of crashing.
  - *`buildFocusGraph` was O(n²)* (it scanned every relationship for every frontier node); an
    adjacency index makes it O(n + e). A 20k-node focus dropped from ~2s to ~85ms.
  - Adds `test/hardening-edge.test.mjs`: div/zero + null-ordering regressions, a "parser never
    throws on disruptive input" sweep (empty / CRLF / tabs / unicode / malformed), a CRLF
    value-corruption guard, malformed-`when` and no-default runtime robustness, round-trip
    fidelity, and a performance guard against the O(n²) regression.
- **One compiler for five consumers (universal `@skillstech/thunderlang/core`).** The whole
  analysis layer is now Node-free, so OpenThunder (Node), the `intent` CLI (Node), SkillsTech
  Studio (browser), Repo Mastery (web), and SkillsTech Mobile (React Native) run the SAME
  code, not a fork. The one blocker , `emit.mjs` importing `node:crypto` for SHA-256 , is
  replaced by a pure, dependency-free `hash.mjs` whose output is **byte-identical** to
  `node:crypto` (proven over 2000+ cases + a known-answer test), so every existing proof,
  ledger, and join-key hash is unchanged. `./core` now exports the full compiler surface
  (`parseIntent`, `buildIntentGraph`, `compileSource`, `scanIntent`/`scanProject`, the scan
  query views, `buildAtlas`/`searchAtlas`/`expandNode`, `buildFocusGraph`/`intentBrief`,
  `diffGraphs`, `graphToSource`, `semanticDiagnostics`, `sha256`/`sha256hex`). A conformance
  test statically fails CI if any module reachable from `/core` ever imports a `node:` builtin,
  so the single-source-of-truth boundary cannot silently regress. Only `cli.mjs` and
  `drift.mjs` (the Node entry points) touch the filesystem. The `./core` subpath now ships
  TypeScript types (`core.d.ts`), and `index.d.ts` gained the scan / Fable / scan-query /
  Intent Lens / Intent IR declarations, so the TypeScript consumers (OpenThunder, Repo
  Mastery, SkillsTech) get full types on the shared surface , proven by a TS-consumer
  typecheck in `pack:smoke`. The universal surface is also engine-safe: `hash.mjs` uses a pure
  UTF-8 encoder instead of the `TextEncoder` global, so it runs on Hermes / React Native (the
  conformance test now fails CI if any `/core` module references `TextEncoder`, `Buffer`, or
  another non-guaranteed global, and asserts hashing works with `TextEncoder` deleted).
- **Outcome Truth , guardrails + attribution honesty on outcome contracts.** An `outcome_contract`
  now takes a `guardrails` block (what must NOT regress while the target improves) and an
  `attribution` (directly-measured / correlated / experiment / human / ai / unknown). Two new Fable
  rules: `IL-OC-005` (a target with no guardrail is gameable , Goodhart's law) and `IL-OC-006` (no
  attribution , a metric moving after release is correlation, not proof this feature caused it).
  This closes the "technical success is mistaken for outcome success" gap: an outcome is only
  trustworthy with a guardrail and honest attribution.
- **Change Lens , what a branch/PR changed by meaning (`thunder changes`).** `thunder changes
  <base>..<head>` git-diffs the `.intent` files, semantic-diffs each (reusing `diffGraphs`), and
  reports the behavior-level changes: guarantees / never-rules / invariants / decisions added or
  removed, verification removed, and , crucially , a claim that **lost its verification** is
  flagged as *weakened*. The verdict is `review` when a promise or its proof was removed or
  weakened (or an approval invalidated), else `changed` / `no-semantic-change`; exit non-zero on
  `review` gates a PR. Returns the touched node ids to seed a Focus Graph. `changeReport` is pure
  and exported from `/core` (the CLI supplies the git-diffed graphs).
- **Global `invariant` , system-wide laws (first-class).** `invariant <Name>` declares a law that
  must hold across every feature and service, not just one mission (tenant isolation, financial
  consistency, "every mutation is authorized"). Fields: `statement`, `scope`, `applies_to`,
  `severity`, `because`, `verify`. Compiles to a canonical `Invariant` node in `intent-graph-v1`
  (additive: 40 -> 41 node types), `constrained_by` the mission, with a `verified_by` edge when a
  `verify` is attached; it round-trips through graph -> source. A new Fable rule
  `invariant-without-verification` warns when a global law has nothing proving it (that is exactly
  where a locally-valid change silently breaks the whole system). Invariants count toward
  comprehension C2 (Structured). Example: `examples/TenantIsolation.intent`.
- **Code generation , deterministic TypeScript from intent (`thunder gen`).** `toTypeScript(ast)`
  (`intent-codegen-v1`, no AI) generates what the intent fully determines , typed input/output
  interfaces, and the **decision logic**, which is real and behaviorally identical to the runtime
  evaluator (proven by a property test over the input space) , and leaves honest `TODO` markers
  for business logic, annotated with the guarantees and never-rules the code must uphold. Powered
  by a new `exprToJs` that translates the `when` grammar to correct JS (input-aware, so a bare
  token becomes a string literal). **Now also generates C# and Java** (`--target csharp|java`):
  typed records + the same first-hit decision logic, translated per language (C# `==` + `.Contains`;
  Java `Objects.equals`, so string equality is value-correct, not reference `==`) via a
  dialect-aware `exprToCode`. `thunder gen <file> [--target typescript|csharp|java] [--out <dir>]`. Pure
  / browser-safe and exported from `/core`, so the **playground now has a "Code" tab** , change
  the intent, watch the code change. Completes the round-trip with `thunder lift` (code -> intent).
- **Fix: non-mission root files no longer render as `# null`.** A standalone `event` / `api` /
  `service` / `capability` file has no `mission`, so the graph titled its root node `null` and the
  docs rendered `# null` (visible in the playground's BillingService / API / event examples). A
  new `subjectName(ast)` derives the title from the primary construct, so these render under their
  real name everywhere (graph, docs, generated code).
- **Comprehension Contract , the C0..C7 understanding level (`thunder comprehension`).** The
  measurable backbone of the Software Understanding System: `comprehensionLevel(ast)` scores how
  well-understood a mission is, deterministically, from C0 (Unknown) through C4 (Verified) which
  IL determines on its own, up to C5 (Observed), C6 (Teachable), and C7 (Governed) which a sibling
  lifts by attaching evidence (`--observed` = OpenThunder/runtime, `--learning` = Skills Tech Talk,
  `--governed` = Guardian + Workspace/Ledger). The ladder is cumulative (a gap caps the level) and
  honest (a level is never claimed on evidence IL does not have; each missing rung names its owner).
  `thunder comprehension <file|dir>` reports the level + the next rung; `intent-comprehension-v1` is
  the shared contract every product reads. Pure / browser-safe, exported from `/core`, typed.
- **Intent Lens , Intent Scope + Focus Graph (`thunder focus`).** A Focus Graph is a
  deterministic subgraph of the Intent Atlas around a selected scope (a mission, a feature
  query, or `--nodes a,b`), with every node tagged by WHY it is in focus (selected / governing
  / dependency / dependent / implementation / verification / risk / contextual) and bounded by
  `--depth`. `makeScope` builds the typed Intent Scope; `buildFocusGraph` the subgraph;
  `intentBrief` a deterministic what/who/guarantees/prohibitions/risks/unknowns brief whose
  confidence is the weakest in scope (honesty). `thunder focus <mission|query|--nodes>
  [--depth N] [--json]`. Built over the existing Atlas (not a fork); pure and browser-safe so
  Studio / OpenThunder / RepoMastery / Skills Tech Talk consume one focused representation.
- **Focused scanner queries (`thunder risks | gaps | unverified | coverage | unknowns |
  contradictions`).** Part 3 of the Intent Scanner: one deterministic question each over the
  shared Intent IR + Fable findings (`scan-queries.mjs`, `intent-scan-view-v1`), so a person
  can ask "what is unverified?" or "what is the verification coverage?" without reading the
  whole scan report. `coverage` exits non-zero below 100%; `risks` gates on blocker/error.
  Pure views, exported from the barrel.
- **IR fix: never-rules now carry their verification.** `buildIntentGraph` was emitting
  `verified_by` edges for guarantees but not for attached never-rules, so the shared Intent IR
  under-counted never-rule verification (and coverage read wrong). Never-rules with a `verify`
  now emit `verified_by` edges + a `verify-declared` status, and `graphToSource` round-trips
  them. Every downstream consumer (OpenThunder, RepoMastery) sees never-verification faithfully.
- **Code actions + autocorrect (`thunder code-actions` / `apply-fix`).** `getCodeActions`
  surfaces the available quick-fixes, safety-graded (`safe` autocorrects and `reviewable`
  diagnostic fixes); `autocorrectSource` applies only meaning-preserving header fixes
  (`goals` -> `goal`, `nevers` -> `never`, stray trailing colons), never a valid keyword
  in another context (a decision's `inputs` sub-block is deliberately left alone).
  `thunder code-actions <file>` lists them; `thunder apply-fix <file> [--write]` applies the
  safe ones and reports the reviewable ones for a human. Both pure and browser-safe.
- **Per-audience docs (`thunder docs --lens`).** `thunder docs <file>` renders a mission as
  Markdown; with `--lens <lens>` it produces an audience-specific doc that weaves that
  lens's ThunderLens notes inline next to the input, output, guarantee, or never they
  annotate, and states up front that notes are documentation, not verification. `--out`
  writes the file; otherwise it prints. `renderLensDoc` is pure and browser-safe.
- **Intent AI event sink (`intent-ai-events-v1`).** `thunder ai approve` / `reject` now
  persist their integration event to an append-only JSON-Lines log at
  `.intent/ai-events.jsonl`, so a project keeps a durable audit trail of every AI action.
  `thunder ai events [dir] [--subject <id>]` reads it back (who did what, and the status
  move). Pure sink module (`recordEvent`, `parseEventLog`, `serializeEventLog`, `timeline`),
  exported from the barrel; rejects unknown event types; append-only (never mutates).
- **ThunderLens notes CLI (`intent-notes-v1`).** `thunder notes <file>` lists the compiled
  `note <lens>:` blocks grouped by lens, each with its target (mission / input / output /
  guarantee / never) and source line; `--lens <lens>` filters to one audience and `--json`
  emits the report. Notes explain meaning for a reader and are never verification. Reuses
  the parser's `ast.notes` (no new parsing).
- **Intent Ledger (`intent-ledger-v1`).** `thunder ledger <file.json>` / `verifyLedger`, `record*`,
  `explain` keep the append-only, hash-chained (tamper-evident) record of a project's MEANING and
  history: why a mission was built, who approved it, what was assumed, which inferred intent a human
  corrected, which risks were accepted, what was verified, which lessons went stale. Each entry hashes
  over the previous, so history cannot be quietly rewritten , `verifyLedger` locates any break to the
  entry. Deterministic (caller supplies timestamps). `thunder ledger <file> --subject <id>` explains
  one mission's provenance; exit non-zero on a broken chain. Browser-safe.
- **Intent Simulator (`intent-simulate-v1`).** `thunder impact <base> <proposed>` / `simulateChange`
  estimates a change's impact BEFORE implementation: the deterministic BLAST RADIUS (transitive
  reach over the intent graph, by node type), the risk it would introduce, contradictions, and
  release risk , keeping deterministic dependency impact, rule-derived risk, AI-predicted (null in
  deterministic mode), and unknown impact SEPARATE and honest. Browser-safe.
- **Intent Guardian (`intent-guardian-v1`).** `thunder guardian <before> <after>` / `guardianReport`
  detects drift a change introduced: what changed (semantic diff by mission identity, rename-safe),
  what intent it affects, the risk it INTRODUCED (findings new in after), what must be reverified
  (changed contract elements + invalidated approvals), and which missions' learning is now stale.
  `needs-attention` only on newly-introduced blocking risk; exit non-zero gates a PR. Browser-safe.
- **Intent Scanner + Fable (`intent-scan-v1` / `intent-fable-v1`).** `thunder scan [dir]` runs the
  deterministic pipeline , parse -> Intent IR -> Fable findings -> risk themes , and prints an
  executive/risk summary + a highest-impact remediation sequence; `--json` for the machine report,
  `--ir <path>` to emit the shared Intent IR. Fable is the rule authority OVER the diagnostics
  catalog (risk category + detection strategy + remediation + suppression policy); every finding is
  fully explained (never "AI detected a possible issue"). `scanProject`, `universalPack`,
  `fableRuleFor`, `toFinding` exported. Browser-safe.
- **Repo-wide health report.** `thunder report [dir]` / `buildReport(files)` aggregates every
  .intent file into an intent-health summary (`intent-report-v1`): diagnostics by severity +
  area, top codes, and coverage (guarantees verified, missions with tests, outcomes contracted).
- **SARIF code scanning.** `thunder check <path> --format sarif` emits a SARIF 2.1.0 log
  (`toSarif`), so diagnostics appear natively in GitHub/GitLab code scanning and SARIF-aware
  IDEs , with rule metadata, level mapping, and precise line regions where known.
- **Complete diagnostics reference.** Legacy core check codes (`missing-goal`,
  `guarantee-without-verification`, ...) are now documented and explainable via
  `CORE_DIAGNOSTICS` / `ALL_DIAGNOSTICS`, so `thunder explain <any-code>`, `thunder rules`, and
  `docs/diagnostics.md` cover everything the check pass emits (60 codes). A guard test keeps it
  complete. The canonical `DIAGNOSTIC_RULES` stays IL-* only.
- **Canonical proof envelope (`intent-proof-v1`).** The `.intent-proof.json` shape is now a
  published, versioned contract: `intentProofJsonSchema()` (JSON Schema), `validateProof()`
  (dependency-free structural check), `thunder proof --schema`, and a well-formedness gate in
  `thunder verify`. Browser-safe via `/core` so signers/renderers validate the envelope with
  no Node build.
- **Browser-safe `/core` subpath**, the committed `intent-graph.schema.json`, and the
  canonical 49-rule `IL-*` diagnostic catalog (60 codes documented including legacy core codes).

### Fixed

- Deduplicated `NODE_TYPES` (`Decision` listed twice); orphan-edge fixes (Question,
  transition metadata, capability/pattern/verification links) surfaced by fuzzing; a
  lifecycle transition to an undefined state no longer emits a dangling edge.

## 0.1.0

- Initial release: deterministic parse -> semantic diagnostics -> contract/architecture
  graph -> implementation plan -> proof, plus docs, Mermaid, test plan, the Mission Atlas
  index, IntentLift, and the approve/drift round-trip.
