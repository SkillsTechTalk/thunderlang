import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { diffGraphs, mergeGraphs } from '../src/semantic-diff.mjs';

const g = (s) => buildIntentGraph(parseIntent(s));

test('diffGraphs reports added / removed / changed nodes + relationships', () => {
  const v1 = g('mission M\nguarantees\n  a holds\noutcome O\n  "x"\n');
  const v2 = g('mission M\nguarantees\n  a holds\n  b holds\n');           // +guarantee b, -outcome O
  const d = diffGraphs(v1, v2);
  assert.equal(d.schema, 'intent-diff-v1');
  assert.ok(d.addedNodes.some((n) => n.type === 'Guarantee'));
  assert.ok(d.removedNodes.some((n) => n.type === 'Outcome'));
  assert.ok(d.summary.relationshipsAdded >= 1);
});

test('a contract change invalidates the mission approvals (directive #4)', () => {
  const v1 = g('mission Pay\nguarantees\n  amount is never negative\napproval required from\n  Finance\n');
  const v2 = g('mission Pay\nguarantees\n  amount is never negative or zero\napproval required from\n  Finance\n');
  const d = diffGraphs(v1, v2);
  assert.deepEqual(d.invalidatedApprovals, ['approval.pay.finance']);
  assert.equal(d.summary.approvalsInvalidated, 1);
});

test('a non-contract change (a note) does NOT invalidate approvals', () => {
  const v1 = g('mission Pay\nguarantees\n  amount is never negative\napproval required from\n  Finance\n');
  const v2 = g('mission Pay\nguarantees\n  amount is never negative\napproval required from\n  Finance\nnote pm: hi\n');
  assert.equal(diffGraphs(v1, v2).invalidatedApprovals.length, 0);
});

test('identical graphs -> empty diff (deterministic, no false changes)', () => {
  const a = g('mission M\nguarantees\n  a holds\n');
  const b = g('mission M\nguarantees\n  a holds\n');
  const d = diffGraphs(a, b);
  assert.equal(d.summary.added, 0);
  assert.equal(d.summary.removed, 0);
  assert.equal(d.summary.changed, 0);
});

test('a status change on a node is detected as changed (same id, different content)', () => {
  const v1 = g('mission M\nlifecycle L\n  state A\n  state B\n  transition T\n    from A\n    to B\n');       // B is dead-end (defined)
  const v2 = g('mission M\nlifecycle L\n  state A\n  state B\n  transition T\n    from A\n    to B\n  terminal B\n'); // B terminal (verified)
  const d = diffGraphs(v1, v2);
  assert.ok(d.changedNodes.some((c) => c.id.includes('lifecycle-state') && c.after.status !== c.before.status));
});

// --- Three-way semantic merge (mergeGraphs) ------------------------------------

test('mergeGraphs: concurrent non-conflicting additions merge clean, both kept', () => {
  const base = g('mission M\nguarantees\n  a holds\n');
  const ours = g('mission M\nguarantees\n  a holds\n  b holds\n');       // + guarantee b
  const theirs = g('mission M\nguarantees\n  a holds\n  c holds\n');     // + guarantee c
  const m = mergeGraphs(base, ours, theirs);
  assert.equal(m.schema, 'intent-merge-v1');
  assert.ok(m.clean);
  assert.equal(m.conflicts.length, 0);
  const guarantees = m.merged.nodes.filter((n) => n.type === 'Guarantee');
  assert.equal(guarantees.length, 3); // a (base) + b (ours) + c (theirs)
});

test('mergeGraphs: same node changed differently on both sides -> conflict', () => {
  const base = g('mission M\ntitle "Base"\n');
  const ours = g('mission M\ntitle "Ours"\n');
  const theirs = g('mission M\ntitle "Theirs"\n');
  const m = mergeGraphs(base, ours, theirs);
  assert.equal(m.clean, false);
  assert.equal(m.conflicts.length, 1);
  const c = m.conflicts[0];
  assert.equal(c.id, 'mission.m');
  assert.equal(c.ours.title, 'Ours');
  assert.equal(c.theirs.title, 'Theirs');
  // merged keeps ours provisionally
  assert.equal(m.merged.nodes.find((n) => n.id === 'mission.m').title, 'Ours');
});

test('mergeGraphs: both sides make the identical change -> no conflict', () => {
  const base = g('mission M\ntitle "Base"\n');
  const same = 'mission M\ntitle "Agreed"\n';
  const m = mergeGraphs(base, g(same), g(same));
  assert.ok(m.clean);
  assert.equal(m.merged.nodes.find((n) => n.id === 'mission.m').title, 'Agreed');
});

test('mergeGraphs: a change on one side with no change on the other is taken (no conflict)', () => {
  const base = g('mission M\ntitle "Base"\n');
  const ours = g('mission M\ntitle "Ours"\n');   // ours edits
  const m = mergeGraphs(base, ours, base);        // theirs untouched
  assert.ok(m.clean);
  assert.equal(m.merged.nodes.find((n) => n.id === 'mission.m').title, 'Ours');
});

test('mergeGraphs: identical inputs are a no-op idempotent merge', () => {
  const graph = g('mission M\nguarantees\n  a holds\n  b holds\n');
  const m = mergeGraphs(graph, graph, graph);
  assert.ok(m.clean);
  assert.equal(m.merged.nodes.length, graph.nodes.length);
  assert.equal(m.merged.relationships.length, graph.relationships.length);
});
