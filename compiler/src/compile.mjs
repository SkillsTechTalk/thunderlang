// Pure, in-memory compile entrypoint shared by the CLI (writes to disk) and the
// web playground (returns artifacts as strings). No filesystem, no AI.
// Deterministic given a fixed `generatedAt`.

import { parseIntent, slug } from './parse.mjs';
import {
  buildContractGraph, buildArchitectureGraph, buildImplementationPlan,
  semanticDiagnostics, buildProof, sha256,
} from './emit.mjs';

export function renderMarkdown(ast) {
  const L = [];
  L.push(`# ${ast.mission}`, '');
  if (ast.goal) L.push(`**Goal.** ${ast.goal}`, '');
  if (ast.why) L.push(`**Why.** ${ast.why}`, '');
  if (ast.guarantees.length) {
    L.push('## Guarantees', '');
    for (const g of ast.guarantees) L.push(`- ${g.statement}${g.because ? ` (because ${g.because})` : ''}`);
    L.push('');
  }
  if (ast.neverRules.length) {
    L.push('## Never', '');
    for (const n of ast.neverRules) L.push(`- ${n.statement}${n.because ? ` (because ${n.because})` : ''}`);
    L.push('');
  }
  if (ast.verify.length) { L.push('## Verification', ''); for (const v of ast.verify) L.push(`- ${v}`); L.push(''); }
  return L.join('\n');
}

export function renderMermaid(ast) {
  const L = ['graph TD'];
  const m = slug(ast.mission || 'mission');
  L.push(`  ${m}["${ast.mission}"]`);
  ast.guarantees.forEach((g, i) => L.push(`  ${m} --> g${i}["guarantee: ${g.statement}"]`));
  ast.neverRules.forEach((n, i) => L.push(`  ${m} --> n${i}["never: ${n.statement}"]`));
  ast.events.forEach((e) => L.push(`  ${m} --> ev_${e.id}(["event: ${e.name}"])`));
  return L.join('\n') + '\n';
}

export function renderTestplan(ast) {
  const L = [`# Test plan: ${ast.mission}`, ''];
  for (const g of ast.guarantees) L.push(`- [ ] Guarantee holds: ${g.statement}${g.verify.length ? ` (via ${g.verify.join(', ')})` : ''}`);
  for (const n of ast.neverRules) L.push(`- [ ] Never occurs: ${n.statement}${n.verify.length ? ` (via ${n.verify.join(', ')})` : ''}`);
  for (const v of ast.verify) L.push(`- [ ] ${v}`);
  return L.join('\n') + '\n';
}

/**
 * Compile IntentLang source in memory and return every artifact `intent build`
 * would emit, without touching the filesystem.
 */
export function compileSource(source, { sourceFile = 'playground.intent', generatedAt } = {}) {
  const ast = parseIntent(source);
  const at = generatedAt || new Date().toISOString();
  const sourceHash = sha256(source);
  const diagnostics = semanticDiagnostics(ast);

  const contractGraph = buildContractGraph(ast, at);
  const architectureGraph = buildArchitectureGraph(ast, at);
  const implementationPlan = buildImplementationPlan(ast, at);
  const markdown = renderMarkdown(ast);
  const mermaid = renderMermaid(ast);
  const testplan = renderTestplan(ast);

  const mission = ast.mission || 'mission';
  const targetsGenerated = [
    'contract-graph.json', 'architecture-graph.json', 'implementation-plan.json',
    `${slug(mission)}.md`, `${slug(mission)}.mmd`, `${slug(mission)}.testplan.md`,
  ];
  const proof = buildProof(ast, {
    sourceFile, sourceHash, generatedAt: at,
    targetsRequested: ast.targets, targetsGenerated, diagnostics,
  });

  return {
    mission,
    diagnostics,
    artifacts: {
      markdown, mermaid, testplan,
      contractGraph, architectureGraph, implementationPlan, proof,
    },
  };
}
