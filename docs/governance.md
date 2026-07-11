# Governance and Waivers

Real teams ship under real deadlines. Sometimes a blocking condition is known,
accepted, and shipped anyway. The wrong way to do that is silently: delete the check,
lower the bar, move on, and lose the record of who accepted what risk and why. The
right way is a **waiver**: a governed, on-the-record exception.

A waiver does not make a problem disappear. It records that a named authority
accepted a specific, blocking condition, for a stated reason, until a stated date.
The blocker stays visible; it just stops failing the build while the waiver is valid.

## The shape

A `waiver` block names the diagnostic it excuses and carries a reason and an
approver. Scope and expiry are optional but recommended.

```
mission Checkout
metric conversion rate
  target 60%

waiver IL-PM-001
  reason "measurement window deferred to v2, tracked in JIRA-123"
  approved_by Head of Product
  expires 2026-12-31
```

- **code** (`IL-PM-001` above) , the exact diagnostic this waiver excuses. A waiver
  is never a blanket pass; it names one thing.
- **reason** , why shipping is acceptable. An exception with no reason is not
  governance, it is silence.
- **approved_by** , the accountable authority. A waiver is someone accepting risk;
  without a name there is no owner.
- **scope** (optional) , limit the waiver to one mission or target, so it cannot
  quietly excuse the same code elsewhere.
- **expires** (optional) , an ISO date. After it, the waiver is dead and the
  condition blocks again.

## What it does

Run `intent check` on a governed mission and the matching blocker is downgraded to a
waived, on-the-record exception:

```
intent check governed.intent --now 2026-07-11
  [warning] (WAIVED) IL-PM-001: Metric "conversion rate" has no measurement window.
      waived by: Head of Product , measurement window deferred to v2, tracked in JIRA-123
  0 error(s), 1 warning(s), 1 waived
```

Pass `--now <date>` to evaluate expiry deterministically (in CI, that is the build
date). Without `--now`, expiry is not enforced, so a plain `intent check` is
reproducible regardless of the wall clock.

## Guardrails on the waivers themselves

A waiver is only trusted if it is well-formed and live. Governance emits its own
diagnostics so a waiver can never quietly do the wrong thing:

| Code | Meaning |
|---|---|
| `IL-GOV-001` | Waiver names no diagnostic code (a blanket waiver excuses nothing accountably). |
| `IL-GOV-002` | Waiver has no reason. |
| `IL-GOV-003` | Waiver names no approver. |
| `IL-GOV-004` | Waiver matches no current diagnostic , it is stale and may pre-approve a future regression. |
| `IL-GOV-005` | Waiver has expired; the condition it covered blocks again. |

The dangling-waiver check (`IL-GOV-004`) is the subtle one: once the condition a
waiver covered is actually fixed, the waiver must be removed, or it silently
pre-approves the next time that same condition reappears.

## For consumers

`applyWaivers(diagnostics, waivers, { now })` and
`governanceDiagnostics(waivers, diagnostics, { now })` are exported from
`@skillstech/intentlang` (schema `intent-governance-v1`). Both are deterministic and
pure. OpenThunder's Can-I-Ship consumes the same waiver records so a governed
exception in intent is the same governed exception at release , one audit trail, no
second bar.
