# 12-Factor Agents conformance

ThunderLang scores an intent against the 13 principles of
[humanlayer/12-factor-agents](https://github.com/humanlayer/12-factor-agents). Their thesis ,
*"production agents are mostly deterministic code, with LLM steps sprinkled in at just the right
points"* , is ThunderLang's thesis. So most of the 12 factors map directly onto structure IL
already models: decisions, lifecycles, typed I/O, approvals, errors/handlers, events, and a pure
runtime. The conformance lens turns "12-factor compliant" into a **deterministic, human-owned,
verifiable claim** the proof can carry , not a marketing checkbox.

```
thunder twelve-factor examples/TwelveFactorAgent.thunder          # scored report
thunder twelve-factor examples/TwelveFactorAgent.thunder --json   # machine-readable
```

Programmatic (`@skillstech/thunderlang` / `/core`):

```js
import { parseIntent, twelveFactorReport, twelveFactorSummary } from '@skillstech/thunderlang/core';
const report = twelveFactorReport(parseIntent(source));   // per-factor verdicts + score
// compileSource(...) and the .thunder-proof.json both carry the compact `twelveFactor` summary.
```

Each factor gets a verdict , `satisfied` | `partial` | `absent` , with the evidence found and a
concrete fix. The score is `(satisfied + 0.5·partial) / 13`, reported 0–100 with a grade
(`strong` ≥ 85, `partial` ≥ 60, `weak` otherwise). Findings are catalogued as `IL-12F-01..13`
(`thunder explain IL-12F-08`).

## The mapping: each factor → the ThunderLang signal the lens inspects

| # | Factor | IL signal inspected | Satisfied when |
|---|--------|---------------------|----------------|
| 1 | Natural language to tool calls | `decision` / `command` | a structured operation exists (whitelisted dispatch) |
| 2 | Own your prompts | `guarantee` | behavior is an owned, specified contract (not a black box) |
| 3 | Own your context window | `scope` include/exclude | a context boundary is declared |
| 4 | Tools are structured outputs | typed `input`/`output` + decision `return` | I/O is typed and results are discriminated |
| 5 | Unify execution + business state | `lifecycle` | one state model unifies execution + business state |
| 6 | Launch / pause / resume | `lifecycle` states + `terminal` | non-terminal (pausable) states + a terminal exist |
| 7 | Contact humans with tool calls | `approval required from` | a structured human-in-the-loop gate exists |
| 8 | Own your control flow | `decision` + `default` | every decision has an explicit default (total control flow) |
| 9 | Compact errors into context | `errors` + `on <handler>` | named errors AND handlers (compensate/notify) exist |
| 10 | Small, focused agents | count of decisions/commands/handlers/states | ≤ 10 steps (partial 11–20, absent > 20) |
| 11 | Trigger from anywhere | `event` | at least one event trigger is declared |
| 12 | Stateless reducer | `decision` / `lifecycle` | logic is a pure, replayable function on IL's runtime |
| 13 | Pre-fetch context (appendix) | `input` | inputs are declared up front (deterministic pre-fetch) |

## Why ThunderLang is a natural fit

The 12-factor agentic loop is: *the LLM emits a discriminated union of `intent`s → a deterministic
`switch` dispatches code → the result appends to one serializable thread → repeat until a terminal
intent*, and the agent is formally *"a stateless reducer: `f(events) → next_action`"*. That is the
same shape as an ThunderLang **decision table** (FIRST-hit rules + default, fully traced),
**lifecycle** (states + transitions + terminals), and **pure runtime** (`evaluateDecision`,
`simulateLifecycle`). IL already enforces the hard parts , e.g. `IL-DEC-001` blocks a decision with
no default (Factor 8's "no undefined branch"), and every artifact is deterministic and replayable
(Factor 12).

## The exemplar

`examples/TwelveFactorAgent.thunder` is a triage agent that scores **100/100** , it declares typed
I/O, a bounded `scope`, guarantees, a `decision` with a `default`, a resumable `lifecycle`, an
`approval required from` gate, named `errors` + an `on` handler, and an `event` trigger. Use it as
the template for an agent-shaped intent.
