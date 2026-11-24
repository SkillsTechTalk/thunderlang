// Big Picture in every language Thunder reads: classes, structs, records, data classes, and enums become Things,
// Data (records), and Choices, with what they know, how they start, and what they can do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { thunderModel, readLevel, THING_LANGUAGES } from '../src/model.mjs';

const DIR = new URL('./fixtures/things/', import.meta.url);
const model = (f) => thunderModel([{ path: f, source: readFileSync(new URL(f, DIR), 'utf8') }]);
const thing = (m, name) => m.things.find((t) => t.name === name);

test('Things are drawn in all ten languages', () => {
  assert.deepEqual([...THING_LANGUAGES].sort(), ['csharp', 'go', 'java', 'javascript', 'kotlin', 'php', 'python', 'ruby', 'rust', 'sql', 'typescript']);
});

for (const f of readdirSync(DIR)) {
  test(`${f}: the Library is a Thing that knows its limit and can work out a late fee; nothing is left unexplained`, () => {
    const m = model(f);
    const lib = thing(m, 'Library');
    assert.equal(lib.kind, 'thing', 'it can do things');
    assert.ok(lib.knows.some((k) => k.label === 'max books'), 'it knows max books');
    assert.ok(lib.knows.some((k) => k.label === 'overflow' && k.start === 'empty at first'), 'overflow starts empty');
    assert.ok(m.members.some((x) => x.owner === lib.id && x.label === 'Late fee'), 'Late fee belongs to the Library');
    assert.equal(m.unknowns.length, 0, JSON.stringify(m.unknowns));
    const book = thing(m, 'Book');
    if (f.endsWith('.php')) return; // the PHP fixture has no Book
    assert.equal(book.kind, 'record', 'Book only remembers facts');
    assert.ok(book.knows.some((k) => k.label === 'title'));
  });
}

test('choices: enums in every language that has them list their values in words', () => {
  for (const f of ['Library.java', 'Library.cs', 'Library.kt', 'Library.php', 'library.go', 'library.rs']) {
    const s = thing(model(f), 'Status');
    assert.equal(s.kind, 'choices', f);
    assert.deepEqual(s.choices.slice(0, 2), ['on shelf', 'borrowed'], f);
  }
});

test('starting values and docs read the way each language writes them', () => {
  assert.equal(thing(model('Library.kt'), 'Library').knows.find((k) => k.label === 'max books').start, '3 at first');
  assert.equal(thing(model('Library.java'), 'Library').knows.find((k) => k.label === 'max books').start, 'given when it starts');
  assert.equal(thing(model('library.rb'), 'Library').knows.find((k) => k.label === 'max books').start, '3 unless told otherwise');
  assert.equal(thing(model('library.go'), 'Library').doc, 'Lends books to students and takes them back.', 'Go docs without the type name');
  assert.equal(thing(model('Library.java'), 'Library').doc, 'Lends books to students and takes them back.', 'only the doc right above');
  assert.equal(thing(model('library.rs'), 'Library').knows.find((k) => k.label === 'overflow').kind, 'a list of Books');
});

test('Big Picture of a Go or Rust file shows the Library with its methods, though they are written outside the type', () => {
  for (const f of ['library.go', 'library.rs']) {
    const big = readLevel(model(f), 'big-picture');
    assert.deepEqual(big.things.map((t) => [t.label, t.can.map((c) => c.label)]), [['Library', ['Late fee']]], f);
  }
});

test('Details: what comes after a guard that can stop only happens on the other side, and an object names its keys', () => {
  const SRC = "fastify.get('/orgs/:slug', async (request, reply) => {\n  const { slug } = request.params as { slug: string };\n  const org = await store.getOrg(slug);\n  if (!org) return reply.code(404).send({ error: 'Org not found.' });\n  const repos = await store.repos(org.id);\n  return { org, repos, avg: average(repos), failing: repos.filter((r) => r.failing) };\n});";
  const m = thunderModel([{ path: 'r.ts', source: SRC }]);
  const d = readLevel(m, 'details', m.members[0].id);
  assert.deepEqual(d.givesBack, [{ text: 'Gives back org, repos, avg, and failing', line: 6, when: [{ question: 'Is org set?', answer: 'Yes' }] }]);
  assert.deepEqual(d.stops[0].when, [{ question: 'Is org set?', answer: 'No' }]);
});
