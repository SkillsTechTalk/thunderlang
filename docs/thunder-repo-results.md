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

## One public repository per supported language (2026-11-22)

Thunder reads a function in one of two ways. A **decision** (a function that chooses between fixed answers)
becomes a Thunder rule card you can ask questions. **Every other function** is read as Thunder **steps**: a short
plain list of what it does (checks, branches, loops, values it works out, services it calls, what it returns or
fails with), with one level of nesting. A statement Thunder does not recognize stays as its original code.

| Language | Repository | Files | Rule cards (of decisions found) | Functions read as steps, at least 80% readable | Reader errors |
| --- | --- | --- | --- | --- | --- |
| Kotlin + Java | [JakeWharton/timber](https://github.com/JakeWharton/timber) | 12 | 0 of 3 | 193 of 243 (79%) | 0 |
| JavaScript | [expressjs/express](https://github.com/expressjs/express) | 142 | 3 of 3 | 416 of 447 (93%) | 0 |
| Java | [google/gson](https://github.com/google/gson) | 268 | 4 of 17 | 3382 of 3677 (92%) | 0 |
| PHP | [guzzle/guzzle](https://github.com/guzzle/guzzle) | 147 | 10 of 17 | 2535 of 2616 (97%) | 0 |
| C# | [jbogard/MediatR](https://github.com/jbogard/MediatR) | 161 | 3 of 4 | 770 of 862 (89%) | 0 |
| Python | [psf/requests](https://github.com/psf/requests) | 37 | 3 of 3 | 582 of 632 (92%) | 0 |
| Rust | [rust-lang/log](https://github.com/rust-lang/log) | 13 | 0 of 1 | 351 of 449 (78%) | 0 |
| Ruby | [sinatra/sinatra](https://github.com/sinatra/sinatra) | 147 | 19 of 25 | 674 of 895 (75%) | 0 |
| TypeScript | [sindresorhus/ky](https://github.com/sindresorhus/ky) | 98 | 0 of 1 | 1012 of 1370 (74%) | 0 |
| Go | [spf13/cobra](https://github.com/spf13/cobra) | 36 | 2 of 2 | 511 of 587 (87%) | 0 |
| **Total** | | **1061** | **44 of 76** | **10426 of 11778 (89%)** | **0** |

Reading all ten repositories takes about 7 seconds. Example, from this repository's sample shop:

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
- **Weakest today:** TypeScript (74%), Ruby (75%), Rust (78%), Kotlin (79%): chained expressions, closures,
  and DSL-style calls are often kept as original code.

## Next compiler steps (in order of expected coverage gain)

1. Chained and closure-heavy expressions in TypeScript, Kotlin, and Rust (`a.map(x => ...).filter(...)`), read
   as "for each … keeps …" steps.
2. Comparisons between two values (`length > limit`) and method calls with arguments (`list.contains(x)`) inside
   decisions, so more decisions become rule cards.
3. Early-return chains mixed with assignments, read as rule cards with "works out" steps.
4. Calculations returned as values, which needs the Thunder Text calculation layer.

Each step is measured by re-running this table.
