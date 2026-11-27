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

- **Change a rule's shape** with `--decision`. Adding or removing a condition, an `and`/`or`, or a name is refused
  there; use a step edit (`--edit`, below) or **Propose rule change** for that.
- **Invent a code name.** If the answers are enum members such as `Decision.APPROVE` and the new answer is not
  returned anywhere yet, Thunder write refuses rather than write a name that may not exist. Step edits do the
  same: a word or name that is not in the function, the file, or the language's built-ins (`"amount is big"`,
  `total` when the input is `amount`) is refused, and the refusal lists the function's inputs. A new local the
  step itself sets (`total = amount * 2`) and an input an earlier edit added are fine.
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

## Change any step: inputs, questions, Stops, and steps

Rules are one kind of change. `thunder write <file> --edit` changes any step of a function in TypeScript,
JavaScript, Python, or Go: add an input and use it, add a check that stops with an error, change a question, add,
remove, or move a step, change what a step gives back, or rename. Write conditions and values in Thunder's words, the
way `thunder read` shows them, or as code.

```sh
thunder read refunds.py                      # the steps, each with its line
thunder write refunds.py --edits change.json  # preview: the patch, Thunder before and after, the proof
thunder write refunds.py --edits change.json --test "pytest -q" --apply
```

```json
[
  { "op": "addStop", "member": "refund", "before": "line:2", "when": "amount is below 0", "message": "Amount cannot be negative" },
  { "op": "setCondition", "member": "refund", "step": "line:2", "when": "amount is at least 75 and not member" }
]
```

```diff
 def refund(amount, member):
+    if amount < 0:
+        raise ValueError("Amount cannot be negative")
-    if amount > 100:
+    if amount >= 75 and not member:
         return "review"
```

| Edit | What it does | Example |
| --- | --- | --- |
| `setValue` | Change a value in a step: `to` a plain value, or `toValue` a name or expression in Thunder's words | `{ "from": "...", "toValue": "placeholder" }` |
| `setCondition` | Change a question: the whole condition (`when`), one comparison (`compare`), `negate`, or add a part (`addClause`) | `{ "when": "the length of value is below 2" }` |
| `addStop` | A new question that stops with an error, or a Stop on a question's side | `{ "when": "n is below 0", "message": "n must not be negative" }` |
| `addStep`, `removeStep`, `moveStep` | Add a step (`Give …`, `Set … to …`, `Stop with "…"`, code, or `{ "if", "then", "else" }`), remove one, or move one | `{ "before": "line:5", "step": { "if": "item is nothing", "then": ["continue"] } }` |
| `addInput`, `removeInput` | Add an input with a default (callers keep working), or remove one the function no longer uses | `{ "name": "fill", "default": "\"\"" }` |
| `setGivesBack` | Change what a step gives back | `{ "step": "line:9", "value": "[]" }` |
| `rename` | Rename an input, a name inside the function, or the function and its calls | `{ "from": "opt", "to": "option" }` |

**Thunder's words.** `is at least`, `is at most`, `is more than`, `is below`, `is` and `is not`, `is nothing`,
`is between … and …`, `contains`, `starts with`, `ends with`, `and`, `or`, `not`, `'s` (`order's total`),
`the length of`, `the first of`, `the last of`, `plus`, `minus`, `times`, and text in quotes. Names are the code's own
names said as words: "max length" is `max_length` in Python and `maxLength` in TypeScript, matched against the names in
the function first and then the file, never a word in a comment or docstring. Each language gets its own form:
"name is nothing" is `name is None` in Python, `name == null` in TypeScript, and `name == nil` in Go. "member is
true" means equal to true (`member is True`, `member === true`): in Python 1 and "x" are truthy but not true, so a
person who means truthy writes "member". A word with no fixed meaning in the language ("contains" in Go, where it
depends on the value) is refused rather than guessed. Calls are written as code (`str(default)`).

**Lines.** Steps are named by the line `thunder read` shows (`"line:12"`). In a list of edits, every line is a line of
the original file: when an earlier edit adds lines (a Stop, an input on its own line), the later edits' lines follow
it. A line an earlier edit rewrote cannot be found again, and the edit is refused with that reason.

**Steps inside error handling.** Steps in `except` / `catch` and `finally` blocks can be changed like any other.

### How a step change is checked

1. **The proof**, before anything is returned: the changed file is read again. The edited function must read
   exactly as the edits say, tree for tree, and every other function in the file must mean exactly the same.
2. **`--test "<cmd>"`** runs your command on the changed code, and the change is saved with `--apply` only if it
   passes.
3. When the writers cannot write a change exactly, the answer is `needs-ai`, with an instruction ready for a coding
   agent; its code is checked by the same proof (`--candidate`) and labeled AI-written. Nothing is written silently.

For coding agents, the MCP server (`thunder mcp`) offers the same as `intent_write`: give the files and the edits, get
the patch, the new files, and the proof. It never writes to disk.

### Measured on real code

Two measurements, both repeatable from the repository (`scripts/write-bench.mjs`, `scripts/write-sweep.mjs`):

**Change requests with hidden tests.** Realistic requests ("refuse a negative max_length", "let callers choose the
placeholder", "do not count None") on code Thunder was not built for. Each has a hidden test that must **fail** on the
original code and **pass** on the written code, and the changed module must still import. Only the Python standard
library is used, so nothing is installed.

| Set | Done | Written but wrong | Not written |
| --- | --- | --- | --- |
| Click, 12 requests (used while fixing the writer) | 12 | 0 | 0 |
| humanize and toolz, 12 held-out requests (written before the writer ran on them; first run) | 11 | 0 | 1 refused: a step inside `except` (now supported) |

The first set is not a fair score: four writer bugs were found and fixed on it (an `elif` given a second colon, an empty
function body left without `pass`, a name taken from a docstring, lines not followed after an earlier edit), and two of
its tasks were corrected. The held-out set was scored once, as written.

**Every function, every kind of edit.** For every function in five open-source Python projects, one edit of each kind
that fits it, then an independent check that each written file still parses (Python's own parser), beside Thunder's
proof:

| Project | Edits tried | Written and proven | needs-ai | Refused | Written files that do not parse |
| --- | --- | --- | --- | --- | --- |
| Flask | 1,480 | 1,404 | 76 | 0 | 0 |
| Requests | 890 | 886 | 1 | 3 | 0 |
| Click | 2,103 | 2,016 | 86 | 1 | 0 |
| httpx | 1,451 | 1,418 | 33 | 0 | 0 |
| rich | 3,402 | 3,218 | 169 | 15 | 0 |
| **All** | **9,326** | **8,942 (95.9%)** | **365** | **19** | **0** |

Before this round of fixes the same check found 11 written files that did not parse (an `elif` with two colons, empty
function bodies, a hex number, a comment between a question and its first step, a Stop placed between a decorator and
its function). Each is fixed and has a test. These edits are generated (one of each kind per function), so they show
whether the writer writes correct code, not whether a change is useful.

What this does not show: that a change is the change a person wanted, or that the project's own test suite passes
afterwards (those suites need pytest and their dependencies installed; run them with `--test`).

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
