// Python target adapter. Compiles each decision into an executable Python function using the
// SAME expression translator the codegen uses (exprToPython), then runs the test cases through a
// real `python3` child process and returns actual outputs. Like the TypeScript adapter, this makes
// conformance "grade a live target" rather than "grade fed results" , the generated Python is
// executed for real.
//
// Results are honest: the run is { status: 'ok', results } with one { status: 'ok', value } or
// { status: 'error', kind, message } per case, or { status: 'error', kind, message } for the whole
// run (python3 missing, a crash, a timeout). An exception in one case is that case's
// 'runtime-error', never a None answer. A decision with a rule Thunder cannot translate is refused
// ('not-translated'). Money inputs are decimal.Decimal, never float.
import { spawnSync } from 'node:child_process';
import { exprToPython } from './expr.mjs';
import { prepareRun, plansFor, argLit, okResult, errorResult, runFailure, classifySpawn, parseLastJsonObject } from './target-util.mjs';

// True when a runnable python3 interpreter is present on this machine.
export function pythonAvailable() {
  try {
    const r = spawnSync('python3', ['--version'], { encoding: 'utf8', timeout: 10000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

// A Python literal for a coerced example value.
function pyLit(type, v) {
  if (v == null) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return String(v);
  return JSON.stringify(String(v)); // JSON string escapes are valid Python string escapes
}

// The emitted Python source (for display / gen-parity).
export function emitPythonModule(ast, plans = plansFor(ast, exprToPython, 'Python')) {
  const L = ['# Executable Python target compiled from the decision(s). Deterministic, no AI.'];
  const list = [...plans.values()];
  if (list.some((p) => Object.keys(p.money).length)) L.push('from decimal import Decimal');
  if (list.some((p) => p.refused)) {
    L.push('def _thunder_untranslated(message):', '    raise NotImplementedError(message)', '');
  }
  for (const p of list) {
    const d = p.decision;
    L.push(`def ${d.name}(${p.names.join(', ')}):`);
    for (const { rule: r, code, message } of p.rules) {
      L.push(`    if ${code ?? `_thunder_untranslated(${JSON.stringify(message)})`}: return ${JSON.stringify(r.result)}`);
    }
    L.push(`    return ${d.default == null ? 'None' : JSON.stringify(d.default)}`);
    L.push('');
  }
  return L.join('\n');
}

// Run every decision test case through generated Python. See the header for the result shape.
export function runPythonTarget(ast) {
  if (!pythonAvailable()) return runFailure('missing-toolchain', 'python3 is not installed or not on PATH.');
  const { plans, cases, refused } = prepareRun(ast, { translate: exprToPython, target: 'Python', dialect: 'python' });
  if (!cases.length) return { status: 'ok', results: { ...refused } };

  // Each case is a zero-argument lambda with literal, already-typed arguments (Decimal for Money),
  // run under its own try so one failing case reports an error instead of a None answer.
  const program = [
    'import json, traceback',
    emitPythonModule(ast, plans),
    'CASES = [',
    ...cases.map((c) => {
      const p = plans.get(c.fn);
      return `    (${JSON.stringify(c.key)}, lambda: ${c.fn}(${p.names.map((n) => argLit(c, p, n, pyLit)).join(', ')})),`;
    }),
    ']',
    'out = {}',
    'for key, call in CASES:',
    '    try:',
    '        out[key] = {"ok": call()}',
    '    except Exception as e:',
    '        out[key] = {"error": type(e).__name__ + ": " + str(e)}',
    'print(json.dumps(out, default=str))',
  ].join('\n');

  const res = spawnSync('python3', ['-'], { input: program, encoding: 'utf8', timeout: 30000 });
  if (res.status !== 0 || res.error) return classifySpawn(res, { tool: 'python3', phase: 'build+run', runtimePattern: /Traceback|Error:/ });
  const parsed = parseLastJsonObject(res.stdout);
  if (!parsed) return runFailure('runtime-error', `python3 ran but printed no results: ${(res.stderr || res.stdout || '').trim().slice(-400)}`);
  const results = { ...refused };
  for (const c of cases) {
    const r = parsed[c.key];
    if (r && Object.prototype.hasOwnProperty.call(r, 'ok')) results[c.key] = okResult(r.ok);
    else if (r && r.error) results[c.key] = errorResult('runtime-error', `The generated Python raised while running ${c.key}: ${r.error}`);
    else results[c.key] = errorResult('runtime-error', `python3 reported no result for ${c.key}.`);
  }
  return { status: 'ok', results };
}
