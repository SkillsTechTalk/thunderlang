import { runTests } from './testing.mjs';

// One binding policy for CLI, MCP, website, and embedding products. A reference
// names a complete test target, not a substring, prose description, or similar name.
// "verified" is scoped to the declared cases; it says nothing about application code.
export function resolveObligations(ast) {
  const tests = runTests(ast);
  const byTarget = new Map();
  for (const result of tests.results) {
    const name = String(result.target).trim();
    const previous = byTarget.get(name);
    byTarget.set(name, { name, pass: (previous?.pass ?? true) && result.pass, cases: (previous?.cases ?? 0) + 1 });
  }
  const build = (kind, claim) => {
    const verify = claim.verify || [];
    const names = [...new Set(verify.map((v) => String(v).trim()))];
    const evidence = names.map((name) => byTarget.get(name) || (name.startsWith('test ') ? byTarget.get(name.slice(5).trim()) : null) || { name, pass: null, cases: 0 });
    const unresolved = evidence.filter((e) => e.pass === null).map((e) => e.name);
    const status = !names.length ? 'unverified'
      : evidence.some((e) => e.pass === false) ? 'failed'
      : unresolved.length ? 'declared' : 'verified';
    return {
      kind, id: claim.id, text: claim.statement, status, verify,
      kinds: [...new Set((claim.verifications || []).map((v) => v.kind).filter((k) => k && k !== 'unclassified'))],
      provenBy: status === 'verified' || status === 'failed' ? evidence.filter((e) => e.pass !== null).map((e) => e.name).join(', ') : null,
      evidence, unresolved,
    };
  };
  const obligations = [
    ...(ast.guarantees || []).map((g) => build('guarantee', g)),
    ...(ast.neverRules || []).map((n) => build('prohibition', n)),
  ];
  const count = (s) => obligations.filter((o) => o.status === s).length;
  return { obligations, tests, verified: count('verified'), declared: count('declared'), unverified: count('unverified'), failed: count('failed') };
}
