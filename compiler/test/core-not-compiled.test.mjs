// A program with problems is never run by the engine API (src/core/engine-core.mjs), and a name that is only an
// article ("a", "an", "the") says so. Both found while building the browser playground.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileCore } from '../src/core/index.mjs';
import { runInProcess, recordedRun, testInProcess } from '../src/core/engine-core.mjs';

const BROKEN = 'To plus:\n  Receive first and second\n  Give first + second\nTest "wrong":\n  Expect plus with 1 and 2 to be 4\n';

test('the engine never runs a program that did not compile, and says why', () => {
  const r = compileCore(BROKEN, { file: 'main.thunder' });
  assert.equal(r.ok, false);
  for (const out of [runInProcess({ entry: r, cwd: '.' }), recordedRun({ entry: r, cwd: '.' }), testInProcess({ results: [{ ...r, file: 'main.thunder', module: 'main', kind: 'src' }], cwd: '.' })]) {
    assert.equal(out.status, 2);
    assert.equal(out.stdout, '');
    assert.match(out.stderr, /line 1: A name can't contain the word "plus".*\[TC202\]/);
    assert.match(out.stderr, /Nothing was run: fix the problems first\./);
  }
});

test('a program that compiles still runs and tests as before', () => {
  const r = compileCore(BROKEN.replace(/plus/g, 'combine'), { file: 'main.thunder' });
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
  const t = testInProcess({ results: [{ ...r, file: 'main.thunder', module: 'main', kind: 'src' }], cwd: '.' });
  assert.equal(t.status, 1);
  assert.match(t.stdout, /FAIL {2}wrong/);
});

test('a name that is only "a", "an", or "the" says Thunder skips those words', () => {
  const r = compileCore('To add:\n  Receive a and b\n  Give a + b\n', { file: 'main.thunder' });
  assert.equal(r.ok, false);
  assert.match(r.diagnostics[0].message, /"a" can't be a name on its own: Thunder skips "a", "an", and "the"/);
  assert.match(r.diagnostics[0].hint, /first number/);
  assert.equal(compileCore('To f:\n  Receive the total\n  Give total\nsay f with 3\n', { file: 'main.thunder' }).ok, true);
});
