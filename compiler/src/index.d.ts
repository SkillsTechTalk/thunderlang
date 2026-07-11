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
  // Product / intent-graph profile (intent-graph-v1)
  profiles: string[];
  title: string | null;
  actor: string | null;
  problem: string;
  persona: string | null;
  customer: string | null;
  evidence: Array<{ name: string; classification: string | null; confidence: string | null; source: string | null; line: number }>;
  outcomes: Array<{ name: string; description: string | null; line: number }>;
  metrics: Array<{ name: string; baseline: string | null; target: string | null; window: string | null; line: number }>;
  scope: { include: string[]; exclude: string[] };
  nonGoals: string[];
  owner: string | null;
  approvals: string[];
  unknowns: Array<{ name: string; owner: string | null; resolveBefore: string | null; blocks: string | null; line: number }>;
  questions: Array<{ name: string; askedOf: string | null; blocks: string | null; line: number }>;
  assumptionDecls: Array<{ name: string; confidence: string | null; validateWith: string | null; line: number }>;
  experiences: Array<{
    name: string; actor: string | null; goal: string; enterWhen: string[];
    journeys: Array<{ name: string | null; steps: string[] }>;
    states: Array<{ name: string | null; directives: string[]; offers: string[]; preserves: boolean; hasRecovery: boolean; line: number }>;
    responsive: string[]; accessible: { target: string | null; requirements: string[] };
    follows: string[]; line: number;
  }>;
  patterns: Array<{ name: string; requires: string[]; accessible: string[]; line: number }>;
  roleConstraints: Array<{ role: string; statement: string; line: number }>;
  conflicts: Array<{ name: string; between: string[]; options: string[]; resolveBy: string[]; before: string | null; resolution: null | { chosen: string | null; by: string | null; at: string | null; decision: string | null }; line: number }>;
  lifecycles: Array<{ name: string; states: string[]; transitions: Array<{ name: string | null; from: string | null; to: string | null; within: string | null }>; terminals: string[]; line: number }>;
  always: string[];
  eventually: Array<{ statement: string; within: string | null; line: number }>;
  until: Array<{ condition: string; restrict: string | null; line: number }>;
  commands: Array<{ name: string; idempotencyKey: string | null; timeout: string | null; retry: string | null; backoff: string | null; line: number }>;
  handlers: Array<{ trigger: string; compensate: string[]; notify: string[]; preserve: string[]; actions: string[] }>;
  decisions: Array<{ name: string; inputs: string[]; rules: Array<{ name: string | null; when: string | null; result: string | null; priority: string | null; line: number }>; default: string | null; explanationRequired: boolean; owner: string | null; line: number }>;
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

// Canonical Intent Graph (intent-graph-v1)
export const INTENT_GRAPH_SCHEMA: string;
export interface IntentGraphNode {
  id: string; type: string; title: string | null; description: string | null;
  status: string; owner: string | null; classification: string | null;
  confidence: string | null; source: string | null; tags: string[];
  createdTime: string | null; updatedTime: string | null;
}
export interface IntentGraph {
  schema: string; missionId: string;
  nodes: IntentGraphNode[];
  relationships: Array<{ from: string; type: string; to: string }>;
  summary: { nodes: number; relationships: number; byType: Record<string, number>; unresolved: number; approvalsRequired: number };
}
export function buildIntentGraph(ast: IntentAst): IntentGraph;

// Intent Atlas (whole-system navigable map over the graph)
export const ATLAS_SCHEMA: string;
export interface IntentAtlas {
  schema: string; product: string | null;
  overview: { missions: number; nodes: number; relationships: number; byType: Record<string, number> };
  missions: Array<{ id: string; title: string }>;
  nodes: IntentGraphNode[];
  relationships: Array<{ from: string; type: string; to: string }>;
}
export function buildAtlas(graphs: IntentGraph[], opts?: { product?: string }): IntentAtlas;
export function atlasNode(atlas: IntentAtlas, id: string): IntentGraphNode | null;
export function expandNode(atlas: IntentAtlas, id: string): { node: IntentGraphNode; out: Array<{ rel: string; node: { id: string } }>; inbound: Array<{ rel: string; node: { id: string } }> } | null;
export function searchAtlas(atlas: IntentAtlas, query: string, opts?: { type?: string; limit?: number }): IntentGraphNode[];

// Semantic diff (by meaning; invalidated-approval detection)
export interface IntentDiff {
  schema: string;
  addedNodes: IntentGraphNode[]; removedNodes: IntentGraphNode[];
  changedNodes: Array<{ id: string; type: string; before: IntentGraphNode; after: IntentGraphNode }>;
  addedRelationships: Array<{ from: string; type: string; to: string }>;
  removedRelationships: Array<{ from: string; type: string; to: string }>;
  invalidatedApprovals: string[];
  summary: { added: number; removed: number; changed: number; addedByType: Record<string, number>; removedByType: Record<string, number>; relationshipsAdded: number; relationshipsRemoved: number; approvalsInvalidated: number };
}
export function diffGraphs(before: { nodes: IntentGraphNode[]; relationships: Array<{ from: string; type: string; to: string }> }, after: { nodes: IntentGraphNode[]; relationships: Array<{ from: string; type: string; to: string }> }): IntentDiff;

// Classification model (intent-graph-v1 Section 5)
export const CLASSIFICATIONS: string[];
export const CONFIDENCE: string[];
export const UNSETTLED: Set<string>;
export const BLOCKABLE_PHASES: string[];
export function classify(word: string): string | null;
export function isFactual(classification: string): boolean;

// Constraint composition + conflict resolution (Gap 1)
export interface DetectedConflict { type: 'declared' | 'scope-contradiction' | 'redundant' | 'negation'; name: string; between: string[]; options?: string[]; resolveBy?: string[]; before?: string | null; status: string; }
export function composeConstraints(ast: IntentAst): { total: number; byRole: Record<string, string[]> };
export function detectConflicts(ast: IntentAst): DetectedConflict[];

// Temporal + lifecycle semantics (Gap 2)
export interface LifecycleIR { name: string; states: string[]; terminals: string[]; initial: string | null; transitions: Array<{ name: string | null; from: string | null; to: string | null; within: string | null }>; out: Record<string, string[]>; reachable: string[]; }
export function buildLifecycle(lc: IntentAst['lifecycles'][number]): LifecycleIR;
export function analyzeLifecycle(lc: IntentAst['lifecycles'][number]): { ir: LifecycleIR; findings: Array<{ code: string; message: string }> };

// Distributed + failure semantics (Gap 3)
export function analyzeDistributed(ast: IntentAst): Array<{ code: string; target: string; message: string }>;

// Decisions + rules (Gap 4)
export function analyzeDecision(dec: IntentAst['decisions'][number]): Array<{ code: string; message: string }>;

// Canonical schema (consumers generate bindings from this)
export const SCHEMA_VERSION: string;
export const NODE_TYPES: string[];
export const RELATIONSHIP_TYPES: string[];
export const NODE_STATUSES: string[];
export function intentGraphJsonSchema(): Record<string, unknown>;
export const DIAGNOSTIC_RULES: Array<{ ruleId: string; area: string; severity: string; blocks: string[]; summary: string }>;

// Deterministic candidate selection
export interface SelectionPolicy { require: string[]; prefer: Array<{ metric: string; direction: 'min' | 'max' }>; requireAllChecks: boolean; }
export function parseSelection(lines: string[]): SelectionPolicy;
export function regionMetrics(code: string): { size: number; complexity: number; dependencies: number };
export function selectCandidate(
  candidates: Array<{ id: string; metrics: Record<string, number>; checksPassed?: boolean }>,
  policy?: { prefer?: Array<{ metric: string; direction: 'min' | 'max' }>; requireAllChecks?: boolean },
): { winner: { id: string } | null; ranking: Array<{ id: string }>; eligibleCount: number; rejected: number; prefer: Array<{ metric: string; direction: string }> };

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
