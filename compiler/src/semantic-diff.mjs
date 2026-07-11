// Semantic diff over the Intent Graph (founder directive #4, IL owns diff/merge). Diff
// two versions of a graph/atlas BY MEANING: nodes added/removed/changed, relationships
// added/removed, and , the load-bearing feature , which approvals a change invalidates.
// Deterministic; pure (no Node deps).

// Content identity of a node (ignores volatile timestamps).
const contentKey = (n) => JSON.stringify({
  type: n.type, title: n.title ?? null, description: n.description ?? null,
  status: n.status ?? null, owner: n.owner ?? null,
  classification: n.classification ?? null, confidence: n.confidence ?? null,
});
const relKey = (r) => `${r.from}|${r.type}|${r.to}`;
const CONTRACT_RELS = new Set(['requires', 'constrained_by', 'targets', 'measured_by']);

/**
 * Semantic diff of two Intent Graphs (or Atlases). Deterministic.
 * @param {{nodes, relationships}} before
 * @param {{nodes, relationships}} after
 */
export function diffGraphs(before, after) {
  const bNodes = new Map((before.nodes || []).map((n) => [n.id, n]));
  const aNodes = new Map((after.nodes || []).map((n) => [n.id, n]));

  const addedNodes = [];
  const removedNodes = [];
  const changedNodes = [];
  for (const [id, n] of aNodes) if (!bNodes.has(id)) addedNodes.push(n);
  for (const [id, n] of bNodes) if (!aNodes.has(id)) removedNodes.push(n);
  for (const [id, an] of aNodes) {
    const bn = bNodes.get(id);
    if (bn && contentKey(bn) !== contentKey(an)) changedNodes.push({ id, type: an.type, before: bn, after: an });
  }
  addedNodes.sort((a, b) => a.id.localeCompare(b.id));
  removedNodes.sort((a, b) => a.id.localeCompare(b.id));
  changedNodes.sort((a, b) => a.id.localeCompare(b.id));

  const bRel = new Set((before.relationships || []).map(relKey));
  const aRel = new Set((after.relationships || []).map(relKey));
  const addedRelationships = (after.relationships || []).filter((r) => !bRel.has(relKey(r)));
  const removedRelationships = (before.relationships || []).filter((r) => !aRel.has(relKey(r)));

  // Which approvals does this change invalidate? An approval is invalidated when its
  // mission's contract (requires / constrained_by / targets / measured_by nodes) changed.
  const changedIds = new Set([...addedNodes.map((n) => n.id), ...removedNodes.map((n) => n.id), ...changedNodes.map((c) => c.id)]);
  const missionContract = {};
  const missionApprovals = {};
  for (const r of after.relationships || []) {
    if (!r.from.startsWith('mission.')) continue;
    if (CONTRACT_RELS.has(r.type)) (missionContract[r.from] ||= new Set()).add(r.to);
    if (r.type === 'approved_by') (missionApprovals[r.from] ||= []).push(r.to);
  }
  const invalidatedApprovals = [];
  for (const [mission, contractIds] of Object.entries(missionContract)) {
    const contractChanged = changedIds.has(mission) || [...contractIds].some((id) => changedIds.has(id));
    if (contractChanged) for (const ap of missionApprovals[mission] || []) invalidatedApprovals.push(ap);
  }

  const byType = (arr) => arr.reduce((m, n) => ((m[n.type] = (m[n.type] || 0) + 1), m), {});
  return {
    schema: 'intent-diff-v1',
    addedNodes, removedNodes, changedNodes,
    addedRelationships, removedRelationships,
    invalidatedApprovals: [...new Set(invalidatedApprovals)].sort(),
    summary: {
      added: addedNodes.length, removed: removedNodes.length, changed: changedNodes.length,
      addedByType: byType(addedNodes), removedByType: byType(removedNodes),
      relationshipsAdded: addedRelationships.length, relationshipsRemoved: removedRelationships.length,
      approvalsInvalidated: [...new Set(invalidatedApprovals)].length,
    },
  };
}
