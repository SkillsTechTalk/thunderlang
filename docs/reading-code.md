# Read code you don't know

You can understand what an application decides without knowing its language. ThunderLang reads the decision rules in a codebase and shows each one three ways: in plain English, in ThunderLang, and rewritten in a language you already know.

It works on TypeScript, JavaScript, Python, Go, Rust, C#, Java, Kotlin, PHP, and Ruby. It runs deterministically, with no AI, in your browser at [/read](/read), in your terminal, and inside coding agents.

## What you get

For every function in a file, the reader reports one of four kinds of item:

| Kind | What it means |
| --- | --- |
| Decision | The function chooses between fixed answers. You get its rules, top to bottom, as "If ..., the answer is ...". |
| Function | The function does other work. You get its inputs and output, and the lines it could not turn into rules. |
| Error | An error the code raises. |
| Test | A test found in the file. |

A decision reads like this, from Java you may never have written:

```text
If creditScore is less than 500, the answer is Decline.
Otherwise, if amount is at most 5000 and creditScore is at least 700 and verifiedIncome, the answer is Approve.
Otherwise, the answer is Review.
```

## A whole repository

Point the reader at a folder and it reads every supported file into one index you can search. On [/read](/read), choose **A whole folder**: the files are read in your browser and nothing is uploaded. In the terminal, pass a folder instead of a file.

Beyond decisions, a repository reading includes:

- **Routes**: HTTP handlers named by method and path, such as `POST /refunds`. It recognizes Express, Fastify, and similar `app.get(...)` handlers, Go `HandleFunc` and router methods, Python `@app.get` and `@app.route`, Spring `@GetMapping`, ASP.NET `[HttpGet]`, and NestJS `@Get()`.
- **Checks**: early exits inside any function, read as rules. For example: "Responds 401 if not req.user", "Fails with InsufficientFunds if balance is less than amount", "Stops early and returns nothing if not order". Routine Go error passing (`if err != nil { return err }`) is left out because it is plumbing, not a rule.

Two filters answer the questions people new to a codebase ask most:

- **Answer**: where does the code decide `Decline`, respond `401`, or fail with `NotFoundError`?
- **Input**: which rules use `creditScore`?

```bash
thunder read .                                   # a summary and the answers the code gives
thunder read . --kind route                      # every HTTP route
thunder read . --kind route --answer 401         # routes that can respond 401
thunder read services --answer Decline --in python
thunder read . --input creditScore --lang java,go
thunder read . --path payments/ --json
```

Dependency and build folders (`node_modules`, `vendor`, `target`, `dist`, `build`, virtual environments, and similar) are skipped, along with type declarations and minified files. Generated files and files over 400 KB are listed as skipped, with the reason.

## In your terminal

```bash
thunder read LoanPolicy.java
thunder read src/billing.go --search refund
thunder read fraud.rs --kind decision --in python
thunder read grading.py --json
```

- `--search` keeps items whose name, inputs, conditions, answers, or plain-English reading contain every word you give.
- `--kind` keeps only `decision`, `function`, `error`, or `test` (comma-separated).
- `--in` rewrites each decision in `typescript`, `python`, `go`, `rust`, `csharp`, or `java`.
- `--from` sets the source language when the file extension does not.

## Try a rule: what if?

`thunder try` runs one rule from your code on values you choose, and shows the answer and why, check by check.

```text
$ thunder try register.ts --with "age=15, parent approved=no"
Answer: Declined
Why:
  ✗ the age is at least 18  (it is 15), so not Allowed
  ✗ it is parent approved  (no), so not Allowed
  → none of the rules matched, so: Declined (otherwise)
```

Without `--with`, Thunder asks for each value and offers to try another case. `--focus "<rule>"` picks a rule when
a file has several, and `--json` gives the result as data. Only rules can be tried: a rule decides and changes
nothing. An action (which may save, send, or call other code) is refused, with the command to read it instead. A rule
more complex than comparisons and yes/no checks is refused too, with the reason; Thunder never approximates it.
The answer comes from the same engine as the [rule editor](/try).

## In a coding agent

The `intent_read` MCP tool takes the same options (`query`, `kinds`, `in`). For a repository, `intent_read_repo` takes a folder plus the same filters as the terminal (`kinds`, `languages`, `folder`, `answer`, `input`). It reads your local files, so it runs only in local agents such as Claude Code and Codex, never on the hosted endpoint. Ask your agent "what does this file decide?" and it can answer from the reading instead of guessing. See [ThunderLang for AI agents](/docs/mcp) to connect Claude Code, Codex, or ChatGPT.

## Share a reading

Every reading on the site has a **Copy link to this reading** button. The link opens the same function at the same level (Big Picture, Flow, Details, Text, or Original) for anyone who opens it.

- **A public GitHub file:** `https://thunderlang.dev/r/<owner>/<repo>/<branch, tag, or commit>/<path>?fn=<name>&level=<level>`. The reader's own browser fetches the file from `raw.githubusercontent.com` and reads it with the Thunder compiler. Nothing is sent to or stored by thunderlang.dev. Files up to 300 KB, public repositories only. A link to a commit always shows the same code; a link to a branch shows the file as it is now. Open one by pasting a GitHub address at [thunderlang.dev/r](https://thunderlang.dev/r).
- **Pasted code:** the code is compressed into the link after the `#` (`/r#code=…`). Browsers never send that part of a link to a server, so the code stays between you and the person you send it to. Code that would make the link longer than 8,000 characters can't be shared this way. Thunder says so instead of storing it somewhere.
- `fn` names the function: `send`, or `Session.send` for a method, plus `@<line>` when a file uses the same name twice (`BooleanUtils.toBooleanObject@851`).
- The preview image a chat app shows is drawn from the names in the link only (repository, file, function, level). It never includes the code.

## Famous code, read in Thunder

The [gallery](https://thunderlang.dev/gallery) shows functions from well-known open-source projects (Flask, Requests, Express, axios, NestJS, Go's `net/http`, fd, Apache Commons Lang, Json.NET, Redis, and the Sakila sample database), each pinned to a commit. Only the one source file each function lives in is kept on the site, with its license. Its readings aren't stored: the site reads those files with the current compiler at every build, so the pages improve when the reader does. A gallery page fails the build if the compiler can no longer find its function. Each page shows how many steps Thunder put into words and how many it shows as code. Every entry was checked by hand against its code, and readings that said something false or misleading were left out.

## What it reads, and what it does not

The reader recognizes the common ways code chooses an answer:

- `if` / `else if` / `else` chains that return a fixed value
- ternaries (`cond ? A : B`) and Python's `A if cond else B`
- Rust and Go tail forms such as `if cond { A } else { B }`
- `switch` and `match`: C-style switches with fall-through (TypeScript, JavaScript, Java, C#, Go), Java arrow switches (`case A, B -> "X"`), C# switch expressions with relational patterns (`>= 90 => "A"`), Go switches with no subject, Rust `match` with `|`, ranges (`1..=5`), and `if` guards, and Python `match`/`case`. A switch where any case does real work is listed as not read, rather than half-shown.
- Kotlin: functions with block or expression bodies (`fun f(x: Int) = ...`), `if` used as a value, `when` with and without a subject (values, `in 1..5`, `until`, `else`), `require` and `check` as checks, `throw` without `new`, and Ktor and Spring routes.
- PHP: `$variables` and `->` fields, `elseif`, `switch`, PHP 8 `match` (including `match(true)`), `throw`, Laravel `abort`, `abort_if`, and `abort_unless`, and Laravel `Route::post(...)` and `#[Route]` routes.
- Ruby: implicit returns (the last value is the answer), modifier `if` and `unless` (`return :review if amount > 1000`), symbols, `case`/`when` with ranges (`90..100` includes 100, `80...90` does not), `raise`, Rails `head` and `render status:`, and Sinatra routes. Predicate methods such as `user.admin?` read as the field `user.admin`; `nil?`, `empty?` and similar are not guessed and are shown as written.

Conditions can use comparisons, `&&`, `||`, `!`, `and`, `or`, `not`, parentheses, literals, inputs, and fields such as `order.total`. Java's `equals` becomes `==`, and enum answers such as `Verdict::Block` read as `Block`.

Anything else is listed under "Not read" with the line and the reason. That includes answers that are computed, conditions that call functions with arguments, loops, and side effects. The reader never fills a gap with a guess.

## Turn a reading into a rule

A reading tells you what the code does. To make that a rule the code must keep following, promote the decision to a contract. On [/read](/read), choose **Turn into a contract** on any decision. In the terminal:

```bash
thunder read LoanPolicy.java --promote decide --out Decide.thunder-human
```

The contract restates the rule in the readable notation and adds starter examples chosen where mistakes hide: one per rule, one for the fallback, and both sides of every number the rule compares against (for example `creditScore` at 499 and 500). Field paths such as `order.total` become plain inputs such as `orderTotal`, with a comment mapping them back.

The examples' answers are computed from the code, so they record what the code does **today**. That is the point: if someone later changes `creditScore < 500` to `creditScore <= 500`, the example at 500 fails. But it also means a bug in the code is copied into the examples. Have a person confirm each answer and change any that are wrong before you rely on the contract.

Then turn it into standard ThunderLang and check every change against it:

```bash
thunder human Decide.thunder-human --format source > Decide.thunder
thunder test Decide.thunder
```

Contracts answer with names, so a decision that returns numbers or computed values cannot be promoted yet. The tool says why.

## Read the result as inferred

A reading is inferred from code by pattern, not by running it. It tells you what the code appears to decide, not what anyone meant it to decide. To make a rule the source of truth, copy its ThunderLang into a `.thunder` file, add examples, and have a person approve it. From then on, `thunder verify-diff` checks every change against it.
