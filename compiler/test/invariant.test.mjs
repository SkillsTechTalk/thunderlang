import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { graphToSource } from '../src/graph-source.mjs';
import { semanticDiagnostics } from '../src/emit.mjs';
import { NODE_TYPES } from '../src/intent-schema.mjs';
import { comprehensionLevel } from '../src/comprehension.mjs';

const SRC = `mission Billing
goal
  Move money correctly
invariant TenantIsolation
  statement one tenant's data is never visible to another tenant
  scope global
  applies_to
    apis
    events
    databases
  severity critical
  because a cross-tenant leak is catastrophic
  verify tenant isolation test
invariant CompletedPaymentHasLedgerEntry
  statement every completed payment has exactly one ledger entry
  severity error
`;

test('Invariant is a canonical node type', () => {
  assert.ok(NODE_TYPES.includes('Invariant'));
});

test('invariant parses fields (statement, scope, applies_to, severity, because, verify)', () => {
  const ast = parseIntent(SRC);
  assert.equal(ast.invariants.length, 2);
  const ti = ast.invariants[0];
  assert.equal(ti.name, 'TenantIsolation');
  assert.match(ti.statement, /never visible to another tenant/);
  assert.equal(ti.scope, 'global');
  assert.deepEqual(ti.appliesTo, ['apis', 'events', 'databases']);
  assert.equal(ti.severity, 'critical');
  assert.equal(ti.because, 'a cross-tenant leak is catastrophic');
  assert.deepEqual(ti.verify, ['tenant isolation test']);
});

test('the graph emits an Invariant node constrained_by the mission, with a verified_by edge', () => {
  const g = buildIntentGraph(parseIntent(SRC));
  const invs = g.nodes.filter((n) => n.type === 'Invariant');
  assert.equal(invs.length, 2);
  const ti = invs.find((n) => n.id === 'invariant.tenantisolation');
  assert.equal(ti.status, 'verify-declared');
  assert.ok(g.relationships.some((r) => r.type === 'constrained_by' && r.to === ti.id));
  assert.ok(g.relationships.some((r) => r.type === 'verified_by' && r.from === ti.id));
});

test('an unverified invariant warns; a verified one does not', () => {
  const diags = semanticDiagnostics(parseIntent(SRC)).filter((d) => d.code === 'invariant-without-verification');
  assert.equal(diags.length, 1, 'only the unverified invariant warns');
  assert.match(diags[0].message, /CompletedPaymentHasLedgerEntry/);
});

test('invariants round-trip through graph -> source -> graph with no node loss', () => {
  const g1 = buildIntentGraph(parseIntent(SRC));
  const g2 = buildIntentGraph(parseIntent(graphToSource(g1)));
  const count = (g) => g.nodes.filter((n) => n.type === 'Invariant').length;
  assert.equal(count(g2), count(g1));
  assert.equal(g2.nodes.length, g1.nodes.length);
});

test('a declared invariant lifts comprehension to at least C2 (structured)', () => {
  const r = comprehensionLevel(parseIntent('mission M\ntitle "x"\ninvariant I\n  statement it holds\n  verify t'));
  assert.ok(r.signals.structure.met);
  assert.ok(r.signals.structure.evidence.includes('invariants'));
});
