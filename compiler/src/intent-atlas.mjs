// Intent Atlas (founder directive #4). The navigable, expandable, searchable map of a
// whole software system, built OVER the canonical Intent Graph (intent-graph-v1) , NOT a
// fork. Missions are the entry points (progressive disclosure: you never start from
// files/folders). Deterministic; no AI (non-negotiable #1). Pure (no Node deps).
//
// Mission Atlas (focused per-mission map) is `mission-index-v1` / buildMissionIndex.
// This assembles many mission graphs into the whole-system Atlas.

export const ATLAS_SCHEMA = 'intent-atlas-v1';

/**
 * Assemble many Intent Graphs (one per .intent) into one whole-system Atlas.
 * @param {Array<{schema, missionId, nodes, relationships}>} graphs
 * @param {{product?: string}} [opts]
 */
export function buildAtlas(graphs, opts = {}) {
  const nodes = new Map();
  const relationships = [];
  const missions = [];
  for (const g of graphs || []) {
    const m = g.nodes.find((n) => n.id === g.missionId);
    missions.push({ id: g.missionId, title: (m && m.title) || g.missionId });
    for (const n of g.nodes) if (!nodes.has(n.id)) nodes.set(n.id, n);
    for (const r of g.relationships) relationships.push(r);
  }
  const nodeList = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
  const byType = {};
  for (const n of nodeList) byType[n.type] = (byType[n.type] || 0) + 1;
  missions.sort((a, b) => a.id.localeCompare(b.id));
  return {
    schema: ATLAS_SCHEMA,
    product: opts.product || null,
    // Progressive disclosure starts here: the overview is missions + type counts, not nodes.
    overview: { missions: missions.length, nodes: nodeList.length, relationships: relationships.length, byType },
    missions,
    nodes: nodeList,
    relationships,
  };
}

/** Look up one node by id. */
export function atlasNode(atlas, id) {
  return atlas.nodes.find((n) => n.id === id) || null;
}

/**
 * Expand a node to its immediate neighbors (outbound + inbound edges). This is the
 * navigation primitive: never dump the whole graph, expand one node at a time.
 */
export function expandNode(atlas, id) {
  const node = atlasNode(atlas, id);
  if (!node) return null;
  const out = atlas.relationships.filter((r) => r.from === id).map((r) => ({ rel: r.type, node: atlasNode(atlas, r.to) || { id: r.to } }));
  const inbound = atlas.relationships.filter((r) => r.to === id).map((r) => ({ rel: r.type, node: atlasNode(atlas, r.from) || { id: r.from } }));
  return { node, out, inbound };
}

/**
 * Deterministic search over the Atlas (exact + substring over id/title/description),
 * with optional type filter. No AI. Ranking: exact-title, then id-prefix, then
 * substring; stable tiebreak by type + id.
 */
export function searchAtlas(atlas, query, opts = {}) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  const score = (n) => {
    const title = (n.title || '').toLowerCase();
    const id = n.id.toLowerCase();
    if (title === q || id === q) return 0;
    if (id.startsWith(q) || title.startsWith(q)) return 1;
    return 2;
  };
  let hits = atlas.nodes.filter((n) => `${n.id} ${n.title || ''} ${n.description || ''}`.toLowerCase().includes(q));
  if (opts.type) hits = hits.filter((n) => n.type === opts.type);
  hits.sort((a, b) => score(a) - score(b) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
  return hits.slice(0, opts.limit || 25);
}
