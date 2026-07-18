// Python target adapter. Compiles each decision into an executable Python function using the
// SAME expression translator the codegen uses (exprToPython), then runs the test cases through a
// real `python3` child process and returns actual outputs. Like the TypeScript adapter, this makes
// conformance "grade a live target" rather than "grade fed results" — the generated Python is
// executed for real. Returns null (not a partial result) when python3 is unavailable, so callers
// can report the target as skipped rather than failing.
import { spawnSync } from 'node:child_process';
import { exprToPython } from './expr.mjs';

const inputNames = (dec) => (dec.inputs || []).map((i) => String(i).split(':')[0].trim()).filter(Boolean);

function coerceVal(v) {
  if (v == null || typeof v !== 'string') return v;
  const s = v.trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === 'true') return true;
  if (s === 'false') return false;
  return v;
}

// True when a runnable python3 interpreter is present on this machine.
export function pythonAvailable() {
  try {
    const r = spawnSync('python3', ['--version'], { encoding: 'utf8', timeout: 10000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

// The emitted Python source (for display / gen-parity).
export function emitPythonModule(ast) {
  const L = ['# Executable Python target compiled from the decision(s). Deterministic, no AI.'];
  for (const d of ast.decisions || []) {
    L.push(`def ${d.name}(${inputNames(d).join(', ')}):`);
    for (const r of d.rules || []) {
      let cond; try { cond = exprToPython(r.when, { inputs: inputNames(d) }); } catch { cond = 'False'; }
      L.push(`    if ${cond}: return ${JSON.stringify(r.result)}`);
    }
    L.push(`    return ${d.default == null ? 'None' : JSON.stringify(d.default)}`);
    L.push('');
  }
  return L.join('\n');
}

// Run every decision test case through generated Python. Returns { "Test / case": actual },
// or null if python3 is unavailable or the interpreter failed to run the program.
export function runPythonTarget(ast) {
  if (!pythonAvailable()) return null;

  // Build the list of calls to make, one per test case, in a stable order.
  const cases = [];
  for (const t of ast.tests || []) {
    const dec = (ast.decisions || []).find((d) => d.name === t.name);
    if (!dec) continue;
    const names = inputNames(dec);
    for (const c of t.cases || []) {
      cases.push({
        key: `${t.name} / ${c.name || 'case'}`,
        fn: t.name,
        args: names.map((n) => coerceVal((c.given || {})[n])),
      });
    }
  }

  // Emit a self-contained program: decision defs + a driver that runs each case and prints JSON.
  // Cases (with already-coerced arg types) are handed in as a JSON literal parsed by json.loads,
  // so Python receives real ints/floats/bools/strings rather than stringified values.
  const program = [
    'import json',
    emitPythonModule(ast),
    `CASES = json.loads(${JSON.stringify(JSON.stringify(cases))})`,
    'out = {}',
    'for c in CASES:',
    '    fn = globals().get(c["fn"])',
    '    try:',
    '        out[c["key"]] = fn(*c["args"]) if callable(fn) else None',
    '    except Exception:',
    '        out[c["key"]] = None',
    'print(json.dumps(out))',
  ].join('\n');

  const res = spawnSync('python3', ['-'], { input: program, encoding: 'utf8', timeout: 30000 });
  if (res.status !== 0 || !res.stdout) return null;
  try {
    return JSON.parse(res.stdout.trim().split('\n').pop());
  } catch {
    return null;
  }
}
