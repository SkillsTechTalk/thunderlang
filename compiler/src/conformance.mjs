// Cross-target conformance. ThunderLang can't execute generated TypeScript/Python, so it does
// the honest thing: the deterministic engine defines the canonical contract (what every target
// must produce for each test case), and target outputs fed via results are graded against it.
// A target case that diverges is a CONFORMANCE FAILURE. Same tests, every implementation.
import { runTests } from './testing.mjs';

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
      const actual = tr[c.key];
      t[col] = { status: String(actual) === String(c.expected) ? 'pass' : 'fail', actual };
    }
    return { ...c, targets: t };
  });
  const failures = [];
  for (const row of rows) for (const col of columns) {
    const tr = row.targets[col];
    if (tr.status === 'fail') failures.push({ target: col, case: row.key, expected: row.expected, actual: tr.actual });
  }
  return {
    schema: 'thunder-conformance-v1', mission: ast.mission,
    total: cases.length, columns,
    semanticFailures: cases.filter((c) => !c.semanticPass).length,
    graded: !!results, failures, cases: rows,
  };
}
