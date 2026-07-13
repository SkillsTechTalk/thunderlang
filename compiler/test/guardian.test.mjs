import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardianReport, GUARDIAN_SCHEMA } from '../src/guardian.mjs';
import * as barrel from '../src/index.mjs';

const BEFORE = `mission CreateInvoice
use product
goal
  Create an invoice for an approved order.
guarantee no duplicate invoice
  verify idempotency test
`;
// after: the guarantee lost its verification AND a secret now rides an event
const AFTER = `mission CreateInvoice
use product
goal
  Create an invoice for an approved order.
guarantee no duplicate invoice
event Charged
  payload
    token: Secret
`;
const one = (source) => [{ file: 'CreateInvoice.intent', source }];

test('guardian reports the drift a change introduced (needs-attention)', () => {
  const r = guardianReport(one(BEFORE), one(AFTER));
  assert.equal(r.schema, GUARDIAN_SCHEMA);
  assert.equal(r.verdict, 'needs-attention');
  // introduced risk: the removed verification + the new secret-on-bus blocker
  assert.ok(r.introducedRisk.some((f) => f.ruleId === 'guarantee-without-verification'));
  assert.ok(r.introducedRisk.some((f) => f.ruleId === 'IL-SEC-001' && f.severity === 'blocker'));
  assert.equal(r.summary.introducedBlocking, 1);
});

test('affected intent + must-reverify are deduped by identity', () => {
  const r = guardianReport(one(BEFORE), one(AFTER));
  assert.deepEqual(r.affectedIntent.map((n) => n.title || n.id), ['CreateInvoice']);
  const ids = r.mustReverify.map((m) => m.id);
  assert.equal(ids.length, new Set(ids).size, 'no duplicate reverify entries');
  assert.ok(r.mustReverify.some((m) => m.type === 'Guarantee'));
});

test('learning freshness: the changed mission is flagged for refresh', () => {
  const r = guardianReport(one(BEFORE), one(AFTER));
  assert.ok(r.staleLearning.some((l) => l.scope === 'CreateInvoice'));
});

test('a change that RESOLVES risk is reported and does not need attention', () => {
  const messy = `mission M\nuse product\nguarantee x holds\n`;
  const clean = `mission M\nuse product\ngoal\n  do it\nguarantee x holds\n  verify a test\n`;
  const r = guardianReport(one(messy), one(clean));
  assert.ok(r.resolvedRisk.some((f) => f.ruleId === 'guarantee-without-verification'));
  assert.notEqual(r.verdict, 'needs-attention');
});

test('no change -> clear verdict, empty deltas', () => {
  const r = guardianReport(one(BEFORE), one(BEFORE));
  assert.equal(r.verdict, 'clear');
  assert.equal(r.introducedRisk.length, 0);
  assert.equal(r.mustReverify.length, 0);
});

test('guardianReport is exported from the barrel', () => {
  assert.equal(typeof barrel.guardianReport, 'function');
});
