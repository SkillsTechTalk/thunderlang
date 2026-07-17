// 12-Factor Agents conformance lens (twelve-factor-v1). Deterministic scoring of an intent
// against the 13 humanlayer/12-factor-agents principles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIntent } from '../src/parse.mjs';
import { compileSource } from '../src/compile.mjs';
import { twelveFactorReport, twelveFactorSummary, TWELVE_FACTOR_SCHEMA } from '../src/twelve-factor.mjs';
import { ALL_DIAGNOSTICS } from '../src/intent-schema.mjs';

const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'examples');
const strongSrc = readFileSync(join(EXAMPLES, 'TwelveFactorAgent.thunder'), 'utf8');

test('report shape: 13 factors, score 0..100, grade, counts, diagnostics', () => {
  const r = twelveFactorReport(parseIntent('mission M\ngoal "x"\n'));
  assert.equal(r.schemaVersion, TWELVE_FACTOR_SCHEMA);
  assert.equal(r.factors.length, 13);
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.ok(['strong', 'partial', 'weak'].includes(r.grade));
  const total = r.counts.satisfied + r.counts.partial + r.counts.absent;
  assert.equal(total, 13);
  assert.equal(r.factors[0].id, 'IL-12F-01');
});

test('the exemplar scores 100/100 (all 13 satisfied)', () => {
  const r = twelveFactorReport(parseIntent(strongSrc));
  assert.equal(r.score, 100);
  assert.equal(r.grade, 'strong');
  assert.equal(r.counts.satisfied, 13);
  assert.deepEqual(r.diagnostics, []); // nothing unsatisfied -> no advisory findings
});

test('a bare mission scores weak with mostly-absent factors', () => {
  const r = twelveFactorReport(parseIntent('mission Tiny\ngoal\n  do a thing\n'));
  assert.ok(r.score < 20);
  assert.equal(r.grade, 'weak');
  assert.equal(r.factors.find((f) => f.factor === 2).verdict, 'partial'); // goal, no guarantees
  assert.equal(r.factors.find((f) => f.factor === 8).verdict, 'absent');  // no control flow
});

test('F8 partial when a decision has no default; satisfied with default', () => {
  const noDefault = 'mission M\ndecision D\n  inputs\n    a\n  rule r\n    when a == 1\n    return X\n';
  assert.equal(twelveFactorReport(parseIntent(noDefault)).factors.find((f) => f.factor === 8).verdict, 'partial');
  const withDefault = noDefault + '  default\n    return Y\n';
  assert.equal(twelveFactorReport(parseIntent(withDefault)).factors.find((f) => f.factor === 8).verdict, 'satisfied');
});

test('F10 grades by step count: satisfied <=10, partial 11-20', () => {
  // 11 single-state lifecycles => 11 steps => partial
  let src = 'mission Big\n';
  for (let i = 0; i < 11; i++) src += `lifecycle L${i}\n  state S${i}\n`;
  assert.equal(twelveFactorReport(parseIntent(src)).factors.find((f) => f.factor === 10).verdict, 'partial');
});

test('unsatisfied factors emit advisory diagnostics keyed to IL-12F ids in the catalog', () => {
  const r = twelveFactorReport(parseIntent('mission M\ngoal "x"\n'));
  assert.ok(r.diagnostics.length > 0);
  const catalogIds = new Set(ALL_DIAGNOSTICS.map((x) => x.ruleId));
  for (const d of r.diagnostics) assert.ok(catalogIds.has(d.code), `${d.code} not in catalog`);
});

test('summary is the compact form and matches the report', () => {
  const ast = parseIntent(strongSrc);
  const s = twelveFactorSummary(ast);
  const r = twelveFactorReport(ast);
  assert.deepEqual(s, { schemaVersion: r.schemaVersion, score: r.score, grade: r.grade, counts: r.counts });
});

test('compileSource + proof carry the twelveFactor summary', () => {
  const c = compileSource(strongSrc, { generatedAt: '2026-07-15T00:00:00Z' });
  assert.equal(c.twelveFactor.score, 100);
  assert.equal(c.artifacts.proof.twelveFactor.score, 100);
  assert.equal(c.artifacts.proof.twelveFactor.schemaVersion, TWELVE_FACTOR_SCHEMA);
});

test('deterministic: same source => identical report', () => {
  const a = JSON.stringify(twelveFactorReport(parseIntent(strongSrc)));
  const b = JSON.stringify(twelveFactorReport(parseIntent(strongSrc)));
  assert.equal(a, b);
});
