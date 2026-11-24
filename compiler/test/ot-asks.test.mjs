// What OpenThunder asked ThunderLang to provide (so OT can delete its stopgaps): labels, plumbing inputs, a note apart
// from says, completeness with reasons, fail error/message fields, Fastify route() handlers, color tokens for
// Thunder Text, and browser-safe /core exports for the card and editor help.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode } from '../src/read.mjs';
import { thunderTokens } from '../src/visual.mjs';
import * as core from '../src/core.mjs';

const PY = 'def save_order(order, db):\n    if not order.items:\n        raise EmptyOrder("Add at least one pizza")\n    db.add(order)\n    return order\n\n\ndef odd(x):\n    return (x * 17 + 3) % 5\n';
const items = () => readCode(PY, { language: 'python' }).items;
const byName = (n) => items().find((i) => i.name === n);

test('items carry a display label, a headline, and a note apart from says', () => {
  const it = byName('save_order');
  assert.equal(it.label, 'Save order');
  assert.equal(it.headline, 'Save order takes order, db.');
  assert.equal(it.note, undefined, 'it has a check first, so there is something to show');
  assert.equal(byName('odd').note, 'Its body does more than choose between fixed answers, so no rules are shown.');
});

test('framework plumbing inputs are marked', () => {
  assert.deepEqual(byName('save_order').inputs, [{ name: 'order', type: null }, { name: 'db', type: null, plumbing: true }]);
});

test('completeness says how much is explained, and why not', () => {
  assert.deepEqual(byName('save_order').completeness, { level: 'explained', reasons: [] });
  const odd = byName('odd').completeness;
  assert.equal(odd.level, 'partly explained');
  assert.match(odd.reasons[0], /only restate the code/);
});

test('a Stop step carries its error and message as fields', () => {
  const fail = byName('save_order').steps[0].children[0];
  assert.deepEqual([fail.error, fail.message], ['EmptyOrder', 'Add at least one pizza']);
});

test('Fastify route({ method, url, handler }) is read as an action', () => {
  const r = readCode('fastify.route({\n  method: "POST",\n  url: "/orders",\n  handler: async (request, reply) => {\n    return reply.send(1);\n  },\n});\n', { language: 'typescript' });
  assert.deepEqual(r.items.find((i) => i.kind === 'function').route, { method: 'POST', path: '/orders' });
});

test('thunderTokens tags every word with a color role and joins back to the line', () => {
  for (const line of ['  - Ask: Is days late more than 0?  (line 35)', '      - Stop: NotBorrowed: "This student does not have this book"', '    Yes:', '  - Answer: Small fee', '  You give it: student, book']) {
    const t = thunderTokens(line);
    assert.equal(t.map((x) => x.text).join(''), line);
  }
  const ask = thunderTokens('  - Ask: Is days late more than 0?');
  assert.ok(ask.some((x) => x.role === 'comparison' && x.text === 'more than'));
  assert.ok(ask.some((x) => x.role === 'amount' && x.text === '0'));
  assert.ok(thunderTokens('    Yes:').some((x) => x.role === 'structure' && x.text === 'Yes:'));
  assert.ok(thunderTokens('  - Stop: X: "why"').some((x) => x.role === 'failure'));
});

test('/core exports what OpenThunder imported from internal files', () => {
  for (const k of ['plainFromReading', 'getCompletions', 'getHover', 'autocorrectSource', 'getCodeActions', 'SEMANTIC_TYPES', 'thunderTokens', 'completenessOf', 'displayLabel', 'thunderModel', 'sameMeaning', 'thunderizeFiles', 'READ_SKIP_DIRS']) assert.ok(k in core, k);
});
