import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { runTests, TEST_SCHEMA } from '../src/testing.mjs';

const src = `mission Eligibility
decision CanEnroll
  inputs
    age
    score
  rule adult
    when age >= 18 and score >= 70
    return Eligible
  rule provisional
    when age >= 18
    return Provisional
  default
    return NotEligible
lifecycle Enrollment
  state Draft
  state Submitted
  state Approved
  transition submit
    from Draft
    to Submitted
  transition approve
    from Submitted
    to Approved
  terminal Approved
test CanEnroll
  case adult high
    given age 20, score 90
    expect Eligible
  case adult low
    given age 20, score 50
    expect Provisional
  case minor
    given age 10
    expect NotEligible
test Enrollment
  scenario happy
    events submit, approve
    expect Approved
    valid
  scenario illegal
    events approve
    invalid
`;
const ast = parseIntent(src);

test('parseIntent extracts test blocks with cases + scenarios', () => {
  assert.equal(ast.tests.length, 2);
  assert.equal(ast.tests[0].name, 'CanEnroll');
  assert.equal(ast.tests[0].cases.length, 3);
  assert.deepEqual(ast.tests[0].cases[0].given, { age: '20', score: '90' });
  assert.equal(ast.tests[0].cases[0].expect, 'Eligible');
  assert.deepEqual(ast.tests[1].cases[0].events, ['submit', 'approve']);
  assert.equal(ast.tests[1].cases[0].expectValid, true);
  assert.equal(ast.tests[1].cases[1].expectValid, false);
});

test('runTests executes decision cases through the runtime', () => {
  const r = runTests(ast);
  assert.equal(r.schema, TEST_SCHEMA);
  assert.equal(r.ok, true);
  assert.equal(r.passed, r.total);
  assert.equal(r.total, 5);
});

test('a wrong expectation fails (the tests actually assert)', () => {
  const bad = parseIntent(`mission M
decision CanEnroll
  inputs
    age
    score
  rule adult
    when age >= 18 and score >= 70
    return Eligible
  default
    return NotEligible
test CanEnroll
  case wrong
    given age 20, score 90
    expect NotEligible
`);
  const r = runTests(bad);
  assert.equal(r.ok, false);
  assert.ok(r.results.some((c) => c.case === 'wrong' && c.pass === false && c.actual === 'Eligible'));
});

test('lifecycle scenarios assert final state and validity', () => {
  const r = runTests(ast);
  const happy = r.results.find((c) => c.case === 'happy');
  assert.equal(happy.pass, true);
  assert.equal(happy.actual, 'Approved');
  const illegal = r.results.find((c) => c.case === 'illegal');
  assert.equal(illegal.pass, true);
  assert.equal(illegal.valid, false);
});

test('numeric and boolean given-values are coerced', () => {
  const s = `mission M
decision D
  inputs
    n
    flag
  rule yes
    when n >= 10 and flag == true
    return Y
  default
    return N
test D
  case both
    given n 12, flag true
    expect Y
`;
  const r = runTests(parseIntent(s));
  assert.equal(r.ok, true);
});

test('string given-values work quoted or bare (quotes are stripped)', () => {
  const s = `mission M
decision D
  inputs
    severity
  rule high
    when severity == "high"
    return Page
  default
    return Queue
test D
  case quoted
    given severity "high"
    expect Page
  case bare
    given severity high
    expect Page
  case other
    given severity low
    expect Queue
`;
  const r = runTests(parseIntent(s));
  assert.equal(r.ok, true, JSON.stringify(r.results.filter((x) => !x.pass)));
  assert.equal(r.passed, 3);
});

test('a test targeting a missing decision/lifecycle is a clear failure', () => {
  const s = 'mission M\ntest Nope\n  case c\n    given x 1\n    expect Y\n';
  const r = runTests(parseIntent(s));
  assert.equal(r.ok, false);
  assert.match(r.results[0].error, /no decision or lifecycle/);
});

test('a file with no test blocks yields an empty, passing report', () => {
  const r = runTests(parseIntent('mission M\nguarantees\n  a holds\n'));
  assert.equal(r.total, 0);
  assert.equal(r.ok, true);
});
