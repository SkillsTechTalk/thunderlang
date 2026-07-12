import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseIntent } from '../src/parse.mjs';
import { buildProof, sha256, semanticDiagnostics } from '../src/emit.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'il-verify-'));
const SRC = 'mission Pay\nguarantees\n  amount is never negative\nnever\n  double charge\n';
const srcPath = join(tmp, 'pay.intent');
const proofPath = join(tmp, 'pay.proof.json');
writeFileSync(srcPath, SRC);
const ast = parseIntent(SRC);
writeFileSync(proofPath, JSON.stringify(buildProof(ast, { sourceFile: srcPath, sourceHash: sha256(SRC), targetsRequested: [], targetsGenerated: [], diagnostics: semanticDiagnostics(ast), generatedAt: '1970-01-01T00:00:00.000Z' })));
const verify = (...a) => spawnSync(process.execPath, [CLI, 'verify', ...a], { encoding: 'utf8' });

test('intent verify: a proof matching its source is VALID (exit 0)', () => {
  const res = verify(proofPath, srcPath);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /VALID/);
  const j = JSON.parse(verify(proofPath, srcPath, '--json').stdout);
  assert.equal(j.valid, true);
  assert.equal(j.checks.hashMatch, true);
});

test('intent verify: source drift fails the check (exit 1)', () => {
  const drifted = join(tmp, 'drifted.intent');
  writeFileSync(drifted, 'mission Pay\nguarantees\n  amount is never negative\n'); // removed a guarantee + never
  const res = verify(proofPath, drifted);
  assert.equal(res.status, 1);
  const j = JSON.parse(verify(proofPath, drifted, '--json').stdout);
  assert.equal(j.valid, false);
  assert.equal(j.checks.hashMatch, false);
});

test('intent verify: falls back to the proof sourceFile when no source arg', () => {
  const res = verify(proofPath); // sourceFile in the proof points at srcPath
  assert.equal(res.status, 0, res.stderr);
});

test.after(() => rmSync(tmp, { recursive: true, force: true }));
