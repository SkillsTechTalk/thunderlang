import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { runTests } from '../src/testing.mjs';
import { resolveObligations } from '../src/obligations.mjs';
const source = `mission Boundary
decision Authorization
  inputs
    age
  rule adult
    when age >= 18
    return Allow
  default
    return Deny
test Authorization
  case adult
    given age 20
    expect Allow
`;
const claim = (references) => resolveObligations(parseIntent(source + '\nguarantee policy holds\n' + references.map((r) => `  verify ${r}\n`).join(''))).obligations[0];
test('only complete target names bind; prose and substrings remain declared', () => {
  assert.equal(claim(['Authorization']).status, 'verified');
  assert.equal(claim(['test Authorization']).status, 'verified');
  for (const ref of ['Auth', 'authorization', 'AuthorizationExtra', 'Authorization security test']) assert.equal(claim([ref]).status, 'declared', ref);
});
test('every reference must resolve; a passing subset is insufficient', () => {
  const r = claim(['Authorization', 'Missing']);
  assert.equal(r.status, 'declared');
  assert.deepEqual(r.unresolved, ['Missing']);
  assert.equal(r.provenBy, null);
});
test('evaluation errors cannot be rescued by a matching fallback', () => {
  const ast = parseIntent(source.replace('age >= 18', 'age >= (').replace('expect Allow', 'expect Deny'));
  assert.equal(runTests(ast).failed, 1);
  assert.match(runTests(ast).results[0].error, /condition failed/);
});
test('no assertion or no cases cannot produce passing evidence', () => {
  assert.equal(runTests(parseIntent(source.replace('    expect Allow', ''))).failed, 1);
  assert.equal(runTests(parseIntent('mission M\ntest Empty\n')).failed, 1);
});
test('invalid lifecycle path fails even if final state matches; explicit invalid is supported', () => {
  const src = `mission M\nlifecycle Order\n  state Draft\n  state Done\n  transition finish\n    from Draft\n    to Done\ntest Order\n  scenario typo\n    events wrong\n    expect Draft\n`;
  assert.equal(runTests(parseIntent(src)).failed, 1);
  assert.equal(runTests(parseIntent(src + '    invalid\n')).passed, 1);
});
test('one failing referenced test dominates missing references', () => {
  const ast = parseIntent(source.replace('expect Allow', 'expect Deny') + '\nguarantee policy holds\n  verify Authorization\n  verify Missing\n');
  assert.equal(resolveObligations(ast).obligations[0].status, 'failed');
});
