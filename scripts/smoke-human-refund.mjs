// Exercise compact authoring -> canonical ThunderLang -> real OpenThunder app tests.
// Usage: node scripts/smoke-human-refund.mjs /path/to/built/OpenThunder/checkout
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { compileHumanContract } from '../compiler/src/human-contract.mjs';

if (!process.argv[2]) throw new Error('Pass the OpenThunder checkout containing the built intent test-app command.');
const ot = resolve(process.argv[2]);
const dir = mkdtempSync(join(tmpdir(), 'thunder-human-refund-'));
try {
  cpSync(join(ot, 'examples/refund-contract'), dir, { recursive: true });
  const human = readFileSync(new URL('../examples/human/RefundReview.thunder-human', import.meta.url), 'utf8');
  writeFileSync(join(dir, 'contracts/RefundReview.thunder-human'), human);
  const run = () => spawnSync(process.execPath, [join(ot, 'apps/cli/dist/index.js'), 'intent', 'test-app', '--repo', dir, '--trust-application', '--json'], { encoding: 'utf8', timeout: 30000 });
  const good = run(); assert.equal(good.status, 0, good.stderr + good.stdout); assert.equal(JSON.parse(good.stdout).summary.passed, 5);
  const app = join(dir, 'src/refunds.cjs'); const original = readFileSync(app, 'utf8');
  writeFileSync(app, original.replace('amount <= 100', 'amount < 100'));
  const bad = run(); assert.equal(bad.status, 1, bad.stderr + bad.stdout);
  const result = JSON.parse(bad.stdout);
  assert.equal(result.contract.passed, 5); assert.equal(result.application.failed, 1);
  assert.equal(result.summary.failed, 1); assert.equal(result.bindings[0].cases[1].actual, 'Review');
  writeFileSync(app, original); assert.equal(run().status, 0);
  const canonical = compileHumanContract(human);
  writeFileSync(join(dir, 'contracts/RefundReview.thunder'), canonical);
  rmSync(join(dir, 'contracts/RefundReview.thunder-human'));
  const binding = join(dir, '.openthunder/application-tests.json');
  writeFileSync(binding, readFileSync(binding, 'utf8').replace('RefundReview.thunder-human', 'RefundReview.thunder'));
  assert.equal(run().status, 0);
  console.log('PASS: compact authoring -> existing ThunderLang -> real application; five pass, boundary regression fails, restored implementation passes.');
} finally { rmSync(dir, { recursive: true, force: true }); }
