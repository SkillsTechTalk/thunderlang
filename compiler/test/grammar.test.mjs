import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const grammar = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'syntaxes', 'intent.tmLanguage.json'), 'utf8'));

test('the TextMate grammar is well-formed', () => {
  assert.equal(grammar.scopeName, 'source.intent');
  assert.deepEqual(grammar.fileTypes, ['intent']);
  assert.ok(grammar.patterns.length > 0);
  assert.ok(grammar.repository.comment && grammar.repository.string && grammar.repository['block-keyword']);
});

test('every grammar regex compiles', () => {
  for (const [k, v] of Object.entries(grammar.repository)) {
    for (const re of [v.match, v.begin, v.end].filter(Boolean)) {
      assert.doesNotThrow(() => new RegExp(re, 'm'), `bad regex in ${k}: ${re}`);
    }
    for (const p of v.patterns || []) if (p.match) assert.doesNotThrow(() => new RegExp(p.match));
  }
});

test('block keywords match only line-leading', () => {
  const kw = new RegExp(grammar.repository['block-keyword'].match, 'm');
  assert.ok(kw.test('  decision CanEnroll'));
  assert.ok(kw.test('mission M'));
  assert.ok(kw.test('    when age >= 18'));
});

test('a typed field colors name / separator / type', () => {
  const m = '  email: Email'.match(new RegExp(grammar.repository['field-type'].match));
  assert.deepEqual(m.slice(1), ['email', ':', 'Email']);
  assert.ok('  orders: List<Order>'.match(new RegExp(grammar.repository['field-type'].match)));
});

test('expression operators and numbers are recognized', () => {
  assert.deepEqual('age >= 18 and score < 3'.match(new RegExp(grammar.repository.operator.match, 'g')), ['>=', 'and', '<']);
  assert.ok('60%'.match(new RegExp(grammar.repository.number.match)));
});

test('the block-keyword list covers the parser keywords (no obvious gap)', () => {
  const re = grammar.repository['block-keyword'].match;
  for (const kw of ['mission', 'decision', 'lifecycle', 'outcome_contract', 'test', 'data', 'waiver', 'capability', 'release']) {
    assert.ok(new RegExp(`\\b${kw}\\b`).test(re), `grammar missing keyword ${kw}`);
  }
});
