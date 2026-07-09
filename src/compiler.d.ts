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
