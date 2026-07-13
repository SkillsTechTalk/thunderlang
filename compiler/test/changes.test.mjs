import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { changeReport, CHANGES_SCHEMA } from '../src/changes.mjs';
import * as barrel from '../src/index.mjs';

const g = (src) => buildIntentGraph(parseIntent(src));
const report = (before, after) => changeReport([{ path: 'M.intent', before: before ? g(before) : null, after: after ? g(after) : null }]);

test('additive change (new invariant + guarantee) is CHANGED, not a regression', () => {
  const r = report('mission M\nguarantee a\n  verify t', 'mission M\nguarantee a\n  verify t\nguarantee b\n  verify u\ninvariant I\n  statement x\n  verify iv');
  assert.equal(r.schema, CHANGES_SCHEMA);
  assert.equal(r.verdict, 'changed');
  assert.equal(r.regressions.length, 0);
  assert.ok(r.highlights.some((h) => h.kind === 'added' && h.type === 'Invariant'));
  assert.ok(r.totals.touched > 0);
});

test('removing a guarantee is a REVIEW regression', () => {
  const r = report('mission M\nguarantee a\n  verify t\nguarantee b\n  verify u', 'mission M\nguarantee a\n  verify t');
  assert.equal(r.verdict, 'review');
  assert.ok(r.regressions.some((x) => x.kind === 'removed' && x.type === 'Guarantee'));
});

test('a guarantee losing its verification is a WEAKENED regression', () => {
  const r = report('mission M\nguarantee revocation is immediate\n  verify revocation test', 'mission M\nguarantee revocation is immediate');
  assert.equal(r.verdict, 'review');
  assert.ok(r.regressions.some((x) => x.kind === 'weakened' && x.title.includes('revocation is immediate')));
  // the removed VerificationRule is also flagged
  assert.ok(r.regressions.some((x) => x.type === 'VerificationRule'));
});

test('an added .intent file (before=null) reports its nodes as added', () => {
  const r = changeReport([{ path: 'New.intent', before: null, after: g('mission New\ninvariant I\n  statement x\n  verify t') }]);
  assert.equal(r.files[0].status, 'added');
  assert.ok(r.highlights.some((h) => h.kind === 'added' && h.type === 'Invariant'));
});

test('no semantic change yields no-semantic-change', () => {
  const same = 'mission M\nguarantee a\n  verify t';
  const r = report(same, same);
  assert.equal(r.verdict, 'no-semantic-change');
  assert.equal(r.totals.added + r.totals.removed + r.totals.changed, 0);
});

test('changed-node titles resolve (never "undefined")', () => {
  // change a guarantee's verification status without removing it
  const r = report('mission M\nguarantee a holds\n  verify t', 'mission M\nguarantee a holds');
  const weak = r.highlights.find((h) => h.kind === 'weakened');
  assert.ok(weak && weak.title === 'a holds');
});

test('barrel exports the Change Lens', () => {
  assert.equal(typeof barrel.changeReport, 'function');
  assert.equal(barrel.CHANGES_SCHEMA, 'intent-changes-v1');
});
