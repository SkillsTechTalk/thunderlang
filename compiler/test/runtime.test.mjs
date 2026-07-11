import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { evaluateDecision, simulateLifecycle, checkDecisionCases, RUNTIME_SCHEMA } from '../src/runtime.mjs';

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
  state Rejected
  transition submit
    from Draft
    to Submitted
  transition approve
    from Submitted
    to Approved
  transition reject
    from Submitted
    to Rejected
  terminal Approved, Rejected
`;
const ast = parseIntent(src);
const dec = ast.decisions[0];
const lc = ast.lifecycles[0];

test('evaluateDecision: FIRST-hit picks the first matching rule', () => {
  const r = evaluateDecision(dec, { age: 20, score: 90 });
  assert.equal(r.schema, RUNTIME_SCHEMA);
  assert.equal(r.result, 'Eligible');
  assert.equal(r.matched, 'adult');
  assert.equal(r.undecided, false);
});

test('evaluateDecision: falls through to a later rule', () => {
  assert.equal(evaluateDecision(dec, { age: 20, score: 50 }).result, 'Provisional');
});

test('evaluateDecision: default is the catch-all', () => {
  const r = evaluateDecision(dec, { age: 12 });
  assert.equal(r.result, 'NotEligible');
  assert.equal(r.matched, 'default');
});

test('evaluateDecision: trace records every rule evaluation', () => {
  const r = evaluateDecision(dec, { age: 20, score: 50 });
  assert.equal(r.trace.length, 2);
  assert.equal(r.trace[0].matched, false); // adult (score too low)
  assert.equal(r.trace[1].matched, true);  // provisional
});

test('evaluateDecision: a malformed condition is recorded, not thrown', () => {
  const bad = parseIntent('mission M\ndecision D\n  rule r\n    when age >@ 3\n    return X\n  default\n    return Y\n').decisions[0];
  const r = evaluateDecision(bad, { age: 5 });
  assert.equal(r.ok, false);
  assert.ok(r.trace[0].error);
  assert.equal(r.result, 'Y'); // still resolves via default
});

test('simulateLifecycle: a valid event sequence walks to a terminal', () => {
  const s = simulateLifecycle(lc, ['submit', 'approve']);
  assert.deepEqual(s.path, ['Draft', 'Submitted', 'Approved']);
  assert.equal(s.valid, true);
  assert.equal(s.endedTerminal, true);
  assert.equal(s.finalState, 'Approved');
});

test('simulateLifecycle: an impossible event is rejected without changing state', () => {
  const s = simulateLifecycle(lc, ['approve']);
  assert.equal(s.valid, false);
  assert.equal(s.steps[0].ok, false);
  assert.match(s.steps[0].reason, /no transition/);
  assert.equal(s.finalState, 'Draft');
});

test('simulateLifecycle: events after a terminal state are rejected as terminal', () => {
  const s = simulateLifecycle(lc, ['submit', 'approve', 'reject']);
  assert.equal(s.steps[2].ok, false);
  assert.match(s.steps[2].reason, /terminal/);
});

test('simulateLifecycle: an event can be named by its target state', () => {
  const s = simulateLifecycle(lc, ['Submitted', 'Approved']);
  assert.equal(s.valid, true);
  assert.deepEqual(s.path, ['Draft', 'Submitted', 'Approved']);
});

test('checkDecisionCases: a decision becomes a self-checking spec', () => {
  const chk = checkDecisionCases(dec, [
    { name: 'adult high', inputs: { age: 20, score: 90 }, expect: 'Eligible' },
    { name: 'adult low', inputs: { age: 20, score: 50 }, expect: 'Provisional' },
    { name: 'minor', inputs: { age: 10 }, expect: 'NotEligible' },
    { name: 'wrong', inputs: { age: 20, score: 90 }, expect: 'NotEligible' },
  ]);
  assert.equal(chk.total, 4);
  assert.equal(chk.passed, 3);
  assert.equal(chk.results.find((r) => r.case === 'wrong').pass, false);
});

test('runtime is deterministic', () => {
  assert.deepEqual(evaluateDecision(dec, { age: 18, score: 75 }), evaluateDecision(dec, { age: 18, score: 75 }));
  assert.deepEqual(simulateLifecycle(lc, ['submit', 'reject']), simulateLifecycle(lc, ['submit', 'reject']));
});
