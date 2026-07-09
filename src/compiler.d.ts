// Types for the plain-ESM IntentLang compiler imported by the /api/compile route.
declare module "*/compiler/src/compile.mjs" {
  export interface Diagnostic {
    level: "error" | "warning" | "info";
    code: string;
    message: string;
  }
  export interface CompileResult {
    mission: string;
    diagnostics: Diagnostic[];
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
