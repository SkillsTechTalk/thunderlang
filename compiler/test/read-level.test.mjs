// thunder read --level: the five reading levels in the terminal, from the same model OpenThunder shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { READ_LESSONS } from '../src/learn-lessons.mjs';
import { thunderModel } from '../src/model.mjs';
import { readLevel, renderLevel, findFocus, nearestLevel } from '../src/read-level.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const LIBRARY = READ_LESSONS.find((l) => l.slug === 'flow').files[0].code;
const dir = mkdtempSync(join(tmpdir(), 'thunder-level-'));
const file = join(dir, 'library.py');
writeFileSync(file, LIBRARY);
const read = (...args) => spawnSync(process.execPath, [CLI, 'read', file, ...args], { encoding: 'utf8' });
test.after(() => rmSync(dir, { recursive: true }));

test('big picture: the Things, what they know and can do, and where to go next', () => {
  const r = read('--level', 'big-picture');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Big Picture · library\.py\nWhat is it, and what can it do\?\n/);
  assert.match(r.stdout, /Library: Lends books to students and takes them back\.\n {2}Knows: {3}max books \(3 unless told otherwise\), overflow \(empty at first\)\n {2}Can do: {2}Late fee \(rule\), Return book/);
  assert.match(r.stdout, /Status: on shelf \| borrowed/);
  assert.match(r.stdout, /Next: thunder read .*library\.py --level flow --focus "Late fee"/);
});

test('flow: one action as a tree of questions, branches, error handlers, and "always"; without --focus, a list to choose from', () => {
  const r = read('--level', 'flow', '--focus', 'return book');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /◆ Is book in the student's books\? {2}\(line 32\)\n {6}yes → carry on\n {6}no →\n {10}✗ Stop: NotBorrowed/);
  assert.match(r.stdout, /If ShelfFull goes wrong →\n {10}• Adds book to overflow/);
  assert.match(r.stdout, /always, at the end →\n {10}• Sets the book's status to on shelf/);
  const choose = read('--level', 'flow');
  assert.match(choose.stdout, /Flow shows one action or rule\. Choose one\.\n\n {2}thunder read .* --level flow --focus "Late fee"\n {2}thunder read .* --level flow --focus "Return book"/);
});

test('details: every way it ends, what it changes and when, and what the code cannot tell', () => {
  const r = read('--level', 'details', '--focus', 'Return book');
  assert.match(r.stdout, /Stops:\n {2}✗ NotBorrowed "This student does not have this book" when book is not in the student's books {2}\(line 33\)/);
  assert.match(r.stdout, /• Adds book to overflow when book is in the student's books and ShelfFull goes wrong {2}\(line 43\)/);
  const rule = read('--level', 'details', '--focus', 'late fee');
  assert.match(rule.stdout, /Answers:\n {2}■ Small fee when the days late is at most 7\n {2}■ Big fee otherwise\n/);
  assert.match(rule.stdout, /Can't tell from the code:\n {2}\? /);
});

test('text and original: Thunder Text, and the exact lines with their numbers', () => {
  assert.match(read('--level', 'text', '--focus', 'late fee').stdout, /- Ask: Days late is at most 7\? {2}\(line 26\)/);
  assert.match(read('--level', 'original', '--focus', 'late fee').stdout, /24 │ {5}def late_fee\(self, days_late: int\) -> str:\n[\s\S]*28 │ {9}return "BigFee"/);
});

test('a step Thunder could not explain is marked, never smoothed over', () => {
  const m = thunderModel([{ path: 'a.py', source: 'def handle(d):\n    with open(d) as fh:\n        exec(fh.read())\n    return 1\n' }]);
  const out = renderLevel(readLevel(m, 'flow', findFocus(m, 'handle').id), { file: 'a.py' });
  assert.match(out, /exec\(fh\.read\(\)\) {2}\[not read: shown as code\]/);
});

test('--json is exactly the model level OpenThunder reads', () => {
  const j = JSON.parse(read('--level', 'flow', '--focus', 'Late fee', '--json').stdout);
  const m = thunderModel([{ path: 'library.py', source: LIBRARY }], { name: 'library.py' });
  assert.deepEqual(j, readLevel(m, 'flow', findFocus(m, 'Late fee').id));
});

test('mistakes say what to do: a mistyped level, and a name that is not there', () => {
  const bad = read('--level', 'flwo');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /there is no level "flwo"\. The levels are: big-picture, flow, details, text, original\. Did you mean --level flow\?/);
  assert.equal(nearestLevel('zzzzzz'), null);
  const missing = read('--level', 'flow', '--focus', 'borrow');
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /Nothing here is called "borrow"\./);
  const m = thunderModel([{ path: 'library.py', source: LIBRARY }]);
  assert.match(findFocus(m, 'fee').error, /Did you mean: "Late fee"\?/);
});
