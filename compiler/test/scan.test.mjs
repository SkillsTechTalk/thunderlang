import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanIntent, scanProject, SCAN_SCHEMA } from '../src/scan.mjs';
import { fableRuleFor, universalPack, RISK_CATEGORIES, FABLE_SCHEMA, toFinding } from '../src/fable.mjs';
import { validateIR } from '../src/intent-ir.mjs';
import * as barrel from '../src/index.mjs';

const LEAKY = `mission CreateInvoice
use product
event UserRegistered
  payload
    userId: UserId
    password: Password
never expose the payment token in logs
input
  age: yaers
`;

test('scanIntent produces IR + explainable Fable findings + risk themes', () => {
  const r = scanIntent(LEAKY, { file: 'demo.intent' });
  assert.equal(r.schema, SCAN_SCHEMA);
  // valid Intent IR
  assert.equal(validateIR(r.ir).valid, true);
  // the secret-on-bus finding, fully explained
  const sec = r.findings.find((f) => f.ruleId === 'IL-SEC-001');
  assert.ok(sec);
  assert.equal(sec.category, 'Security risk');
  assert.equal(sec.severity, 'blocker');
  assert.equal(sec.detectionType, 'deterministic');
  assert.equal(sec.confidence, 'Observed');
  assert.ok(sec.remediation && sec.detected && sec.why, 'a finding is never unexplained');
  assert.equal(sec.humanReviewRequired, false, 'deterministic finding needs no human review to trust the detection');
  // risks group by the canonical taxonomy
  assert.ok(r.risks.some((x) => x.category === 'Security risk' && x.blocker === 1));
});

test('every risk theme is a canonical risk category', () => {
  const r = scanIntent(LEAKY, { file: 'demo.intent' });
  for (const risk of r.risks) assert.ok(RISK_CATEGORIES.includes(risk.category), `unknown risk category ${risk.category}`);
});

test('scanProject aggregates IR + findings + a remediation sequence (blockers first)', () => {
  const clean = 'mission Clean\nuse product\ngoal\n  do it\nguarantee x holds\n  verify a test\n';
  const r = scanProject([{ file: 'a.intent', source: LEAKY }, { file: 'b.intent', source: clean }]);
  assert.equal(r.totals.files, 2);
  assert.equal(r.totals.missions, 2);
  assert.ok(r.ir.nodes.length > 0);
  // remediation sequence is severity-ordered: a blocker leads
  assert.equal(r.remediationSequence[0].severity, 'blocker');
  assert.equal(r.remediationSequence[0].ruleId, 'IL-SEC-001');
  // not ok because there is a blocker
  assert.equal(r.ok, false);
});

test('Fable rule for a code carries category, detection, remediation, suppression policy', () => {
  const rule = fableRuleFor('IL-SEC-001');
  assert.equal(rule.ruleId, 'IL-SEC-001');
  assert.equal(rule.category, 'Security risk');
  assert.equal(rule.detection, 'deterministic');
  assert.equal(rule.severity, 'blocker');
  assert.ok(rule.remediation && rule.requiredEvidence);
  assert.equal(rule.suppressible, false, 'a blocker is not casually suppressible');
});

test('the universal pack covers every catalog rule and is well-formed', () => {
  const pack = universalPack();
  assert.equal(pack.schema, FABLE_SCHEMA);
  assert.ok(pack.rules.length >= 60);
  for (const r of pack.rules) {
    assert.ok(RISK_CATEGORIES.includes(r.category), `${r.ruleId} -> unknown category ${r.category}`);
    assert.ok(r.detection === 'deterministic' || r.detection === 'inferred');
    assert.ok(r.remediation);
  }
});

test('toFinding never produces an unexplained finding, even for an unknown code', () => {
  const f = toFinding({ code: 'IL-NOPE-999', level: 'warning', message: 'x', line: 3 }, { file: 'y.intent', index: 0 });
  assert.ok(f.findingId && f.ruleId && f.category && f.remediation && f.detected);
});

test('scan is exported from the public barrel', () => {
  assert.equal(typeof barrel.scanProject, 'function');
  assert.equal(typeof barrel.universalPack, 'function');
});
