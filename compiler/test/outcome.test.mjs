import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { semanticDiagnostics } from '../src/emit.mjs';
import { evaluateOutcomeContract, evaluateOutcomes, outcomeDiagnostics, parseValue, OUTCOME_SCHEMA } from '../src/outcome.mjs';
import { NODE_TYPES, RELATIONSHIP_TYPES } from '../src/intent-schema.mjs';

const src = `mission Checkout
use product
use delivery
outcome CheckoutConversion
  "more visitors complete checkout"
metric conversion_rate
  baseline 48%
  target 60%
  window 30 days after release
outcome_contract FasterCheckout
  outcome CheckoutConversion
  metric conversion_rate
  baseline 48%
  target 60%
  window 30 days after release
  owner GrowthPM
result Q3Conversion
  measures CheckoutConversion
  value 62%
`;
const ast = parseIntent(src);

test('parseValue reads numbers, percents, and units', () => {
  assert.deepEqual(parseValue('60%'), { value: 60, unit: '%', raw: '60%' });
  assert.equal(parseValue('$1,000').value, 1000);
  assert.equal(parseValue('2.5s').value, 2.5);
  assert.equal(parseValue(null).value, null);
});

test('an outcome_contract parses its binding', () => {
  const c = ast.outcomeContracts[0];
  assert.equal(c.outcome, 'CheckoutConversion');
  assert.equal(c.target, '60%');
  assert.equal(c.direction, 'higher');
  assert.equal(c.owner, 'GrowthPM');
});

test('evaluateOutcomeContract: higher-is-better met/missed with improvement', () => {
  const c = ast.outcomeContracts[0];
  const met = evaluateOutcomeContract(c, '62%');
  assert.equal(met.schema, OUTCOME_SCHEMA);
  assert.equal(met.met, true);
  assert.equal(met.improvement, 14); // 62 - 48
  assert.equal(evaluateOutcomeContract(c, '55%').met, false);
});

test('evaluateOutcomeContract: lower-is-better inverts the comparison', () => {
  const c = { name: 'Latency', target: '200ms', baseline: '350ms', direction: 'lower' };
  assert.equal(evaluateOutcomeContract(c, '180ms').met, true);
  assert.equal(evaluateOutcomeContract(c, '260ms').met, false);
});

test('a non-comparable actual is not met and marked non-comparable', () => {
  const c = ast.outcomeContracts[0];
  const e = evaluateOutcomeContract(c, null);
  assert.equal(e.comparable, false);
  assert.equal(e.met, null);
});

test('evaluateOutcomes auto-matches the delivery result that measures the outcome', () => {
  const r = evaluateOutcomes(ast);
  assert.equal(r.total, 1);
  assert.equal(r.met, 1);
  assert.equal(r.evaluations[0].matchedResult, 'Q3Conversion');
  assert.equal(r.evaluations[0].status, 'met');
});

test('a contract with no matching result is pending, not missed', () => {
  const a = parseIntent('mission M\noutcome_contract C\n  outcome O\n  metric m\n  target 90%\n  window 7 days\n');
  const r = evaluateOutcomes(a);
  assert.equal(r.pending, 1);
  assert.equal(r.missed, 0);
  assert.equal(r.evaluations[0].status, 'pending');
});

test('outcome diagnostics: no target (001, blocker), no metric (002), no window (003)', () => {
  const a = parseIntent('mission M\noutcome_contract C\n  outcome O\n');
  const codes = outcomeDiagnostics(a).map((f) => f.code);
  assert.ok(codes.includes('IL-OC-001'));
  assert.ok(codes.includes('IL-OC-002'));
  assert.ok(codes.includes('IL-OC-003'));
});

test('IL-OC-004: target not better than baseline (direction-aware)', () => {
  const higher = parseIntent('mission M\noutcome_contract C\n  metric m\n  baseline 60%\n  target 50%\n  window 7 days\n');
  assert.ok(outcomeDiagnostics(higher).some((f) => f.code === 'IL-OC-004'));
  const lower = parseIntent('mission M\noutcome_contract C\n  metric m\n  baseline 200ms\n  target 300ms\n  direction lower\n  window 7 days\n');
  assert.ok(outcomeDiagnostics(lower).some((f) => f.code === 'IL-OC-004'));
});

test('outcome diagnostics flow through semanticDiagnostics as non-error (gate-safe)', () => {
  const a = parseIntent('mission M\noutcome_contract C\n  outcome O\n');
  const diag = semanticDiagnostics(a).filter((d) => d.code.startsWith('IL-OC'));
  assert.ok(diag.length >= 2);
  assert.ok(!diag.some((d) => d.level === 'error')); // never breaks the repo gate
});

test('OutcomeContract node + targets/measured_by edges are canonical (anti-fork)', () => {
  const g = buildIntentGraph(ast);
  const node = g.nodes.find((n) => n.type === 'OutcomeContract');
  assert.ok(node);
  const has = (from, type, to) => g.relationships.some((r) => r.from === from && r.type === type && r.to === to);
  assert.ok(has('mission.checkout', 'requires', 'outcome-contract.fastercheckout'));
  assert.ok(has('outcome-contract.fastercheckout', 'targets', 'outcome.checkoutconversion'));
  assert.ok(has('outcome-contract.fastercheckout', 'measured_by', 'metric.conversion-rate'));
  for (const n of g.nodes) assert.ok(NODE_TYPES.includes(n.type));
  for (const r of g.relationships) assert.ok(RELATIONSHIP_TYPES.includes(r.type));
});
