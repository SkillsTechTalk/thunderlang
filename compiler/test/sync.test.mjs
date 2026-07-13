import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseToStructured, proposeIntent, SYNC_SCHEMA } from '../src/sync.mjs';
import * as core from '../src/core.mjs';

const SRC = `mission CreateInvoice
use product

goal
  Create an invoice for an approved order.

guarantee invoice.total is never negative
  verify a non-negative test

input
  orderId: OrderId
  total: Money
`;

test('parseToStructured returns the canonical graph + flat PM fields', () => {
  const s = parseToStructured(SRC);
  assert.equal(s.schema, SYNC_SCHEMA);
  assert.equal(s.mission, 'CreateInvoice');
  assert.ok(Array.isArray(s.graph.nodes) && s.graph.nodes.length > 0);
  assert.equal(s.fields.goal.trim().startsWith('Create an invoice'), true);
  assert.deepEqual(s.fields.guarantees, ['invoice.total is never negative']);
  assert.deepEqual(s.fields.inputs, [{ name: 'orderId', type: 'OrderId' }, { name: 'total', type: 'Money' }]);
});

test('proposeIntent regenerates source + a reviewable diff, and never applies', () => {
  const structured = parseToStructured(SRC);
  const proposal = proposeIntent(structured, { base: SRC });
  assert.equal(proposal.ok, true);
  assert.equal(proposal.applied, false, 'a proposal is never a silent rewrite');
  assert.match(proposal.source, /mission CreateInvoice/);
  assert.ok(proposal.diff, 'a base yields a reviewable diff');
  // same-in-same-out -> the diff has no node churn
  assert.equal(proposal.diff.addedNodes.length, 0);
  assert.equal(proposal.diff.removedNodes.length, 0);
});

test('a real change shows up in the diff (added guarantee node)', () => {
  const before = parseToStructured(SRC);
  const edited = parseToStructured(SRC + 'guarantee the order must be approved first\n  verify approval test\n');
  const proposal = proposeIntent(edited, { base: before });
  assert.equal(proposal.ok, true);
  assert.ok(proposal.diff.addedNodes.some((n) => n.type === 'Guarantee'), 'the new guarantee is an added node');
});

test('proposeIntent surfaces ambiguity (non-factual nodes) instead of guessing', () => {
  const s = parseToStructured(`mission M
use product
assumption users have verified emails
  confidence low
`);
  const proposal = proposeIntent(s);
  assert.ok(proposal.ambiguities.length >= 1, 'assumption is non-factual -> flagged');
  assert.ok(proposal.ambiguities.every((a) => a.classification && a.reason));
});

test('proposeIntent warns that comments are not preserved on regeneration', () => {
  const withComments = `mission M\nuse product\n# a human note that must not be silently dropped\ngoal\n  do the thing\n`;
  const s = parseToStructured(withComments);
  const proposal = proposeIntent(s, { base: withComments });
  assert.ok(proposal.warnings.some((w) => /comment/i.test(w)), 'comment-preservation gap is disclosed');
});

test('proposeIntent rejects a non-graph input clearly', () => {
  const r = proposeIntent({ nope: true });
  assert.equal(r.ok, false);
  assert.match(r.error, /intent graph/i);
});

test('the sync API is browser-safe (exported from /core)', () => {
  assert.equal(typeof core.parseToStructured, 'function');
  assert.equal(typeof core.proposeIntent, 'function');
});
