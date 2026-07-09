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
- [ ] Add `docs/language-principles.md`
- [ ] Add `docs/intent-oriented-programming.md`
- [ ] Add `docs/ai-age-best-practices.md`
- [ ] Add `examples/DuplicateInvoicePrevention.intent`

### P1 - Tutorial expansion
- [ ] Grow `docs/tutorial.md` into a full walk-through (first mission → proof)
- [ ] Worked example: build a secure password reset mission end to end

### P2 - Language specification
- [ ] Add `docs/spec.md`: lexical rules, comments, indentation, identifiers,
      strings, lists, block structure, every construct block, semantic types,
      security modifiers, error model, versioning

### P3 - Compiler contract (spec, not implementation)
- [ ] Expand `docs/compiler-contract.md`: source → AST → diagnostics →
      contract graph → architecture graph → generators → proof artifact
- [ ] Nail down the `--no-ai` deterministic guarantee

### P4 - Examples library (multi-domain)
- [ ] auth, billing, notifications, ecommerce, AI agent workflow, RAG pipeline,
      API gateway, event-driven service, data pipeline, infrastructure policy

### P5 - Website content (this repo)
- [ ] Shift site prose from "Intent" to the **IntentLang** brand
- [ ] Add **Prompt** to the philosophy on the homepage (7 stages)
- [ ] New homepage line: "The intent language for AI-era software."
- [ ] Sections: Prompt is temporary / Intent is durable; From intent to proof;
      Built for humans and AI agents; Verification before trust; Targets
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
- [ ] OpenThunder: verify whether the repo still matches declared intent (drift)
- [ ] Repo Mastery: turn `.intent` files into learning paths and quizzes
- [ ] SkillsTech Talk: turn missions into explanation/defense drills
- [ ] SkillsTech Certified: Intent-Oriented Programming tracks
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
