// One browser-side pipeline for the tutorial and the home page: readable contract -> checked
// examples -> six generated languages. Every step is the real compiler, deterministic, no AI.
import { previewHumanContract, type HumanContractPreview } from "../../compiler/src/human-contract.mjs";
import { parseIntent } from "../../compiler/src/parse.mjs";
import { translateDecisions } from "../../compiler/src/translate.mjs";
import type { OutputKey } from "@/components/LanguageOutput";

export type Compiled = { report: HumanContractPreview; code: Record<OutputKey, string> };

/** Compile a readable contract. Throws an Error whose message names the line and the fix. */
export function compileContract(source: string): Compiled {
  const report = previewHumanContract(source);
  const ast = parseIntent(report.canonicalSource);
  return {
    report,
    code: {
      typescript: translateDecisions(ast, "typescript"),
      python: translateDecisions(ast, "python"),
      go: translateDecisions(ast, "go"),
      rust: translateDecisions(ast, "rust"),
      csharp: translateDecisions(ast, "csharp"),
      java: translateDecisions(ast, "java"),
      thunder: report.canonicalSource,
    },
  };
}
