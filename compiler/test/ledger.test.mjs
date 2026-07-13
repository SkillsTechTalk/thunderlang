import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyLedger, record, recordAll, verifyLedger, LEDGER_SCHEMA,
  recordIntentVersion, recordDecision, recordApproval, recordCorrection, recordRiskAcceptance,
  recordLessonVersion, whyBuilt, approvalsFor, acceptedRisks, correctionsFor, staleLessons, explain,
} from '../src/ledger.mjs';
import * as barrel from '../src/index.mjs';

function sampleLedger() {
  let L = emptyLedger();
  L = recordIntentVersion(L, 'CreateInvoice', { hash: 'sha256:abc', version: '1' }, { at: 't0' });
  L = recordDecision(L, 'CreateInvoice', { reason: 'r' }, { actor: 'arch', at: 't1', note: 'chose idempotency key' });
  L = recordApproval(L, 'CreateInvoice', {}, { actor: 'pm', at: 't2' });
  L = recordCorrection(L, 'CreateInvoice', { from: 'assumed: any order', to: 'decided: approved only' }, { at: 't3' });
  L = recordRiskAcceptance(L, 'CreateInvoice', { finding: 'IL-DATA-002', reason: 'downstream', expires: 'later' }, { actor: 'sec', at: 't4' });
  return L;
}

test('the ledger hash-chains entries and verifies clean', () => {
  const L = sampleLedger();
  assert.equal(L.schema, LEDGER_SCHEMA);
  assert.equal(L.entries.length, 5);
  assert.equal(verifyLedger(L).valid, true);
  // each entry links to the previous hash (a real chain)
  for (let i = 1; i < L.entries.length; i += 1) assert.equal(L.entries[i].prev, L.entries[i - 1].hash);
  assert.equal(L.head, L.entries[4].hash);
});

test('tampering with any field breaks the chain, located to the entry', () => {
  const L = sampleLedger();
  const tampered = { ...L, entries: L.entries.map((e, i) => (i === 1 ? { ...e, note: 'rewritten' } : e)) };
  const v = verifyLedger(tampered);
  assert.equal(v.valid, false);
  assert.equal(v.brokenAt, 1);
  assert.match(v.reason, /tampered|hash/);
});

test('a reordered or renumbered entry is caught', () => {
  const L = sampleLedger();
  const swapped = { ...L, entries: [L.entries[1], L.entries[0], ...L.entries.slice(2)] };
  assert.equal(verifyLedger(swapped).valid, false);
});

test('the ledger answers why/who/corrections/risks for a subject', () => {
  const L = sampleLedger();
  const ex = explain(L, 'CreateInvoice');
  assert.deepEqual(ex.why, ['chose idempotency key']);
  assert.deepEqual(ex.approvedBy, ['pm']);
  assert.equal(ex.corrections.length, 1);
  assert.equal(ex.corrections[0].to, 'decided: approved only');
  assert.equal(ex.acceptedRisks.length, 1);
  assert.equal(ex.changeCount, 5);
  assert.equal(whyBuilt(L, 'CreateInvoice').length, 1);
  assert.equal(approvalsFor(L, 'CreateInvoice').length, 1);
  assert.equal(acceptedRisks(L).length, 1);
  assert.equal(correctionsFor(L, 'CreateInvoice').length, 1);
});

test('stale lessons are queryable', () => {
  let L = emptyLedger();
  L = recordLessonVersion(L, 'CreateInvoice', { version: '2', stale: true }, { at: 't' });
  L = recordLessonVersion(L, 'Other', { version: '1', stale: false }, { at: 't' });
  assert.equal(staleLessons(L).length, 1);
});

test('record rejects an unknown entry type; is append-only (returns a new ledger)', () => {
  assert.throws(() => record(emptyLedger(), { type: 'nope' }), /unknown entry type/);
  const L0 = emptyLedger();
  const L1 = record(L0, { type: 'change', subject: 'x', at: 't' });
  assert.equal(L0.entries.length, 0, 'original ledger is not mutated');
  assert.equal(L1.entries.length, 1);
});

test('recordAll folds a batch; ledger is exported from the barrel', () => {
  const L = recordAll(emptyLedger(), [{ type: 'change', subject: 'a', at: 't' }, { type: 'change', subject: 'b', at: 't' }]);
  assert.equal(L.entries.length, 2);
  assert.equal(verifyLedger(L).valid, true);
  assert.equal(typeof barrel.verifyLedger, 'function');
  assert.equal(typeof barrel.recordDecision, 'function');
});
