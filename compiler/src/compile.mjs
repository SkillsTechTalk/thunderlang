// Pure, in-memory compile entrypoint shared by the CLI (writes to disk) and the
// web playground (returns artifacts as strings). No filesystem, no AI.
// Deterministic given a fixed `generatedAt`.

import { parseIntent, slug, subjectName } from './parse.mjs';
import {
  buildContractGraph, buildArchitectureGraph, buildImplementationPlan,
  semanticDiagnostics, buildProof, sha256,
} from './emit.mjs';

export function renderMarkdown(ast) {
  const L = [];
  L.push(`# ${subjectName(ast) || 'Untitled intent'}`, '');
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

/**
 * Render a mission as Markdown documentation for ONE audience, weaving that lens's
 * IntentLens notes inline next to the mission element they annotate. Notes explain
 * meaning; they are never verification, and the doc says so. Pure and browser-safe.
 */
export function renderLensDoc(ast, lens) {
  const m = ast.mission || 'mission';
  const prefix = `mission.${m}`;
  const flat = (t) => String(t).replace(/\s+/g, ' ').trim();
  const notesFor = (path) => (ast.notes || []).filter((n) => n.lens === lens && n.targetPath === path);
  const L = [];
  L.push(`# ${m} , for the ${lens} reader`, '');
  L.push(`> IntentLens \`${lens}\` notes are woven in below. They explain meaning for this`,
    `> audience; they are documentation, not verification.`, '');
  for (const nt of notesFor(prefix)) L.push(`_${flat(nt.text)}_`, '');
  if (ast.goal) L.push(`**Goal.** ${ast.goal}`, '');
  if (ast.why) L.push(`**Why.** ${ast.why}`, '');
  const fieldSection = (title, fields, kind) => {
    if (!fields.length) return;
    L.push(`## ${title}`, '');
    for (const f of fields) {
      L.push(`- \`${f.name}: ${f.type}\``);
      for (const nt of notesFor(`${prefix}.${kind}.${f.name}`)) L.push(`  , ${flat(nt.text)}`);
    }
    L.push('');
  };
  fieldSection('Inputs', ast.inputs, 'input');
  fieldSection('Outputs', ast.outputs, 'output');
  const ruleSection = (title, rules, kind) => {
    if (!rules.length) return;
    L.push(`## ${title}`, '');
    for (const r of rules) {
      L.push(`- ${r.statement}${r.because ? ` (because ${r.because})` : ''}`);
      for (const nt of notesFor(`${prefix}.${kind}.${r.id}`)) L.push(`  , ${flat(nt.text)}`);
    }
    L.push('');
  };
  ruleSection('Guarantees', ast.guarantees, 'guarantee');
  ruleSection('Never', ast.neverRules, 'never');
  const count = (ast.notes || []).filter((n) => n.lens === lens).length;
  L.push('---', `${count} \`${lens}\` note${count === 1 ? '' : 's'} in this mission.`);
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
  for (const e of ast.errors || []) L.push(`- [ ] Failure mode handled: ${e.name}`);
  for (const ex of ast.examples || []) L.push(`- [ ] Example: given ${ex.given}${ex.expect ? ` -> expect ${ex.expect}` : ''}`);
  for (const v of ast.verify) L.push(`- [ ] ${v}`);
  return L.join('\n') + '\n';
}

/**
 * Compile IntentLang source in memory and return every artifact `intent build`
 * would emit, without touching the filesystem.
 */
export function compileSource(source, { sourceFile = 'playground.intent', generatedAt, origin = 'authored' } = {}) {
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
    sourceFile, sourceHash, generatedAt: at, origin,
    targetsRequested: ast.targets, targetsGenerated, diagnostics,
  });

  return {
    mission,
    origin,
    diagnostics,
    notes: ast.notes || [],
    artifacts: {
      markdown, mermaid, testplan,
      contractGraph, architectureGraph, implementationPlan, proof,
    },
  };
}
