// Change Lens (intent-changes-v1) , what a branch / PR / commit range changed, by MEANING, not
// lines. Given the before/after graphs of each changed .intent file, it aggregates the semantic
// diff (reusing diffGraphs), interprets the behavior-level changes (a guarantee/never/invariant
// added or removed, verification removed, approval invalidated), flags regressions, and returns
// the set of touched nodes to seed a Focus Graph. Pure (the CLI does the git I/O); browser-safe.

import { diffGraphs } from './semantic-diff.mjs';

export const CHANGES_SCHEMA = 'intent-changes-v1';

const EMPTY = { nodes: [], relationships: [] };
// The node kinds whose add/remove is a meaningful behavior change worth surfacing.
const SIGNIFICANT = new Set(['Mission', 'Guarantee', 'Never', 'Invariant', 'Constraint', 'VerificationRule', 'Decision', 'Event', 'Api', 'Outcome', 'OutcomeContract']);
// Removing one of these is a regression risk (a promise or its proof was taken away).
const REGRESSION_ON_REMOVE = new Set(['Guarantee', 'Never', 'Invariant', 'VerificationRule']);

const verbFor = (type) => {
  switch (type) {
    case 'Guarantee': return 'guarantee';
    case 'Never': return 'never-rule';
    case 'Invariant': return 'invariant';
    case 'VerificationRule': return 'verification';
    case 'Decision': return 'decision';
    case 'Event': return 'event';
    case 'Outcome': case 'OutcomeContract': return 'outcome';
    default: return type.toLowerCase();
  }
};

/**
 * Build a Change Report from before/after graphs of each changed file.
 * @param {Array<{path:string, before:object|null, after:object|null}>} pairs
 */
export function changeReport(pairs) {
  const files = [];
  const highlights = [];
  const touched = new Set();
  let added = 0, removed = 0, changed = 0, invalidatedApprovals = 0;

  for (const { path, before, after } of pairs || []) {
    const d = diffGraphs(before || EMPTY, after || EMPTY);
    added += d.addedNodes.length; removed += d.removedNodes.length; changed += d.changedNodes.length;
    invalidatedApprovals += (d.invalidatedApprovals || []).length;
    const record = (kind, n) => { touched.add(n.id); if (SIGNIFICANT.has(n.type)) highlights.push({ kind, type: n.type, thing: verbFor(n.type), title: n.title, path }); };
    for (const n of d.addedNodes) record('added', n);
    for (const n of d.removedNodes) record('removed', n);
    for (const c of d.changedNodes) {
      touched.add(c.id);
      const title = c.after?.title ?? c.before?.title ?? c.id;
      // A claim losing its verification is a real weakening (a regression), not just a change.
      const weakened = c.before?.status === 'verify-declared' && c.after?.status === 'unverified';
      highlights.push({ kind: weakened ? 'weakened' : 'changed', type: c.type, thing: verbFor(c.type), title, path });
    }
    files.push({
      path,
      status: !before ? 'added' : !after ? 'deleted' : 'modified',
      added: d.addedNodes.length, removed: d.removedNodes.length, changed: d.changedNodes.length,
      invalidatedApprovals: (d.invalidatedApprovals || []).length,
    });
  }

  const regressions = highlights.filter((h) => h.kind === 'weakened' || (h.kind === 'removed' && REGRESSION_ON_REMOVE.has(h.type)));
  const semantic = added + removed + changed;
  return {
    schema: CHANGES_SCHEMA,
    totals: { files: files.length, added, removed, changed, invalidatedApprovals, touched: touched.size },
    // review when a promise/proof was removed or an approval invalidated; else changed/no-op.
    verdict: (regressions.length || invalidatedApprovals) ? 'review' : (semantic ? 'changed' : 'no-semantic-change'),
    regressions,
    highlights,
    files,
    touchedNodeIds: [...touched],
  };
}
