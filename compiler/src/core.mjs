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
  intentGraphJsonSchema, DIAGNOSTIC_RULES,
} from './intent-schema.mjs';

// Canonical proof envelope schema (intent-proof-v1) , browser-safe so a signing service or
// a cert renderer can validate the shared proof shape without a Node build.
export {
  PROOF_SCHEMA, CLAIM_STATUSES, PROOF_STATUSES, intentProofJsonSchema, validateProof,
} from './proof-schema.mjs';

// The Intent Runtime , executable intent (evaluate decisions, simulate lifecycles). Pure.
export { evaluateDecision, simulateLifecycle, checkDecisionCases, RUNTIME_SCHEMA } from './runtime.mjs';
export { compileExpr, evalExpr, ExprError } from './expr.mjs';

// Style intent , canonical token address space + accessibility vocabulary (browser-safe).
// Studio and renderers bind to these instead of forking their own design-token trees.
export {
  analyzeStyle, styleDiagnostics, toDesignTokens, STYLE_SCHEMA, DESIGN_TOKENS_SCHEMA,
  TOKEN_PATHS, BRAND_PATHS, STYLE_ADDRESS_SPACE, ACCESSIBILITY_TARGETS, MODE_VALUES,
  ACCESSIBILITY_CLASSIFICATION,
} from './style.mjs';
