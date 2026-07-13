// @skillstech/intentlang/core , the BROWSER-SAFE barrel. Every symbol here is pure ESM with
// ZERO Node.js dependencies (no fs/path/url), so it bundles cleanly into a browser app
// (SkillsTech Studio's Vite build, Repo Mastery's projections). It is a strict superset of
// the original AI-core helpers, so existing `@skillstech/intentlang/core` imports keep
// working, plus the canonical schema/classification helpers and the pure Intent Runtime.

// AI-implementation helpers (unchanged , keeps existing /core consumers working).
export * from './ai-core.mjs';

// Classification model (observed/inferred/proposed/... + isFactual). Node-free.
export { CLASSIFICATIONS, CONFIDENCE, UNSETTLED, classify, isFactual, BLOCKABLE_PHASES } from './classification.mjs';

// Canonical Intent Graph schema constants + JSON Schema + diagnostic catalog. Node-free.
export {
  SCHEMA_VERSION, NODE_TYPES, RELATIONSHIP_TYPES, NODE_STATUSES,
  intentGraphJsonSchema, DIAGNOSTIC_RULES, CORE_DIAGNOSTICS, ALL_DIAGNOSTICS,
} from './intent-schema.mjs';

// Canonical proof envelope schema (intent-proof-v1) , browser-safe so a signing service or
// a cert renderer can validate the shared proof shape without a Node build.
export {
  PROOF_SCHEMA, CLAIM_STATUSES, PROOF_STATUSES, intentProofJsonSchema, validateProof,
} from './proof-schema.mjs';

// Human <-> Structured <-> IntentLang sync (browser-safe) , Studio's proposeIntent/parseToStructured.
export { parseToStructured, proposeIntent, SYNC_SCHEMA } from './sync.mjs';
// Structural source editing (browser-safe) , comment-preserving field edits for Studio.
export { applyEdits, PATCH_SCHEMA } from './patch.mjs';

// Intent IR (intent-ir-v1) , the shared ecosystem semantic representation (browser-safe).
export {
  IR_SCHEMA, IR_EMBEDS, IR_NODE_TYPES, IR_RELATIONSHIP_TYPES, PROVENANCE, isFactualProvenance,
  IR_CONFIDENCE, IR_CONFIDENCE_MEANING, confidenceFromClassification, SENSITIVITY, RETENTION,
  NODE_FIELDS, validateIR, graphToIR,
} from './intent-ir.mjs';

// The Intent Runtime , executable intent (evaluate decisions, simulate lifecycles). Pure.
export { evaluateDecision, simulateLifecycle, checkDecisionCases, RUNTIME_SCHEMA } from './runtime.mjs';
// Runtime enforcement (browser-safe) , a guard that blocks forbidden actions + redacts secrets.
export { buildGuard, compileGuard, guardSummary, GUARD_SCHEMA } from './guard.mjs';
// Prompt -> intent (browser-safe) , scaffold a rigorous draft + gap checklist from a brief.
export { draftIntent, DRAFT_SCHEMA } from './draft.mjs';
export { compileExpr, evalExpr, ExprError } from './expr.mjs';

// Style intent , canonical token address space + accessibility vocabulary (browser-safe).
// Studio and renderers bind to these instead of forking their own design-token trees.
export {
  analyzeStyle, styleDiagnostics, toDesignTokens, toCss, STYLE_SCHEMA, DESIGN_TOKENS_SCHEMA,
  TOKEN_PATHS, BRAND_PATHS, STYLE_ADDRESS_SPACE, ACCESSIBILITY_TARGETS, MODE_VALUES,
  ACCESSIBILITY_CLASSIFICATION,
} from './style.mjs';

// ── The compiler proper (now universal: the pure SHA-256 removed the last node:crypto dep) ──
// One source of truth for parsing, graph-building, analysis, and navigation, so OpenThunder
// (Node), the CLI (Node), SkillsTech Studio (browser), Repo Mastery (web), and SkillsTech
// Mobile (React Native) all run the SAME code, never a fork.

// The canonical SHA-256 the ecosystem keys on (intentProofHash, join keys). Node-free.
export { sha256, sha256hex } from './hash.mjs';
// Parser: `.intent` source -> Intent AST (+ slug for stable ids, KNOWN_LENSES).
export { parseIntent, slug, KNOWN_LENSES } from './parse.mjs';
// Intent Graph builder (intent-graph-v1): AST -> canonical graph.
export { buildIntentGraph, INTENT_GRAPH_SCHEMA } from './intent-graph.mjs';
// In-memory compile: AST/source -> every artifact (docs, graphs, plan, proof), no filesystem.
export { compileSource, renderMarkdown, renderLensDoc, renderMermaid, renderTestplan } from './compile.mjs';
// Semantic diagnostics (the Fable/scan spine input) , now Node-free.
export { semanticDiagnostics, buildContractGraph, buildArchitectureGraph, buildImplementationPlan, buildProof } from './emit.mjs';
// Intent Scanner + Fable: project -> Intent IR + explainable findings + risk themes.
export { scanIntent, scanProject, SCAN_SCHEMA } from './scan.mjs';
export { toFinding, universalPack, RISK_CATEGORIES, FABLE_SCHEMA } from './fable.mjs';
// Focused scan queries (risks/gaps/unverified/coverage/unknowns/contradictions).
export { VIEW_SCHEMA, VIEWS, coverageView, unverifiedView, gapsView, risksView, unknownsView, contradictionsView } from './scan-queries.mjs';
// Intent Atlas (whole-system map) + navigation primitives.
export { buildAtlas, atlasNode, expandNode, searchAtlas, ATLAS_SCHEMA } from './intent-atlas.mjs';
// Intent Lens: Intent Scope + Focus Graph + Intent Brief (a focused subgraph of the Atlas).
export { FOCUS_SCHEMA, SCOPE_TYPES, FOCUS_REASONS, makeScope, buildFocusGraph, intentBrief } from './focus.mjs';
// Comprehension Contract: the C0..C7 understanding level (browser-safe; every product reads it).
export { COMPREHENSION_SCHEMA, LEVELS as COMPREHENSION_LEVELS, comprehensionLevel, comprehensionReport } from './comprehension.mjs';
// Code generation: deterministic scaffolds from intent (browser-safe, so the playground renders it).
export { CODEGEN_SCHEMA, GENERATORS, toTypeScript } from './codegen.mjs';
// Change Lens: what a branch/PR changed by meaning (pure; the CLI supplies the git-diffed graphs).
export { CHANGES_SCHEMA, changeReport } from './changes.mjs';
export { subjectName } from './parse.mjs';
// Semantic diff + 3-way merge (Change Lens: diff by meaning).
export { diffGraphs, mergeGraphs } from './semantic-diff.mjs';
// Graph -> source (native round-trip) so a browser editor can regenerate .intent.
export { graphToSource, GRAPH_SOURCE_SCHEMA } from './graph-source.mjs';
