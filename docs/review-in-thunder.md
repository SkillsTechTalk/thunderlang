# Review in Thunder

A pull request is usually approved by reading a code diff: which lines moved. Review in Thunder says what the change
does instead, in short sentences a person who does not read the programming language can check:

- "Now stops with 403 Forbidden ("forbidden") when the x-admin-secret header is not the ADMIN_SECRET setting."
- "Late fee: the limit between Small fee and Big fee moved from 7 to 10 days late", with a case run on both versions:
  8 days late gave Big fee, and now gives Small fee.
- "No longer stops with HTTPException ("The user with this email does not exist in the system.") when user is not
  set. Check that this is no longer needed."
- "Only the form changed: only names it declares itself changed (sum is now total); the code is otherwise identical."
- In a Thunder Core program: "decide refund: its own steps are the same, but it uses review limit, which changed. On
  3000 inputs tried, 174 answers changed: now a review Refund instead of an approved Refund when amount is from $50.00
  to $99.99", and the test that checked the old limit "passed before and fails now".

Every sentence is read from the code by the Thunder compiler, with no AI, and each one has the before and after behind
it. The full list of what is compared is in [the spec, section 14](/docs/spec).

## On your computer

```bash
npx --package @skillstech/thunderlang thunder review main HEAD      # Markdown, as a pull request comment
npx --package @skillstech/thunderlang thunder review main --json    # main against your working tree, as JSON
```

`thunder review <base-ref> [head-ref]` reads both versions from git (`git diff`, `git show`; nothing is fetched).
Without `head-ref`, the new side is your working tree, including new files git does not track yet. Code in other
languages is never run. Thunder Core programs are run on the Thunder engine, inside the review, to compare their
answers (see [Thunder Core programs](#thunder-core-programs)).
`--out review.md` writes the Markdown to a file.

The summary comes first, then the items, most important first:

| Group | What it means |
| --- | --- |
| **Needs a careful look** | A Stop was removed or now happens under different conditions; the address changed; it now reaches outside the program (another service, a payment, an email, stored data); or Thunder cannot read the changed code, an infrastructure file, or a pipeline. |
| **Changes in meaning** | Anything else that changes what the code does: new Stops, a rule's limits and answers, inputs, what it gives back, what it relies on, new and removed functions, records, imports. |
| **Only the form changed** | Shown, not guessed: the same code apart from spacing, comments, or names the function declares itself; a rule with the same answer on every edge case; a renamed or moved function with the same code. |

## Thunder Core programs

A changed `.thunder` program is compared rule by rule, with the rest of its project (the folder above `src/` and
`tests/`) read from git too:

1. **Each rule has a name that comes from what it is**, never from its line: a function (`decide refund`), an endpoint
   (`POST /orders`), a kept value (`review limit`), a data type and each of its Never rules, a stored list, a test.
   Moved, re-spaced, or commented code is unchanged; a function renamed with the same steps is a rename.
2. **What each rule uses is read from the checked program**, so a change reaches everything that depends on it. A
   changed kept value lists every function, endpoint, and test that uses it, all the way up.
3. **Both versions are run on the same inputs.** A function whose steps changed, or that uses something that changed,
   is called before and after on inputs made from the numbers and text in both versions (each number with one step
   either side: $49.99, $50.00, $50.01) and the usual edges. The answers that differ are grouped: another kind of
   answer ("now a review Refund instead of an approved Refund"), or the same kind with a field that changed ("its
   reason is now …"). When one input decides it, the range of values tried is given ("when amount is from $50.00 to
   $99.99"). This is tested evidence on the inputs it tried, not a proof.
4. **Tests that reach a change run before and after.** One that passed and fails now is the first thing in the review.

What runs, and what can't: the program's functions and tests, on the Thunder engine inside the review. They cannot
read files, call other services, or touch saved data (stored lists start empty and are never saved), and each call
has a step limit and each comparison a time limit. A function that reads saved data or calls another service is not
run, and the review says so. Endpoints are listed as what to look at again, not run.

What to look at again, without a change: `thunder affected "review limit" --in examples/apps/refund-desk` lists the
functions and endpoints that use a rule, the tests and the Expect lines that reach it, and the Never rules and stored
lists they rely on, each with its file and line. Nothing is run.

## In a pull request

The Thunder review action runs `thunder review` on the pull request's base and head, keeps one comment up to date (it
finds its own comment by the line `<!-- thunder-review -->`), and writes the review to the job summary. It is one step:

```yaml
      - uses: actions/checkout@v4
      - uses: SkillsTechTalk/thunderlang@main
```

`@main` follows the latest code; for production CI, pin a commit SHA instead (see
[pinning](/docs/github-action)).

The whole workflow file, its options, what the comment looks like, pull requests from forks, and privacy:
[Thunder review on every pull request](/docs/github-action). Workflows that use the earlier
`SkillsTechTalk/thunderlang/.github/actions/thunder-review@main` keep working; it now runs the same action.

## In code

```js
import { thunderReview, renderReview } from '@skillstech/thunderlang/core';

const review = thunderReview(
  [{ path: 'fees.py', source: before }],   // the files as they were
  [{ path: 'fees.py', source: after }],    // the files as they are now
);
review.says;            // "1 change in meaning, 0 risks, 0 form-only."
review.items[0];        // { kind: 'rule-limit', severity: 'meaning', subject: 'Late fee', where: { file, line }, says, evidence }
renderReview(review);   // the Markdown for a pull request comment
```

It is pure and browser-safe: pass the files that changed (both paths for a moved file), or whole trees. Thunder Core
programs are compared when you pass the comparison in, from `/program` (it brings the Core compiler and engine, so
`/core` stays small without it), with the unchanged files of their projects so tests run and what uses a change is
found:

```js
import { coreChanges, affectedBy } from '@skillstech/thunderlang/program';

thunderReview(before, after, { core: coreChanges, context: { old: projectBefore, new: projectAfter } });

coreChanges(oldFiles, newFiles).changes;   // [{ id: 'function:decide refund', change: 'affected', says, behaviour, affects }]
affectedBy(files, 'review limit').tests;   // the tests that reach it, each with its file, line, and the rules in between
```

Coding agents get the same through the MCP server: `intent_core_changes` (both versions in) and `intent_affected` (a
project folder and a rule's name). Both are local only.

## What it does not do yet

- In Thunder Core programs: endpoints, and functions that use saved data or call another service, are listed but not
  run. Behaviour across services (which other services call a changed endpoint) is next. Inputs are made for plain
  values and data types; a function that takes a list of records or a map is not run yet, and says why.

- Infrastructure (Terraform, Bicep, Kubernetes, Compose) and pipelines are flagged for a person to check, not read.
- Thunder's words leave some details out (a call's arguments, some values). When the words read the same but the code
  differs, it says "Changed, check" with the code before and after, rather than "same".
- Reordered steps are shown as changed steps; they are not proven independent.
- A function that was renamed and also changed is shown as removed and new, not paired.
- Code outside the actions and rules Thunder reads (values at the top of a file, imports, a function it did not read
  as one) is shown as a changed block of code with the before and after, not explained in sentences.
- Pull requests that touch hundreds of files give long reviews; the same sentence about many functions is said once,
  and the comment is cut short at GitHub's size limit (run it locally for everything).
