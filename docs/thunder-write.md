# Thunder write

Change a rule in Thunder, and only the matching characters in your code change. Every change is checked by
reading the file again before anything is saved.

```sh
thunder write checkout/refunds.ts --decision approveRefund --rule 2 --when "amount < 75"
```

```text
approveRefund, rule 2
  was: If amount is at most 100, the answer is Approve
  now: If amount is less than 75, the answer is Approve

Code change (only these characters):
  line 3, column 14: <=  ->  <
  line 3, column 17: 100  ->  75

Checked by reading the file again: this rule reads as intended; every other rule and function reads exactly as before.

Checked 12 boundary inputs; 4 now get a different answer. These are the values on each side of every limit, not every possible input.
  amount 75, isVip false: Approve -> Review
  amount 76, isVip false: Approve -> Review
  amount 99, isVip false: Approve -> Review
  amount 100, isVip false: Approve -> Review

Preview only; nothing was saved. Add --write to save the change.
```

## What you can change

Thunder write works on **decisions**: functions that choose between fixed answers, as shown by
[Thunder read](/docs/reading-code). Find the rule number with `thunder read <file>`.

| Change | Example | How it is written back |
| --- | --- | --- |
| A number | `100` to `75` | The file's own style is kept: `100.0` becomes `75.0`, `100m` becomes `75m` |
| A comparison | at most (`<=`) to less than (`<`) | `===` and `!==` stay strict in JavaScript and TypeScript |
| A text value | `"gold"` to `"platinum"` | The original quote style is kept |
| An answer | `Approve` to `Review` | Reuses a spelling the function already returns (`Decision.REVIEW`), or changes the text of a string answer |

Use `--when "<condition>"` with the rule's condition in Thunder form, `--answer <Outcome>`, or both.
`--rule otherwise` changes the fallback answer.

## How a change is checked

1. Thunder finds the rule's exact numbers, comparisons, and text in the original file.
2. It changes only those characters. Indentation, comments, and every other line are untouched.
3. It reads the changed file again. The edited rule must read exactly as intended, and every other rule,
   answer, and function in the file must read exactly as before.
4. It runs the old and the new rule on the values on each side of every limit and lists the cases whose
   answer changes, so you can see the effect before you save.

If any check fails, nothing is written and Thunder says why. The exit code is 1.

## What it will not do

- **Change a rule's shape.** Adding or removing a condition, an `and`/`or`, or a name is refused. Use
  **Propose rule change** for that.
- **Invent a code name.** If the answers are enum members such as `Decision.APPROVE` and the new answer is not
  returned anywhere yet, Thunder write refuses rather than write a name that may not exist.
- **Prove the application is right.** The check covers how the code reads, and the listed cases cover the
  boundary values. It does not compile or run your code. Run your own tests before you commit.

## In code

```js
import { writeRule } from '@skillstech/thunderlang/core';

const r = writeRule({ source, language: 'typescript', decision: 'approveRefund', rule: 2, when: 'amount < 75' });
if (r.ok) save(r.source); else console.log(r.problems);
```

`r.change` lists each edited position (`line`, `column`, `before`, `after`). `r.cases` holds the inputs whose
answer changes. When `ok` is false, `r.source` is the original and `r.problems` explains why.

Thunder write builds on [lossless anchoring](/docs/lossless-anchoring), which links every Thunder step to its
exact code. Changing a rule by clicking it in the Thunder picture comes next, in OpenThunder and on this site.
