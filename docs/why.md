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
What happened
  The agent "support-bot" stopped with a problem after 12 seconds.
  It was asked: "Please refund order 1042, it arrived broken."

What went wrong
  Step 6, part of step 5 "refund_payment". Called POST pay.example.com/v1/refunds: it couldn't reach the service. It tried 3 times, then stopped.
  Just before, step 4: Asked the AI (claude-sonnet-5-5), which decided to use "refund_payment".
  If any of the 3 tries had worked, the run would have gone past this step. Thunder can't say what the agent would have done next.
  What to do next: Check that the service is running and its address is right.
  Details: POST https://pay.example.com/v1/refunds · requests.exceptions.ConnectionError · HTTPSConnectionPool(...) · span b2d4f6b8

What it changed
  Step 5. Tried to change, but it did not work: Used "refund_payment" with order_id 1042, amount 40.00, api_key (hidden) (judged from the tool's name). The record can't show whether anything was partly done.

Step by step
  ✓ 1. Asked the AI (claude-sonnet-5-5), which decided to use "lookup_order".  +0.0s
  ✓ 2. Used "lookup_order" with order_id 1042: it worked.  +1.2s
     ✓ 3. Called GET orders.internal/api/orders/1042: the service answered 200.  +1.2s
  ✓ 4. Asked the AI (claude-sonnet-5-5), which decided to use "refund_payment".  +1.7s
  ✗ 5. Used "refund_payment" with order_id 1042, amount 40.00, api_key (hidden): it stopped because step 6 did not work.  +3.2s
     ✗ 6. Called POST pay.example.com/v1/refunds: it couldn't reach the service (3 tries).  +3.2s

How sure: everything above is read from the agent's record (9 recorded steps, run a1b2c3d4). Thunder ran nothing and used no AI. Values that look like secrets are hidden. See one step in full with --step <n>.
```

## Commands

```sh
thunder why run.json              # the story
thunder why run.json --step 5     # everything the record says about step 5 (arguments, result, error)
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
- **Changes.** A step changes something when the record says so by its kind: `POST`/`PUT`/`PATCH`/`DELETE` requests,
  database `INSERT`/`UPDATE`/`DELETE` and similar, or a tool whose name starts with a changing verb (`send_email`,
  `refund_payment`, `cancelSubscription`). Each change says how it was judged. A tool whose name says neither
  (`run_python`) is listed as "could not judge", never as safe. A change that failed is never reported as done, and
  the record can't show whether it was partly done, so Thunder says that too.
- **Errors in plain words.** "It couldn't reach the service", "It wasn't allowed to do that", "A value it needed was
  empty". The original error stays on the `Details` line and in `--step`.
- **Secrets are hidden**: values under names like `password`, `token`, `api_key`, `authorization`, and values
  shaped like keys (`sk-…`, `ghp_…`, `Bearer …`, JSON web tokens).

## Limits

- Only what was recorded counts. A step the agent took without recording it is invisible to Thunder.
- "Changes" are judged from names and methods when the record doesn't say. A tool named `get_and_delete` is read as
  `get` (the first verb). Use `--step` to see what the tool actually received.
- The agent's own words ("which answered …") are quoted, not checked.
