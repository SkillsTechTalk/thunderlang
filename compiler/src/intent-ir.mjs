// Intent IR (intent-ir-v1) , the ONE shared semantic representation the whole SkillsTech
// ecosystem operates on: Intent Scanner, Intent Atlas, Intent Engine, Repo Mastery, Skills Tech
// Talk, and OpenThunder all normalize into this, instead of each re-modeling a project.
//
// Design rule (anti-fork): Intent IR is a strict SUPERSET of the canonical Intent Graph
// (intent-graph-v1). Every intent-graph-v1 node type and relationship type is included and keeps
// its meaning, so a graph that validates today still validates as Intent IR , RepoMastery and
// OpenThunder keep consuming intent-graph-v1 unchanged while new products consume the richer IR.
// Pure ESM, zero Node deps (browser-safe).

import { NODE_TYPES as GRAPH_NODE_TYPES, RELATIONSHIP_TYPES as GRAPH_REL_TYPES } from './intent-schema.mjs';

export const IR_SCHEMA = 'intent-ir-v1';
export const IR_EMBEDS = 'intent-graph-v1';

// ── Node types, organized by tier (the intent-graph-v1 set is embedded via GRAPH_NODE_TYPES) ──
const IR_ONLY_NODE_TYPES = [
  // Organization / product context
  'Organization', 'Workspace', 'Project', 'Repository', 'Application', 'System', 'Domain', 'Persona',
  // Requirements / experience
  'UserJourney', 'ExperienceFlow', 'Screen', 'BusinessRule', 'DomainConcept', 'GlossaryTerm', 'ProhibitedBehavior',
  // Architecture
  'ArchitectureDecision', 'SystemBoundary', 'TrustBoundary', 'Service', 'Component', 'Module', 'Package', 'File',
  'Symbol', 'Class', 'Interface', 'Function', 'Method', 'Endpoint', 'Message', 'Queue',
  // Data / infra
  'DataModel', 'Database', 'Table', 'Schema', 'Migration', 'InfrastructureResource', 'Configuration', 'Dependency',
  // Security / risk
  'SecurityControl', 'Threat', 'Risk', 'Finding',
  // Verification / delivery
  'TestScenario', 'Verification', 'Change',
  // Knowledge / learning
  'LearningModule', 'LearningPath', 'Drill', 'Quiz', 'Flashcard', 'Misconception', 'LearnerConceptState',
];

// The full Intent IR node vocabulary = intent-graph-v1 nodes + the IR-only additions (deduped).
export const IR_NODE_TYPES = [...new Set([...GRAPH_NODE_TYPES, ...IR_ONLY_NODE_TYPES])];

const IR_ONLY_REL_TYPES = [
  'produces', 'performs', 'contains', 'defines', 'belongs_to', 'exposes', 'publishes', 'consumes',
  'stores', 'constrains', 'mitigates', 'affects', 'produces_evidence', 'contains_change', 'teaches',
  'derived_from_artifact', 'assesses', 'prerequisite_for', 'has_state', 'appears_in', 'covers',
  'implies_candidate_intent', 'governs', 'satisfies', 'conflicts_with',
];
export const IR_RELATIONSHIP_TYPES = [...new Set([...GRAPH_REL_TYPES, ...IR_ONLY_REL_TYPES])];

// ── Provenance , where a fact came from. Load-bearing for "never show AI-inferred as confirmed." ──
export const PROVENANCE = [
  'user-authored', 'imported', 'deterministically-discovered', 'compiler-derived', 'test-derived',
  'runtime-observed', 'ai-proposed', 'ai-generated', 'system-generated', 'human-approved', 'human-corrected',
];
// Which provenance may be treated as fact without human confirmation.
export const FACTUAL_PROVENANCE = new Set([
  'user-authored', 'deterministically-discovered', 'compiler-derived', 'test-derived', 'runtime-observed', 'human-approved', 'human-corrected',
]);
export const isFactualProvenance = (p) => FACTUAL_PROVENANCE.has(p);

// ── Confidence taxonomy (richer than a bare percentage; every value is defined + explainable) ──
export const IR_CONFIDENCE = ['Confirmed', 'Observed', 'Derived', 'Inferred', 'Speculative', 'Conflicted'];
export const IR_CONFIDENCE_MEANING = {
  Confirmed: 'Explicit approved intent exists and maps cleanly to implementation.',
  Observed: 'Behavior is directly visible through deterministic analysis.',
  Derived: 'Behavior follows reliably from several observed facts.',
  Inferred: 'A plausible interpretation that requires human review.',
  Speculative: 'Evidence is weak or incomplete.',
  Conflicted: 'Different parts of the project imply incompatible intent.',
};
// Map intent-graph-v1's classification enum onto the IR confidence taxonomy (compat bridge).
export function confidenceFromClassification(classification) {
  switch (classification) {
    case 'verified': case 'decided': return 'Confirmed';
    case 'observed': return 'Observed';
    case 'inferred': return 'Derived';
    case 'proposed': return 'Inferred';
    case 'assumed': return 'Speculative';
    default: return 'Inferred';
  }
}

export const SENSITIVITY = ['public', 'internal', 'confidential', 'restricted', 'secret'];
export const RETENTION = ['ephemeral', 'short', 'standard', 'long', 'permanent'];
export const REVIEW_STATUS = ['unreviewed', 'in-review', 'reviewed', 'needs-revalidation'];
export const APPROVAL_STATUS = ['unapproved', 'proposed', 'approved', 'rejected'];

// The canonical node envelope every Intent IR node carries (all optional except id + type).
export const NODE_FIELDS = [
  'id', 'type', 'title', 'summary', 'description', 'status', 'owner', 'source', 'sourceLocation',
  'sourceType', 'version', 'hash', 'createdTime', 'updatedTime', 'confidence', 'provenance',
  'reviewStatus', 'approvalStatus', 'permissions', 'sensitivity', 'retention', 'tags', 'evidence', 'metadata',
];

const NODE_SET = new Set(IR_NODE_TYPES);
const REL_SET = new Set(IR_RELATIONSHIP_TYPES);

/**
 * Deterministic structural validation of an Intent IR document. Returns { valid, errors }.
 * Honesty guard: a node whose provenance is not factual MUST carry a confidence, and MUST NOT be
 * marked approved without review , so AI-inferred information is never presented as confirmed.
 */
export function validateIR(ir) {
  const errors = [];
  const err = (path, message) => errors.push({ path, message });
  if (!ir || typeof ir !== 'object') return { valid: false, errors: [{ path: '', message: 'IR must be an object' }] };
  if (ir.schema && ir.schema !== IR_SCHEMA) err('schema', `schema must be "${IR_SCHEMA}"`);
  const nodes = Array.isArray(ir.nodes) ? ir.nodes : (err('nodes', 'nodes must be an array'), []);
  const ids = new Set();
  for (const [i, n] of nodes.entries()) {
    if (!n || typeof n !== 'object') { err(`nodes[${i}]`, 'node must be an object'); continue; }
    if (!n.id) err(`nodes[${i}].id`, 'node needs a stable id');
    else if (ids.has(n.id)) err(`nodes[${i}].id`, `duplicate node id "${n.id}"`); else ids.add(n.id);
    if (!NODE_SET.has(n.type)) err(`nodes[${i}].type`, `unknown node type "${n.type}"`);
    if (n.provenance && !PROVENANCE.includes(n.provenance)) err(`nodes[${i}].provenance`, `unknown provenance "${n.provenance}"`);
    if (n.confidence && !IR_CONFIDENCE.includes(n.confidence)) err(`nodes[${i}].confidence`, `unknown confidence "${n.confidence}"`);
    if (n.sensitivity && !SENSITIVITY.includes(n.sensitivity)) err(`nodes[${i}].sensitivity`, `unknown sensitivity "${n.sensitivity}"`);
    // Honesty guard.
    if (n.provenance && !isFactualProvenance(n.provenance)) {
      if (!n.confidence) err(`nodes[${i}].confidence`, `non-factual provenance "${n.provenance}" requires a confidence`);
      if (n.approvalStatus === 'approved' && n.reviewStatus !== 'reviewed') err(`nodes[${i}].approvalStatus`, 'AI/inferred node cannot be "approved" without reviewStatus "reviewed"');
    }
  }
  const rels = Array.isArray(ir.relationships) ? ir.relationships : (ir.relationships === undefined ? [] : (err('relationships', 'relationships must be an array'), []));
  const isPlaceholder = (x) => String(x || '').startsWith('phase.');
  for (const [i, r] of rels.entries()) {
    if (!REL_SET.has(r?.type)) err(`relationships[${i}].type`, `unknown relationship type "${r?.type}"`);
    // Both ends must resolve to a node, unless they are phase.* placeholders (blocks-phase edges).
    if (r && !ids.has(r.from) && !isPlaceholder(r.from)) err(`relationships[${i}].from`, `dangling from "${r.from}"`);
    if (r && !ids.has(r.to) && !isPlaceholder(r.to)) err(`relationships[${i}].to`, `dangling to "${r.to}"`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Lift a canonical intent-graph-v1 document into Intent IR , additive, lossless. Each node keeps
 * its id/type/title, and its classification becomes an IR confidence with compiler-derived
 * provenance (deterministic output), so existing graphs flow into the shared IR with honest
 * provenance and never as unverified "fact."
 */
export function graphToIR(graph, { provenance = 'compiler-derived' } = {}) {
  const nodes = (graph?.nodes || []).map((n) => ({
    ...n,
    provenance: n.provenance || provenance,
    confidence: n.confidence || (n.classification ? confidenceFromClassification(n.classification) : undefined),
  }));
  return { schema: IR_SCHEMA, embeds: IR_EMBEDS, missionId: graph?.missionId ?? null, nodes, relationships: graph?.relationships || [] };
}
