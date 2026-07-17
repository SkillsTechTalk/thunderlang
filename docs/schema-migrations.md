# Schema Migrations

The [Intent Graph](/docs/intent-graph) is versioned (`intent-graph-v1`). Consumers,
OpenThunder, Repo Mastery, SkillsTech Studio, persist graphs. When the schema evolves, an
old graph must upgrade **deterministically** rather than break. Schema migrations are that
upgrade path: an ordered chain of pure steps that carry a graph from the version it was
written under to the current one.

## The model

Every schema version sits on an ordered chain. A graph declares its version in its
`schema` field; a graph with no (or an unrecognized) `schema` is treated as the oldest,
pre-versioned `intent-graph-v0`. `migrateGraph` walks the chain from the graph's version
to the target (the latest by default), applying one registered step per adjacent version
pair:

```
intent-graph-v0  ──▶  intent-graph-v1  ──▶  intent-graph-v2  ──▶  …
```

```js
import { migrateGraph, validateGraph } from '@skillstech/thunderlang';

const result = migrateGraph(persistedGraph);   // to the latest by default
// { from, to, migrated, applied: [{from,to,description}], graph }

const check = validateGraph(result.graph);      // { valid, issues, version }
```

Migrations are **pure and deterministic**: the input graph is never mutated, and the same
graph always migrates to the same result. Downgrades and unknown targets are rejected.

## The baseline: v0 → v1

The one shipped migration normalizes a pre-versioned graph into a well-formed v1: it
stamps the schema version and backfills every standard node field (`status`,
`classification`, `tags`, `confidence`, `source`, timestamps, ...) that current v1 nodes
carry. So a sparse graph a consumer serialized before the schema stabilized becomes a
graph the rest of the compiler can rely on:

```
intent migrate old-graph.json
  intent migrate: intent-graph-v0 -> intent-graph-v1 (1 step)
    applied intent-graph-v0 -> intent-graph-v1: Stamp schema version and backfill the standard node fields.
    validation: OK
```

## Validation

`validateGraph` checks a graph against the canonical vocabulary: every node has an id and
a canonical type, every relationship has a canonical type and non-dangling endpoints
(`phase.*` targets are allowed, they are phase markers, not nodes). Run it after a
migration to confirm the result is well-formed. It returns issues (`MIG-001..005`) and
never throws.

## Writing the next migration

When `intent-graph-v2` lands, adding it is a one-liner, because migrations are composed
from declarative builders:

```js
import { renameNodeType, renameRelationshipType, backfillNodeField, dropNodeField } from '@skillstech/thunderlang';

// in migrate.mjs, append to MIGRATIONS:
{
  from: 'intent-graph-v1',
  to: 'intent-graph-v2',
  description: 'Rename Never -> Prohibition and backfill severity.',
  migrate: pipe('intent-graph-v2',
    renameNodeType('Never', 'Prohibition'),
    backfillNodeField('severity', 'blocker'),
  ),
}
```

Every consumer's `migrateGraph` then handles v1 → v2 automatically, and a graph written
three versions ago upgrades through the whole chain in one call.

## Usage

- CLI: `thunder migrate <graph.json> [--to <version>] [--out <dir>]`. Exits non-zero if the
  migrated graph fails validation.
- Library (`@skillstech/thunderlang`): `migrateGraph`, `validateGraph`, `graphVersion`,
  `MIGRATIONS`, `SCHEMA_CHAIN`, and the builders `renameNodeType`,
  `renameRelationshipType`, `backfillNodeField`, `dropNodeField`.

This is the safety net that lets `intent-graph` evolve without stranding the graphs teams
have already stored.
