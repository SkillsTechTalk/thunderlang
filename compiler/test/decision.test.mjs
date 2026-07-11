import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { semanticDiagnostics } from '../src/emit.mjs';
import { analyzeDecision } from '../src/decision.mjs';

const DEC = [
  'mission M',
  'decision CertificationEligibility',
  '  inputs', '    Candidate.region', '    Certification.prerequisites',
  '  rule Eligible', '    when all prerequisites completed', '    return Eligible',
  '  rule EligibleWithWaiver', '    when prerequisite_waiver approved', '    return EligibleWithWaiver',
  '  default', '    return NotEligible',
  '  explanation required',
  '  owner CertificationProduct',
].join('\n');

test('decision parses into typed AST', () => {
  const dec = parseIntent(DEC).decisions[0];
  assert.equal(dec.inputs.length, 2);
  assert.equal(dec.rules.length, 2);
  assert.equal(dec.rules[0].when, 'all prerequisites completed');
  assert.equal(dec.rules[0].result, 'Eligible');
  assert.equal(dec.default, 'NotEligible');
  assert.equal(dec.explanationRequired, true);
  assert.equal(dec.owner, 'CertificationProduct');
});

test('a well-formed decision has no findings', () => {
  assert.equal(analyzeDecision(parseIntent(DEC).decisions[0]).length, 0);
});

test('missing default is flagged (undefined when no rule matches)', () => {
  const dec = parseIntent('mission M\ndecision D\n  rule A\n    when x\n    return Yes\n').decisions[0];
  assert.ok(analyzeDecision(dec).some((f) => f.code === 'IL-DEC-001'));
});

test('conflicting rules: same condition, different result', () => {
  const dec = parseIntent('mission M\ndecision D\n  rule A\n    when x\n    return Yes\n  rule B\n    when x\n    return No\n  default\n    return Maybe\n').decisions[0];
  assert.ok(analyzeDecision(dec).some((f) => f.code === 'IL-DEC-002'));
});

test('redundant rules: same condition, same result', () => {
  const dec = parseIntent('mission M\ndecision D\n  rule A\n    when x\n    return Yes\n  rule B\n    when x\n    return Yes\n  default\n    return No\n').decisions[0];
  assert.ok(analyzeDecision(dec).some((f) => f.code === 'IL-DEC-003'));
});

test('missing default + conflict surface as blockers in semanticDiagnostics', () => {
  const d = semanticDiagnostics(parseIntent('mission M\ndecision D\n  rule A\n    when x\n    return Yes\n  rule B\n    when x\n    return No\n'));
  const dec1 = d.find((x) => x.code === 'IL-DEC-001');
  const dec2 = d.find((x) => x.code === 'IL-DEC-002');
  assert.equal(dec1.severity, 'blocker');
  assert.equal(dec2.severity, 'blocker');
  assert.equal(d.filter((x) => x.level === 'error').length, 0); // valid spec, blockers are phase gates
});
