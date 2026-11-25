// Round trip, checked by running: Python → Thunder Core → Python again, compared on real inputs. Node only.
//
// For each input, the ORIGINAL Python function and the function compiled from its Thunder Core are both called, and
// three things are compared: the value given back, what was printed, and whether (and with what message) it stopped
// with an error. "Same" is claimed only when all three match. Numbers match when they are equal as decimals, or
// within 1e-9 of each other when the original used binary floats (0.30000000000000004 vs Core's exact 0.3); that
// tolerance is reported, never hidden.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileCore, PYTHON_RUNTIME } from './index.mjs';
import { findPython } from './project.mjs';

const HARNESS = String.raw`
import io, json, sys, contextlib, importlib, math
from decimal import Decimal
from types import SimpleNamespace as O

plan = json.load(open(sys.argv[1]))
orig = importlib.import_module("original")
core = importlib.import_module("from_core")

def norm(v):
    if isinstance(v, bool) or v is None or isinstance(v, str):
        return v
    if isinstance(v, (int, float, Decimal)):
        return {"number": str(v), "float": isinstance(v, float)}
    if type(v).__name__ == "Money":
        return {"number": str(v.amount), "float": False}
    if isinstance(v, (list, tuple)):
        return [norm(x) for x in v]
    if isinstance(v, dict):
        return {"map": [[norm(k), norm(x)] for k, x in v.items()]}
    if isinstance(v, O) or hasattr(v, "__dict__"):
        return {"record": {k: norm(x) for k, x in sorted(vars(v).items())}}
    return {"other": repr(v)}

def call(fn, args):
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out):
            value = fn(*args)
        return {"value": norm(value), "printed": out.getvalue(), "error": None}
    except Exception as e:
        return {"value": None, "printed": out.getvalue(), "error": str(e), "kinds": [c.__name__ for c in type(e).__mro__]}

def python_fn(args):
    kind = plan.get("kind", "function")
    if kind == "method":          # obj.method(rest): the object is the first input
        return lambda *a: getattr(a[0], plan["python"])(*a[1:])
    if kind == "static":
        return getattr(getattr(orig, plan["cls"]), plan["python"])
    return getattr(orig, plan["python"])

env = {"O": O, **{k: v for k, v in vars(orig).items() if not k.startswith("__")}}
results = []
for case in plan["inputs"]:
    args = eval("(" + case + ",)", env)
    a = call(python_fn(args), args)
    if plan.get("kind") == "method":
        a["after"] = norm(args[0])
    args = eval("(" + case + ",)", env)
    b = call(getattr(core, plan["core"]), args)
    if plan.get("kind") == "method":
        b["after"] = norm(args[0])
    results.append({"input": case, "python": a, "core": b})
print(json.dumps(results))
`;

/** A decimal written without trailing zeros: "107.00" → "107", "-0.50" → "-0.5", "1E+2" stays as written. */
const decimalText = (t) => { const s = String(t); return /^-?\d+\.\d+$/.test(s) ? s.replace(/0+$/, '').replace(/\.$/, '') : s.replace(/^-0$/, '0'); };

/** Are two normalized values the same? Gives back { same, tolerance } (tolerance: a float was compared within 1e-9). */
export function sameValue(a, b) {
  let tolerance = false;
  const eq = (x, y) => {
    if (x && typeof x === 'object' && 'number' in x && y && typeof y === 'object' && 'number' in y) {
      if (decimalText(x.number) === decimalText(y.number)) return true; // the same digits (107.0 and 107.00 are equal)
      const p = Number(x.number), q = Number(y.number);
      if ((x.float || y.float) && Math.abs(p - q) <= 1e-9 * Math.max(1, Math.abs(p), Math.abs(q))) { tolerance = true; return true; }
      return false;
    }
    if (Array.isArray(x) || Array.isArray(y)) return Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.every((v, i) => eq(v, y[i]));
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      const kx = Object.keys(x).sort(), ky = Object.keys(y).sort();
      return kx.join() === ky.join() && kx.every((k) => eq(x[k], y[k]));
    }
    return x === y;
  };
  return { same: eq(a, b), tolerance };
}

/** Printed text compared line by line; a line of numbers matches within the same float tolerance. */
function samePrinted(a, b) {
  const la = a.split('\n'), lb = b.split('\n');
  if (la.length !== lb.length) return { same: false, tolerance: false };
  let tolerance = false;
  for (let i = 0; i < la.length; i++) {
    if (la[i] === lb[i]) continue;
    const p = Number(la[i]), q = Number(lb[i]);
    if (la[i].trim() && lb[i].trim() && Number.isFinite(p) && Number.isFinite(q) && Math.abs(p - q) <= 1e-9 * Math.max(1, Math.abs(p), Math.abs(q))) { tolerance = true; continue; }
    return { same: false, tolerance };
  }
  return { same: true, tolerance };
}

/**
 * Run the original Python function and the one compiled from its Core on each input.
 * { python: source, core: Thunder Core text, name: python function name, inputs: ['150, True', …] }
 * Gives back { ran, error?, cases: [{ input, same, tolerance, why?, python, core }] }.
 */
export function verifyRoundTrip({ python, core, name, inputs, coreFunction = null, kind = 'function', cls = null }) {
  const py = findPython();
  if (py.error) return { ran: false, error: `Python 3.10+ is needed to check by running: ${py.error}`, cases: [] };
  const compiled = compileCore(core, { file: `${name}.thunder` });
  if (compiled.diagnostics.length) return { ran: false, error: `The Core does not compile: ${compiled.diagnostics[0].message}`, cases: [] };
  // The compiled function: the def whose "# thunder:N" marks the "To <coreFunction>:" line (else the first def).
  let coreName;
  if (coreFunction) {
    const line = core.split('\n').findIndex((l) => l === `To ${coreFunction}:`) + 1;
    coreName = line ? new RegExp(`^def (\\w+)\\(.*# thunder:${line}$`, 'm').exec(compiled.python)?.[1] : undefined;
  } else coreName = /^def (\w+)\(/m.exec(compiled.python.split('\n').filter((l) => !l.startsWith('    ')).join('\n').replace(/^def (main|_\w+)\(.*$/gm, ''))?.[1];
  if (!coreName) return { ran: false, error: 'The compiled Core has no function to call', cases: [] };
  const dir = mkdtempSync(join(tmpdir(), 'thunder-roundtrip-'));
  try {
    writeFileSync(join(dir, 'original.py'), python);
    writeFileSync(join(dir, 'from_core.py'), compiled.python);
    writeFileSync(join(dir, 'thunder_runtime.py'), PYTHON_RUNTIME);
    writeFileSync(join(dir, 'harness.py'), HARNESS);
    writeFileSync(join(dir, 'plan.json'), JSON.stringify({ python: name, core: coreName, inputs, kind, cls }));
    const r = spawnSync(py.cmd, ['harness.py', 'plan.json'], { cwd: dir, encoding: 'utf8', timeout: 30000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    if (r.status !== 0) return { ran: false, error: `The check did not run: ${(r.stderr || r.error?.message || '').trim().split('\n').at(-1)}`, cases: [] };
    const cases = JSON.parse(r.stdout).map((c) => {
      const v = sameValue(c.python.value, c.core.value);
      const p = samePrinted(c.python.printed, c.core.printed);
      // The same failure: both stopped, with the same message or the same kind of error (Core's divide-by-zero is a
      // ZeroDivisionError too). The messages may be worded differently; both are shown.
      const pk = c.python.kinds?.[0];
      const err = (c.python.error == null) === (c.core.error == null) && (c.python.error == null || c.core.error.includes(c.python.error) || c.python.error.includes(c.core.error) || (pk && pk !== 'Exception' && (c.core.kinds || []).includes(pk)));
      // A method may change its object: the object afterwards must match too.
      const after = kind === 'method' ? sameValue(c.python.after, c.core.after) : { same: true, tolerance: false };
      const same = v.same && p.same && err && after.same;
      const why = same ? undefined : !err ? `errors differ (Python: ${c.python.error ?? 'none'}; Core: ${c.core.error ?? 'none'})` : !v.same ? 'the values given back differ' : !after.same ? 'the object is different afterwards' : 'what was printed differs';
      return { input: c.input, same, tolerance: v.tolerance || p.tolerance || after.tolerance, ...(why ? { why } : {}), python: c.python, core: c.core };
    });
    return { ran: true, cases };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
