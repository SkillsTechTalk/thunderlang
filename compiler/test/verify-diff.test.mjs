import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyDiff, VERIFY_DIFF_SCHEMA } from '../src/verify-diff.mjs';

const INTENT = `mission CreateInvoice
use product
goal
  Create an invoice for an approved order.
guarantee a duplicate invoice is not created
  verify idempotency test
never expose the payment token in logs
  verify a secret-scan of log output
input
  orderId: OrderId
  paymentToken: Secret
`;

const BEFORE = `export async function createInvoice(orderId: OrderId, paymentToken: Secret): Promise<Invoice> {
  if (await exists(orderId)) throw new DuplicateInvoice();
  return save(orderId);
}
`;
const LEAK = `export async function createInvoice(orderId: OrderId, paymentToken: Secret): Promise<Invoice> {
  if (await exists(orderId)) throw new DuplicateInvoice();
  console.log("charging with token", paymentToken);
  return save(orderId);
}
`;

test('a change that logs a protected secret BLOCKS with a line-located violation', () => {
  const r = verifyDiff(INTENT, { before: BEFORE, after: LEAK, language: 'typescript' });
  assert.equal(r.schema, VERIFY_DIFF_SCHEMA);
  assert.equal(r.verdict, 'BLOCK');
  assert.equal(r.ok, false);
  const v = r.findings.find((f) => f.code === 'INTENT_VERIFY_NEVER_VIOLATED');
  assert.ok(v, 'the guardrail hit is reported');
  assert.equal(v.line, 3);
  assert.match(v.message, /payment token/);
});

test('a clean change PASSES (deterministic contract checks satisfied)', () => {
  const r = verifyDiff(INTENT, { before: BEFORE, after: BEFORE, language: 'typescript' });
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.ok, true);
  assert.ok(!r.findings.some((f) => f.code === 'INTENT_VERIFY_NEVER_VIOLATED'));
});

test('the gate blocks only on what the CHANGE broke, not pre-existing gaps', () => {
  // BEFORE already lacks a matching guarantee-test; that is not a regression, so it must not block.
  const r = verifyDiff(INTENT, { before: BEFORE, after: BEFORE });
  assert.equal(r.blocking, 0);
  assert.ok(r.findings.some((f) => f.code === 'INTENT_DRIFT_GUARANTEE_UNSUPPORTED'), 'pre-existing gaps are still reported (as non-blocking)');
});

test('a regression (an input dropped by the change) blocks', () => {
  const dropsInput = `export async function createInvoice(orderId: OrderId): Promise<Invoice> {
  return save(orderId);
}
`;
  const r = verifyDiff(INTENT, { before: BEFORE, after: dropsInput, language: 'typescript' });
  assert.equal(r.verdict, 'BLOCK');
  const reg = r.findings.find((f) => f.code === 'INTENT_DRIFT_INPUT_REMOVED' && f.regression);
  assert.ok(reg, 'dropping the declared paymentToken input is a blocking regression');
});

test('with no `before`, fresh code is verified and a leak still blocks', () => {
  const r = verifyDiff(INTENT, { after: LEAK, language: 'typescript' });
  assert.equal(r.verdict, 'BLOCK');
  assert.ok(r.findings.some((f) => f.code === 'INTENT_VERIFY_NEVER_VIOLATED'));
});

test('a never-rule with no sensitive term does not produce false guardrail hits', () => {
  const intent = `mission M
use product
never charge an unapproved order
input
  orderId: OrderId
`;
  const code = `function charge(orderId) { console.log("processing", orderId); return ok(); }`;
  const r = verifyDiff(intent, { after: code, language: 'javascript' });
  assert.ok(!r.findings.some((f) => f.code === 'INTENT_VERIFY_NEVER_VIOLATED'), 'no secret term -> no guardrail cry-wolf');
});

test('the guardrail catches camelCase / snake_case secret names, not just spaced words', () => {
  const intent = 'mission M\nuse product\nnever expose the payment token in logs\ninput\n  paymentToken: Secret\n';
  assert.equal(verifyDiff(intent, { after: 'function f(paymentToken){ console.log(paymentToken); }', language: 'javascript' }).verdict, 'BLOCK');
  assert.equal(verifyDiff(intent, { after: 'def f(payment_token):\n    print(payment_token)', language: 'python' }).verdict, 'BLOCK');
  // no cry-wolf on an unrelated identifier that merely contains the letters
  assert.equal(verifyDiff(intent, { after: 'const x = tokenizer(); console.log(x);', language: 'javascript' }).verdict, 'PASS');
});

test('the verdict summary reports counts', () => {
  const r = verifyDiff(INTENT, { before: BEFORE, after: LEAK });
  assert.equal(r.summary.verdict, 'BLOCK');
  assert.ok(r.summary.regressions >= 1);
  assert.equal(typeof r.summary.findings, 'number');
});
