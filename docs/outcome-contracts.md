# Outcome Contracts

Most products declare outcomes as wishes: "faster checkout," "higher conversion,"
"fewer errors." A wish cannot be checked. An **outcome contract** turns the wish into a
commitment that can be judged met or missed: it binds an outcome to a metric, a
baseline, and a target, with a direction and a measurement window. Then, like decisions
and lifecycles, it is **executable** , give it the measured result and the runtime says
whether the commitment held.

## The shape

```
outcome_contract FasterCheckout
  outcome CheckoutConversion       # the outcome it governs
  metric conversion_rate
  baseline 48%
  target 60%
  direction higher                 # higher is better (default); use "lower" for latency, errors
  window 30 days after release
  owner GrowthPM
```

- **outcome / metric** resolve to the `Outcome` and `Metric` they govern, so the
  contract joins them in the graph (`OutcomeContract -targets-> Outcome`,
  `OutcomeContract -measured_by-> Metric`).
- **baseline / target** are the starting point and the commitment.
- **direction** decides which way is better. `higher` is met when the result is at or
  above target; `lower` (for latency, error rate, cost) is met when it is at or below.
- **window** is when the result is measured. A commitment with no window cannot be
  judged, so it is a release blocker.

## It is executable

The contract evaluates against a delivery `result` that measures the same outcome:

```
result Q3Conversion
  measures CheckoutConversion
  value 62%
```

```
intent outcomes checkout.thunder
  intent outcomes checkout.thunder: 1 met, 0 missed, 0 pending
    MET     FasterCheckout  , actual 62% vs target 60% (higher), +14 vs baseline
```

`thunder outcomes` matches each contract to the result that measures its outcome, then
reports **met**, **missed**, or **pending** (no result yet). It exits non-zero if any
contract was missed, so a release can be gated on outcomes actually landing, not just on
code shipping. The evaluation is deterministic: the same contract and result always
produce the same verdict, with the improvement over baseline computed for you.

## It is checked at authoring time too

Before any result exists, the compiler makes sure the commitment is even evaluable:

| Code | Fires when |
|---|---|
| `IL-OC-001` | The contract has no target, so nothing can be judged. (blocks release) |
| `IL-OC-002` | The contract names no metric. |
| `IL-OC-003` | The contract has no measurement window. (blocks release) |
| `IL-OC-004` | The target is no better than the baseline for the stated direction, so meeting it would prove nothing. |

`IL-OC-004` is direction-aware: a `higher` goal whose target is below its baseline, or a
`lower` goal whose target is above it, is a commitment that proves no improvement.

## Why it matters

An outcome contract closes the loop the [delivery profile](/docs/intent-graph) opened.
The mission targets an outcome, ships in a release, produces a result, and the contract
says whether the result honored the commitment. That is the whole arc of intent, made
checkable: not "we hoped for 60%," but "we committed to 60% within 30 days, and here is
whether we hit it."

## The surface

- CLI: `thunder outcomes <file>` (add `--json`). Exit code `1` if any contract was
  missed.
- Library (`@skillstech/thunderlang`, schema `intent-outcome-v1`):
  `evaluateOutcomeContract(contract, actual)`, `evaluateOutcomes(ast)`,
  `outcomeDiagnostics(ast)`, and `parseValue`.
