// Public library entry for @skillstech/intentlang.
//
// This is the importable API for consumers (e.g. SkillsTech Studio, Repo Mastery):
//   import { parseIntent, compileSource, buildMissionIndex } from '@skillstech/intentlang';
// The `intent` CLI (src/cli.mjs) is the other entry point; both use these same functions,
// so there is no duplicated compiler logic. Curated on purpose: only the stable public
// surface is re-exported here.

// Parsing
export { parseIntent, slug, KNOWN_LENSES } from './parse.mjs';

// Semantic analysis, graphs, and proof
export {
  semanticDiagnostics,
  buildContractGraph,
  buildArchitectureGraph,
  buildImplementationPlan,
  buildProof,
  sha256,
  COMPILER_VERSION,
  PROOF_SCHEMA_VERSION,
  SOURCE_PRODUCT,
} from './emit.mjs';

// Compile + render (docs, Mermaid, test plan)
export { compileSource, renderMarkdown, renderMermaid, renderTestplan } from './compile.mjs';

// IntelliSense (completions / hover)
export { getCompletions, getHover, SEMANTIC_TYPES } from './intellisense.mjs';

// IntentLift (code -> inferred intent)
export {
  liftSource,
  liftRepo,
  languageForFile,
  inferIntent,
  renderLiftedIntent,
  SUPPORTED_LANGUAGES,
} from './lift.mjs';

// Approve + drift round-trip (il-to-ot-drift-v1 handoff)
export { approveIntent, checkDrift, buildDriftHandoff, intentHash } from './drift.mjs';

// Mission Atlas index (mission-index-v1)
export { buildMissionIndex } from './atlas.mjs';

// Architecture rules (structured; OpenThunder's Architecture Lens checks against them)
export { parseArchitectureRules, violatesArchitecture } from './arch.mjs';

// Deterministic candidate selection (AI generates; IL + OT select on measurable rules)
export { parseSelection, regionMetrics, selectCandidate } from './select.mjs';

// Canonical Intent Graph + classification (intent-graph-v1) , the shared cross-product model
export { buildIntentGraph, INTENT_GRAPH_SCHEMA } from './intent-graph.mjs';
// Intent Atlas , the navigable/searchable whole-system map over the graph (directive #4)
export { buildAtlas, atlasNode, expandNode, searchAtlas, ATLAS_SCHEMA } from './intent-atlas.mjs';
export { diffGraphs, mergeGraphs } from './semantic-diff.mjs';
export { CLASSIFICATIONS, CONFIDENCE, UNSETTLED, classify, isFactual, BLOCKABLE_PHASES } from './classification.mjs';
export { composeConstraints, detectConflicts } from './conflict.mjs';
export { buildLifecycle, analyzeLifecycle } from './lifecycle.mjs';
export { analyzeDistributed } from './distributed.mjs';
export { analyzeDecision } from './decision.mjs';
// Governance: waivers , governed exceptions to blocking diagnostics (Gap 5)
export { applyWaivers, governanceDiagnostics, GOVERNANCE_SCHEMA } from './governance.mjs';
// Data purpose + privacy , purpose limitation on declared data elements (Gap 6)
export { analyzePrivacy, PRIVACY_SCHEMA, DATA_CLASSIFICATIONS, LAWFUL_BASES } from './privacy.mjs';
export {
  SCHEMA_VERSION, NODE_TYPES, RELATIONSHIP_TYPES, NODE_STATUSES,
  intentGraphJsonSchema, DIAGNOSTIC_RULES,
} from './intent-schema.mjs';

// Intent AI implementations (intent-ai-v1): state model, marker parser, hashing, manifest
export {
  IMPLEMENTATION_STATES, RISK_LEVELS, HIGH_RISK, blocksProduction,
  COMMENT_PREFIX, parseMarkers, renderMarker,
  contractHash, implementationHash,
  buildManifest, buildImplementationPrompt, MANIFEST_SCHEMA_VERSION, PROOF_CHECK_KEYS,
  resolveState, productionGate, adoptRegion,
  recordDecision, approvalFor, emptyApprovals, APPROVALS_SCHEMA_VERSION,
  makeEvent, INTENT_AI_EVENTS,
} from './ai.mjs';
