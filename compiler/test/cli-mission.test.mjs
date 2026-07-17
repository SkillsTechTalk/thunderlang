import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const proj = mkdtempSync(join(tmpdir(), 'tl-mission-'));
mkdirSync(join(proj, 'sub'), { recursive: true });
writeFileSync(join(proj, 'CreateInvoice.thunder'), 'mission CreateInvoice\ngoal\n  Generate an invoice\nguarantees\n  invoice total is never negative\n');
writeFileSync(join(proj, 'sub', 'Eligibility.thunder'), 'mission CanEnroll\ndecision CanEnroll\n  inputs\n    age\n  rule adult\n    when age >= 18\n    return Eligible\n  default\n    return NotEligible\ntest CanEnroll\n  case adult\n    given age 20\n    expect Eligible\n');
const run = (...a) => spawnSync(process.execPath, [CLI, 'mission', ...a], { cwd: proj, encoding: 'utf8' });

test('thunder mission list finds missions across the project, including subdirs', () => {
  const res = run('list');
  assert.match(res.stdout, /CreateInvoice/);
  assert.match(res.stdout, /CanEnroll/);
  assert.match(res.stdout, /sub\/Eligibility\.thunder/);
});

test('thunder mission <Name> resolves by name and delegates the verb (no path needed)', () => {
  const res = run('CanEnroll', 'test');
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /1\/1 passed/);
});

test('flags pass through to the delegated verb', () => {
  const res = run('CanEnroll', 'run', '--inputs', '{"age":20}');
  assert.match(res.stdout, /CanEnroll: Eligible/);
});

test('an unknown mission errors with a hint', () => {
  const res = run('Nope');
  assert.equal(res.status, 2);
  assert.match(res.stderr, /no mission named "Nope"/);
});
