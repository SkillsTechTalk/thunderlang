// The browser playground's work (src/app/playground/core-playground.mjs): run, try a function, tests, steps, links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from '../../src/app/playground/core-playground.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('every example on the playground compiles and runs', () => {
  const page = read('src/app/playground/page.tsx');
  const files = [...page.matchAll(/"((?:examples\/core|thunderbench\/programs)\/[\w-]+\.thunder)"/g)].map((m) => m[1]);
  assert.ok(files.length >= 6);
  for (const f of files) {
    assert.deepEqual(P.problemsOf(read(f)), [], f);
    assert.equal(P.runProgram(read(f)).status, 0, f);
  }
});

test('try a function with typed values; a value Thunder cannot read says how to write it', () => {
  const src = read('thunderbench/programs/refund.thunder');
  assert.deepEqual(P.functionsOf(src).map((f) => [f.name, f.inputs.map((i) => i.name)]), [['decide refund', ['amount', 'days since purchase', 'already refunded']]]);
  assert.deepEqual(P.tryCall(src, 'decide refund', ['100', '12', 'no']), { ok: true, value: 'approve' });
  assert.deepEqual(P.tryCall(src, 'decide refund', ['101', '12', 'no']), { ok: true, value: 'review' });
  const bad = P.tryCall(src, 'decide refund', ['100', '12', 'maybe']);
  assert.equal(bad.ok, false);
  assert.match(bad.hint, /yes or no/);
  assert.match(P.tryCall(src, 'decide refund', ['100', '', 'no']).error, /every input/);
  // Calling a function does not also run the program's own steps.
  assert.deepEqual(P.tryCall('To double:\n  Receive n\n  Give n * 2\nsay "the program ran"\n', 'double', ['21']), { ok: true, value: '42' });
});

test('tests, steps, problems, and share links', () => {
  const t = P.testProgram(read('examples/core/trading-journal.thunder'));
  assert.equal(t.failed, 0);
  assert.ok(t.passed >= 4);
  assert.deepEqual(P.testProgram('say 1\n'), { none: true });
  const failing = P.testProgram('To double:\n  Receive n\n  Give n * 2\nTest "wrong":\n  Expect double with 2 to be 5\n');
  assert.equal(failing.failed, 1);
  assert.ok(failing.tests[0].why);
  const s = P.stepsOf('Set total to 0\nFor each n from 1 to 3:\n  Set total to total + n\nsay total\n');
  assert.equal(s.stdout, '6\n');
  assert.ok(s.steps.some((x) => x.says === 'total: 3 → 6'));
  const probs = P.problemsOf('Set total to 0\nsay totl\n');
  assert.equal(probs[0].line, 2);
  assert.match(probs[0].hint ?? probs[0].message, /total/);
  const src = '# shared ⚡\nsay "from a link"\n';
  assert.equal(P.decodeProgram(P.encodeProgram(src)), src);
  assert.match(P.encodeProgram(src), /^[\w-]+$/);
  assert.equal(P.decodeProgram('%%%'), null);
});
