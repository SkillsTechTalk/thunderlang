// Cross-repository compatibility check. No dependency manifest or installed package
// is rewritten. Run after building compiler CJS and OpenThunder's intent package.
import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildReviewAtlas, reviewAtlasExitCode } from '../compiler/src/review-atlas.mjs';
import { COMPILER_VERSION } from '../compiler/src/emit.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ot = resolve(process.argv[2] || join(root, '../OpenThunder'));
const require = createRequire(import.meta.url);
const { proveIntent } = require(join(ot, 'packages/intent/dist/prove-intent.js'));
const core = require(join(root, 'compiler/dist/core.cjs'));
const main = require(join(root, 'compiler/dist/index.cjs'));
const source = readFileSync(join(root, 'examples/AgentSpendBudget.thunder'), 'utf8');
const repo = mkdtempSync(join(tmpdir(), 'thunder-ot-atlas-'));
const file = { path: 'Budget.thunder', source };
const proveLocal = () => {
  const original = Module._load;
  Module._load = function (request, ...rest) {
    if (request === '@skillstech/thunderlang/core') return core;
    if (request === '@skillstech/thunderlang') return main;
    return original.call(this, request, ...rest);
  };
  try { return proveIntent(repo); } finally { Module._load = original; }
};
try {
  writeFileSync(join(repo, file.path), source);
  const installed = proveIntent(repo);
  assert.equal(installed.schema, 'openthunder-intent-evidence-v1');
  assert.equal(installed.scope, 'declared-intent');
  assert.equal(installed.summary.testsPassed, 6);
  const imported = buildReviewAtlas([file], { evidence: installed });
  assert.equal(imported.files[0].snapshot.status, installed.compilerVersion === COMPILER_VERSION ? 'matched' : 'stale');
  const local = proveLocal();
  assert.equal(local.summary.verified, 2);
  assert.equal(buildReviewAtlas([file], { evidence: local }).files[0].snapshot.status, 'matched');
  const changed = { ...file, source: source.replace('reservedCents <= remainingCents', 'reservedCents < remainingCents') };
  writeFileSync(join(repo, file.path), changed.source);
  const stale = buildReviewAtlas([changed], { evidence: local });
  assert.equal(stale.files[0].snapshot.status, 'stale');
  assert.equal(stale.summary.testsFailed, 1);
  const failed = proveLocal();
  assert.equal(failed.summary.testsFailed, 1);
  assert.equal(buildReviewAtlas([changed], { evidence: failed }).files[0].snapshot.status, 'reported-failure');
  assert.equal(reviewAtlasExitCode(buildReviewAtlas([changed], { evidence: failed })), 1);
  console.log(`OpenThunder → Atlas OK: installed compiler ${installed.compilerVersion}, local compiler ${local.compilerVersion}; passing, stale, and failing snapshots checked.`);
} finally { rmSync(repo, { recursive: true, force: true }); }
