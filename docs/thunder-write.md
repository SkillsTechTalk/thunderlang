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

## One rule, every service: across languages

The same rule is often written more than once. The cart page says "free shipping from $50", the orders service
charges by it, and billing prints it on the receipt. Change one copy and forget another, and the services disagree.
Name the folders (each one part, as for [Thunder Trace](/docs/trace)), and Thunder write changes every copy at once:

```sh
thunder write web orders billing --decision shippingNote --rule 1 --when "subtotal >= 40"
```

```text
One rule, 3 implementations: subtotal is at least 50  →  subtotal is at least 40

billing/receipt.py  (python, shipping_fee, rule 1)
  why it is the same rule: the same condition: subtotal is at least 50 (names compared as words)
  was: If subtotal is at least 50, the answer is 0
  now: If subtotal is at least 40, the answer is 0
  line 7, column 20: 50  ->  40
orders/Shipping.cs  (csharp, ShippingFee, rule 1)
  ...
  line 9, column 25: 50m  ->  40m
web/shipping.ts  (typescript, shippingNote, rule 1)
  ...
  line 6, column 19: 50  ->  40

Checked by reading each file again: the rule reads as intended, and every other rule and function in each file reads exactly as before.

Plan only; nothing was saved. Add --write to change every implementation (all or none).
```

**What counts as the same rule.** A decision rule (in any language Thunder reads) with the same condition: names
compared as words (`subtotal`, `Subtotal`, and `sub_total` are the same name), numbers by value, comparisons and text
exactly. Each answer stays as that service wrote it: the page answers with words, orders with an amount.

**What is never included.** A rule with the same shape where only the names differ (`weight >= 50`) or only the
limit differs (`subtotal >= 500`) is listed as "not included, check by hand", and never changed. So is the same
condition in a decision whose name shares no word with the one you chose (`couponAllowed` next to `shippingFee`,
both `subtotal >= 50`): it is probably a different rule that happens to use the same limit. Names are compared as
words, leaving out words like get, is, and calculate, so `shippingNote`, `ShippingFee`, and `get_shipping_fee` match. Thunder does not
guess that they are the same rule. Code that computes the same thing in a different shape is not found at all.

**All or nothing.** Every copy is changed with Thunder write's own checks (only the rule's characters, each file
read again). If any one cannot be written exactly, no file changes, and Thunder says which one and why.

**Tests.** Thunder never edits tests. A test file that calls one of the rule's functions and mentions the old value
is listed, because it may pin the old rule. `--run "part: cmd"` (needs `--write`) runs each part's tests on the
changed code and reports every failure with its output; a test that pins the old rule fails until a person updates
it. `--passport f.json` (with `--md-out f.md`) records the change as a [Software Passport](/docs/passport): one
claim per changed copy (read again after the change), the test runs, the links between the parts, and what the
change does, read from both versions.

**What it does not do.** Only a rule's numbers, comparisons, and text values change across services. A new input,
a new field, or a new call between services (the duplicate-charge fix in the
[checkout demo](https://github.com/SkillsTechTalk/thunderlang/tree/main/demo/checkout), for example) is a change of
shape, and is not written by Thunder yet. `--answer` is refused across folders: each service answers in its own way.

In code: `writeRuleAcross(files, { decision, rule, when })` from `@skillstech/thunderlang/core` takes
`[{ part, path, source }]` and returns the plan, what was not included, the tests to look at, and the new contents
of each file (`thunder-write-across-v1`); `findSameRule` returns the copies without changing anything, and
`writeAcrossEvidence` turns a result into passport evidence.

## On the page

On [Read in Thunder](/read), open a rule card and choose **Change a rule**. Pick a rule, then change its number,
comparison, text value, or answer. Only those parts are editable; names, "and", and "or" are shown as fixed text.
Before anything changes you see the before-and-after code line, the old and new rule in words, and the answers
that change. **Apply to the code on this page** changes the page's copy of the code and highlights the changed
line; **Undo** puts it back, and **Download the changed file** saves it. Your own files are never touched by the
page.

Thunder write builds on [lossless anchoring](/docs/lossless-anchoring), which links every Thunder step to its
exact code. Change a rule in OpenThunder comes next.
