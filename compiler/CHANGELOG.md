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
  (DTCG)** via `intent export --format tokens` / `toDesignTokens` (`intent-design-tokens-v1`).
- **Browser-safe `/core` subpath**, the committed `intent-graph.schema.json`, and the
  complete 46-rule diagnostic catalog.

### Fixed

- Deduplicated `NODE_TYPES` (`Decision` listed twice); orphan-edge fixes (Question,
  transition metadata, capability/pattern/verification links) surfaced by fuzzing; a
  lifecycle transition to an undefined state no longer emits a dangling edge.

## 0.1.0

- Initial release: deterministic parse -> semantic diagnostics -> contract/architecture
  graph -> implementation plan -> proof, plus docs, Mermaid, test plan, the Mission Atlas
  index, IntentLift, and the approve/drift round-trip.
