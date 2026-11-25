// One browser-side pipeline for the tutorial and the home page: readable contract -> checked
// examples -> six generated languages. Every step is the real compiler, deterministic, no AI.
import { previewHumanContract, type HumanContractPreview } from "../../compiler/src/human-contract.mjs";
import { parseIntent } from "../../compiler/src/parse.mjs";
import { translateDecisions } from "../../compiler/src/translate.mjs";
import type { OutputKey } from "@/components/LanguageOutput";

/** The languages a Thunder decision compiles to today (the real translator, compiler/src/translate.mjs). */
export const RULE_TARGETS = ["typescript", "python", "go", "rust", "csharp", "java"] as const;

export type Compiled = { report: HumanContractPreview; code: Record<OutputKey, string> };

/** Compile a readable contract. Throws an Error whose message names the line and the fix. */
export function compileContract(source: string): Compiled {
  const report = previewHumanContract(source);
  const ast = parseIntent(report.canonicalSource);
  return {
    report,
    code: {
      ...(Object.fromEntries(RULE_TARGETS.map((k) => [k, translateDecisions(ast, k)])) as Record<(typeof RULE_TARGETS)[number], string>),
      thunder: report.canonicalSource,
    },
  };
}
