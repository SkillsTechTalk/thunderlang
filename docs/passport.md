# The Thunder Software Passport

A **passport** is a portable, machine-readable record of what is known about a feature or a change: what it does,
what it depends on and changes, the **evidence** for each claim, and what is **not verified**. It is
`thunder-passport-v1` JSON, with a Markdown rendering for people.

**A passport is not a certificate that the code is correct.** It is an evidence manifest. Every claim says what it rests on
(a command and its exit code, or a source location), what it does not cover, and which files it depended on, by content
hash. When one of those files changes, the claim is **stale**, and `thunder passport check` says so without re-running
anything.

```sh
# A change: what changed since a base commit, with each part's tests run and recorded
thunder passport web orders billing --base main \
  --purpose "Prevent duplicate charges when a payment request is retried." \
  --run "billing: python3 -m unittest" --run "orders: dotnet test" --run "web: npm test" \
  --out passport.json --md-out passport.md

# Later: which claims are still about the code as it is now?
thunder passport check passport.json
```

Each folder is one **part** (a service or a repository), as for `thunder trace`. `--run "part: command"` runs a
command in that part's folder; a command with no part runs in the current folder and depends on every part. Only git
and the commands you pass with `--run` are executed. Exit codes: 0 built; 1 when a `--run` command failed (the
passport still records the failure); 2 for a usage mistake. A worked example is in
[demo/checkout](../demo/checkout/README.md#the-changes-passport).

## The sections

| Section | What it holds | Where it comes from |
|---|---|---|
| `purpose` | What the change or feature is for, and where that was said | Only what you give (`--purpose`, `--purpose-file`). Otherwise `"not stated"`: Thunder never guesses a purpose. |
| `behavior` | The actions and rules, as Thunder Text, each with its part, file, and line range | The reader. In a change, only those whose lines changed (marked added or changed); test code is evidence, not behavior. |
| `dependencies` | Every file read, with its content hash; links between parts with both source lines; packages; services called | Thunder Trace and the parts' manifests (`package.json`, `requirements.txt`, `.csproj`). |
| `effects` | What the code reads, writes, sends, deletes, or asks another part for, with file and line | The reader's classification of each step, marked `detected` (read from code). Never `observed` without a run that saw it, and never `declared` unless a contract declares it. |
| `evidence` | The claims, each with `kind`, `status`, `claim`, `basis`, `scope`, and `inputs` | Commands run (`test-run`), Trace links (`trace-link`), the review of both versions (`review`), the ownership check (`access-flow`), and items other tools supply (`accuracy-gate`, `conformance`…) |
| `unknowns` | Steps shown as code instead of words; calls Thunder could not link; parts no test ran in; and `notVerified` | The reader and Trace, plus a `notVerified` list that is always present |
| `history` | Base and head commits, the changed files, the Thunder version, and when it was built | git |

`summary` counts the claims (passed, failed, read from code), the unknowns, and what is not verified. `fingerprint`
is a SHA-256 of everything except the build time, so the same inputs give the same fingerprint.

## The evidence rules

- **Nothing is verified without an evidence item.** A claim with no command behind it is `read` ("read from code, not
  run"), never `passed`.
- **A command that fails is recorded as failed**, with its exit code and the last lines it printed, and its claim is
  added to `notVerified`. It is never dropped.
- **Every item says what it does not cover** (`scope`). A passing test run says that Thunder did not measure which
  lines or paths the tests exercise; a Trace link says it does not show that the call succeeds.
- **Every item lists its inputs**: the files it depended on, by content hash. A test run depends on every file in its
  part; a link, on the two files at its ends; the review, on the changed files.
- **`notVerified` always lists** deployment, real external services, more than one process or machine, and load. A
  passport cannot remove these: only an evidence item that tests one could.

## Staleness

`thunder passport check passport.json` (or `checkPassport` in code) re-hashes each item's inputs:

- **current**: every file it depended on is unchanged.
- **stale**: a file changed or is gone. The check names each one.
- **unknown**: the item recorded no inputs.

Nothing is re-run. A stale claim is not evidence about the code as it is now: build a new passport to run it again.
Part folders are found from the paths the passport recorded, relative to the passport file (`--part name=folder`
points one elsewhere).

## Using it from code

```js
import { buildPassport, checkPassportOnDisk } from "@skillstech/thunderlang";          // folders, git, runs (Node)
import { assemblePassport, checkPassport, renderPassportMarkdown } from "@skillstech/thunderlang/core"; // pure, browser-safe
```

`assemblePassport` takes parts that are already read (file contents), runs that were already made, and a purpose. It is
deterministic. `checkPassport(passport, { read })` takes a function that returns a file's current text. A tool that
cannot run git or commands, such as a browser, can still assemble and check passports.

**The ownership check.** When this build has `thunder read --access` (src/flow/access.mjs), `thunder passport` runs it on
each part and adds one `access-flow` item per route with a verdict: guarded, unguarded, or cannot tell. `--no-access`
leaves these out. A saved `thunder-access-v1` report can also be passed with `--evidence report.json`.

## What a passport is not

- It is not a proof of correctness, a security sign-off, or an approval. It records evidence and its limits.
- It does not judge whether tests are good. It records that they ran, what they printed, and their exit code.
- It does not observe production. Effects are read from code, and runs are the commands you gave.
- It does not decide what the change is for. The purpose is what a person stated, or "not stated".
