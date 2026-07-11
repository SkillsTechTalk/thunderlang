# Export Adapters (DMN, BPMN, model checking)

The Intent Graph is the source of truth, but it does not have to be the only place the
intent is checked. Decisions and lifecycles are exactly the structures that mature,
standardized tooling already reasons about: decision-table engines, process modelers,
and model checkers. Export adapters render those slices of the graph into the industry
formats so intent can be validated by existing tools without leaving IntentLang.

Three adapters ship, all deterministic and pure (string in, string out):

| Format | From | For |
|---|---|---|
| **DMN 1.3** | decisions (Gap 4) | decision-table engines (Camunda, Drools, jDMN) |
| **BPMN 2.0** | lifecycles (Gap 2) | process modelers (Camunda, bpmn.io, Signavio) |
| **NuSMV** | lifecycles + temporal | model checkers (NuSMV, nuXmv) |

Each exports only what is declared: a mission with no decisions produces an
empty-but-valid DMN document, and a mission with no lifecycle produces an SMV note
rather than a broken model.

## DMN , decisions become decision tables

A `decision` block maps to a DMN decision table with hit policy `FIRST`: rules are
ordered, the first match wins, and the mission `default` becomes the final catch-all
rule. The `when` expression is preserved verbatim (XML-escaped) so nothing about the
condition is lost in translation.

```
intent export eligibility.intent --format dmn
```

## BPMN , lifecycles become processes

A `lifecycle` state machine maps to a BPMN process: each state is a task, each
transition is a named sequence flow, the initial state is entered from a start event,
and terminal states flow to an end event. Open it in any BPMN modeler to see the
declared flow as a diagram.

```
intent export enrollment.intent --format bpmn
```

## NuSMV , lifecycles become checkable models

The state machine becomes a NuSMV module with a faithful transition relation. The
adapter emits the specs it can derive with certainty:

- `SPEC EF (state = T)` for every terminal `T` , the terminal is reachable.
- For each `always` / `eventually` / `until` declaration, a `SPEC` skeleton with the
  intent text as a comment and a `p_i` proposition to bind. Because the temporal
  statements are free text, the adapter emits the temporal *shape* and leaves the
  atomic proposition for a human to bind, rather than guessing.

```
intent export enrollment.intent --format smv
```

```
MODULE main
VAR
  state : {Draft, Submitted, Approved, Rejected};
ASSIGN
  init(state) := Draft;
  next(state) := case
      state = Draft : Submitted;
      state = Submitted : {Approved, Rejected};
      state = Approved : Approved;
      state = Rejected : Rejected;
    esac;

SPEC EF (state = Approved);   -- terminal "Approved" is reachable
-- always: application is never lost  ->  SPEC AG (p_0)
```

## Usage

`intent export <file> --format <dmn|bpmn|smv>` prints to stdout, or writes a file when
`--out <dir>` is given. From the library, `toDMN(ast)`, `toBPMN(ast)`, `toSMV(ast)`,
and `exportIntent(ast, format)` are exported from `@skillstech/intentlang`. The exports
are byte-deterministic: the same intent always produces the same document, so they
diff cleanly and belong in version control alongside the intent.
