// Thunder Core: lexer and parser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lex, tokenizeLine } from '../src/core/lexer.mjs';
import { parseCore } from '../src/core/parser.mjs';

const body = (src) => { const p = parseCore(src); assert.deepEqual(p.diagnostics, [], JSON.stringify(p.diagnostics)); return p.body; };
const codes = (src) => parseCore(src).diagnostics.map((d) => d.code);

test('lexer: money, percent, numbers, text with holes, possessive, yes/no', () => {
  const ts = tokenizeLine(`Set c's price to $1.50 + 7% of 0.25 "Hi {name}" yes/no`, 1);
  assert.deepEqual(ts.map((t) => t.t), ['word', 'word', 'poss', 'word', 'word', 'money', 'sym', 'percent', 'word', 'num', 'str', 'word']);
  assert.equal(ts[5].text, '1.50');
  assert.equal(ts[7].text, '7');
  assert.equal(ts[10].parts[1].source, 'name');
  assert.equal(ts[11].lower, 'yes/no');
});

test('lexer: comments and blank lines are dropped; tabs are refused', () => {
  const { lines, diagnostics } = lex('# a comment\n\nsay 1  # trailing\n\tsay 2\n');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].tokens.length, 2);
  assert.equal(diagnostics[0].code, 'TC101');
});

test('lexer: missing closing quote is TC106', () => {
  assert.deepEqual(codes('say "oops'), ['TC106']);
});

test('say, Set, Keep, Give, Stop', () => {
  const b = body('say "hi"\nSet tax rate to 7%\nKeep limit at 100\nStop with "no"');
  assert.deepEqual(b.map((s) => s.k), ['say', 'set', 'keep', 'stop']);
  assert.equal(b[1].target.name, 'tax rate');
  assert.equal(b[1].e.k, 'percent');
  assert.equal(b[2].name, 'limit');
});

test('multi-word names are matched longest first', () => {
  const b = body('Set tax to 1\nSet tax rate to 2\nsay tax rate + tax');
  const e = b[2].e;
  assert.equal(e.k, 'bin');
  assert.equal(e.l.name, 'tax rate');
  assert.equal(e.r.name, 'tax');
});

test('To … with Receive and Give; calls with "with" and with parentheses', () => {
  const b = body('To calculate discount:\n  Receive total and member\n  Give 0\nsay calculate discount with 150 and true\nsay calculate discount(1, false)');
  assert.equal(b[0].k, 'func');
  assert.deepEqual(b[0].params.map((p) => p.name), ['total', 'member']);
  assert.equal(b[1].e.k, 'call');
  assert.equal(b[1].e.args.length, 2);
  assert.equal(b[2].e.args.length, 2);
});

test('When / Otherwise when / Otherwise becomes one if with branches', () => {
  const b = body('Set x to 1\nWhen x is at least 10:\n  say "big"\nOtherwise when x is 5:\n  say "five"\nOtherwise:\n  say "small"');
  assert.equal(b.length, 2);
  assert.equal(b[1].branches.length, 2);
  assert.equal(b[1].branches[0].cond.op, '>=');
  assert.ok(b[1].otherwise);
});

test('comparisons in words and symbols', () => {
  const b = body('Set x to 1\nsay x is at least 1\nsay x is at most 1\nsay x is more than 1\nsay x is less than 1\nsay x is not 1\nsay x >= 1\nsay x != 1\nsay x is between 1 and 3\nsay x is positive\nsay x is nothing');
  assert.deepEqual(b.slice(1).map((s) => s.e.op ?? s.e.k), ['>=', '<=', '>', '<', '!=', '>=', '!=', 'between', 'adj', 'isNothing']);
});

test('records: fields, kinds, and Never rules inside', () => {
  const b = body('A Trade has:\n  Symbol is text\n  Quantity is whole number\n  Buy price is money\n  Tags is a list of text\n  Note is optional text\n  Never allow a negative quantity');
  const r = b[0];
  assert.equal(r.k, 'record');
  assert.deepEqual(r.fields.map((f) => [f.name, f.type.k]), [['symbol', 'text'], ['quantity', 'whole'], ['buy price', 'money'], ['tags', 'list'], ['note', 'optional']]);
  assert.equal(r.rules[0].cond.adj, 'negative');
});

test('making a record: "a X with field value and field value", even inside a list', () => {
  const b = body('An Order has:\n  Item is text\n  Paid is yes/no\nSet orders to [an Order with item "a" and paid true, an Order with item "b", paid false]');
  const list = b[1].e;
  assert.equal(list.items.length, 2);
  assert.deepEqual(list.items[1].fields.map((f) => f.name), ['item', 'paid']);
});

test('the sum of prices from orders where paid is true', () => {
  const b = body('An Order has:\n  Price is money\n  Paid is yes/no\nSet orders to an empty list\nSet total to the sum of prices from orders where paid is true');
  const e = b[2].e;
  assert.equal(e.k, 'op');
  assert.equal(e.op, 'sum');
  assert.equal(e.arg.k, 'from');
  assert.equal(e.arg.list.k, 'where');
});

test('For each, Repeat while, Repeat until, Repeat N times, For each … from … to', () => {
  const b = body('Set xs to [1]\nFor each x in xs:\n  say x\nRepeat while false:\n  say 1\nRepeat until true:\n  say 1\nRepeat 3 times:\n  say 1\nFor each n from 1 to 3:\n  say n');
  assert.deepEqual(b.slice(1).map((s) => s.k), ['each', 'while', 'while', 'times', 'range']);
  assert.equal(b[3].until, true);
});

test('If this fails: attaches to the statement before it', () => {
  const b = body('Set x to 1 / 0\nIf this fails:\n  say error');
  assert.equal(b.length, 1);
  assert.equal(b[0].k, 'tryFail');
  assert.equal(b[0].stmt.k, 'set');
});

test('Expect forms', () => {
  const b = body('Set x to 1\nExpect x to be 1\nExpect x to be at least 1\nExpect x is 1\nExpect x to be nothing\nExpect 1 / 0 to fail\nExpect 1 / 0 to fail with "zero"');
  assert.deepEqual(b.slice(1).map((s) => s.mode), ['be', 'be', 'true', 'be', 'fail', 'fail']);
  assert.equal(b[2].check.op, '>=');
});

test('Never forms', () => {
  const b = body('Set quantity to 1\nNever allow a negative quantity\nNever allow quantity to be zero\nNever allow quantity is more than 100');
  assert.equal(b[1].cond.adj, 'negative');
  assert.equal(b[2].cond.adj, 'zero');
  assert.equal(b[3].cond.op, '>');
});

test('Use <module> as <name> and dotted calls', () => {
  const b = body('Use os.path as paths\nsay paths.join("a", "b")');
  assert.equal(b[0].module, 'os.path');
  assert.equal(b[0].name, 'paths');
  assert.equal(b[1].e.k, 'dot');
  assert.equal(b[1].e.args.length, 2);
});

test('layout diagnostics: indent without a block, a block without lines, Otherwise alone', () => {
  assert.deepEqual(codes('say 1\n  say 2'), ['TC102']);
  assert.deepEqual(codes('When true:\nsay 1'), ['TC103']);
  assert.deepEqual(codes('Otherwise:\n  say 1'), ['TC109']);
  assert.deepEqual(codes('If this fails:\n  say 1'), ['TC110']);
});

test('a name cannot contain a Thunder word', () => {
  assert.deepEqual(codes('Keep rate of tax at 3'), ['TC202']);
});

test('an unknown action is kept for the checker to explain', () => {
  const b = body('Set cards to [1]\nShuffle cards');
  assert.equal(b[1].k, 'unknownVerb');
  assert.equal(b[1].verb, 'Shuffle');
});
