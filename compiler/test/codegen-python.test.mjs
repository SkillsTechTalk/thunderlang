// Python codegen target , same adapter shape as TypeScript / C# / Java, snake_case functions,
// dataclass contract, and honest TODO markers. Behavioral parity with the runtime evaluator is
// checked through a real python3 when one is available (skipped otherwise, like target-py).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIntent } from '../src/parse.mjs';
import { toPython, GENERATORS } from '../src/codegen.mjs';
import { exprToPython } from '../src/expr.mjs';
import { evaluateDecision } from '../src/runtime.mjs';
import { pythonAvailable } from '../src/target-py.mjs';
import * as barrel from '../src/index.mjs';

const CLIBIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const HAVE_PY = pythonAvailable();

const DECISION = `mission CanReset
decision CanReset
  inputs
    tokenAgeMinutes
    attempts
  rule expired
    when tokenAgeMinutes > 15
    return Denied
  rule tooMany
    when attempts >= 5
    return Denied
  rule allowed
    when attempts < 5
    return Allowed
  default
    return Denied
`;

test('exprToPython renders Python operators (and/or/not/in), never C-family', () => {
  assert.equal(exprToPython('x > 5', { inputs: ['x'] }), '(x > 5)');
  assert.equal(exprToPython('status == active', { inputs: ['status'] }), '(status == "active")'); // bare token -> string literal
  assert.equal(exprToPython('a and b or c', { inputs: ['a', 'b', 'c'] }), '((a and b) or c)');
  assert.equal(exprToPython('tier in [1,2,3]', { inputs: ['tier'] }), 'tier in [1, 2, 3]');
  assert.equal(exprToPython('not done', { inputs: ['done'] }), '(not done)');
  assert.doesNotMatch(exprToPython('a and b', { inputs: ['a', 'b'] }), /&&|\|\||!/);
});

test('generated Python has the provenance header, dataclasses, decision logic, and honest TODOs', () => {
  const py = toPython(parseIntent('mission CreateInvoice\ninput\n  email: Email\n  amount: Money\noutput\n  invoice: Invoice\nguarantee it holds\n  verify t\nnever leak a secret\n' + DECISION.split('\n').slice(1).join('\n')));
  assert.match(py, /generated from ThunderLang/);
  assert.match(py, /Deterministic, no AI/);
  assert.match(py, /@dataclass\nclass CreateInvoiceInput:\n    email: str\n    amount: float/);
  assert.match(py, /def can_reset\(tokenAgeMinutes, attempts\) -> str:/); // snake_case fn, verbatim inputs
  assert.match(py, /if \(tokenAgeMinutes > 15\):\n        return "Denied"  # rule expired/);
  assert.match(py, /return "Denied"  # default/);
  assert.match(py, /# GUARANTEE: it holds/);
  assert.match(py, /# NEVER: leak a secret/);
  assert.match(py, /raise NotImplementedError\("TODO: implement/);
  assert.match(py, /class Invoice: pass  # TODO: fields/);
});

test('a rule with an untranslatable condition degrades to a marked TODO, never a crash', () => {
  const ast = parseIntent('mission M\ndecision D\n  inputs\n    x\n  rule bad\n    when x +\n    return A\n  default\n    return B\n');
  const py = toPython(ast);
  assert.match(py, /if False:  # TODO: could not translate/);
  assert.doesNotThrow(() => toPython(ast));
});

test('the generated Python decision is behaviorally identical to the runtime evaluator', { skip: !HAVE_PY && 'python3 not available' }, () => {
  const ast = parseIntent(DECISION);
  const program = [
    toPython(ast),
    'import json',
    'out = []',
    'for t in range(0, 31, 3):',
    '    for a in range(0, 9):',
    '        out.append([t, a, can_reset(t, a)])',
    'print(json.dumps(out))',
  ].join('\n');
  const res = spawnSync('python3', ['-'], { input: program, encoding: 'utf8', timeout: 30000 });
  assert.equal(res.status, 0, res.stderr);
  for (const [t, a, gen] of JSON.parse(res.stdout.trim())) {
    const rt = evaluateDecision(ast.decisions[0], { tokenAgeMinutes: t, attempts: a }).result;
    assert.equal(gen, rt, `t=${t} a=${a}: generated ${gen} != runtime ${rt}`);
  }
});

test('GENERATORS + barrel + CLI expose the python target', () => {
  assert.equal(typeof GENERATORS.python, 'function');
  assert.equal(typeof GENERATORS.py, 'function');
  assert.equal(typeof barrel.toPython, 'function');
  const dir = mkdtempSync(join(tmpdir(), 'intent-gen-py-'));
  writeFileSync(join(dir, 'M.intent'), DECISION);
  const res = spawnSync(process.execPath, [CLIBIN, 'gen', join(dir, 'M.intent'), '--target', 'python'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /def can_reset/);
  assert.match(res.stdout, /\(tokenAgeMinutes > 15\)/);
});
