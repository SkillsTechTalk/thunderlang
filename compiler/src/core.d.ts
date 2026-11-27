// Types for `@skillstech/thunderlang/core` , the universal (Node + browser + React Native)
// surface. This re-exports exactly the symbols core.mjs exports, using the declarations in
// index.d.ts as the single source of truth. It intentionally does NOT re-export the Node-only
// surface (CLI, LSP, filesystem lift/drift), so a consumer cannot type-import something that
// is not actually in the universal build.

// The canonical hash (byte-identical to node:crypto).
export { sha256, sha256hex } from './index';
export { runTests, TEST_SCHEMA, TestReport, resolveObligations, ObligationResolution } from './index';
export { HumanContractPreview, compileHumanContract, previewHumanContract, renderHumanContract, renderExampleTable } from './human-contract.mjs';
export { ANCHOR_SCHEMA, spanRange, spanText, replaceSpan, editStep, anchorReport } from './anchor.mjs';
export { WRITE_SCHEMA, writeRule, changedCases, ruleParts, joinRuleParts, COMPARISON_CHOICES } from './write.mjs';
export { WRITE_STEPS_SCHEMA, WRITE_STEPS_LANGUAGES, EDIT_OPS, thunderWrite, proveChange, describeEdit, unifiedDiff } from './write-steps.mjs';
export type { ThunderEdit, ThunderWriteResult, WriteProof } from './write-steps.mjs';
export { STEPS_SCHEMA, classifyStatement } from './steps.mjs';
export { EXPR_SCHEMA, RENDER_LANGUAGES, parseExpr, parseStatement, renderExpr, renderStatement, sayFull, detailParts, detailOf, exprCounts, normalizeExpr, sameExpr, wordsAgree } from './meaning.mjs';
export type { Expr } from './meaning.mjs';
export { VISUAL_SCHEMA, THUNDER_VISUAL, LEVELS, PLACES, visualFor, visualForStep, thunderText, thunderTokens } from './visual.mjs';
export { MODEL_SCHEMA, THING_LANGUAGES, thunderModel, modelText, readLevel, flowOf, ruleFlow, askAsQuestion, stepDoes, pathsOf } from './model.mjs';
/** A React or Angular component read as a screen (src/screens.mjs). */
export interface Screen {
  id: string; kind: 'screen'; framework: 'react' | 'angular'; name: string; label: string; file: string; lines: [number, number];
  selector?: string; template?: string; member?: string; thing?: string;
  inputs: Array<{ name: string; label: string; kind?: string; optional?: boolean; required?: boolean; start?: string; callback?: boolean }>;
  state: Array<{ name: string; label: string; start?: string; how: string; line?: number }>;
  shows: ScreenLine[]; early?: Array<{ when: string; shows: ScreenLine[]; line?: number }>;
  events: Array<{ on: string; event: string; when: string; runs: string; line?: number; member?: string; file?: string }>;
  effects: Array<{ when: string; runs: string; line?: number; member?: string }>;
  outputs: Array<{ name: string; label: string; line?: number }>; services?: string[];
  uses: Array<{ id?: string; label: string; outside?: boolean }>; usedBy?: Array<{ id: string; label: string }>;
  notRead: Array<{ line?: number; code: string; why: string; file?: string }>;
  /** page: a Next.js page file or a component a router opens; top: no other screen shows it; part: shown inside another. */
  role?: 'page' | 'top' | 'part'; roleWhy?: string;
}
export interface ScreenLine { says: string; line?: number; kids?: ScreenLine[]; otherwise?: { says: string; line?: number; kids: ScreenLine[] }; notRead?: boolean; /** for a not-read line: the code, without the "not read:" words */ code?: string }
/** A step on an access path, linked to its source line. */
export interface AccessStep { kind: 'input' | 'identity' | 'lookup' | 'change' | 'guard' | 'response' | 'stopped'; says: string; file: string; line: number | null }
export type AccessVerdict = 'guarded' | 'unguarded' | 'cannot tell';
/** One path from the request to a response or a change, about one record (src/flow/access.mjs). */
export interface AccessPath { verdict: AccessVerdict; why: string; steps: AccessStep[]; record: string | null; lines: number[] }
/** One web route's ownership verdict; null when it reads or changes no stored record chosen by the request. */
export interface AccessRoute { method: string; path: string; framework: string; file: string; line: number; verdict: AccessVerdict | null; why: string; identity: { says: string; file: string; line: number } | null; paths: AccessPath[] }
export interface AccessReport { schema: 'thunder-access-v1'; routes: AccessRoute[]; summary: { routes: number; guarded: number; unguarded: number; cannotTell: number; noLookup: number }; unread: Array<{ file: string; line: number | null; why: string }> }
export const ACCESS_SCHEMA: 'thunder-access-v1';
/** Does every path that hands back or changes a record chosen by the request limit it to the caller? TypeScript/JavaScript. */
export function accessFlow(files: Array<{ path: string; source: string }>, options?: { maxRoutes?: number }): AccessReport;
export function accessText(report: AccessReport): string;
export function ownershipWords(route: AccessRoute): string | null;
export function readScreens(files: Array<{ path: string; source: string }>, options?: { members?: unknown[] }): Screen[];
export function screenText(screen: Screen): string;
export { RUNNING_SCHEMA, runtimeOverlay, runtimeText, explainError, parseStack, parseStacks, fromTrace, fromStack, fromLogs, fromOtlp, nodeNote } from './running.mjs';
export type { RunEvent, RuntimeOverlay, MemberRun, NodeRun, ParsedStack, ErrorExplanation } from './running.mjs';
export { linkSystem, callsSummary, areaOf } from './system.mjs';
export { THUNDERIZE_SCHEMA, THUNDER_TEXT_EXT, thunderizeFile, thunderizeFiles } from './thunderize.mjs';
export { SAME_SCHEMA, sameMeaning, compareRules, comparePlainRules, renderSame } from './same.mjs';
export { REVIEW_SCHEMA, REVIEW_MARKER, thunderReview, renderReview } from './review.mjs';
export { renderReviewComment, reviewCounts, GITHUB_COMMENT_LIMIT } from './review-comment.mjs';
export type { ColorRole, ElementKind, Provenance as VisualProvenance, Visual } from './visual.mjs';
export { plainFromReading } from './plain-contract.mjs';
export function conditionText(model: unknown, condition: unknown): string;
export function getCompletions(source: string, position: { line: number; column: number }): unknown;
export function getHover(source: string, position: { line: number; column: number }): unknown;
export function autocorrectSource(source: string): { source: string; changes: unknown[] };
export function getCodeActions(source: string, diagnostics?: unknown[]): unknown[];
export const SEMANTIC_TYPES: string[];
export { PLAIN_SCHEMA, PlainModel, PlainPreview, PlainExplanation, parsePlainContract, renderPlainContract, plainToThunder, compilePlainContract, previewPlainContract, explainPlain } from './plain-contract.mjs';

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
export { buildReviewAtlas, renderReviewBrief, reviewAtlasExitCode, REVIEW_ATLAS_SCHEMA, ReviewFile, ReviewStatus, ReviewAtlasRow, ReviewAtlas } from './review-atlas.mjs';
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
export { CODEGEN_SCHEMA, GENERATORS, toTypeScript, toCSharp, toJava, toPython, generateWithDiagnostics, subjectName, intentRefId, skillRefId } from './index';
export { GEN_UNTRANSLATED, ERROR_KINDS, isCaseResult, untranslatedMessage, parseMoney, formatMoney, roundHalfUp, minorUnitsFor, moneyTypeMinorUnits, MoneyError, MONEY_DEFAULT_MINOR_UNITS } from './index';
export type { CaseResult, TargetRun, TargetErrorKind, GenerationDiagnostic } from './index';

// 12-Factor Agents conformance lens (twelve-factor-v1).
export { TWELVE_FACTOR_SCHEMA, TwelveFactorResult, twelveFactorReport, twelveFactorSummary } from './index';

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

// Human <-> Structured <-> ThunderLang sync + comment-preserving structural editing.
export {
  parseToStructured, proposeIntent, SYNC_SCHEMA, applyEdits, PATCH_SCHEMA,
} from './index';

// Style intent , canonical token address space + accessibility vocabulary.
export {
  analyzeStyle, styleDiagnostics, toDesignTokens, toCss, STYLE_SCHEMA, DESIGN_TOKENS_SCHEMA,
} from './index';

// Decisions -> readable typed source in six languages.
export { translateDecisions, translateDecisionsWithDiagnostics, TRANSLATE_LANGUAGES } from './translate.mjs';
export type { TranslateLanguage } from './translate.mjs';

// Read code you don't know.
export { readCode, searchReading, detectLanguage, READ_SCHEMA, READ_LANGUAGES, INFRA_LANGUAGES } from './read.mjs';
export type { Reading, ReadItem, ReadKind } from './read.mjs';
export function completenessOf(item: unknown): { level: 'explained' | 'partly explained' | 'found' | 'executed'; reasons: string[] };
export function displayLabel(name: string): string;
export { readRepo, searchRepo, groupByFile, readableLanguage, readableFile, readFiles, readingOf, READ_REPO_SCHEMA, READ_SKIP_DIRS } from './read-repo.mjs';
export type { RepoItem, RepoFacet, RepoReading, RepoFilter } from './read-repo.mjs';
export { promoteDecision, PROMOTE_SCHEMA } from './promote.mjs';
export type { Promotion } from './promote.mjs';

// Everything OpenThunder's Read in Thunder and Thunder Live use (see src/core.mjs).
export { COLORS, SYMBOLS, DOES } from './visual.mjs';
export type { ColorRole as VisualColorRole } from './visual.mjs';
export type { ThunderModel, Member, Thing, FlowNode, Flow, LevelView } from './model.mjs';
export { terminatorEffect, toThunderCondition, toThunderOutcome, sayCondition } from './read.mjs';
export type { ReadStep } from './read.mjs';
export { PASSPORT_SCHEMA, ALWAYS_NOT_VERIFIED, assemblePassport, summarize, checkPassport, renderPassportSummary, renderPassportMarkdown } from './passport.mjs';
export type { Passport, PassportEvidence, PassportCheck, PassportInput } from './passport.mjs';
export { formatValue } from './plain-contract.mjs';
export type { PlainInput } from './plain-contract.mjs';
export type { RulePart, WriteChange, ChangedCase, ChangedCases } from './write.mjs';

// One rule change written into every service that implements it (src/write-across.mjs, docs/thunder-write.md).
export const WRITE_ACROSS_SCHEMA: 'thunder-write-across-v1';
export interface WriteAcrossFile { part?: string; path: string; source: string }
export interface WriteAcrossPlace { part?: string; file: string; language: string; decision: string; rule: number; line: number; why: string }
export interface WriteAcrossLookalike extends WriteAcrossPlace { when: string; result: string; decisionLine: number }
export function findSameRule(files: WriteAcrossFile[], options: { decision: string; rule: number | string }): { ok: boolean; anchor?: WriteAcrossLookalike; same?: WriteAcrossLookalike[]; notIncluded?: WriteAcrossLookalike[]; problems: string[] };
export interface WriteAcrossResult {
  schema: 'thunder-write-across-v1'; ok: boolean; rule?: { before: string; after: string };
  plan: Array<WriteAcrossPlace & { before: string; after: string; change: Array<{ line: number; column: number; before: string; after: string }> }>;
  notIncluded: WriteAcrossLookalike[]; tests: Array<{ part?: string; file: string; line: number; text: string }>;
  /** "part/path" -> the new contents of each changed file; empty unless ok. */
  files: Record<string, string>; problems: string[];
}
export function writeRuleAcross(files: WriteAcrossFile[], options: { decision: string; rule: number | string; when: string }): WriteAcrossResult;
export function writeAcrossEvidence(result: WriteAcrossResult | { ok: false }): Array<{ kind: 'rule-write'; status: 'read'; claim: string; basis: unknown; scope: string; inputs: Array<{ part?: string; file: string }> }>;

// What a reading shows and in what order (src/reading-layout.mjs).
export { READING_LAYOUT_SCHEMA, READING_LABELS, readingLayout, thingCard, dataCard, ioBoxes, detailsLayout, flowEdgeLabel, memberSymbolId } from './reading-layout.mjs';
export type { ReadingLayout, ThingCardLayout, DataCardLayout, IOBoxesLayout, DetailsLayout, When, KnowsLine, ThunderSymbolId } from './reading-layout.d.mts';
