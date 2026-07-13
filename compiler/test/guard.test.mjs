import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileGuard, buildGuard, guardSummary, GUARD_SCHEMA } from '../src/guard.mjs';
import { parseIntent } from '../src/parse.mjs';
import * as core from '../src/core.mjs';

const INTENT = `mission Refund
use product
never expose the payment token in logs
input
  amount
  paymentToken: Secret
  customerEmail: Email
data customer.ssn
  classification pii
  purpose "verify identity"
  retention 30 days
  basis legal_obligation
decision RefundDecision
  inputs
    amount
    approved
  rule notApproved
    when approved == false
    return Deny
  rule tooBig
    when amount > 1000
    return NeedsReview
  default
    return AutoApprove
`;

test('the guard derives secret/PII fields from types, names, and data classification', () => {
  const g = compileGuard(INTENT);
  assert.equal(g.schema, GUARD_SCHEMA);
  assert.ok(g.secretFields.includes('paymentToken'), 'Secret-typed field');
  assert.ok(g.secretFields.includes('ssn'), 'pii data element');
  // Email is not a secret by default
  assert.ok(!g.secretFields.includes('customerEmail'));
});

test('redact masks secret fields deeply (nested + arrays), leaving the rest intact', () => {
  const g = compileGuard(INTENT);
  const out = g.redact({ amount: 50, paymentToken: 'tok_live', items: [{ paymentToken: 'tok_2', qty: 3 }], ssn: '111' });
  assert.equal(out.amount, 50);
  assert.equal(out.paymentToken, '[redacted]');
  assert.equal(out.items[0].paymentToken, '[redacted]');
  assert.equal(out.items[0].qty, 3);
  assert.equal(out.ssn, '[redacted]');
});

test('redact also masks secret-looking keys not declared in the intent', () => {
  const g = compileGuard('mission M\nuse product\n');
  const out = g.redact({ password: 'p', apiKey: 'k', name: 'ok' });
  assert.equal(out.password, '[redacted]');
  assert.equal(out.apiKey, '[redacted]');
  assert.equal(out.name, 'ok');
});

test('decisions become a runtime gate: assertAllowed throws when the intent denies', () => {
  const g = compileGuard(INTENT);
  assert.equal(g.decide('RefundDecision', { amount: 50, approved: true }).allowed, true);
  assert.equal(g.decide('RefundDecision', { amount: 50, approved: false }).allowed, false);
  assert.throws(
    () => g.assertAllowed('RefundDecision', { amount: 50, approved: false }),
    (e) => e.code === 'INTENT_GUARD_DENIED' && e.decision === 'RefundDecision' && e.result === 'Deny',
  );
  // an allowed action returns the evaluation, does not throw
  const ok = g.assertAllowed('RefundDecision', { amount: 50, approved: true });
  assert.equal(ok.result, 'AutoApprove');
});

test('an explicit denyResults set overrides the default deny inference', () => {
  const g = compileGuard(INTENT, { denyResults: ['NeedsReview'] });
  // "Deny" is no longer auto-denied; only NeedsReview is
  assert.equal(g.decide('RefundDecision', { amount: 50, approved: false }).allowed, true);
  assert.equal(g.decide('RefundDecision', { amount: 2000, approved: true }).allowed, false);
});

test('a custom mask token is honored; assertAllowed on an unknown decision throws clearly', () => {
  const g = compileGuard(INTENT, { mask: '***' });
  assert.equal(g.redact({ paymentToken: 'x' }).paymentToken, '***');
  assert.throws(() => g.decide('Nope', {}), /no decision "Nope"/);
});

test('guardSummary is the JSON-able audit view; buildGuard works on an AST', () => {
  const s = guardSummary(parseIntent(INTENT));
  assert.ok(s.redactsFields.includes('paymentToken'));
  assert.deepEqual(s.enforcesDecisions, ['RefundDecision']);
  assert.ok(s.neverRules.length >= 1);
  assert.equal(typeof buildGuard(parseIntent(INTENT)).redact, 'function');
});

test('the guard is browser-safe (exported from /core)', () => {
  assert.equal(typeof core.compileGuard, 'function');
  assert.equal(typeof core.buildGuard, 'function');
});
