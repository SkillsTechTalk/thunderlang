# IntentLang + SkillsTech Compiler Operating Checklist

> The biggest truth: **IntentLang only wins if developers stop seeing it as
> "prompt engineering" and start seeing it as the durable contract layer for
> AI-era software.**
>
> The first wedge stays: **write a `.intent` file, run `intent build`, and get
> docs, diagrams, test plans, semantic warnings, and proof without AI.**

The winning strategy is not "IntentLang generates apps from prompts." It is:
**IntentLang becomes the standard way AI-era engineers define, verify, explain,
and prove what software is supposed to do.**

## The top 20 that matter most

1. Do not be "just prompts."
2. Compiler must work without AI.
3. First demo must be docs, diagrams, tests, proof.
4. `.intent` files must be readable.
5. Diagnostics must be excellent.
6. Verification must be central.
7. Proof must be first-class.
8. Intent Drift must be a flagship concept.
9. OpenThunder must verify implementation against intent.
10. Repo Mastery must teach the mission.
11. SkillsTech Talk must help defend the mission.
12. SkillsTech Certified must certify intent-oriented thinking.
13. Workspace must store and sign proof.
14. IDE support must be excellent.
15. CLI must feel professional.
16. Examples must be real-world.
17. Adoption must be incremental.
18. Existing languages must be targets, not enemies.
19. AI must be optional and traceable.
20. Repeat the category until it sticks: **Intent-Oriented Programming**.

## The 100

### Positioning and category creation (1-10)
1. Own the category: Intent-Oriented Programming.
2. Avoid the prompt-wrapper trap.
3. Keep the philosophy simple: Prompt to Intent to Contract to Plan to Implementation to Verification to Proof.
4. Make the first demo obvious (CreateInvoice.intent to `intent build` to artifacts).
5. Start above existing languages, not against them.
6. Promise trust, not magic.
7. Strong one-liner: "IntentLang is the intent language for AI-era software."
8. Developer-friendly identity: `IntentLang`, `.intent`, `intent check/build/proof`.
9. Create a cultural identity around ownership and verification.
10. Make it usable before it is ambitious (useful without code generation).

### Language design (11-25)
11. Small core syntax: mission, goal, why, input, output, guarantees, never, target, verify.
12. Files readable by humans (and AI agents).
13. Semantic types (Email, Money, Secret, Token, IdempotencyKey, TraceId).
14. Security first-class (Secret, PII, NeverLog, NeverReturn, Encrypted, AuditRequired).
15. Make `never` rules central.
16. Support `why` / `because` to capture judgment.
17. Readable human intent first.
18. Typed intent later.
19. Executable intent later.
20. Architecture as code (services, APIs, events, databases, owners, boundaries).
21. Behavior-first tests (given/when/then).
22. Target styles (DotNet + CleanArchitecture, TypeScript + Fastify, Java + SpringBoot).
23. Avoid too much syntax too soon.
24. Forgiving syntax with great diagnostics over strict cleverness.
25. Version the language and proof artifacts.

### Deterministic compiler foundation (26-40)
26. Compiler runs without AI (`--no-ai` non-negotiable).
27. A real parser with source locations and diagnostics.
28. A typed AST for every construct.
29. Excellent diagnostics that teach.
30. Stable, deterministic output.
31. Generate Markdown docs first.
32. Generate Mermaid diagrams first.
33. Generate test plans first.
34. Generate proof JSON first.
35. Generate contract-graph.json.
36. Generate architecture-graph.json.
37. Generate OpenAPI drafts when an `api` block exists.
38. Modular generators (adapters).
39. Do not hardcode one target language.
40. Ship a useful CLI: check, docs, graph, testplan, proof, build.

### Verification and proof (41-55)
41. Verification is the heart of the language.
42. Track verified / planned / missing / stale guarantees.
43. Treat never rules as verification requirements.
44. Proof artifacts by default (even draft).
45. Include source hashes in proof.
46. Include compiler version in proof.
47. Include output hashes in proof.
48. Include AI metadata only when AI is used.
49. Support human approval state.
50. Clear proof status: draft, verified, partial, stale, failed, approved.
51. Proof is safe-derived (no private source leak).
52. Proof useful to Workspace (store and sign).
53. Proof useful to OpenThunder (drift).
54. Proof useful to Repo Mastery (teach ownership).
55. Proof shareable without leaking code.

### AI-age best practices (56-70)
56. Never go prompt directly to production code.
57. Prompt-to-Intent is an assist feature, not the language.
58. AI optional at every stage.
59. Track prompt hashes.
60. Track input and output hashes.
61. Require explicit approval for AI-generated artifacts.
62. Model-provider flexibility (OpenAI, Anthropic, Gemini, local, future).
63. Separate Compiler (deterministic) from Runtime (AI routing).
64. Support privacy modes.
65. Detect hallucinated dependencies (later).
66. Require structured output for AI-assisted steps.
67. Eval AI output before accepting it.
68. AI for suggestions, not truth.
69. Make AI usage visible in proof.
70. Human ownership is the philosophy.

### Ecosystem integration (71-85)
71. OpenThunder detects Intent Drift.
72. Intent Drift is a flagship concept.
73. OpenThunder verifies guarantees against repo evidence.
74. OpenThunder extends Can-I-Ship with Intent.
75. Repo Mastery teaches missions.
76. Repo Mastery generates flashcards from intent.
77. Repo Mastery creates Intent Reality Checks.
78. SkillsTech Talk creates Intent defense drills.
79. SkillsTech Certified creates an Intent-Oriented Programming track.
80. SkillsTech IDE provides first-class `.intent` editing.
81. Workspace stores signed proof.
82. SkillsTech Social shares safe milestones.
83. Runtime supports Prompt-to-Intent via task contracts.
84. Shared contracts are versioned (intent-proof-v1, intent-drift-report-v1, ...).
85. Every sibling knows its boundary.

### Distribution, community, flywheel (86-100)
86. A beautiful, serious website at intentlanguage.dev.
87. A strong manifesto.
88. A 20-minute tutorial that ends with docs, graph, test plan, and proof.
89. A playground that shows generated artifacts instantly.
90. A VS Code extension (highlight, diagnostics, run, preview).
91. Ten excellent examples (reset password, create invoice, RAG pipeline, webhook handler, event-driven billing, auth API, file upload, AI agent task, data pipeline, deployment policy).
92. Comparison pages (vs prompts, BDD, OpenAPI, Mermaid, ADRs, UML, Terraform, TypeScript, Python).
93. A GitHub template repo: intentlang-starter.
94. An install path: `npm install -g intentlang` or equivalent.
95. CI usage: `intent check` in GitHub Actions.
96. Intent Drift demos (OpenThunder catching drift after code changes).
97. Weekly content (ownership, verification, prompt-to-intent, drift).
98. Build in public.
99. Recruit early champions (architects, senior engineers, AI engineers, dev-tool builders).
100. Stay alive long enough to become trusted.
