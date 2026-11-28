# Thunder review on every pull request

The Thunder review action reads each pull request and keeps **one comment** on it that says what the change does, in
plain sentences, next to the code diff your team already reads. It is one step in a workflow file. It runs entirely in
your own GitHub Actions job: no code leaves GitHub, and no AI is called.

## Add it

Create `.github/workflows/thunder-review.yml` in your repository:

```yaml
name: Thunder review
on:
  pull_request:

permissions:
  contents: read         # read the two commits
  pull-requests: write   # post and update the one review comment

jobs:
  thunder-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: SkillsTechTalk/thunderlang@main
```

That is all. On the next pull request, the comment appears; each push updates the same comment instead of adding a new
one. The review is also written to the job summary (the run's **Summary** page), which has room for everything.

GitHub-hosted runners have Node.js 20, which the action needs. On a self-hosted runner without it, add
`actions/setup-node@v4` with `node-version: 20` before the action. `@main` follows the latest code. For production CI,
pin a commit instead (`SkillsTechTalk/thunderlang@<full commit SHA>`), and set `version:` to the
`@skillstech/thunderlang` release you have tested.

## Options

```yaml
      - uses: SkillsTechTalk/thunderlang@main
        with:
          comment: true          # false: only write the job summary
          fail-on: none          # risk: fail the job when something needs a careful look
          paths: 'src/**, api/*.py'   # only review files matching these globs
          version: 1.7.0         # the @skillstech/thunderlang version that reads the code
          # base: <sha>          # default: the pull request's base commit
          # head: <sha>          # default: the pull request's head commit
```

| Input | Default | What it does |
| --- | --- | --- |
| `comment` | `true` | Post the review as one pull request comment, found again by the hidden line `<!-- thunder-review -->` and updated in place. |
| `fail-on` | `none` | `risk` fails the job when the review has anything under **Needs a careful look**. The comment is posted first. |
| `paths` | every changed file | Globs separated by commas or new lines. `*` stays inside one folder, `**` crosses folders, and a pattern without a `/` matches the name in any folder. |
| `version` | the compiler released with this action | The [@skillstech/thunderlang](https://www.npmjs.com/package/@skillstech/thunderlang) version, run with `npx`. |
| `base`, `head` | the pull request's two commits | Compare any two commits instead. |

Outputs, for later steps: `says` (the summary line), `risks`, `meaning`, `cannot-check`, `comment` (created, updated,
skipped, or failed), `comment-url`, and `markdown-file` (the review as Markdown).

## What it posts

```text
### Thunder review: what this change does, in plain sentences

**18 changes in meaning, 1 risk, 0 form-only.**

16 changes explained in sentences · 2 shown as code (Thunder did not put them into words) · 1 Thunder cannot check (check it yourself).

#### Needs a careful look (1)
- Read and 4 more · src/requests/_types.py:29
  - Thunder cannot read this yet, and its code changed: check the code itself.

#### Changes in meaning (18)
- Encode files · src/requests/models.py:243
  - Sets fdata to fp under different conditions: now when … the answer to "_t.has read(fp)?" is no …
  - Other steps changed too, check the before and after.
- Has read · src/requests/_types.py:32
  - New function: Has read: takes obj; gives back a TypeIs[SupportsRead[str | bytes]].
…
```

(Shortened from a real run on two adjacent commits of `psf/requests`.)

- **The summary line** is the review's own count: changes in meaning, risks, and changes where only the form changed.
- **The counts line** says how each change reached you: explained in sentences, shown as the code before and after
  (Thunder's words would leave something out), or not checked at all (an infrastructure file, a pipeline, or code
  Thunder cannot read yet), so a person has to look. Files Thunder does not read at all are listed at the end.
- **Needs a careful look** comes first: a Stop removed or under new conditions, an address that changed, code that now
  reaches outside the program, and everything Thunder cannot check.
- **Changes in meaning** follow, one entry per changed action, rule, or function, with every change to it underneath and
  a link to the line. The code before and after is folded under **Before and after**.
- **Only the form changed** is folded. It is said only when it is shown: the same code apart from spacing, comments, or
  names the function declares itself, or a rule that gives the same answer on every edge case, run on both versions.
  The comment never calls different code the same and never calls a change safe.

GitHub limits a comment to 65,536 characters. A long review keeps whole entries, in order of importance, and ends with
**N more not shown**; the job summary and `thunder review` on your computer have all of them.

## Pull requests from forks

GitHub gives workflows on pull requests from forks (and from Dependabot) a read-only `GITHUB_TOKEN`, so no comment can be
posted there. The action notices a fork, writes the review to the job summary only, and says so at the top of the
summary. It never needs `pull_request_target`, which would run with write access on code you have not reviewed yet.
If a same-repository pull request cannot be commented on either (for example, the workflow has no
`pull-requests: write`), the job still passes, the summary says why, and the log has a warning.

## Privacy

- It runs entirely in your own CI job, on your runner. No code leaves GitHub.
- No AI is called, and no Skills Tech Talk server is contacted. The only downloads are the action itself and the
  compiler from npm.
- Code in other languages is never run: Thunder reads the two versions of the changed files with `git show` and
  compares them. Thunder Core programs (`.thunder`) are run on the Thunder engine inside the review, to compare their
  answers: the engine runs Thunder only (a program that uses a Python, npm, or .NET module is not run), and it cannot
  read files, call other services, or keep data. Each call has a step limit and the comparison a time limit; a
  program in a pull request can still use the job's own time and memory up to those limits.
- The only write is the one comment, through GitHub's REST API with the workflow's own token.

## On your computer

The same review, without GitHub:

```bash
npx -y @skillstech/thunderlang review main HEAD                      # Markdown
npx -y @skillstech/thunderlang review main HEAD --json               # JSON (thunder-review-v1)
npx -y @skillstech/thunderlang review --base main --head HEAD --format markdown --paths 'src/**'
```

`--base`, `--head`, `--format`, and `--paths` are in the release after 1.0.4; the first two forms work in 1.0.4. What is
compared, and what Thunder does not read yet: [Review in Thunder](/docs/review-in-thunder).
