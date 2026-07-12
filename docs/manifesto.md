# The IntentLang Manifesto

IntentLang is the intent language for AI-era software. It lets engineers define
what software should do, why it matters, what must never happen, and how the
result must be verified before code is generated, changed, or shipped.

## Prompt is temporary. Intent is durable.

A prompt is a conversation. Consider:

> Build a secure invoice creation flow that prevents duplicates, audits every
> invoice, and never logs payment tokens.

That is useful, but it is not durable. It is not a contract. It is not cleanly
version-controlled. It is not automatically verifiable.

The prompt should become a `.intent` file: reviewable, versionable, testable,
explainable, compilable, verifiable, and portable across target languages. That
is far more valuable than the prompt, because the intent is what the team
actually commits to.

## The path from purpose to proof

    Prompt → Intent → Contract → Plan → Implementation → Verification → Proof

- **Prompt** is how the conversation starts.
- **Intent** is what the team commits to.
- **Code** is how the system fulfills it.
- **Proof** is how trust is earned.

Expanded, the pipeline is:

    Human prompt / requirement / architecture discussion
      → IntentLang .intent file
      → Contract graph
      → Architecture graph
      → Implementation plan
      → Target artifacts
      → Verification
      → Proof

## Intent becomes many kinds of artifact

Implementation is the output, not the point. Target artifacts can include:

- TypeScript, Python, C# / .NET, Java, Go, Rust code
- OpenAPI specs
- Mermaid diagrams
- Markdown docs
- Test plans and unit test scaffolds
- Security rules
- OpenThunder contracts
- Repo Mastery learning paths
- SkillsTech Talk defense prompts
- Proof JSON

So object-oriented code is one possible target, not the whole story.

> IntentLang sits above programming paradigms. It can target object-oriented,
> functional, service-oriented, event-driven, API-first, or infrastructure code
> depending on the adapter.

Intent becomes target-specific implementation using the idioms of each ecosystem.

## What IntentLang is not

- Not just a prompt format.
- Not magic AI code generation.
- Not a replacement for TypeScript, Python, Java, .NET, Rust, or Go.
- Not 1.0 yet. The compiler is real, deterministic, and tested, but the language and its
  schema are pre-1.0 and can still change. Honest work, in the open.

The right framing:

> IntentLang turns software purpose into explicit contracts, architecture,
> verification, and proof, then uses compilers and optional AI to help produce
> target implementations people can trust.

## AI-era, not AI-magic

The deterministic compiler must work without AI. Every optional AI action
produces metadata: provider, model, prompt hash, input and output hashes,
verification result, and human approval status. Humans approve, verify, and own
the result.

## Intent Drift

Intent drift happens when the implementation no longer satisfies the declared
mission, guarantees, architecture, constraints, or verification rules. For
example: a guarantee exists but no test verifies it, a `never` rule is violated,
a service publishes an event not declared in intent, a public API changes but the
intent was not updated, or a field marked `Secret` is logged.

Detecting and closing drift, later via OpenThunder, is a core reason IntentLang
exists. Generating code is cheap; keeping code faithful to intent is the hard,
valuable part.

## The proof chain

Proof is the through-line of the SkillsTech ecosystem. Each product proves a
different thing about the same mission:

- **SkillsTech Compiler** proves the language can produce artifacts.
- **OpenThunder** proves the repo matches the declared intent.
- **Repo Mastery** proves the human understands the mission.
- **SkillsTech Certified** proves the learner understands the method.

Together they turn a mission into compounding evidence: the artifact exists, the
implementation still matches it, the engineer who owns it understands it, and the
practitioner has proven the method itself. That is how trust is earned in
AI-era software, not by trusting the code, but by proving the intent behind it.
