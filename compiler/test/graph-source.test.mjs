import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { graphToSource, GRAPH_SOURCE_SCHEMA } from '../src/graph-source.mjs';
import { evaluateDecision } from '../src/runtime.mjs';
import { simulateLifecycle } from '../src/runtime.mjs';

const COMPREHENSIVE = `mission CheckoutFlow
use product
use system
use delivery
use design
goal
  "let customers complete checkout fast"
persona BusyBuyer
evidence Interviews
  classification observed
  confidence high
outcome FasterCheckout
  "checkout under a minute"
metric conversion_rate
  baseline 48%
  target 60%
  window 30 days after release
requires
  ApprovedCart
guarantee payment is never captured twice
  verify idempotency test
never
  log the card number
unknown PricingModel
  resolve before pricing
question ShouldWeCharge
  blocks pricing
assumption UsersHaveEmail
  confidence medium
capability Billing
  description "charge and invoice"
  implements ChargeCard
interface PaymentGateway
  provides charge
  slo "99.9% availability"
release v1.2
  version "1.2.0"
  status planned
  includes CartMission
result Q3
  measures FasterCheckout
  value 62%
learning AddressFriction
  from v1.2
outcome_contract HitTarget
  outcome FasterCheckout
  metric conversion_rate
  baseline 48%
  target 60%
  window 30 days
component AddressForm
  variant default
  token color.error
  implements ChargeCard
artifact Mockups
  kind figma
  ref "figma.com/x"
  covers AddressForm
decision CanCheckout
  rule adult
    when age >= 18 and score >= 70
    return Allow
  default
    return Deny
lifecycle Order
  state Draft
  state Placed
  state Done
  transition place
    from Draft
    to Placed
  transition finish
    from Placed
    to Done
  terminal Done
command ChargeCard
  idempotency_key paymentId
  timeout 30 seconds
on ChargeFailed
  compensate refund
approval required from
  Product
  Security
`;

const g0 = buildIntentGraph(parseIntent(COMPREHENSIVE));
const regen = graphToSource(g0);
const g1 = buildIntentGraph(parseIntent(regen));

const nodeKey = (n) => `${n.type}|${n.title ?? ''}`;
const keep = (n) => !['Conflict', 'Journey'].includes(n.type);
const edgeKey = (bt, r) => {
  const f = bt.get(r.from); const t = bt.get(r.to);
  return `${f ? f.type + ':' + f.title : r.from}|${r.type}|${t ? t.type + ':' + t.title : r.to}`;
};

test('graphToSource emits parseable source (schema constant present)', () => {
  assert.equal(GRAPH_SOURCE_SCHEMA, 'intent-graph-source-v1');
  assert.match(regen, /^mission CheckoutFlow/);
  assert.ok(parseIntent(regen).mission === 'CheckoutFlow');
});

test('every node type + title round-trips through graph -> source -> graph', () => {
  const before = new Set(g0.nodes.filter(keep).map(nodeKey));
  const after = new Set(g1.nodes.filter(keep).map(nodeKey));
  const missing = [...before].filter((k) => !after.has(k));
  assert.deepEqual(missing, [], `dropped nodes: ${missing.join(', ')}`);
});

test('every typed relationship round-trips', () => {
  const bt0 = new Map(g0.nodes.map((n) => [n.id, n]));
  const bt1 = new Map(g1.nodes.map((n) => [n.id, n]));
  const before = new Set(g0.relationships.map((r) => edgeKey(bt0, r)).filter((k) => !/Conflict|Journey/.test(k)));
  const after = new Set(g1.relationships.map((r) => edgeKey(bt1, r)));
  const missing = [...before].filter((k) => !after.has(k));
  assert.deepEqual(missing, [], `dropped edges: ${missing.slice(0, 8).join(' ; ')}`);
});

test('decisions round-trip by EXECUTION (same inputs -> same result)', () => {
  const d0 = parseIntent(COMPREHENSIVE).decisions[0];
  const d1 = parseIntent(regen).decisions[0];
  for (const c of [{ age: 20, score: 90 }, { age: 20, score: 50 }, { age: 10 }]) {
    assert.equal(evaluateDecision(d1, c).result, evaluateDecision(d0, c).result, `mismatch at ${JSON.stringify(c)}`);
  }
});

test('lifecycles round-trip by simulation (same walks)', () => {
  const l0 = parseIntent(COMPREHENSIVE).lifecycles[0];
  const l1 = parseIntent(regen).lifecycles[0];
  for (const ev of [['place', 'finish'], ['finish'], ['place']]) {
    const a = simulateLifecycle(l0, ev); const b = simulateLifecycle(l1, ev);
    assert.deepEqual(b.path, a.path);
    assert.equal(b.valid, a.valid);
  }
});

test('graphToSource is deterministic', () => {
  assert.equal(graphToSource(g0), graphToSource(g0));
});

test('the whole example corpus (titled missions) round-trips with no node loss', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'examples');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.intent'));
  let scoped = 0;
  for (const f of files) {
    const ga = buildIntentGraph(parseIntent(fs.readFileSync(path.join(dir, f), 'utf8')));
    const mission = ga.nodes.find((n) => n.type === 'Mission');
    if (!mission || mission.title == null) continue; // out of scope: untitled service/event graphs
    scoped++;
    const gb = buildIntentGraph(parseIntent(graphToSource(ga)));
    const before = new Set(ga.nodes.filter(keep).map(nodeKey));
    const after = new Set(gb.nodes.filter(keep).map(nodeKey));
    const missing = [...before].filter((k) => !after.has(k));
    assert.deepEqual(missing, [], `${f} dropped nodes: ${missing.join(', ')}`);
  }
  assert.ok(scoped >= 5, 'expected several titled-mission examples');
});

test('graphToSource never throws on an empty or minimal graph', () => {
  assert.ok(typeof graphToSource({ nodes: [], relationships: [] }) === 'string');
  assert.ok(graphToSource({ nodes: [{ id: 'mission.m', type: 'Mission', title: 'M' }], relationships: [] }).includes('mission M'));
});
