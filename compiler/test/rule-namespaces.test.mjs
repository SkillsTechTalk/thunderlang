// Rule namespaces: the canonical catalog is ONE id space across author-time (IL) and verify-time
// (OpenThunder). Every row self-describes owner+phase; OT's verify namespace is reserved here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAGNOSTIC_RULES, CORE_DIAGNOSTICS, VERIFICATION_RULES, ALL_DIAGNOSTICS,
  RULE_NAMESPACES, RULE_PHASES, RULE_OWNERS, ruleNamespace,
} from '../src/intent-schema.mjs';

test('IL rows are stamped IL/author', () => {
  for (const r of DIAGNOSTIC_RULES) { assert.equal(r.owner, 'IL'); assert.equal(r.phase, 'author'); }
  for (const r of CORE_DIAGNOSTICS) { assert.equal(r.owner, 'IL'); assert.equal(r.phase, 'author'); }
});

test('verification namespace is OT-owned, verify-phase, reserved', () => {
  assert.ok(VERIFICATION_RULES.length >= 6);
  for (const r of VERIFICATION_RULES) {
    assert.equal(r.owner, 'OT');
    assert.equal(r.phase, 'verify');
    assert.equal(r.reserved, true);
    assert.match(r.ruleId, /^OT-/);
  }
});

test('ALL_DIAGNOSTICS is the union across both phases, still unique ids', () => {
  const ids = ALL_DIAGNOSTICS.map((r) => r.ruleId);
  assert.equal(ids.length, new Set(ids).size);
  assert.equal(ALL_DIAGNOSTICS.length, DIAGNOSTIC_RULES.length + CORE_DIAGNOSTICS.length + VERIFICATION_RULES.length);
});

test('ruleNamespace resolves owner+phase by prefix and for legacy core ids', () => {
  assert.deepEqual(ruleNamespace('IL-SEC-001'), { owner: 'IL', phase: 'author' });
  assert.deepEqual(ruleNamespace('OT-REQ-003'), { owner: 'OT', phase: 'verify' });
  assert.deepEqual(ruleNamespace('OT-REQ-999'), { owner: 'OT', phase: 'verify' }); // reserved prefix, future OT id
  assert.deepEqual(ruleNamespace('missing-goal'), { owner: 'IL', phase: 'author' }); // legacy core id
  assert.equal(ruleNamespace('WAT-000'), null);
  assert.equal(ruleNamespace(null), null);
});

test('namespace registry declares both phases and owners', () => {
  assert.deepEqual(RULE_PHASES, ['author', 'verify']);
  assert.deepEqual(RULE_OWNERS, ['IL', 'OT']);
  const owners = RULE_NAMESPACES.map((n) => n.owner);
  assert.ok(owners.includes('IL') && owners.includes('OT'));
});
