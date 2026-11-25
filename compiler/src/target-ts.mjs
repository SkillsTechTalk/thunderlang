// TypeScript/JS target adapter. Compiles each decision into an executable function using the
// SAME expression translator the TypeScript codegen uses (exprToJs), then runs the test cases
// through the generated code and returns actual outputs. This turns conformance from "grade fed
// results" into "grade a live target": the generated implementation is executed for real.
// Type annotations are erased at runtime, so running the type-stripped JS is faithful to the TS.
//
// Results are honest: every case is { status: 'ok', value } or { status: 'error', kind, message }.
// A decision with a rule Thunder cannot translate is refused ('not-translated'), never run with a
// stand-in `false`. Money inputs are exact bigint minor units, never floats.
import { exprToJs } from './expr.mjs';
import { planDecision } from './target-types.mjs';
import { okResult, errorResult } from './target-result.mjs';
import { prepareRun } from './target-util.mjs';

// The emitted source (for display / `gen`-parity); the runtime uses new Function on the body.
export function emitDecisionModule(ast) {
  const L = ['// Executable target compiled from the decision(s). Deterministic, no AI.'];
  const plans = (ast.decisions || []).map((d) => planDecision(ast, d, { translate: exprToJs, target: 'TypeScript' }));
  if (plans.some((p) => p.refused)) L.push('function thunderUntranslated(message) { throw new Error(message); }');
  for (const p of plans) {
    L.push(`export function ${p.decision.name}(${p.names.join(', ')}) {`);
    for (const { rule: r, code, message } of p.rules) {
      L.push(`  if (${code ?? `thunderUntranslated(${JSON.stringify(message)})`}) return ${JSON.stringify(r.result)};`);
    }
    L.push(`  return ${JSON.stringify(p.decision.default ?? null)};`, '}');
  }
  return L.join('\n');
}

// Compile one planned (fully translated) decision to a runnable function.
function compileDecisionFn(p) {
  const body = p.rules.map(({ rule: r, code }) => `if (${code}) return ${JSON.stringify(r.result)};`);
  body.push(`return ${JSON.stringify(p.decision.default ?? null)};`);
  return new Function(...p.names, body.join('\n'));
}

/**
 * Run every decision test case through the generated code.
 * Returns { status: 'ok', results: { "Test / case": {status:'ok', value} | {status:'error', kind, message} } }.
 */
export function runTypescriptTarget(ast) {
  const { plans, cases, refused } = prepareRun(ast, { translate: exprToJs, target: 'TypeScript', dialect: 'js-runtime' });
  const results = { ...refused };
  const fns = new Map();
  for (const c of cases) {
    const p = plans.get(c.fn);
    if (!fns.has(c.fn)) {
      try { fns.set(c.fn, { fn: compileDecisionFn(p) }); }
      catch (e) { fns.set(c.fn, { error: `TypeScript could not compile the generated decision ${c.fn}: ${e.message}` }); }
    }
    const compiled = fns.get(c.fn);
    if (compiled.error) { results[c.key] = errorResult('compile-failed', compiled.error); continue; }
    const args = p.names.map((n) => (c.moneyArgs[n] != null ? c.moneyArgs[n] : c.given[n]));
    try { results[c.key] = okResult(compiled.fn(...args)); }
    catch (e) { results[c.key] = errorResult('runtime-error', `The generated TypeScript threw while running ${c.key}: ${e && e.message ? e.message : e}`); }
  }
  return { status: 'ok', results };
}
