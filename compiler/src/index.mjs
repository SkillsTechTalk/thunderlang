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

// Canonical proof envelope schema (intent-proof-v1) , the shared, signable proof shape
export {
  PROOF_SCHEMA, CLAIM_STATUSES, PROOF_STATUSES, intentProofJsonSchema, validateProof,
} from './proof-schema.mjs';

// Compile + render (docs, Mermaid, test plan)
export { compileSource, renderMarkdown, renderMermaid, renderTestplan } from './compile.mjs';

// IntelliSense (completions / hover)
export { getCompletions, getHover, SEMANTIC_TYPES } from './intellisense.mjs';

// IntentLift (code -> inferred intent)
export {
  liftSource,
  liftAll,
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
// Export adapters , decisions/lifecycles/temporal -> DMN / BPMN / NuSMV (interop)
export { toDMN, toBPMN, toSMV, toMermaid, toPlaywright, exportIntent, EXPORT_FORMATS } from './exporters.mjs';
// Data-shape export , typed fields -> JSON Schema / OpenAPI
export { toJSONSchema, toOpenAPI, typeToJsonSchema, isRecognizedType } from './data-schema.mjs';
// Import adapters , external DMN / BPMN -> IntentLang source (round-trip)
export { fromDMN, fromBPMN, importIntent, importReport, detectFormat, IMPORT_FORMATS, IMPORT_SCHEMA } from './importers.mjs';
// Graph -> source , regenerate .intent from an Intent Graph (native round-trip)
export { graphToSource, GRAPH_SOURCE_SCHEMA } from './graph-source.mjs';
// Schema migrations , upgrade persisted graphs across schema versions
export {
  migrateGraph, validateGraph, graphVersion, MIGRATIONS, SCHEMA_CHAIN, MIGRATION_SCHEMA,
  renameNodeType, renameRelationshipType, backfillNodeField, dropNodeField,
} from './migrate.mjs';
export { parseXml, findAll, find, localName } from './xml.mjs';
// Intent Runtime , EXECUTABLE intent: evaluate decisions, simulate lifecycles (no AI)
export { evaluateDecision, simulateLifecycle, checkDecisionCases, RUNTIME_SCHEMA } from './runtime.mjs';
export { compileExpr, evalExpr, tokenize, ExprError } from './expr.mjs';
// First-class tests , self-verifying .intent files
export { runTests, TEST_SCHEMA } from './testing.mjs';
// Outcome contracts , executable commitments (evaluate an outcome against its result)
export { evaluateOutcomeContract, evaluateOutcomes, outcomeDiagnostics, parseValue, OUTCOME_SCHEMA } from './outcome.mjs';
// Security + type semantic pass , secrets on the bus, unauthenticated sensitive output, typos
export { securityDiagnostics, SECURITY_SCHEMA } from './security.mjs';
// SARIF 2.1.0 output , IntentLang diagnostics in GitHub/GitLab code scanning + IDEs
export { toSarif, sarifLevel, SARIF_SCHEMA } from './sarif.mjs';
// Human <-> Structured <-> IntentLang sync , Studio edits structured, IL stays source of truth
export { parseToStructured, proposeIntent, SYNC_SCHEMA } from './sync.mjs';
// Structural source editing , apply field edits in place, preserving comments + formatting
export { applyEdits, PATCH_SCHEMA } from './patch.mjs';
// Repo-wide intent health report (aggregate diagnostics + coverage across many files)
export { buildReport, REPORT_SCHEMA } from './report.mjs';
// Fable , the versioned rule authority + rich finding model (over the diagnostic catalog)
export { FABLE_SCHEMA, RISK_CATEGORIES, fableRuleFor, universalPack, toFinding } from './fable.mjs';
// Intent Scanner , intent -> Intent IR -> Fable findings -> risk themes (deterministic pipeline)
export { scanIntent, scanProject, SCAN_SCHEMA } from './scan.mjs';
// Intent Guardian , continuous drift detection (what changed, what risk, what to reverify, stale learning)
export { guardianReport, GUARDIAN_SCHEMA } from './guardian.mjs';
// Verify a code change against its intent , the AI generate/verify loop gate
export { verifyDiff, VERIFY_DIFF_SCHEMA } from './verify-diff.mjs';
// MCP server , IntentLang as a native tool for AI coding agents
export { startMcpServer, MCP_TOOLS } from './mcp.mjs';
// Runtime enforcement , compile intent into a guard that blocks forbidden actions + redacts secrets
export { buildGuard, compileGuard, guardSummary, GUARD_SCHEMA } from './guard.mjs';
// Prompt -> intent (deterministic half) , scaffold a rigorous draft + gap checklist from a brief
export { draftIntent, DRAFT_SCHEMA } from './draft.mjs';
// Style intent , brand/visual language as a governed Experience-profile extension
export {
  analyzeStyle, styleDiagnostics, toDesignTokens, toCss, STYLE_SCHEMA, DESIGN_TOKENS_SCHEMA,
  TOKEN_PATHS, BRAND_PATHS, STYLE_ADDRESS_SPACE, ACCESSIBILITY_TARGETS, MODE_VALUES,
  ACCESSIBILITY_CLASSIFICATION,
} from './style.mjs';
export {
  SCHEMA_VERSION, NODE_TYPES, RELATIONSHIP_TYPES, NODE_STATUSES,
  intentGraphJsonSchema, DIAGNOSTIC_RULES, CORE_DIAGNOSTICS, ALL_DIAGNOSTICS,
} from './intent-schema.mjs';
// Intent IR (intent-ir-v1) , the shared ecosystem semantic representation (superset of the graph)
export {
  IR_SCHEMA, IR_EMBEDS, IR_NODE_TYPES, IR_RELATIONSHIP_TYPES, PROVENANCE, FACTUAL_PROVENANCE,
  isFactualProvenance, IR_CONFIDENCE, IR_CONFIDENCE_MEANING, confidenceFromClassification, SENSITIVITY,
  RETENTION, REVIEW_STATUS, APPROVAL_STATUS, NODE_FIELDS, validateIR, graphToIR,
} from './intent-ir.mjs';

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

// Language Server (LSP over stdio) for editors
export { startLspServer } from "./lsp.mjs";

// Formatter , canonical .intent formatting (whitespace only)
export { formatSource, isFormatted } from "./format.mjs";
