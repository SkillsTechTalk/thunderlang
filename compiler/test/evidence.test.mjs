import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { toEvidenceEvents } from '../src/evidence.mjs';

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
