import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { NODE_TYPES, RELATIONSHIP_TYPES, intentGraphJsonSchema, DIAGNOSTIC_RULES, SCHEMA_VERSION } from '../src/intent-schema.mjs';

test('every node type + relationship the builder emits is in the canonical enums', () => {
  // A rich mission exercising most node kinds.
  const src = [
    'use product', 'mission M', 'title "x"', 'for Learner',
    'evidence E', '  classification observed',
    'outcome O', '  "y"', 'metric Mtr', '  window 30 days',
    'guarantees', '  g holds', 'never', '  bad thing',
    'unknown U', '  resolve before Implementation', 'question Q', '  blocks X',
    'assumption A', '  confidence low',
    'product requires', '  fast', 'security requires', '  strong auth',
    'conflict C', '  between', '    A', '    B', '  resolve_by Product', '  before Impl',
    'experience Exp', '  state Empty', '    offer PasteText', '  follows P',
    'pattern P', '  requires', '    retry available',
    'approval required from', '  Product',
  ].join('\n');
  const g = buildIntentGraph(parseIntent(src));
  const nodeTypes = new Set(NODE_TYPES);
  const relTypes = new Set(RELATIONSHIP_TYPES);
  for (const n of g.nodes) assert.ok(nodeTypes.has(n.type), `node type "${n.type}" not canonical`);
  for (const r of g.relationships) assert.ok(relTypes.has(r.type), `relationship "${r.type}" not canonical`);
});

test('the JSON Schema is well-formed and pins the version + enums', () => {
  const s = intentGraphJsonSchema();
  assert.equal(s.properties.schema.const, SCHEMA_VERSION);
  assert.deepEqual(s.definitions.node.properties.type.enum, NODE_TYPES);
  assert.deepEqual(s.definitions.relationship.properties.type.enum, RELATIONSHIP_TYPES);
  assert.ok(s.$schema.includes('json-schema.org'));
});

test('diagnostic-rule catalog has stable ids for every IL rule area', () => {
  const ids = DIAGNOSTIC_RULES.map((r) => r.ruleId);
  for (const id of ['IL-PM-001', 'IL-EXP-004', 'IL-CONFLICT-001', 'IL-GRAPH-010']) assert.ok(ids.includes(id));
  // every rule has a severity + blocks array
  for (const r of DIAGNOSTIC_RULES) { assert.ok(r.severity); assert.ok(Array.isArray(r.blocks)); }
});

test('NODE_TYPES has no duplicates (RM bug 2026-07-11: Decision was listed twice)', () => {
  assert.equal(new Set(NODE_TYPES).size, NODE_TYPES.length, `duplicate node types: ${NODE_TYPES.filter((t, i) => NODE_TYPES.indexOf(t) !== i)}`);
  // the JSON Schema enum must match the (now unique) list exactly
  assert.equal(intentGraphJsonSchema().definitions.node.properties.type.enum.length, NODE_TYPES.length);
});

test('RELATIONSHIP_TYPES has no duplicates', () => {
  assert.equal(new Set(RELATIONSHIP_TYPES).size, RELATIONSHIP_TYPES.length);
});

test('the diagnostic catalog covers every code the semantic pass can emit (completeness)', () => {
  const cataloged = new Set(DIAGNOSTIC_RULES.map((r) => r.ruleId));
  // representative codes from every check-time family , the catalog must include all of them
  for (const code of [
    'IL-PM-001', 'IL-EV-001', 'IL-GRAPH-010', 'IL-EXP-004', 'IL-CONFLICT-001',
    'IL-GOV-001', 'IL-DATA-001', 'IL-OC-001',
    'IL-DEC-001', 'IL-DEC-004', 'IL-DIST-001', 'IL-DIST-005',
    'IL-LIFE-001', 'IL-LIFE-004', 'IL-TEMP-001',
  ]) assert.ok(cataloged.has(code), `catalog is missing ${code}`);
  // every rule is well-formed
  for (const r of DIAGNOSTIC_RULES) {
    assert.match(r.ruleId, /^IL-[A-Z]+-\d+$/);
    assert.ok(r.area && r.severity && Array.isArray(r.blocks) && r.summary);
  }
});
