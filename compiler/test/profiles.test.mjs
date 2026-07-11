import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { NODE_TYPES, RELATIONSHIP_TYPES } from '../src/intent-schema.mjs';

const src = `mission CertificationCheckout
use system
use delivery
outcome FasterCheckout
  "checkout in under a minute"
command ChargeCard
decision Eligibility
  rule r
    when a
    return X
  default
    return Y
capability Billing
  description "charge and invoice customers"
  implements ChargeCard
  implements Eligibility
interface PaymentGateway
  provides charge
  requires idempotency_key
  slo "99.9% availability"
release v1.2
  version "1.2.0"
  status planned
  date 2026-08-01
  includes CertificationAttempt
result ConversionUp
  measures FasterCheckout
  metric conversion
  value "62%"
  baseline "48%"
learning AddressFriction
  description "users drop at address entry"
  from v1.2
`;
const ast = parseIntent(src);
const g = buildIntentGraph(ast);
const nodeById = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
const hasEdge = (from, type, to) => g.relationships.some((r) => r.from === from && r.type === type && r.to === to);

test('system profile parses capabilities and interfaces', () => {
  assert.equal(ast.capabilities.length, 1);
  assert.deepEqual(ast.capabilities[0].implements, ['ChargeCard', 'Eligibility']);
  assert.equal(ast.interfaces.length, 1);
  assert.deepEqual(ast.interfaces[0].provides, ['charge']);
  assert.equal(ast.interfaces[0].slo, '99.9% availability');
});

test('delivery profile parses releases, results, learnings', () => {
  assert.equal(ast.releases[0].version, '1.2.0');
  assert.deepEqual(ast.releases[0].includes, ['CertificationAttempt']);
  assert.equal(ast.results[0].measures, 'FasterCheckout');
  assert.equal(ast.results[0].value, '62%');
  assert.equal(ast.learnings[0].from, 'v1.2');
});

test('Capability node + implemented_by edges resolve to command AND decision', () => {
  assert.equal(nodeById['capability.billing'].type, 'Capability');
  assert.ok(hasEdge('mission.certificationcheckout', 'requires', 'capability.billing'));
  assert.ok(hasEdge('capability.billing', 'implemented_by', 'command.chargecard'));
  assert.ok(hasEdge('capability.billing', 'implemented_by', 'decision.eligibility'));
});

test('SystemContract node carries provides/requires/slo', () => {
  const sc = nodeById['system-contract.paymentgateway'];
  assert.equal(sc.type, 'SystemContract');
  assert.match(sc.description, /provides charge/);
  assert.match(sc.description, /slo 99.9%/);
});

test('Release node + Mission -released_in-> Release', () => {
  assert.equal(nodeById['release.v1-2'].type, 'Release');
  assert.equal(nodeById['release.v1-2'].status, 'planned');
  assert.ok(hasEdge('mission.certificationcheckout', 'released_in', 'release.v1-2'));
});

test('OutcomeResult resolves the measured Outcome (Outcome -resulted_in-> OutcomeResult)', () => {
  assert.equal(nodeById['outcome-result.conversionup'].type, 'OutcomeResult');
  assert.ok(hasEdge('outcome.fastercheckout', 'resulted_in', 'outcome-result.conversionup'));
});

test('LearningArtifact is derived_from its source release', () => {
  assert.equal(nodeById['learning.addressfriction'].type, 'LearningArtifact');
  assert.ok(hasEdge('learning.addressfriction', 'derived_from', 'release.v1-2'));
});

test('an unresolved reference falls back to the mission, never a dangling edge', () => {
  const g2 = buildIntentGraph(parseIntent('mission M\nresult R\n  measures NoSuchOutcome\nlearning L\n  from NoSuchRelease\n'));
  const ids = new Set(g2.nodes.map((n) => n.id));
  // every edge endpoint exists (no dangling)
  for (const r of g2.relationships) {
    assert.ok(ids.has(r.from) || r.from.startsWith('phase.'), `dangling from ${r.from}`);
    assert.ok(ids.has(r.to) || r.to.startsWith('phase.'), `dangling to ${r.to}`);
  }
});

test('all emitted system/delivery nodes + edges are canonical (anti-fork)', () => {
  for (const n of g.nodes) assert.ok(NODE_TYPES.includes(n.type), `noncanonical node ${n.type}`);
  for (const r of g.relationships) assert.ok(RELATIONSHIP_TYPES.includes(r.type), `noncanonical rel ${r.type}`);
});
