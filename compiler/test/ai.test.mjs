import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { semanticDiagnostics } from '../src/emit.mjs';
import {
  IMPLEMENTATION_STATES, blocksProduction, parseMarkers, renderMarker,
  contractHash, implementationHash, buildManifest,
  resolveState, productionGate, adoptRegion,
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

// ── state resolution + production gate + adoption ───────────────────────────
function region(ast) {
  const { open, close } = renderMarker({ id: ast.implementation.id, mission: ast.mission, status: 'verified' }, 'typescript');
  const code = [open, 'function f(){ return 1; }', close].join('\n');
  return parseMarkers(code).regions[0];
}

test('resolveState walks the lifecycle', () => {
  const ast = parseIntent(FULL);
  const r = region(ast);
  const validProof = { status: 'VERIFIED', contractHash: contractHash(ast), implementationHash: implementationHash(r.code) };

  assert.equal(resolveState({ ast, region: null, proof: null }).status, 'PENDING');
  assert.equal(resolveState({ ast, region: r, proof: null }).status, 'GENERATED');
  // valid proof + approval required -> awaiting approval
  assert.equal(resolveState({ ast, region: r, proof: validProof }).status, 'VERIFIED_AWAITING_APPROVAL');
  // recorded approval matching the hashes -> APPROVED
  assert.equal(resolveState({ ast, region: r, proof: validProof, approval: { contractHash: validProof.contractHash, implementationHash: validProof.implementationHash } }).status, 'APPROVED');
  // contract changed since proof -> MODIFIED (stale)
  assert.equal(resolveState({ ast, region: r, proof: { ...validProof, contractHash: 'sha256:old' } }).status, 'MODIFIED');
  // implementation changed since proof -> MODIFIED (stale)
  assert.equal(resolveState({ ast, region: r, proof: { ...validProof, implementationHash: 'sha256:old' } }).status, 'MODIFIED');
});

test('resolveState: no-approval impl verifies to VERIFIED; adopted region is ADOPTED', () => {
  const ast = parseIntent('mission M\ngoal\n  g\nguarantees\n  x\nimplement with ai\n  id: m\n  risk: low\n');
  const r = region(ast);
  const proof = { status: 'VERIFIED', contractHash: contractHash(ast), implementationHash: implementationHash(r.code) };
  assert.equal(resolveState({ ast, region: r, proof }).status, 'VERIFIED');

  const adopted = adoptRegion([renderMarker({ id: 'm', mission: 'M', status: 'verified' }, 'typescript').open, 'code', renderMarker({ id: 'm' }, 'typescript').close].join('\n'), 'm');
  const ar = parseMarkers(adopted.code).regions[0];
  assert.equal(resolveState({ ast, region: ar, proof }).status, 'ADOPTED');
});

test('productionGate blocks unshippable states; --allow-pending tolerates PENDING only', () => {
  const resolved = [
    { id: 'a', status: 'APPROVED', approvalRequired: true },
    { id: 'b', status: 'PENDING', approvalRequired: false },
    { id: 'c', status: 'MODIFIED', approvalRequired: false },
  ];
  assert.equal(productionGate(resolved).ok, false);
  assert.equal(productionGate(resolved).blocking.length, 2);
  // allow-pending forgives PENDING but NOT MODIFIED
  const dev = productionGate(resolved, { allowPending: true });
  assert.equal(dev.ok, false);
  assert.deepEqual(dev.blocking.map((r) => r.id), ['c']);
  // all shippable -> ok
  assert.equal(productionGate([{ id: 'a', status: 'APPROVED' }, { id: 'd', status: 'ADOPTED' }]).ok, true);
});

test('adoptRegion rewrites AI marker to human-owned, preserving provenance', () => {
  const { open, close } = renderMarker({ id: 'x', mission: 'M', status: 'verified' }, 'typescript');
  const code = [open, 'const y = 1;', close].join('\n');
  const res = adoptRegion(code, 'x');
  assert.ok(res);
  assert.match(res.code, /<intent:implementation id="x" mission="M" origin="ai" ownership="human">/);
  assert.match(res.code, /<\/intent:implementation>/);
  assert.equal(adoptRegion(code, 'nope'), null); // unknown id
});

// ── approvals store + decision-aware resolution + events ────────────────────
import { recordDecision, approvalFor, emptyApprovals, makeEvent, INTENT_AI_EVENTS } from '../src/ai.mjs';

test('recordDecision binds to hashes; resolveState reads approve/reject', () => {
  const ast = parseIntent(FULL);
  const r = region(ast);
  const cH = contractHash(ast), iH = implementationHash(r.code);
  const proof = { status: 'VERIFIED', contractHash: cH, implementationHash: iH };

  let store = emptyApprovals();
  const ok = recordDecision(store, 'calculate-risk-score', { decision: 'approved', by: 'alice', role: 'security_reviewer', contractHash: cH, implementationHash: iH, at: 't' });
  assert.ok(!ok.error);
  store = ok.store;
  assert.equal(approvalFor(store, 'calculate-risk-score').by, 'alice');
  assert.equal(resolveState({ ast, region: r, proof, approval: approvalFor(store, 'calculate-risk-score') }).status, 'APPROVED');

  // a rejection resolves to REJECTED
  const rej = recordDecision(emptyApprovals(), 'calculate-risk-score', { decision: 'rejected', by: 'bob', contractHash: cH, implementationHash: iH, at: 't' });
  assert.equal(resolveState({ ast, region: r, proof, approval: approvalFor(rej.store, 'calculate-risk-score') }).status, 'REJECTED');

  // approval bound to OLD hashes does not count once the impl changes
  const staleApproval = { decision: 'approved', contractHash: cH, implementationHash: 'sha256:old' };
  assert.equal(resolveState({ ast, region: r, proof, approval: staleApproval }).status, 'VERIFIED_AWAITING_APPROVAL');
});

test('recordDecision refuses missing hashes / bad decision', () => {
  assert.ok(recordDecision(emptyApprovals(), 'x', { decision: 'approved', contractHash: 'sha256:a' }).error); // no impl hash
  assert.ok(recordDecision(emptyApprovals(), 'x', { decision: 'maybe', contractHash: 'sha256:a', implementationHash: 'sha256:b' }).error);
});

test('makeEvent builds the versioned integration payload', () => {
  assert.equal(INTENT_AI_EVENTS.length, 15);
  const e = makeEvent('IntentAiImplementationApproved', { implementationId: 'x', newStatus: 'APPROVED', actorType: 'human' });
  assert.equal(e.schemaVersion, '1.0');
  assert.equal(e.type, 'IntentAiImplementationApproved');
  assert.equal(e.implementationId, 'x');
  assert.equal(e.newStatus, 'APPROVED');
  assert.equal(e.contractHash, null); // unset fields are null, not undefined
});
