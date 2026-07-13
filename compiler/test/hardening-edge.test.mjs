// Adversarial hardening: edge cases, malformed input, and performance guards. A compiler must
// never crash on bad input (it produces diagnostics), must round-trip faithfully, and must not
// silently mis-evaluate. Each test here pins a behavior that was probed by hand and, in several
// cases, a real bug that was found and fixed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalExpr } from '../src/expr.mjs';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { graphToSource } from '../src/graph-source.mjs';
import { buildAtlas } from '../src/intent-atlas.mjs';
import { buildFocusGraph } from '../src/focus.mjs';
import { evaluateDecision } from '../src/runtime.mjs';

// ── Expression engine , the two bugs found + fixed ───────────────────────────

test('divide/modulo by zero is neutralized to null, never Infinity/NaN (bug fix)', () => {
  assert.equal(evalExpr('a / b', { a: 10, b: 0 }), null);
  assert.equal(evalExpr('a % b', { a: 10, b: 0 }), null);
  // the dangerous case: a decision must NOT match on 10/0 > 1 (was Infinity > 1 === true)
  assert.equal(evalExpr('a / b > 1', { a: 10, b: 0 }), false);
  assert.equal(evalExpr('a / b < 1', { a: 10, b: 0 }), false);
  assert.equal(evalExpr('a % b == 0', { a: 10, b: 0 }), false);
});

test('an unknown / neutralized operand is un-orderable (every ordering comparison is false)', () => {
  for (const op of ['>', '<', '>=', '<=']) {
    assert.equal(evalExpr(`x ${op} 1`, { x: null }), false, `null ${op} 1`);
    assert.equal(evalExpr(`a / b ${op} 1`, { a: 1, b: 0 }), false, `(1/0) ${op} 1`);
  }
});

test('normal arithmetic, precedence, coercion, and enum equality are unchanged', () => {
  assert.equal(evalExpr('2 + 3 * 4'), 14);
  assert.equal(evalExpr('(2 + 3) * 4'), 20);
  assert.equal(evalExpr('10 / 2'), 5);
  assert.equal(evalExpr('7 % 3'), 1);
  assert.equal(evalExpr('age >= 18 and age < 65', { age: 20 }), true);
  assert.equal(evalExpr('x == y', { x: '5', y: 5 }), true);        // numeric coercion
  assert.equal(evalExpr('status == active', { status: 'active' }), true); // bare-token literal
  assert.equal(evalExpr('tier in [1,2,3]', { tier: 2 }), true);
  assert.equal(evalExpr('tier in [1,2,3]', { tier: 9 }), false);
});

test('chained comparison and malformed expressions throw, never mis-evaluate', () => {
  for (const bad of ['1 < 2 < 3', '1 +', '* 5', '', 'a and']) {
    assert.throws(() => evalExpr(bad, { a: true }), /Expr|expression|token|character/i, bad);
  }
});

// ── Parser , must never crash, must not corrupt values ───────────────────────

const DISRUPTIVE = {
  'empty': '',
  'only whitespace': '   \n\n \t ',
  'only comment': '# nothing here',
  'no mission keyword': 'goal\n  do x',
  'CRLF line endings': 'mission M\r\ngoal\r\n  do it\r\n',
  'tab indentation': 'mission M\ngoal\n\tdo it\ninput\n\temail: Email',
  'mixed tabs and spaces': 'mission M\ngoal\n\t  do it',
  'unicode identifiers': 'mission Café日本\ngoal\n  x',
  'deep indentation': `mission M\ngoal\n${' '.repeat(40)}do it`,
  'duplicate guarantees': 'mission M\nguarantee g\n  verify t\nguarantee g\n  verify t2',
  'empty blocks': 'mission M\ngoal\ninput\noutput\nguarantee\nnever\nverify\ntarget',
  'bare guarantee/never': 'mission M\nguarantee\nnever',
};

test('the parser never throws on disruptive input , it degrades, not crashes', () => {
  for (const [label, src] of Object.entries(DISRUPTIVE)) {
    assert.doesNotThrow(() => {
      const ast = parseIntent(src);
      const g = buildIntentGraph(ast);
      buildIntentGraph(parseIntent(graphToSource(g))); // round-trip must not throw either
    }, label);
  }
});

test('CRLF line endings do not leak a carriage return into field values', () => {
  const ast = parseIntent('mission M\r\ngoal\r\n  do the thing\r\nguarantee it holds\r\n  verify t\r\n');
  assert.equal(ast.goal, 'do the thing');
  assert.equal(ast.guarantees[0].statement, 'it holds');
  assert.doesNotMatch(ast.goal, /\r/);
  assert.doesNotMatch(ast.guarantees[0].statement, /\r/);
});

test('tab indentation nests children (goal, inputs, decision rules)', () => {
  const ast = parseIntent('mission M\ngoal\n\tdo it with tabs\ninput\n\temail: Email');
  assert.equal(ast.goal, 'do it with tabs');
  assert.equal(ast.inputs.length, 1);
  const td = parseIntent('mission M\ndecision D\n\tinputs\n\t\tx\n\trule r\n\t\twhen x > 5\n\t\treturn A\n\tdefault\n\t\treturn B');
  assert.equal(td.decisions[0].rules.length, 1);
  assert.equal(td.decisions[0].default, 'B');
});

// ── Runtime , malformed and degenerate decisions must not crash ──────────────

test('a rule with a malformed `when` is skipped, not fatal; evaluation continues', () => {
  const ast = parseIntent('mission M\ndecision D\n  inputs\n    x\n  rule bad\n    when x +\n    return A\n  rule good\n    when x > 5\n    return B\n  default\n    return C\n');
  let res;
  assert.doesNotThrow(() => { res = evaluateDecision(ast.decisions[0], { x: 10 }); });
  assert.equal(res.result, 'B');
  assert.equal(res.matched, 'good');
});

test('no default + no matching rule yields a null result, not a crash', () => {
  const ast = parseIntent('mission M\ndecision D\n  inputs\n    x\n  rule r\n    when x > 100\n    return A\n');
  const res = evaluateDecision(ast.decisions[0], { x: 5 });
  assert.equal(res.result, null);
});

// ── Round-trip fidelity on a realistic + adversarial mission ─────────────────

test('parse -> graph -> source -> graph loses no nodes (incl. verified never-rules)', () => {
  const src = 'mission M\ngoal\n  g\nguarantee it holds\n  verify a test\nnever leak a secret\n  verify a scan\n';
  const g1 = buildIntentGraph(parseIntent(src));
  const g2 = buildIntentGraph(parseIntent(graphToSource(g1)));
  assert.equal(g2.nodes.length, g1.nodes.length);
  const verified = (g) => g.relationships.filter((r) => r.type === 'verified_by').length;
  assert.equal(verified(g2), verified(g1));
  assert.ok(verified(g1) >= 2, 'both a guarantee and a never-rule are verified');
});

// ── Performance , guard against the O(n^2) focus regression that was fixed ────

test('buildFocusGraph is sub-quadratic (large graph completes well under a generous bound)', () => {
  let src = 'mission Big\ngoal\n  do it\n';
  for (let i = 0; i < 4000; i += 1) src += `guarantee guarantee ${i} holds\n  verify test ${i}\n`;
  const atlas = buildAtlas([buildIntentGraph(parseIntent(src))]);
  assert.ok(atlas.nodes.length > 8000, `expected a big graph, got ${atlas.nodes.length}`);
  const t0 = process.hrtime.bigint();
  const focus = buildFocusGraph(atlas, { seeds: [atlas.missions[0].id], depth: 3 });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(focus.overview.nodes, atlas.nodes.length, 'depth-3 reaches the whole star graph');
  // O(n^2) at this size was ~2s+; the indexed BFS is tens of ms. 1500ms is a wide safety margin.
  assert.ok(ms < 1500, `focus took ${ms.toFixed(0)}ms , likely an algorithmic regression`);
});
