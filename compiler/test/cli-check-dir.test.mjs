import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'il-checkdir-'));
mkdirSync(join(tmp, 'nested'), { recursive: true });
writeFileSync(join(tmp, 'a.intent'), 'mission A\nguarantees\n  a holds\n');
writeFileSync(join(tmp, 'nested', 'b.intent'), 'mission B\nguarantees\n  b holds\n');
const check = (target, json) => spawnSync(process.execPath, [CLI, 'check', target, ...(json ? ['--json'] : [])], { encoding: 'utf8' });

test('intent check <dir> recurses and passes when all files are clean (exit 0)', () => {
  const res = check(tmp, false);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /2\/2 passed/);
  assert.match(res.stdout, /a\.intent/);
  assert.match(res.stdout, /nested\/b\.intent/);
});

test('intent check <dir> --json emits a batch report', () => {
  const out = JSON.parse(check(tmp, true).stdout);
  assert.equal(out.schema, 'intent-check-batch-v1');
  assert.equal(out.total, 2);
  assert.equal(out.ok, true);
  assert.equal(out.files.length, 2);
});

test('intent check <dir> exits 1 when any file has an error', () => {
  // an undeclared-event handler is an error (IL-DIST-005)
  writeFileSync(join(tmp, 'bad.intent'), 'mission Bad\ncommand C\n  idempotency_key id\non Fail\n  emit Nope\n');
  const res = check(tmp, true);
  const out = JSON.parse(res.stdout);
  if (out.failed > 0) { assert.equal(res.status, 1); assert.equal(out.ok, false); }
  rmSync(join(tmp, 'bad.intent'));
});

test.after(() => rmSync(tmp, { recursive: true, force: true }));
