# Certification track

> This page documents the *concept* of the certification and how it uses IntentLang.
> The certification product itself (enrollment, exams, credentials) is built by
> **SkillsTech Certified**, a sibling in the ecosystem, not in this repository.

Generating code is cheap; the scarce thing in AI-era software is a person who can state
intent clearly, verify it faithfully, and defend it. The **SkillsTech Certified
Intent-Oriented Programming Associate** credential proves exactly that: not that a learner
memorized syntax, but that they can practice [intent-oriented
programming](/docs/intent-oriented-programming) end to end.

## What it proves

The proof chain has four links, each proving a different thing about the same mission:

- **SkillsTech Compiler** proves the language can produce artifacts.
- **OpenThunder** proves the repo still matches the declared intent.
- **Repo Mastery** proves the human understands the mission.
- **SkillsTech Certified** proves the practitioner understands the *method*.

Certification is that fourth link. It certifies the method, the durable skill that
outlives any one codebase or model.

## What an Associate can do

A holder of the credential can, without AI doing the thinking for them:

- **Write a rigorous mission.** Turn a prompt or requirement into a `.intent` file with a
  clear goal, typed inputs and outputs, guarantees, and, first, the prohibitions
  (`never` rules) that matter most.
- **Prove it.** Attach a `verify` to every guarantee and never rule, and use
  `intent check`, `intent run`, and `intent test` to make the mission self-verifying.
- **Read the diagnostics.** Explain what `guarantee-without-verification`,
  `secret-without-never-log`, or `IL-SEC-001` mean and why they block, and fix them.
- **Reason about drift.** Explain how an implementation drifts from its intent and how the
  ecosystem detects it.
- **Govern AI.** Treat AI output as a candidate: gate it, verify it, and approve it on the
  record, never trust it because it looks plausible.
- **Defend the mission.** Explain, to a colleague or a reviewer, *why* the software is
  built this way, which is the skill [Repo Mastery](/docs/ecosystem-brief) drills.

## How IntentLang backs the assessment

Because intent is executable and checkable, the assessment can be objective rather than a
quiz about opinions:

- A candidate's mission is run through the real, deterministic compiler. `intent check`
  and `intent test` give a pass/fail that no grader has to argue about.
- The [diagnostics catalog](/docs/diagnostics) is a fixed, published rubric: every finding
  names its rule, severity, and fix.
- A candidate's `.intent-proof.json` is evidence the work was done and verified, the same
  proof artifact the rest of the ecosystem consumes.

So the credential is itself proof-backed: it is earned by producing intent that the
compiler can verify, not by self-report.

## Levels (planned)

The Associate credential is the foundation. Higher tiers, defined by SkillsTech Certified,
would layer on architecture intent, distributed and failure semantics, governance and data
privacy, and leading intent-oriented review on a team. Those are the certifying product's
to specify; this page fixes only the shared vocabulary and the IntentLang skills each tier
rests on.

---

See also: [Intent-oriented programming](/docs/intent-oriented-programming) for the method,
the [Manifesto](/docs/manifesto) for the proof chain, and the
[Ecosystem brief](/docs/ecosystem-brief) for how each sibling contributes.
