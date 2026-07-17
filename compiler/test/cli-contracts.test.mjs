import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'tl-contracts-'));
const write = (name, src) => { const p = join(tmp, name); writeFileSync(p, src); return p; };
const run = (file, extra = []) => spawnSync(process.execPath, [CLI, 'test', file, '--contracts', ...extra], { encoding: 'utf8' });

// One guarantee carries a verification; one prohibition has none (UNVERIFIED).
const SRC = `mission Billing
guarantees
  total is never negative
never
  expose payment token in logs
guarantee total is never negative
  verify total test
`;

test('thunder test --contracts derives one obligation per guarantee and never', () => {
  const out = JSON.parse(run(write('a.thunder', SRC), ['--json']).stdout);
  assert.equal(out.schema, 'thunder-contracts-v1');
  assert.equal(out.total, 2);
  assert.equal(out.verified, 1);   // the guarantee with a verify
  assert.equal(out.unverified, 1); // the never-rule with nothing verifying it
});

test('an unverified claim is UNVERIFIED, never silently PASS', () => {
  const res = run(write('b.thunder', SRC));
  assert.equal(res.status, 0, 'non-strict passes even with unverified');
  assert.match(res.stdout, /UNVERIFIED prohibition .*expose payment token/);
});

test('--strict fails the run when any obligation is unverified', () => {
  const res = run(write('c.thunder', SRC), ['--strict']);
  assert.equal(res.status, 1, 'strict mode fails on unverified obligations');
});
