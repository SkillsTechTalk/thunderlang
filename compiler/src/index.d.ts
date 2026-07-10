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
