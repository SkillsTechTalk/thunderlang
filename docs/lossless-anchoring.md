# Lossless anchoring

Every Thunder step and rule points at its exact place in the original file. A change made in Thunder can be
written back to exactly that place and nowhere else, then checked by reading the file again. This is the
foundation for **Thunder write**: change the picture, and only the matching code changes.

```sh
thunder anchor billing/refunds.py
```

```text
refunds.py (python): 100% of code lines are anchored to a Thunder step.

issue_refund (line 8) 100% anchored
  0     L9        set     Works out decision from approve refund
  1     L10-13    branch  If decision is "Approve"
  1.0   L11       call    Calls Stripe
  1.1   L12       call    Writes to the database (insert): refunds
  1.2   L13       call    Announces an event: refund.issued
```

## What is anchored

- **Spans.** Each step has `span: { startLine, endLine, start, end, exact }`. `exact: "offset"` means character
  offsets into the file (every language except PHP); `exact: "lines"` means whole lines (PHP, which is read after
  normalizing `$` and `->`).
- **Coverage.** Each function reports `anchor.coverage`: the share of its real code lines (not blank lines,
  comments, or lone braces) that belong to a step or to a statement Thunder deliberately skips, such as `else`,
  `pass`, or a docstring. `anchor.missing` lists any line that is not yet anchored.
- **Nothing is dropped.** Every statement is kept as a step, including ones Thunder cannot explain in words
  (shown as their original code). Long functions fold extra steps in views, but all of them stay anchored.

## Writing a change back (`editStep`)

`editStep({ source, language, functionName, path, replacement })` replaces exactly one step's code and then
verifies the result by reading the file again:

1. the function is still found;
2. the edited step now reads as the new code;
3. every other step's code is unchanged (ancestors that contain the edit are allowed to change).

If any check fails, it returns `ok: false`, the reasons, and the original source untouched. Whole-line spans keep
the original indentation, which carries meaning in Python and Ruby.

## Measured on real repositories (2026-11-22)

On the eleven public repositories in [the results](/docs/thunder-repo-results) (all ten supported languages):

| Check | Result |
| --- | --- |
| Functions fully anchored (every code line belongs to a step) | 99.4% of 11,805 |
| Average share of code lines anchored | 99.8% |
| Writing each step back as itself (4,875 steps): file byte-identical | 100% |
| Same edits verified by re-reading | 100% |

## What anchoring does not do yet

- It anchors steps, not meaning. A step that reads "Calls Stripe" is linked to its exact code; it is not yet an
  executable Thunder construct. Turning steps into executable Thunder, layer by layer, is the next part of the
  language work.
- Rule cards (decisions) are anchored by line. Changing a single comparison or number inside a rule ("at most"
  to "under", 100 to 75) is [Thunder write](/docs/thunder-write), which finds those exact characters itself.
