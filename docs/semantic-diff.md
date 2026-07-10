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

Semantic Diff is how IntentLang improves both code review and release review. A
reviewer reads what changed about the intent first, then drills into the code for
the changes that actually move risk. It pairs with the
[Build Session Digest](/docs/build-session-digest) (what changed this session) and
the [Proof Matrix](/docs/proof-matrix) (what is verified now).

## Worked example

The semantic-diff block in
`examples/mvp-customer-portal/intent-session-summary.json` shows the shape for the
customer portal's first session.

## Where it comes from (planned)

`intent diff ./intent --since HEAD~1` is a **planned** command owned by the
SkillsTech Compiler. This repo teaches the concept and ships the example fixture.
