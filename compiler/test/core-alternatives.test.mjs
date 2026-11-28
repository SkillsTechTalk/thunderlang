// Either/or data types (roadmap D.3): "A Payment is one of:" with alternatives and their fields, "Depending on" that
// must cover every alternative (TC215), fields read only where the alternative is known (TC216), and recursive data.
// Underneath, a data type is a record with "which" and every alternative's fields, so every target runs it the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileCore } from '../src/core/index.mjs';
import { formatCore } from '../src/core/format.mjs';
import { runBoth } from './core-engines.mjs';

const PAYMENT = [
  'A Payment is one of:', '  Successful with amount as money', '  Declined with reason as text', '  Pending', '',
].join('\n');

const DESCRIBE = `${PAYMENT}
To describe:
  Receive payment as Payment
  Depending on payment:
    Successful:
      Give "paid {payment's amount}"
    Declined:
      Give "declined: {payment's reason}"
    Pending:
      Give "waiting"
`;

const codes = (src) => compileCore(src, { file: 'm.thunder' }).diagnostics.map((d) => d.code);
const problem = (src, code) => compileCore(src, { file: 'm.thunder' }).diagnostics.find((d) => d.code === code);

test('every engine and target agrees: building, Depending on, "is", and the record shown in words', () => {
  const r = runBoth(`${DESCRIBE}
Set paid to a successful Payment with amount $5
Set refused to a declined Payment with reason "card expired"
For each p in [paid, refused, a pending Payment]:
  say describe with p
If paid is successful:
  say "amount {paid's amount}"
When refused is not successful:
  say "not paid"
say paid's which
say paid
say paid is pending
`);
  assert.equal(r.out, [
    'paid $5.00', 'declined: card expired', 'waiting', 'amount $5.00', 'not paid', 'successful',
    'Payment(which: successful, amount: $5.00, reason: nothing)', 'no',
  ].join('\n'));
});

test('tests can build alternatives and check the answer', () => {
  const r = runBoth(`${DESCRIBE}
Test "describe says what happened":
  Expect describe with a successful Payment with amount $2 to be "paid $2.00"
  Expect describe with a declined Payment with reason "no funds" to be "declined: no funds"
  Expect describe with a pending Payment to be "waiting"
`, { tests: true });
  assert.match(r.out, /1 test: 1 passed, 0 failed/);
});

test('recursive data: a tree summed by a function that calls itself, the same everywhere', () => {
  const r = runBoth(`A Tree is one of:
  Leaf
  Branch with left as Tree and value as number and right as Tree

To total:
  Receive tree as Tree
  Depending on tree:
    Leaf:
      Give 0
    Branch:
      Give (total with tree's left) + tree's value + (total with tree's right)

Set small to a Branch Tree with left a Leaf Tree and value 2 and right a Leaf Tree
say total with a Branch Tree with left small and value 5 and right a Branch Tree with left a Leaf Tree and value 1.5 and right a Leaf Tree
`);
  assert.equal(r.out, '8.5');
});

test('Otherwise covers the alternatives not listed; a shared field has one kind in every alternative', () => {
  const r = runBoth(`A Shape is one of:
  Circle with name as text and radius as number
  Square with name as text and side as number
  Dot

To label:
  Receive shape as Shape
  Depending on shape:
    Circle:
      Give "{shape's name} (round)"
    Otherwise:
      Give "something else"

say label with a Circle Shape with name "sun" and radius 2
say label with a Dot Shape
`);
  assert.equal(r.out, 'sun (round)\nsomething else');
  assert.deepEqual(codes('A Thing is one of:\n  Big with size as number\n  Small with size as text\n'), ['TC303']);
});

test('a Depending on that leaves out an alternative is reported at its line, naming what is missing (TC215)', () => {
  const src = `${PAYMENT}
To describe:
  Receive payment as Payment
  Depending on payment:
    Successful:
      Give "paid"
`;
  const d = problem(src, 'TC215');
  assert.equal(d.line, 8);
  assert.equal(d.message, '"Depending on payment" doesn\'t say what to do when it is declined or pending.');
  assert.equal(d.hint, 'Add "Declined:" and "Pending:" with what to do, or "Otherwise:" for every case not listed.');
});

test('a field only some alternatives have is read only where the alternative is known (TC216)', () => {
  const outside = problem(`${PAYMENT}\nSet paid to a successful Payment with amount $5\nsay paid's amount\n`, 'TC216');
  assert.equal(outside.message, 'Only a successful Payment has an amount, and here it could be any of them.');
  assert.match(outside.hint, /Depending on paid:.*If paid is successful:/);
  const wrongCase = problem(DESCRIBE.replace("{payment's amount}", "{payment's reason}"), 'TC216');
  assert.equal(wrongCase.message, 'A successful Payment has no reason; only a declined one does.');
  // Narrowing ends with the block: after "If paid is successful:", paid could be anything again.
  assert.deepEqual(codes(`${PAYMENT}\nSet paid to a pending Payment\nIf paid is successful:\n  say paid's amount\nsay paid's amount\n`), ['TC216']);
});

test('building and naming alternatives: each mistake says what the data type allows (TC217, TC206, TC210)', () => {
  assert.equal(problem(`${PAYMENT}\nSet x to a refunded Payment\n`, 'TC217').message, 'A Payment is successful, declined, or pending; "refunded" isn\'t one of them.');
  assert.equal(problem(`${PAYMENT}\nSet x to a Payment with amount $1\n`, 'TC217').message, 'Say which Payment it is: a successful Payment, a declined Payment, or a pending Payment.');
  assert.equal(problem(`${PAYMENT}\nSet x to a pending Payment\nWhen x is refunded:\n  say 1\n`, 'TC217').message, 'A Payment is successful, declined, or pending; "refunded" isn\'t one of them.');
  assert.equal(problem(`${PAYMENT}\nSet x to a successful Payment\n`, 'TC210').message, 'A successful Payment needs amount.');
  assert.equal(problem(`${PAYMENT}\nSet x to a pending Payment with amount $1\n`, 'TC206').message, 'A pending Payment has no field "amount" (a successful one does).');
  assert.ok(problem(`${DESCRIBE.replace('    Pending:\n      Give "waiting"\n', '    Refunded:\n      Give "back"\n')}`, 'TC217'));
});

test('which alternative a value is cannot be changed, and Depending on needs a data type', () => {
  assert.equal(problem(`${PAYMENT}\nSet x to a pending Payment\nSet x's which to "successful"\n`, 'TC205').message, 'Which alternative a Payment is can\'t be changed.');
  assert.match(problem('Depending on 5:\n  Big:\n    say 1\n', 'TC305').message, /not a data type with alternatives/);
  assert.deepEqual(codes(`${PAYMENT}\nTo f:\n  Give a pending Payment\nDepending on f:\n  Pending:\n    say 1\n`).includes('TC305'), true);
});

test('a field cannot be called "which", and an alternative is named once', () => {
  assert.deepEqual(codes('A Thing is one of:\n  Big with which as text\n'), ['TC203']);
  assert.deepEqual(codes('A Thing is one of:\n  Big\n  Big\n'), ['TC203']);
});

test('holes work inside alternatives: a hole in a field knows the field\'s kind', () => {
  const r = compileCore(`${PAYMENT}\nTo pay:\n  Receive cost as money\n  Give a successful Payment with amount ?\n`, { file: 'm.thunder' });
  assert.equal(r.draft, true);
  assert.equal(r.holes[0].hole.needs, 'money');
  assert.deepEqual(r.holes[0].hole.available.map((a) => a.name), ['cost']);
});

test('formatting leaves a data type and Depending on as written', () => {
  assert.equal(formatCore(DESCRIBE), DESCRIBE);
});
