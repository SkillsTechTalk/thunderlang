// Skills + required-understanding on intents (Ownership Graph seam). A mission declares the skills
// it requires (normalized to the shared `skill:<slug>` namespace) and what a human must be able to
// explain to own it. These flow into the graph (Skill node + requires_skill edge), the proof
// envelope, and compileSource, so the Ownership Graph can join a skill to a real intent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { compileSource } from '../src/compile.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { graphToSource } from '../src/graph-source.mjs';
import { NODE_TYPES, RELATIONSHIP_TYPES } from '../src/intent-schema.mjs';
import { semanticDiagnostics } from '../src/emit.mjs';

const SRC = `mission PlaceOrder
goal "ship orders"
requires_skill Distributed Systems, Idempotency
demonstrates understands the idempotency-key guarantee
`;

test('parser: requires_skill (inline, comma) normalizes to skill: ids; demonstrates captured', () => {
  const ast = parseIntent(SRC);
  assert.deepEqual(ast.skills.map((s) => s.id), ['skill:distributed-systems', 'skill:idempotency']);
  assert.deepEqual(ast.skills.map((s) => s.name), ['Distributed Systems', 'Idempotency']);
  assert.deepEqual(ast.demonstrates.map((d) => d.statement), ['understands the idempotency-key guarantee']);
});

test('parser: block form of requires_skill also works', () => {
  const ast = parseIntent('mission M\nrequires_skill\n  Auth\n  Caching\n');
  assert.deepEqual(ast.skills.map((s) => s.id), ['skill:auth', 'skill:caching']);
});

test('schema: Skill node type + requires_skill relationship are registered', () => {
  assert.ok(NODE_TYPES.includes('Skill'));
  assert.ok(RELATIONSHIP_TYPES.includes('requires_skill'));
});

test('graph: emits Skill nodes + mission requires_skill edges', () => {
  const g = buildIntentGraph(parseIntent(SRC));
  const skills = g.nodes.filter((n) => n.type === 'Skill');
  assert.deepEqual(skills.map((n) => n.id).sort(), ['skill:distributed-systems', 'skill:idempotency']);
  assert.ok(skills.every((n) => n.status === 'required'));
  const edges = g.relationships.filter((e) => e.type === 'requires_skill');
  assert.equal(edges.length, 2);
  assert.ok(edges.every((e) => e.from === 'mission.placeorder'));
});

test('graph: duplicate skills collapse to one node', () => {
  const g = buildIntentGraph(parseIntent('mission M\nrequires_skill Auth\nrequires_skill Auth\n'));
  assert.equal(g.nodes.filter((n) => n.type === 'Skill').length, 1);
  assert.equal(g.relationships.filter((e) => e.type === 'requires_skill').length, 2);
});

test('proof + compileSource surface skillsRequired (ids) and demonstrates (prose)', () => {
  const r = compileSource(SRC, { generatedAt: '2026-07-15T00:00:00Z' });
  assert.deepEqual(r.skillsRequired, ['skill:distributed-systems', 'skill:idempotency']);
  assert.deepEqual(r.demonstrates, ['understands the idempotency-key guarantee']);
  assert.deepEqual(r.artifacts.proof.skillsRequired, ['skill:distributed-systems', 'skill:idempotency']);
  assert.deepEqual(r.artifacts.proof.demonstrates, ['understands the idempotency-key guarantee']);
});

test('graph->source round-trips skills to requires_skill (structural)', () => {
  const g = buildIntentGraph(parseIntent(SRC));
  const back = graphToSource(g);
  const ast2 = parseIntent(back);
  assert.deepEqual(ast2.skills.map((s) => s.id), ['skill:distributed-systems', 'skill:idempotency']);
});

test('no skills/demonstrates => empty, no diagnostics change (additive)', () => {
  const r = compileSource('mission M\ngoal "x"\n', { generatedAt: '2026-07-15T00:00:00Z' });
  assert.deepEqual(r.skillsRequired, []);
  assert.deepEqual(r.demonstrates, []);
  const errs = semanticDiagnostics(parseIntent(SRC)).filter((d) => d.level === 'error');
  assert.deepEqual(errs, []);
});
