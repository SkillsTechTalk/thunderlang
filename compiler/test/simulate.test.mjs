import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateChange, SIMULATE_SCHEMA } from '../src/simulate.mjs';
import * as barrel from '../src/index.mjs';

const BASE = `mission CreateInvoice
use product
goal
  Create an invoice for an approved order.
guarantee no duplicate invoice
  verify idempotency test
outcome FasterInvoicing
  "invoices created without support"
metric invoice_rate
  baseline 40%
  target 70%
`;
// proposed: drop the guarantee's verification and add a secret on an event bus
const PROPOSED = `mission CreateInvoice
use product
goal
  Create an invoice for an approved order.
guarantee no duplicate invoice
outcome FasterInvoicing
  "invoices created without support"
metric invoice_rate
  baseline 40%
  target 70%
event Charged
  payload
    token: Secret
`;
const one = (source) => [{ file: 'CreateInvoice.intent', source }];

test('simulateChange computes deterministic blast radius by type', () => {
  const r = simulateChange(one(BASE), one(PROPOSED));
  assert.equal(r.schema, SIMULATE_SCHEMA);
  assert.ok(r.changedNodes >= 1);
  assert.ok(r.deterministicImpact.total >= 1, 'the change ripples to dependents');
  // the mission (and its outcome/metric) are reachable from the changed guarantee
  const types = Object.keys(r.deterministicImpact.byType);
  assert.ok(types.includes('Mission'));
});

test('rule-derived risk and release risk are separated from dependency impact', () => {
  const r = simulateChange(one(BASE), one(PROPOSED));
  assert.ok(r.ruleDerivedRisk.some((f) => f.ruleId === 'IL-SEC-001' && f.severity === 'blocker'));
  assert.equal(r.releaseRisks.length, 1);
  assert.equal(r.summary.safe, false, 'a change that introduces a blocker is not safe');
  // AI-predicted impact is explicitly null in deterministic mode (never fabricated)
  assert.equal(r.aiPredictedImpact, null);
});

test('a purely additive, safe change is SAFE with no release risk', () => {
  const proposed = BASE + 'never charge an unapproved order\n  verify approval test\n';
  const r = simulateChange(one(BASE), one(proposed));
  assert.equal(r.summary.safe, true);
  assert.equal(r.releaseRisks.length, 0);
  assert.ok(r.changedNodes >= 1, 'the new never-rule is a change');
});

test('no change -> nothing touched, safe', () => {
  const r = simulateChange(one(BASE), one(BASE));
  assert.equal(r.changedNodes, 0);
  assert.equal(r.deterministicImpact.total, 0);
  assert.equal(r.summary.safe, true);
});

test('simulateChange is exported from the barrel', () => {
  assert.equal(typeof barrel.simulateChange, 'function');
});
