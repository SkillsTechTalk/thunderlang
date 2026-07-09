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
- [ ] Surface `docs/` and `examples/` on the site (render `.intent` + Markdown)

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
