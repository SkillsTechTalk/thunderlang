# Testing Thunder with people who did not build it

Thunder's bar is a promise until people show it: **a 12-year-old can read it, and an architect can trust it.** This
protocol tests that, the same way every time, so results can be compared after each change.

## Who

Five people per round (five find most problems), none of whom built Thunder or OpenThunder:

| Group | How many | Why |
| --- | --- | --- |
| A learner (12 to 16, with a parent's consent, or an adult who has never programmed) | 2 | The 12-year-old bar |
| A developer who knows a language different from the sample's | 2 | "Read any app, in any language" |
| An architect or senior engineer | 1 | "An architect can trust it" |

Sessions are about 30 minutes, one person at a time, remote or in person. Ask for consent to take notes; record only
with explicit permission. Do not use names in the notes; use A1, A2, D1, D2, R1.

## What they use

thunderlang.dev only (no install): /learn for the first five minutes, then /zoom with the "School library (Python)"
example and one sample in a language they do not know (for example Go or Rust) on /read.

## Tasks (read aloud; do not help, do not explain Thunder)

1. "Look at this page for a minute. What do you think this program is for?" (Big Picture)
2. "A student returns a book three days late. What happens? Show me where you see that." (Flow)
3. "What can make borrowing a book fail? What does the person see then?" (Details: Stops)
4. "What does the late fee rule charge for 8 days late? How sure are you?" (Details: limits, Try the rule)
5. "Find the line in the original code that decides that." (Original)
6. Developers and the architect only: "Here is a function in a language you don't know (Go or Rust). What does it give back, and when does it stop with an error?"
7. "Is there anything on these pages you don't trust, or that seems to be guessing?"

## What to write down, per task

- **Understood:** yes / partly / no, in their own words (quote them).
- **Time** to answer, roughly.
- **Where they got lost** (the exact screen and words).
- **Anything they believed that is false** (the most important finding: a reader who trusts a wrong picture).
- **What they wanted** that was not there.

## After each round

Add a short record to DESIGN.md's review record: date, version, who (by group, not name), what worked, what failed,
and what changed because of it. Fix the top problems, then run the same tasks again with new people.

Thunder's pages say what has and has not been tested with people; until a round is done, they say "not yet tested
with people who did not build it".
