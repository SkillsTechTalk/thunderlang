import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { semanticDiagnostics } from '../src/emit.mjs';
import { analyzeDistributed } from '../src/distributed.mjs';

const SAFE = [
  'mission M',
  'command CreateStudyPlan',
  '  idempotency_key Request.id',
  '  timeout 30 seconds',
  '  retry at_most 2', '    with exponential_backoff',
  'event StudyPlanCreated',
  '  delivery at_least_once',
  '  ordered_by Learner.id',
  'on duplicate StudyPlanCreated', '  ignore when Event.id was_processed',
  'on permanent_failure', '  compensate RemovePartialStudyPlan', '  notify Learner',
].join('\n');

test('command / event / handler parse with failure policy', () => {
  const ast = parseIntent(SAFE);
  const c = ast.commands[0];
  assert.equal(c.idempotencyKey, 'Request.id');
  assert.equal(c.timeout, '30 seconds');
  assert.equal(c.retry, 'at_most 2');
  assert.equal(c.backoff, 'exponential_backoff');
  assert.equal(ast.events[0].delivery, 'at_least_once');
  assert.equal(ast.events[0].orderedBy, 'Learner.id');
  assert.equal(ast.handlers.length, 2);
  assert.deepEqual(ast.handlers.find((h) => /permanent/.test(h.trigger)).compensate, ['RemovePartialStudyPlan']);
});

test('a well-formed distributed spec has no findings', () => {
  assert.equal(analyzeDistributed(parseIntent(SAFE)).length, 0);
});

test('unsafe failure policy is caught (the four flagship checks)', () => {
  const bad = parseIntent('mission M\ncommand C\n  retry at_most 3\nevent E\n  delivery at_least_once\non permanent_failure\n  notify X\n');
  const codes = analyzeDistributed(bad).map((f) => f.code);
  assert.ok(codes.includes('IL-DIST-001')); // retry, no idempotency_key
  assert.ok(codes.includes('IL-DIST-002')); // retry, no timeout
  assert.ok(codes.includes('IL-DIST-003')); // at_least_once, no duplicate handler
  assert.ok(codes.includes('IL-DIST-004')); // permanent_failure, no compensation
});

test('retry-without-idempotency surfaces as a role-rendered blocker (the classic bug)', () => {
  const d = semanticDiagnostics(parseIntent('mission M\ncommand Pay\n  retry at_most 3\n  timeout 5 seconds\n'));
  const f = d.find((x) => x.code === 'IL-DIST-001');
  assert.ok(f);
  assert.equal(f.severity, 'blocker');
  assert.ok(f.roles.engineer);
  assert.ok(/idempoten/i.test(f.why));
});

test('duplicate handler for an undeclared event is an error', () => {
  const d = semanticDiagnostics(parseIntent('mission M\non duplicate GhostEvent\n  ignore when x\n'));
  assert.ok(d.some((x) => x.code === 'IL-DIST-005' && x.level === 'error'));
});
