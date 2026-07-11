// The Intent Runtime , EXECUTABLE intent with zero AI and zero code generation. Decisions
// evaluate against concrete inputs; lifecycles simulate against a sequence of events. This
// is the step beyond prompt engineering: you write intent and you can immediately RUN it,
// TEST it, and PROVE how it behaves, before any implementation exists. Deterministic and
// pure , the same intent and inputs always produce the same result and the same trace.

import { compileExpr, ExprError } from './expr.mjs';
import { buildLifecycle } from './lifecycle.mjs';

export const RUNTIME_SCHEMA = 'intent-runtime-v1';

/**
 * Evaluate a declared decision (Gap 4) against a concrete inputs object. FIRST-hit: rules
 * are tried in order, the first whose `when` is true wins; the mission `default` is the
 * catch-all. Returns the result plus a full per-rule trace, so the evaluation is auditable.
 * A malformed `when` does not throw , it is recorded as an error in the trace and skipped.
 *
 * @returns {{schema, decision, result, matched, trace, ok}}
 */
export function evaluateDecision(dec, inputs = {}) {
  const trace = [];
  let result = null;
  let matched = null;
  for (const rule of dec.rules || []) {
    if (!rule.when) { trace.push({ rule: rule.name, when: null, matched: false, note: 'no condition' }); continue; }
    let ok = false; let error = null;
    try { ok = !!compileExpr(rule.when)(inputs); }
    catch (e) { error = e instanceof ExprError ? e.message : String(e); }
    trace.push({ rule: rule.name, when: rule.when, matched: ok, ...(error ? { error } : {}) });
    if (ok && matched === null) { result = rule.result; matched = rule.name; }
  }
  if (matched === null && dec.default != null) { result = dec.default; matched = 'default'; }
  return {
    schema: RUNTIME_SCHEMA,
    decision: dec.name,
    result,
    matched,
    undecided: matched === null,
    explanationRequired: !!dec.explanationRequired,
    trace,
    ok: trace.every((t) => !t.error),
  };
}

/**
 * Simulate a declared lifecycle (Gap 2) against a sequence of events. Each event is a
 * transition name OR a target-state name; from the current state we take the matching
 * transition. An event with no valid transition is recorded as rejected (the state does
 * not change). Returns the walked path, a per-step trace, and whether every step was valid.
 *
 * @returns {{schema, lifecycle, path, steps, finalState, valid, endedTerminal}}
 */
export function simulateLifecycle(lc, events = []) {
  const ir = buildLifecycle(lc);
  const terminals = new Set(ir.terminals.length ? ir.terminals : ir.states.filter((s) => (ir.out[s] || []).length === 0));
  let state = ir.initial;
  const path = [state];
  const steps = [];
  let valid = true;
  for (const ev of events) {
    const candidates = (ir.transitions || []).filter((t) => t.from === state && (t.name === ev || t.to === ev));
    if (candidates.length === 0) {
      valid = false;
      const reason = terminals.has(state) ? `state "${state}" is terminal` : `no transition "${ev}" from "${state}"`;
      steps.push({ event: ev, from: state, to: state, ok: false, reason });
      continue;
    }
    const t = candidates[0];
    steps.push({ event: ev, from: state, to: t.to, ok: true, transition: t.name });
    state = t.to;
    path.push(state);
  }
  return {
    schema: RUNTIME_SCHEMA,
    lifecycle: lc.name,
    path,
    steps,
    finalState: state,
    valid,
    endedTerminal: terminals.has(state),
  };
}

/**
 * Run a decision against a table of test cases (each {inputs, expect}). Returns pass/fail
 * per case , this turns a decision into a self-checking specification you can regression-test
 * with no code and no AI.
 */
export function checkDecisionCases(dec, cases = []) {
  const results = cases.map((c, i) => {
    const run = evaluateDecision(dec, c.inputs || {});
    const pass = c.expect === undefined || String(run.result) === String(c.expect);
    return { case: c.name || `case ${i + 1}`, inputs: c.inputs || {}, expected: c.expect, actual: run.result, matched: run.matched, pass };
  });
  return { schema: RUNTIME_SCHEMA, decision: dec.name, total: results.length, passed: results.filter((r) => r.pass).length, results };
}
