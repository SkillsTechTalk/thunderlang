// Intent Simulator (intent-simulate-v1) , estimate the impact of a proposed change BEFORE it is
// implemented. Where Intent Guardian reports drift AFTER a change, the Simulator runs it forward on
// a hypothetical: given a base and a proposed intent, it computes the blast radius (which nodes the
// change transitively touches), the risk it would introduce, contradictions, and release risk , and
// it clearly SEPARATES deterministic dependency impact from rule-derived risk from unknown impact,
// per the directive. Deterministic, no AI. Composes the shared spine (diffGraphs + scanProject +
// the Intent Graph). Pure ESM.
//
//   simulateChange(baseFiles, proposedFiles) -> an impact estimate

import { parseIntent } from './parse.mjs';
import { buildIntentGraph } from './intent-graph.mjs';
import { diffGraphs } from './semantic-diff.mjs';
import { scanProject } from './scan.mjs';
import { isFactual } from './classification.mjs';

export const SIMULATE_SCHEMA = 'intent-simulate-v1';

function mergedGraph(files) {
  const nodes = []; const relationships = []; const seen = new Set();
  for (const { source } of files || []) {
    const g = buildIntentGraph(parseIntent(String(source ?? '')));
    for (const n of g.nodes) if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); }
    relationships.push(...g.relationships);
  }
  return { nodes, relationships };
}

// Transitive reach from the changed nodes over the (undirected) relationship graph, bounded by
// depth , the deterministic dependency blast radius. Returns a Set of affected node ids.
function blastRadius(graph, changedIds, maxDepth = 3) {
  const adj = new Map();
  const link = (a, b) => { (adj.get(a) ?? adj.set(a, new Set()).get(a)).add(b); };
  for (const r of graph.relationships || []) { link(r.from, r.to); link(r.to, r.from); }
  const reached = new Set(changedIds);
  let frontier = [...changedIds];
  for (let d = 0; d < maxDepth && frontier.length; d += 1) {
    const next = [];
    for (const id of frontier) for (const nb of adj.get(id) ?? []) if (!reached.has(nb)) { reached.add(nb); next.push(nb); }
    frontier = next;
  }
  return reached;
}

const groupByType = (nodes) => {
  const by = {};
  for (const n of nodes) (by[n.type] = by[n.type] || []).push({ id: n.id, title: n.title || null });
  return by;
};

/**
 * Estimate the impact of moving from `baseFiles` to `proposedFiles`.
 * @param {Array<{file:string,source:string}>} baseFiles
 * @param {Array<{file:string,source:string}>} proposedFiles
 */
export function simulateChange(baseFiles, proposedFiles) {
  const baseGraph = mergedGraph(baseFiles);
  const proposedGraph = mergedGraph(proposedFiles);
  const diff = diffGraphs(baseGraph, proposedGraph);

  // Union graph so reachability covers both removed (base) and added (proposed) nodes.
  const unionNodes = new Map();
  for (const n of [...baseGraph.nodes, ...proposedGraph.nodes]) if (!unionNodes.has(n.id)) unionNodes.set(n.id, n);
  const union = { nodes: [...unionNodes.values()], relationships: [...baseGraph.relationships, ...proposedGraph.relationships] };

  const changedIds = [...new Set([...diff.addedNodes.map((n) => n.id), ...diff.removedNodes.map((n) => n.id), ...diff.changedNodes.map((c) => c.id)])];
  const reached = blastRadius(union, changedIds);
  const affectedNodes = [...reached].map((id) => unionNodes.get(id)).filter(Boolean);
  // The impact set minus the directly-changed nodes = the DEPENDENTS the change ripples out to.
  const changedSet = new Set(changedIds);
  const dependents = affectedNodes.filter((n) => !changedSet.has(n.id));

  // Rule-derived risk: findings the proposed state has that the base did not.
  const baseScan = scanProject(baseFiles);
  const proposedScan = scanProject(proposedFiles);
  const baseKeys = new Set(baseScan.findings.map((f) => `${f.ruleId}|${f.detected}`));
  const introducedRisk = proposedScan.findings.filter((f) => !baseKeys.has(`${f.ruleId}|${f.detected}`));
  const contradictions = proposedScan.findings.filter((f) => f.category === 'Intent risk' && /IL-CONFLICT/.test(f.ruleId));
  const releaseRisks = introducedRisk.filter((f) => f.severity === 'blocker' || f.severity === 'error');

  // Unknown impact: changed nodes whose classification is not factual (the estimate is uncertain
  // there), and any changed node with no relationships (its ripple can't be traced deterministically).
  const linked = new Set(union.relationships.flatMap((r) => [r.from, r.to]));
  const unknownImpact = affectedNodes.filter((n) => (n.classification && !isFactual(n.classification)) || !linked.has(n.id))
    .map((n) => ({ id: n.id, type: n.type, reason: n.classification && !isFactual(n.classification) ? `${n.classification} , impact is uncertain` : 'no relationships , ripple cannot be traced deterministically' }));

  return {
    schema: SIMULATE_SCHEMA,
    changedNodes: changedIds.length,
    // deterministic dependency impact , what the change transitively touches, by type
    deterministicImpact: { total: dependents.length, byType: groupByType(dependents) },
    ruleDerivedRisk: introducedRisk,
    contradictions,
    releaseRisks,
    aiPredictedImpact: null, // not computed in deterministic mode (no AI); reserved for the Engine
    unknownImpact,
    summary: {
      changed: changedIds.length,
      dependentsAffected: dependents.length,
      introducedRisk: introducedRisk.length,
      releaseBlocking: releaseRisks.length,
      contradictions: contradictions.length,
      safe: releaseRisks.length === 0 && contradictions.length === 0,
    },
  };
}
