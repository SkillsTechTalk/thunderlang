import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'tl-scen-'));
const write = (name, src) => { const p = join(tmp, name); writeFileSync(p, src); return p; };
const scen = (file, extra = []) => spawnSync(process.execPath, [CLI, 'test', file, '--scenarios', ...extra], { encoding: 'utf8' });

const SRC = `mission Checkout
scenario CustomerCompletesPurchase
  given
    customer is authenticated
  when
    customer submits order
  then
    order status is Confirmed
  never
    charge customer twice
scenario BrokenSpec
  then
    charge customer twice
  never
    charge customer twice
`;

test('a consistent scenario is DECLARED, a self-contradictory one FAILS', () => {
  const out = JSON.parse(scen(write('a.thunder', SRC), ['--json']).stdout);
  assert.equal(out.total, 2);
  assert.equal(out.failed, 1);
  const ok = out.results.find((r) => r.scenario === 'CustomerCompletesPurchase');
  const bad = out.results.find((r) => r.scenario === 'BrokenSpec');
  assert.equal(ok.status, 'declared');
  assert.equal(bad.status, 'failed');
  assert.deepEqual(bad.contradictions, ['charge customer twice']);
});

test('--scenarios exits non-zero when a scenario contradicts itself', () => {
  const res = scen(write('b.thunder', SRC));
  assert.equal(res.status, 1, res.stdout);
  assert.match(res.stdout, /FAIL.*BrokenSpec/);
  assert.match(res.stdout, /both expected and prohibited/);
});
