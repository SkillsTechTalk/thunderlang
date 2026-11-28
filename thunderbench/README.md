# ThunderBench

An open benchmark for one claim: **Thunder™ makes software easier for people to understand and change, without
hiding what it cannot do.** ThunderBench measures that the same way every time and publishes every result,
including the ones where Python does better.

```sh
node thunderbench/run.mjs                   # every track that can run here → results/latest.md
node thunderbench/run.mjs --corpus /tmp/tb  # also Thunder write on real change requests (clones a pinned repo)
```

Latest results: [results/latest.md](results/latest.md).

**ThunderBench now has its own repository: [SkillsTechTalk/thunderbench](https://github.com/SkillsTechTalk/thunderbench).**
It runs on the published compiler, so anyone can reproduce it without this repository. This folder stays as the
copy that runs against the compiler in this repository, so a change here can be measured before it is released.

## What it measures

| Track | The question | How |
| --- | --- | --- |
| Pairs | Do the Thunder and Python versions of a program mean the same thing? How big is each? | Six small real programs written in both ([programs/](programs/)). 26 questions, each answered by **running both** versions; a disagreement fails the benchmark. Size counts code lines, characters, and tokens. |
| Honesty | When Thunder cannot say something, does it say so, or guess? | Python that Thunder Core cannot express with the same meaning (half-even rounding, floor division, …) must be marked "not translated". Target: zero silent guesses. |
| Round trip | Is code read into Thunder still the same code when written back? | 20 Python functions read as Thunder Core, compiled back to Python, and run next to the original on hand-picked inputs and on inputs made from each function's code. |
| Targets | Does one program mean the same in every language Thunder compiles to? | The Core examples run on the Thunder engine, Python, and TypeScript; outputs must match exactly. |
| Write | Can Thunder change real code correctly? | Real change requests on a pinned public repository, judged by hidden tests Thunder never sees (`--corpus`). |
| Speed | Is it fast? | Everyday commands, timed by CPU time. |
| People | Do people read and change Thunder faster and more accurately than Python? | The reading sheets and protocol in [people/](people/README.md). **Not run yet; nothing is claimed.** |

## Targets for 2.0

These are goals, not results.

| Measure | Target |
| --- | --- |
| Time to understand a program (people) | 50% faster than Python |
| Time to make a correct change (people) | 40% faster than Python |
| Beginner comprehension accuracy (people) | 90% |
| First program, from nothing | under 5 minutes |
| Cross-target conformance | 100% of the supported test suite |
| Unsupported behaviour silently misrepresented | zero |

## What building it found

Writing everyday programs for a benchmark is a test of the language too. Found while writing these six:

- **Thunder is longer.** Over the six programs, Thunder has more lines, characters, and tokens than Python
  (see the size table). The one exception is money: the invoice is shorter in Thunder, because exact money in
  Python needs `Decimal` and an explicit rounding mode. Readability is for the people track to show; length is
  reported as it is.
- **`where` works only on lists of records.** `scores where it is at least 0` is natural and does not work; the
  grades program needs a four-line loop. A gap to close in Thunder Core.
- **No floor division.** Core has no whole-number division (`//`), so a "one point per whole $10" rule could not be
  written plainly. The loyalty program uses a rule that does not need it.
- **One file stops a whole project.** `thunder run hello.thunder --target typescript` inside `examples/core` is
  refused because a *different* file there uses a Python module. Running one program should build that program.

## Rules

- Every number here is produced by `run.mjs`; nothing is typed in by hand or estimated. A track that cannot run
  says why.
- Results where Thunder does worse stay in the results.
- The people track counts only when a round is run with people who did not build Thunder, following
  [people/README.md](people/README.md).
