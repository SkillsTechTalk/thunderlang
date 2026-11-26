// @skillstech/thunderlang/learn: the tutorial ships with the compiler, and every quiz answer is the compiler's own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { learnThunder, LEARN_SCHEMA, READ_LESSONS } from '../src/learn.mjs';
import { COMPILER_VERSION } from '../src/emit.mjs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));

test('the export names its schema and the language version it was built against', () => {
  const r = learnThunder();
  assert.equal(r.schema, LEARN_SCHEMA);
  assert.equal(r.languageVersion, COMPILER_VERSION);
  assert.equal(r.languageVersion, pkg.version, 'lessons are built against the version being released');
  assert.ok(pkg.exports['./learn'], 'package.json exports ./learn');
});

test('every lesson has an idea, a picture, at least one compiler-graded question, and open questions', () => {
  const { lessons } = learnThunder();
  assert.equal(lessons.filter((l) => l.part === 'read').length, 12);
  assert.equal(lessons.filter((l) => l.part === 'write').length, 7);
  for (const l of lessons) {
    assert.ok(l.title && l.idea && l.picture && ['read', 'write'].includes(l.part), l.slug);
    assert.ok(l.questions.length >= 1, `${l.slug} has a quiz`);
    for (const q of l.questions) assert.ok(q.choices.includes(q.answer) && q.explain, `${l.slug}: ${q.prompt}`);
    assert.ok(l.reflect.length >= 1, l.slug);
  }
});

test('the answers are worked out by the compiler, so a lesson that disagrees with it cannot be built', () => {
  const q = READ_LESSONS.find((l) => l.slug === 'cards').quiz[0];
  const saved = q.expect;
  q.expect = 'Standard';
  try { assert.throws(() => learnThunder(), /lesson expects "Standard", but the compiler says "Free"/); }
  finally { q.expect = saved; }
});

test('the reading part ends by teaching a whole app in OpenThunder, and studying your own', () => {
  const lessons = learnThunder().lessons.filter((l) => l.part === 'read');
  assert.deepEqual(lessons.slice(-2).map((l) => l.slug), ['openthunder', 'study']);
  const app = lessons.at(-2);
  assert.deepEqual(app.questions.map((q) => q.answer), ['2', 'POST /orders', 'As a rule card']);
  assert.deepEqual(lessons.at(-1).questions.map((q) => q.answer), ['Different meaning', 'Same meaning']);
});

test('the export is plain data (no functions) and the same on every build', () => {
  const a = JSON.stringify(learnThunder());
  assert.equal(a, JSON.stringify(learnThunder()));
  assert.ok(!/"check"/.test(a));
});
