import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalExpr, compileExpr, ExprError } from '../src/expr.mjs';

test('comparisons with numeric coercion', () => {
  assert.equal(evalExpr('age >= 18', { age: 20 }), true);
  assert.equal(evalExpr('age >= 18', { age: 17 }), false);
  assert.equal(evalExpr('age < 18', { age: '17' }), true); // string input coerced
  assert.equal(evalExpr('score == 70', { score: '70' }), true);
});

test('boolean logic: and / or / not (words and symbols)', () => {
  assert.equal(evalExpr('age >= 18 and score >= 70', { age: 18, score: 70 }), true);
  assert.equal(evalExpr('age >= 18 and score >= 70', { age: 18, score: 60 }), false);
  assert.equal(evalExpr('a || b', { a: false, b: true }), true);
  assert.equal(evalExpr('not done', { done: false }), true);
  assert.equal(evalExpr('!(age < 18)', { age: 20 }), true);
});

test('bare identifiers on the RHS act as enum literals', () => {
  assert.equal(evalExpr('status == active', { status: 'active' }), true);
  assert.equal(evalExpr('status == active', { status: 'closed' }), false);
});

test('membership: in [list]', () => {
  assert.equal(evalExpr('region in [US, CA, UK]', { region: 'CA' }), true);
  assert.equal(evalExpr('region in [US, CA]', { region: 'FR' }), false);
  assert.equal(evalExpr('n in [1, 2, 3]', { n: 2 }), true);
});

test('arithmetic and precedence', () => {
  assert.equal(evalExpr('a + b * 2', { a: 1, b: 3 }), 7);
  assert.equal(evalExpr('(a + b) * 2', { a: 1, b: 3 }), 8);
  assert.equal(evalExpr('total - used >= 0', { total: 10, used: 4 }), true);
});

test('dotted paths resolve into nested inputs', () => {
  assert.equal(evalExpr('candidate.age >= 18', { candidate: { age: 21 } }), true);
});

test('string literals with quotes', () => {
  assert.equal(evalExpr('country == "United States"', { country: 'United States' }), true);
});

test('compileExpr reuses a parsed predicate', () => {
  const p = compileExpr('age >= 21');
  assert.equal(p({ age: 25 }), true);
  assert.equal(p({ age: 20 }), false);
});

test('malformed expressions throw ExprError', () => {
  assert.throws(() => evalExpr('age >= ', {}), ExprError);
  assert.throws(() => evalExpr('age @ 3', {}), ExprError);
});

test('evaluation is deterministic', () => {
  const inputs = { age: 19, score: 88, region: 'US' };
  const expr = 'age >= 18 and score >= 70 and region in [US, CA]';
  assert.equal(evalExpr(expr, inputs), evalExpr(expr, inputs));
});
