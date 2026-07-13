# Diagnostics catalog

> This page is generated from the compiler's canonical `DIAGNOSTIC_RULES` catalog
> and CI-guarded, so it always matches what the compiler emits. Do not edit by hand;
> run `npm run diagnostics:emit`.

Every rule has a stable **code**, a **severity**, and what it **blocks**. Codes are
the contract: editors, CI, and OpenThunder key off them, and they never change meaning
across versions. Warnings and info never fail a build; errors and blockers do. Get the
same data as JSON with `intent rules --json`, or one rule with `intent explain <CODE>`.

60 canonical diagnostics across 19 areas.

## AI implementation

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `INTENT-AI-010` | warning | — | Unsupported implementation scope. |

## Architecture

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `INTENT-ARCH-001` | warning | — | Architecture rule not understood. |

## Conflict

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `IL-CONFLICT-001` | blocker | `<declared-phase>` | Declared conflict is unresolved. |
| `IL-CONFLICT-010` | blocker | `implementation` | Scope includes and excludes the same item. |
| `IL-CONFLICT-011` | info | — | Redundant constraint from multiple roles. |
| `IL-CONFLICT-012` | blocker | `implementation` | Directly contradictory constraints. |

## Core checks

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `missing-goal` | warning | — | Mission has no goal block. |
| `duplicate-without-idempotency` | warning | — | A duplicate-prevention guarantee declares no idempotency key or lookup rule. |
| `guarantee-without-verification` | warning | — | Guarantee has no explicit verification. |
| `never-without-verification` | warning | — | Never-rule has no explicit verification. |
| `secret-without-never-log` | warning | — | A secret field has no "never log/expose" guard. |
| `error-name-not-pascalcase` | info | — | Named error is not PascalCase. |
| `unknown-block` | info | — | Unrecognized top-level block. |

## Decisions

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `IL-DEC-001` | blocker | `implementation` | Decision has no default (undefined when no rule matches). |
| `IL-DEC-002` | blocker | `implementation` | Two rules fire on the same condition with different results. |
| `IL-DEC-003` | info | — | Redundant rule, identical to another (dead). |
| `IL-DEC-004` | warning | — | Decision has no rules. |

## Distributed & failure

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `IL-DIST-001` | blocker | `implementation` | Retry without an idempotency key (duplicates work). |
| `IL-DIST-002` | blocker | `implementation` | Retried or remote command with no timeout. |
| `IL-DIST-003` | blocker | `implementation` | At-least-once delivery without duplicate handling. |
| `IL-DIST-004` | blocker | `implementation` | Permanent failure with no compensation. |
| `IL-DIST-005` | error | — | Handler references an undeclared event. |

## Evidence

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `IL-EV-001` | info | — | Evidence has no classification. |
| `IL-EV-002` | warning | — | Evidence has an unknown classification. |

## Experience

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `IL-EXP-001` | info | — | Experience declares no states. |
| `IL-EXP-004` | blocker | `experience-approval`, `release` | Failure state has no recovery path. |

## Governance

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `IL-GOV-001` | error | — | Waiver names no diagnostic code. |
| `IL-GOV-002` | error | — | Waiver has no reason. |
| `IL-GOV-003` | error | — | Waiver names no approver. |
| `IL-GOV-004` | warning | — | Waiver matches no current diagnostic (stale). |
| `IL-GOV-005` | error | — | Waiver has expired. |

## Graph

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `IL-GRAPH-010` | blocker | `<declared-phase>` | Unresolved unknown blocks a phase. |
| `IL-GRAPH-011` | blocker | `<declared-phase>` | Open question blocks a phase. |

## Lifecycle

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `IL-LIFE-001` | error | — | Transition references an undefined state. |
| `IL-LIFE-002` | warning | — | Unreachable state. |
| `IL-LIFE-003` | warning | — | Non-terminal dead-end state (no way out). |
| `IL-LIFE-004` | warning | — | Lifecycle has no initial state. |

## IntentLens notes

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `INTENT_NOTE_UNKNOWN_LENS` | info | — | IntentLens note uses an unknown lens. |
| `INTENT_NOTE_EMPTY` | info | — | IntentLens note is empty. |

## Outcome contracts

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `IL-OC-001` | blocker | `release` | Outcome contract has no target (cannot be evaluated). |
| `IL-OC-002` | warning | — | Outcome contract names no metric. |
| `IL-OC-003` | blocker | `release` | Outcome contract has no measurement window. |
| `IL-OC-004` | warning | — | Outcome contract target is not better than its baseline. |

## Data & privacy

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `IL-DATA-001` | blocker | `release` | Sensitive data held with no stated purpose. |
| `IL-DATA-002` | warning | — | Sensitive data has no retention rule. |
| `IL-DATA-003` | blocker | `release` | Sensitive data declares no lawful basis. |
| `IL-DATA-004` | warning | — | Data has an unknown classification. |
| `IL-DATA-005` | warning | — | Unrecognized lawful basis. |
| `IL-DATA-006` | warning | — | Sensitive data exposed as output with no guard. |

## Product

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `IL-PM-001` | warning | `release` | Metric has no measurement window. |
| `IL-PM-003` | warning | — | Outcome has no metric. |

## Security

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `IL-SEC-001` | blocker | `release` | Secret-typed field travels over the event bus. |
| `IL-SEC-002` | blocker | `release` | API returns a secret with no auth requirement. |

## Style intent

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `IL-STYLE-001` | warning | — | Style intent binds a token outside the canonical address space. |
| `IL-STYLE-002` | warning | — | Unrecognized accessibility target. |
| `IL-STYLE-003` | info | — | Style intent declares no accessibility target (a proposed claim). |
| `IL-STYLE-004` | warning | — | Invalid mode token value. |
| `IL-STYLE-005` | info | — | Style intent applies to an undeclared experience. |

## Temporal

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `IL-TEMP-001` | blocker | `verification` | Eventually with no time bound (cannot be verified). |

## Types

| Code | Severity | Blocks | Meaning |
| --- | --- | --- | --- |
| `IL-TYPE-001` | info | — | Field uses an unrecognized (likely mistyped) type. |
