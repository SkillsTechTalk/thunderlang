# Semantic Diff

A **Semantic Diff** is a diff by meaning, not by file. A line diff shows that text
moved. A semantic diff shows how the intent changed: which guarantees were added,
which never rules were weakened, which proof went stale.

Part of the family of concepts for
[working with large changes](/docs/large-changes).

## Why meaning, not lines

The changes that matter most in a review are often invisible in a line diff:

- A never rule quietly weakened from "never log the token" to "never log the token
  in production."
- A guarantee removed as a side effect of a refactor.
- A proof artifact that went stale because the code moved underneath it.

A line diff shows churn. A semantic diff shows the change in trust.

## Shape

```
Semantic diff (since HEAD~1)
  15 missions changed
  10 guarantees added
  8 never rules added
  0 never rules weakened
  14 verification rules added
  1 proof artifact became stale
  3 new chains created
```

The line that matters most is often the smallest: `3 never rules weakened` is a
one-word change in the text and a major change in trust.

## In review

Semantic Diff is how ThunderLang improves both code review and release review. A
reviewer reads what changed about the intent first, then drills into the code for
the changes that actually move risk. It pairs with the
[Build Session Digest](/docs/build-session-digest) (what changed this session) and
the [Proof Matrix](/docs/proof-matrix) (what is verified now).

## Worked example

The semantic-diff block in
`examples/mvp-customer-portal/intent-session-summary.json` shows the shape for the
customer portal's first session.

## Semantic Merge

If a diff answers "what changed?", a **merge** answers "how do two concurrent
changes combine?" When two people edit the same Atlas at the same time (a PM
sharpens a guarantee while a designer adds an experience state), a line-based merge
sees overlapping text and reports a conflict on characters. A semantic merge reasons
over the Intent Graph instead: it merges by node identity and by meaning.

`mergeGraphs(base, ours, theirs)` is a deterministic three-way merge:

- A node changed on **only one side** is taken automatically.
- A node changed the **same way on both sides** is taken once (no false conflict).
- A node changed **differently on each side** is a real **conflict**: the result
  records `{ id, base, ours, theirs }` and keeps `ours` provisionally so the merged
  graph is always usable.
- Relationships merge by presence: whichever side added or removed an edge relative
  to the base wins.

Because identity is the stable node id and equality is content (timestamps ignored),
the merge is order-independent and reproducible: the same three inputs always produce
the same merged graph and the same conflict set. That determinism is what lets a
collaborative Atlas editor auto-merge the safe majority of concurrent edits and
surface only the genuine intent conflicts for a human to resolve.

```
intent merge <base> <ours> <theirs>
  intent merge: CONFLICTS , 58 node(s), 1 conflict(s)
    conflict: Guarantee guarantee.pay.amount-never-negative (changed differently on both sides)
```

Each argument is a mission file or a directory of missions (merged as an Atlas). The
command exits `0` when the merge is clean and `1` when conflicts remain, so it drops
into CI the same way `thunder diff` does. `--json` emits the full merge result,
including the merged graph and the structured conflict list.

## Where it comes from

`diffGraphs` / `mergeGraphs` and the `thunder diff` / `thunder merge` commands are
owned by the SkillsTech Compiler (`@skillstech/thunderlang`). This repo teaches the
concepts, ships the example fixture, and exposes both from the library and CLI.
`thunder diff ./intent --since HEAD~1` (git-range diffing) remains **planned**.
