// Human <-> Structured <-> IntentLang synchronization (intent-sync-v1). IL owns the boundary
// between a plain-language / structured editor (SkillsTech Studio) and canonical IntentLang,
// so a non-developer edits structured fields and IL stays the source of truth , never a silent
// rewrite. Pure ESM, ZERO Node deps: browser-safe for Studio's Vite build.
//
//   parseToStructured(source) -> the canonical structured view (intent graph + flat fields)
//   proposeIntent(structured, { base }) -> { source, diff, ambiguities, warnings } , a PROPOSAL
//     the caller reviews and applies; it is never applied here, and ambiguity is surfaced,
//     not guessed.

import { parseIntent } from './parse.mjs';
import { buildIntentGraph } from './intent-graph.mjs';
import { graphToSource } from './graph-source.mjs';
import { diffGraphs } from './semantic-diff.mjs';
import { validateGraph } from './migrate.mjs';
import { isFactual } from './classification.mjs';

export const SYNC_SCHEMA = 'intent-sync-v1';

const hasComments = (src) => typeof src === 'string' && /(^|\s)#/.test(src);

/**
 * The canonical structured view of IntentLang source: the intent graph a projector (Studio's
 * ProjectNode/ProjectEdge) builds from, plus a flat, PM-friendly field summary. IL stays the
 * source of truth; this is a projection of it.
 */
export function parseToStructured(source) {
  const ast = parseIntent(String(source ?? ''));
  const graph = buildIntentGraph(ast);
  const fields = {
    mission: ast.mission || null,
    title: ast.title || null,
    goal: ast.goal || null,
    why: ast.why || null,
    guarantees: (ast.guarantees || []).map((g) => g.statement),
    neverRules: (ast.neverRules || []).map((n) => n.statement),
    inputs: (ast.inputs || []).map((f) => ({ name: f.name, type: f.type })),
    outputs: (ast.outputs || []).map((f) => ({ name: f.name, type: f.type })),
    decisions: (ast.decisions || []).map((d) => d.name),
    lifecycles: (ast.lifecycles || []).map((l) => l.name),
    outcomes: (ast.outcomes || []).map((o) => o.name),
  };
  return { schema: SYNC_SCHEMA, mission: fields.mission, graph, fields };
}

// Non-factual (proposed/assumed/inferred/unknown) nodes are decisions a human still owes , the
// "return a proposal, not a guess" surface.
function collectAmbiguities(graph) {
  const out = [];
  for (const n of graph.nodes || []) {
    if (n.classification && !isFactual(n.classification)) {
      out.push({ id: n.id, type: n.type, title: n.title || null, classification: n.classification, reason: `${n.classification} , confirm before treating as fact` });
    }
  }
  return out;
}

/**
 * Propose IntentLang source from a structured graph, with a REVIEWABLE diff against the base.
 * Accepts a graph, `{ graph }`, or the object `parseToStructured` returns. `base` may be the
 * prior IntentLang source (string) or its graph. Returns a proposal , it is never applied.
 *
 * Fidelity is honest: regenerating source from a graph does NOT preserve free-text comments;
 * when the base carried comments, that is surfaced as a warning so the caller keeps the base
 * source and applies structural edits rather than overwriting it.
 */
export function proposeIntent(structured, { base = null } = {}) {
  const graph = structured && structured.graph ? structured.graph : structured;
  if (!graph || !Array.isArray(graph.nodes)) {
    return { schema: SYNC_SCHEMA, ok: false, error: 'proposeIntent expects an intent graph (or { graph }).' };
  }

  const source = graphToSource(graph);

  // Round-trip check: does the proposed source rebuild the same node set? Anything dropped is a
  // fidelity ambiguity the caller should see (not silently lost).
  const roundGraph = buildIntentGraph(parseIntent(source));
  const roundIds = new Set(roundGraph.nodes.map((n) => n.id));
  const lostNodes = graph.nodes.filter((n) => n.id && !roundIds.has(n.id)).map((n) => ({ id: n.id, type: n.type, title: n.title || null }));

  const baseGraph = typeof base === 'string' ? buildIntentGraph(parseIntent(base)) : (base && base.graph) || base || null;
  const diff = baseGraph && Array.isArray(baseGraph.nodes) ? diffGraphs(baseGraph, graph) : null;

  const validation = validateGraph(graph);
  const ambiguities = collectAmbiguities(graph);

  const warnings = [];
  if (hasComments(base)) warnings.push('Regenerating source from the graph does not preserve free-text comments in the base. To keep comments, use applyEdits(base, edits) (intent-patch-v1) to edit the source in place instead of replacing it.');
  if (lostNodes.length) warnings.push(`${lostNodes.length} node(s) did not survive the graph->source round-trip; review before applying.`);
  if (!validation.valid) warnings.push('Proposed graph has validation issues (see validation).');

  return {
    schema: SYNC_SCHEMA,
    ok: true,
    source,
    diff,          // reviewable: added/removed/changed nodes + relationships + invalidated approvals
    ambiguities,   // non-factual nodes: proposals, not guesses
    lostNodes,     // round-trip fidelity gaps
    validation,    // canonical-vocabulary + no-dangling check
    warnings,
    applied: false, // NEVER a silent rewrite; the caller reviews and applies
  };
}
