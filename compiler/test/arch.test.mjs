import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArchitectureRules, violatesArchitecture } from '../src/arch.mjs';
import { parseIntent } from '../src/parse.mjs';
import { semanticDiagnostics, buildContractGraph } from '../src/emit.mjs';

test('parseArchitectureRules structures dependency constraints', () => {
  const { rules, unparsed } = parseArchitectureRules([
    'domain must not depend on infrastructure',
    'application may depend on domain',
    'infrastructure may implement application ports',
  ]);
  assert.equal(rules.length, 3);
  assert.equal(unparsed.length, 0);
  assert.deepEqual(rules[0], { from: 'domain', relation: 'must-not-depend-on', to: 'infrastructure', raw: 'domain must not depend on infrastructure' });
  assert.equal(rules[1].relation, 'may-depend-on');
  assert.equal(rules[2].relation, 'may-implement');
  assert.equal(rules[2].to, 'application'); // "ports" stripped
});

test('violatesArchitecture catches forbidden dependencies (substring layers)', () => {
  const { rules } = parseArchitectureRules(['domain must not depend on infrastructure']);
  const v = violatesArchitecture(rules, 'domain.billing', 'infrastructure.postgres');
  assert.ok(v);
  assert.equal(v.relation, 'must-not-depend-on');
  assert.equal(violatesArchitecture(rules, 'application', 'domain'), null); // allowed
});

test('unparseable architecture line warns (INTENT-ARCH-001), not an error', () => {
  const ast = parseIntent('mission M\ngoal\n  g\narchitecture\n  everything is fine somehow\n');
  const diags = semanticDiagnostics(ast);
  const d = diags.find((x) => x.code === 'INTENT-ARCH-001');
  assert.ok(d);
  assert.equal(d.level, 'warning');
  assert.equal(diags.filter((x) => x.level === 'error').length, 0);
});

test('contract graph carries structured architecture rules', () => {
  const ast = parseIntent('mission M\ngoal\n  g\narchitecture\n  domain must not depend on infrastructure\n');
  const graph = buildContractGraph(ast, '2026-01-01T00:00:00Z');
  assert.equal(graph.missions[0].architecture.length, 1);
  assert.equal(graph.missions[0].architecture[0].relation, 'must-not-depend-on');
});
