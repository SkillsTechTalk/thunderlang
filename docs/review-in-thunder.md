# Review in Thunder

A pull request is usually approved by reading a code diff: which lines moved. Review in Thunder says what the change
does instead, in short sentences a person who does not read the programming language can check:

- "Now stops with 403 Forbidden ("forbidden") when the x-admin-secret header is not the ADMIN_SECRET setting."
- "Late fee: the limit between Small fee and Big fee moved from 7 to 10 days late", with a case run on both versions:
  8 days late gave Big fee, and now gives Small fee.
- "No longer stops with HTTPException ("The user with this email does not exist in the system.") when user is not
  set. Check that this is no longer needed."
- "Only the form changed: only names it declares itself changed (sum is now total); the code is otherwise identical."

Every sentence is read from the code by the Thunder compiler, with no AI, and each one has the before and after behind
it. The full list of what is compared is in [the spec, section 14](/docs/spec).

## On your computer

```bash
npx --package @skillstech/thunderlang thunder review main HEAD      # Markdown, as a pull request comment
npx --package @skillstech/thunderlang thunder review main --json    # main against your working tree, as JSON
```

`thunder review <base-ref> [head-ref]` reads both versions from git (`git diff`, `git show`; nothing is fetched,
nothing is run). Without `head-ref`, the new side is your working tree, including new files git does not track yet.
`--out review.md` writes the Markdown to a file.

The summary comes first, then the items, most important first:

| Group | What it means |
| --- | --- |
| **Needs a careful look** | A Stop was removed or now happens under different conditions; the address changed; it now reaches outside the program (another service, a payment, an email, stored data); or Thunder cannot read the changed code, an infrastructure file, or a pipeline. |
| **Changes in meaning** | Anything else that changes what the code does: new Stops, a rule's limits and answers, inputs, what it gives back, what it relies on, new and removed functions, records, imports. |
| **Only the form changed** | Shown, not guessed: the same code apart from spacing, comments, or names the function declares itself; a rule with the same answer on every edge case; a renamed or moved function with the same code. |

## In a pull request

The Thunder review action runs `thunder review` on the pull request's base and head, keeps one comment up to date (it
finds its own comment by the line `<!-- thunder-review -->`), and writes the review to the job summary. It is one step:

```yaml
      - uses: actions/checkout@v4
      - uses: SkillsTechTalk/thunderlang@main
```

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

It is pure and browser-safe: pass the files that changed (both paths for a moved file), or whole trees.

## What it does not do yet

- Infrastructure (Terraform, Bicep, Kubernetes, Compose) and pipelines are flagged for a person to check, not read.
- Thunder's words leave some details out (a call's arguments, some values). When the words read the same but the code
  differs, it says "Changed, check" with the code before and after, rather than "same".
- Reordered steps are shown as changed steps; they are not proven independent.
- A function that was renamed and also changed is shown as removed and new, not paired.
- Code outside the actions and rules Thunder reads (values at the top of a file, imports, a function it did not read
  as one) is shown as a changed block of code with the before and after, not explained in sentences.
- Pull requests that touch hundreds of files give long reviews; the same sentence about many functions is said once,
  and the comment is cut short at GitHub's size limit (run it locally for everything).
