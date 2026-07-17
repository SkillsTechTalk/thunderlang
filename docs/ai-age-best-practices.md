# AI-Age Software Best Practices

> Guidance for building software with AI in the loop, the way ThunderLang is meant
> to be used. AI makes software easier to create but harder to trust. These
> practices keep humans in ownership of what ships.

## The shift

Before AI, the bottleneck was often writing code. With AI, the bottleneck moves
to trust: understanding what was built, knowing why, checking correctness,
proving what must never happen, reviewing what AI changed, and keeping the
implementation aligned with intent. ThunderLang exists because AI-era software
needs a stronger source of truth than prompts and scattered docs.

## Ten practices

1. **Never go straight from prompt to production code.** A prompt is a
   conversation, not a commitment.
2. **Turn prompts into reviewed intent.** Capture goals, guarantees, never
   rules, and verification in a `.thunder` file before generating code.
3. **Commit `.thunder` files to version control.** Intent is the durable artifact;
   treat it like source, because it is.
4. **Treat guarantees and never rules as contracts.** They are properties the
   software must always or never do, not suggestions.
5. **Verify every guarantee you can.** A mission is not done because code exists.
   It is done when the declared guarantees have evidence.
6. **Mark unverifiable guarantees explicitly.** If something cannot be proven
   yet, say so rather than implying it is verified.
7. **Trace every AI action.** Record provider, model, prompt hash, input and
   output hashes, verification result, and human approval status.
8. **Produce proof artifacts.** Generated or AI-guided work should emit a proof
   that says what was produced and what was verified.
9. **Detect intent drift.** Watch for implementation that no longer satisfies the
   declared mission, guarantees, architecture, or verification rules.
10. **Keep ownership human.** AI can assist, but humans approve, verify, and own
    the result.

## The deterministic core

ThunderLang is AI-friendly but not AI-dependent. The compiler must always support
`--no-ai`. The deterministic core (parse, semantic analysis, graphs, docs,
proof) is what makes the language serious. AI is optional assist on top, never a
hidden dependency.

## Intent drift, concretely

Drift is the failure mode AI accelerates. Examples:

- A guarantee exists but no test verifies it.
- A `never` rule is violated.
- A service publishes an event not declared in intent.
- An API changed but the `.thunder` file was not updated.
- A field marked `Secret` appears in logs.
- A proof says something is verified, but the test was deleted.
- The repo changed significantly since the last intent proof.

The compiler defines the intent. OpenThunder checks whether the repo still
matches it. Repo Mastery teaches the engineer what it means. SkillsTech Talk
trains them to defend it. Workspace stores and signs the proof. Certified tests
whether the learner understands the method.
