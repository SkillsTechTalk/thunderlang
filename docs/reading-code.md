# Read code you don't know

You can understand what an application decides without knowing its language. ThunderLang reads the decision rules in a codebase and shows each one three ways: in plain English, in ThunderLang, and rewritten in a language you already know.

It works on TypeScript, JavaScript, Python, Go, Rust, C#, and Java. It runs deterministically, with no AI, in your browser at [/read](/read), in your terminal, and inside coding agents.

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

## In a coding agent

The `intent_read` MCP tool takes the same options (`query`, `kinds`, `in`). For a repository, `intent_read_repo` takes a folder plus the same filters as the terminal (`kinds`, `languages`, `folder`, `answer`, `input`). It reads your local files, so it runs only in local agents such as Claude Code and Codex, never on the hosted endpoint. Ask your agent "what does this file decide?" and it can answer from the reading instead of guessing. See [ThunderLang for AI agents](/docs/mcp) to connect Claude Code, Codex, or ChatGPT.

## What it reads, and what it does not

The reader recognizes the common ways code chooses an answer:

- `if` / `else if` / `else` chains that return a fixed value
- ternaries (`cond ? A : B`) and Python's `A if cond else B`
- Rust and Go tail forms such as `if cond { A } else { B }`

Conditions can use comparisons, `&&`, `||`, `!`, `and`, `or`, `not`, parentheses, literals, inputs, and fields such as `order.total`. Java's `equals` becomes `==`, and enum answers such as `Verdict::Block` read as `Block`.

Anything else is listed under "Not read" with the line and the reason. That includes answers that are computed, conditions that call functions with arguments, loops, and side effects. The reader never fills a gap with a guess.

## Read the result as inferred

A reading is inferred from code by pattern, not by running it. It tells you what the code appears to decide, not what anyone meant it to decide. To make a rule the source of truth, copy its ThunderLang into a `.thunder` file, add examples, and have a person approve it. From then on, `thunder verify-diff` checks every change against it.
