# Changelog

All notable changes to `@skillstech/intentlang`. Pre-1.0: the language and the
`intent-graph-v1` schema version independently and may still change.

## 0.1.1

The executable + interoperable release. Everything is deterministic and requires no AI.

### Added

- **Executable intent (the Intent Runtime).** `evaluateDecision` (FIRST-hit, full trace),
  `simulateLifecycle` (walk a state machine, reject illegal transitions), and
  `checkDecisionCases`, powered by a safe no-`eval` expression engine. CLI: `intent run`,
  `intent simulate`.
- **First-class tests.** `test` blocks (`case` / `scenario`) inside a `.intent` file, run
  with `intent test` and `runTests`. The spec proves itself.
- **Outcome contracts.** `outcome_contract` binds an outcome to a target; `evaluateOutcomes`
  and `intent outcomes` judge it met / missed / pending against a delivery `result`.
- **Full five-profile language.** System (`capability`, `interface`), delivery (`release`,
  `result`, `learning`), and design (`component`, `artifact`) profiles join core, product,
  and experience. Governance (`waiver`) and data privacy (`data`) too.
- **Interop.** Export to DMN, BPMN, NuSMV, JSON Schema, OpenAPI, W3C Design Tokens, and
  Mermaid , the whole Intent Graph as a paste-anywhere diagram , (`intent export`, `toMermaid`);
  import from DMN and BPMN with a fidelity report (`intent import`, `importReport`); native
  graph <-> source round-trip (`graphToSource`, `intent source`); schema migrations
  (`migrateGraph`, `validateGraph`, `intent migrate` / `validate`); semantic diff + 3-way
  merge (`intent diff` / `merge`).
- **Editor support.** A Language Server (`intent lsp`, `startLspServer`) providing
  diagnostics, completion, and hover over LSP; a TextMate grammar
  (`syntaxes/intent.tmLanguage.json`) for syntax highlighting.
- **Onboarding + CI.** `intent init` scaffolds a runnable starter; `intent check <dir>`
  recurses and gates a whole repo; `intent check --json` and `intent explain <CODE>` for
  tooling; a composite GitHub Action.
- **Style intent.** `style_intent` models brand + visual language as a governed
  Experience-profile extension: design tokens bind to a canonical, lockable address space,
  and `accessibility_target` is always a `proposed` claim (never IL-verified). `analyzeStyle`,
  `styleDiagnostics`, `intent style`, diagnostics `IL-STYLE-001..005`, canonical `StyleIntent`
  node with graph round-trip. Browser-safe via `/core`. Exports to **W3C Design Tokens
  (DTCG)** via `intent export --format tokens` / `toDesignTokens` (`intent-design-tokens-v1`)
  and to a ready-to-use **CSS** custom-property sheet via `--format css` / `toCss`. Experiences
  export to a **Playwright** E2E test scaffold via `--format playwright` / `toPlaywright`.
- **Security + type diagnostics.** Deterministic checks for the mistakes prompts ship:
  `IL-SEC-001` (secret-typed field on an event payload), `IL-SEC-002` (API returns a secret
  with no auth requirement), `IL-TYPE-001` (unrecognized, likely-mistyped field type).
  `securityDiagnostics`, `isRecognizedType`, catalog now 49 rules.
- **Human <-> Structured <-> IntentLang sync (`intent-sync-v1`).** `parseToStructured(source)`
  returns the canonical graph + flat PM fields; `proposeIntent(structured, { base })` regenerates
  IntentLang source with a reviewable diff, surfaced ambiguities (non-factual nodes), round-trip
  fidelity gaps, and validation , never a silent rewrite. Browser-safe via `/core` (for Studio).
- **Comment-preserving structural editing (`intent-patch-v1`).** `applyEdits(source, edits)`
  applies field-level edits (`setField`, `add/removeGuarantee`, `add/removeNever`,
  `add/removeField`, `setFieldType` on inputs/outputs, `add/removeMetric`, `setMetricField`,
  `add/removeOutcome`, and decision rules `add/removeRule`/`setRule`/`setDefault`) directly to
  the `.intent` source, touching
  only the target lines so comments, formatting, and untouched blocks stay byte-identical. Closes
  the sync fidelity gap: a PM edits fields and IL keeps the comments. Field removal takes the
  field's indented modifiers with it (no orphans). Unmatched/unsupported edits are reported,
  never applied blindly. Browser-safe. Also a CLI: `intent edit <file> --edits <json|-> |
  --set-goal | --add-guarantee | ... [--write]`.
- **Verify a code change against its intent (`intent-verify-diff-v1`).** `intent verify-diff
  <intent> --after <code> [--before <code>]` / `verifyDiff()` proves, deterministically and with
  no AI, which of the intent's guarantees/never-rules a change upholds or breaks, and returns a
  gate verdict (PASS/BLOCK, non-zero exit on BLOCK). Blocks on regressions (a claim that held
  before and broke after) and guardrail hits (an added line pushing a never-rule's protected
  secret into a log/response). The keystone of the AI generate-verify loop; honest (catches
  mechanical violations, does not claim to prove correctness).
- **Intent Atlas + lift-all.** `liftAll(source)` / `intent lift <file> --all` lifts EVERY public
  function in a file into its own inferred mission (not just the first), filtering internal
  helpers (Go: exported-only; Python/Ruby: top-level, non-underscore) , so a whole module reads
  as intent. Powers the Intent Atlas: `scripts/build-atlas.mjs` lifts well-known OSS projects
  (Requests, Express, Flask, gorilla/mux, chi) into a browsable /atlas of ~99 inferred missions.
- **Prompt -> intent (`intent-draft-v1`).** `draftIntent(brief)` / `intent draft --brief <json|->`
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
  action , the intent's rules become a hard production gate. `intent guard <file>` previews it.
  Browser-safe.
- **MCP server for AI agents.** `intent mcp` / `startMcpServer` speaks the Model Context
  Protocol over stdio, exposing IntentLang as native tools for coding agents (Claude Code,
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
- **One compiler for five consumers (universal `@skillstech/intentlang/core`).** The whole
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
- **Intent Lens , Intent Scope + Focus Graph (`intent focus`).** A Focus Graph is a
  deterministic subgraph of the Intent Atlas around a selected scope (a mission, a feature
  query, or `--nodes a,b`), with every node tagged by WHY it is in focus (selected / governing
  / dependency / dependent / implementation / verification / risk / contextual) and bounded by
  `--depth`. `makeScope` builds the typed Intent Scope; `buildFocusGraph` the subgraph;
  `intentBrief` a deterministic what/who/guarantees/prohibitions/risks/unknowns brief whose
  confidence is the weakest in scope (honesty). `intent focus <mission|query|--nodes>
  [--depth N] [--json]`. Built over the existing Atlas (not a fork); pure and browser-safe so
  Studio / OpenThunder / RepoMastery / Skills Tech Talk consume one focused representation.
- **Focused scanner queries (`intent risks | gaps | unverified | coverage | unknowns |
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
- **Code actions + autocorrect (`intent code-actions` / `apply-fix`).** `getCodeActions`
  surfaces the available quick-fixes, safety-graded (`safe` autocorrects and `reviewable`
  diagnostic fixes); `autocorrectSource` applies only meaning-preserving header fixes
  (`goals` -> `goal`, `nevers` -> `never`, stray trailing colons), never a valid keyword
  in another context (a decision's `inputs` sub-block is deliberately left alone).
  `intent code-actions <file>` lists them; `intent apply-fix <file> [--write]` applies the
  safe ones and reports the reviewable ones for a human. Both pure and browser-safe.
- **Per-audience docs (`intent docs --lens`).** `intent docs <file>` renders a mission as
  Markdown; with `--lens <lens>` it produces an audience-specific doc that weaves that
  lens's IntentLens notes inline next to the input, output, guarantee, or never they
  annotate, and states up front that notes are documentation, not verification. `--out`
  writes the file; otherwise it prints. `renderLensDoc` is pure and browser-safe.
- **Intent AI event sink (`intent-ai-events-v1`).** `intent ai approve` / `reject` now
  persist their integration event to an append-only JSON-Lines log at
  `.intent/ai-events.jsonl`, so a project keeps a durable audit trail of every AI action.
  `intent ai events [dir] [--subject <id>]` reads it back (who did what, and the status
  move). Pure sink module (`recordEvent`, `parseEventLog`, `serializeEventLog`, `timeline`),
  exported from the barrel; rejects unknown event types; append-only (never mutates).
- **IntentLens notes CLI (`intent-notes-v1`).** `intent notes <file>` lists the compiled
  `note <lens>:` blocks grouped by lens, each with its target (mission / input / output /
  guarantee / never) and source line; `--lens <lens>` filters to one audience and `--json`
  emits the report. Notes explain meaning for a reader and are never verification. Reuses
  the parser's `ast.notes` (no new parsing).
- **Intent Ledger (`intent-ledger-v1`).** `intent ledger <file.json>` / `verifyLedger`, `record*`,
  `explain` keep the append-only, hash-chained (tamper-evident) record of a project's MEANING and
  history: why a mission was built, who approved it, what was assumed, which inferred intent a human
  corrected, which risks were accepted, what was verified, which lessons went stale. Each entry hashes
  over the previous, so history cannot be quietly rewritten , `verifyLedger` locates any break to the
  entry. Deterministic (caller supplies timestamps). `intent ledger <file> --subject <id>` explains
  one mission's provenance; exit non-zero on a broken chain. Browser-safe.
- **Intent Simulator (`intent-simulate-v1`).** `intent impact <base> <proposed>` / `simulateChange`
  estimates a change's impact BEFORE implementation: the deterministic BLAST RADIUS (transitive
  reach over the intent graph, by node type), the risk it would introduce, contradictions, and
  release risk , keeping deterministic dependency impact, rule-derived risk, AI-predicted (null in
  deterministic mode), and unknown impact SEPARATE and honest. Browser-safe.
- **Intent Guardian (`intent-guardian-v1`).** `intent guardian <before> <after>` / `guardianReport`
  detects drift a change introduced: what changed (semantic diff by mission identity, rename-safe),
  what intent it affects, the risk it INTRODUCED (findings new in after), what must be reverified
  (changed contract elements + invalidated approvals), and which missions' learning is now stale.
  `needs-attention` only on newly-introduced blocking risk; exit non-zero gates a PR. Browser-safe.
- **Intent Scanner + Fable (`intent-scan-v1` / `intent-fable-v1`).** `intent scan [dir]` runs the
  deterministic pipeline , parse -> Intent IR -> Fable findings -> risk themes , and prints an
  executive/risk summary + a highest-impact remediation sequence; `--json` for the machine report,
  `--ir <path>` to emit the shared Intent IR. Fable is the rule authority OVER the diagnostics
  catalog (risk category + detection strategy + remediation + suppression policy); every finding is
  fully explained (never "AI detected a possible issue"). `scanProject`, `universalPack`,
  `fableRuleFor`, `toFinding` exported. Browser-safe.
- **Repo-wide health report.** `intent report [dir]` / `buildReport(files)` aggregates every
  .intent file into an intent-health summary (`intent-report-v1`): diagnostics by severity +
  area, top codes, and coverage (guarantees verified, missions with tests, outcomes contracted).
- **SARIF code scanning.** `intent check <path> --format sarif` emits a SARIF 2.1.0 log
  (`toSarif`), so diagnostics appear natively in GitHub/GitLab code scanning and SARIF-aware
  IDEs , with rule metadata, level mapping, and precise line regions where known.
- **Complete diagnostics reference.** Legacy core check codes (`missing-goal`,
  `guarantee-without-verification`, ...) are now documented and explainable via
  `CORE_DIAGNOSTICS` / `ALL_DIAGNOSTICS`, so `intent explain <any-code>`, `intent rules`, and
  `docs/diagnostics.md` cover everything the check pass emits (60 codes). A guard test keeps it
  complete. The canonical `DIAGNOSTIC_RULES` stays IL-* only.
- **Canonical proof envelope (`intent-proof-v1`).** The `.intent-proof.json` shape is now a
  published, versioned contract: `intentProofJsonSchema()` (JSON Schema), `validateProof()`
  (dependency-free structural check), `intent proof --schema`, and a well-formedness gate in
  `intent verify`. Browser-safe via `/core` so signers/renderers validate the envelope with
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
