// Fewer steps shown as code on everyday code (scripts/reading-quality.mjs --shapes ranks what is still shown as code):
// text with values in it, Python counting loops, imports inside a function, and a field copied from self or this. Each
// form is checked against its code by say-less, and a wrong sentence for the same code is still shown as code. Every
// snippet here is made up for the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode } from '../src/read.mjs';
import { sayLess } from '../src/say-less.mjs';

const steps = (src, language = 'typescript') => {
  const out = [];
  const walk = (ss) => { for (const s of ss || []) { out.push(s.explained === false ? `CODE ${s.code}` : s.says); walk(s.children); } };
  walk(readCode(src, { language }).items[0].steps);
  return out;
};
/** The first step of a reading with its words replaced, then checked: true when it is still said, false when shown as code. */
const accepted = (src, language, says, at = 0) => {
  const reading = readCode(src, { language, sayEverything: true });
  const flat = [];
  const walk = (ss) => { for (const s of ss || []) { flat.push(s); walk(s.children); } };
  walk(reading.items[0].steps);
  flat[at].says = says;
  sayLess(reading, src);
  return flat[at].explained !== false;
};

test('a text with values in it keeps its text exactly, each plain value a «placeholder»', () => {
  assert.deepEqual(steps('export function f(version: string, user: any, count: number) {\n  const pkg = `@scope/pkg@${version}`;\n  const hi = `Hello ${user.name}, you have ${count} items`;\n  return [pkg, hi];\n}\n').slice(0, 2), [
    'Sets pkg to "@scope/pkg@«version»"',
    'Sets hi to "Hello «user.name», you have «count» items"',
  ]);
  assert.deepEqual(steps('def f(self, name, n):\n    msg = f"hi {name}"\n    row = f"{n:>3} items for {self.owner}"\n    return msg, row\n', 'python').slice(0, 2), ['Sets msg to "hi «name»"', 'Sets row to "«n as {:>3}» items for «self.owner»"']);
  // A value worked out inside a placeholder is not spelled as if it were a name.
  assert.doesNotMatch(steps('export function f(fix: boolean) {\n  const cmd = `run${fix ? " --fix" : ""}`;\n  return cmd;\n}\n').join('\n'), /«fix \?/);
  // The text must be the code's own text.
  assert.equal(accepted('def f(name):\n    msg = f"hi {name}"\n    return msg\n', 'python', 'Sets msg to "hello «name»"'), false);
});

test('Python counting loops say where the count starts and stops (the end itself not included)', () => {
  const said = steps('def f(n, items, self):\n    for i in range(n):\n        print(i)\n    for i in range(3):\n        print(i)\n    for _ in range(n):\n        print(1)\n    for j in range(1, self.count):\n        print(j)\n    for i in range(len(self.rows)):\n        print(i)\n    for k, v in enumerate(items):\n        print(v)\n', 'python');
  for (const want of ['Counts i from 0 up to n (not n itself)', 'Counts i from 0 to 2', 'Repeats n times', 'Counts j from 1 up to count (not count itself)', 'For each position i in rows', 'For each v in items, with its position k (from 0)']) assert.ok(said.some((s) => s.startsWith(want)), want);
  // A step, or a sum inside, is not said this way.
  assert.ok(steps('def f(n):\n    for i in range(0, n, 2):\n        print(i)\n', 'python')[0].startsWith('CODE'));
  // Wrong ends, a wrong counter, or a swapped pair are shown as code.
  const loop = 'def f(n, items):\n    for i in range(3):\n        print(i)\n';
  assert.equal(accepted(loop, 'python', 'Counts i from 0 to 2'), true);
  assert.equal(accepted(loop, 'python', 'Counts i from 0 to 3'), false);
  assert.equal(accepted(loop, 'python', 'Counts j from 0 to 2'), false);
  assert.equal(accepted('def f(n):\n    for i in range(n):\n        print(i)\n', 'python', 'Counts i from 0 up to n (not n itself)'), true);
  assert.equal(accepted('def f(n):\n    for i in range(n):\n        print(i)\n', 'python', 'Counts i from 1 up to n (not n itself)'), false);
  assert.equal(accepted('def f(n):\n    for i in range(n):\n        print(i)\n', 'python', 'Counts i from 0 to n'), false);
  const en = 'def f(items):\n    for k, v in enumerate(items):\n        print(v)\n';
  assert.equal(accepted(en, 'python', 'For each v in items, with its position k (from 0)'), true);
  assert.equal(accepted(en, 'python', 'For each k in items, with its position v (from 0)'), false);
});

test('an import inside a Python function names what it loads and where from', () => {
  assert.deepEqual(steps('def f(n):\n    from . import utils\n    from .models import Order, Item\n    import numpy as np\n    import json\n    from a.b import c as d\n    return utils\n', 'python').slice(0, 5), [
    'Loads utils from this package',
    'Loads Order and Item from the models module in this package',
    'Loads the numpy module, called np here',
    'Loads the json module',
    'Loads c (called d here) from the a.b module',
  ]);
  const src = 'def f(n):\n    from .models import Order\n    return Order\n';
  assert.equal(accepted(src, 'python', 'Loads Order from the models module in this package'), true);
  assert.equal(accepted(src, 'python', 'Loads Item from the models module in this package'), false);
  assert.equal(accepted(src, 'python', 'Loads Order from the models module'), false);
});

test('a field copied from self or this keeps its owner, so the two names are told apart', () => {
  assert.equal(steps('def f(self):\n    file = self.file\n    return file\n', 'python')[0], 'Sets file to self.file');
  assert.equal(steps('export class A {\n  f(): string {\n    const name = this.name;\n    return name;\n  }\n}\n')[0], 'Sets name to this.name');
  assert.equal(accepted('def f(self):\n    file = self.file\n    return file\n', 'python', 'Sets file to file'), false);
});
