// Cross-target conformance. The deterministic engine defines the canonical contract (what every
// target must produce for each test case); target outputs , executed live or fed via results , are
// graded against it. A target case that diverges is a CONFORMANCE FAILURE. Same tests, every
// implementation.
//
// A target result is either a plain value (fed via --results) or a structured case result from a
// live run ({ status: 'ok', value } | { status: 'error', kind, message }). An error is graded as
// 'error' with its kind and message , not translated, compile failure, crash, timeout , and counts
// as a failure. It is never compared as if it were a null answer.
import { runTests } from './testing.mjs';
import { isCaseResult } from './target-result.mjs';

export function buildConformance(ast, { targets = [], results = null } = {}) {
  const sem = runTests(ast);
  const cases = (sem.results || []).map((r) => ({
    key: `${r.target} / ${r.case}`, test: r.target, case: r.case,
    inputs: r.inputs || {}, expected: r.expected, semantic: r.actual, semanticPass: !!r.pass,
  }));
  const columns = (targets.length ? targets : (ast.targets || [])).map((t) => String(t).toLowerCase());
  const rows = cases.map((c) => {
    const t = {};
    for (const col of columns) {
      const tr = results && results[col];
      if (!tr || !(c.key in tr)) { t[col] = { status: 'declared' }; continue; }
      const raw = tr[c.key];
      if (isCaseResult(raw) && raw.status === 'error') { t[col] = { status: 'error', kind: raw.kind, message: raw.message }; continue; }
      const actual = isCaseResult(raw) ? raw.value : raw;
      t[col] = { status: String(actual) === String(c.expected) ? 'pass' : 'fail', actual };
    }
    return { ...c, targets: t };
  });
  const failures = [];
  for (const row of rows) for (const col of columns) {
    const tr = row.targets[col];
    if (tr.status === 'fail') failures.push({ target: col, case: row.key, expected: row.expected, actual: tr.actual, kind: 'assertion-failed' });
    if (tr.status === 'error') failures.push({ target: col, case: row.key, expected: row.expected, kind: tr.kind, message: tr.message });
  }
  return {
    schema: 'thunder-conformance-v1', mission: ast.mission,
    total: cases.length, columns,
    semanticFailures: cases.filter((c) => !c.semanticPass).length,
    graded: !!results, failures, cases: rows,
  };
}
