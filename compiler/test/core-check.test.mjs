// Thunder Core: the checker's diagnostics (stable codes, plain words, line numbers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileCore } from '../src/core/index.mjs';

const diags = (src) => compileCore(src).diagnostics;
const one = (src, code) => {
  const d = diags(src);
  assert.equal(d.length, 1, JSON.stringify(d));
  assert.equal(d[0].code, code, JSON.stringify(d));
  return d[0];
};

test('a correct program has no diagnostics', () => {
  assert.deepEqual(diags('Set x to 1\nsay x + 2'), []);
});

test('TC201 unknown name, with "did you mean"', () => {
  const d = one('Set total to 1\nsay totl', 'TC201');
  assert.equal(d.line, 2);
  assert.match(d.message, /I don't know what "totl" is/);
  assert.match(d.hint, /Did you mean "total"/);
});

test('TC211 used before it is set', () => {
  assert.match(one('say x\nSet x to 1', 'TC211').message, /used before it is set/);
});

test('TC204 a function cannot use a value from the main program', () => {
  const d = one('To double:\n  Receive x\n  Give x * factor\nSet factor to 2', 'TC204');
  assert.equal(d.line, 3);
  assert.match(d.hint, /Receive/);
});

test('TC205 a kept value cannot change', () => {
  assert.equal(one('Keep limit at 10\nSet limit to 11', 'TC205').line, 2);
});

test('TC207 wrong number of values, with the "and" hint', () => {
  const d = one('To add up:\n  Receive x and y\n  Give x + y\nsay add up with 1', 'TC207');
  assert.match(d.message, /receives 2 values \(x, y\), but 1 was given/);
});

test('TC301 money and a plain number are not mixed', () => {
  assert.match(one('Set price to $5\nsay price + 3', 'TC301').message, /money and a plain number/);
});

test('TC302 money compared with a plain number', () => {
  one('Set price to $5\nsay price is at least 3', 'TC302');
});

test('TC303 a name keeps one kind of value', () => {
  assert.match(one('Set x to 1\nSet x to "one"', 'TC303').message, /keeps one kind of value/);
});

test('TC304 a condition must be yes/no', () => {
  one('Set name to "Ada"\nWhen name:\n  say 1', 'TC304');
});

test('TC305 text cannot be added to a number', () => {
  assert.match(one('say "a" + 1', 'TC305').hint, /braces/);
});

test('TC401 unknown action on a list lists what is supported', () => {
  const d = one('Set cards to [1, 2]\nShuffle cards', 'TC401');
  assert.equal(d.message, "I don't know how to 'shuffle' a list yet. Supported: sort, reverse, add, remove.");
  assert.equal(d.line, 2);
});

test('TC401 unknown action suggests a near function name', () => {
  assert.match(one('To greet:\n  say "hi"\ngreeet', 'TC401').hint, /greet/);
});

test('TC403 a Never rule is about one value', () => {
  one('Set a1 to 1\nSet b1 to 2\nNever allow a1 is more than b1', 'TC403');
});

test('TC206 unknown field and TC210 missing field when making a record', () => {
  one('A Customer has:\n  Name is text\nSet c to a Customer with name "A"\nsay c\'s nmae', 'TC206');
  assert.match(one('A Customer has:\n  Name is text\n  Balance is money\nSet c to a Customer with name "A"', 'TC210').message, /needs Balance/);
});

test('TC208 Give outside a function', () => {
  one('Give 1', 'TC208');
});

test('TC203 a name defined twice', () => {
  one('To greet:\n  say 1\nTo greet:\n  say 2', 'TC203');
});

test('kinds flow through: money stays money, division of money by a number is money', () => {
  const r = compileCore('Set price to $9\nSet half to price / 2\nSet ratio to price / $3');
  assert.equal(r.ok, true);
  const sets = r.program.main.filter((s) => s.k === 'set');
  assert.equal(sets[1].e.type.k, 'money');
  assert.equal(sets[2].e.type.k, 'number');
});

test('every diagnostic has a code, a line, and a message', () => {
  for (const d of diags('say totl\nShuffle x\nSet p to $1 + 1')) {
    assert.match(d.code, /^TC\d{3}$/);
    assert.ok(d.line >= 1);
    assert.ok(d.message.length > 10);
  }
});
