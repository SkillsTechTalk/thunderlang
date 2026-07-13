// First-class tests , make a .intent file SELF-VERIFYING. A `test <target>` block declares
// cases (for a decision) or scenarios (for a lifecycle) right next to the intent they check.
// `runTests` executes them through the deterministic Intent Runtime: no AI, no code, the
// spec proves itself. This is what lets intent be trustworthy , the behavior is asserted.

import { slug } from './parse.mjs';
import { evaluateDecision, simulateLifecycle } from './runtime.mjs';

export const TEST_SCHEMA = 'intent-test-v1';

// Coerce declared `given` values: numeric-looking -> number, true/false -> boolean, else
// string. A value wrapped in matching quotes is treated as a string with the quotes stripped,
// so `given severity "high"` and `given severity high` behave identically.
function coerce(given) {
  const out = {};
  for (const [k, raw] of Object.entries(given || {})) {
    const v = String(raw).trim();
    const quoted = v.length >= 2 && ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'"));
    if (quoted) out[k] = v.slice(1, -1);
    else if (v === 'true' || v === 'false') out[k] = v === 'true';
    else if (v !== '' && !isNaN(Number(v))) out[k] = Number(v);
    else out[k] = v;
  }
  return out;
}

/**
 * Run every `test` block in an AST against its target decision or lifecycle.
 * @returns {{schema, total, passed, failed, results, ok}}
 */
export function runTests(ast) {
  const decisions = ast.decisions || [];
  const lifecycles = ast.lifecycles || [];
  const results = [];

  for (const t of ast.tests || []) {
    const dec = decisions.find((d) => slug(d.name) === slug(t.name || ''));
    const lc = lifecycles.find((l) => slug(l.name) === slug(t.name || ''));
    for (const c of t.cases) {
      const label = { target: t.name, case: c.name || `case ${results.length + 1}` };
      if (dec) {
        const inputs = coerce(c.given);
        const run = evaluateDecision(dec, inputs);
        const pass = c.expect == null || String(run.result) === String(c.expect);
        results.push({ ...label, kind: 'decision', expected: c.expect, actual: run.result, pass, ...(run.ok ? {} : { note: 'a condition failed to evaluate' }) });
      } else if (lc) {
        const sim = simulateLifecycle(lc, c.events || []);
        const passState = c.expect == null || sim.finalState === c.expect;
        const passValid = c.expectValid == null || sim.valid === c.expectValid;
        results.push({ ...label, kind: 'lifecycle', expected: c.expect, actual: sim.finalState, valid: sim.valid, expectValid: c.expectValid, pass: passState && passValid });
      } else {
        results.push({ ...label, kind: 'unknown', pass: false, error: `no decision or lifecycle named "${t.name}"` });
      }
    }
  }

  const passed = results.filter((r) => r.pass).length;
  return { schema: TEST_SCHEMA, total: results.length, passed, failed: results.length - passed, results, ok: passed === results.length };
}
