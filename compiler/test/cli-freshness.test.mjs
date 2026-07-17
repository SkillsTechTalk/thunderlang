import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'tl-fresh-'));
const write = (name, src) => { const p = join(tmp, name); writeFileSync(p, src); return p; };
const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' });

const SRC = `mission Billing
guarantee total is never negative
  verify total test
`;

test('thunder prove records a freshness tuple in the proof', () => {
  const file = write('Billing.thunder', SRC);
  const out = JSON.parse(run('prove', file, '--json').stdout);
  assert.ok(out.freshness, 'proof carries a freshness tuple');
  assert.equal(out.freshness.intentHash, out.sourceHash);
  assert.equal(out.freshness.compilerVersion, out.compilerVersion);
});

test('thunder verify marks a proof STALE when the compiler moved', () => {
  const file = write('Billing2.thunder', SRC);
  run('prove', file); // writes billing2? name is slug(mission) => billing.thunder-proof.json
  const proofPath = join(tmp, 'billing.thunder-proof.json');
  const proof = JSON.parse(readFileSync(proofPath, 'utf8'));
  // fresh proof verifies clean
  const fresh = run('verify', proofPath, file);
  assert.equal(fresh.status, 0, fresh.stdout + fresh.stderr);
  assert.match(fresh.stdout, /VALID/);
  // simulate a compiler upgrade after the proof was generated
  proof.freshness.compilerVersion = '0.0.1-old';
  writeFileSync(proofPath, JSON.stringify(proof, null, 2));
  const stale = run('verify', proofPath, file);
  assert.equal(stale.status, 1, 'a stale proof does not read green');
  assert.match(stale.stdout, /STALE/);
  assert.match(stale.stdout, /compiler upgraded/);
});
