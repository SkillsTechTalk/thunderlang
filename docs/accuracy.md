# How accurate is Thunder?

Thunder is only useful if people can trust it: a picture that is wrong gives a false sense of security. This page
measures it on real open-source code, with `compiler/scripts/accuracy.mjs`, and is updated as the reader changes.

```
node compiler/scripts/accuracy.mjs <repo>... [--io] [--failures] [--samples out.md --per-language 40]
```

## What is measured

1. **Round trip (exact).** A rule is read into a Thunder card, written back as code in every language Thunder
   writes (TypeScript, Python, Go, Rust, C#, Java), read again, and both are run on every edge case. "Same" means the
   same answer everywhere. "Different" would mean Thunder changed what a rule decides.
2. **What a step keeps.** Every number and quoted text in Thunder's wording must appear in the code ("invented"
   counts the steps where one does not), and how many of the code's names the wording mentions ("names kept").
   Steps Thunder shows as code are honest but not explained.
3. **Big Picture against an independent count.** Classes, routes, and methods counted by a separate, simple scan:
   classes drawn, routes drawn, and methods owned by the wrong Thing.
4. **Inputs and outputs.** Parameter names and values read from a request, against "You give it"; functions whose
   code returns, sends, or throws something, against whether Thunder shows an ending.

## Latest results (eleven repositories, nine languages)

| Repo | rules | round trips same | steps explained | names kept | steps with an invented value | classes drawn | routes drawn | methods misplaced | inputs shown | endings shown |
|---|---|---|---|---|---|---|---|---|---|---|
| JakeWharton__timber | 0 | n/a (0/0) | 94.5% | 53.3% | 0 of 497 | 100% (10/10) | 0/0 | 0 of 94 | 80.4% (123/153) | 100% |
| expressjs__express | 3 | 33.3% (6/18) | 90.2% | 57.6% | 0 of 739 | n/a (0/0) | 51/68 | 0 of 143 | 100% (98/98) | 87.7% |
| google__gson | 11 | 9.1% (6/66) | 90.3% | 65.3% | 0 of 5232 | 100% (164/164) | 0/0 | 0 of 1214 | 100% (898/898) | 96% |
| guzzle__guzzle | 10 | 18.3% (11/60) | 88.5% | 60.8% | 3 of 4901 | 96.2% (51/53) | 0/0 | 0 of 714 | 99.8% (664/665) | 99.4% |
| jaredpalmer__formik | 3 | 66.7% (12/18) | 91.6% | 62.5% | 0 of 1148 | 100% (7/7) | 0/0 | 0 of 202 | 93.7% (208/222) | 97.7% |
| jbogard__MediatR | 2 | 100% (12/12) | 89.9% | 47.7% | 0 of 1014 | 100% (90/90) | 0/0 | 0 of 228 | 81.9% (254/310) | 99.2% |
| psf__requests | 1 | 0% (0/6) | 92.4% | 69.8% | 0 of 1519 | 100% (40/40) | 0/0 | 0 of 268 | 99.7% (295/296) | 98.9% |
| rust-lang__log | 1 | 0% (0/6) | 87.1% | 45% | 0 of 858 | 100% (30/30) | 0/0 | 0 of 412 | 75.9% (202/266) | 100% |
| sinatra__sinatra | 17 | 0% (0/102) | 79.9% | 50.8% | 0 of 1541 | 100% (44/44) | 3/4 | 0 of 542 | 78.5% (402/512) | 96.5% |
| sindresorhus__ky | 0 | n/a (0/0) | 92% | 64.2% | 0 of 689 | 0% (0/2) | 0/7 | 0 of 117 | 95.5% (127/133) | 100% |
| spf13__cobra | 0 | n/a (0/0) | 95.5% | 53% | 0 of 5249 | 100% (9/9) | 0/0 | 0 of 589 | 99.7% (648/650) | 81.3% |

All: round trips same 16.3% (47/288; different 0, not read back 108, cannot run 133, not written 0); steps explained 90.4%; names kept 58%; steps with an invented value 3

Before the faithfulness gate (same repositories): steps explained 89.3%, names kept 59%, 72 rules and 65 of 372 round
trips the same. The rule count fell because a function is now drawn as a rule only when the rule covers its whole
body (see below); the 18 round trips that left with them had only ever checked part of those functions. The three
"invented" values are PHP steps whose line is off by one in one file (a line-numbering gap, not a made-up value:
the numbers are in the code one line below).

## The faithfulness gate

A hand review of 330 sampled readings (30 functions per repository, ten languages) graded each against its code:
32 accurate, 188 true but vague, 53 misleading, and **57 false**. Most false readings had one cause: a condition's
words lost a negation or a term (`!a || b` read as "a or b", with the Stop on the wrong side), or a value was cut to
its first clause. The reader now checks its own words before it shows them:

- **Conditions.** A condition is split at its top-level and / or; each part is said on its own; and each part's
  words must keep that part's negations (`!`, `not`, `!=`, `!==`, `is not`, `not in`, `unless`) and comparisons.
  A loose `!= null` reads "is set" (its negation is part of the meaning); strict `=== null` and `=== undefined` stay
  apart. When the words cannot keep everything, the question is the code itself: "Ask: `…`? (code, not
  explained)". A compound question is asked as written, never turned positive, so the Stop stays on the side where
  the code takes it; `unless` is the only thing that flips a whole question.
- **Values.** A value stored under a key keeps its key ("Stores v under key in headers", never "Sets headers to
  v"); a returned `a && b` or `a || !b` keeps every part or is shown as code; a ternary whose side cannot be said is
  not half-said; `a or b` keeps its fallback; a call names a value only when the call is the whole value.
- **Structure.** No construct is dropped: a loop's `continue` and `break` are steps; a brace-less `if` keeps its
  statement; a switch is one question with one side per case; a loop whose body could not be read is shown as code
  (never an empty "For each:"); comment marks inside strings (`'//'`, PHP `'#'`) no longer cut a body short; a
  function is drawn as a rule only when every statement was read into it.

How often the gate gives code back (all eleven repositories): 66 of 4,727 questions (1.4%) are asked as code; 571
of 4,080 endings (14%) and 1,168 of 8,027 values (14.6%) are shown as code (before: 497 of 3,855 and 1,223 of 7,466).
A self-check over every question (the polarity of the words and the Yes/No side against the polarity of the code)
finds no mismatch, against 63 before.

### Hand review, re-graded

The 110 samples graded misleading (C) or false (D) were re-read against the new Thunder Text (same functions, same
code):

| | false (D) | misleading (C) | true but vague (B) | accurate (A) |
|---|---|---|---|---|
| The 57 that were D | 0 | 0 | 44 | 13 |
| The 53 that were C | 0 | 5 | 48 | 0 |

The five still misleading: a promise chain whose `.then`/`.catch` steps are not shown (Express), a lazy getter made
with `Object.defineProperty`, a returned anonymous class (Gson), a returned stream with its progress logic hidden
behind "the result of pipe through" (ky), and a Go `ctx` input left out as plumbing. Each sample's regression test is
in `compiler/test/faithfulness-*.test.mjs`.

## What the numbers say

- **No false readings in the re-graded sample, and no changed answers.** Every condition keeps its polarity or is
  shown as code; no rule gave a different answer after the round trip.
- **The round trip is mostly unchecked, not wrong.** Most rules cannot yet be written back or run on both sides
  (string comparisons, calls, and rules that use facts the class keeps), so they are counted as not checked. That
  is coverage to win, and it is never reported as "same".
- **Inputs and endings are near complete** for Java, Go, PHP, Python, TypeScript, and JavaScript; Rust, Ruby,
  Kotlin, and C# miss some inputs, and some Go and Express endings are missed.
- **Names kept** is about how much detail the wording carries ("Calls save" without what it saves); it is the main
  place Thunder still loses information on purpose to stay short, and the next target.

This is measured on code, not by watching people read it. A person's own check of hundreds of sampled readings is
the next step.
