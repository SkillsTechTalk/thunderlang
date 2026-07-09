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

// Types for the plain-ESM IntentLang compiler imported by the /api/compile route.
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
