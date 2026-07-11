# Graph to Source (native round-trip)

IntentLang compiles `.intent` source into the canonical [Intent Graph](/docs/intent-graph).
`graphToSource` runs it the other way: given an Intent Graph, it regenerates editable
`.intent` source. That closes the native round-trip and makes the graph a first-class,
editable representation, not a one-way export.

```
source  ──buildIntentGraph──▶  Intent Graph  ──graphToSource──▶  source
```

## Why it matters

- **Visual editing.** SkillsTech Studio can hold the graph, let a user edit nodes on a
  canvas, and emit source that a human reads and version-controls, no hand-written text
  required.
- **Discovered intent becomes editable.** OpenThunder discovers an Intent Graph from an
  existing codebase; `graphToSource` turns that graph into a `.intent` file a team can
  read, correct, and own.
- **Normalization.** Running `source → graph → source` reformats a file into a canonical
  shape, the same way a code formatter does.

## The round-trip contract

The guarantee is a **semantic** round-trip, not a byte-identical one: node **types** and
**titles**, and the **typed relationships** between them, are preserved through
`graph → source → graph`. On the example corpus, every titled-mission graph round-trips
with no node loss and no edge loss. And the executable constructs round-trip by
**behavior**: a decision regenerated from its graph decides identically for every input,
and a lifecycle simulates identically for every event sequence.

Three things are best-effort by design (documented, and excluded from the strict
contract):

- **Conflict** nodes are not re-emitted directly; they regenerate from the role-scoped
  constraints, which are.
- **Journey** steps and **Pattern** requirement bodies are summarized in the graph
  (counts, not contents), so their inner text is not reconstructed.
- A graph whose Mission node has no title (a legacy `service`/`event`-only file)
  regenerates a mission named `Unnamed`.

## Usage

```
intent source <file>
```

- Given an `.intent` file, it parses, builds the graph, and regenerates source (a
  normalizing round-trip).
- Given a `.json` Intent Graph, it regenerates source directly.
- Writes to stdout, or to a `.intent` file with `--out <dir>`.

From the library (`@skillstech/intentlang`, schema `intent-graph-source-v1`):

```js
import { parseIntent, buildIntentGraph, graphToSource } from '@skillstech/intentlang';
const graph = buildIntentGraph(parseIntent(src));
const regenerated = graphToSource(graph);   // deterministic, pure
```

Together with the [DMN/BPMN import adapters](/docs/import-adapters), IntentLang now has a
complete round-trip in both directions: to and from external formats, and to and from its
own graph.
