# ThunderLang for human comprehension

Status: researched direction and an executable, opt-in authoring preview. Existing
ThunderLang syntax remains unchanged. No comprehension advantage has been measured
with people, and no competition outcome is claimed.

## The promise

Learn one way to read software: understand its purpose, decisions, effects, and
evidence even when its implementation uses a language you do not usually write.

This is a common representation of supported behavior, not a claim that every
program can be translated without loss or that code reveals why its owner wanted
it. Unsupported semantics must stay attached to their original code and be
explicitly marked as not understood.

## What the first implementation does

`thunder human` reads a compact contract or an ordinary ThunderLang file and shows
a deterministic decision view. Compact files use `.thunder-human` so existing
contract discovery cannot mistake experimental notation for canonical source.

```sh
node compiler/src/cli.mjs human examples/human/RefundReview.thunder-human
node compiler/src/cli.mjs human examples/human/RefundReview.thunder-human --format source > /tmp/RefundReview.thunder
node compiler/src/cli.mjs test /tmp/RefundReview.thunder
```

The compact entry point has four sections: contract, purpose, decision, examples.
It lowers to the existing grammar, AST, runtime, and code generators. It refuses
unknown syntax, misspelled inputs, absent expectations, duplicate case names,
missing defaults, and unsupported values instead of guessing their meaning.
Rules use first-match ordering, which the reading view states explicitly.

For the full application flow, use the OpenThunder branch containing `intent
test-app`, whose adapter calls existing application code rather than generated
decision code:

```sh
node scripts/smoke-human-refund.mjs /path/to/OpenThunder
```

That smoke test compiles the compact refund contract, runs all five cases against
the independent refund service, changes only the service's `<= 100` to `< 100`,
observes the failing $100 case, and restores the passing implementation.

The reader also accepts existing lifted drafts. It preserves their inferred
status and source references, and says when behavior rules were not recovered.
This does not turn name/signature inference into verified application behavior.

## Research that shaped the direction

- [Cucumber's guidance](https://cucumber.io/docs/bdd/better-gherkin/) separates
  domain behavior from procedural UI steps. Apply that to policies and examples;
  keep adapters and implementation mechanics outside the beginner's reading path.
- [Inform](https://ganelson.github.io/inform-website/) shows a natural-language
  surface grounded in a specific domain. Its existence does not demonstrate that
  unrestricted English is an unambiguous, general-purpose specification language.
- [Hedy's evaluation](https://www.hedy.org/research/Design_Implementation_and_evaluation_of_the_Hedy_programming_language_2022.pdf)
  studies gradual syntax with children. Borrow progressive disclosure and better
  errors; do not treat those results as evidence about professional team comprehension.
- [Carnegie Mellon's Natural Programming project](https://www.cs.cmu.edu/~NatProg/)
  treats language and tool usability as empirical design questions. Measure how
  people reason about behavior before expanding the vocabulary.
- [Dafny](https://dafny.org/latest/OnlineTutorial/guide) demonstrates the distinction
  between executable examples and verification against formal specifications.
  A solver's result still depends on its model and the correctness of the stated
  specification. ThunderLang must name what each form of evidence establishes.

## A small semantic core, with depth when needed

1. **Data:** meaning, units, identity, optional values, ownership, and sensitivity.
2. **Decisions:** inputs, conditions, results, priorities, and explicit defaults.
3. **Flows:** state changes, calls, side effects, failures, time, and concurrency.
4. **Evidence:** examples, properties, application runs, observations, and bounded
   proofs, each with source and freshness.

Build on existing decisions, lifecycles, effects, property tests, shrinking,
source lifting, and the canonical graph. Do not add a second engine for the new
notation. Advanced features remain available in the existing language while the
introductory surface stays small.

The next semantic work should resolve ambiguities with real consequences: USD
versus cents, inclusive versus exclusive boundaries, missing versus false values,
time zones and deadlines, retries and duplicate effects, and concurrent updates.
The current compact preview does not add a money type or enforce currency units;
its purpose sentence is descriptive, not a unit checker.

## One model, three useful views

- **Product:** purpose, vocabulary, decisions, concrete examples, and unresolved
  questions. No implementation mechanics unless they change a business decision.
- **Engineering:** the same decisions with types, effects, dependencies, source
  locations, and explicit translation gaps.
- **Execution:** the same rules with inputs, rule-by-rule trace, expected versus
  actual behavior, and counterexamples.

Views are projections of one representation. They must not independently invent
facts. Existing authored notes can explain why; generated summaries must cite
the structure or source that supports them.

## Both directions need an honest boundary

Intent to code: generate the behavior the contract fully defines, preserve named
bindings to implementations, and mark unresolved work explicitly. A generated
TODO cannot count as implementation evidence.

Code to understanding: recover supported structure and behavior with source
locations. Separate observations from inferred intent and human-approved rules.
Show unsupported dynamic behavior, external dependencies, concurrency, and
reflection as gaps. Reading a source signature does not recover a business goal.

Round trips must test behavior, not textual similarity. Maintain a corpus of
equivalent and deliberately non-equivalent TypeScript, Python, Java, and C#
programs. When a translation loses information, preserve the source anchor and
state the loss. Expand languages only after that fidelity is demonstrated.

## What would make the language distinctive

The useful combination is readable contracts, source-linked understanding across
languages, and counterexamples from the actual application, with no forced rewrite.
Existing alternatives cover parts of this. The combination is a hypothesis to
validate, not a claim that nobody else is working on it.

Keep the compiler and representation usable independently of OpenThunder. Reuse
its existing CLI/MCP, export formats, and editor tooling. OpenThunder adds trusted
execution, repository context, and review evidence. Human understanding should
not require a proprietary account or an AI model to interpret basic rules.

For worldwide use, stabilize identifiers and semantics first; localize reading
views, diagnostics, and domain glossaries without changing execution. Test with
multilingual participants before adding translated authoring keywords. Do not
equate English-like syntax with universal accessibility.

## Comprehension benchmark before a language redesign

Pilot with engineers from different language backgrounds, product people, and QA.
Compare native source, current ThunderLang, the compact/reading view, and a
behavior-specification baseline. Counterbalance presentation order and use matched
tasks so learning one example does not give away the next answer.

Ask participants to predict behavior at a boundary, find a conflicting rule,
explain an effect, identify what remains unknown, and make a small change.
Measure accuracy, time to a correct answer, unaided completion, errors introduced,
and confidence when evidence is missing. Collect explanations, not just ratings.

Proposed pilot targets, not measured results: at least 80% correct boundary
predictions in each audience, fewer incorrect edits than the current notation,
and no increase in false confidence about untested behavior. Use pilot results
to size a larger study and report uncertainty. A shorter file alone is not a win.

## Usability review record

Goal: understand and check a refund rule without navigating compiler internals.
Action: one `human` command gives purpose, ordered rules, and example results;
`--format source` exposes the exact ordinary ThunderLang that will execute.
Recovery: errors identify a line and an expected form; unknown syntax is rejected.
Feedback: Passed/Failed and expected/actual values use words, not color alone;
Application remains Not checked until the separate OpenThunder execution.
Surface: CLI text, JSON, and generated source, with automated regression checks.
Unaided user observation: not performed. Comprehension and localization remain
research tasks owned by ThunderLang, not claims established by unit tests.

## Validation performed

- Compiler regression suite: 683 passed, 18 skipped, zero failures. The test command
  now enumerates test files explicitly instead of relying on directory discovery.
- Separate native-toolchain run: 27 passed, 10 skipped, zero failures. Go, Rust,
  and C# executed; unavailable Kotlin, Scala, Elixir, and Java toolchains remain
  unverified on this machine.
- New preview coverage includes 210 refund boundary inputs, exact lowering, CLI
  formats, malformed-input rejection, and preserved TypeScript/Python provenance.
- The installed compiler tarball passes the API, types, CLI, and human preview smoke.
- Cross-product smoke: compact notation to canonical ThunderLang to the independent
  refund application; boundary regression caught and repair verified.
- Website production build, lint, and type checks pass. Browser checks exercised
  five passing cases, the one-case boundary failure, invalid syntax, and Reset.
- Existing grammar is unchanged. The preview is experimental. Unaided participant
  testing has not been performed, and comprehension superiority is not established.
