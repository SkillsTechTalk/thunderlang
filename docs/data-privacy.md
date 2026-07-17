# Data Purpose and Privacy

Most privacy failures are not exotic. They are ordinary data, held for a reason
nobody wrote down, kept longer than anyone decided, on a legal basis no one named,
and returned to a caller that did not need it. ThunderLang makes those four questions
part of the intent, so the compiler can hold the line before the code ships.

A `data` element declares, for one piece of data:

- **what it is** , a classification (`public | internal | confidential | pii | sensitive`),
- **why it is held** , a purpose,
- **how long** , a retention rule,
- **on what basis** , a lawful basis (GDPR Art. 6).

```
mission VerifyIdentity
output
  verified: Boolean

data customer.ssn
  classification pii
  purpose "one-time identity verification at signup"
  retention 30 days
  basis consent
```

Classification is the switch: `public` and `internal` data is ungoverned, `pii` and
`sensitive` data must answer the other three questions.

## Purpose limitation, enforced

Purpose limitation is the core privacy duty: data collected for one purpose may not be
quietly used for another. The analysis makes that duty checkable:

| Code | Fires when |
|---|---|
| `IL-DATA-001` | Sensitive data is held with no stated **purpose**. (blocks release) |
| `IL-DATA-002` | Sensitive data has no **retention** rule. |
| `IL-DATA-003` | Sensitive data declares no lawful **basis**. (blocks release) |
| `IL-DATA-004` | The classification is not a recognized tier. |
| `IL-DATA-005` | The lawful basis is not a recognized GDPR Art. 6 basis. |
| `IL-DATA-006` | Sensitive data is returned as an **output** with no `never expose` guard. |

`IL-DATA-006` is the one that catches real leaks: if a `pii`/`sensitive` element's
name is also an output field and nothing in the mission says `never expose` it, the
data is flowing out to the caller unguarded. Add a guard and the finding clears:

```
never
  expose customer.ssn
```

## Deterministic and scoped

The analysis fires only on explicitly declared `data` blocks, so adding data
governance to one mission never changes the diagnostics of another. It is pure and
reproducible: the same intent always yields the same findings, in the same order.

## For consumers

`analyzePrivacy(ast)` is exported from `@skillstech/thunderlang` (schema
`intent-privacy-v1`), along with `DATA_CLASSIFICATIONS` and `LAWFUL_BASES`. The
findings also flow through `semanticDiagnostics`, so `thunder check` surfaces them and
OpenThunder's release review sees the same purpose-limitation blockers , one privacy
model, checked at authoring time and again at ship time.
