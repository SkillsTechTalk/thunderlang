// Property-based testing for ThunderLang decisions. Deterministic and seeded: for each
// `property`, generate many input cases that satisfy the `forAll` constraints, evaluate the
// named decision, and assert the `expect` clauses hold for every case. On failure, binary-shrink
// each numeric input toward its lower bound to report the smallest reproducible failure.
import { evaluateDecision } from './runtime.mjs';
import { compileExpr } from './expr.mjs';

const DEFAULT_MIN = 0, DEFAULT_MAX = 1000;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Derive an integer [min, max] for a variable from its `where` clause (>=, >, <=, <, ==).
function boundsFor(where, varName) {
  let min = DEFAULT_MIN, max = DEFAULT_MAX;
  if (!where) return { min, max };
  const re = new RegExp(`\\b${varName}\\s*(>=|<=|>|<|==)\\s*(-?\\d+)`, 'g');
  let m;
  while ((m = re.exec(where))) {
    const n = parseInt(m[2], 10);
    if (m[1] === '>=') min = Math.max(min, n);
    else if (m[1] === '>') min = Math.max(min, n + 1);
    else if (m[1] === '<=') max = Math.min(max, n);
    else if (m[1] === '<') max = Math.min(max, n - 1);
    else if (m[1] === '==') { min = n; max = n; }
  }
  const unsat = min > max; // e.g. `where x >= 100 and x <= 0` , no integer satisfies it
  if (unsat) max = min;
  return { min, max, unsat };
}

const isBool = (t) => /bool/i.test(t || '');

function satisfies(v, val) {
  if (!v.where) return true;
  try { return !!compileExpr(v.where)({ [v.name]: val }); } catch { return true; }
}

function genValue(v, rnd) {
  if (isBool(v.type)) return rnd() < 0.5;
  const { min, max } = boundsFor(v.where, v.name);
  return Math.floor(min + rnd() * (max - min + 1));
}

// Evaluate the property's expect clauses against a decision run. Returns the first violation.
function checkExpects(prop, run) {
  for (const e of prop.expects) {
    const m = e.match(/^(\w+)\s*(==|!=)\s*(.+?)\s*$/);
    if (!m) continue;
    const field = m[1] === 'matchedRule' || m[1] === 'rule' ? 'matched' : 'result';
    const lhs = field === 'matched' ? run.matched : run.result;
    const eq = String(lhs) === m[3];
    if (m[2] === '==' ? !eq : eq) return { ok: false, expect: e, actual: lhs };
  }
  return { ok: true };
}

// Given the other inputs fixed, find the smallest value of `v` that still fails the property.
function shrinkVar(prop, dec, inputs, v) {
  if (isBool(v.type) || typeof inputs[v.name] !== 'number') return inputs[v.name];
  const { min } = boundsFor(v.where, v.name);
  const fails = (val) => satisfies(v, val) && !checkExpects(prop, evaluateDecision(dec, { ...inputs, [v.name]: val })).ok;
  if (fails(min)) return min;
  let lo = min, hi = inputs[v.name];
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (fails(mid)) hi = mid; else lo = mid; }
  return hi;
}

function shrink(prop, dec, failing) {
  const inputs = { ...failing.inputs };
  for (const v of prop.vars) inputs[v.name] = shrinkVar(prop, dec, inputs, v);
  const run = evaluateDecision(dec, inputs);
  const chk = checkExpects(prop, run);
  return { inputs, expect: chk.expect || failing.expect, actual: chk.actual };
}

export function runProperties(ast, { cases = 100, seed = 424242 } = {}) {
  const decisions = new Map((ast.decisions || []).map((d) => [d.name, d]));
  const results = [];
  for (const prop of ast.properties || []) {
    const dec = decisions.get(prop.decide);
    if (!dec) { results.push({ property: prop.name, ok: false, cases: 0, seed, error: prop.decide ? `no decision named "${prop.decide}"` : 'property has no `decide <Decision>`' }); continue; }
    const badVar = prop.vars.find((v) => !isBool(v.type) && boundsFor(v.where, v.name).unsat);
    if (badVar) { results.push({ property: prop.name, ok: false, cases: 0, seed, error: `unsatisfiable constraint for "${badVar.name}": ${badVar.where}` }); continue; }
    const rnd = mulberry32(seed);
    let failure = null;
    for (let i = 0; i < cases && !failure; i++) {
      const inputs = {};
      for (const v of prop.vars) {
        let val, tries = 0;
        do { val = genValue(v, rnd); tries++; } while (!satisfies(v, val) && tries < 50);
        inputs[v.name] = val;
      }
      const chk = checkExpects(prop, evaluateDecision(dec, inputs));
      if (!chk.ok) failure = { inputs, expect: chk.expect, actual: chk.actual };
    }
    if (failure) failure = shrink(prop, dec, failure);
    results.push({ property: prop.name, ok: !failure, cases, seed, failure });
  }
  return { schema: 'thunder-properties-v1', total: results.length, passed: results.filter((r) => r.ok).length, results };
}
