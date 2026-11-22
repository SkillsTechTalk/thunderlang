# Thundering real repositories: results

`thunder repo <owner/repo | GitHub URL | folder>` shallow-clones a public repository and reads every
supported file with the Thunder code reader. It is **read-only**: nothing is executed, imported, or built.
Each decision Thunder can draw becomes a Thunder card; everything else is listed for a person to read.

```sh
thunder repo psf/requests
thunder repo https://github.com/spf13/cobra --json
thunder repo ./my-service
```

## One public repository per supported language (2026-11-22)

| Language | Repository | Files | Decisions found | Drawn as cards | Other functions | Reader errors |
| --- | --- | --- | --- | --- | --- | --- |
| Kotlin + Java | [JakeWharton/timber](https://github.com/JakeWharton/timber) | 12 | 3 | 0 | 243 | 0 |
| JavaScript | [expressjs/express](https://github.com/expressjs/express) | 142 | 3 | 3 | 447 | 0 |
| Java | [google/gson](https://github.com/google/gson) | 268 | 17 | 4 | 3677 | 0 |
| PHP | [guzzle/guzzle](https://github.com/guzzle/guzzle) | 147 | 17 | 10 | 2616 | 0 |
| C# | [jbogard/MediatR](https://github.com/jbogard/MediatR) | 161 | 4 | 3 | 862 | 0 |
| Python | [psf/requests](https://github.com/psf/requests) | 37 | 3 | 3 | 632 | 0 |
| Rust | [rust-lang/log](https://github.com/rust-lang/log) | 13 | 1 | 0 | 449 | 0 |
| Ruby | [sinatra/sinatra](https://github.com/sinatra/sinatra) | 147 | 25 | 19 | 895 | 0 |
| TypeScript | [sindresorhus/ky](https://github.com/sindresorhus/ky) | 98 | 1 | 0 | 1370 | 0 |
| Go | [spf13/cobra](https://github.com/spf13/cobra) | 36 | 2 | 2 | 587 | 0 |


Every repository completed in under half a second of reading time, with no reader errors.

## What this says, honestly

- **Thunder Code works on real code in all ten languages** without crashing, and finds real rules: Go's
  `IsAvailableCommand` ("true when it is runnable or has available sub commands"), Python's
  `should_bypass_proxies`, Ruby predicates in Sinatra, PHP host checks in Guzzle.
- **Coverage is still low.** About 44 of 11,800 functions become cards today. Most real logic is not yet a
  shape the reader understands, so it is shown as "not read" rather than guessed.
- Improvement made in this pass: one-expression boolean functions (`return a && b`, Rust tail expressions,
  Ruby implicit returns) are now read as decisions in every language, and cards accept real outcomes
  (`true`/`false`, numbers, `UPPER_CASE`), text comparisons, and facts from the code's own state (flagged
  for review). Cards went from 1 to 44 across these repositories.

## Next compiler steps (in order of expected coverage gain)

1. Comparisons between two values (`length > limit`) and method calls with arguments (`list.contains(x)`),
   shown as facts with their source.
2. Early-return chains mixed with assignments (`x = ...; if (...) return ...`).
3. `switch`/`match` arms returning computed values, and guard-only functions as "checks" cards.
4. Loops over collections (`for each`, `any`, `all`), which needs the Thunder Text list layer.
5. Calculations returned as values, which needs the Thunder Text calculation layer.

Each step is measured by re-running this table.
