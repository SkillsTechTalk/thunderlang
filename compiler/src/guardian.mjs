// Intent Guardian (intent-guardian-v1) , continuous drift detection between an approved intent and
// the evolving one. Given a BEFORE and AFTER state, it answers the directive's question: "what
// changed, what intent could it affect, what risk did it introduce, what must be reverified, and
// what learning content should be refreshed?" Deterministic, no AI. It composes the shared spine:
// the semantic diff (diffGraphs) + the Intent Scanner (findings) over Intent IR. Pure ESM.
//
//   guardianReport(beforeFiles, afterFiles) -> a drift report
//   where each is [{ file, source }] (a single-file change is a one-element array).

import { diffGraphs } from './semantic-diff.mjs';
import { scanProject } from './scan.mjs';
import { parseIntent } from './parse.mjs';
import { buildIntentGraph } from './intent-graph.mjs';

export const GUARDIAN_SCHEMA = 'intent-guardian-v1';

// Merge a project's files into ONE graph keyed by mission-based node ids (NOT file paths), so a
// before/after comparison aligns by logical identity even across a rename. First id wins on dupes.
function mergedGraph(files) {
  const nodes = []; const relationships = []; const seen = new Set();
  for (const { source } of files || []) {
    const g = buildIntentGraph(parseIntent(String(source ?? '')));
    for (const n of g.nodes) if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); }
    relationships.push(...g.relationships);
  }
  return { nodes, relationships };
}
const dedupeById = (arr) => { const seen = new Set(); return arr.filter((x) => x && x.id && !seen.has(x.id) && seen.add(x.id)); };

const findingKey = (f) => `${f.ruleId}|${f.detected}`;
// Node types whose change invalidates verification / needs a human to re-confirm.
const REVERIFY_TYPES = new Set(['Guarantee', 'Never', 'VerificationRule', 'VerificationResult', 'OutcomeContract', 'Decision', 'Rule']);
const LEARNABLE_MISSION = (n) => n.type === 'Mission';

/**
 * Compare two project states and report the drift a change introduced.
 * @param {Array<{file:string, source:string}>} beforeFiles
 * @param {Array<{file:string, source:string}>} afterFiles
 */
export function guardianReport(beforeFiles, afterFiles) {
  const before = scanProject(beforeFiles || []);
  const after = scanProject(afterFiles || []);
  // Diff by mission-based identity (not file-prefixed scan ids) so before/after align logically.
  const diff = diffGraphs(mergedGraph(beforeFiles), mergedGraph(afterFiles));

  // Risk delta: findings present after but not before were introduced by the change; vice versa.
  const beforeKeys = new Set(before.findings.map(findingKey));
  const afterKeys = new Set(after.findings.map(findingKey));
  const introducedRisk = after.findings.filter((f) => !beforeKeys.has(findingKey(f)));
  const resolvedRisk = before.findings.filter((f) => !afterKeys.has(findingKey(f)));

  // What changed at the node level (added/removed/changed), and which of those need re-verification.
  const changedNodeIds = new Set([...diff.addedNodes.map((n) => n.id), ...diff.removedNodes.map((n) => n.id), ...diff.changedNodes.map((c) => c.id)]);
  const touched = dedupeById([...diff.addedNodes, ...diff.removedNodes, ...diff.changedNodes.map((c) => c.after || c.before)]);
  const mustReverify = touched
    .filter((n) => REVERIFY_TYPES.has(n.type))
    .map((n) => ({ id: n.id, type: n.type, title: n.title || null, reason: 'contract element changed , its verification no longer holds' }));
  for (const ap of diff.invalidatedApprovals || []) mustReverify.push({ id: ap, type: 'Approval', reason: 'the mission contract changed , this approval is invalidated' });

  // Learning freshness: any mission whose intent changed has lessons to refresh (Part 6). A mission
  // is affected if its own node changed OR any node under it (a guarantee/never/...) changed.
  const affectedMissions = dedupeById(touched.filter(LEARNABLE_MISSION));
  const nonMissionChanged = touched.some((n) => !LEARNABLE_MISSION(n));
  const missionTitles = affectedMissions.length ? affectedMissions : (nonMissionChanged ? after.ir.nodes.filter(LEARNABLE_MISSION).map((n) => ({ id: n.id, title: n.title })) : []);
  const staleLearning = dedupeById(missionTitles).map((m) => ({ scope: m.title || m.id, reason: 'a governing intent artifact changed , lessons for it may be stale' }));

  const introducedBlockers = introducedRisk.filter((f) => f.severity === 'blocker' || f.severity === 'error').length;
  // needs-attention only when the change INTRODUCED blocking risk (an improvement that merely adds
  // verification is `review`, not an alarm); `review` when anything changed; else `clear`.
  const verdict = introducedBlockers > 0 ? 'needs-attention'
    : (changedNodeIds.size > 0 || mustReverify.length > 0 || introducedRisk.length > 0) ? 'review' : 'clear';

  return {
    schema: GUARDIAN_SCHEMA,
    verdict,
    changed: {
      nodesAdded: diff.addedNodes.length,
      nodesRemoved: diff.removedNodes.length,
      nodesChanged: diff.changedNodes.length,
      relationshipsAdded: diff.addedRelationships.length,
      relationshipsRemoved: diff.removedRelationships.length,
    },
    affectedIntent: dedupeById(missionTitles).map((n) => ({ id: n.id, title: n.title || null })),
    introducedRisk,
    resolvedRisk,
    mustReverify,
    invalidatedApprovals: diff.invalidatedApprovals || [],
    staleLearning,
    summary: {
      verdict,
      introduced: introducedRisk.length,
      introducedBlocking: introducedBlockers,
      resolved: resolvedRisk.length,
      mustReverify: mustReverify.length,
      staleLearning: staleLearning.length,
    },
  };
}
