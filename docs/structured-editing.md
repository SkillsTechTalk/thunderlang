# Structured Editing and Sync

Not everyone who owns intent writes ThunderLang by hand. A product manager thinks in fields:
the goal, the guarantees, the inputs, what must never happen. A structured editor (like
SkillsTech Studio) lets them edit those fields, but the `.thunder` file must stay the source of
truth , and a human's comments must survive the round trip. That is the job of the sync and
patch API.

It has three pieces, all deterministic (no AI) and browser-safe via
`@skillstech/thunderlang/core`, so a web editor uses them with no Node build:

- `parseToStructured(source)` , the canonical structured view a UI renders from.
- `proposeIntent(structured, { base })` , a reviewable proposal from an edited graph.
- `applyEdits(source, edits)` , lossless, comment-preserving field edits on the source.

## Draft: a brief into rigorous intent

Authoring intent by hand is friction most developers skip. `draftIntent(brief)` removes it: give
a **structured brief** , the essentials you already know , and it scaffolds a canonical, parseable
intent draft **and** a review checklist of exactly what is still missing. No AI runs; the draft is
a proposal, never marked verified. (An agent can produce the brief from a free-text request , via
the [`intent_draft` MCP tool](/docs/verifying-ai-changes) , and a human approves the result.)

```js
import { draftIntent } from "@skillstech/thunderlang/core";

const { source, review } = draftIntent({
  mission: "create invoice",
  goal: "Create exactly one invoice for an approved order.",
  guarantees: [{ statement: "no duplicate invoice", verify: "idempotency test" }, "totals are never negative"],
  inputs: [{ name: "paymentToken", type: "Secret" }],
});
// source -> canonical ThunderLang
// review -> [ "Guarantee 'totals are never negative' has no verification ...",
//             "Input 'paymentToken' is a secret , add a never-expose rule ..." ]
```

From the shell: `thunder draft --brief brief.json` (or `--brief -` for stdin), `--write out.thunder`
to save. The gaps print so you know what to fill in before the draft becomes a commitment.

## Read: source to structured

`parseToStructured` returns the canonical [Intent Graph](/docs/intent-graph) (what a projector
maps to its own nodes and edges) plus a flat, PM-friendly field summary:

```js
import { parseToStructured } from "@skillstech/thunderlang/core";

const structured = parseToStructured(source);
// -> { schema: "intent-sync-v1", mission, graph, fields: {
//      goal, why, guarantees[], neverRules[], inputs[], outputs[], decisions[], ...
//    } }
```

IL stays the source of truth: the structured view is a *projection*, not a fork.

## Propose: structured to source, with a reviewable diff

When the user edits the structured graph, `proposeIntent` regenerates ThunderLang source and,
against a base, a **reviewable diff** , it never applies a silent rewrite:

```js
import { proposeIntent } from "@skillstech/thunderlang/core";

const p = proposeIntent(editedStructured, { base: source });
// -> { ok, source, diff, ambiguities, lostNodes, validation, warnings, applied: false }
```

- **`diff`** , added / removed / changed nodes and relationships, plus any approvals the change
  invalidates. Render it; let the human apply it.
- **`ambiguities`** , every node whose classification is not factual (`proposed`, `assumed`,
  `inferred`, `unknown`). These are proposals to confirm, not guesses to accept.
- **`validation`** , the canonical-vocabulary and no-dangling check on the proposed graph.
- **`applied: false`** , always. The proposal is for review; nothing is written.

Regenerating source from a graph does not preserve free-text comments. When the base has
comments, `warnings` says so and points you to `applyEdits` , the comment-preserving path.

## Edit: patch the source in place, comments intact

`applyEdits` applies field-level edits directly to the `.thunder` **source**, touching only the
target lines. Comments, formatting, stable ids, and every untouched block stay byte-identical,
and the result comes out already `thunder fmt`-clean:

```js
import { applyEdits } from "@skillstech/thunderlang/core";

const result = applyEdits(source, [
  { op: "setField", field: "goal", value: "Create an approved invoice, exactly once." },
  { op: "addGuarantee", statement: "an order is invoiced at most once", verify: "idempotency test" },
  { op: "addField", section: "input", name: "idempotencyKey", type: "IdempotencyKey" },
  { op: "removeNever", match: "payment token" },
]);
// -> { schema: "intent-patch-v1", source, applied, skipped }
```

Supported operations:

| Op | Effect |
| --- | --- |
| `setField` | Replace the body of `goal` / `why` / `problem` (creating it if absent). |
| `addGuarantee` | Insert a `guarantee` block (with optional `because` and `verify`). |
| `removeGuarantee` | Remove the guarantee whose statement matches. |
| `addNever` / `removeNever` | Add or remove a `never` rule. |
| `addField` | Add a typed field to `input` / `output` (creating the block if absent). |
| `removeField` | Remove a field , and its indented modifiers, so no orphans are left. |
| `setFieldType` | Change a field's type in place. |
| `addMetric` / `removeMetric` | Add or remove a `metric` block (with optional baseline/target/window). |
| `setMetricField` | Set a metric's `baseline` / `target` / `window` (inserting the line if absent). |
| `addOutcome` / `removeOutcome` | Add or remove an `outcome` (with an optional description). |
| `addRule` / `removeRule` | Add a decision rule (before `default`) or remove one by name. |
| `setRule` | Edit a rule's `when` / `return` in place. |
| `setDefault` | Set the decision's `default` return (creating the default block if absent). |

Nothing is applied blindly: an edit that matches nothing, has a bad section, or is missing
arguments lands in `skipped` with a reason, and the rest still apply.

### From the command line

The same patcher is a CLI command, so scripts and CI can edit intent without the library:

```bash
intent edit mission.thunder --set-goal "Create an approved invoice, once." \
  --add-guarantee "an order is invoiced at most once" --write

# or drive it with the full JSON edit list (from a file or stdin)
echo '[{"op":"addField","section":"input","name":"age","type":"int"}]' \
  | intent edit mission.thunder --edits -
```

Without `--write` it prints the edited source to stdout; with `--write` it applies in place and
reports how many edits applied and were skipped.

## The loop

Together the three close the Human ↔ Structured ↔ ThunderLang loop with IL as the source of
truth: read with `parseToStructured`, propose graph-level changes with `proposeIntent` (diffed,
never silent), and apply field edits with `applyEdits` (lossless, comments kept). The sync
contract is `intent-sync-v1`; the patch contract is `intent-patch-v1`. Both are pre-1.0 and
version independently.
