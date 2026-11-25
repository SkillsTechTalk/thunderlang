// Reading and writing are one language: Python → Thunder Core from the reader's meaning tree
// (src/core/from-python.mjs), checked by compiling and by running next to the original (src/core/round-trip.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { pythonToCore, coreName, coreText } from '../src/core/from-python.mjs';
import { verifyRoundTrip, sameValue } from '../src/core/round-trip.mjs';
import { compileCore, PYTHON_RUNTIME } from '../src/core/index.mjs';
import { findPython } from '../src/core/project.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'src', 'cli.mjs');
const PY = findPython();
const skip = PY.error ? `Python 3.10+ not found: ${PY.error}` : false;

const fn = (src) => { const r = pythonToCore(src); return { ...r, f: r.functions.at(-1), compiles: compileCore(r.core).ok }; };

test('a Python function prints as Core that compiles, from its meaning (not its English)', () => {
  const r = fn('def calculate_discount(total, member):\n    if member and total >= 100:\n        return total * 0.2\n    return 0\n');
  assert.equal(r.core, 'To calculate discount:\n  Receive total and member\n  When member is true and total is at least 100:\n    Give total * 0.2\n  Give 0\n');
  assert.equal(r.compiles, true);
  assert.equal(r.f.exact, true);
  assert.deepEqual(r.f.assumptions.map((a) => a.line), [2]);
  assert.match(r.f.assumptions[0].says, /member is read as yes\/no/);
});

test('loops, fields, increases, range, else-if chains, f-strings, and raise', () => {
  const r = fn([
    'def report(orders, n):',
    '    total = 0',
    '    for o in orders:',
    '        if o.paid:',
    '            total += o.price',
    '        elif o.refunded:',
    '            total -= o.price',
    '        else:',
    '            print(f"unpaid: {o.id}")',
    '    for i in range(1, n + 1):',
    '        print(i)',
    '    if total < 0:',
    '        raise ValueError("negative")',
    '    return total',
  ].join('\n'));
  assert.equal(r.core, [
    'To report:',
    '  Receive orders and n',
    '  Set total to 0',
    '  For each o in orders:',
    "    When o's paid is true:",
    "      Increase total by o's price",
    "    Otherwise when o's refunded is true:",
    "      Decrease total by o's price",
    '    Otherwise:',
    "      say \"unpaid: {o's id}\"",
    '  For each i from 1 to n:',
    '    say i',
    '  When total is less than 0:',
    '    Stop with "negative"',
    '  Give total',
    '',
  ].join('\n'));
  assert.equal(r.compiles, true);
  assert.equal(r.f.exact, true);
});

test('a meaning Core cannot say is refused, marked, and stops loudly if it runs: never rewritten into something close', () => {
  const cases = [
    ['def f(t):\n    return t.split(",", 2)\n', /maximum number of parts/],
    ['def f(x):\n    return round(x, 2)\n', /rounds halves to even; Thunder rounds half up/],
    ['def f(a, b):\n    return a // b\n', /rounds down to a whole number/],
    ['def f(x, y):\n    try:\n        return x / y\n    except ZeroDivisionError:\n        return None\n', /Python try/],
    ['def f(xs):\n    return sorted(xs, key=len)\n', /sort key other than lambda/],
    ['def f(xs, i):\n    return xs[i]\n', /list position \(Python counts from 0, Core from 1\) or a map key/],
    ['def f(a, b=2):\n    return a\n', /default value/],
    ['def f(a, b, c):\n    return a < b < c\n', /chained comparison/],
    ["def f(s):\n    return s in (b'no', b'0')\n", /bytes value/],
    ['def f(a, b):\n    return (a, b)\n', /a tuple is not a list/],
    ['import functools\n\n@functools.lru_cache\ndef f(n):\n    return n\n', /a decorator changes what this function is/],
    ['def g():\n    return 1\n\ndef f():\n    return g\n', /passes the function g itself/],
  ];
  for (const [src, why] of cases) {
    const r = fn(src);
    assert.equal(r.f.exact, false, src);
    assert.match(r.f.notTranslated.map((n) => n.why).join(' | '), why, src);
    assert.equal(r.compiles, true, `${src}\n${r.core}`);
    // A default value or a decorator is about the function as a whole; its body is still printed with its meaning.
    if (!/default value|decorator/.test(String(why))) assert.match(r.core, /Stop with "Line \d+ of the Python was not translated: /, src);
  }
});

test('module values become kept values; list positions shift to count from 1; names keep Thunder words out', () => {
  const r = fn('TAX = 0.07\n\ndef first_with_tax(prices):\n    return prices[0] * (1 + TAX)\n');
  assert.equal(r.core, 'Keep TAX at 0.07\n\nTo first_with_tax:\n  Receive prices\n  Give (prices at 1) * (1 + TAX)\n');
  assert.match(r.f.assumptions[0].says, /prices is read as a list \(or tuple\), so Python's position 0 is Core's position 1/);
  assert.equal(r.compiles, true);
  assert.equal(coreName('tax_rate'), 'tax rate');
  assert.equal(coreName('is_adult'), 'is_adult'); // "is" belongs to Thunder
  assert.equal(coreName('say_hi'), 'say_hi'); // "say" starts a Core statement
  assert.equal(coreName('_private'), '_private');
  assert.equal(coreName('a'), 'a_'); // a whole Thunder word gets an underscore
  assert.equal(coreName('to'), 'to_');
  assert.equal(coreText('a {b} "c"'), '"a {{b} \\"c\\""');
});

test('a tuple on the right of "in" is a list of choices', () => {
  assert.equal(fn("def f(x):\n    return x in ('a', 'b')\n").core, 'To f:\n  Receive x\n  Give x is in ["a", "b"]\n');
});

test('a list kept with a condition becomes "where"; sorted with a key becomes "sorted by"', () => {
  assert.equal(fn('def paid_orders(orders):\n    return [o for o in orders if o.paid]\n').core, 'To paid orders:\n  Receive orders\n  Give orders where paid is true\n');
  assert.equal(fn('def dear(items):\n    return sorted(items, key=lambda i: i.price, reverse=True)\n').core, 'To dear:\n  Receive items\n  Give items sorted by price descending\n');
});

test('sameValue: the same digits are equal; floats match within 1e-9 only when one side is a float, and say so', () => {
  assert.deepEqual(sameValue({ number: '107.0', float: true }, { number: '107.00', float: false }), { same: true, tolerance: false });
  assert.deepEqual(sameValue({ number: '0.30000000000000004', float: true }, { number: '0.3', float: false }), { same: true, tolerance: true });
  assert.deepEqual(sameValue({ number: '0.3', float: false }, { number: '0.30000001', float: false }), { same: false, tolerance: false });
  assert.deepEqual(sameValue([1, 'a'], [1, 'a']), { same: true, tolerance: false });
});

test('round trip: the original Python and its Core give the same results, errors included', { skip }, () => {
  const python = 'def withdraw(balance, amount):\n    if amount > balance:\n        raise ValueError("Insufficient funds")\n    return balance - amount\n';
  const v = verifyRoundTrip({ python, core: pythonToCore(python).core, name: 'withdraw', inputs: ['100, 30', '100, 100', '10, 30', '0.3, 0.1'] });
  assert.equal(v.ran, true, v.error);
  assert.deepEqual(v.cases.map((c) => [c.input, c.same]), [['100, 30', true], ['100, 100', true], ['10, 30', true], ['0.3, 0.1', true]]);
  assert.equal(v.cases[2].python.error, 'Insufficient funds');
  assert.match(v.cases[2].core.error, /Insufficient funds/);
});

test('round trip catches a Core that means something else', { skip }, () => {
  const python = 'def grade(score):\n    if score >= 90:\n        return "A"\n    return "B"\n';
  const wrong = 'To grade:\n  Receive score\n  When score is more than 90:\n    Give "A"\n  Give "B"\n';
  const v = verifyRoundTrip({ python, core: wrong, name: 'grade', inputs: ['95', '90', '10'] });
  assert.deepEqual(v.cases.map((c) => [c.input, c.same, c.why ?? null]), [['95', true, null], ['90', false, 'the values given back differ'], ['10', true, null]]);
});

test('Core is strict about yes/no and exact with Python floats (the two rules a round trip relies on)', { skip }, () => {
  const core = 'To check:\n  Receive x\n  When x is true:\n    Give 1\n  Give 0\n\nTo above:\n  Receive x\n  Give x is more than 0.1\n';
  const r = compileCore(core, { file: 'm.thunder' });
  assert.deepEqual(r.diagnostics, []);
  const dir = mkdtempSync(join(tmpdir(), 'thunder-strict-'));
  try {
    writeFileSync(join(dir, 'm.py'), r.python);
    writeFileSync(join(dir, 'thunder_runtime.py'), PYTHON_RUNTIME);
    const run = (expr) => spawnSync(PY.cmd, ['-c', `import m\ntry:\n    print(${expr})\nexcept Exception as e:\n    print("error:", e)`], { cwd: dir, encoding: 'utf8' }).stdout.trim();
    assert.equal(run('m.check(True)'), '1');
    assert.match(run('m.check(1)'), /^error: This needs a yes\/no value, but it is the number 1/);
    assert.equal(run('m.above(0.1)'), 'False'); // a float 0.1 is the exact 0.1, not 0.1000000000000000055
    assert.equal(run('m.above(0.30000000000000004)'), 'True');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('thunder read <file.py> --as-core prints the Core, and says what is exact and what is not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'thunder-ascore-'));
  try {
    writeFileSync(join(dir, 'shop.py'), 'def total(xs):\n    return sum(xs)\n\ndef words(t):\n    return round(t, 2)\n');
    const r = spawnSync(process.execPath, [CLI, 'read', join(dir, 'shop.py'), '--as-core'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^To total:\n {2}Receive xs\n {2}Give the sum of xs\n/);
    assert.match(r.stderr, /1 of 2 functions printed exactly as Thunder Core; 1 line not translated/);
    assert.match(r.stderr, /words: not safely editable: line 5: Python round\(\) rounds halves to even/);
    const j = JSON.parse(spawnSync(process.execPath, [CLI, 'read', join(dir, 'shop.py'), '--as-core', '--json'], { encoding: 'utf8' }).stdout);
    assert.deepEqual(j.functions.map((f) => [f.name, f.exact]), [['total', true], ['words', false]]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── methods ──

const ACCOUNT = `class Account:
    def __init__(self, owner, balance):
        self.owner = owner
        self.balance = balance

    def can_withdraw(self, amount):
        return amount <= self.balance

    def withdraw(self, amount):
        if not self.can_withdraw(amount):
            raise ValueError("insufficient")
        self.balance -= amount

    def add_tag(self, tag):
        self.tags.append(tag)

    @staticmethod
    def fee(amount):
        return amount * 0.01

    @property
    def rich(self):
        return self.balance > 1000

    def __repr__(self):
        return self.owner

    def helper_from_parent(self):
        return self.inherited()
`;

test('a method is a Core function that receives the object first; self.other() is a written-down assumption', () => {
  const r = pythonToCore(ACCOUNT);
  assert.equal(compileCore(r.core).ok, true);
  assert.match(r.core, /To Account set up:\n {2}Receive self, owner and balance\n {2}Set self's owner to owner\n {2}Set self's balance to balance\n/);
  assert.match(r.core, /To Account withdraw:\n {2}Receive self and amount\n {2}When not \(\(Account can withdraw with self and amount\) is true\):\n {4}Stop with "insufficient"\n {2}Set self's balance to self's balance - amount\n/);
  assert.match(r.core, /To Account add tag:\n {2}Receive self and tag\n {2}Add tag to self's tags\n/);
  assert.match(r.core, /To Account fee:\n {2}Receive amount\n {2}Give amount \* 0\.01\n/); // a static method has no self
  const by = Object.fromEntries(r.functions.map((f) => [f.name, f]));
  assert.equal(by.withdraw.exact, true);
  assert.match(by.withdraw.assumptions.map((a) => a.says).join(' | '), /self\.can_withdraw\(\) is read as Account's own can_withdraw; a subclass that replaces it would run its own version/);
  assert.equal(by.fee.exact, true);
  assert.equal(by.rich.exact, false);
  assert.match(by.rich.notTranslated[0].why, /decorator/);
  assert.equal(by.__repr__.exact, false);
  assert.match(by.__repr__.notTranslated[0].why, /special method/);
  assert.match(by.helper_from_parent.notTranslated[0].why, /not a method written in Account here \(it may come from a parent class\)/);
});

test('an inner function, a method of a nested class, and a multi-line signature with a default are not exact', () => {
  const r = pythonToCore('def outer(x):\n    def inner(y):\n        return y\n    return x\n\nclass A:\n    class B:\n        def m(self):\n            return 1\n\n    def n(self, a,\n          b=None):\n        return a\n');
  const by = Object.fromEntries(r.functions.map((f) => [f.name, f]));
  assert.equal(by.inner.exact, false);
  assert.equal(by.m.exact, false);
  assert.equal(by.n.exact, false);
  assert.match(by.n.notTranslated[0].why, /default value/);
  assert.match(r.core, /# Not translated: 2 inner functions or methods of a nested class/);
  assert.equal(compileCore(r.core).ok, true);
});

test('round trip for methods compares the object afterwards too', { skip }, () => {
  const r = pythonToCore(ACCOUNT);
  const v = verifyRoundTrip({ python: ACCOUNT, core: r.core, name: 'withdraw', coreFunction: 'Account withdraw', kind: 'method', cls: 'Account', inputs: ['Account("a", 10), 4', 'Account("a", 10), 50'] });
  assert.equal(v.ran, true, v.error);
  assert.deepEqual(v.cases.map((c) => c.same), [true, true]);
  assert.deepEqual(v.cases[0].core.after, { record: { balance: { number: '6', float: false }, owner: 'a' } });
  const wrong = r.core.replace("Set self's balance to self's balance - amount", "Set self's balance to self's balance + amount");
  const w = verifyRoundTrip({ python: ACCOUNT, core: wrong, name: 'withdraw', coreFunction: 'Account withdraw', kind: 'method', cls: 'Account', inputs: ['Account("a", 10), 4'] });
  assert.deepEqual(w.cases.map((c) => [c.same, c.why]), [[false, 'the object is different afterwards']]);
  const s = verifyRoundTrip({ python: ACCOUNT, core: r.core, name: 'fee', coreFunction: 'Account fee', kind: 'static', cls: 'Account', inputs: ['100', '3.3'] });
  assert.deepEqual(s.cases.map((c) => c.same), [true, true]);
});

test('Core: Add, Increase, and Set on a field or entry whose kind is not known (tuples read from 1 too)', { skip }, () => {
  const core = [
    'To grow:', '  Receive box', '  Add 3 to box\'s items', '  Increase box\'s count by 1', '  Set box\'s items at 1 to 9', '  Give box',
    '', 'To first:', '  Receive pair', '  Give pair at 1',
  ].join('\n');
  const r = compileCore(core, { file: 'm.thunder' });
  assert.deepEqual(r.diagnostics, []);
  const dir = mkdtempSync(join(tmpdir(), 'thunder-store-'));
  try {
    writeFileSync(join(dir, 'm.py'), r.python);
    writeFileSync(join(dir, 'thunder_runtime.py'), PYTHON_RUNTIME);
    const out = spawnSync(PY.cmd, ['-c', 'import m\nfrom types import SimpleNamespace as O\nb = m.grow(O(items=[1], count=0.5))\nprint(b.items, b.count)\nprint(m.first((7, 8)))'], { cwd: dir, encoding: 'utf8' });
    assert.equal(out.stderr, '');
    assert.equal(out.stdout.trim(), '[9, 3] 1.5\n7');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
