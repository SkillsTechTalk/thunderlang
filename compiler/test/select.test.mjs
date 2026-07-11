import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSelection, regionMetrics, selectCandidate } from '../src/select.mjs';

test('parseSelection structures require + prefer with directions', () => {
  const p = parseSelection([
    'require all verification checks',
    'prefer lower complexity',
    'prefer fewer dependencies',
    'prefer smaller implementation',
    'prefer better mutation score',
  ]);
  assert.equal(p.requireAllChecks, true);
  assert.deepEqual(p.prefer, [
    { metric: 'complexity', direction: 'min' },
    { metric: 'dependencies', direction: 'min' },
    { metric: 'size', direction: 'min' },
    { metric: 'mutationScore', direction: 'max' }, // "better" -> maximize
  ]);
});

test('regionMetrics counts size, complexity, dependencies deterministically', () => {
  const m = regionMetrics('import x from "y";\nfunction f(c){ if(c.a) return 1; return 0; }');
  assert.equal(m.dependencies, 1);
  assert.ok(m.complexity >= 2); // if + returns
  assert.ok(m.size >= 1);
});

test('selectCandidate picks by measurable rules, deterministically', () => {
  const cands = [
    { id: 'B', metrics: { complexity: 9, dependencies: 1, size: 5 }, checksPassed: true },
    { id: 'A', metrics: { complexity: 1, dependencies: 0, size: 3 }, checksPassed: true },
  ];
  const policy = parseSelection(['prefer lower complexity', 'prefer fewer dependencies']);
  const r = selectCandidate(cands, policy);
  assert.equal(r.winner.id, 'A'); // lower complexity wins
  // deterministic + total order
  assert.deepEqual(r.ranking.map((c) => c.id), ['A', 'B']);
});

test('require all checks excludes failed candidates even if smaller', () => {
  const cands = [
    { id: 'small-but-broken', metrics: { complexity: 1, size: 1 }, checksPassed: false },
    { id: 'ok', metrics: { complexity: 3, size: 4 }, checksPassed: true },
  ];
  const r = selectCandidate(cands, { requireAllChecks: true, prefer: [{ metric: 'complexity', direction: 'min' }] });
  assert.equal(r.winner.id, 'ok');
  assert.equal(r.eligibleCount, 1);
  assert.equal(r.rejected, 1);
});

test('max direction and stable tiebreak by id', () => {
  const cands = [
    { id: 'z', metrics: { mutationScore: 80 } },
    { id: 'a', metrics: { mutationScore: 80 } },
    { id: 'm', metrics: { mutationScore: 90 } },
  ];
  const r = selectCandidate(cands, { prefer: [{ metric: 'mutationScore', direction: 'max' }] });
  assert.equal(r.winner.id, 'm');           // highest mutation score
  assert.deepEqual(r.ranking.map((c) => c.id), ['m', 'a', 'z']); // tie 80 broken by id a<z
});

test('missing metric ranks last for that comparison; falls through to next rule', () => {
  const cands = [
    { id: 'has-none', metrics: {} },
    { id: 'has-complexity', metrics: { complexity: 5 } },
  ];
  const r = selectCandidate(cands, { prefer: [{ metric: 'complexity', direction: 'min' }] });
  assert.equal(r.winner.id, 'has-complexity');
});
