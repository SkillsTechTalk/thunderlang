import type { IntentAst } from './index.js';
export type TranslateLanguage = 'typescript' | 'python' | 'go' | 'rust' | 'csharp' | 'java';
export const TRANSLATE_LANGUAGES: Array<{ key: TranslateLanguage; label: string }>;
/** Translate every decision in a parsed ThunderLang AST into readable, typed source. Deterministic. */
export function translateDecisions(ast: IntentAst, lang: TranslateLanguage): string;
