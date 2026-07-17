// Guard: every diagnostic code the `thunder check` pass (emit.mjs + parse.mjs) can emit must
// be in the canonical DIAGNOSTIC_RULES catalog, so `thunder explain`/`thunder rules`/the docs
// reference cover everything a user can actually hit. Prevents undocumented codes creeping in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_DIAGNOSTICS } from '../src/intent-schema.mjs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

// Codes emitted by these files but owned by other documented subsystems (the intent-ai-v1
// AI-implementation marker diagnostics, documented in docs/ai-implementations.md), not the
// deterministic check catalog. Explicit + narrow so nothing hides here by accident.
const ALLOWLIST = new Set(['INTENT-AI-001', 'INTENT-AI-011', 'INTENT-AI-012', 'INTENT-AI-013']);

function emittedCodes(file) {
  const txt = readFileSync(join(SRC, file), 'utf8');
  const codes = new Set();
  for (const m of txt.matchAll(/(?:warn\(|code:\s*|ruleId:\s*)['"]([A-Za-z][A-Za-z0-9_-]+)['"]/g)) {
    codes.add(m[1]);
  }
  return codes;
}

test('every code the check pass emits is in the canonical catalog', () => {
  const catalog = new Set(ALL_DIAGNOSTICS.map((r) => r.ruleId));
  const emitted = new Set([...emittedCodes('emit.mjs'), ...emittedCodes('parse.mjs')]);
  const undocumented = [...emitted].filter((c) => !catalog.has(c) && !ALLOWLIST.has(c));
  assert.deepEqual(undocumented, [], `undocumented check-surface codes: ${undocumented.join(', ')}`);
});

test('catalog rule ids are unique and well-formed', () => {
  const ids = ALL_DIAGNOSTICS.map((r) => r.ruleId);
  assert.equal(ids.length, new Set(ids).size, 'duplicate ruleId in DIAGNOSTIC_RULES');
  for (const r of ALL_DIAGNOSTICS) {
    assert.ok(r.area, `${r.ruleId} has no area`);
    assert.ok(['blocker', 'error', 'warning', 'info'].includes(r.severity), `${r.ruleId} bad severity`);
    assert.ok(Array.isArray(r.blocks), `${r.ruleId} blocks must be an array`);
    assert.ok(r.summary && r.summary.length, `${r.ruleId} has no summary`);
  }
});
