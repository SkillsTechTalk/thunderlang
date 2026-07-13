import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IR_SCHEMA, IR_NODE_TYPES, IR_RELATIONSHIP_TYPES, PROVENANCE, isFactualProvenance,
  IR_CONFIDENCE, confidenceFromClassification, validateIR, graphToIR,
} from '../src/intent-ir.mjs';
import { NODE_TYPES, RELATIONSHIP_TYPES } from '../src/intent-schema.mjs';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import * as core from '../src/core.mjs';

test('Intent IR is a strict SUPERSET of intent-graph-v1 (anti-fork)', () => {
  for (const t of NODE_TYPES) assert.ok(IR_NODE_TYPES.includes(t), `IR must include graph node type ${t}`);
  for (const r of RELATIONSHIP_TYPES) assert.ok(IR_RELATIONSHIP_TYPES.includes(r), `IR must include graph rel type ${r}`);
  assert.ok(IR_NODE_TYPES.length > NODE_TYPES.length, 'IR adds ecosystem node types');
  // adds the tiers the ecosystem needs
  for (const t of ['Project', 'Service', 'Function', 'Finding', 'SecurityControl', 'LearningPath', 'Persona']) {
    assert.ok(IR_NODE_TYPES.includes(t), `IR missing ${t}`);
  }
});

test('a real intent graph lifts into valid Intent IR with honest confidence + provenance', () => {
  const ast = parseIntent(`mission CreateInvoice
use product
goal
  Create an invoice.
guarantee no duplicate invoice
  verify idempotency test
evidence PriorIncident
  classification observed
`);
  const graph = buildIntentGraph(ast);
  const ir = graphToIR(graph);
  assert.equal(ir.schema, IR_SCHEMA);
  const v = validateIR(ir);
  assert.equal(v.valid, true, JSON.stringify(v.errors));
  // every node got provenance; nodes WITH a classification got a mapped confidence
  assert.ok(ir.nodes.every((n) => n.provenance === 'compiler-derived'));
  assert.ok(ir.nodes.every((n) => n.confidence === undefined || IR_CONFIDENCE.includes(n.confidence)));
  const ev = ir.nodes.find((n) => n.type === 'Evidence');
  assert.equal(ev.confidence, 'Observed', 'observed classification -> Observed confidence');
});

test('classification maps onto the confidence taxonomy', () => {
  assert.equal(confidenceFromClassification('verified'), 'Confirmed');
  assert.equal(confidenceFromClassification('decided'), 'Confirmed');
  assert.equal(confidenceFromClassification('observed'), 'Observed');
  assert.equal(confidenceFromClassification('inferred'), 'Derived');
  assert.equal(confidenceFromClassification('proposed'), 'Inferred');
  assert.equal(confidenceFromClassification('assumed'), 'Speculative');
});

test('provenance factuality gate is correct', () => {
  assert.equal(isFactualProvenance('deterministically-discovered'), true);
  assert.equal(isFactualProvenance('human-approved'), true);
  assert.equal(isFactualProvenance('ai-proposed'), false);
  assert.equal(isFactualProvenance('ai-generated'), false);
  assert.ok(PROVENANCE.includes('runtime-observed'));
});

test('honesty guard: a non-factual node needs confidence and cannot be approved unreviewed', () => {
  const bad = { schema: IR_SCHEMA, nodes: [{ id: 'a', type: 'Requirement', provenance: 'ai-proposed' }] };
  const r1 = validateIR(bad);
  assert.equal(r1.valid, false);
  assert.ok(r1.errors.some((e) => /requires a confidence/.test(e.message)));

  const approvedUnreviewed = { schema: IR_SCHEMA, nodes: [{ id: 'a', type: 'Requirement', provenance: 'ai-generated', confidence: 'Inferred', approvalStatus: 'approved', reviewStatus: 'unreviewed' }] };
  const r2 = validateIR(approvedUnreviewed);
  assert.equal(r2.valid, false);
  assert.ok(r2.errors.some((e) => /cannot be "approved" without/.test(e.message)));
});

test('validateIR flags unknown types, duplicate ids, and dangling edges', () => {
  const r = validateIR({ schema: IR_SCHEMA, nodes: [{ id: 'x', type: 'Frobnicator' }, { id: 'x', type: 'Function' }], relationships: [{ from: 'x', type: 'nope', to: 'ghost' }] });
  assert.equal(r.valid, false);
  const msgs = r.errors.map((e) => e.message).join(' ');
  assert.match(msgs, /unknown node type/);
  assert.match(msgs, /duplicate node id/);
  assert.match(msgs, /unknown relationship type/);
  assert.match(msgs, /dangling to/);
});

test('Intent IR is browser-safe (exported from /core)', () => {
  assert.equal(typeof core.validateIR, 'function');
  assert.equal(typeof core.graphToIR, 'function');
  assert.ok(Array.isArray(core.IR_NODE_TYPES));
});
