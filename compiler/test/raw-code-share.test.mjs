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

test('everyday Python values: arithmetic, an empty set, a written-out list, slices, and a lookup with a fallback', () => {
  const said = steps('def f(self, a, b, d, items):\n    diff = a - b\n    area = a * 2\n    s = set()\n    xs = [a]\n    ys = [a, b, 3]\n    h = items[1:]\n    k = items[:3]\n    l = items[-1]\n    t = items[-2:]\n    u = items[:-1]\n    v = d.get("key")\n    w = d.get("key", 0)\n    return diff\n', 'python');
  assert.deepEqual(said.slice(0, 12), [
    'Sets diff to a minus b', 'Sets area to a times 2', 'Sets s to an empty set', 'Sets xs to a list with only a', 'Sets ys to a list of a, b, and 3',
    'Sets h to items without the first 1', 'Sets k to the first 3 of items', 'Sets l to the last of items', 'Sets t to the last 2 of items', 'Sets u to items without the last 1',
    'Sets v to the "key" value from d', 'Sets w to the "key" value from d, or 0 if it has none',
  ]);
  // The wrong end of a slice, or a fallback left out, is shown as code.
  const sl = 'def f(items):\n    h = items[1:]\n    return h\n';
  assert.equal(accepted(sl, 'python', 'Sets h to items without the first 1'), true);
  assert.equal(accepted(sl, 'python', 'Sets h to the first 1 of items'), false);
  assert.equal(accepted(sl, 'python', 'Sets h to items without the last 1'), false);
  assert.equal(accepted('def f(d):\n    w = d.get("key", 5)\n    return w\n', 'python', 'Sets w to the "key" value from d'), false);
  // (Text joined with + stays "text built from its parts" or code: "plus" is said only with a number.)
  assert.doesNotMatch(steps('def f(a, b):\n    x = a + b\n    return x\n', 'python')[0], /plus/);
});

test('Python loops over what a call gives name that call, and an inclusive range says so', () => {
  const said = steps('def f(rows, db, n):\n    for r in rows.values():\n        print(r)\n    for r in sorted(rows):\n        print(r)\n    for r in db.fetch_all("x"):\n        print(r)\n    for i in range(1, n + 1):\n        print(i)\n', 'python');
  for (const want of ['For each r in the values of rows', 'For each r in rows, sorted', 'For each r in the result of fetch all', 'Counts i from 1 to n']) assert.ok(said.some((s) => s.startsWith(want)), want);
  // "the result of" names the outermost call only (`text.lower().split()` is split, never lower).
  const chain = 'def f(text):\n    for w in text.lower().split():\n        print(w)\n';
  assert.equal(accepted(chain, 'python', 'For each w in the result of lower'), false);
  const inc = 'def f(n):\n    for i in range(1, n + 1):\n        print(i)\n';
  assert.equal(accepted(inc, 'python', 'Counts i from 1 to n'), true);
  assert.equal(accepted(inc, 'python', 'Counts i from 1 up to n (not n itself)'), false);
});

test('Rust: a loop until a step stops it, loops over collections and ranges, Ok(...) given back, and the ? said', () => {
  const said = steps('pub fn run(&self, n: usize, map: HashMap<String, i32>, s: &str) -> Result<usize, E> {\n    loop {\n        step();\n    }\n    for item in self.items.iter() {\n        step(item);\n    }\n    for (k, v) in map.iter() {\n        step(k);\n    }\n    for i in 0..n {\n        step(i);\n    }\n    for i in 1..=n {\n        step(i);\n    }\n    for i in 0..3 {\n        step(i);\n    }\n    for c in s.chars() {\n        step(c);\n    }\n    let y = compute(n)?;\n    return Ok(y);\n}\n', 'rust');
  for (const want of ['Repeats until a step inside stops it', 'For each item in items', 'For each k and v in map', 'Counts i from 0 up to n (not n itself)', 'Counts i from 1 to n', 'Counts i from 0 to 2', 'For each c in the characters of s', 'Works out y from compute, and stops here if that fails', 'Returns y (Ok)']) assert.ok(said.some((x) => x.startsWith(want)), want);
  // Rust's Ok(x) is never read as an HTTP answer.
  assert.doesNotMatch(said.join('\n'), /Sends|Responds/);
  assert.equal(steps('fn g() -> Result<(), E> {\n    Ok(())\n}\n', 'rust')[0], 'Returns nothing (Ok)');
  // Wrong ends, a dropped ?, or the wrong call are shown as code.
  const r = 'fn f(n: usize) {\n    for i in 0..n {\n        step(i);\n    }\n}\n';
  assert.equal(accepted(r, 'rust', 'Counts i from 0 up to n (not n itself)'), true);
  assert.equal(accepted(r, 'rust', 'Counts i from 0 to n'), false);
  const q = 'fn f(x: i32) -> Result<i32, E> {\n    let y = compute(x)?;\n    Ok(y)\n}\n';
  assert.equal(accepted(q, 'rust', 'Works out y from compute, and stops here if that fails'), true);
  assert.equal(accepted(q, 'rust', 'Works out y from compute'), false);
  assert.equal(accepted(q, 'rust', 'Works out y from load, and stops here if that fails'), false);
});

test('a TypeScript function whose return type is an object type is read from its body, not from the type', () => {
  const said = steps('export function git(repo: string, args: string[]): { ok: boolean; out: string } {\n  const r = run(repo, args);\n  return r;\n}\n');
  assert.ok(!said.some((x) => /ok: boolean|out: string/.test(x)), said.join(' | '));
  assert.equal(said.at(-1), 'Returns r');
});

test('a JavaScript template with a worked-out value keeps its exact text, the value shown as «…»', () => {
  const src = 'export function f(err: any) {\n  const msg = `Check could not run: ${String(err)}`;\n  return msg;\n}\n';
  assert.equal(steps(src)[0], 'Sets msg to "Check could not run: «…»"');
  assert.equal(accepted(src, 'typescript', 'Sets msg to "Check could not run: «…»"'), true);
  assert.equal(accepted(src, 'typescript', 'Sets msg to "Check ran: «…»"'), false);
});
