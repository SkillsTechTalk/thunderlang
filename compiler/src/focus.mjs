// Intent Lens , Intent Scope + Focus Graph (intent-focus-v1). A Focus Graph is a versioned
// subgraph of the Intent Atlas around a selected scope (a mission, a set of nodes, a change),
// with each included node tagged by WHY it is in focus. This is the shared foundation the
// vision's Intent Lens is built on: Studio renders it, OpenThunder verifies its scope,
// RepoMastery/SkillsTech Talk teach it, but the deterministic scope + subgraph live here
// because IntentLang owns the Intent IR/Atlas. Pure and browser-safe (no Node, no AI).
//
// "Intent Atlas shows the complete system. Intent Lens helps you understand one part of it."

export const FOCUS_SCHEMA = 'intent-focus-v1';

export const SCOPE_TYPES = [
  'branch', 'pull-request', 'commit-range', 'feature', 'capability', 'requirement',
  'flow', 'service', 'module', 'release', 'incident', 'finding', 'mission', 'custom',
];

// Why a node is in the focused graph (the vision's inclusion-reason set).
export const FOCUS_REASONS = [
  'selected', 'governing', 'dependency', 'dependent', 'implementation',
  'verification', 'risk', 'contextual',
];

const RISK_TYPES = new Set(['Risk', 'Finding', 'Conflict', 'Threat']);
const OPEN_TYPES = new Set(['Unknown', 'Question', 'Assumption']);

// A small deterministic, browser-safe fingerprint (djb2) , for freshness comparison, not security.
function fingerprint(parts) {
  let h = 5381;
  const s = parts.join('');
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `fp_${h.toString(16)}`;
}

/** Build a typed Intent Scope. `createdAt` is supplied by the caller (deterministic/testable). */
export function makeScope({ type = 'custom', title = null, seeds = [], projectId = null, createdBy = null, createdAt = null, ...rest } = {}) {
  if (!SCOPE_TYPES.includes(type)) throw new Error(`intent focus: unknown scope type "${type}"`);
  return {
    schema: FOCUS_SCHEMA,
    scopeId: `scope.${type}.${fingerprint([type, ...seeds].map(String))}`,
    projectId, type, title: title || (seeds[0] || type),
    selectedNodeIds: [...seeds],
    createdBy, createdAt,
    provenance: 'compiler-derived',
    ...rest,
  };
}

// Classify why `node`, reached from `viaEdge` (or a seed), is included.
function reasonFor(node, viaEdge, seedSet) {
  if (seedSet.has(node.id)) return 'selected';
  if (RISK_TYPES.has(node.type)) return 'risk';
  if (node.type === 'VerificationRule' || node.type === 'Verification') return 'verification';
  if (!viaEdge) return 'contextual';
  switch (viaEdge.type) {
    case 'verified_by': return 'verification';
    case 'requires': case 'constrained_by': case 'governs': case 'supported_by': return 'governing';
    case 'implemented_by': case 'represented_by': return 'implementation';
    case 'depends_on': return viaEdge.dir === 'out' ? 'dependency' : 'dependent';
    default: return 'contextual';
  }
}

/**
 * Build a Focus Graph: the subgraph of `atlas` reachable from `seeds` within `depth` hops,
 * every node tagged with its focusReason and the hop distance. Deterministic.
 * @param {{nodes:Array, relationships:Array}} atlas
 * @param {{seeds:string[], depth?:number, scope?:object}} opts
 */
export function buildFocusGraph(atlas, { seeds = [], depth = 2, scope = null } = {}) {
  const nodesById = new Map((atlas?.nodes || []).map((n) => [n.id, n]));
  const rels = atlas?.relationships || [];
  const seedSet = new Set(seeds.filter((s) => nodesById.has(s)));
  const included = new Map(); // id -> { node, reason, depth }
  for (const s of seedSet) included.set(s, { node: nodesById.get(s), reason: 'selected', depth: 0 });

  // Adjacency index (built once) so BFS is O(nodes + edges), not O(nodes * edges). Each entry
  // records the neighbor id + the edge (with direction) that reaches it.
  const adj = new Map();
  const link = (from, neighborId, r, dir) => {
    let list = adj.get(from);
    if (!list) { list = []; adj.set(from, list); }
    list.push({ neighborId, via: { type: r.type, from: r.from, to: r.to, dir } });
  };
  for (const r of rels) { link(r.from, r.to, r, 'out'); link(r.to, r.from, r, 'in'); }

  let frontier = [...seedSet];
  for (let d = 1; d <= depth && frontier.length; d += 1) {
    const next = [];
    for (const id of frontier) {
      const edges = adj.get(id);
      if (!edges) continue;
      for (const { neighborId, via } of edges) {
        if (included.has(neighborId)) continue;
        const node = nodesById.get(neighborId) || { id: neighborId, type: 'Unknown', title: neighborId };
        included.set(neighborId, { node, reason: reasonFor(node, via, seedSet), depth: d });
        next.push(neighborId);
      }
    }
    frontier = next;
  }

  const focusNodes = [...included.values()]
    .map(({ node, reason, depth: dd }) => ({ id: node.id, type: node.type, title: node.title || node.id, focusReason: reason, depth: dd, confidence: node.confidence || null, provenance: node.provenance || null }))
    .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  const idSet = new Set(focusNodes.map((n) => n.id));
  const focusRels = rels.filter((r) => idSet.has(r.from) && idSet.has(r.to));

  const byReason = {};
  for (const n of focusNodes) byReason[n.focusReason] = (byReason[n.focusReason] || 0) + 1;
  const byType = {};
  for (const n of focusNodes) byType[n.type] = (byType[n.type] || 0) + 1;

  return {
    schema: FOCUS_SCHEMA,
    scope: scope || makeScope({ type: 'custom', seeds: [...seedSet] }),
    depth,
    freshness: fingerprint(focusNodes.map((n) => `${n.id}:${nodesById.get(n.id)?.hash || n.title}`)),
    overview: { nodes: focusNodes.length, relationships: focusRels.length, byReason, byType },
    nodes: focusNodes,
    relationships: focusRels,
  };
}

/**
 * A deterministic Intent Brief for a Focus Graph: what / why / who / involves / risks /
 * unknowns / confidence. Never invents; every line is derived from focused IR nodes, and the
 * brief's confidence is the weakest confidence in scope (honesty).
 */
export function intentBrief(focus) {
  const nodes = focus?.nodes || [];
  const seed = nodes.find((n) => n.focusReason === 'selected' && n.type === 'Mission')
    || nodes.find((n) => n.type === 'Mission') || nodes[0] || null;
  const of = (types) => nodes.filter((n) => types.includes(n.type)).map((n) => n.title);
  const rank = { Confirmed: 5, Observed: 4, Derived: 3, Inferred: 2, Speculative: 1, Conflicted: 0 };
  const confidences = nodes.map((n) => n.confidence).filter(Boolean);
  const weakest = confidences.length ? confidences.reduce((a, b) => (rank[b] < rank[a] ? b : a)) : null;
  return {
    schema: FOCUS_SCHEMA,
    scopeId: focus?.scope?.scopeId || null,
    what: seed ? seed.title : (focus?.scope?.title || null),
    who: of(['Persona', 'Actor']),
    involves: focus?.overview?.byType || {},
    guarantees: of(['Guarantee']),
    prohibitions: of(['Never', 'ProhibitedBehavior']),
    risks: nodes.filter((n) => n.focusReason === 'risk').length,
    verification: nodes.filter((n) => n.focusReason === 'verification').length,
    unknowns: nodes.filter((n) => OPEN_TYPES.has(n.type)).map((n) => n.title),
    confidence: weakest,
    needsReview: nodes.some((n) => ['Inferred', 'Speculative', 'Conflicted'].includes(n.confidence)),
  };
}
