// Schema migrations for the Intent Graph. As `intent-graph-v1` evolves, consumers (OT, RM,
// ST) hold persisted graphs; when the schema bumps, those old graphs must upgrade
// deterministically rather than break. This is the upgrade path: an ordered chain of pure
// migration steps + declarative builders so a future v1 -> v2 is a one-liner, plus a
// baseline that normalizes pre-versioned (v0) graphs into a well-formed v1.

import { SCHEMA_VERSION, NODE_TYPES, RELATIONSHIP_TYPES } from './intent-schema.mjs';

export const MIGRATION_SCHEMA = 'intent-migration-v1';

// The ordered version chain. Every known schema version, oldest first. A graph with no (or
// unrecognized) `schema` is treated as the oldest, `intent-graph-v0` (pre-versioned).
export const SCHEMA_CHAIN = ['intent-graph-v0', 'intent-graph-v1'];

// The standard v1 node fields, with their defaults, for backfilling legacy nodes.
const NODE_DEFAULTS = {
  title: null, description: null, status: 'draft', owner: null,
  classification: null, confidence: null, source: null, tags: [],
  createdTime: null, updatedTime: null,
};

/** The schema version of a graph (defaults unversioned/unknown graphs to the oldest). */
export function graphVersion(graph) {
  const v = graph && graph.schema;
  return SCHEMA_CHAIN.includes(v) ? v : SCHEMA_CHAIN[0];
}

// ── Declarative migration builders , compose these into a step's `migrate` function. ──

/** Rename every node of `fromType` to `toType`. */
export const renameNodeType = (fromType, toType) => (g) => ({
  ...g, nodes: (g.nodes || []).map((n) => (n.type === fromType ? { ...n, type: toType } : n)),
});

/** Rename every relationship of `fromType` to `toType`. */
export const renameRelationshipType = (fromType, toType) => (g) => ({
  ...g, relationships: (g.relationships || []).map((r) => (r.type === fromType ? { ...r, type: toType } : r)),
});

/** Backfill a field on every node (only where currently missing/undefined). */
export const backfillNodeField = (field, value) => (g) => ({
  ...g, nodes: (g.nodes || []).map((n) => (n[field] === undefined ? { ...n, [field]: (Array.isArray(value) ? [...value] : value) } : n)),
});

/** Drop a field from every node. */
export const dropNodeField = (field) => (g) => ({
  ...g, nodes: (g.nodes || []).map((n) => { const c = { ...n }; delete c[field]; return c; }),
});

/** Run several step-transforms left to right, then stamp the target schema version. */
const pipe = (toVersion, ...fns) => (g) => ({ ...fns.reduce((acc, fn) => fn(acc), g), schema: toVersion });

// ── The baseline migration: v0 (pre-versioned) -> v1 ──
// Normalizes a legacy graph into a well-formed v1: stamps the schema and backfills every
// standard v1 node field so downstream code can rely on the shape.
function migrateV0toV1(g) {
  const nodes = (g.nodes || []).map((n) => {
    const out = { ...n };
    for (const [k, v] of Object.entries(NODE_DEFAULTS)) if (out[k] === undefined) out[k] = Array.isArray(v) ? [...v] : v;
    return out;
  });
  const relationships = (g.relationships || []).map((r) => ({ from: r.from, type: r.type, to: r.to, ...(r.name !== undefined ? { name: r.name } : {}), ...(r.within !== undefined ? { within: r.within } : {}) }));
  return { ...g, schema: 'intent-graph-v1', nodes, relationships };
}

// The registry: exactly one step per adjacent version pair. To add v2, append
// { from:'intent-graph-v1', to:'intent-graph-v2', description, migrate: pipe('intent-graph-v2', ...builders) }.
export const MIGRATIONS = [
  { from: 'intent-graph-v0', to: 'intent-graph-v1', description: 'Stamp schema version and backfill the standard node fields.', migrate: migrateV0toV1 },
];

/**
 * Migrate a graph forward to a target schema version (default: the latest). Applies each
 * registered step in chain order. Deterministic and pure , the input graph is not mutated.
 * @returns {{schema, from, to, migrated, applied, graph}}
 */
export function migrateGraph(graph, { to = SCHEMA_VERSION } = {}) {
  if (!SCHEMA_CHAIN.includes(to)) throw new Error(`migrateGraph: unknown target schema "${to}"`);
  const from = graphVersion(graph);
  const targetIdx = SCHEMA_CHAIN.indexOf(to);
  if (SCHEMA_CHAIN.indexOf(from) > targetIdx) throw new Error(`migrateGraph: cannot downgrade from "${from}" to "${to}"`);

  let cur = from;
  let g = graph;
  const applied = [];
  let guard = 0;
  while (cur !== to) {
    const step = MIGRATIONS.find((m) => m.from === cur);
    if (!step) throw new Error(`migrateGraph: no migration registered from "${cur}"`);
    g = step.migrate(g);
    applied.push({ from: step.from, to: step.to, description: step.description });
    cur = step.to;
    if (++guard > SCHEMA_CHAIN.length + 1) throw new Error('migrateGraph: migration loop detected');
  }
  return { schema: MIGRATION_SCHEMA, from, to, migrated: applied.length > 0, applied, graph: g };
}

/**
 * Validate a graph against the canonical vocabulary: every node has an id + canonical type,
 * every relationship has a canonical type and non-dangling endpoints. Returns issues (never
 * throws). Use after a migration to confirm the result is well-formed.
 */
export function validateGraph(graph) {
  const issues = [];
  const nodeTypes = new Set(NODE_TYPES);
  const relTypes = new Set(RELATIONSHIP_TYPES);
  const ids = new Set((graph.nodes || []).map((n) => n.id));
  for (const n of graph.nodes || []) {
    if (!n.id) issues.push({ level: 'error', code: 'MIG-001', message: 'node has no id' });
    if (!nodeTypes.has(n.type)) issues.push({ level: 'error', code: 'MIG-002', message: `unknown node type "${n.type}"`, id: n.id });
  }
  for (const r of graph.relationships || []) {
    if (!relTypes.has(r.type)) issues.push({ level: 'error', code: 'MIG-003', message: `unknown relationship type "${r.type}"` });
    if (!(ids.has(r.from) || String(r.from).startsWith('phase.'))) issues.push({ level: 'error', code: 'MIG-004', message: `dangling relationship from "${r.from}"` });
    if (!(ids.has(r.to) || String(r.to).startsWith('phase.'))) issues.push({ level: 'error', code: 'MIG-005', message: `dangling relationship to "${r.to}"` });
  }
  return { schema: 'intent-graph-validation-v1', version: graphVersion(graph), valid: issues.length === 0, issues };
}
