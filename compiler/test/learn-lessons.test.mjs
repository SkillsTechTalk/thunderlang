// The /learn tutorial promises specific outcomes. Prove every lesson compiles, its examples pass,
// all six languages translate, and each "Try this" edit does exactly what the lesson says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewHumanContract, compileHumanContract } from '../src/human-contract.mjs';
import { parseIntent } from '../src/parse.mjs';
import { translateDecisions, TRANSLATE_LANGUAGES } from '../src/translate.mjs';
import { LESSONS } from '../../src/app/learn/lessons.mjs';

for (const lesson of LESSONS) {
  test(`lesson "${lesson.slug}": compiles, examples pass, six languages translate`, () => {
    const report = previewHumanContract(lesson.source);
    assert.equal(report.tests.failed, 0, JSON.stringify(report.tests.results.filter((r) => !r.pass)));
    assert.ok(report.tests.total >= 2);
    const ast = parseIntent(compileHumanContract(lesson.source));
    for (const { key } of TRANSLATE_LANGUAGES) assert.doesNotMatch(translateDecisions(ast, key), /\bif \(?false\)?/);
  });

  test(`lesson "${lesson.slug}": "Try this" does what it says`, () => {
    assert.equal(lesson.source.split(lesson.tryThis.find).length, 2, 'find text must occur exactly once');
    const edited = lesson.source.replace(lesson.tryThis.find, lesson.tryThis.replace);
    const report = previewHumanContract(edited);
    assert.equal(report.tests.failed > 0, lesson.tryThis.breaksExamples, JSON.stringify(report.tests.results.map((r) => [r.case, r.actual])));
    if (lesson.tryThis.breaksExamples) {
      // The lesson names the example that breaks; it must be exactly the one that fails.
      const named = lesson.tryThis.expect.match(/"([^"]+)"/)[1];
      assert.deepEqual(report.tests.results.filter((r) => !r.pass).map((r) => r.case), [named]);
    }
  });
}
