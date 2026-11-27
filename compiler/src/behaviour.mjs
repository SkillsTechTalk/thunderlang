// The behaviour check: run a Python function before and after a change on inputs made from the function's own code,
// and say which answers changed. It is evidence of the kind "Tested", never a proof: it covers the inputs it tried.
//
// It RUNS the code (the file's top level and the function), so it is opt-in: thunder write --behaviour, the MCP
// tool's behaviour option, and the read/write benchmark. Each call has a time limit, and the whole run has one too.
//
// The inputs: for every number written in the function, the number and one either side (100 -> 99, 100, 101), the
// text it compares with, and the usual edges (0, 1, -1, yes, no, nothing, "", an empty list). Every combination
// when there are few, otherwise a fixed sample, so the same code always gets the same inputs.

import { spawnSync } from 'node:child_process';
import { findPython } from './core/project.mjs';

export const BEHAVIOUR_SCHEMA = 'thunder-behaviour-v1';
const MAX_INPUTS = 400;

/** The parameters of `def name(...)` in Python source, or null when there is no such top-level function. */
export function pythonParams(source, name) {
  const re = new RegExp(`^def\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`, 'm');
  const m = re.exec(source);
  if (!m) return null;
  let i = m.index + m[0].length, depth = 1, text = '';
  for (; i < source.length && depth; i++) {
    const c = source[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    if (depth) text += c;
  }
  const parts = [];
  depth = 0; let cur = '';
  for (const c of text) {
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ',' && !depth) { parts.push(cur); cur = ''; } else cur += c;
  }
  parts.push(cur);
  const params = [];
  for (const raw of parts.map((p) => p.trim()).filter(Boolean)) {
    if (raw === '/' || raw === '*') continue;
    if (raw.startsWith('*')) return { unsupported: `it takes ${raw.startsWith('**') ? 'named extras' : 'extra values'} (${raw})` };
    const pname = raw.split(/[:=]/)[0].trim();
    params.push({ name: pname, hasDefault: raw.includes('=') });
  }
  return { params };
}

/** The body of a top-level Python function: its lines up to the next line at the left edge. */
export function pythonBody(source, name) {
  const lines = source.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^def\\s+${name}\\s*\\(`).test(l));
  if (start < 0) return '';
  let end = start + 1;
  while (end < lines.length && (lines[end].trim() === '' || /^\s/.test(lines[end]))) end++;
  return lines.slice(start, end).join('\n');
}

/** The values to try, from the code of the function before and after (a number used only after counts too). */
export function probeValues(...bodies) {
  const nums = new Set(), strs = new Set();
  for (const body of bodies) {
    const code = body.replace(/#.*$/gm, '');
    for (const m of code.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])/g)) nums.add(m[1]);
    for (const m of code.matchAll(/(["'])((?:(?!\1)[^\\\n]){0,40})\1/g)) strs.add(m[2]);
  }
  const values = [];
  values.fromCode = new Set();
  const add = (v, fromCode = false) => { if (!values.some((x) => JSON.stringify(x) === JSON.stringify(v))) values.push(v); if (fromCode) values.fromCode.add(JSON.stringify(v)); };
  for (const n of [...nums].slice(0, 6)) {
    const isInt = !n.includes('.');
    const x = Number(n);
    if (isInt) { add(x - 1, true); add(x, true); add(x + 1, true); } else { add(x, true); add(Math.round((x - 0.01) * 100) / 100, true); add(Math.round((x + 0.01) * 100) / 100, true); }
  }
  for (const v of [0, 1, -1, true, false, null]) add(v);
  for (const s of [...strs].slice(0, 4)) add(s);
  add('');
  add([]);
  return values;
}

/** What each input looks like in the code: compared with a number, compared with text, or used as a yes/no. */
export function inputKinds(body, params) {
  return Object.fromEntries(params.map((p) => {
    const n = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${n}\\s*(?:[<>]=?|==|!=)\\s*-?\\d|-?\\d[\\d.]*\\s*(?:[<>]=?|==|!=)\\s*${n}\\b|\\b${n}\\s*[-+*/%]|[-+*/%]\\s*${n}\\b|\\b${n}\\s*[<>]=?\\s*[A-Za-z_]|[A-Za-z_]\\w*\\s*[<>]=?\\s*${n}\\b|range\\([^)]*\\b${n}\\b`).test(body)) return [p.name, 'number'];
    if (new RegExp(`\\b${n}\\s*(?:==|!=)\\s*["']|["']\\s*(?:==|!=)\\s*${n}\\b|\\b${n}\\s+(?:not\\s+)?in\\s*[(\\[{]\\s*["']`).test(body)) return [p.name, 'text'];
    if (new RegExp(`(?:\\bif|\\band|\\bor|\\bnot|\\belif)\\s+${n}\\s*(?::|\\band\\b|\\bor\\b|$)`, 'm').test(body)) return [p.name, 'bool'];
    return [p.name, null];
  }));
}

/**
 * The inputs to try, using what the code shows about each input: a number input gets the code's numbers and the
 * edges, a text input the code's text, a yes/no input yes, no, and nothing. Every combination of those (or a fixed
 * sample when there are too many), then each input once with every other kind of value, to catch changes in how odd
 * values are handled.
 */
export function typedInputs(params, values, kinds, { odd = true } = {}) {
  const pool = (k) => {
    if (k === 'number') return values.filter((v) => typeof v === 'number');
    if (k === 'text') return values.filter((v) => typeof v === 'string' || v === null);
    if (k === 'bool') return [true, false];
    return values;
  };
  const pools = params.map((p) => pool(kinds[p.name]));
  const key = (a) => JSON.stringify(a);
  const seen = new Set(), out = [];
  const push = (a) => { const k = key(a); if (!seen.has(k)) { seen.add(k); out.push(a); } };
  const total = pools.reduce((n, p) => n * p.length, 1);
  if (total <= MAX_INPUTS) {
    for (let k = 0; k < total; k++) { const args = []; let r = k; for (const p of pools) { args.push(p[r % p.length]); r = Math.floor(r / p.length); } push(args); }
  } else {
    let seed = 20261127;
    const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let j = 0; j < params.length; j++) for (const v of pools[j]) push(pools.map((p, i) => (i === j ? v : p[0])));
    while (out.length < MAX_INPUTS) push(pools.map((p) => p[Math.floor(rand() * p.length)]));
  }
  // Odd values, one input at a time, the others at a typical value.
  if (odd) for (let j = 0; j < params.length; j++) for (const v of values) if (!pools[j].some((x) => key(x) === key(v))) push(pools.map((p, i) => (i === j ? v : p[0])));
  return out;
}

const HARNESS = String.raw`
import json, sys, signal, io, contextlib, types, os
job = json.loads(sys.stdin.read())
# The file's own folder, so its imports of neighbouring modules work as they would for the program.
sys.path.insert(0, os.path.dirname(os.path.abspath(job["path"])))
class TimeUp(Exception):
    pass
def on_alarm(signum, frame):
    raise TimeUp()
if hasattr(signal, "SIGALRM"):
    signal.signal(signal.SIGALRM, on_alarm)
def limit(seconds):
    if hasattr(signal, "SIGALRM"):
        signal.setitimer(signal.ITIMER_REAL, seconds)
def unlimit():
    if hasattr(signal, "SIGALRM"):
        signal.setitimer(signal.ITIMER_REAL, 0)
def load(src):
    mod = types.ModuleType("thunder_behaviour_subject")
    mod.__file__ = job["path"]
    out = io.StringIO()
    try:
        limit(5)
        with contextlib.redirect_stdout(out):
            exec(compile(src, job["path"], "exec"), mod.__dict__)
        unlimit()
    except BaseException as e:
        unlimit()
        return None, "%s: %s" % (type(e).__name__, e)
    fn = getattr(mod, job["name"], None)
    if not callable(fn):
        return None, "the file has no function named %s" % job["name"]
    return fn, None
def call(fn, args):
    out = io.StringIO()
    try:
        limit(1)
        with contextlib.redirect_stdout(out):
            value = fn(*args)
        unlimit()
        return {"value": repr(value), "printed": out.getvalue()}
    except TimeUp:
        return {"error": "took longer than a second", "printed": out.getvalue()}
    except BaseException as e:
        unlimit()
        return {"error": "%s: %s" % (type(e).__name__, e), "printed": out.getvalue()}
result = {}
for side in ("before", "after"):
    fn, problem = load(job[side])
    if problem:
        result[side] = {"problem": problem}
        continue
    result[side] = {"results": [call(fn, list(a)) for a in job["inputs"]]}
print(json.dumps(result))
`;

/** A JSON value as Python source (for argument lists): true -> True, null -> None. */
export const pyLiteral = (v) => (v === null ? 'None' : v === true ? 'True' : v === false ? 'False' : Array.isArray(v) ? `[${v.map(pyLiteral).join(', ')}]` : typeof v === 'string' ? JSON.stringify(v) : String(v));

/**
 * Argument lists (Python source) for a function, made from its code: typed inputs only, no odd values, because a
 * round trip compares like with like. [] when an input's kind cannot be told from the code.
 */
export function generatedArgs(source, name, { max = 120 } = {}) {
  const sig = pythonParams(source, name);
  if (!sig || sig.unsupported) return [];
  const body = pythonBody(source, name);
  const kinds = inputKinds(body, sig.params);
  if (sig.params.some((p) => !kinds[p.name])) return [];
  return typedInputs(sig.params, probeValues(body), kinds, { odd: false }).slice(0, max).map((a) => a.map(pyLiteral).join(', '));
}

const show = (v) => (v === null ? 'None' : v === true ? 'True' : v === false ? 'False' : typeof v === 'string' ? JSON.stringify(v) : Array.isArray(v) ? '[]' : String(v));
const outcome = (r) => (r.error ? `error (${r.error})` : `${r.value}${r.printed ? ` and printed ${JSON.stringify(r.printed.trimEnd())}` : ''}`);

/**
 * Run `name` from `path` before and after a change on inputs made from its code.
 * Returns { schema, status: 'same' | 'changed' | 'broken' | 'not-run', function, inputs, changes, says, reason? }.
 */
export function behaviourCheck({ path, name, before, after, python = null, timeoutMs = 60000 }) {
  const base = { schema: BEHAVIOUR_SCHEMA, function: `${path}#${name}`, inputs: 0, changes: [] };
  if (!/\.py$/.test(path)) return { ...base, status: 'not-run', reason: 'the behaviour check runs Python functions only for now', says: `Behaviour not checked: ${path} is not Python (the behaviour check runs Python only for now).` };
  const sig = pythonParams(after, name) ?? pythonParams(before, name);
  if (!sig) return { ...base, status: 'not-run', reason: `${name} is not a top-level function (methods need an object to run on)`, says: `Behaviour not checked: ${name} is not a top-level function.` };
  if (sig.unsupported) return { ...base, status: 'not-run', reason: sig.unsupported, says: `Behaviour not checked: ${name} ${sig.unsupported}.` };
  const py = python ?? findPython();
  if (py.error) return { ...base, status: 'not-run', reason: py.error, says: `Behaviour not checked: ${py.error}` };
  const values = probeValues(pythonBody(before, name), pythonBody(after, name));
  const body = pythonBody(after, name) || pythonBody(before, name);
  const kind = inputKinds(body, sig.params);
  const inputs = typedInputs(sig.params, values, kind);
  const run = spawnSync(py.cmd, ['-I', '-c', HARNESS], { input: JSON.stringify({ path, name, before, after, inputs }), encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  if (run.error || run.status !== 0) return { ...base, status: 'not-run', reason: run.error ? `the run stopped: ${run.error.message}` : `Python failed: ${(run.stderr || '').trim().split('\n').pop()}`, says: 'Behaviour not checked: the run did not finish.' };
  const res = JSON.parse(run.stdout);
  if (res.after.problem) return { ...base, status: 'broken', inputs: 0, reason: res.after.problem, says: `Behaviour: the changed file does not load: ${res.after.problem}.` };
  if (res.before.problem) return { ...base, status: 'not-run', reason: `the original file does not load: ${res.before.problem}`, says: `Behaviour not checked: the original file does not load (${res.before.problem}).` };
  const changes = [];
  inputs.forEach((args, i) => {
    const b = res.before.results[i], a = res.after.results[i];
    if (outcome(b) !== outcome(a)) changes.push({ inputs: Object.fromEntries(sig.params.map((p, j) => [p.name, args[j]])), before: outcome(b), after: outcome(a) });
  });
  // The example shown first: the change whose inputs look most like real ones (the code's own numbers, yes/no).
  const fits = (pname, v) => (kind[pname] === 'bool' ? typeof v === 'boolean' : kind[pname] === 'text' ? typeof v === 'string' && v !== '' : kind[pname] === 'number' ? typeof v === 'number' && values.fromCode.has(JSON.stringify(v)) : values.fromCode.has(JSON.stringify(v)) || typeof v === 'boolean');
  const likeReal = (c) => Object.entries(c.inputs).filter(([k, v]) => fits(k, v)).length;
  changes.sort((x, y) => likeReal(y) - likeReal(x));
  const said = (c) => `${sig.params.length ? sig.params.map((p) => `${p.name} ${show(c.inputs[p.name])}`).join(', ') : 'no inputs'}: before ${c.before}, after ${c.after}`;
  const says = changes.length
    ? `Behaviour: ran ${name} before and after on ${inputs.length} inputs made from its code; ${changes.length} gave a different answer, e.g. ${said(changes[0])}.`
    : `Behaviour: ran ${name} before and after on ${inputs.length} inputs made from its code; every answer is the same.`;
  return { ...base, status: changes.length ? 'changed' : 'same', inputs: inputs.length, changes, says, example: changes[0] ? said(changes[0]) : null, examples: changes.slice(0, 5).map(said) };
}
