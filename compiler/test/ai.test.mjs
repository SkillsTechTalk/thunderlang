import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { semanticDiagnostics } from '../src/emit.mjs';
import {
  IMPLEMENTATION_STATES, blocksProduction, parseMarkers, renderMarker,
  contractHash, implementationHash, buildManifest,
} from '../src/ai.mjs';

const FULL = [
  'mission CalculateRiskScore',
  'goal', '  score a customer',
  'input', '  customer: Customer',
  'output', '  score: RiskScore',
  'guarantees', '  score is at most 100',
  'never', '  call external network services',
  'implement with ai',
  '  id: calculate-risk-score',
  '  scope: function_body',
  '  risk: medium',
  '  approval: required',
  '  may_modify', '    CalculateRiskScore.body',
  '  must_not_modify', '    CalculateRiskScore.contract',
].join('\n');

test('implement with ai block parses into the AST', () => {
  const ast = parseIntent(FULL);
  const im = ast.implementation;
  assert.ok(im);
  assert.equal(im.id, 'calculate-risk-score');
  assert.equal(im.scope, 'function_body');
  assert.equal(im.risk, 'medium');
  assert.equal(im.approval, 'required');
  assert.deepEqual(im.mayModify, ['CalculateRiskScore.body']);
  assert.deepEqual(im.mustNotModify, ['CalculateRiskScore.contract']);
  assert.equal(im.pending, false);
});

test('concise "implement with ai pending" form', () => {
  const ast = parseIntent('mission M\ngoal\n  g\nimplement with ai pending\n');
  assert.ok(ast.implementation);
  assert.equal(ast.implementation.pending, true);
});

test('a pending AI implementation is INFO, not an error', () => {
  const diags = semanticDiagnostics(parseIntent(FULL));
  const info = diags.find((d) => d.code === 'INTENT-AI-001');
  assert.ok(info);
  assert.equal(info.level, 'info');
  assert.equal(diags.filter((d) => d.level === 'error').length, 0);
});

test('high risk without approval warns; bad scope warns', () => {
  const ast = parseIntent('mission M\ngoal\n  g\nimplement with ai\n  id: x\n  scope: whole_repo\n  risk: high\n');
  const codes = semanticDiagnostics(ast).map((d) => d.code);
  assert.ok(codes.includes('INTENT-AI-013')); // high risk, no approval
  assert.ok(codes.includes('INTENT-AI-010')); // unsupported scope
});

test('state model + production gating', () => {
  assert.equal(IMPLEMENTATION_STATES.length, 9);
  for (const s of ['PENDING', 'GENERATED', 'MODIFIED', 'INVALID', 'REJECTED', 'VERIFIED_AWAITING_APPROVAL']) {
    assert.equal(blocksProduction(s), true, `${s} should block`);
  }
  assert.equal(blocksProduction('APPROVED'), false);
  assert.equal(blocksProduction('ADOPTED'), false);
  assert.equal(blocksProduction('VERIFIED', { approvalRequired: true }), true);
  assert.equal(blocksProduction('VERIFIED', { approvalRequired: false }), false);
});

test('marker round-trip across languages; broken + duplicate detected', () => {
  const { open, close } = renderMarker({ id: 'x', mission: 'M', status: 'generated' }, 'typescript');
  assert.match(open, /^\/\/ <intent:ai-implementation /);
  const code = [open, 'const x = 1;', close].join('\n');
  const { regions, findings } = parseMarkers(code);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].id, 'x');
  assert.equal(regions[0].attrs.status, 'generated');
  assert.equal(findings.length, 0);

  assert.match(renderMarker({ id: 'x', status: 'generated' }, 'python').open, /^# </);

  assert.ok(parseMarkers(open + '\ncode').findings.some((f) => f.code === 'INTENT-AI-101')); // missing close
  const dupe = [open, close, open, close].join('\n');
  assert.ok(parseMarkers(dupe).findings.some((f) => f.code === 'INTENT-AI-102')); // duplicate id
});

test('contract hash: stable, and changes when the contract changes', () => {
  const a = parseIntent(FULL);
  const b = parseIntent(FULL);
  assert.equal(contractHash(a), contractHash(b));
  assert.match(contractHash(a), /^sha256:[0-9a-f]{64}$/);
  const changed = parseIntent(FULL.replace('score is at most 100', 'score is at most 50'));
  assert.notEqual(contractHash(a), contractHash(changed));
});

test('implementation hash: whitespace-insensitive, content-sensitive', () => {
  const base = 'function f(){\n  return 1;\n}';
  assert.equal(implementationHash(base), implementationHash(base + '\n\n'));      // trailing blank lines
  assert.equal(implementationHash(base), implementationHash('function f(){  \n  return 1;   \n}')); // trailing ws
  assert.notEqual(implementationHash(base), implementationHash('function f(){\n  return 2;\n}'));   // real change
});

test('buildManifest produces PENDING entries with derived approval', () => {
  const ast = parseIntent(FULL);
  const m = buildManifest([{ path: 'risk.intent', source: FULL, ast }], { projectId: 'p' });
  assert.equal(m.schemaVersion, '1.0');
  assert.equal(m.implementations.length, 1);
  const e = m.implementations[0];
  assert.equal(e.id, 'calculate-risk-score');
  assert.equal(e.status, 'PENDING');
  assert.equal(e.approval, 'required');
  assert.match(e.contractHash, /^sha256:/);
  assert.equal(e.proofLocation, '.intent/proofs/calculate-risk-score.json');

  // A high-risk impl with no explicit approval still defaults to required.
  const hr = parseIntent('mission H\ngoal\n  g\nimplement with ai\n  id: h\n  risk: critical\n');
  assert.equal(buildManifest([{ path: 'h.intent', source: '', ast: hr }]).implementations[0].approval, 'required');
});
