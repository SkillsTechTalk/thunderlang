# Verifying AI Code Changes

In the AI age, writing code is cheap. **Trusting** it is not. An agent can produce a 4,000-line
change in a minute; the bottleneck is knowing it still does what you committed to and never does
what you forbade. That is the job ThunderLang is built for , and `thunder verify-diff` is where the
loop closes.

The workflow it enables:

> a human states intent → an AI proposes a change → **ThunderLang proves, deterministically,
> which guarantees and never-rules the change upholds or breaks** → the change is blocked if it
> broke a commitment.

No AI runs in the check. It cannot prove a change is *correct* , tests and humans still own that.
What it does is catch, with zero ambiguity, the mechanical violations AI diffs actually ship: a
secret written to a log, a declared input dropped from a signature, a guarantee whose evidence
the change quietly removed.

## Run it

```bash
intent verify-diff CreateInvoice.thunder --before old.ts --after new.ts
```

Given the intent:

```
mission CreateInvoice
use product
never expose the payment token in logs
  verify a secret-scan of log output
input
  orderId: OrderId
  paymentToken: Secret
```

and a change that adds `console.log("charging with token", paymentToken)`, the gate blocks:

```
intent verify-diff CreateInvoice.thunder vs new.ts: BLOCK (1 blocking, 1 regression)
  [VIOLATION] Added code may violate never-rule "expose the payment token in logs":
              console.log("charging with token", paymentToken);  (line 3)
```

Exit code is non-zero on `BLOCK`, so it drops into CI or an agent loop as a hard gate. Pass
`--json` for the structured verdict.

## The two signals that make it a *diff* check

1. **Regressions.** A guarantee or input that was satisfied on `--before` but is broken on
   `--after` is the change's fault , and blocks. Pre-existing gaps (things that were already
   unsupported) are reported but do **not** block, so the gate only fails on what the change
   actually broke.
2. **Guardrail hits.** ThunderLang reads each never-rule for the sensitive thing it protects
   (`token`, `secret`, `password`, `ssn`, `pii`, ...) and scans the lines the change **added**
   for that value reaching a sink (a log, a response, a print). A match is a probable violation,
   located to the line.

Without `--before`, it verifies the current code fresh , useful for a first gate on new code.

## Honest by design

`thunder verify-diff` is deliberately humble, in the same spirit as [IntentLift](/docs/adopting-thunderlang):
it reports what it can prove deterministically and does not dress a heuristic up as a proof. A
`PASS` means "the change did not break the contract's mechanical checks," not "the change is
correct." Correctness is still earned by the guarantees' own verification , the tests you
declared with `verify` , and by a human. What the gate guarantees is that the cheap, common,
high-cost mistakes never merge unnoticed.

## In the loop

This is what lets an AI move fast without breaking intent: the agent proposes, the gate checks
against the committed contract, and a violation sends the change back before it lands. Intent
stops being documentation and becomes the thing generated code is measured against.

## Give the agent the tools directly (MCP)

The cleanest way to close the loop is to let the agent call ThunderLang itself. `thunder mcp`
starts a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio, so a
coding agent (Claude Code, Cursor, ...) uses ThunderLang natively , no wrapper. Point an MCP
client at the command:

```json
{
  "mcpServers": {
    "thunderlang": { "command": "intent", "args": ["mcp"] }
  }
}
```

The server exposes the deterministic capabilities an agent needs:

| Tool | For |
| --- | --- |
| `intent_verify_diff` | **the gate** , check a proposed change against its intent before shipping |
| `intent_draft` | turn a structured brief into a rigorous intent draft + a gap checklist |
| `intent_check` | run diagnostics on intent source |
| `intent_lift` | bootstrap intent from existing code (11 languages) |
| `intent_run` / `intent_test` | evaluate a decision / run in-file tests |
| `intent_graph` / `intent_explain` | the canonical graph / explain a diagnostic code |

An agent's workflow becomes: draft or read the intent (`intent_check`), propose a change, and
**call `intent_verify_diff` on its own output** , refusing to ship on a `BLOCK`. ThunderLang
becomes part of how the agent thinks, not a step someone remembers to run.
