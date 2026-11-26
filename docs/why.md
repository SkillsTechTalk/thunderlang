# Thunder Why: what an AI agent did, in plain words

An AI agent ran and something happened. Maybe it stopped, maybe it did something you didn't expect, or maybe you
just want to know what it did before trusting it. `thunder why` reads the record the run left behind and tells you,
in plain words:

- what the agent was asked, and what it answered;
- **what went wrong**: the step that failed, what happened just before, and what would have changed the outcome;
- **what it changed**: every step that changes something, and whether it worked;
- each step in order, with how long into the run it happened.

Nothing is run and no AI is used. Every sentence comes from the record, and you can open any step in full.

```text
$ thunder why run.json
✗ The agent "support-bot" stopped after 12 seconds.
  Asked: "Please refund order 1042, it arrived broken."

  Why:      It couldn't reach the service (pay.example.com), while using "refund_payment". It tried 3 times.
  Did:      Tried to move money with "refund_payment" (guessed from its name). It did not go through, but may have partly happened.
  Next:     Check that the service is running and its address is right.

  Every step: thunder why run.json --steps
```

`--steps` gives the whole story: every step in order with how long into the run it happened, what happened just
before the problem, what would have changed the outcome, and the original error.

## Commands

```sh
thunder why run.json              # the short story
thunder why run.json --steps      # every step, and what happened just before the problem
thunder why run.json --step 5     # everything the record says about step 5 (arguments, result, error)
thunder why run.json --tools tools.json   # the agent's MCP tool list: what each tool declares it does
thunder why run.json --allow read,send    # flag anything else; exits 1 if the run went beyond it
thunder why run.json --json       # the same, as data, for tools and editors
thunder why run.json --run 1111   # a file with several runs: pick one by the start of its id (default: the latest)
cat run.json | thunder why -      # read standard input
```

## Where the record comes from

Most agent frameworks can already record their runs as **OpenTelemetry traces**. `thunder why` reads them:

| What you have | How it is read |
|---|---|
| An OTLP JSON export (`{ "resourceSpans": [...] }`) | As is |
| The OpenTelemetry Collector's file exporter (one JSON object per line) | Each line |
| The Python SDK's console exporter (`ConsoleSpanExporter`) | The printed objects, one after another |
| A JSON array of spans (OpenInference / Phoenix, and similar) | Each span |

It understands the OpenTelemetry **GenAI** conventions (`gen_ai.operation.name`, `gen_ai.agent.name`,
`gen_ai.tool.name`, `gen_ai.tool.call.arguments`, `gen_ai.input.messages`, `gen_ai.output.messages`,
`gen_ai.response.finish_reasons`), the **OpenInference** conventions (`openinference.span.kind`, `tool.name`,
`input.value`, `llm.output_messages.*`), and the plain **HTTP** and **database** conventions. A span it does not
recognize is shown as its name; a wrapper span (a chain, a function) is left out unless it failed and nothing inside
it explains why.

## How Thunder decides

- **The problem** is the last step that failed and that no later step recovered from. If the run carried on after a
  failure, it is listed under "Problems along the way" instead.
- **Tries.** Back-to-back attempts at the same thing, where the earlier ones failed, are one step: "it couldn't reach
  the service (3 tries)", or "it worked on the second try (before that, it asked too often…)".
- **What would have changed the outcome** is said only as far as the record supports it: "if this step had worked,
  the run would not have stopped here". Thunder never guesses what the agent would have done next.
- **What it did to the world.** Each step that does something gets one kind, most serious first: **moves money**,
  **deletes**, **sends**, **creates**, **changes**, **reads**. The kind comes from the strongest evidence the record
  has, and the short story says which when it is not plain fact:
  1. what the tool **declares**: its MCP annotations (`--tools`, with `readOnlyHint` / `destructiveHint`), or a
     `thunder.effect` attribute on the span ("the tool says so": it is the tool's own claim);
  2. the HTTP **request method** (`GET` reads, `DELETE` deletes, `POST`/`PUT`/`PATCH` change) or the **database
     operation** (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, and similar);
  3. the tool's **name**: every word counts and the most serious wins, so `get_and_delete` deletes and
     `lookupThenRefund` moves money ("guessed from its name").
  A tool whose name says nothing (`run_python`) is listed as "can't tell what it does", never as safe. A step that
  failed is never reported as done; it may have partly happened, so Thunder says that too.
- **Allowed kinds.** `--allow read,send` names every step that went beyond them ("\"refund_payment\" tried to move
  money. Only read and send are allowed.") and exits 1, so a pipeline can stop on it.
- **Errors in plain words.** "It couldn't reach the service", "It wasn't allowed to do that", "A value it needed was
  empty". The original error stays on the `Details` line and in `--step`.
- **Secrets are hidden**: values under names like `password`, `token`, `api_key`, `authorization`, and values
  shaped like keys (`sk-…`, `ghp_…`, `Bearer …`, JSON web tokens).

## Limits

- Only what was recorded counts. A step the agent took without recording it is invisible to Thunder.
- Without `--tools` or `thunder.effect`, a tool's kind is a guess from its name, and the short story says so. Use
  `--step` to see what the tool actually received.
- The agent's own words ("which answered …") are quoted, not checked.
