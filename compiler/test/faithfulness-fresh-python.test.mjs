// Faithfulness for Python: minimal copies of readings graded false (D) in the fresh audit of ThunderLang 1.0.3 on
// repositories it had never seen (flask, tqdm). The sample is in the test name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderText } from './faithfulness-helpers.mjs';

test('flask#14, tqdm#1/#2/#13: a bare `raise` passes the error on; it never "Gives back raise"', () => {
  const t = thunderText('a.py', 'def f(x):\n    try:\n        g(x)\n    except ValueError:\n        log()\n        raise\n    return 1\n');
  assert.match(t, /Stop: the same error again \(passes it on\)/);
  assert.doesNotMatch(t, /Gives back raise/);
});

test('tqdm#1: `self.update()` is a call, not "Saves self"', () => {
  const t = thunderText('a.py', 'class T:\n    def step(self):\n        self.update()\n        return 1\n');
  assert.doesNotMatch(t, /Saves self/);
});

test('flask#11: `try … finally` catches nothing: it does not "handle any error"', () => {
  const t = thunderText('a.py', 'def gen(g):\n    try:\n        yield from g\n    finally:\n        g.close()\n');
  assert.doesNotMatch(t, /handles any error/);
  assert.match(t, /an error is not caught here/);
});

test('flask#11: `x is None` says None, never "empty"', () => {
  const t = thunderText('a.py', 'def f(ctx):\n    if ctx is None:\n        raise RuntimeError("no ctx")\n    return ctx\n');
  assert.doesNotMatch(t, /empty/);
  assert.match(t, /None/);
});
