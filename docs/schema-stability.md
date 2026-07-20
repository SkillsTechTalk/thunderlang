# Schema stability: `intent-graph-v1`

The [Intent Graph](/docs/intent-graph) is the canonical Intent IR this compiler emits, and
it is consumed outside this repository: OpenThunder verifies implementations against it,
Repo Mastery teaches from it, SkillsTech Studio renders it. Once an IR crosses a product
boundary, "it may change at any time" is not an acceptable answer. This page is the
committed stability contract for `intent-graph-v1`: what is guaranteed today, how the
schema is allowed to evolve, and how a consumer depends on it without being surprised.

The single source of truth for the shape itself is the committed schema at
`compiler/intent-graph.schema.json`, emitted by `thunder schema`. This page does not
restate it; it states the rules the schema evolves under.

## What `intent-graph-v1` guarantees today

**The envelope is stable.** A persisted graph is a JSON document with a fixed top level:
`schema` (the constant string `intent-graph-v1`), `missionId`, `nodes`, and
`relationships` are required; `summary` is optional. The JSON Schema (draft-07, `$id`
`https://thunderlang.dev/schema/intent-graph-v1.json`) is part of the committed schema
file. These required fields will not be removed, renamed, or change type within v1.

**The type vocabularies are closed sets, and additive-only.** The committed schema
currently defines exactly **42 node types** and **21 relationship types** (plus the 7
classifications and the diagnostic rule catalog). Within v1:

- New node types, new relationship types, and new **optional** node or relationship
  fields may be added in any release.
- Existing types and fields will **not** be removed, renamed, or repurposed (given a
  different meaning) without a version bump to `intent-graph-v2`.
- Node ids remain stable for the same source, and every node keeps its standard fields
  (id, type, status, owner, classification, confidence).

So a consumer built against today's schema keeps working against every future v1 graph;
at most it sees types and fields it does not know yet (see
[For consumers](#for-consumers-openthunder-and-others) below for how to treat those).

**The compiler cannot drift from the schema.** The schema file is not documentation that
hopes to stay accurate: `thunder schema` emits it from the compiler's own canonical
constants, the compiler is tested so `buildIntentGraph` can only emit types that exist in
the schema, and CI runs `schema:check` on every push, which re-emits the schema and fails
if the committed file differs. The committed schema and the shipped compiler cannot
silently diverge.

## Versioning policy

**The IR version and the package version are independent.** `@skillstech/thunderlang` is
currently a 0.x npm package; `intent-graph-v1` is not. The package version tracks the
compiler as software (CLI flags, library exports, diagnostics); the `intent-graph-v1`
string versions the persisted IR contract. The compiler moving from 0.4 to 0.5, or to
1.0, does not by itself change the graph schema, and the additive-only guarantee above
holds across package releases.

**Breaking changes mean a new version string, shipped with a migration.** If a change
ever requires removing, renaming, or repurposing an existing type or required field, that
is `intent-graph-v2`, and it lands together with a registered migration step so existing
graphs upgrade deterministically:

```bash
intent migrate <graph.json> --to intent-graph-v2   # walk the version chain, pure and deterministic
intent validate <graph.json>                       # confirm the result is canonical
```

Both commands ship today (`thunder migrate`, `thunder validate`), and the v0 to v1
migration already exercises the chain. [Schema migrations](/docs/schema-migrations)
documents the model and the declarative builders a v2 migration would be composed from.
A version bump without a migration path is not allowed.

## Deprecation policy

Nothing disappears by surprise. A field or type leaves the schema in three explicit
stages:

1. **Marked.** The deprecation is announced in the schema description, this doc set, and
   the release notes, naming the replacement. The compiler keeps emitting and accepting
   it; `thunder validate` still passes.
2. **Kept for a window.** The deprecated item remains valid for the rest of v1. Within
   v1 it is never removed; deprecation only signals what the next major IR version will
   drop, so consumers can move off it on their own schedule.
3. **Removed only at a major IR bump.** The removal happens in `intent-graph-v2` (or
   later), together with the migration step that rewrites old graphs, so a persisted v1
   graph never becomes unreadable.

A consumer that reads the schema file and the release notes therefore always has a full
version window of notice before anything it depends on changes shape.

## Road to 1.0

`intent-graph-v1` is declared frozen (stable-for-1.0) when all of the following hold,
not before:

- [ ] **The type sets have settled.** No additions to the node or relationship type sets
      for several consecutive releases; new modeling needs are met by the existing
      vocabulary rather than new types.
- [ ] **The migration tooling is proven.** `thunder migrate` has carried real persisted
      graphs across at least one schema step in the wild (the v0 to v1 baseline already
      does this), and `thunder validate` gates the results in consumer pipelines.
- [ ] **Downstream consumers have integrated.** OpenThunder, Repo Mastery, and
      SkillsTech Studio consume `intent-graph-v1` from the schema (generated bindings,
      not hand-copied enums) and their integrations survive additive releases without
      code changes.
- [ ] **The CI gates hold.** `schema:check` and the compiler's emission tests have kept
      the committed schema byte-identical to the compiler's output across those releases.

Until then, v1 is stable in the additive-only sense above, which is already a contract
consumers can build on; freezing only adds the promise that even additions stop.

## For consumers (OpenThunder and others)

How to depend on the Intent IR safely:

- **Pin to the version string.** Check `graph.schema === "intent-graph-v1"` at the door.
  `thunder validate <graph.json>` (or `validateGraph` from `@skillstech/thunderlang`)
  does this plus the full canonical check: every node has an id and a canonical type,
  every relationship has a canonical type and non-dangling endpoints. Reject envelopes
  that fail it instead of guessing.
- **Treat unknown additive types as forward compatible.** A v1 graph from a newer
  compiler may contain node or relationship types you do not know yet. Skip or
  pass-through what you do not recognize; do not fail on it. Everything you were built
  against is still there with the same meaning.
- **Generate bindings from the schema.** `thunder schema` emits the canonical node type,
  relationship type, and classification enums plus the diagnostic catalog. Generate your
  enums from that output rather than hand-recreating them, so an additive release is a
  regeneration, not a hunt.
- **Migrate persisted graphs on load.** If you store graphs, run `migrateGraph` (or
  `thunder migrate`) when reading them back. It is a no-op for a current graph and the
  supported upgrade path for an old one.
- **Never re-parse `.thunder` yourself.** The graph is the contract; the compiler is the
  only parser. That is what keeps one compiler and many consumers coherent (see the
  [compiler contract](/docs/compiler-contract)).

Questions about a specific shape belong to `compiler/intent-graph.schema.json`, which is
always exactly what the shipped compiler emits.
