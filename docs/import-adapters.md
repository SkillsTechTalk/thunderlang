# Import Adapters (round-trip from DMN and BPMN)

The [export adapters](/docs/export-adapters) send intent out to industry formats. Import
adapters bring it back. If a team already has decision logic in a DMN table or a process
in a BPMN diagram, they do not have to retype it: lift it straight into IntentLang and
it becomes runnable, checkable intent.

Two importers ship, both deterministic and pure, with no dependencies (IntentLang
carries its own small XML reader):

| From | To | Command |
|---|---|---|
| DMN 1.3 decision table | a `decision` block | `intent import table.dmn` |
| BPMN 2.0 process | a `lifecycle` block | `intent import flow.bpmn` |

The format is auto-detected; pass `--format dmn\|bpmn` to force it. Output goes to
stdout, or to a `.intent` file with `--out <dir>`.

## The round-trip contract

The design guarantee is behavioral round-trip fidelity:

```
fromDMN(toDMN(ast))   reconstructs a decision that DECIDES identically
fromBPMN(toBPMN(ast)) reconstructs a lifecycle that WALKS identically
```

Export a decision to DMN, import it back, and run both against the same inputs: the
results match, case for case. Cosmetic details (rule names) may differ, but behavior is
preserved exactly. This is verified in the test suite by running the
[Intent Runtime](/docs/intent-runtime) against both the original and the round-tripped
intent and asserting equal results.

## It reads foreign files too

Import is not limited to files IntentLang produced. A DMN table authored in Camunda or
Drools with proper unary tests imports correctly: an `age` column with the entry
`>= 18` and a `region` column with `US` becomes `when age >= 18 and region == US`. A
BPMN process from any modeler imports its tasks as states, its sequence flows as
transitions, and any activity that flows to an end event as a terminal state.

```
intent import loan-decision.dmn
```
```
mission Loan

decision Approve
  inputs
    age
    region
  rule r1
    when age >= 18 and region == US
    return Approve
  default
    return Deny
```

That decision is immediately executable with `intent run`, so a table that used to live
only inside a decision engine is now runnable, diffable, versionable intent.

## Why this matters

Import closes the loop. Intent can now come *from* the tools teams already use, not
only go to them. A decision table becomes a tested specification. A process diagram
becomes a simulatable lifecycle. And because export and import are inverses, IntentLang
can sit in the middle of an existing toolchain without asking anyone to abandon it,
which is how a standard earns adoption.

## The surface

- CLI: `intent import <file> [--format dmn|bpmn] [--out <dir>]`.
- Library (`@skillstech/intentlang`): `fromDMN(xml)`, `fromBPMN(xml)`,
  `importIntent(xml, format?)`, `detectFormat(xml)`, and the small XML reader
  (`parseXml`, `find`, `findAll`, `localName`).
