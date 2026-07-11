import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import {
  migrateGraph, validateGraph, graphVersion, MIGRATIONS, SCHEMA_CHAIN, MIGRATION_SCHEMA,
  renameNodeType, renameRelationshipType, backfillNodeField, dropNodeField,
} from '../src/migrate.mjs';

const legacy = () => ({
  nodes: [{ id: 'mission.m', type: 'Mission', title: 'M' }, { id: 'g1', type: 'Guarantee', title: 'a holds' }],
  relationships: [{ from: 'mission.m', type: 'requires', to: 'g1' }],
});

test('graphVersion defaults an unversioned graph to the oldest', () => {
  assert.equal(graphVersion(legacy()), 'intent-graph-v0');
  assert.equal(graphVersion({ schema: 'intent-graph-v1', nodes: [] }), 'intent-graph-v1');
  assert.equal(graphVersion({ schema: 'nonsense', nodes: [] }), SCHEMA_CHAIN[0]);
});

test('migrateGraph v0 -> v1 stamps the schema and backfills every node field', () => {
  const r = migrateGraph(legacy());
  assert.equal(r.schema, MIGRATION_SCHEMA);
  assert.equal(r.from, 'intent-graph-v0');
  assert.equal(r.to, 'intent-graph-v1');
  assert.equal(r.migrated, true);
  assert.equal(r.graph.schema, 'intent-graph-v1');
  const n = r.graph.nodes[0];
  for (const f of ['status', 'classification', 'tags', 'confidence', 'source', 'createdTime', 'updatedTime']) assert.ok(f in n, `missing ${f}`);
  assert.equal(n.status, 'draft');
  assert.deepEqual(n.tags, []);
});

test('migrateGraph is a no-op on an already-current graph', () => {
  const v1 = buildIntentGraph(parseIntent('mission M\nguarantees\n  a holds\n'));
  const r = migrateGraph(v1);
  assert.equal(r.migrated, false);
  assert.equal(r.applied.length, 0);
});

test('migrateGraph does not mutate its input and is deterministic', () => {
  const g = legacy();
  const snapshot = JSON.stringify(g);
  migrateGraph(g);
  assert.equal(JSON.stringify(g), snapshot, 'input was mutated');
  assert.equal(JSON.stringify(migrateGraph(legacy())), JSON.stringify(migrateGraph(legacy())));
});

test('migrateGraph rejects unknown targets and downgrades', () => {
  const v1 = { schema: 'intent-graph-v1', nodes: [], relationships: [] };
  assert.throws(() => migrateGraph(v1, { to: 'intent-graph-v9' }), /unknown target/);
  assert.throws(() => migrateGraph(v1, { to: 'intent-graph-v0' }), /cannot downgrade/);
});

test('validateGraph passes a real built graph and its migrated legacy form', () => {
  const v1 = buildIntentGraph(parseIntent('mission M\ndecision D\n  rule r\n    when a\n    return X\n  default\n    return Y\n'));
  assert.equal(validateGraph(v1).valid, true);
  assert.equal(validateGraph(migrateGraph(legacy()).graph).valid, true);
});

test('validateGraph reports unknown types and dangling edges', () => {
  const bad = { schema: 'intent-graph-v1', nodes: [{ id: 'x', type: 'Frobnicator' }], relationships: [{ from: 'x', type: 'teleports', to: 'ghost' }] };
  const codes = validateGraph(bad).issues.map((i) => i.code);
  assert.ok(codes.includes('MIG-002')); // unknown node type
  assert.ok(codes.includes('MIG-003')); // unknown rel type
  assert.ok(codes.includes('MIG-005')); // dangling to
  assert.equal(validateGraph(bad).valid, false);
});

test('validateGraph allows phase.* relationship targets (they are not nodes)', () => {
  const g = { schema: 'intent-graph-v1', nodes: [{ id: 'unknown.u', type: 'Unknown' }], relationships: [{ from: 'unknown.u', type: 'blocks', to: 'phase.pricing' }] };
  assert.equal(validateGraph(g).valid, true);
});

test('the registry has exactly one step per adjacent version pair', () => {
  for (let i = 0; i < SCHEMA_CHAIN.length - 1; i++) {
    const step = MIGRATIONS.find((m) => m.from === SCHEMA_CHAIN[i] && m.to === SCHEMA_CHAIN[i + 1]);
    assert.ok(step, `no migration ${SCHEMA_CHAIN[i]} -> ${SCHEMA_CHAIN[i + 1]}`);
    assert.equal(typeof step.migrate, 'function');
  }
});

// The declarative builders that future migrations will be composed from.
test('migration builders: rename node/relationship types, backfill + drop fields', () => {
  const g = { schema: 'intent-graph-v1', nodes: [{ id: 'a', type: 'Guarantee', title: 'x' }], relationships: [{ from: 'a', type: 'requires', to: 'a' }] };
  assert.equal(renameNodeType('Guarantee', 'Promise')(g).nodes[0].type, 'Promise');
  assert.equal(renameRelationshipType('requires', 'needs')(g).relationships[0].type, 'needs');
  assert.equal(backfillNodeField('owner', 'nobody')(g).nodes[0].owner, 'nobody');
  assert.ok(!('title' in dropNodeField('title')(g).nodes[0]));
  // backfill only fills where missing
  const withOwner = { nodes: [{ id: 'a', type: 'X', owner: 'me' }], relationships: [] };
  assert.equal(backfillNodeField('owner', 'nobody')(withOwner).nodes[0].owner, 'me');
});
