import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftIntent, DRAFT_SCHEMA } from '../src/draft.mjs';
import { parseIntent } from '../src/parse.mjs';
import { isFormatted } from '../src/format.mjs';
import * as core from '../src/core.mjs';

const BRIEF = {
  mission: 'create invoice',
  goal: 'Create exactly one invoice for an approved order.',
  actor: 'BillingCustomer',
  guarantees: [
    { statement: 'a duplicate invoice is not created', because: 'double billing breaks trust', verify: 'idempotency test' },
    { statement: 'totals are never negative' },
  ],
  inputs: [{ name: 'orderId', type: 'OrderId' }, { name: 'paymentToken', type: 'Secret' }],
  decisions: [{ name: 'CanBill', inputs: ['approved'], rules: [{ name: 'notApproved', when: 'approved == false', return: 'Blocked' }] }],
};

test('draftIntent scaffolds canonical, parseable intent from a brief', () => {
  const r = draftIntent(BRIEF);
  assert.equal(r.schema, DRAFT_SCHEMA);
  assert.equal(isFormatted(r.source), true, 'draft is canonically formatted');
  const ast = parseIntent(r.source);
  assert.equal(ast.mission, 'CreateInvoice', 'mission name is PascalCased from "create invoice"');
  assert.equal(ast.guarantees.length, 2);
  assert.equal(ast.inputs.length, 2);
  assert.equal(ast.decisions[0].name, 'CanBill');
});

test('the review checklist flags the real gaps', () => {
  const r = draftIntent(BRIEF);
  const kinds = r.review.map((x) => x.kind);
  assert.ok(kinds.includes('guarantee-unverified'), 'the guarantee with no verify is flagged');
  assert.ok(kinds.includes('decision-no-default'), 'the decision with no default is flagged');
  assert.ok(kinds.includes('secret-unguarded'), 'the unguarded Secret input is flagged');
  assert.ok(r.review.every((x) => x.message));
});

test('a covered secret is not re-flagged', () => {
  const r = draftIntent({ ...BRIEF, neverRules: ['expose paymentToken in logs'] });
  assert.ok(!r.review.some((x) => x.kind === 'secret-unguarded'));
});

test('a bare brief flags the missing goal and guarantees', () => {
  const r = draftIntent({ mission: 'Thing' });
  const kinds = r.review.map((x) => x.kind);
  assert.ok(kinds.includes('missing-goal'));
  assert.ok(kinds.includes('no-guarantees'));
  assert.equal(parseIntent(r.source).mission, 'Thing');
});

test('guarantees accept strings or objects; the draft never claims verified', () => {
  const r = draftIntent({ mission: 'M', goal: 'do it', guarantees: ['x holds'] });
  assert.match(r.source, /guarantee x holds/);
  assert.ok(!/verified/i.test(r.source), 'a draft is a proposal, not verified');
});

test('draftIntent is browser-safe (exported from /core)', () => {
  assert.equal(typeof core.draftIntent, 'function');
});
