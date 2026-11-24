# Language audit: reading real open-source code in every language

Thunder is only useful if it shows **everything** a piece of code does. The language audit reads one open-source
repository per language with the Thunder compiler and measures what a reader would miss. Run it yourself:

```sh
cd compiler && node scripts/language-audit.mjs            # all eleven repositories
node scripts/language-audit.mjs psf/requests              # one repository
```

It reports, per repository: files and functions read, reader errors, **branches shown** (every `else`, `elif`,
`except`/`catch`/`rescue`, and `finally`/`ensure` in the source must appear in Thunder), the share of steps that
explain something (rather than showing code Thunder cannot explain yet), and the functions that are fully
explained (every branch shown and at least 80% of their steps explained). Tests, specs, and vendored code are not
counted. Words inside multi-line strings (for example a bash script inside Go) are not counted as code.

## What the audit found (2026-11-24)

Before this audit, Thunder showed **no** `else`, `catch`, or `finally` in any of the eleven repositories, while the
reading still claimed full coverage: the other side of every question and every error handler was silently left
out. OpenThunder found the same thing on a real application. The reader now reads every branch at every depth.

| Language | Repository | Functions | Branches shown, before → after | Steps explained | Fully explained functions, before → after |
| --- | --- | --- | --- | --- | --- |
| Python | [psf/requests](https://github.com/psf/requests) | 265 | 0% → **95%** | 92% | 62% → **80%** |
| TypeScript | [sindresorhus/ky](https://github.com/sindresorhus/ky) | 116 | 0% → **79%** | 91% | 75% → **85%** |
| TypeScript (React) | [jaredpalmer/formik](https://github.com/jaredpalmer/formik) | 199 | 0% → **52%** | 83% | 47% → **60%** |
| JavaScript | [expressjs/express](https://github.com/expressjs/express) | 140 | 0% → **92%** | 87% | 53% → **72%** |
| Go | [spf13/cobra](https://github.com/spf13/cobra) | 587 | 0% → **64%** | 96% | 82% → **90%** |
| Rust | [rust-lang/log](https://github.com/rust-lang/log) | 411 | 0% → **95%** | 84% | 73% → **74%** |
| C# | [jbogard/MediatR](https://github.com/jbogard/MediatR) | 224 | 0% → **71%** | 92% | 65% → **75%** |
| Java | [google/gson](https://github.com/google/gson) | 1209 | 0% → **87%** | 87% | 61% → **75%** |
| Kotlin + Java | [JakeWharton/timber](https://github.com/JakeWharton/timber) | 96 | 0% → **77%** | 93% | 76% → **89%** |
| PHP | [guzzle/guzzle](https://github.com/guzzle/guzzle) | 698 | 0% → **74%** | 84% | 55% → **66%** |
| Ruby | [sinatra/sinatra](https://github.com/sinatra/sinatra) | 525 | 0% → **80%** | 77% | 48% → **62%** |

No reader errors in any repository.

## What was fixed

- **Every branch, at every depth.** `else`, `elif`/`else if`/`elsif`, `except`/`catch`/`rescue` (named: "If
  DatabaseError goes wrong") and `finally`/`ensure` ("Always, at the end"), in brace languages and in Python and
  Ruby, including Ruby's method-level `rescue`. The reader no longer folds anything below one level.
- **Go:** `if err := open(); err != nil` reads "If open fails" (the header is no longer split at `;`); counted loops
  read "Counts i from 0 while i is less than n"; `_, err :=` drops the `_`.
- **Java, C#, Kotlin:** switch cases ("When it is …", "Otherwise"), casts, typed declarations, `foreach`,
  one-line `if (…) return …;`, errors made by factory functions.
- **Ruby:** bare words are calls unless they are the value given back; nothing in `ensure` is the value given back;
  modifier `if`/`unless`; predicates (`order.paid?` is "order is paid"); ternaries; DSL calls (`set :name`).
- **PHP:** attributes such as `#[SensitiveParameter]` are not parameters; `->` is never a comparison; `isset`,
  `empty`, `count` read as words; namespaced exception names.
- **Everywhere:** comparisons as words ("is at most"), plain names as conditions ("proxy is set"), yes/no values
  ("whether …"), ternaries ("3 if the retry is set, otherwise 0"), declarations without a value ("Starts with no
  size error yet"), functions stored under a name ("Defines how ky's create works"), pairs in loops ("For each key
  and value in params").

## Known gaps

- **Functions inside functions** (React hooks, callbacks passed to `useCallback`, lambdas with their own `if`) are
  not opened yet; their branches are the main gap in formik.
- **Expression-valued `if`** (Ruby `x = if … else … end`, Kotlin `val x = if (…) … else …`) and `do … while`.
- Go's remaining misses are mostly `switch` cases with `fallthrough` and `select`.
