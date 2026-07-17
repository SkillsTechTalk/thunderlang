// Mutation testing for ThunderLang decisions. Inject small, deterministic faults into a
// decision's rules, re-run the in-file tests, and check whether they catch the change. A mutant
// that no test detects (SURVIVED) marks a weak spot , tests that pass but do not protect the
// system, exactly the failure mode of AI-authored tests.
import { runTests } from './testing.mjs';

const FLIP = { '>=': '<', '<=': '>', '>': '<=', '<': '>=', '==': '!=', '!=': '==' };
const clone = (x) => JSON.parse(JSON.stringify(x));
const withDecisions = (ast, decisions) => ({ ...ast, decisions });
const passingSet = (ast) => new Set(runTests(ast).results.filter((x) => x.pass).map((x) => `${x.target}/${x.case}`));

// Generate one mutant per (rule, operator). Each returns a mutated AST plus a description.
function mutants(ast) {
  const out = [];
  const decs = ast.decisions || [];
  decs.forEach((dec, di) => {
    (dec.rules || []).forEach((rule, ri) => {
      const tag = rule.name || `rule ${ri + 1}`;
      if (rule.when) {
        const m = rule.when.match(/(>=|<=|==|!=|>|<)/);
        if (m) { const md = clone(decs); md[di].rules[ri].when = rule.when.replace(m[1], FLIP[m[1]]); out.push({ id: `${dec.name}/${tag}/flip`, describe: `flip ${m[1]} in ${tag} of ${dec.name}`, ast: withDecisions(ast, md) }); }
        if (/\band\b/.test(rule.when)) { const md = clone(decs); md[di].rules[ri].when = rule.when.replace(/\band\b/, 'or'); out.push({ id: `${dec.name}/${tag}/and-or`, describe: `and -> or in ${tag} of ${dec.name}`, ast: withDecisions(ast, md) }); }
      }
      if (rule.result != null && dec.default != null && rule.result !== dec.default) {
        const md = clone(decs); md[di].rules[ri].result = dec.default;
        out.push({ id: `${dec.name}/${tag}/swap-return`, describe: `${tag} returns the default instead of ${rule.result}`, ast: withDecisions(ast, md) });
      }
      { const md = clone(decs); md[di].rules.splice(ri, 1); out.push({ id: `${dec.name}/${tag}/remove`, describe: `remove ${tag} from ${dec.name}`, ast: withDecisions(ast, md) }); }
    });
  });
  return out;
}

export function runMutations(ast) {
  const base = passingSet(ast);
  if (base.size === 0) return { schema: 'thunder-mutation-v1', total: 0, killed: 0, survived: 0, score: null, note: 'no passing decision tests to mutate against', results: [] };
  const results = mutants(ast).map((mu) => {
    const now = passingSet(mu.ast);
    // Killed if any test that passed on the original now fails on the mutant.
    const killed = [...base].some((k) => !now.has(k));
    return { id: mu.id, describe: mu.describe, killed };
  });
  const killed = results.filter((r) => r.killed).length;
  const survived = results.length - killed;
  return { schema: 'thunder-mutation-v1', total: results.length, killed, survived, score: results.length ? Math.round((killed / results.length) * 100) : null, results };
}
