import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'tl-prove-'));
const write = (name, src) => { const p = join(tmp, name); writeFileSync(p, src); return p; };
const prove = (file, extra = []) => spawnSync(process.execPath, [CLI, 'prove', file, ...extra], { encoding: 'utf8' });

// A guarantee with a verify is "planned"; a never-rule without one is "needs_verification" (UNVERIFIED).
const SRC = `mission Billing
guarantee total is never negative
  verify total test
never expose payment token in logs
target
  TypeScript
`;

test('thunder prove emits a valid intent-proof-v1 artifact via --json', () => {
  const file = write('Billing.thunder', SRC);
  const res = prove(file, ['--json']);
  const out = JSON.parse(res.stdout);
  assert.equal(out.missionName, 'Billing');
  assert.ok(out.sourceHash.startsWith('sha256:'), 'proof carries a source hash');
  assert.ok(out.proofId.startsWith('proof-'), 'proof has an id');
  assert.equal(out.guarantees.length, 1);
  assert.equal(out.neverRules.length, 1);
});

test('thunder prove reports UNVERIFIED claims honestly (never silently passes)', () => {
  const file = write('Billing2.thunder', SRC);
  const res = prove(file);
  assert.equal(res.status, 0, res.stderr);
  // the never-rule has no verify -> must be surfaced as UNVERIFIED, not counted as proven
  assert.match(res.stdout, /UNVERIFIED/);
  assert.match(res.stdout, /never .*expose payment token/);
});

test('thunder prove writes a .thunder-proof.json next to the source', () => {
  const file = write('Billing3.thunder', SRC);
  prove(file);
  assert.ok(existsSync(join(tmp, 'billing.thunder-proof.json')), 'proof artifact written');
});

test('explicit stable ids override the slug in guarantees and never-rules', () => {
  const file = write('Ids.thunder', `mission Billing
guarantee total is never negative
  id INV-G-001
  verify total test
never expose payment token in logs
  id INV-N-004
`);
  const out = JSON.parse(prove(file, ['--json']).stdout);
  assert.equal(out.guarantees[0].id, 'INV-G-001', 'guarantee keeps its explicit stable id');
  assert.equal(out.neverRules[0].id, 'INV-N-004', 'never-rule keeps its explicit stable id');
});
