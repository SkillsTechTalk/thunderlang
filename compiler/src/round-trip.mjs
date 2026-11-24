// Code → Thunder → code, for steps: is the meaning unchanged?
//
// Every step carries its meaning tree (`expr`, see meaning.mjs). Here each tree is written back as code in the
// language it was read from (TypeScript, JavaScript, Python, Go), that code is read again by the same reader, and the
// two trees are compared:
//
//   structural  the re-read tree equals the original (after normalizing spelling: quotes, spacing). "exact".
//   behavioral  where a condition or value is made only of names, values, and operators, the ORIGINAL code and the
//               code written back are both run on generated inputs (Node for TypeScript/JavaScript, Python for
//               Python) and must give the same answer, or fail the same way, every time.
//
// A step Thunder could not read into a tree (`kind: 'code'`) is counted apart: its code is kept, but it is not a
// round trip of meaning. Nothing is reported as exact that was not compared.
import { spawnSync } from 'node:child_process';
import { readCode } from './read.mjs';
import { renderStatement, renderExpr, parseStatementSpans, sameExpr, normalizeExpr, nodesOf } from './meaning.mjs';

export const ROUND_TRIP_LANGUAGES = ['typescript', 'javascript', 'python', 'go'];

const WRAP = {
  typescript: (code) => `function thunderRoundTrip() {\n${code}\nthunderEnd();\n}\n`,
  javascript: (code) => `function thunderRoundTrip() {\n${code}\nthunderEnd();\n}\n`,
  python: (code) => `def thunder_round_trip():\n${code.split('\n').map((l) => `    ${l}`).join('\n')}\n    thunder_end()\n`,
  go: (code) => `package main\n\nfunc thunderRoundTrip() {\n${code}\nthunderEnd()\n}\n`,
};

// A case label is only code inside a switch (match): it is written in one, and its step read from there.
const IN_SWITCH = {
  typescript: (code) => `switch (thunderSubject) {\n${code}\n  thunderCase();\n}`,
  javascript: (code) => `switch (thunderSubject) {\n${code}\n  thunderCase();\n}`,
  python: (code) => `match thunder_subject:\n    ${code}\n        thunder_case()`,
  go: (code) => `switch thunderSubject {\n${code}\n\tthunderCase()\n}`,
};

/** Read code the way Thunder reads a file, and give back the first step's tree (a case label: the case's). */
export function rereadStatement(code, language, { caseLabel = false } = {}) {
  const wrapped = WRAP[language](caseLabel ? IN_SWITCH[language](code) : code);
  const reading = readCode(wrapped, { language });
  const fn = reading.items.find((i) => i.kind === 'function' && /^thunder_?round_?trip$/i.test(i.name));
  const first = fn?.steps?.[0];
  return (caseLabel ? first?.children?.[0]?.expr : first?.expr) ?? null;
}

/**
 * One step's round trip: { result, code?, back?, why? }, result one of 'exact', 'different', 'code' (Thunder kept
 * the code; no tree to compare), 'not-written' (the tree has something the language cannot say this way), or
 * 'not-read-back' (the written code did not read back as a step).
 */
export function stepRoundTrip(step, language) {
  const e = step?.expr;
  if (!e || e.kind === 'code') return { result: 'code' };
  let code;
  try { code = renderStatement(e, language); } catch (err) { return { result: 'not-written', why: err.message }; }
  let back;
  try { back = rereadStatement(code, language, { caseLabel: e.kind === 'case' }); } catch (err) { return { result: 'not-read-back', code, why: err.message }; }
  if (!back) return { result: 'not-read-back', code, why: 'no step was read from the written code' };
  return sameExpr(e, back) ? { result: 'exact', code } : { result: 'different', code, back, why: firstDifference(normalizeExpr(e), normalizeExpr(back)) };
}

function firstDifference(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return `${path || 'tree'}: ${JSON.stringify(a)?.slice(0, 80)} became ${JSON.stringify(b)?.slice(0, 80)}`;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = firstDifference(a[k], b[k], path ? `${path}.${k}` : k);
    if (d) return d;
  }
  return path;
}

// ── Behavior: run the original and the written-back code on the same inputs ─────────────────────────────────

const PURE = new Set(['name', 'literal', 'not', 'unary', 'binary', 'compare', 'chain', 'logic', 'conditional', 'array', 'template']);
/** The part of a step that can be run on its own: a condition or a value made only of names, values, and operators. */
function runnablePart(tree) {
  const part = tree.kind === 'if' && !tree.init ? tree.test : tree.kind === 'return' ? tree.value : tree.kind === 'assign' && (tree.op === '=' || tree.op === ':=') ? tree.value : tree.kind === 'loop' && tree.form === 'while' ? tree.test : null;
  if (!part) return null;
  for (const n of nodesOf(part)) {
    if (!PURE.has(n.kind)) return null;
    if (n.kind === 'unary' && !/^[-+~]$/.test(n.op)) return null;
    if (n.kind === 'literal' && !/^(?:number|text|bool|null)$/.test(n.type)) return null;
    if (n.kind === 'array' && n.form === 'set') return null;
  }
  return part;
}
const freeNames = (part) => [...new Set([...nodesOf(part)].filter((n) => n.kind === 'name').map((n) => n.name))].filter((n) => !/^(?:undefined|NaN|Infinity|None|True|False|null|true|false|nil)$/.test(n));

/**
 * A behavior case for a step, or null when the step has no part that can be run alone: { names, original, written }
 * (`original`: the code as it is in the file; `written`: the code Thunder wrote back from the tree).
 */
export function behaviorCase(step, sourceText, language) {
  if (!step?.expr || step.expr.kind === 'code' || !sourceText) return null;
  const read = parseStatementSpans(sourceText, language);
  if (!read) return null;
  const part = runnablePart(read.tree);
  if (!part) return null;
  const original = read.textOf(part);
  if (!original) return null;
  const names = freeNames(part);
  if (names.length > 4) return null;
  let written;
  try { written = renderExpr(part, language); } catch { return null; }
  return { names, original: original.trim(), written };
}

const JS_POOL = [0, 1, -1, 2, 7, 0.5, '', 'a', 'B', null, undefined, true, false, [], [1]];
const PY_POOL = ['0', '1', '-1', '2', '7', '0.5', "''", "'a'", "'B'", 'None', 'True', 'False', '[]', '[1]'];
/** Inputs for k names: every combination when there are few, else a fixed spread of them (deterministic). */
function inputs(k, n) {
  const total = n ** k;
  const out = [];
  if (total <= 225) { for (let i = 0; i < total; i++) { const c = []; let x = i; for (let j = 0; j < k; j++) { c.push(x % n); x = Math.floor(x / n); } out.push(c); } return out; }
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
  for (let i = 0; i < 225; i++) out.push(Array.from({ length: k }, () => rnd() % n));
  return out;
}

function runJs(c) {
  const show = (f, args) => { try { const v = f(...args); return `= ${typeof v} ${JSON.stringify(v, (k, x) => (x === undefined ? '__undefined__' : Number.isNaN(x) ? '__NaN__' : x))}`; } catch (e) { return `! ${e?.constructor?.name}`; } };
  let a, b;
  try { a = new Function(...c.names, `"use strict"; return (${c.original});`); } catch { return { result: 'not-run', why: 'the original is not plain JavaScript' }; }
  try { b = new Function(...c.names, `"use strict"; return (${c.written});`); } catch { return { result: 'different', why: 'the written code does not compile' }; }
  for (const combo of inputs(c.names.length, JS_POOL.length)) {
    const args = combo.map((i) => (Array.isArray(JS_POOL[i]) ? [...JS_POOL[i]] : JS_POOL[i]));
    const x = show(a, args), y = show(b, args);
    if (x !== y) return { result: 'different', why: `with ${c.names.map((n, i) => `${n}=${JSON.stringify(args[i])}`).join(', ')}: ${x} before, ${y} after` };
  }
  return { result: 'same', tried: inputs(c.names.length, JS_POOL.length).length };
}

const PY_RUNNER = `
import json, sys
cases = json.load(sys.stdin)
pool = ${JSON.stringify(PY_POOL)}
out = []
def show(src, env):
    try:
        v = eval(src, {"__builtins__": {}}, env)
        return "= " + type(v).__name__ + " " + repr(v)
    except Exception as e:
        return "! " + type(e).__name__
for c in cases:
    res = {"result": "same", "tried": 0}
    try:
        compile(c["original"], "<o>", "eval"); compile(c["written"], "<w>", "eval")
    except SyntaxError:
        out.append({"result": "not-run", "why": "does not compile as one Python expression"}); continue
    for combo in c["inputs"]:
        env = {n: eval(pool[i]) for n, i in zip(c["names"], combo)}
        a = show(c["original"], dict(env)); b = show(c["written"], dict(env))
        res["tried"] += 1
        if a != b:
            res = {"result": "different", "why": "with %s: %s before, %s after" % (env, a, b)}; break
    out.append(res)
print(json.dumps(out))
`;

/**
 * Run behavior cases: [{ names, original, written }] in a language -> [{ result: 'same' | 'different' | 'not-run',
 * why?, tried? }]. TypeScript/JavaScript run in Node; Python in a Python process (when one is installed); Go is not
 * run (its values need declared types), and says so.
 */
export function runBehavior(cases, language) {
  if (!cases.length) return [];
  if (language === 'typescript' || language === 'javascript') return cases.map(runJs);
  if (language === 'python') {
    const payload = JSON.stringify(cases.map((c) => ({ ...c, inputs: inputs(c.names.length, PY_POOL.length) })));
    const r = spawnSync('python3', ['-I', '-c', PY_RUNNER], { input: payload, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) return cases.map(() => ({ result: 'not-run', why: `Python could not run: ${(r.stderr || r.error?.message || '').split('\n').filter(Boolean).pop() ?? 'unknown'}` }));
    return JSON.parse(r.stdout);
  }
  return cases.map(() => ({ result: 'not-run', why: `${language} values need declared types to run alone` }));
}
