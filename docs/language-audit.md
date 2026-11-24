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

## Reading gaps filled (2026-11-24, second pass)

The four known gaps from the first audit are now read. Same eleven repositories, same counting (a Kotlin
`else ->` arm shown as "Otherwise" now counts as its else branch shown):

| Repository | Branches shown, before → after | Steps explained, before → after | Fully explained functions, before → after |
| --- | --- | --- | --- |
| psf/requests | 95% → **99%** | 92% → 92% | 80% → 80% |
| sindresorhus/ky | 79% → **93%** | 91% → 92% | 85% → **88%** |
| jaredpalmer/formik | 52% → **91%** | 83% → **87%** | 60% → **63%** |
| expressjs/express | 92% → **96%** | 87% → **89%** | 72% → **74%** |
| spf13/cobra | 64% → **81%** | 96% → 96% | 90% → 91% |
| rust-lang/log | 95% → **100%** | 84% → **88%** | 74% → 75% |
| jbogard/MediatR | 71% → **76%** | 92% → 92% | 75% → 75% |
| google/gson | 87% → **92%** | 87% → **89%** | 75% → 76% |
| JakeWharton/timber | 73% → **91%** | 93% → **95%** | 88% → **92%** |
| guzzle/guzzle | 74% → **78%** | 84% → 85% | 66% → 67% |
| sinatra/sinatra | 80% → **91%** | 77% → 77% | 62% → **64%** |

(The "before" column is the reader just before this pass on the same checkouts, so a few numbers differ slightly
from the first table. gson now has 1202 functions instead of 1209: `synchronized (x) { … }` blocks were being read
as functions named "synchronized".)

- **Functions inside functions** show their own steps: `useEffect` ("When this first shows on screen, and whenever
  user id changes"; cleanup "When this is taken off the screen, cleans up"), `useMemo` ("Works out full name and
  remembers it until user changes"), `useCallback` ("Defines how handle save works"), inner functions and Python
  inner `def`s, Go `go func()` / `defer func()` / function values, Java and C# lambdas, Rust closures, Kotlin
  trailing lambdas (`user?.let { … }` reads "If user is set"), Ruby `do` blocks, timers, events and promise
  callbacks ("When load is done"). Python `with` blocks and Java `synchronized` blocks show their steps too.
- **`if`, `match` and `when` as values** read like ternaries on one line ("Sets bonus to 5 if score is more than
  90, otherwise 0") and as the question over several lines, each side ending in "Sets label to …". The arms of a
  Rust `match`, Kotlin `when`, C# `switch` expression and PHP `match` read one by one ("When it is from 0 to 49").
- **`do … while`** reads "Runs once, then repeats while …".
- **Go `select`** reads "Waits for whichever of these is ready first" ("When msg arrives from ch", "When ctx is
  cancelled or times out", "When 5 seconds have passed"); with a `default` it "Checks which of these is ready,
  without waiting". `fallthrough` reads "Carries on into the next case too"; `switch {` reads "Checks these cases
  in order". A `case` label no longer swallows the first step of its case.

## Known gaps

- Only the first function written in a statement is opened (`.then(onDone, onError)` shows `onDone` only), and
  functions inside object literals or JSX props (`onClick={() => …}`) are not opened.
- A `return` inside a function inside a function is read as that inner function's return, but the picture's
  Details still list it with the outer function's answers (the model does not yet treat `nested` steps as their own
  flow).
- Rust patterns that unpack values (`Some(n)`, `Inner::U64(v)`) are shown as written.
