# Verifying AI Code Changes

In the AI age, writing code is cheap. **Trusting** it is not. An agent can produce a 4,000-line
change in a minute; the bottleneck is knowing it still does what you committed to and never does
what you forbade. That is the job ThunderLang is built for: **prove that real code matches the
declared intent**, deterministically, and gate the merge on it.

The loop, end to end:

> **(a)** a human states intent → **(b)** a human or an AI writes code in any supported language →
> **(c)** ThunderLang proves, deterministically, which guarantees and never-rules the code upholds
> or breaks → **(d)** the merge is blocked if a commitment broke.

No AI runs in the check. It cannot prove a change is *correct* , tests and humans still own that.
What it does is catch, with zero ambiguity, the mechanical violations AI diffs actually ship: a
secret written to a log, a declared input dropped from a signature, a guarantee whose evidence
the change quietly removed.

## The loop, verb by verb

Every step is one CLI verb, and they compose in order:

| Step | Command | What it proves |
| --- | --- | --- |
| 1. Bootstrap intent from existing code | `thunder lift` | recovers a humble `.thunder` draft from the code you already have (14 languages); never claims verified |
| 2. Approve the contract | `thunder approve` | stamps the reviewed intent with a source hash, the drift baseline |
| 3. Gate a proposed change | `thunder verify-diff` | which guarantees/never-rules the *diff* upholds or breaks; exit 1 on BLOCK |
| 4. Stand guard over the code as it is | `thunder drift` | whether today's implementation still satisfies the approved intent, no diff needed |
| 5. Grade every target | `thunder conform` | the same test cases against every target language; a divergent target is a CONFORMANCE FAILURE |
| 6. Emit the durable proof | `thunder prove` | the `intent-proof-v1` artifact: per-claim verdicts plus a freshness tuple |
| 7. Re-check the proof later | `thunder verify` | the artifact against the source: tampering, drift, STALE freshness |

In practice:

```bash
# 1. bootstrap: recover intent from the code you already have
thunder lift src/billing/invoice.ts --out intents/

# 2. a human reviews the draft, then approves it as the contract
thunder approve intents/CreateInvoice.thunder --by "Ada"

# 3. an AI (or a human) proposes a change; gate it against the contract
thunder verify-diff intents/CreateInvoice.thunder --before old.ts --after new.ts

# 4. any time, no diff in hand: is the code still in line with the intent?
thunder drift src/billing/invoice.ts --intent intents/CreateInvoice.thunder

# 5. same tests, every implementation
thunder conform intents/CreateInvoice.thunder --all-targets

# 6. record WHAT was proven, durably
thunder prove intents/CreateInvoice.thunder
```

## Run the gate

```bash
thunder verify-diff CreateInvoice.thunder --before old.ts --after new.ts
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
thunder verify-diff CreateInvoice.thunder vs new.ts: BLOCK (1 blocking, 1 regression(s))
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

## Gate the merge in CI

Every verb exits non-zero on a broken commitment, so the gate is a few lines of shell. A minimal
PR check that fails the build on divergence:

```bash
#!/usr/bin/env sh
set -e

# the intent itself must be sound
thunder check intents/CreateInvoice.thunder

# the PR's diff must not break a guarantee or hit a never-rule
git show origin/main:src/billing/invoice.ts > /tmp/before.ts
thunder verify-diff intents/CreateInvoice.thunder \
  --before /tmp/before.ts --after src/billing/invoice.ts   # exit 1 on BLOCK

# the implementation as merged must still satisfy the approved intent
thunder drift src/billing/invoice.ts --intent intents/CreateInvoice.thunder   # exit 1 on DRIFT

# every target must produce the canonical results
thunder conform intents/CreateInvoice.thunder --all-targets   # exit 1 on a conformance failure

# record what this commit proved (per-claim verdicts + freshness)
thunder prove intents/CreateInvoice.thunder   # exit 1 on a failed claim
```

With `set -e`, any BLOCK, DRIFT, conformance failure, or failed claim fails the build , the
change never merges unnoticed. Commit the emitted `.thunder-proof.json` (or attach it to the PR)
and later runs of `thunder verify` will tell you when the world moved and the proof went STALE.
See [Testing and Verification](/docs/testing-and-verification) for the full proof lifecycle.

## Prove it, durably

`thunder prove` is step (c) made portable: it runs the in-file tests, resolves every `guarantee`
and `never` as an obligation against the specific named test that verifies it, and emits an
`intent-proof-v1` artifact with honest per-claim verdicts , `verified`, `failed`, `planned`, or
`needs_verification`. **An unverified claim never reads as passed.** The proof also carries a
freshness tuple (intent hash, compiler version, git commit, dependency-lockfile hash,
environment) so `thunder verify` can mark it STALE the moment the implementation, dependencies,
or compiler move on without it.

`thunder conform` covers the multi-language half of the promise: the deterministic engine defines
the canonical result each test case must produce, and each target's real outputs (via `--run`,
`--all-targets`, or `--results`) are graded against it. Same tests, every implementation , see
the [Proof Matrix](/docs/proof-matrix).

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
    "thunderlang": { "command": "thunder", "args": ["mcp"] }
  }
}
```

The server exposes every verb of the loop:

| Tool | For |
| --- | --- |
| `intent_verify_diff` | **the gate** , check a proposed change against its intent before shipping |
| `intent_prove` | emit the `intent-proof-v1` artifact: per-claim verdicts + the freshness tuple |
| `intent_conform` | grade target outputs against the canonical results of the in-file test cases |
| `intent_drift` | check the code as it exists today against the intent, no diff needed |
| `intent_draft` | turn a structured brief into a rigorous intent draft + a gap checklist |
| `intent_check` | run diagnostics on intent source |
| `intent_lift` | bootstrap intent from existing code (14 languages) |
| `intent_run` / `intent_test` | evaluate a decision / run in-file tests |
| `intent_graph` / `intent_explain` | the canonical graph / explain a diagnostic code |

An agent drives the whole loop without leaving its editor: `intent_lift` to bootstrap the
contract from existing code (a human still approves it), `intent_check` to keep the intent
sound, then , after proposing a change , **`intent_verify_diff` on its own output**, refusing to
ship on a `BLOCK`. `intent_drift` confirms the finished code still lines up with the contract,
`intent_conform` grades every target implementation against the same cases, and `intent_prove`
records what was actually proven, per claim, with an unverified claim never counted as passed.
ThunderLang becomes part of how the agent thinks, not a step someone remembers to run.
