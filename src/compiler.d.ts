declare module "*/compiler/src/drift.mjs" {
  export function approveIntent(
    intentText: string,
    opts?: { approvedBy?: string | null; approvedAt?: string | null },
  ): { text: string; approval: { reviewed: boolean; source_hash: string } };
  export function checkDrift(
    intentText: string,
    codeSource: string,
    opts?: { language?: string },
  ): {
    status: string;
    findings: { level: string; code: string; message: string }[];
    summary: { status: string; findings: number; blocking: number };
  };
  export function intentHash(intentText: string): string;
  export function buildDriftHandoff(
    intentText: string,
    opts?: { generatedAt?: string | null },
  ): Record<string, unknown> & { kind: string; mission: string; approved: boolean };
}

declare module "*/compiler/src/lift.mjs" {
  export interface LiftResult {
    ok: boolean;
    error?: string;
    intentText?: string;
    diagnostics?: { level: string; code: string; message: string }[];
    summary?: {
      mission: string;
      confidence: string;
      reviewed: boolean;
      evidenceCount: number;
      unknowns: string[];
      functions: number;
      tests: number;
    };
  }
  export function liftSource(
    source: string,
    opts?: { language?: string; file?: string },
  ): LiftResult;
}

declare module "*/compiler/src/intellisense.mjs" {
  export interface CompletionItem {
    id: string;
    label: string;
    kind: string;
    detail: string;
    insertText: string;
    sortText: string;
    source: string;
    confidence: string;
  }
  export interface HoverInfo {
    target: string;
    kind: string;
    title: string;
    description: string;
    examples: string[];
    relatedSuggestions: string[];
  }
  export function getCompletions(
    source: string,
    position?: { line?: number; column?: number },
  ): { items: CompletionItem[] };
  export function getHover(
    source: string,
    position?: { line?: number; column?: number },
  ): { hover: HoverInfo | null };
}

// Types for the plain-ESM ThunderLang compiler imported by the /api/compile route.
declare module "*/compiler/src/compile.mjs" {
  export interface Fix {
    label: string;
    insert?: string;
    block?: string;
  }
  export interface Diagnostic {
    level: "error" | "warning" | "info";
    code: string;
    message: string;
    why?: string;
    fix?: Fix[];
  }
  export interface IntentNote {
    id: string;
    lens: string;
    text: string;
    targetKind: string;
    targetPath: string;
    sourceSpan: { line: number; column: number };
  }
  export interface CompileResult {
    mission: string;
    diagnostics: Diagnostic[];
    notes: IntentNote[];
    artifacts: {
      markdown: string;
      mermaid: string;
      testplan: string;
      contractGraph: unknown;
      architectureGraph: unknown;
      implementationPlan: unknown;
      proof: Record<string, unknown>;
    };
  }
  export function compileSource(
    source: string,
    opts?: { sourceFile?: string; generatedAt?: string },
  ): CompileResult;
}

declare module "*/compiler/src/parse.mjs" {
  export function parseIntent(source: string): {
    mission?: string | null;
    decisions?: Array<{
      name: string;
      inputs: string[];
      rules: Array<{ name: string | null; when: string | null; result: string | null }>;
      default: string | null;
      explanationRequired: boolean;
    }>;
    lifecycles?: Array<{
      name: string;
      states: string[];
      transitions: Array<{ name: string | null; from: string | null; to: string | null }>;
      terminals: string[];
    }>;
    [key: string]: unknown;
  };
  export function slug(s: string): string;
}

// Types for the proof surface used by src/lib/self-proof.ts and /api/proof.
declare module "*/compiler/src/emit.mjs" {
  export const COMPILER_VERSION: string;
  export interface SemanticDiagnostic {
    level: "error" | "warning" | "info";
    code: string;
    message: string;
    [key: string]: unknown;
  }
  export function semanticDiagnostics(ast: unknown): SemanticDiagnostic[];
  export interface ProofClaim {
    id: string;
    text: string;
    status: string;
    evidence: string[];
    verifications: unknown[];
    provenBy?: string | null;
  }
  export interface ProofArtifact {
    schemaVersion: string;
    missionName: string | null;
    sourceFile: string;
    sourceHash: string;
    compilerVersion: string;
    generatedAt: string;
    guarantees: ProofClaim[];
    neverRules: ProofClaim[];
    verification: { syntaxPassed: boolean; semanticPassed: boolean; targetsGenerated: boolean };
    diagnostics: SemanticDiagnostic[];
    proofStatus: string;
    [key: string]: unknown;
  }
  export function buildProof(
    ast: unknown,
    opts: {
      sourceFile: string;
      sourceHash: string;
      targetsRequested: string[];
      targetsGenerated: string[];
      diagnostics: SemanticDiagnostic[];
      generatedAt: string;
      origin?: string;
    },
  ): ProofArtifact;
}

declare module "*/compiler/src/testing.mjs" {
  export interface TestResult {
    target: string;
    case: string;
    kind: string;
    pass: boolean;
    [key: string]: unknown;
  }
  export function runTests(ast: unknown): {
    schema: string;
    total: number;
    passed: number;
    failed: number;
    results: TestResult[];
    ok: boolean;
  };
}

declare module "*/compiler/src/hash.mjs" {
  export function sha256hex(input: string): string;
  export const sha256: (s: string) => string;
}

declare module "*/compiler/src/runtime.mjs" {
  export interface DecisionRun {
    schema: string;
    decision: string;
    result: string | null;
    matched: string | null;
    undecided: boolean;
    explanationRequired: boolean;
    trace: Array<{ rule: string | null; when: string | null; matched: boolean; error?: string; note?: string }>;
    ok: boolean;
  }
  export interface LifecycleSim {
    schema: string;
    lifecycle: string;
    path: string[];
    steps: Array<{ event: string; from: string; to: string; ok: boolean; reason?: string; transition?: string | null }>;
    finalState: string | null;
    valid: boolean;
    endedTerminal: boolean;
  }
  export function evaluateDecision(dec: unknown, inputs?: Record<string, unknown>): DecisionRun;
  export function simulateLifecycle(lc: unknown, events?: string[]): LifecycleSim;
  export function checkDecisionCases(dec: unknown, cases?: Array<{ name?: string; inputs?: Record<string, unknown>; expect?: unknown }>): { schema: string; decision: string; total: number; passed: number; results: unknown[] };
}
