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
- [ ] Add `docs/language-principles.md`
- [ ] Add `docs/intent-oriented-programming.md`
- [ ] Add `examples/DuplicateInvoicePrevention.intent`

### P1 - Tutorial expansion
- [ ] Grow `docs/tutorial.md` into a full walk-through (first mission → proof)
- [ ] Worked example: build a secure password reset mission end to end

### P2 - Language specification
- [ ] Add `docs/spec.md`: lexical rules, comments, indentation, identifiers,
      strings, lists, block structure, every construct block, semantic types,
      security modifiers, error model, versioning

### P3 - Compiler contract (spec, not implementation)
- [x] `docs/compiler-contract.md`: pipeline, proof artifact, `--no-ai`, MVP scope
- [ ] Document the full semantic-diagnostics catalog (missing goal, secret field
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
- [ ] Richer editor UX (Monaco/CodeMirror): inline popup, lightbulb, fix preview, Fix-all-safe
- [ ] Do NOT hardcode completions in the playground; do NOT duplicate the parser

## Operating checklist status (see docs/operating-checklist.md)

The full Top-100 lives in `docs/operating-checklist.md`. Mapping to current state:

**Shipped / in good shape**
- Category, one-liner, philosophy, "not just prompts" positioning (site + manifesto)
- First-demo wedge: `intent build` emits docs, Mermaid, test plan, contract/architecture graphs, `.intent-proof.json` (no AI)
- Small readable syntax, semantic types, security modifiers, `never`, `why/because`, three layers, architecture/api/event/test (docs + examples)
- Deterministic `--no-ai` compiler: real parser, AST, stable output, teaching diagnostic (idempotency), proof schema v0.1.0
- Website, manifesto, tutorial, spec, compiler-contract, ai-age-best-practices, ecosystem-brief; 4 examples browsable

**Near-term (small, high-leverage)**
- [ ] More semantic diagnostics: unknown-semantic-type, event-payload-contains-Secret, api-sensitive-output-without-auth (#29,#43)
- [ ] OpenAPI generation when an `api` block exists (#37)
- [ ] `bin` wiring: `npm install -g` / `npx intent` so the CLI is real (#40,#94)
- [ ] `intent check` in a GitHub Actions workflow (#95)
- [x] Wire the web playground to the real compiler (/api/compile, deterministic, no AI) (#89)
- [ ] Six more examples toward the target ten: RAG pipeline, webhook handler, event-driven billing, auth API, file upload, AI agent task, data pipeline, deployment policy (#91)
- [ ] `intentlang-starter` template repo (#93)
- [ ] Proof status vocabulary: draft/verified/partial/stale/failed/approved (#50)

**Later**
- [ ] VS Code extension (highlight, diagnostics, run, preview) (#90)
- [ ] Comparison pages: vs prompts, BDD, OpenAPI, Mermaid, ADRs, UML, Terraform, TS, Python (#92)
- [ ] OpenThunder Intent Drift detection + demo (#71,#96)
- [ ] Runtime split for AI routing; Prompt-to-Intent as a traced, approved assist (#57,#63)
- [ ] Ecosystem proof consumers: Repo Mastery teaching, STT defense drills, STCE track, Workspace signing (#75-#82)
