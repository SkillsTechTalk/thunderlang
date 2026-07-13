// Intent Scanner (intent-scan-v1) , the staged pipeline that turns a project into Intent IR +
// explainable Fable findings + a risk view. This is the Scanner SPINE: discover -> normalize into
// Intent IR -> run deterministic Fable rules -> produce findings -> group into risk themes ->
// report. Deterministic (no AI, no key required); the whole thing runs locally. Pure ESM.
//
//   scanIntent(source, { file }) -> per-file scan result (IR + findings + risks)
//   scanProject([{ file, source }]) -> whole-project scan (merged IR + findings + executive summary)

import { parseIntent } from './parse.mjs';
import { buildIntentGraph } from './intent-graph.mjs';
import { semanticDiagnostics } from './emit.mjs';
import { graphToIR } from './intent-ir.mjs';
import { toFinding, RISK_CATEGORIES } from './fable.mjs';

export const SCAN_SCHEMA = 'intent-scan-v1';

const severityRank = { blocker: 0, error: 1, warning: 2, info: 3 };

// Group findings into risk themes: one entry per risk category that has findings.
function groupRisks(findings) {
  const byCat = new Map();
  for (const f of findings) {
    const c = byCat.get(f.category) || { category: f.category, count: 0, blocker: 0, error: 0, warning: 0, info: 0, findingIds: [] };
    c.count += 1;
    c[f.severity] = (c[f.severity] || 0) + 1;
    c.findingIds.push(f.findingId);
    byCat.set(f.category, c);
  }
  // ordered by the canonical risk taxonomy, then severity weight
  return [...byCat.values()].sort((a, b) => RISK_CATEGORIES.indexOf(a.category) - RISK_CATEGORIES.indexOf(b.category));
}

const countBySeverity = (findings) => findings.reduce((m, f) => ((m[f.severity] = (m[f.severity] || 0) + 1), m), { blocker: 0, error: 0, warning: 0, info: 0 });

/** Scan one intent source into Intent IR + Fable findings + risk themes. */
export function scanIntent(source, { file = null } = {}) {
  const ast = parseIntent(String(source ?? ''));
  const graph = buildIntentGraph(ast);
  const ir = graphToIR(graph);
  const missionNodeId = graph.nodes.find((n) => n.type === 'Mission')?.id;
  const diags = semanticDiagnostics(ast);
  const findings = diags.map((d, i) => toFinding(d, { file, index: i, affectedNodes: missionNodeId ? [missionNodeId] : [] }));
  const risks = groupRisks(findings);
  const bySeverity = countBySeverity(findings);
  return {
    schema: SCAN_SCHEMA,
    file,
    mission: ast.mission || null,
    ir,
    findings,
    risks,
    summary: { file, mission: ast.mission || null, findings: findings.length, bySeverity, ok: bySeverity.error === 0 && bySeverity.blocker === 0 },
  };
}

/** Scan a whole project: merge each file's IR + findings, plus an executive summary. */
export function scanProject(files) {
  const perFile = [];
  const allFindings = [];
  const irNodes = [];
  const irRels = [];
  const seenNodeIds = new Set();
  for (const { file, source } of files || []) {
    const r = scanIntent(source, { file });
    perFile.push(r.summary);
    allFindings.push(...r.findings);
    for (const n of r.ir.nodes) { const key = `${file}:${n.id}`; if (!seenNodeIds.has(key)) { seenNodeIds.add(key); irNodes.push({ ...n, id: `${file ? `${file}#` : ''}${n.id}` }); } }
    for (const e of r.ir.relationships) irRels.push({ ...e, from: `${file ? `${file}#` : ''}${e.from}`, to: `${file ? `${file}#` : ''}${e.to}` });
  }
  const risks = groupRisks(allFindings);
  const bySeverity = countBySeverity(allFindings);
  // Highest-impact remediation sequence: blocker > error > warning, most-common rule first.
  const byRule = new Map();
  for (const f of allFindings) { const k = f.ruleId; const e = byRule.get(k) || { ruleId: k, category: f.category, severity: f.severity, count: 0, remediation: f.remediation }; e.count += 1; byRule.set(k, e); }
  const remediationSequence = [...byRule.values()].sort((a, b) => (severityRank[a.severity] - severityRank[b.severity]) || (b.count - a.count)).slice(0, 10);
  return {
    schema: SCAN_SCHEMA,
    totals: { files: perFile.length, missions: perFile.filter((f) => f.mission).length, findings: allFindings.length },
    bySeverity,
    risks,
    remediationSequence,
    ir: { schema: 'intent-ir-v1', embeds: 'intent-graph-v1', nodes: irNodes, relationships: irRels },
    files: perFile,
    findings: allFindings,
    ok: bySeverity.error === 0 && bySeverity.blocker === 0,
  };
}
