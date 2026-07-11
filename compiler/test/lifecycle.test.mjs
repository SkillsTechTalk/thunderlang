import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { semanticDiagnostics } from '../src/emit.mjs';
import { buildLifecycle, analyzeLifecycle } from '../src/lifecycle.mjs';

const LC = [
  'mission M',
  'lifecycle CertificationAttempt',
  '  state NotStarted', '  state InProgress', '  state Submitted', '  state Scored', '  state Expired',
  '  transition Start', '    from NotStarted', '    to InProgress',
  '  transition Submit', '    from InProgress', '    to Submitted',
  '  transition Score', '    from Submitted', '    to Scored', '    within 30 seconds',
  '  transition Expire', '    from InProgress', '    to Expired',
  '  terminal Scored, Expired',
].join('\n');

test('lifecycle parses + builds a well-formed formal IR', () => {
  const lc = parseIntent(LC).lifecycles[0];
  const ir = buildLifecycle(lc);
  assert.equal(ir.states.length, 5);
  assert.equal(ir.initial, 'NotStarted');   // no inbound transition
  assert.deepEqual(ir.terminals, ['Scored', 'Expired']);
  assert.equal(ir.reachable.length, 5);      // all reachable
  assert.equal(lc.transitions.find((t) => t.name === 'Score').within, '30 seconds');
  assert.equal(analyzeLifecycle(lc).findings.length, 0); // well-formed
});

test('static analysis catches undefined state, unreachable, terminal-with-outgoing, dead-end', () => {
  const undef = analyzeLifecycle(parseIntent('mission M\nlifecycle L\n  state A\n  transition T\n    from A\n    to Missing\n').lifecycles[0]);
  assert.ok(undef.findings.some((f) => f.code === 'IL-LIFE-001'));

  const unreach = analyzeLifecycle(parseIntent('mission M\nlifecycle L\n  state A\n  state B\n  state Island\n  transition T\n    from A\n    to B\n  terminal B\n').lifecycles[0]);
  assert.ok(unreach.findings.some((f) => f.code === 'IL-LIFE-003' && /Island/.test(f.message)));

  const termOut = analyzeLifecycle(parseIntent('mission M\nlifecycle L\n  state A\n  state B\n  transition T\n    from A\n    to B\n  transition U\n    from B\n    to A\n  terminal B\n').lifecycles[0]);
  assert.ok(termOut.findings.some((f) => f.code === 'IL-LIFE-002'));

  const dead = analyzeLifecycle(parseIntent('mission M\nlifecycle L\n  state A\n  state B\n  transition T\n    from A\n    to B\n').lifecycles[0]);
  assert.ok(dead.findings.some((f) => f.code === 'IL-LIFE-004' && /B/.test(f.message))); // B non-terminal, no outgoing
});

test('undefined-state reference is an error; the well-formed example is clean', () => {
  const bad = semanticDiagnostics(parseIntent('mission M\nlifecycle L\n  state A\n  transition T\n    from A\n    to Missing\n'));
  assert.ok(bad.some((d) => d.code === 'IL-LIFE-001' && d.level === 'error'));
  assert.equal(semanticDiagnostics(parseIntent(LC)).filter((d) => d.level === 'error').length, 0);
});

test('temporal primitives parse; eventually without a bound warns', () => {
  const ast = parseIntent('mission M\nalways\n  x holds\neventually\n  A becomes B\nuntil\n  Paid\n  restrict X from Y\n');
  assert.deepEqual(ast.always, ['x holds']);
  assert.equal(ast.eventually[0].within, null);
  assert.equal(ast.until[0].restrict, 'X from Y');
  assert.ok(semanticDiagnostics(ast).some((d) => d.code === 'IL-TEMP-001')); // no "within"
  // with a bound -> no warning
  assert.ok(!semanticDiagnostics(parseIntent('mission M\neventually\n  A becomes B\n  within 2 minutes\n')).some((d) => d.code === 'IL-TEMP-001'));
});
