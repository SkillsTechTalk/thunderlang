# Intent-oriented programming

Intent-oriented programming (IOP) is a way of building software where the durable
artifact is the declared intent, what the software must do, why it matters, what
must never happen, and how the result is proven, and implementation is a target
generated, verified, or checked against that intent. It is the practice ThunderLang
is built for.

## A new altitude, not a new syntax

Programming paradigms describe how code is organized:

- **Object-oriented** organizes around objects and messages.
- **Functional** organizes around pure functions and data.
- **Service-oriented** and **event-driven** organize around boundaries and events.

Intent-oriented programming sits one level above all of them. It organizes around
*meaning*: the mission, its guarantees, its prohibitions, and its proof. It does
not compete with OOP or FP; a single intent can be realized as object-oriented C#,
a functional core, or an event-driven service, chosen by adapter. IOP asks a
different question than "how is the code structured?" It asks "what did we commit
to, and can we prove the code still honors it?"

## Why now

For most of software history, intent lived in people's heads, in tickets, and in
comments that rot. That was tolerable when humans wrote every line slowly enough to
hold the purpose in mind. AI broke that assumption. Code is now generated and
changed faster than anyone can re-read it, so the bottleneck moved from *writing
code* to *trusting it*. Intent-oriented programming responds by making the thing
that used to be implicit, the purpose, the single most explicit and durable
artifact in the project.

> Prompt is temporary. Intent is durable. Code is how the system fulfills it.
> Proof is how trust is earned.

## The loop

Intent-oriented programming runs a loop, not a one-way pipeline:

    Prompt → Intent → Contract → Plan → Implementation → Verification → Proof
                ↑                                                          │
                └──────────────── drift detected ──────────────────────────┘

1. **Declare.** Turn a prompt or requirement into a `.thunder` mission, reviewed
   and version-controlled like any other source.
2. **Contract.** The compiler turns intent into a contract graph, an architecture
   graph, and an implementation plan, deterministically.
3. **Implement.** A human, or an AI writing a candidate a human approves, produces
   the target code. The intent says what is allowed; the code fills it in.
4. **Verify.** Guarantees and never-rules are checked against the change; a proof
   artifact records what held and what broke.
5. **Watch for drift.** When the implementation stops matching the intent, that is
   a signal to review, either fix the code or, deliberately, update the intent.

The loop closes. Intent is not written once and abandoned; it is the living
contract the code is continuously measured against.

## What an intent-oriented engineer does differently

- **Writes the prohibitions first.** Before the happy path, they name what must
  never happen: no double charge, no leaked secret, no unapproved action.
- **Pairs every guarantee with a proof.** A claim without a `verify` is treated as
  unfinished, because that is where drift hides.
- **Reviews intent, not just diffs.** The pull request that matters most is the one
  that changes what the software promises, not the one that changes a variable
  name.
- **Treats AI output as a candidate.** Generated code is proposed against an intent
  and gated by verification; it is never trusted because it looks plausible.
- **Keeps meaning and mechanism separate.** The intent holds the meaning; the
  adapter holds the idioms; notes explain, but never verify.

## What it is not

- **Not prompt-driven development.** A prompt starts the conversation; the intent
  is what the team commits to, reviewable and testable long after the prompt is
  forgotten.
- **Not "write a spec and hope."** The specification is executable and checkable:
  decisions run, tests assert, guarantees are verified, drift is detected.
- **Not a replacement for programming.** Someone still writes and owns the
  implementation. IOP changes what is authoritative, not who is responsible.
- **Not AI-magic.** The deterministic core works with no model at all. AI is an
  optional, traceable, human-approved assist.

## The payoff: compounding proof

Because intent is explicit and durable, each mission accumulates evidence rather
than losing it. The [contract](/docs/manifesto) proves the artifact can exist; a
drift check proves the code still matches; the [proof matrix](/docs/proof-matrix)
shows verification across a whole project; the [ledger](/docs/intent-scanner)
remembers why each decision was made and who approved it. Trust in AI-era software
is not earned by trusting the code. It is earned by proving the intent behind it,
over and over, as the code keeps changing.

---

See also: [Language principles](/docs/language-principles) for the design rules,
the [Manifesto](/docs/manifesto) for the vision, and
[AI-age best practices](/docs/ai-age-best-practices) for how to work this way day
to day.
