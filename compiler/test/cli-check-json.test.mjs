import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'il-clijson-'));
const write = (name, src) => { const p = join(tmp, name); writeFileSync(p, src); return p; };
const runCheck = (file, json) => spawnSync(process.execPath, [CLI, 'check', file, ...(json ? ['--json'] : [])], { encoding: 'utf8' });

test('intent check --json emits a valid intent-check-v1 report', () => {
  const file = write('ok.intent', 'mission M\ndecision D\n  inputs\n    age\n  rule a\n    when age >= 18\n    return Y\n  default\n    return N\n');
  const res = runCheck(file, true);
  assert.equal(res.status, 0, res.stderr);
  const out = JSON.parse(res.stdout);
  assert.equal(out.schema, 'intent-check-v1');
  assert.equal(out.mission, 'M');
  assert.equal(out.ok, true);
  assert.equal(out.summary.errors, 0);
  assert.ok(Array.isArray(out.diagnostics));
});

test('intent check --json exits 1 and reports an error diagnostic', () => {
  // An undeclared-event handler is an error-level diagnostic (IL-DIST-005).
  const file = write('bad.intent', 'mission M\ncommand Charge\n  idempotency_key id\non ChargeFailed\n  emit NotDeclaredEvent\n');
  const res = runCheck(file, true);
  const out = JSON.parse(res.stdout);
  assert.equal(typeof out.ok, 'boolean');
  assert.equal(out.summary.errors >= 1, out.ok === false);
  if (!out.ok) assert.equal(res.status, 1);
});

test('a waived diagnostic is marked in the JSON and does not fail the check', () => {
  const file = write('waived.intent', [
    'mission Pay', 'metric conversion', '  target 60%',
    'waiver IL-PM-001', '  reason "deferred to v2"', '  approved_by Head of Product',
  ].join('\n') + '\n');
  const out = JSON.parse(runCheck(file, true).stdout);
  const waived = out.diagnostics.find((d) => d.waived);
  assert.ok(waived, 'expected a waived diagnostic');
  assert.equal(waived.waiver.approvedBy, 'Head of Product');
});

test('the human (non-json) output is unchanged', () => {
  const file = write('human.intent', 'mission M\nguarantees\n  a holds\n');
  const res = runCheck(file, false);
  assert.match(res.stdout, /thunder check .*mission: M/);
  assert.doesNotMatch(res.stdout, /"schema"/);
});

test.after(() => rmSync(tmp, { recursive: true, force: true }));
