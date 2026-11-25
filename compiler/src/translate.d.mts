import type { IntentAst } from './index.js';
import type { GenerationDiagnostic } from './target-result.mjs';
export type TranslateLanguage = 'typescript' | 'python' | 'go' | 'rust' | 'csharp' | 'java';
export const TRANSLATE_LANGUAGES: Array<{ key: TranslateLanguage; label: string }>;
/** Translate every decision in a parsed ThunderLang AST into readable, typed source. Deterministic. */
export function translateDecisions(ast: IntentAst, lang: TranslateLanguage): string;
/** Same source plus one IL-GEN-001 diagnostic per rule condition the language cannot express (that rule throws). */
export function translateDecisionsWithDiagnostics(ast: IntentAst, lang: TranslateLanguage): { code: string; diagnostics: GenerationDiagnostic[] };
