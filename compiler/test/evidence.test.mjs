import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { toEvidenceEvents, verifyDiffToEvidence, conformToEvidence, driftToEvidence } from '../src/evidence.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'tl-evidence-'));

const PROOF = {
  compilerVersion: '0.4.1',
  missionName: 'Demo',
  sourceHash: 'sha256:abc123',
  proofStatus: 'draft',
  generatedAt: '2026-01-01T00:00:00.000Z',
  freshness: { intentHash: 'sha256:abc123def4567890', implementation: 'deadbeef', dependencies: { hash: 'sha256:lock', file: 'package-lock.json' }, environment: null },
  guarantees: [
    { id: 'g1', text: 'SUPER SECRET STATEMENT TEXT', status: 'verified', provenBy: 'TestA' },
    { id: 'g2', text: 'another', status: 'planned', provenBy: null },
  ],
  neverRules: [
    { id: 'n1', text: 'never log token', status: 'planned', provenBy: null },
  ],
};

test('toEvidenceEvents projects a proof into one tool_verified intent.proven event', () => {
  const [e, ...rest] = toEvidenceEvents(PROOF);
  assert.equal(rest.length, 0);
  assert.equal(e.schema, 'evidence-event-v1');
  assert.equal(e.sourceProduct, 'thunderlang');
  assert.equal(e.eventType, 'intent.proven');
  assert.equal(e.evidenceType, 'tool_verified');
  assert.equal(e.evidenceId, 'tl-proof-abc123def4567890');
  assert.equal(e.occurredAt, '2026-01-01T00:00:00.000Z');
  assert.equal(e.visibility, 'private');
  assert.equal(e.subject.intentHash, 'sha256:abc123def4567890');
  assert.equal(e.payload.total, 3);
  assert.deepEqual(e.payload.counts, { verified: 1, failed: 0, planned: 2, needs_verification: 0 });
  assert.equal(e.payload.freshness.dependencies, 'sha256:lock');
});

test('the projection is safe-derived: no statement text or source leaks', () => {
  const json = JSON.stringify(toEvidenceEvents(PROOF));
  assert.ok(!json.includes('SUPER SECRET STATEMENT TEXT'), 'claim statement text must not leak');
  const claim = toEvidenceEvents(PROOF)[0].payload.claims[0];
  assert.deepEqual(Object.keys(claim).sort(), ['id', 'kind', 'provenBy', 'status'].sort());
});

test('toEvidenceEvents returns [] for a non-proof input, and an empty-claims event for {}', () => {
  assert.deepEqual(toEvidenceEvents(null), []);
  assert.deepEqual(toEvidenceEvents(undefined), []);
  assert.deepEqual(toEvidenceEvents(42), []);
  const [e] = toEvidenceEvents({});
  assert.equal(e.payload.total, 0);
  assert.deepEqual(e.payload.counts, { verified: 0, failed: 0, planned: 0, needs_verification: 0 });
});

test('thunder evidence <file> prints valid evidence-event-v1 JSON', () => {
  const src = `mission Guard\n\ninput\n  token: Secret\n\nguarantee tokens are never logged\n  because logs leak\n  verify test Check\n\ndecision Check\n  inputs\n    ok\n  rule yes\n    when ok == true\n    return Allow\n  default\n    return Deny\n\ntest Check\n  case ok\n    given ok true\n    expect Allow\n`;
  const p = join(tmp, 'Guard.thunder');
  writeFileSync(p, src);
  const res = spawnSync(process.execPath, [CLI, 'evidence', p], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const events = JSON.parse(res.stdout);
  assert.ok(Array.isArray(events) && events.length >= 1);
  assert.equal(events[0].schema, 'evidence-event-v1');
  assert.equal(events[0].eventType, 'intent.proven');
  assert.equal(events[0].evidenceType, 'tool_verified');
  assert.ok(events[0].evidenceId.startsWith('tl-proof-'));
});

const CTX = { compilerVersion: '0.4.1', occurredAt: '2026-01-01T00:00:00.000Z', missionName: 'Demo', intentHash: 'sha256:abcdef0123456789', changeHash: 'sha256:99887766', codeHash: 'sha256:55443322' };

test('verifyDiffToEvidence projects a BLOCK verdict into a change.gated tool_verified event', () => {
  const verdict = { schema: 'x', ok: false, verdict: 'BLOCK', blocking: 1, findings: [{ level: 'error', code: 'INTENT_VERIFY_NEVER_VIOLATED', regression: true, line: 7, message: 'console.log(SECRET_TOKEN_VALUE)' }], summary: { regressions: 1 } };
  const [e] = verifyDiffToEvidence(verdict, CTX);
  assert.equal(e.eventType, 'change.gated');
  assert.equal(e.evidenceType, 'tool_verified');
  assert.equal(e.evidenceId, 'tl-verifydiff-abcdef0123456789-99887766');
  assert.equal(e.payload.verdict, 'BLOCK');
  assert.equal(e.payload.blocking, 1);
  assert.equal(e.payload.findings[0].code, 'INTENT_VERIFY_NEVER_VIOLATED');
  const json = JSON.stringify(e);
  assert.ok(!json.includes('SECRET_TOKEN_VALUE'), 'finding message (may quote code) must not leak');
});

test('conformToEvidence projects a report into conformance.verified with per-target counts', () => {
  const report = { schema: 'thunder-conformance-v1', total: 2, columns: ['typescript', 'python'], semanticFailures: 0, graded: true, failures: [{ target: 'python', case: 'X / a', expected: 'On', actual: 'Off' }], cases: [
    { key: 'X / a', targets: { typescript: { status: 'pass' }, python: { status: 'fail' } } },
    { key: 'X / b', targets: { typescript: { status: 'pass' }, python: { status: 'pass' } } },
  ] };
  const [e] = conformToEvidence(report, CTX);
  assert.equal(e.eventType, 'conformance.verified');
  assert.equal(e.evidenceType, 'tool_verified');
  assert.equal(e.evidenceId, 'tl-conform-abcdef0123456789');
  assert.deepEqual(e.payload.targets.typescript, { pass: 2, fail: 0, declared: 0 });
  assert.deepEqual(e.payload.targets.python, { pass: 1, fail: 1, declared: 0 });
  assert.deepEqual(e.payload.failures, [{ target: 'python', case: 'X / a' }]);
  const json = JSON.stringify(e);
  assert.ok(!json.includes('"On"') && !json.includes('"Off"'), 'expected/actual values must not leak');
});

test('driftToEvidence projects a drift report into an intent.drift event', () => {
  const report = { status: 'drift', findings: [{ level: 'warning', code: 'INTENT_DRIFT_INPUT_REMOVED', message: 'input secretKey removed' }], summary: { status: 'drift', blocking: 1 } };
  const [e] = driftToEvidence(report, CTX);
  assert.equal(e.eventType, 'intent.drift');
  assert.equal(e.evidenceType, 'tool_verified');
  assert.equal(e.evidenceId, 'tl-drift-abcdef0123456789-55443322');
  assert.equal(e.payload.status, 'drift');
  assert.equal(e.payload.blocking, 1);
  assert.equal(e.payload.findings[0].code, 'INTENT_DRIFT_INPUT_REMOVED');
  assert.ok(!JSON.stringify(e).includes('secretKey'), 'finding message must not leak');
});

test('the projections return [] on non-object input', () => {
  for (const fn of [verifyDiffToEvidence, conformToEvidence, driftToEvidence]) {
    assert.deepEqual(fn(null, CTX), []);
    assert.deepEqual(fn(undefined, CTX), []);
  }
});
