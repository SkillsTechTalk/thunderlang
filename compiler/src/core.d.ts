// Types for `@skillstech/intentlang/core` , the universal (Node + browser + React Native)
// surface. This re-exports exactly the symbols core.mjs exports, using the declarations in
// index.d.ts as the single source of truth. It intentionally does NOT re-export the Node-only
// surface (CLI, LSP, filesystem lift/drift), so a consumer cannot type-import something that
// is not actually in the universal build.

// The canonical hash (byte-identical to node:crypto).
export { sha256, sha256hex } from './index';

// Parser + graph + in-memory compile.
export {
  IntentAst, Diagnostic, parseIntent, slug, KNOWN_LENSES,
  INTENT_GRAPH_SCHEMA, IntentGraph, IntentGraphNode, buildIntentGraph,
  compileSource, renderMarkdown, renderMermaid, renderTestplan,
  semanticDiagnostics, buildContractGraph, buildArchitectureGraph, buildImplementationPlan, buildProof,
} from './index';

// IntentLift: code -> inferred candidate intent (OT orchestrates this in-process).
export {
  liftSource, liftAll, liftRepo, languageForFile, inferIntent, renderLiftedIntent, SUPPORTED_LANGUAGES,
  IntentSeed, SEED_SCHEMA, normalizeSeeds,
} from './index';

// Intent Scanner + Fable.
export {
  SCAN_SCHEMA, ScanResult, scanIntent, scanProject,
  FABLE_SCHEMA, RISK_CATEGORIES, Finding, toFinding, fableRuleFor, universalPack,
} from './index';

// Focused scan query views.
export {
  VIEW_SCHEMA, VIEWS, risksView, gapsView, unverifiedView, coverageView, unknownsView, contradictionsView,
} from './index';

// Intent Atlas + navigation.
export {
  ATLAS_SCHEMA, IntentAtlas, buildAtlas, atlasNode, expandNode, searchAtlas,
} from './index';

// Intent Lens , Intent Scope + Focus Graph + Intent Brief.
export {
  FOCUS_SCHEMA, SCOPE_TYPES, FOCUS_REASONS, IntentScope, FocusNode, FocusGraph, IntentBrief,
  makeScope, buildFocusGraph, intentBrief,
} from './index';

// Comprehension Contract , the C0..C7 understanding level.
export {
  COMPREHENSION_SCHEMA, COMPREHENSION_LEVELS, ComprehensionResult, ComprehensionSignal,
  comprehensionLevel, comprehensionReport,
} from './index';

// Code generation , deterministic scaffolds from intent.
export { CODEGEN_SCHEMA, GENERATORS, toTypeScript, toCSharp, toJava, subjectName, intentRefId, skillRefId } from './index';

// Change Lens , what a branch/PR changed by meaning.
export { CHANGES_SCHEMA, ChangeReport, changeReport } from './index';

// Change Lens , semantic diff + 3-way merge + graph->source round-trip.
export {
  IntentDiff, IntentMerge, diffGraphs, mergeGraphs,
  GRAPH_SOURCE_SCHEMA, graphToSource,
} from './index';

// Shared Intent IR (intent-ir-v1) + classification model.
export {
  IR_SCHEMA, IR_EMBEDS, IR_NODE_TYPES, IR_RELATIONSHIP_TYPES, PROVENANCE, FACTUAL_PROVENANCE,
  isFactualProvenance, IR_CONFIDENCE, IR_CONFIDENCE_MEANING, confidenceFromClassification,
  SENSITIVITY, RETENTION, REVIEW_STATUS, APPROVAL_STATUS, NODE_FIELDS,
  IntentIR, IntentIRNode, validateIR, graphToIR,
  CLASSIFICATIONS, CONFIDENCE, UNSETTLED, BLOCKABLE_PHASES,
} from './index';

// Canonical schema constants + proof envelope.
export {
  SCHEMA_VERSION, NODE_TYPES, RELATIONSHIP_TYPES, intentGraphJsonSchema,
  DIAGNOSTIC_RULES, CORE_DIAGNOSTICS, ALL_DIAGNOSTICS,
  RULE_PHASES, RULE_OWNERS, RULE_NAMESPACES, VERIFICATION_RULES, ruleNamespace,
  PROOF_SCHEMA, CLAIM_STATUSES, PROOF_STATUSES, intentProofJsonSchema, validateProof,
} from './index';

// The pure Intent Runtime + guard + prompt->intent draft + expression engine.
export {
  evaluateDecision, simulateLifecycle, checkDecisionCases, RUNTIME_SCHEMA,
  buildGuard, compileGuard, guardSummary, GUARD_SCHEMA,
  draftIntent, DRAFT_SCHEMA,
} from './index';

// Human <-> Structured <-> IntentLang sync + comment-preserving structural editing.
export {
  parseToStructured, proposeIntent, SYNC_SCHEMA, applyEdits, PATCH_SCHEMA,
} from './index';

// Style intent , canonical token address space + accessibility vocabulary.
export {
  analyzeStyle, styleDiagnostics, toDesignTokens, toCss, STYLE_SCHEMA, DESIGN_TOKENS_SCHEMA,
} from './index';
