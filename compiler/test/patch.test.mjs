import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdits, PATCH_SCHEMA } from '../src/patch.mjs';
import { parseIntent } from '../src/parse.mjs';
import { isFormatted } from '../src/format.mjs';
import * as core from '../src/core.mjs';

const SRC = `mission CreateInvoice
use product

# This comment must survive any structured edit.
goal
  Create an invoice.

guarantee invoice.total is never negative
  verify a non-negative test

never expose the payment token in logs
`;

test('setField replaces a block body and preserves comments', () => {
  const r = applyEdits(SRC, [{ op: 'setField', field: 'goal', value: 'Create an approved invoice, once.' }]);
  assert.equal(r.schema, PATCH_SCHEMA);
  assert.equal(r.applied.length, 1);
  assert.match(r.source, /# This comment must survive/);
  assert.match(r.source, /Create an approved invoice, once\./);
  assert.ok(!r.source.includes('Create an invoice.'), 'old goal replaced');
  assert.equal(parseIntent(r.source).goal.trim(), 'Create an approved invoice, once.');
});

test('addGuarantee inserts a rich guarantee block; result still parses + is formatted', () => {
  const r = applyEdits(SRC, [{ op: 'addGuarantee', statement: 'an order is invoiced at most once', because: 'double billing breaks trust', verify: 'idempotency test' }]);
  assert.match(r.source, /guarantee an order is invoiced at most once/);
  assert.match(r.source, /because double billing breaks trust/);
  const ast = parseIntent(r.source);
  assert.equal(ast.guarantees.length, 2);
  assert.equal(isFormatted(r.source), true, 'patched output is canonically formatted');
});

test('removeGuarantee removes the matching block; comment + other blocks intact', () => {
  const r = applyEdits(SRC, [{ op: 'removeGuarantee', match: 'never negative' }]);
  assert.ok(!/never negative/.test(r.source));
  assert.match(r.source, /# This comment must survive/);
  assert.match(r.source, /never expose the payment token/);
  assert.equal(parseIntent(r.source).guarantees.length, 0);
});

test('addNever / removeNever work and are order-stable', () => {
  const r = applyEdits(SRC, [
    { op: 'addNever', statement: 'charge an unapproved order' },
    { op: 'removeNever', match: 'payment token' },
  ]);
  assert.match(r.source, /never charge an unapproved order/);
  assert.ok(!/payment token/.test(r.source));
  assert.equal(parseIntent(r.source).neverRules.length, 1);
});

test('setField adds the block when absent, anchored after the mission', () => {
  const r = applyEdits('mission M\nuse product\n', [{ op: 'setField', field: 'why', value: 'it matters' }]);
  assert.match(r.source, /why\n {2}it matters/);
  assert.equal(parseIntent(r.source).why.trim(), 'it matters');
});

test('unmatched or unsupported edits are skipped with a reason, never applied blindly', () => {
  const r = applyEdits(SRC, [
    { op: 'removeGuarantee', match: 'does not exist' },
    { op: 'setField', field: 'mission', value: 'nope' },
    { op: 'bogus' },
  ]);
  assert.equal(r.applied.length, 0);
  assert.equal(r.skipped.length, 3);
  assert.ok(r.skipped.every((s) => s.reason));
  assert.equal(r.source, SRC, 'source is unchanged when nothing applies');
});

test('untouched source is byte-identical outside edited blocks', () => {
  const r = applyEdits(SRC, [{ op: 'setField', field: 'goal', value: 'X' }]);
  // the never block line is preserved verbatim
  assert.ok(r.source.split('\n').includes('never expose the payment token in logs'));
  assert.ok(r.source.split('\n').includes('# This comment must survive any structured edit.'));
});

const FIELDS_SRC = `mission CreateInvoice
use product

# preserve me
input
  orderId: OrderId
  total: Money

output
  invoice: Invoice
`;

test('addField / setFieldType / removeField edit fields in place, comments intact', () => {
  const r = applyEdits(FIELDS_SRC, [
    { op: 'addField', section: 'input', name: 'idempotencyKey', type: 'IdempotencyKey' },
    { op: 'setFieldType', section: 'input', name: 'total', type: 'Percentage' },
    { op: 'removeField', section: 'output', name: 'invoice' },
  ]);
  assert.equal(r.applied.length, 3);
  assert.match(r.source, /# preserve me/);
  const ast = parseIntent(r.source);
  const inputs = Object.fromEntries(ast.inputs.map((f) => [f.name, f.type]));
  assert.equal(inputs.idempotencyKey, 'IdempotencyKey');
  assert.equal(inputs.total, 'Percentage');
  assert.ok(!ast.outputs.some((f) => f.name === 'invoice'));
  assert.equal(isFormatted(r.source), true);
});

test('addField rejects a duplicate name and creates the block when absent', () => {
  const dup = applyEdits(FIELDS_SRC, [{ op: 'addField', section: 'input', name: 'orderId', type: 'OrderId' }]);
  assert.equal(dup.applied.length, 0);
  assert.match(dup.skipped[0].reason, /already exists/);

  const created = applyEdits('mission M\nuse product\n', [{ op: 'addField', section: 'input', name: 'age', type: 'int' }]);
  assert.match(created.source, /input\n {2}age: int/);
  assert.equal(parseIntent(created.source).inputs[0].name, 'age');
});

test('removeField also removes the field\'s indented children (no orphans)', () => {
  const withChild = `mission M
use product
input
  password: Secret
    never log
  age: int
`;
  const r = applyEdits(withChild, [{ op: 'removeField', section: 'input', name: 'password' }]);
  assert.ok(!/password/.test(r.source));
  assert.ok(!/never log/.test(r.source), 'the field\'s child modifier is removed too');
  assert.deepEqual(parseIntent(r.source).inputs.map((f) => f.name), ['age']);
});

test('field ops with a bad section are skipped with a reason', () => {
  const r = applyEdits(FIELDS_SRC, [{ op: 'addField', section: 'payload', name: 'x', type: 'int' }]);
  assert.equal(r.applied.length, 0);
  assert.match(r.skipped[0].reason, /input\/output/);
});

const PRODUCT_SRC = `mission Growth
use product

# preserve me
goal
  grow conversion

outcome FasterCheckout
  "buyers finish in one step"

metric conversion_rate
  baseline 48%
  target 60%
`;

test('metric ops: setMetricField updates or inserts, addMetric/removeMetric work', () => {
  const r = applyEdits(PRODUCT_SRC, [
    { op: 'setMetricField', name: 'conversion_rate', field: 'target', value: '70%' },
    { op: 'setMetricField', name: 'conversion_rate', field: 'window', value: '30 days after release' },
    { op: 'addMetric', name: 'checkout_time', baseline: '45s', target: '20s' },
  ]);
  assert.equal(r.applied.length, 3);
  assert.match(r.source, /# preserve me/);
  const ast = parseIntent(r.source);
  const cr = ast.metrics.find((m) => m.name === 'conversion_rate');
  assert.equal(cr.target, '70%');
  assert.equal(cr.window, '30 days after release');
  assert.ok(ast.metrics.some((m) => m.name === 'checkout_time' && m.baseline === '45s'));
  assert.equal(isFormatted(r.source), true);
});

test('outcome ops: add + remove by name', () => {
  const r = applyEdits(PRODUCT_SRC, [
    { op: 'addOutcome', name: 'FewerErrors', description: 'checkout errors drop' },
    { op: 'removeOutcome', name: 'FasterCheckout' },
  ]);
  const ast = parseIntent(r.source);
  assert.ok(ast.outcomes.some((o) => o.name === 'FewerErrors'));
  assert.ok(!ast.outcomes.some((o) => o.name === 'FasterCheckout'));
});

test('metric/outcome edits that do not match are skipped with a reason', () => {
  const r = applyEdits(PRODUCT_SRC, [
    { op: 'removeMetric', name: 'nope' },
    { op: 'addMetric', name: 'conversion_rate' },
    { op: 'setMetricField', name: 'conversion_rate', field: 'bogus', value: '1' },
  ]);
  assert.equal(r.applied.length, 0);
  assert.equal(r.skipped.length, 3);
  assert.match(r.skipped[1].reason, /already exists/);
});

const DECISION_SRC = `mission Access
use product

# a decision comment to keep
decision CanUpgrade
  inputs
    tier
    paid
  rule higherTier
    when tier > 1
    return Allowed
  default
    return NoChange
`;

test('addRule inserts a rule before default and keeps it running', async () => {
  const { evaluateDecision } = await import('../src/runtime.mjs');
  const r = applyEdits(DECISION_SRC, [{ op: 'addRule', decision: 'CanUpgrade', name: 'unpaid', when: 'paid == false', return: 'Blocked' }]);
  assert.equal(r.applied.length, 1);
  assert.match(r.source, /# a decision comment to keep/);
  assert.equal(isFormatted(r.source), true);
  const d = parseIntent(r.source).decisions[0];
  // default is still the last child
  const lines = r.source.split('\n').map((l) => l.trim()).filter(Boolean);
  assert.ok(lines.indexOf('rule unpaid') < lines.indexOf('default'), 'new rule precedes default');
  assert.equal(evaluateDecision(d, { tier: 0, paid: false }).result, 'Blocked');
});

test('setRule edits when/return, setDefault edits the default return', async () => {
  const { evaluateDecision } = await import('../src/runtime.mjs');
  const r = applyEdits(DECISION_SRC, [
    { op: 'setRule', decision: 'CanUpgrade', name: 'higherTier', return: 'Upgraded' },
    { op: 'setDefault', decision: 'CanUpgrade', return: 'Hold' },
  ]);
  const d = parseIntent(r.source).decisions[0];
  assert.equal(evaluateDecision(d, { tier: 2, paid: true }).result, 'Upgraded');
  assert.equal(evaluateDecision(d, { tier: 0, paid: true }).result, 'Hold');
  assert.equal(isFormatted(r.source), true);
});

test('removeRule deletes a rule; setDefault creates a default when absent', () => {
  const removed = applyEdits(DECISION_SRC, [{ op: 'removeRule', decision: 'CanUpgrade', name: 'higherTier' }]);
  assert.ok(!/rule higherTier/.test(removed.source));
  assert.equal(parseIntent(removed.source).decisions[0].rules.length, 0);

  const noDefault = `mission M\nuse product\ndecision D\n  rule r\n    when x > 1\n    return Y\n`;
  const withDefault = applyEdits(noDefault, [{ op: 'setDefault', decision: 'D', return: 'Z' }]);
  assert.match(withDefault.source, /default\n {4}return Z/);
  assert.equal(isFormatted(withDefault.source), true);
});

test('decision edits on a missing decision/rule are skipped with a reason', () => {
  const r = applyEdits(DECISION_SRC, [
    { op: 'addRule', decision: 'Nope', name: 'x', when: 'a', return: 'B' },
    { op: 'setRule', decision: 'CanUpgrade', name: 'ghost', return: 'B' },
    { op: 'addRule', decision: 'CanUpgrade', name: 'higherTier', when: 'a', return: 'B' },
  ]);
  assert.equal(r.applied.length, 0);
  assert.match(r.skipped[0].reason, /no decision/);
  assert.match(r.skipped[2].reason, /already exists/);
});

test('applyEdits is browser-safe (exported from /core)', () => {
  assert.equal(typeof core.applyEdits, 'function');
});
