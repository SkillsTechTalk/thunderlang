// Semantic coverage , meaning-level metrics, not line coverage. Answers "which goals, decision
// rules, guarantees, prohibitions, scenarios, and targets are actually exercised by the tests?"
// so "12 of 15 prohibitions challenged" is far more useful than "82% line coverage".
import { runTests } from './testing.mjs';

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function semanticCoverage(ast) {
  const t = runTests(ast);
  const metrics = [];
  const unverified = [];
  const add = (name, covered, total, missing = []) => {
    metrics.push({ name, covered, total, pct: total ? Math.round((covered / total) * 100) : 100 });
    for (const m of missing) unverified.push(m);
  };

  // Goal
  if (ast.mission) add('Goals', ast.goal ? 1 : 0, 1, ast.goal ? [] : ['goal , the mission declares no goal']);

  // Decision rules matched by at least one test case (branch coverage for decisions)
  const matched = new Set((t.results || []).map((r) => r.matched).filter(Boolean));
  const rules = (ast.decisions || []).flatMap((d) => (d.rules || []).filter((r) => r.name).map((r) => ({ dec: d.name, name: r.name })));
  add('Decision rules', rules.filter((r) => matched.has(r.name)).length, rules.length,
    rules.filter((r) => !matched.has(r.name)).map((r) => `rule ${r.dec}/${r.name} , never matched by a test`));

  // Guarantees that carry a verification
  const g = ast.guarantees || [];
  add('Guarantees', g.filter((x) => (x.verify || []).length).length, g.length,
    g.filter((x) => !(x.verify || []).length).map((x) => `guarantee ${x.id} , no verification`));

  // Prohibitions challenged (a `never` with a verification)
  const n = ast.neverRules || [];
  add('Prohibitions', n.filter((x) => (x.verify || []).length).length, n.length,
    n.filter((x) => !(x.verify || []).length).map((x) => `never ${x.id} , not challenged`));

  // Scenarios that are self-consistent (not both expected and prohibited)
  const sc = ast.scenarios || [];
  if (sc.length) {
    const consistent = sc.filter((s) => {
      const nv = new Set((s.never || []).map(norm));
      return ![...(s.then || []), ...(s.eventually || []).flatMap((e) => e.clauses)].some((p) => nv.has(norm(p)));
    });
    add('Scenarios', consistent.length, sc.length, sc.filter((s) => !consistent.includes(s)).map((s) => `scenario ${s.name} , self-contradictory`));
  }

  // Targets exercised by conformance (needs `thunder conform --results`; 0 until then)
  const tg = ast.targets || [];
  if (tg.length) add('Targets tested', 0, tg.length, tg.map((x) => `target ${x} , not conformance-tested`));

  const totalCovered = metrics.reduce((a, m) => a + m.covered, 0);
  const totalAll = metrics.reduce((a, m) => a + m.total, 0);
  return {
    schema: 'thunder-coverage-v1', mission: ast.mission, metrics, unverified,
    overall: totalAll ? Math.round((totalCovered / totalAll) * 100) : 100,
  };
}
