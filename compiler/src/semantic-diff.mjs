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
  void relKey; // (used by mergeGraphs below)
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

/**
 * Three-way semantic merge over the Intent Graph. Given a common `base` and two
 * concurrent versions `ours` / `theirs`, produce the merged graph and the list of
 * CONFLICTS (the same node changed differently on both sides). Deterministic; the side
 * that changed a node from base wins; if both changed it differently, it is a conflict
 * (merged keeps `ours` provisionally). Node identity is the stable id; equality is content.
 */
export function mergeGraphs(base, ours, theirs) {
  const key = (n) => (n ? contentKey(n) : 'MISSING');
  const bN = new Map((base?.nodes || []).map((n) => [n.id, n]));
  const oN = new Map((ours?.nodes || []).map((n) => [n.id, n]));
  const tN = new Map((theirs?.nodes || []).map((n) => [n.id, n]));

  const ids = [...new Set([...bN.keys(), ...oN.keys(), ...tN.keys()])].sort();
  const merged = new Map();
  const conflicts = [];
  for (const id of ids) {
    const b = bN.get(id) || null;
    const o = oN.get(id) || null;
    const t = tN.get(id) || null;
    const oChanged = key(o) !== key(b);
    const tChanged = key(t) !== key(b);
    if (!oChanged && !tChanged) { if (b) merged.set(id, b); continue; }        // untouched (or both removed)
    if (oChanged && !tChanged) { if (o) merged.set(id, o); continue; }         // only ours
    if (!oChanged && tChanged) { if (t) merged.set(id, t); continue; }         // only theirs
    if (key(o) === key(t)) { if (o) merged.set(id, o); continue; }             // both made the same change
    conflicts.push({ id, type: (o || t || b).type, base: b, ours: o, theirs: t }); // both changed differently
    if (o) merged.set(id, o); else if (t) merged.set(id, t);                   // keep ours provisionally
  }

  // Relationships (presence booleans): whoever changed presence from base wins.
  const bR = new Set((base?.relationships || []).map(relKey));
  const oR = new Set((ours?.relationships || []).map(relKey));
  const tR = new Set((theirs?.relationships || []).map(relKey));
  const byKey = new Map();
  for (const r of [...(ours?.relationships || []), ...(theirs?.relationships || []), ...(base?.relationships || [])]) byKey.set(relKey(r), r);
  const mergedRels = [];
  for (const [k, r] of byKey) {
    const inB = bR.has(k), inO = oR.has(k), inT = tR.has(k);
    const present = inO !== inB ? inO : inT; // ours changed presence -> ours; else theirs
    if (present) mergedRels.push(r);
  }
  mergedRels.sort((a, b2) => relKey(a).localeCompare(relKey(b2)));

  return {
    schema: 'intent-merge-v1',
    merged: { nodes: [...merged.values()].sort((a, b2) => a.id.localeCompare(b2.id)), relationships: mergedRels },
    conflicts: conflicts.sort((a, b2) => a.id.localeCompare(b2.id)),
    clean: conflicts.length === 0,
    summary: { nodes: merged.size, relationships: mergedRels.length, conflicts: conflicts.length },
  };
}
