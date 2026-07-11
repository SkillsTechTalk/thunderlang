# Export Adapters (DMN, BPMN, model checking)

The Intent Graph is the source of truth, but it does not have to be the only place the
intent is checked. Decisions and lifecycles are exactly the structures that mature,
standardized tooling already reasons about: decision-table engines, process modelers,
and model checkers. Export adapters render those slices of the graph into the industry
formats so intent can be validated by existing tools without leaving IntentLang.

Five adapters ship, all deterministic and pure (string in, string out):

| Format | From | For |
|---|---|---|
| **DMN 1.3** | decisions | decision-table engines (Camunda, Drools, jDMN) |
| **BPMN 2.0** | lifecycles | process modelers (Camunda, bpmn.io, Signavio) |
| **NuSMV** | lifecycles + temporal | model checkers (NuSMV, nuXmv) |
| **JSON Schema** | typed input/output fields | validators, codegen, mock servers |
| **OpenAPI 3.1** | the mission as an operation | API tooling (Swagger, clients, gateways) |

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

## JSON Schema and OpenAPI , typed fields become a data contract

A mission's `input` / `output` typed fields are a data shape, and data shapes are what
API tooling already speaks. The JSON Schema adapter maps each field's semantic type to a
JSON Schema fragment (`Email → {type:string, format:email}`, `Money → number`,
`List<Order> → array`, `Secret → writeOnly`, an id → string, an unknown entity → an
opaque object), and marks every declared field required unless it carries an `optional`
modifier.

```
intent export mission.intent --format jsonschema
```

The OpenAPI adapter goes one step further and renders the whole mission as an operation:
the input schema becomes the request body, the output schema becomes the `200` response,
and declared `errors` become named error responses with inferred status codes
(`NotFound → 404`, `Duplicate → 409`, `Unauthorized → 403`). Path and method come from a
declared `api` block when present, else default to `POST /<mission>`.

```
intent export mission.intent --format openapi
```

So a mission with typed inputs and outputs is, for free, a validatable JSON Schema and a
usable OpenAPI operation, no hand-written contract.

## Usage

`intent export <file> --format <dmn|bpmn|smv|jsonschema|openapi>` prints to stdout, or
writes a file when `--out <dir>` is given. From the library, `toDMN(ast)`, `toBPMN(ast)`,
`toSMV(ast)`, `toJSONSchema(ast)`, `toOpenAPI(ast)`, and `exportIntent(ast, format)` are
exported from `@skillstech/intentlang`. The exports are byte-deterministic: the same
intent always produces the same document, so they diff cleanly and belong in version
control alongside the intent.
