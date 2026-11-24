// Learn Thunder (the V1 tutorial, thunderlang.dev/learn): every lesson's code, read by this compiler, shows exactly
// what the lesson and its answers say it shows. If the reader changes, these tests say which lesson is now wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode } from '../src/read.mjs';
import { thunderText, visualFor, visualForStep } from '../src/visual.mjs';
import { previewPlainContract } from '../src/plain-contract.mjs';
import { READ_LESSONS } from '../../src/app/learn/read-lessons.mjs';
import { thunderModel, modelText } from '../src/model.mjs';

const squash = (s) => s.replace(/[_\s]/g, '').toLowerCase();
const lesson = (slug) => READ_LESSONS.find((l) => l.slug === slug);
const itemOf = (l, i = 0) => readCode(l.files[i].code, { language: l.files[i].language }).items.find((it) => squash(it.name) === squash(l.focus));
const flat = (steps) => steps.flatMap((s) => [s, ...flat(s.children || [])]);

const MODEL_LESSONS = new Set(['shapes', 'thing', 'flow', 'howto']);

test('every lesson has an idea, a picture, two questions with answers, and code that contains what it teaches', () => {
  assert.equal(READ_LESSONS.length, 11);
  for (const l of READ_LESSONS) {
    assert.ok(l.idea && l.picture, l.slug);
    assert.ok(l.questions.length >= 2 && l.questions.every((q) => q.q && q.a), l.slug);
    if (MODEL_LESSONS.has(l.show)) continue;
    for (let i = 0; i < l.files.length; i++) assert.ok(itemOf(l, i), `${l.slug}: ${l.files[i].label} has ${l.focus}`);
  }
});

const libraryModel = () => thunderModel(lesson('things').files.map((f) => ({ path: 'lesson.py', source: f.code })));

test('lesson 3 (Things): the Library knows max books (3 unless told otherwise) and an overflow pile; Book and Status are Data', () => {
  const m = libraryModel();
  const lib = m.things.find((t) => t.name === 'Library');
  assert.equal(lib.kind, 'thing');
  assert.deepEqual(lib.knows.map((k) => [k.label, k.start]), [['max books', '3 unless told otherwise'], ['overflow', 'empty at first']]);
  assert.deepEqual(m.things.filter((t) => t.kind !== 'thing').map((t) => [t.name, t.kind]), [['Status', 'choices'], ['Book', 'record']]);
});

test('lesson 4 (flow): return_book shows the Stop, both sides of the late question, the error case, and always', () => {
  const m = libraryModel();
  const text = modelText(m, m.members.find((x) => x.name === 'return_book').id);
  assert.match(text, /Ask: Is book in the student's books\?/);
  assert.match(text, /No:\n\s+- Stop: NotBorrowed/);
  assert.match(text, /Ask: Is days late more than 0\?[^\n]*\n\s+Yes:\n\s+- Works out fee from late fee/);
  assert.match(text, /No:\n\s+- Adds 1 to the student's thanks/);
  assert.match(text, /If ShelfFull goes wrong:\n\s+- Adds book to overflow/);
  assert.match(text, /Always, at the end:\n\s+- Sets the book's status to on shelf/);
  // The quiz answer: 3 days late gives a Small fee.
  const fee = m.members.find((x) => x.name === 'late_fee');
  assert.equal(fee.flow.nodes.find((n) => n.answer && !n.otherwise).text, 'Small fee');
});

test('lesson 1: order_total reads fully as steps a non-programmer can say back', () => {
  const it = itemOf(lesson('pictures'));
  assert.equal(visualFor(it).element, 'function');
  assert.equal(it.stepsReadable, 1);
  const says = flat(it.steps).map((s) => s.says);
  assert.ok(says.includes('Adds item price to total'));
  assert.ok(says.includes('If order has coupon'));
  assert.ok(says.includes('Subtracts 5 from total'));
});

test('lesson 2: both failures are visible, each inside the choice that leads to it, and the loop marks each item', () => {
  const it = itemOf(lesson('steps'));
  const fails = it.steps.filter((s) => s.kind === 'branch').map((b) => b.children?.find((c) => c.kind === 'fail')?.says);
  assert.deepEqual(fails, ['Fails with EmptyOrder: "Add at least one pizza"', 'Fails with TooFar: "We do not deliver that far"']);
  const loop = it.steps.find((s) => s.kind === 'loop');
  assert.equal(loop.children[0].kind, 'set');
  assert.ok(flat(it.steps).every((s) => !s.restates), 'no step in the steps lesson only restates code');
});

test('lesson 3: the delivery rule is a Thunder card whose person-added examples give the answers the lesson states', () => {
  const l = lesson('cards');
  const it = itemOf(l);
  assert.equal(visualFor(it).element, 'decision');
  assert.equal(it.doc, 'Nearby orders of $20 or more are delivered free.');
  const preview = previewPlainContract(thunderText(it).trimEnd() + '\n' + l.examples);
  assert.equal(preview.tests.total, 5);
  assert.equal(preview.tests.failed, 0, JSON.stringify(preview.tests.results.filter((e) => !e.pass)));
  assert.ok(preview.tests.results.some((e) => e.name === 'exactly at both limits' && e.actual === 'Free'), 'the quiz answer: $20 at 5 km is Free');
});

test('lesson 4: place_order is an action with its address and author\'s note, and fails before Stripe when too far', () => {
  const it = itemOf(lesson('actions'));
  const v = visualFor(it);
  assert.equal(v.element, 'action');
  assert.equal(v.badge.text, 'POST /orders');
  assert.equal(v.doc.text, 'A customer orders pizza and pays for it.');
  const says = it.steps.map((s) => s.says);
  const tooFar = says.findIndex((s) => s === 'If fee is "TooFar"');
  const stripe = says.findIndex((s) => s.startsWith('Calls Stripe'));
  assert.ok(tooFar >= 0 && stripe > tooFar, 'the TooFar check comes before the Stripe charge');
  assert.ok(says.includes('Sends an email'));
});

test('lesson 5: the same rule in Python, TypeScript, Java, and Go gives identical Thunder', () => {
  const l = lesson('any-language');
  const texts = l.files.map((_, i) => thunderText(itemOf(l, i)));
  assert.equal(new Set(l.files.map((f) => f.language)).size, 4);
  for (const t of texts) assert.equal(t, texts[0]);
  assert.match(texts[0], /TooFar when the distance km is over 15\./, 'the line lesson 6 asks the learner to find');
});

test('lesson 7: code Thunder cannot explain yet is a dashed Not-read-yet card that shows the code', () => {
  const it = itemOf(lesson('honest'));
  const v = visualFor(it);
  assert.deepEqual([v.element, v.line, v.provenance], ['not-read', 'dashed', 'not-read']);
  const s = visualForStep(it.steps[0]);
  assert.deepEqual([s.show, s.line], ['code', 'dashed']);
  assert.match(thunderText(it), /\(code, not explained\)/);
});
