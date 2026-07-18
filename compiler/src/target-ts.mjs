// TypeScript/JS target adapter. Compiles each decision into an executable function using the
// SAME expression translator the TypeScript codegen uses (exprToJs), then runs the test cases
// through the generated code and returns actual outputs. This turns conformance from "grade fed
// results" into "grade a live target": the generated implementation is executed for real.
// Type annotations are erased at runtime, so running the type-stripped JS is faithful to the TS.
import { exprToJs } from './expr.mjs';

const inputNames = (dec) => (dec.inputs || []).map((i) => String(i).split(':')[0].trim()).filter(Boolean);

function coerceVal(v) {
  if (v == null || typeof v !== 'string') return v;
  const s = v.trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === 'true') return true;
  if (s === 'false') return false;
  return v;
}

// The emitted source (for display / `gen`-parity); the runtime uses new Function on the body.
export function emitDecisionModule(ast) {
  const L = ['// Executable target compiled from the decision(s). Deterministic, no AI.'];
  for (const d of ast.decisions || []) {
    L.push(`export function ${d.name}(${inputNames(d).join(', ')}) {`);
    for (const r of d.rules || []) {
      let cond; try { cond = exprToJs(r.when, { inputs: inputNames(d) }); } catch { cond = 'false'; }
      L.push(`  if (${cond}) return ${JSON.stringify(r.result)};`);
    }
    L.push(`  return ${JSON.stringify(d.default ?? null)};`, '}');
  }
  return L.join('\n');
}

// Compile each decision to a runnable function.
function compileDecisionFns(ast) {
  const fns = {};
  for (const d of ast.decisions || []) {
    const names = inputNames(d);
    const body = [];
    for (const r of d.rules || []) {
      let cond; try { cond = exprToJs(r.when, { inputs: names }); } catch { cond = 'false'; }
      body.push(`if (${cond}) return ${JSON.stringify(r.result)};`);
    }
    body.push(`return ${JSON.stringify(d.default ?? null)};`);
    try { fns[d.name] = new Function(...names, body.join('\n')); } catch { fns[d.name] = null; }
  }
  return fns;
}

// Run every decision test case through the generated code. Returns { "Test / case": actual }.
export function runTypescriptTarget(ast) {
  const fns = compileDecisionFns(ast);
  const out = {};
  for (const t of ast.tests || []) {
    const dec = (ast.decisions || []).find((d) => d.name === t.name);
    if (!dec) continue;
    const names = inputNames(dec);
    const fn = fns[t.name];
    for (const c of t.cases || []) {
      const key = `${t.name} / ${c.name || 'case'}`;
      if (typeof fn !== 'function') { out[key] = null; continue; }
      const args = names.map((n) => coerceVal((c.given || {})[n]));
      try { out[key] = fn(...args); } catch { out[key] = null; }
    }
  }
  return out;
}
