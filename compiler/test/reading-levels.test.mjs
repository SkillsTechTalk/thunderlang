// The five reading levels (Big Picture, Flow, Details, Text, Original): defined once by ThunderLang, so every product
// shows the same thing at the same level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, PLACES, THUNDER_VISUAL } from '../src/visual.mjs';
import { thunderModel, readLevel, modelText } from '../src/model.mjs';
import { READ_LESSONS } from '../src/learn-lessons.mjs';
import * as core from '../src/core.mjs';

const LIBRARY = READ_LESSONS.find((l) => l.slug === 'things').files[0].code;
const model = () => thunderModel([{ path: 'library.py', source: LIBRARY }], { name: 'School library' });
const idOf = (m, name) => m.members.find((x) => x.name === name).id;

test('there are five levels, in this order, with these names, each answering one question', () => {
  assert.deepEqual(LEVELS.map((l) => l.name), ['Big Picture', 'Flow', 'Details', 'Text', 'Original']);
  assert.deepEqual(LEVELS.map((l) => l.form), ['picture', 'picture', 'picture', 'words', 'evidence']);
  for (const l of LEVELS) assert.ok(l.question.endsWith('?') && l.shows, l.id);
  assert.equal(THUNDER_VISUAL.levels, LEVELS);
  assert.equal(PLACES[0].name, 'App', 'places (where you are) are separate from levels (how deep)');
  for (const k of ['LEVELS', 'PLACES', 'readLevel']) assert.ok(k in core, k);
});

test('Big Picture of the whole app: the Library and what it can do, and Book and Status as data', () => {
  const big = readLevel(model(), 'big-picture');
  assert.equal(big.scope, 'app');
  assert.deepEqual(big.things.map((t) => [t.label, t.can.map((c) => c.label)]), [['Library', ['Late fee', 'Return book']]]);
  assert.deepEqual(big.things[0].knows[0], { label: 'max books', start: '3 unless told otherwise' });
  assert.deepEqual(big.data.map((d) => d.label).sort(), ['Book', 'Status']);
});

test('Big Picture of one action: what you give it, who owns it, and what it uses', () => {
  const m = model();
  const big = readLevel(m, 'big-picture', idOf(m, 'return_book'));
  assert.equal(big.owner.label, 'Library');
  assert.deepEqual(big.youGive, ['student', 'book', 'days late']);
  assert.deepEqual(big.uses.map((u) => u.label), ['Late fee']);
});

test('Flow and Details need an action or rule, and say so with the list to choose from', () => {
  const r = readLevel(model(), 'flow');
  assert.equal(r.needsFocus, true);
  assert.match(r.says, /Choose one/);
  assert.ok(r.choose.some((c) => c.label === 'Return book'));
});

test('Details: every step in order, with its line, the path it is on, and nothing hidden', () => {
  const m = model();
  const d = readLevel(m, 'details', idOf(m, 'return_book'));
  const line = (s) => `${'  '.repeat(s.depth)}${s.via ? `${s.via}: ` : ''}${s.text}`;
  assert.deepEqual(d.steps.slice(0, 2).map(line), ['Is book in the student\'s books?', '  No: Stop: NotBorrowed: "This student does not have this book"']);
  assert.ok(d.steps.some((s) => s.text === 'If ShelfFull goes wrong'));
  assert.ok(d.steps.every((s) => typeof s.line === 'number'), 'every step points at its line');
  assert.equal(d.notExplained, 0);
  assert.deepEqual(d.usedBy, []);
});

test('Text is Thunder Text, and Original points at the exact lines', () => {
  const m = model();
  const id = idOf(m, 'return_book');
  assert.equal(readLevel(m, 'text', id).text, modelText(m, id));
  const o = readLevel(m, 'original', id);
  assert.deepEqual([o.file, o.language], ['library.py', 'python']);
  assert.ok(o.lines[0] < o.lines[1]);
});

test('an unknown level or id is a clear error', () => {
  assert.throws(() => readLevel(model(), 'zoom'), /Unknown reading level "zoom". Use one of: big-picture, flow, details, text, original/);
  assert.throws(() => readLevel(model(), 'flow', 'nope'), /Nothing in this model has the id "nope"/);
});
