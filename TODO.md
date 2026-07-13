# IntentLang Roadmap

> IntentLang is the intent language for AI-era software. It lets engineers define
> what software should do, why it matters, what must never happen, and how the
> result must be verified before code is generated, changed, or shipped.

**Product name:** IntentLang · **Website:** intentlanguage.dev · **By:** SkillsTech
**Category:** Intent-Oriented Programming

**Core philosophy:** Prompt → Intent → Contract → Plan → Implementation → Verification → Proof

- Prompt is how the conversation starts.
- Intent is what the team commits to.
- Code is how the system fulfills it.
- Proof is how trust is earned.

## Positioning guardrails

- Do **not** position IntentLang as just a prompt format.
- Do **not** position it as magic AI code generation.
- Do **not** claim it replaces TypeScript, Python, Java, .NET, Rust, or Go.
- **Do** position it as a durable intent, contract, architecture, verification,
  and proof layer that can guide, generate, verify, or interoperate with
  implementation languages.
- IntentLang sits above programming paradigms: object-oriented, functional,
  service-oriented, event-driven, API-first, infrastructure, and documentation
  targets, chosen by adapter.
- The deterministic compiler must work without AI (`--no-ai`). AI is optional
  assist, and every AI action is traced and human-approved.

## Repo boundary

This repository (`intent-language-site`) is the **website** for intentlanguage.dev.
Language docs and example `.intent` files live here under `docs/` and `examples/`
and can be surfaced on the site. The **compiler is a separate concern** and must
not be built in this repo unless this repo is explicitly designated the compiler
repo and implementation is approved.

---

## Phases

### P0 - Product & language foundation
- [x] Add `TODO.md` roadmap (this file)
- [x] Update `README.md` with public positioning
- [x] Add `docs/manifesto.md`
- [x] Add `docs/syntax-overview.md`
- [x] Add `docs/tutorial.md`
- [x] Add `docs/compiler-contract.md`
- [x] Add `examples/CreateInvoice.intent`
- [x] Add `examples/ResetPassword.intent`
- [x] Add `examples/BillingService.intent`
- [x] Add `examples/InvoiceCreated.intent`
- [x] Add `docs/spec.md`
- [x] Add `docs/ai-age-best-practices.md`
- [x] Add `docs/ecosystem-brief.md` (per-sibling roles + shared artifact contracts)
- [x] Adopt canonical `CreateInvoice` (add `idempotencyKey`, full target list)
- [x] Align `.intent-proof.json` schema to v0.1.0 (schemaVersion, neverRules, proofStatus)
- [x] Convert site examples to lowercase canonical syntax + highlighter
- [x] Add `docs/language-principles.md`
- [x] Add `docs/intent-oriented-programming.md`
- [x] Add `examples/DuplicateInvoicePrevention.intent`

### P1 - Tutorial expansion
- [x] Grow `docs/tutorial.md` into a full walk-through (first mission → proof)
- [x] Worked example: build a secure password reset mission end to end

### P2 - Language specification
- [ ] Add `docs/spec.md`: lexical rules, comments, indentation, identifiers,
      strings, lists, block structure, every construct block, semantic types,
      security modifiers, error model, versioning

### P3 - Compiler contract (spec, not implementation)
- [x] `docs/compiler-contract.md`: pipeline, proof artifact, `--no-ai`, MVP scope
- [x] Semantic-diagnostics catalog documented + CI-guarded: docs/diagnostics.md generated
      from DIAGNOSTIC_RULES (49 rules), `intent rules`, `intent explain <CODE>`. Security
      checks (secret field / api sensitive output without auth) shipped in security.mjs.
- [ ] (superseded) Document the full semantic-diagnostics catalog (missing goal, secret field
      without never-log, duplicate-prevention guarantee without idempotency, API
      with sensitive output but no auth, event payload containing Secret, ...)
- [ ] Define `implementation-plan.json` and the CST → AST stages in detail
- [ ] Note: compiler implementation lives in the **SkillsTech Compiler repo**,
      not here

### P4 - Examples library (multi-domain)
- [ ] auth, billing, notifications, ecommerce, AI agent workflow, RAG pipeline,
      API gateway, event-driven service, data pipeline, infrastructure policy

### P5 - Website content (this repo)
- [x] Shift site prose and metadata to the **IntentLang** brand
- [x] Add **Prompt** to the homepage philosophy (7 stages)
- [x] New homepage line/pill: "The intent language for AI-era software."
- [x] "Prompt is temporary. Intent is durable." section on the homepage
- [x] Proof-chain framing in the ecosystem section
- [ ] Remaining page-by-page prose polish (vision/docs/examples still say "Intent")
- [x] Surface `docs/` and `examples/` on the site (render `.intent` + Markdown)

### P6 - Optional AI assist (documented, gated)
- [ ] Document Prompt-to-Intent, intent review, missing-guarantee/risk/test
      suggestions, target planning, explanation generation
- [ ] Make explicit: AI optional, compiler works without it, outputs approved

### P7 - Certification track (future)
- [ ] Document "SkillsTech Certified Intent-Oriented Programming Associate"

## Cross-cutting concepts to carry through docs
- [ ] **Intent Drift** - implementation no longer satisfies declared intent
- [ ] **Proof artifact** - `.intent-proof.json` as a first-class output
- [ ] **Adapters** - per-target generators (dotnet, typescript, python, openapi,
      mermaid, markdown, tests)
- [ ] **why / because** - rationale that captures engineering judgment
- [ ] **Style** - paradigm/stack hints per target (CleanArchitecture, CQRS, …)

## Ecosystem integrations (later)

The through-line is **proof**. Each product proves a different thing about the
same mission:

- [ ] **SkillsTech Compiler** proves the language can produce artifacts
- [ ] **OpenThunder** proves the repo matches the declared intent (drift)
- [ ] **Repo Mastery** proves the human understands the mission
- [ ] **SkillsTech Certified** proves the learner understands the method
- [ ] SkillsTech Talk: turn missions into explanation/defense drills
- [ ] SkillsTech Workspace: store signed proof artifacts and adoption metrics

## Acceptance criteria (for the foundation slice)
- [x] Repository has a clear roadmap
- [x] README explains IntentLang clearly
- [x] Docs include tutorial and syntax
- [x] Examples are conceptually consistent (no compiler required here)
- [x] No overclaim of production-readiness
- [x] No claim it replaces mainstream languages
- [x] Public story states Prompt → Intent → Contract → Plan → Implementation → Verification → Proof
- [x] Docs explain the no-AI deterministic compiler requirement
- [x] Docs include Intent Drift and proof artifacts

## Compiler emit stage (MVP) , SHIPPED 2026-07-09

Deterministic `@intentlang/compiler` in `compiler/` (no AI). `intent check|graph|proof|build`.
Emits `.intent/<mission>/{contract-graph.json, architecture-graph.json, implementation-plan.json, .intent-proof.json}`
+ Markdown/Mermaid/testplan. Shapes match OpenThunder's consumer contract (`il-to-ot-intent-v1`); stable slug IDs
for drift keying. Semantic pass catches the signature "duplicate-prevention without idempotency" diagnostic.
Tested against `examples/CreateInvoice.intent`.

Next slices (small, in order):
1. ~~Split decision~~ , DECIDED 2026-07-09: compiler stays in the IL repo for now (zero coupling; can move later).
2. ~~Real test suite (node --test)~~ , DONE: 6 tests (parse, idempotency diagnostic, contract-graph shape + stable IDs, proof schema, determinism, all-4-examples).
3. Semantic pass: unknown-semantic-type, event-payload-contains-Secret, api-sensitive-output-without-auth.
4. Targets: OpenAPI draft when `api` blocks exist; then richer Markdown/Mermaid.
5. `package.json` `bin` wiring so `intent` is a real CLI (npm link / npx).
6. Multi-file: compile a whole `*.intent` tree into one `contract-graph.json` (missions[]).

## Playground (semantic compiler for trust)

Shipped: real compiler via `/api/compile` (deterministic, no AI); Diagnostics with
why + fix; rendered Mermaid contract graph (Diagram/Source toggle + copy); Docs,
Test Plan, Proof tabs; proof summary; copy/download per artifact; trust strip;
Semantic Beauty score + Trust Readiness; "Try breaking it" demo buttons.
Style rule: **no emojis** (premium), use SVG/dots/text. **No em dashes.**

Next playground slices (from the product brief, in build order):
- [x] Click a diagnostic (Show source) to highlight its source line
- [ ] Extend highlight to proof items, test-plan lines, and diagram nodes
- [ ] Per-diagnostic "Apply fix" (insert the suggestion into the source)
- [ ] Debug tab (plain-language meaning, main trust gap, first fix)
- [ ] "Copy as PR comment" and "Export starter repo" (zip of all artifacts)
- [ ] Guided stepper: Write → Compile → Debug → Prove → Export
- [ ] Expand example gallery by category + difficulty
- [ ] Later, gated: "Draft from prompt" (AI assist, human review required)

## IntentLens Notes (compiled semantic comments)

Comments that compile into understanding. `# ...` stays ignored; `note <lens>:`
blocks are compiled, attached to the nearest node, and emitted with source spans.
Notes explain meaning for a reader; they are NEVER verification. One compiler,
both playgrounds consume the same JSON (no playground parser duplication).

Shipped (compiler core + IL playground):
- [x] Parser: line tracking; parse `note <lens>:` on mission / input / output /
      guarantee / never; separate notes from field modifiers
- [x] `ast.notes` with id, lens, text, targetKind, targetPath, sourceSpan(line)
- [x] Diagnostics INTENT_NOTE_UNKNOWN_LENS, INTENT_NOTE_EMPTY (warnings)
- [x] `compileSource` returns `notes`; proof carries `notes` metadata (not verification)
- [x] Tests (9 total): parse/attach/span, unknown-lens, notes-not-verification
- [x] CreateInvoice example + playground default include notes
- [x] Playground Notes tab grouped by lens, lens selector, click-to-source, trust-strip count

Next slices:
- [ ] `intent notes <file> --json` and `intent docs --lens <lens>` CLI commands
- [ ] Lens-aware reader VIEWS (PM/Beginner/QA/Security render the whole file per audience)
- [ ] Notes-aware docs generation (include the lens's notes inline)
- [ ] Diagnostics: INTENT_NOTE_RESTATES_TARGET, INTENT_TERM/RISK/PM/SECURITY_NOTE_RECOMMENDED
- [ ] Support the fully-nested `mission:`/`goal:` colon style from the canonical spec

## IntelliSense (compiler-backed completions, hover, code-actions)

One compiler is the source of completions/hover/fixes; the playground renders,
never invents. Deterministic first (no AI). Safety levels: safe / reviewable /
meaning_change / blocked.

Partial (already true): diagnostics carry structured `fix { label, insert, block }`,
which is the code-action/quick-fix contract; the playground "Apply" applies them.

Next slices (compiler core first):
- [x] Completion provider (compiler core): block keywords, note lenses, semantic types,
      context-aware; `intent completions --position --json`; consumed via /api/assist
- [x] Hover provider (compiler core): semantic types + note lenses; `intent hover --position --json`
- [ ] Code-action provider with safety levels + text edits; `intent code-actions`, `intent apply-fix`
- [ ] Autocorrect (safe): `goals:`->`goal:`, `guarantee:`->`guarantees:`, indentation, casing
- [ ] `intent format`; later `intent lsp` (LSP) for VS Code
- [x] Playground Assist panel: compiler hover + click-to-insert completions (textarea)
- [x] Monaco editor with intent language, dark theme, and inline compiler completions + hover
- [ ] Quick-fix lightbulb (code-actions), fix-preview diff, Fix-all-safe, lens-aware ranking
- [ ] Self-host Monaco (currently CDN via @monaco-editor/react loader)
- [ ] Do NOT hardcode completions in the playground; do NOT duplicate the parser

## IntentLift (Code-to-Intent)

Lift implementation code into an INFERRED IntentLang draft. Useful but humble:
evidence, confidence, unknowns, needs_review, source-mapped, reviewed:false, proof
draft. Never claims inferred intent is verified. Backbone: compiler core does the
lifting; playground/IDE render it. Pipeline: source -> Language Adapter ->
CodeFactsIR -> Inference Engine -> LiftedIntent -> .intent draft.

Shipped (P0, compiler core + playground, no AI):
- [x] `compiler/src/lift.mjs`: CodeFactsIR + TypeScript adapter (functions,
      params, return types, tests, errors) + inference + humble .intent renderer
- [x] Inference: mission from fn name; inputs from params; output unwrapped from
      Promise/Result; guarantees from test names; never from errors; unknown +
      needs_review; per-item + overall confidence; source spans
- [x] Lift diagnostics (NEEDS_HUMAN_REVIEW, LOW_CONFIDENCE, NO_TEST_EVIDENCE,
      UNKNOWN_SEMANTIC_TYPE, SECURITY_REVIEW_NEEDED)
- [x] CLI `intent lift --from typescript <file> [--json] [--out dir]`
- [x] Parser recognizes inferred blocks so lifted drafts compile without noise
- [x] `/api/lift`; playground "IntentLift" panel: paste code -> draft + summary
      -> Open in editor / Copy / Download
- [x] Tests (13 total): lift TS, source-mapped, unverified, unsupported-lang safe

Next slices:
- [x] `intent lift --from repo <path>` (walk files, one mission/file, unique names,
      repo summary JSON with confidenceSummary + outputs; skips node_modules/dist/...)
- [ ] Route/OpenAPI/schema/DB-access detection; richer never-rule mapping
- [x] Rust adapter (fn signatures, Result<T,E> unwrap, error-enum variants -> never
      rules, #[test]/#[tokio::test]); repo mode auto-detects .rs; playground lang selector
- [ ] Rust: serde structs, actix/axum/rocket route macros, sqlx/diesel DB access
- [x] Perl adapter (conservative: subs, @_ / signature params as Unknown, die/croak
      -> never rules, ok/is/subtest -> tests; low confidence + DYNAMIC_LANGUAGE_LIMITATION)
- [ ] Perl: DBI table names -> database, POD -> goal/why, Mojo/Dancer/Catalyst routes
- [ ] Source-map panel + "Equivalent Intent" IDE view; per-line evidence
- [x] `intent approve` (reviewed:true + source_hash + reviewer/time; recognized block)
- [x] `intent drift <code> --intent <file>`: re-lift + compare (guarantee/never/input
      unsupported, stale proof, new behavior); playground lift->approve->drift demo
- [x] `intent handoff` emits `il-to-ot-drift-v1` (mission, approval+hash, mapsTo,
      expectations[] with checks); /api/handoff + playground button; documented
- [x] OpenThunder consumer (in the OpenThunder repo, @openthunder/intent):
      consumeDriftHandoff ingests il-to-ot-drift-v1, checks vs repo evidence, emits
      intent-drift-report-v1. Cross-repo round-trip verified end to end.
- [x] `openthunder intent drift --pack --repo`: CLI wraps the consumer; prints the
      report + a can-i-ship line; exit 1 on drift.
- [x] Intent drift surfaced in Can-I-Ship: `openthunder can-i-ship --intent-pack`
      folds drift into the ship verdict (drift->HOLD, review->CAUTION, in_sync->SHIP;
      only tightens, never loosens) across text/--json/--pr-comment. shipVerdictFromDrift
      + scanRepoEvidence added to @openthunder/intent; +1 vitest. Verified end to end.
- [x] Documented the drift round-trip + `--intent-pack` gate in docs/ecosystem-brief.md
      (approve -> handoff -> `openthunder intent drift` / `can-i-ship`); live on
      intentlanguage.dev/docs/ecosystem-brief.
- [ ] Assisted mode via SkillsTech Runtime (AI optional, labeled, human-approved)

## Mission Atlas , scaling beyond one .intent file

> Teaching model for navigating MANY missions: one file is not enough when Claude
> Code / Codex or a team generate dozens or hundreds of `.intent` files a day. This
> repo owns the CONCEPTS + EXAMPLES. The SkillsTech Compiler owns machine-readable
> indexing/artifacts; SkillsTech owns the product dashboard; OpenThunder verifies
> code vs missions; Repo Mastery + Certified own learning. Do NOT build the product
> UI here. Aggregation commands are documented as PLANNED until the compiler ships them.

Concepts to teach: Mission Atlas (semantic map of missions), Mission Capsule (compact
per-mission summary), Mission Chain (end-to-end flow), Build Session Digest (what changed
this session), Release Story (trust-aware release narrative), Proof Matrix (verification
table), Risk Radar (what to review first), Semantic Diff (diff by meaning), MVP Readiness
(demo_safe .. production_ready classifier).

Slice 1 (this slice):
- [x] Roadmap: this Mission Atlas plan
- [x] `docs/mission-atlas.md` (Atlas + Mission Capsule, the hierarchy, cross-links)
- [x] `docs/large-changes.md` (umbrella: defines every concept + the "200 missions ->
      one Release Story" tutorial + a command table marking existing vs PLANNED)
- [x] `examples/mvp-customer-portal/` , worked example: valid `.intent` missions across
      4 feature areas, 2 mission chains, release-story.md, and JSON teaching fixtures
      (mission-index / mission-chain-map / mission-proof-matrix / intent-session-summary /
      mvp-readiness-report)
- [x] Register both docs in `src/lib/docs.ts` (auto-links /docs index + footer)

Slice 2 (this slice , split the umbrella into focused pages):
- [x] 7 focused concept pages: `docs/mission-chains.md`, `docs/build-session-digest.md`,
      `docs/proof-matrix.md`, `docs/risk-radar.md`, `docs/semantic-diff.md`,
      `docs/mvp-readiness.md`, `docs/ai-generated-missions.md`. `large-changes.md`
      refactored into a hub that links them (no content duplication).
- [x] Expanded the MVP example to all 15 canonical missions (added ActivateSubscription,
      CancelSubscription, AuditLog, ErrorMonitoring, RollbackPlan; fixtures + release
      story recomputed; Billing/RollbackPlan kept under-verified so readiness stays honest).
- [x] Tutorial promoted to its own route: `docs/release-story-tutorial.md`.
- [x] All 8 docs registered in `src/lib/docs.ts`.

Slice 3 (this slice , first real aggregation command):
- [x] Implemented `intent index <dir> [--json]` for real: `compiler/src/atlas.mjs`
      (`buildMissionIndex`) + CLI wiring + 3 vitest-style node tests (23/23 pass). Reports
      only .intent-derivable fields (mission, area, risk heuristic, guarantee/never counts,
      declared verification, reviewed); honestly excludes test pass counts and drift, which
      need a test runner + OpenThunder.
- [x] `examples/mvp-customer-portal/mission-index.json` is now a GENERATED golden fixture
      (real `intent index --json` output), not hand-authored.
- [x] Un-marked `intent index` from planned -> shipped in the docs (mission-atlas,
      large-changes, tutorial, example README, compiler README). Other aggregation
      commands stay honestly planned (evidence-dependent).

Slice 3 follow-ups (planned):
- [ ] Republish `@skillstech/intentlang` (bump) so npm users get `intent index`.
- [ ] `intent chains` (needs a chain-declaration convention or reliable type-linkage detection).
- [ ] `intent summarize` / `diff` / `release` (need git history + test/drift evidence).

Ecosystem contract alignment (downstream tools consume these artifacts):
- [x] Add stable join keys to `mission-index-v1` , `missionId` (deterministic mission slug) +
      `intentProofHash` (byte-identical to the `.intent-proof.json` sourceHash). Additive; golden
      fixture regenerated; +test asserting the hash equals the proof's. OpenThunder joins with no remap.
- [ ] Promote `mission-chain-map.json` / `semantic-diff.json` / `mvp-readiness-report.json` from example
      fixtures to REAL compiler output. They are consumed downstream as contracts today; the fixtures should
      become golden tests for the generated artifacts. (Test-pass counts + drift stay consumer-provided.)

Sibling-requested (committed on the coordination bus 2026-07-10; all additive):
- [x] Add `sourceProduct: "skillstech-compiler"` to `.intent-proof.json` (asked by STCE, for cert-proof keying).
      Additive envelope field (after schemaVersion); sourceHash/join keys unchanged; +assertion. 23/23 tests.
- [x] Add an ESM library entry to `@skillstech/intentlang` (asked by ST, #134500): `src/index.mjs` curated
      barrel + `main`/`types`/`exports` in package.json + hand-written `src/index.d.ts`. Consumer
      `import { parseIntent, buildMissionIndex, compileSource, ... }` verified via pack->install->import;
      CLI bin still coexists; .d.ts typechecks. Rides the pending 0.1.1 publish.
- [x] Parse an `errors:` block (PascalCase failure names) (ST #220000): parser + AST + `.intent-proof.json`
      `errors[]` + per-error testplan rows + a non-PascalCase warning. Demoed on CreateInvoice.
- [x] Parse an `examples:` block (`given -> expect`) (ST #140500): parser + AST + proof `examples[]` +
      testplan rows. Both additive; 25/25 tests; demoed on CreateInvoice; index golden fixture regenerated.
- [ ] Build `intent compile --target openthunder` (native `.openthunder/missions/<id>/contract.yaml`,
      `source:'intentlang'`) ONLY IF OT/STCE confirm they still need the deep path (OT already consumes the JSON +
      drift seam). Question posted; awaiting their answer.
- Note: nested `verify:` per guarantee/never is ALREADY shipped (ratified to ST, no work needed).

Compiler support (PLANNED , owned by the SkillsTech Compiler, documented not built here):
- [ ] `intent index ./intent` , mission inventory (mission-index.json)
- [ ] `intent graph ./intent --view atlas` , Mission Atlas view
- [ ] `intent chains ./intent` , detect + render mission chains
- [ ] `intent summarize ./intent --since today` , Build Session Digest
- [ ] `intent diff ./intent --since HEAD~1` , Semantic Diff
- [ ] `intent proof matrix ./intent` , Proof Matrix
- [ ] `intent release ./intent --mvp` , MVP Readiness Report + Release Story

## Intent AI Implementations (intent-ai-v1) , cross-product initiative

> Intentionally deferred, AI-assisted implementations as a first-class, traceable,
> verifiable, reviewable concept. AI writes a candidate; IL defines what is allowed;
> OT proves it; RM teaches it; ST connects the experience. Deterministic, provider-optional.

Phase 1 (IL-owned , SHIPPED):
- [x] `implement with ai { ... }` block (full + concise `implement with ai pending`) , parser + AST
      (`ast.implementation`, `ast.architecture`).
- [x] `compiler/src/ai.mjs`: 9-state model + `blocksProduction`; shared multi-language managed-region
      marker parser (`parseMarkers`/`renderMarker`, `//` and `#`); `contractHash` + `implementationHash`
      (normalized); `.intent/ai-implementations.json` manifest (`buildManifest`); provider-neutral
      `buildImplementationPrompt` (Path 1 handoff).
- [x] Semantic: intentional-pending is INFO `INTENT-AI-001` (NOT missing-code); scope/risk/editing +
      high-risk-needs-approval warnings (`INTENT-AI-010..013`).
- [x] CLI: `intent ai list`, `intent ai generate`. Library barrel + `index.d.ts` export the AI API.
- [x] Docs `docs/ai-implementations.md`; example `examples/CalculateRiskScore.intent`. 34/34 tests.

Deferred (other products' instances, coordinated via the intent-ai-v1 contract , NOT built here):
- [ ] Phase 2 OT: verification pipeline (region integrity/syntax/types/contract/effects/architecture/
      security/tests/determinism), proof at `.intent/proofs/{id}.json`, SARIF (INTENT-AI-* rules),
      production gating. Reuse OT Architecture Lens + Security Lens + scan SARIF.
- [ ] Phase 3 ST/IDE: status indicators + generate/import/verify/approve/reject/regenerate/adopt actions.
- [ ] Phase 4 RM: explanation/walkthrough/checklist/flashcards/quiz/explain-back/handoff + ownership.
- [ ] Phase 5: multi-candidate + deterministic selection, mutation testing, org policies, signed proofs.
- [x] IL follow-ups (SHIPPED): state resolver (`resolveState`: declaration + region + proof -> real state,
      with stale-proof MODIFIED on hash mismatch), `productionGate` + `intent ai gate [--allow-pending]`,
      `intent build --mode production` gate wiring, `intent ai adopt` (marker rewrite AI->human, provenance
      preserved). Exported from the library. 38/38 tests.
- [x] IL follow-ups (SHIPPED): `intent ai approve/reject` + `.intent/ai-approvals.json` store , decisions
      bind to reviewed hashes (refuses stale/unverified; approval goes stale on any change -> MODIFIED). Shared
      `IntentAi*` event builder (15 event types, versioned payload). Full approve->PASS->modify->stale verified.
- [x] IL follow-ups (SHIPPED): `architecture` rules , `compiler/src/arch.mjs` parses dependency
      constraints into structured rules (from/relation/to) + `violatesArchitecture(rules,from,to)` (the
      reusable forbidden-edge check OT calls, INTENT-ARCH-307). In the contract graph + contract hash;
      malformed lines -> INTENT-ARCH-001 warning. Exported from the library. 45/45 tests.
- [x] intent-ai-v1 reconcile (from OT #216 + RM redline): extracted pure helpers to `ai-core.mjs`
      (zero Node deps) + published `@skillstech/intentlang/core` subpath so RM's browser bundle can import
      states/blocksProduction/makeEvent; locked `PROOF_CHECK_KEYS` (9 keys, `contracts` plural); pinned the
      canonical contractHash clause set + proof shape + SARIF rule catalog in contracts/intent-ai-v1.md.
- [x] Deterministic candidate selection (SHIPPED): `compiler/src/select.mjs` , `selection` block
      (require/prefer), `regionMetrics` (size/complexity/deps), `selectCandidate` (measurable ranking,
      require-checks filter, stable tiebreak). `intent ai select <dir> <id>`. An LLM never picks. Pure
      (browser-safe). 51/51 tests; verified a failed-checks candidate loses to a worse-but-passing one.
- [ ] IL follow-ups (remaining): an events sink/log (last minor IL piece).

## Operating checklist status (see docs/operating-checklist.md)

The full Top-100 lives in `docs/operating-checklist.md`. Mapping to current state:

**Shipped / in good shape**
- Category, one-liner, philosophy, "not just prompts" positioning (site + manifesto)
- First-demo wedge: `intent build` emits docs, Mermaid, test plan, contract/architecture graphs, `.intent-proof.json` (no AI)
- Small readable syntax, semantic types, security modifiers, `never`, `why/because`, three layers, architecture/api/event/test (docs + examples)
- Deterministic `--no-ai` compiler: real parser, AST, stable output, teaching diagnostic (idempotency), proof schema v0.1.0
- Website, manifesto, tutorial, spec, compiler-contract, ai-age-best-practices, ecosystem-brief; 4 examples browsable

**Near-term (small, high-leverage)**
- [x] SECURITY + TYPE DIAGNOSTICS SHIPPED (#29,#43): security.mjs , IL-SEC-001 (secret-typed field Secret/Password/Jwt on an event payload = secret over the bus, blocker/release), IL-SEC-002 (API returns a secret with no `requires` auth gate, blocker/release), IL-TYPE-001 (unrecognized/mistyped field type, info). isRecognizedType + SEMANTIC_TYPES/PRIMITIVE_TYPES hoisted from data-schema.mjs (one source of truth). Wired into semanticDiagnostics (gate-safe). Catalog 49 rules; diagnostics.md + schema regenerated. Fuzz-covered (event/api/payload keywords + secret/typo frags). Exported + typed. 323 tests. docs/compiler-contract.md + diagnostics.md. schema intent-security-v1.
- [ ] OpenAPI generation when an `api` block exists (#37)
- [x] `bin` wiring + npm publish (#40,#94): published `@skillstech/intentlang@0.1.0`
      (public, MIT). `npm i -g @skillstech/intentlang` -> `intent`; `npx @skillstech/intentlang`.
      Verified via real registry install. (Scope: @intentlang org doesn't exist; used the
      owned @skillstech scope, consistent with @skillstech/openthunder.)
- [x] `intent check` in a GitHub Actions workflow (#95): scripts/intent-check.mjs
      batch-runs the real CLI over every authored .intent (skips the .intent/ output
      dir), exit 1 on any error; `.github/workflows/intent-check.yml` gates push/PR;
      `npm run intent:check` locally. Fixed missing-mission -> missing-subject so
      service/event/api/database intents are valid subjects (was erroring the examples).
- [x] Wire the web playground to the real compiler (/api/compile, deterministic, no AI) (#89)
- [ ] Six more examples toward the target ten: RAG pipeline, webhook handler, event-driven billing, auth API, file upload, AI agent task, data pipeline, deployment policy (#91)
- [ ] `intentlang-starter` template repo (#93)
- [ ] Proof status vocabulary: draft/verified/partial/stale/failed/approved (#50)

**Later**
- [ ] VS Code extension (highlight, diagnostics, run, preview) (#90)
- [ ] Comparison pages: vs prompts, BDD, OpenAPI, Mermaid, ADRs, UML, Terraform, TS, Python (#92)
- [x] OpenThunder Intent Drift detection + demo (#71,#96): full round-trip shipped
      (intent handoff -> consumeDriftHandoff -> intent-drift-report-v1), surfaced in
      `openthunder intent drift` and the `can-i-ship --intent-pack` gate; documented + live
- [ ] Runtime split for AI routing; Prompt-to-Intent as a traced, approved assist (#57,#63)
- [ ] Ecosystem proof consumers: Repo Mastery teaching, STT defense drills, STCE track, Workspace signing (#75-#82)

## Intent for every role (intent-graph-v1) , cross-product initiative

> Evolve Intent from a developer language into a shared PRODUCT + software intent
> language: one canonical model, every role (PM/UX/research/eng/QA/security/analytics/
> business), verified execution. IL owns the language + Intent Graph; OT verifies; RM
> teaches; ST authors. Lifecycle: Evidence -> Outcome -> Requirement -> Experience ->
> Contract -> Implementation -> Verification -> Release -> Result -> Learning.

Phase 1 slice 1 (IL-owned , SHIPPED):
- [x] Profiles (`use product|experience|assurance|...`) , parser + `ast.profiles`.
- [x] Product Mission syntax: title/for/problem/evidence(classification,confidence,source)/
      outcome/metric(baseline,target,window)/scope(include,exclude)/non_goal/owner/
      approval-required-from/unknown/question/assumption , typed AST.
- [x] Classification model (`compiler/src/classification.mjs`): observed/inferred/proposed/
      assumed/unknown/decided/verified + isFactual/UNSETTLED (AI content never silently fact).
- [x] Canonical Intent Graph (`compiler/src/intent-graph.mjs`, `buildIntentGraph`): typed
      nodes + relationships, deterministic; emitted as `intent-graph.json` by `intent build`.
- [x] Role-aware structured diagnostics (IL-PM-001 metric-no-window, IL-EV-001 evidence-no-
      classification, IL-GRAPH-010/011 blocking unknown/question) with severity/blocks/roles.
- [x] Example `examples/CertificationStudyPlan.intent`; docs/intent-graph.md; library +
      index.d.ts exports; 56/56 tests. Backward-compatible (existing .intent files unaffected).

Phase 1 slice 2 (IL-owned , SHIPPED):
- [x] Experience Contract syntax (experience/actor/goal/enter-when/journey/state/responsive/
      accessible/follows + reusable pattern) , typed AST; ExperienceContract/Journey/
      ExperienceState/Pattern nodes in the Intent Graph; IL-EXP-004 missing-recovery-path (UX
      blocker, role-rendered) + IL-EXP-001. Example UploadStudyMaterial.intent; 59/59 tests.

Phase 1 slice 3 (IL-owned , SHIPPED , Gap 1 / founder gap-closure program):
- [x] Constraint composition + conflict resolution , the reconciliation layer (the ecosystem
      differentiator). Role-scoped constraints (`product|experience|security|legal|operations|...
      requires`) compose DETERMINISTICALLY + ORDER-INDEPENDENTLY. First-class `conflict` block
      (between/options/resolve_by/before). `compiler/src/conflict.mjs`: detectConflicts (declared +
      scope-contradiction + redundant + negation) + composeConstraints. Diagnostics IL-CONFLICT-001
      (declared, blocker w/ owners+phase+options)/010/011/012. Conflict + Constraint nodes in the
      Intent Graph. Example CertificationCheckout.intent. 66/66 tests. An LLM never resolves.

Deferred (IL next slices , from the ecosystem gap-closure program):
- [ ] Phase 0 audit + §28 repo report (largely done: intent-graph-v1 already covers the language moat).
- [x] Canonical schema (non-negotiable #1, anti-fork) , `compiler/src/intent-schema.mjs`: canonical
      NODE_TYPES (30) + RELATIONSHIP_TYPES (19) + NODE_STATUSES + a draft-07 `intentGraphJsonSchema()` +
      DIAGNOSTIC_RULES catalog (stable IDs). `intent schema` emits it. Test enforces buildIntentGraph can
      only emit canonical types. Consumers generate bindings from this instead of hand-recreating. 69/69.
      (Full separate npm packages `@skillstech/intent-schema/graph/diagnostics` are a later split; the
      canonical source + `intent schema` output serve as the binding source now.)
- [x] Gap 2 temporal/lifecycle , SHIPPED: `lifecycle` state machine (state/transition[from/to/within]/
      terminal) + temporal primitives (always/eventually-within/never-before/until-restrict); formal IR
      (`compiler/src/lifecycle.mjs` buildLifecycle: initial/reachable/adjacency) + static analysis
      (IL-LIFE-001 undefined-state=error, 002 terminal-with-outgoing, 003 unreachable, 004 dead-end;
      IL-TEMP-001 eventually-no-bound). Lifecycle/LifecycleState nodes + transitions_to. Example
      CertificationAttempt.intent. 73/73 tests. OT verifies the implemented reality vs this IR.
- [x] Gap 3 distributed/failure , SHIPPED: `command` (idempotency_key/timeout/retry/backoff), `event`
      extended (delivery/ordered_by, reuses existing event), `on <trigger>` handlers (compensate/notify/
      preserve). `compiler/src/distributed.mjs` analyzeDistributed: IL-DIST-001 retry-without-idempotency
      (the classic bug), 002 no-timeout, 003 at-least-once-without-dedup, 004 missing-compensation, 005
      undeclared-event (error). Command/FailureHandler nodes. Example CreateStudyPlan.intent. 78/78 tests.
- [x] Gap 4 decisions/rules , SHIPPED: `decision` (inputs/rule[when/return/priority]/default/explanation/
      owner). `compiler/src/decision.mjs` analyzeDecision: IL-DEC-001 missing-default, 002 conflicting-rules
      (same when, diff return), 003 redundant-rules, 004 no-rules. Decision/Rule nodes. Example
      CertificationEligibility.intent. 84/84 tests. OT verifies rule coverage + impl match.
- [x] Intent Atlas (directive #4) SHIPPED: buildAtlas/searchAtlas/expandNode over the graph; `intent atlas` (overview/search/expand); whole-system map over 26 example missions (132 nodes). Mission Atlas = mission-index-v1.
- [x] Semantic diff (directive #4) SHIPPED: diffGraphs + `intent diff <before> <after>` , added/removed/changed nodes + edges + invalidated-approvals-on-contract-change (deterministic). 94 tests.
- [x] Semantic MERGE (directive #4, the pair) SHIPPED: mergeGraphs(base,ours,theirs) + `intent merge <base> <ours> <theirs>` , deterministic 3-way merge by node identity/meaning, structured conflicts (keeps ours), presence-based edge merge, exit 1 on conflict (CI). Typed IntentMerge/`intent-merge-v1`. 99 tests. Substrate for ST collaborative Atlas editing. cfa380f.
- [x] Gap 5 governance/waivers SHIPPED: `waiver <CODE>` block (reason/approved_by/scope/expires) parsed to ast.waivers; governance.mjs applyWaivers + governanceDiagnostics (IL-GOV-001..005), schema `intent-governance-v1`; wired into `intent check` (waived blockers shown on-record, don't fail build; `--now` for deterministic expiry). Exported + typed. 107 tests. docs/governance.md.
- [x] Gap 6 data-purpose/privacy SHIPPED: `data <path>` block (classification/purpose/retention/basis) -> ast.dataElements; privacy.mjs analyzePrivacy enforces purpose limitation (IL-DATA-001..006: pii/sensitive without purpose/retention/basis, unknown classification, bad lawful basis, exposed-as-output-without-guard), schema `intent-privacy-v1`; wired into semanticDiagnostics (warning/blocker, never error -> gate safe; fires only on declared data). Exported + typed + DATA_CLASSIFICATIONS/LAWFUL_BASES. 116 tests. docs/data-privacy.md.
- [x] DMN/BPMN + model-check export adapters SHIPPED: exporters.mjs toDMN (decisions -> DMN 1.3 FIRST-hit tables, default as catch-all rule) / toBPMN (lifecycles -> BPMN 2.0 processes, states=tasks, transitions=flows, terminals=endEvent) / toSMV (lifecycles -> NuSMV finite-state model + EF-reachability specs for terminals + AG/AF temporal skeletons for always/eventually/until). `intent export <file> --format dmn|bpmn|smv [--out]`. Deterministic/pure, exports only what's declared. Exported + typed. 124 tests. docs/export-adapters.md.
- [x] THE INTENT RUNTIME , executable intent (beyond prompt engineering) SHIPPED: runtime.mjs evaluateDecision (FIRST-hit decision evaluation against concrete inputs, full per-rule trace, default catch-all, malformed conditions traced not thrown) + simulateLifecycle (walk a state machine over an event sequence, reject illegal/terminal transitions with reasons) + checkDecisionCases (decision as a self-checking test table). Powered by expr.mjs , a safe deterministic no-eval expression engine (comparisons, and/or/not, in[list], arithmetic, dotted paths, enum tokens). `intent run <file> --inputs '<json>'` and `intent simulate <file> --events a,b,c` (exit codes for CI). Zero AI, zero codegen, pure. Exported + typed. schema `intent-runtime-v1`. 145 tests. docs/intent-runtime.md.
- [x] EXECUTABLE PLAYGROUND on the site SHIPPED: /api/run route (deterministic parseIntent + evaluateDecision + simulateLifecycle, no AI) + RuntimeClient.tsx "Run it" section , input fields auto-derived from declared decision inputs, events box for lifecycles, decision result + per-rule trace, lifecycle path + step validity. Playground restructured Run-it then Compile-it. Prod build passes, verified end-to-end.
- [x] Canonical schema fixes from sibling feedback: NODE_TYPES dedup (RM bug: Decision listed twice) + uniqueness tests; Question orphan-edge fixed (Mission -depends_on-> Question); transition name/within now on the transitions_to edge; /core promoted to browser-safe SUPERSET barrel (schema+classification+runtime); Capability node type added (OT anti-fork request, implemented_by containment). 150 tests.
- [x] IP/open-core cheap-essentials (founder directive 2026-07-11): CLASSIFICATION.md + PR publication-gate hook in the open repo; invention dossiers (INV-001..007) + IP asset registry + namespace reservation in the vault (confidential). Decision: keep language OPEN (standard/adoption), moat = trademark + proprietary federation/discovery/hosting/verification. License selection + patent/trademark filings = counsel-owned (queued for founder). Exposure of already-public mechanisms flagged to founder.
- [x] ROUND-TRIP IMPORT ADAPTERS SHIPPED: importers.mjs fromDMN (DMN 1.3 decision table -> decision block, reconstructs when from unary tests OR full-expr cells, all-dash rule -> default) / fromBPMN (BPMN 2.0 process -> lifecycle, tasks->states, flows->transitions, flow-to-endEvent->terminal) + detectFormat + importIntent. Own zero-dep XML reader (xml.mjs). `intent import <file> [--format dmn|bpmn] [--out]`. CONTRACT: behavioral round-trip fidelity (fromDMN(toDMN(ast)) decides identically; fromBPMN(toBPMN(ast)) walks identically) proven via runtime in tests; also reads FOREIGN Camunda/Drools-style files. Exported + typed. 158 tests. docs/import-adapters.md.
- [x] FIRST-CLASS TESTS SHIPPED: `test <decision|lifecycle>` block with `case`/`scenario` (given <k> <v> + expect <result> for decisions; events a,b,c + expect <state> + valid/invalid for lifecycles) -> ast.tests; testing.mjs runTests executes them through the runtime (given-values coerced num/bool/str), schema `intent-test-v1`. `intent test <file>` (exit 1 on any fail, CI-ready). Makes a .intent file self-verifying: the spec proves itself, no AI, no code. Exported + typed. 165 tests. docs/intent-tests.md.
- [x] REMAINING PROFILES (system + delivery) SHIPPED: system profile , `capability <Name>` (description/implements) -> Capability node + Mission-requires + implemented_by edges resolved to command/decision; `interface <Name>` (provides/requires/slo) -> SystemContract node. Delivery profile , `release <Name>` (version/status/date/includes) -> Release + Mission-released_in; `result <Name>` (measures/metric/value/baseline) -> OutcomeResult + Outcome-resulted_in (resolved); `learning <Name>` (description/from) -> LearningArtifact + derived_from release. All edges canonical (anti-fork), no dangling (fallback to mission). Closes the intent arc: outcome -> release -> result -> learning. 174 tests. docs/intent-graph.md updated (all 5 profiles shipped).
- [x] DESIGN-SYSTEM MAPPINGS SHIPPED: design profile , `component <Name>` (description/variant/token/implements) -> DesignComponent node + Mission-requires; each `implements` resolves to the experience-state OR pattern it realizes via <target> -implemented_by-> component. `artifact <Name>` (kind/ref/covers) -> DesignArtifact node (ref kept as node.source) + Mission-represented_by; each `covers` -> DesignComponent -represented_by-> artifact. Completes the chain: journey state -> component -> Figma mockup, all in one graph. Anti-fork + no-dangling guarded. 180 tests. docs/intent-graph.md "Design system" section.
- [x] OUTCOME CONTRACTS SHIPPED (last language item): `outcome_contract <Name>` (outcome/metric/baseline/target/direction/window/owner) -> OutcomeContract node (added to NODE_TYPES) + Mission-requires + targets Outcome + measured_by Metric (resolved). EXECUTABLE: outcome.mjs evaluateOutcomeContract(contract, actual) (direction-aware higher/lower, improvement vs baseline) + evaluateOutcomes(ast) auto-matches delivery `result` -> met/missed/pending. `intent outcomes <file>` (exit 1 on missed, CI-ready). Authoring checks IL-OC-001..004 (no target/metric/window, target-not-better-than-baseline) via semanticDiagnostics (gate-safe). schema `intent-outcome-v1`. Exported + typed. 191 tests. docs/outcome-contracts.md. Closes the intent arc: outcome -> release -> result -> CONTRACT VERDICT.
- [x] HARDENING FUZZ SUITE SHIPPED: deterministic (seeded/reproducible) fuzz + property tests over parser, expression engine, XML reader, runtime, graph builder (~13k generated cases + mutation fuzz over the example corpus + pathological single-shots). Invariants: parseIntent never throws/well-formed AST; buildIntentGraph never throws/canonical-types-only/NO DANGLING EDGES; expr engine returns-or-ExprError only; parseXml never throws; runtime never throws; parse+build deterministic. FOUND+FIXED 4 latent dangling-edge bugs (metric measured_by id fallback mismatch; conflict between/resolveBy edges to nonexistent nodes; guarantee verify now emits a canonical VerificationRule node [fills a gap]; experience follows -> undeclared pattern guarded). 200 tests. NOTE: VerificationRule nodes now emit from source (guarantee verify) , additive graph vocabulary for OT/RM.
- [x] DATA-SHAPE EXPORT (JSON Schema + OpenAPI) SHIPPED: data-schema.mjs typeToJsonSchema (semantic types -> JSON Schema: Email/DateTime/Url formats, Money/Percentage number, Secret writeOnly, List<X> recursive arrays, ids -> string, custom PascalCase -> opaque object) + toJSONSchema(ast,{which:input|output|both}) draft-2020-12 with required (optional modifier drops) + toOpenAPI(ast) 3.1 operation (input->requestBody, output->200, errors->named responses w/ inferred status 400/403/404/409/422, path/method from api block or POST/<mission>). Wired into export adapters (`intent export --format jsonschema|openapi`). Exported + typed. 225 tests. docs/export-adapters.md.
- [ ] Remaining interop adapters (Figma refs , largely covered by artifact.ref).
- [x] PLAYWRIGHT EXPORT SHIPPED: `intent export --format playwright` / `toPlaywright(ast)` , experiences -> Playwright E2E test scaffold (test.describe per experience, test+test.step per journey/step, reachability test per state, recovery-path test for failure states, a11y target as a proposed comment). SKELETON (TODOs for selectors/assertions), the test-plan target for the experience profile. 9th export format; JS-string-escaped, deterministic, fuzz-covered. 331 tests. docs/export-adapters.md.
- [x] SARIF CODE SCANNING SHIPPED: `intent check <path> --format sarif` / toSarif(reports) emits a SARIF 2.1.0 log so IntentLang diagnostics land natively in GitHub/GitLab code scanning (inline PR annotations + Security tab) and SARIF-aware IDEs. Rule metadata from ALL_DIAGNOSTICS + helpUri to /docs/diagnostics; level map (blocker/error->error, warning->warning, info->note); precise line regions where known (threaded line through security/style diagnostics). Report mode (exit 0); plain `intent check .` stays the gate. sarif.mjs (pure), exported + typed. 338 tests. docs/compiler-contract.md (GitHub workflow example).
- [x] MERMAID EXPORT SHIPPED: `intent export --format mermaid` / `toMermaid(ast)` renders the WHOLE Intent Graph as a Mermaid `graph TD` (node shape by category: rounded states/lifecycles, hexagon guarantees/never/constraints, rhombus decisions/rules, rect rest; typed edges labeled; mermaid-safe ids; labels sanitized of quotes/brackets/pipes). Paste-anywhere (GitHub/Markdown/Notion). 7th export format. 305 tests. docs/export-adapters.md.
- [x] DIAGNOSTICS CATALOG SHIPPED: `intent rules [--json]` lists the whole canonical DIAGNOSTIC_RULES catalog (46 rules, grouped by area / JSON for editors+CI+OT). docs/diagnostics.md GENERATED from the catalog via scripts/diagnostics-doc.mjs (--write/--check) + `npm run diagnostics:emit|check`, CI-guarded (workflow step) so the reference can never drift. Registered in docs.ts. 307 tests. Single authoritative answer to "what does IntentLang check?".
- [x] MERMAID EXPORT SHIPPED: `intent export --format mermaid` / `toMermaid(ast)` renders the WHOLE Intent Graph as a Mermaid `graph TD` (shape by category; typed edges; mermaid-safe ids; labels sanitized of quotes/brackets/pipes). Paste-anywhere. 7th export format. docs/export-adapters.md. Hardened in the fuzz suite (712/1500 cases exercise style_intent; mermaid label-safety asserted over 1500 graphs).
- [x] PROOF ENVELOPE SHIPPED (answers STW's "shared envelope -> IL canonical" deferral): `.intent-proof.json` formalized as versioned contract `intent-proof-v1`. proof-schema.mjs (pure, browser-safe /core): intentProofJsonSchema() draft-07 + validateProof(proof)->{valid,errors} (deterministic, zero-dep structural check) + PROOF_SCHEMA/CLAIM_STATUSES(planned|needs_verification|verified|failed)/PROOF_STATUSES(draft|approved|rejected). CLI `intent proof --schema`; `intent verify` gains a well-formedness gate before hash/claims. ADDITIVE (buildProof bytes unchanged). Exported + typed. 315 tests. docs/compiler-contract.md. IL owns the envelope; STW owns signing on top. Announced to STW/RM/OT.
- [x] DESIGN TOKENS EXPORT SHIPPED: `intent export --format tokens` / `toDesignTokens(ast)` (in style.mjs, browser-safe /core) renders style_intent tokens as W3C Design Tokens (DTCG) , dotted addresses -> nested groups, $type inferred per canonical address (color/number/fontFamily/dimension/asset), numeric coercion; off-namespace tokens still export flagged non-canonical; accessibility target in $extensions as proposed/verified:false. 6th export format. schema intent-design-tokens-v1. 302 tests. docs/export-adapters.md. Announced to STW/ST. Closes the style loop (declare -> export -> Style Dictionary/Figma/CSS).
- [x] CSS EXPORT SHIPPED: `intent export --format css` / `toCss(ast)` (style.mjs, browser-safe /core) renders style_intent tokens as a ready-to-use `:root` custom-property sheet , canonical address -> `--kebab-case` var, camelCase segments kebab-cased, `mode` -> `color-scheme`, `brand.logo` -> `url(...)`, accessibility target as a comment (proposed). 8th export format. Direct no-external-tool last mile of the style pipeline. 326 tests. docs/export-adapters.md + style-intent.md.
- [x] STYLE INTENT SHIPPED (ST canonical-spec request, closes IL fork-flag): `style_intent <Name>` , Experience-profile extension (applies_to/purpose/audience/surface/token/accessibility_target/scope) -> StyleIntent node (40th type, classified `proposed`) + Experience-constrained_by (or Mission-requires fallback). style.mjs: CANONICAL lockable token address space (color.*/typography.*/shape.*/density/mode + brand.logo) , off-namespace token = IL-STYLE-001 (anti-fork lock so themes stay portable across Studio/storefront/docs). accessibility_target (WCAG_2_1_AA|WCAG_2_2_AA|WCAG_2_2_AAA) ALWAYS classified `proposed`/verified:false , IL never asserts conformance (OT's verdict); IL-STYLE-003 nudges declaring it. IL-STYLE-001..005 in DIAGNOSTIC_RULES (46), wired into semanticDiagnostics (gate-safe warning/info). analyzeStyle/styleDiagnostics, `intent style` CLI, graph->source round-trip, browser-safe /core export, typed. 298 tests. docs/style-intent.md + examples/StorefrontStyle.intent. Announced to ST/STW/STCE/OT via vault. schema `intent-style-v1`.
- [x] GRAPH -> SOURCE ROUND-TRIP SHIPPED: graph-source.mjs graphToSource(graph) regenerates editable .intent from an Intent Graph (inverse of buildIntentGraph), schema `intent-graph-source-v1`. CONTRACT: semantic round-trip , node types+titles + typed relationships preserved through graph->source->graph (8/8 titled-mission examples perfect, no node/edge loss); decisions round-trip by EXECUTION, lifecycles by simulation. Best-effort (documented): Conflict (regenerates from role constraints), Journey/Pattern bodies, untitled-mission graphs. `intent source <file.intent|graph.json> [--out]` (normalizing round-trip / graph-JSON). Exported + typed. 208 tests. docs/graph-to-source.md. Completes round-trip both directions (external DMN/BPMN + native graph). Caught+fixed a direction bug (capability implemented_by is OUT not IN).
- [x] SCHEMA MIGRATIONS SHIPPED: migrate.mjs migration framework , ordered SCHEMA_CHAIN + MIGRATIONS registry (one step per adjacent version pair); migrateGraph(graph,{to}) walks the chain (pure, no-mutation, deterministic, rejects downgrade/unknown-target); validateGraph(graph) checks canonical types + non-dangling (MIG-001..005, phase.* allowed). Baseline v0->v1 migration normalizes pre-versioned graphs (stamp schema + backfill 12 node fields). Declarative builders (renameNodeType/renameRelationshipType/backfillNodeField/dropNodeField) so v1->v2 is a one-liner. `intent migrate <graph.json> [--to] [--out]`. schema `intent-migration-v1`. Exported + typed. 218 tests. docs/schema-migrations.md. THE SAFETY NET so intent-graph-v1 can evolve without stranding consumers' persisted graphs.

Other products (build to intent-graph-v1 in their own repos , NOT built here):
- [ ] OT: Requirement Coverage + Experience Completeness + Accessibility + Product Intent Drift
      + Analytics lenses; Product Diff; role-specific findings; verification proof. Reuse OT lenses.
- [ ] RM: Product/Requirements/Journey/Experience/Implementation/Verification/Outcome mastery
      tracks + role onboarding packs; classification-preserving (no assumptions-as-fact).
- [ ] ST: role modes, Intent Canvas, Mission/Experience/Journey builders, Review Mode, approvals,
      the intentlanguage.dev Playground.
