# Thundering real repositories: results

`thunder repo <owner/repo | GitHub URL | folder>` shallow-clones a public repository and reads every
supported file with the Thunder code reader. It is **read-only**: nothing is executed, imported, or built.
Each decision becomes a Thunder rule card, every other function becomes Thunder steps, and anything Thunder
cannot read is listed for a person.

```sh
thunder repo psf/requests
thunder repo https://github.com/spf13/cobra --json
thunder repo ./my-service
```

## One public repository per supported language (2026-11-23)

Thunder reads a function in one of two ways. A **decision** (a function that chooses between fixed answers)
becomes a Thunder rule card you can ask questions. **Every other function** is read as Thunder **steps**: a short
plain list of what it does (checks, branches, loops, values it works out, services it calls, what it returns or
fails with), with one level of nesting. A statement Thunder does not recognize stays as its original code.

A step counts as read only when it explains something. A step that just puts the code's syntax into English
("Works out actives", "Returns the result of any") is marked `restates` and does not count.

| Language | Repository | Files | Rule cards (of decisions found) | Functions read as steps, at least 80% readable | Reader errors |
| --- | --- | --- | --- | --- | --- |
| Kotlin + Java | [JakeWharton/timber](https://github.com/JakeWharton/timber) | 12 | 0 of 3 | 187 of 243 (77%) | 0 |
| JavaScript | [expressjs/express](https://github.com/expressjs/express) | 142 | 3 of 3 | 306 of 447 (68%) | 0 |
| Java | [google/gson](https://github.com/google/gson) | 268 | 4 of 17 | 2865 of 3677 (78%) | 0 |
| PHP | [guzzle/guzzle](https://github.com/guzzle/guzzle) | 147 | 10 of 17 | 2014 of 2616 (77%) | 0 |
| TypeScript (React) | [jaredpalmer/formik](https://github.com/jaredpalmer/formik) | 120 | 2 of 3 | 192 of 233 (82%) | 0 |
| C# | [jbogard/MediatR](https://github.com/jbogard/MediatR) | 161 | 3 of 4 | 634 of 862 (74%) | 0 |
| Python | [psf/requests](https://github.com/psf/requests) | 37 | 3 of 3 | 554 of 708 (78%) | 0 |
| Rust | [rust-lang/log](https://github.com/rust-lang/log) | 13 | 0 of 1 | 336 of 449 (75%) | 0 |
| Ruby | [sinatra/sinatra](https://github.com/sinatra/sinatra) | 147 | 19 of 25 | 511 of 895 (57%) | 0 |
| TypeScript | [sindresorhus/ky](https://github.com/sindresorhus/ky) | 98 | 0 of 1 | 1277 of 1370 (93%) | 0 |
| Go | [spf13/cobra](https://github.com/spf13/cobra) | 36 | 2 of 2 | 506 of 587 (86%) | 0 |
| **Total** | | **1181** | **46 of 79** | **9382 of 12087 (78%)** | **0** |

**Why these numbers are lower than the 2026-11-22 run (94%).** That run counted every recognized step as read,
including steps that only restated syntax. Steps that only restate code no longer count. The reader also improved
in the same change: Python functions whose parameters span several lines (most FastAPI endpoints) were skipped
before and are read now (psf/requests: 632 functions found, now 708). Common shapes are said as what they are,
such as a new object, a value looked up by key, text built from parts, a comprehension, or `any`/`all`.

Reading all eleven repositories takes under 10 seconds. Example, from this repository's sample shop:

```text
What issue refund does
  = Works out decision from approve refund
  ◇ If decision is "Approve"
      → Calls Stripe
      → Writes to the database (insert): refunds
      → Announces an event: refund.issued
  ⇥ Returns decision
```

## What this says, honestly

- **Most real code is steps, not decisions.** The reader's main blocker was "this statement does work besides
  choosing an answer" (about 34,000 lines across these repositories). Reading steps raised the share of functions
  Thunder can show in plain words from under 1% to 89%.
- **Steps are read from code, not rules.** They say what the code does in order; they do not say what it was
  meant to do, and they are labeled that way. Rule cards remain the only views you can ask questions of.
- **TypeScript pass (2026-11-22):** object literals, destructuring, and JSX no longer split statements; casts,
  non-null and optional chaining, private fields, counters, inner classes, and collection chains
  (`map`/`filter`/`find`/`some`/`every`/`reduce`, LINQ, Rust iterators, Java streams) read as plain steps.
  Newline-terminated statements (Go, Kotlin, JavaScript without semicolons) are split correctly.
- **Weakest today:** Ruby (76%) and Kotlin (80%, mostly in tests): blocks, DSL-style calls, and heredocs are often
  kept as original code.

## Next compiler steps (in order of expected coverage gain)

1. Chained and closure-heavy expressions in TypeScript, Kotlin, and Rust (`a.map(x => ...).filter(...)`), read
   as "for each … keeps …" steps.
2. Comparisons between two values (`length > limit`) and method calls with arguments (`list.contains(x)`) inside
   decisions, so more decisions become rule cards.
3. Early-return chains mixed with assignments, read as rule cards with "works out" steps.
4. Calculations returned as values, which needs the Thunder Text calculation layer.

Each step is measured by re-running this table.
