// Type declarations for @skillstech/intentlang.
// Hand-written: the compiler core is ESM JavaScript. Shapes that are large or
// internal are typed loosely (Record/unknown); the primary entry points are typed.

/** A parsed .intent file. Loosely typed; fields are populated by parseIntent. */
export interface IntentAst {
  mission: string | null;
  goal: string;
  why: string;
  requires: string[];
  inputs: Array<{ name: string; type: string; modifiers: string[]; notes: string[]; line: number }>;
  outputs: Array<{ name: string; type: string; modifiers: string[]; notes: string[]; line: number }>;
  guarantees: Array<{ id: string; statement: string; because: string | null; verify: string[]; notes: string[]; line: number }>;
  neverRules: Array<{ id: string; statement: string; because: string | null; verify: string[]; notes: string[]; line: number }>;
  constraints: string[];
  targets: string[];
  style: string[];
  verify: string[];
  errors: Array<{ name: string; line: number }>;
  examples: Array<{ given: string; expect: string | null; line: number }>;
  architecture: string[];
  implementation: null | {
    id?: string; scope?: string; strategy?: string; editing?: string;
    risk?: string; approval?: string; pending: boolean;
    mayModify?: string[]; mustNotModify?: string[]; line?: number;
  };
  services: unknown[];
  apis: unknown[];
  events: unknown[];
  databases: unknown[];
  notes: unknown[];
  diagnostics: Diagnostic[];
  approval?: { reviewed: boolean; [k: string]: unknown };
  [k: string]: unknown;
}

export interface Diagnostic {
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  why?: string;
  fix?: Array<{ label: string; insert?: string; block?: string }>;
  [k: string]: unknown;
}

export interface MissionIndexEntry {
  missionId: string | null;
  mission: string | null;
  intentProofHash: string;
  file: string | null;
  area: string | null;
  risk: 'low' | 'medium' | 'high';
  riskFactors: string[];
  guarantees: number;
  neverRules: number;
  verifyTests: number;
  verification: 'none' | 'declared-partial' | 'declared-full';
  reviewed: boolean;
}

export interface MissionIndex {
  schema: 'mission-index-v1';
  generatedBy: string;
  product: string | null;
  note: string;
  missions: MissionIndexEntry[];
  summary: {
    missions: number;
    byArea: Record<string, number>;
    declaredFull: number;
    declaredPartial: number;
    unverified: number;
    highRisk: number;
  };
}

// Parsing
export function parseIntent(source: string): IntentAst;
export function slug(text: string): string;
export const KNOWN_LENSES: string[];

// Semantic analysis, graphs, proof
export function semanticDiagnostics(ast: IntentAst): Diagnostic[];
export function buildContractGraph(ast: IntentAst, generatedAt?: string): Record<string, unknown>;
export function buildArchitectureGraph(ast: IntentAst, generatedAt?: string): Record<string, unknown>;
export function buildImplementationPlan(ast: IntentAst, generatedAt?: string): Record<string, unknown>;
export function buildProof(ast: IntentAst, opts: {
  sourceFile: string; sourceHash: string; targetsRequested?: string[];
  targetsGenerated?: string[]; diagnostics: Diagnostic[]; generatedAt?: string;
}): Record<string, unknown>;
export function sha256(input: string): string;
export const COMPILER_VERSION: string;
export const PROOF_SCHEMA_VERSION: string;
export const SOURCE_PRODUCT: string;

// Compile + render
export function compileSource(source: string, opts?: { sourceFile?: string; generatedAt?: string }): Record<string, unknown>;
export function renderMarkdown(ast: IntentAst): string;
export function renderMermaid(ast: IntentAst): string;
export function renderTestplan(ast: IntentAst): string;

// IntelliSense
export function getCompletions(source: string, position: { line: number; column: number }): unknown;
export function getHover(source: string, position: { line: number; column: number }): unknown;
export const SEMANTIC_TYPES: string[];

// IntentLift
export function liftSource(source: string, opts?: { language?: string; file?: string }): Record<string, unknown>;
export function liftRepo(files: Array<{ file: string; source: string }>, opts?: { language?: string }): Record<string, unknown>;
export function languageForFile(file: string): string;
export function inferIntent(facts: unknown, opts?: unknown): Record<string, unknown>;
export function renderLiftedIntent(lifted: unknown): string;
export const SUPPORTED_LANGUAGES: string[];

// Approve + drift
export function approveIntent(text: string, opts?: { approvedBy?: string; approvedAt?: string }): Record<string, unknown>;
export function checkDrift(intentText: string, codeText: string, opts?: { language?: string }): Record<string, unknown>;
export function buildDriftHandoff(text: string, opts?: { generatedAt?: string }): Record<string, unknown>;
export function intentHash(text: string): string;

// Mission Atlas
export function buildMissionIndex(
  files: Array<{ path?: string; source: string }>,
  opts?: { product?: string },
): MissionIndex;

// Architecture rules
export interface ArchitectureRule { from: string; relation: 'must-not-depend-on' | 'must-depend-on' | 'may-depend-on' | 'may-implement'; to: string; raw: string; }
export function parseArchitectureRules(lines: string[]): { rules: ArchitectureRule[]; unparsed: string[] };
export function violatesArchitecture(rules: ArchitectureRule[], from: string, to: string): ArchitectureRule | null;

// Intent AI implementations (intent-ai-v1)
export type ImplementationState =
  | 'PENDING' | 'GENERATED' | 'VERIFIED' | 'VERIFIED_AWAITING_APPROVAL'
  | 'APPROVED' | 'MODIFIED' | 'INVALID' | 'REJECTED' | 'ADOPTED';
export const IMPLEMENTATION_STATES: ImplementationState[];
export const RISK_LEVELS: Array<'low' | 'medium' | 'high' | 'critical'>;
export const HIGH_RISK: Set<string>;
export const MANIFEST_SCHEMA_VERSION: string;
export const COMMENT_PREFIX: Record<string, string>;
export const PROOF_CHECK_KEYS: string[];
export function blocksProduction(status: ImplementationState, opts?: { approvalRequired?: boolean }): boolean;
export interface MarkerRegion { token: string; id: string | null; attrs: Record<string, string>; startLine: number; endLine?: number; code?: string; }
export interface MarkerFinding { code: string; line: number; message: string; }
export function parseMarkers(code: string): { regions: MarkerRegion[]; findings: MarkerFinding[] };
export function renderMarker(meta: Record<string, unknown>, language?: string, opts?: { token?: string }): { open: string; close: string };
export function contractHash(ast: IntentAst): string;
export function implementationHash(regionCode: string): string;
export function buildImplementationPrompt(ast: IntentAst, opts?: { language?: string }): string;
export function buildManifest(
  files: Array<{ path?: string; source: string; ast: IntentAst }>,
  opts?: { projectId?: string },
): {
  schemaVersion: string; projectId: string | null; generatedBy: string;
  implementations: Array<Record<string, unknown>>;
  summary: { total: number; byStatus: Record<string, number>; approvalRequired: number };
};
export interface ResolvedState { status: ImplementationState; approvalRequired: boolean; reasons: MarkerFinding[]; }
export function resolveState(ctx: {
  ast: IntentAst; region?: MarkerRegion | null;
  proof?: { status?: string; contractHash?: string; implementationHash?: string } | null;
  approval?: { contractHash?: string; implementationHash?: string } | null;
}): ResolvedState;
export function productionGate(
  resolved: Array<{ id?: string; status: ImplementationState; approvalRequired?: boolean }>,
  opts?: { allowPending?: boolean },
): { ok: boolean; blocking: Array<{ id?: string; status: ImplementationState }>; total: number };
export function adoptRegion(code: string, id: string, language?: string): { code: string; adopted: string } | null;
export const APPROVALS_SCHEMA_VERSION: string;
export interface ApprovalRecord { decision: 'approved' | 'rejected'; by: string | null; role: string | null; note: string | null; contractHash: string; implementationHash: string; at: string | null; }
export interface ApprovalsStore { schemaVersion: string; approvals: Record<string, ApprovalRecord>; }
export function emptyApprovals(): ApprovalsStore;
export function approvalFor(store: ApprovalsStore, id: string): ApprovalRecord | null;
export function recordDecision(store: ApprovalsStore, id: string, rec: {
  decision: 'approved' | 'rejected'; by?: string; role?: string; note?: string;
  contractHash?: string; implementationHash?: string; at?: string;
}): { store: ApprovalsStore; record: ApprovalRecord } | { error: string };
export const INTENT_AI_EVENTS: string[];
export function makeEvent(type: string, fields?: Record<string, unknown>): Record<string, unknown>;
