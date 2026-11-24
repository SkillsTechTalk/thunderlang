export type SourceLang = "python" | "typescript" | "javascript" | "java" | "csharp" | "go" | "rust" | "kotlin" | "php" | "ruby" | "sql";
export type SynClass = "syn-kw" | "syn-ctl" | "syn-str" | "syn-com" | "syn-num" | "syn-const" | "syn-fn" | "syn-type" | "syn-dec" | "syn-var" | "syn-op" | "syn-punc";
export type SourceToken = { text: string; cls?: SynClass };
/** The language to color, from a language name, a file name, or a label containing one; null if unsupported. */
export function sourceLang(hint: string | null | undefined): SourceLang | null;
/** Tokens for a whole source; joining their text gives back the exact source. */
export function tokenizeSource(source: string, langHint: string | null | undefined): SourceToken[];
/** The same tokens split into lines. */
export function sourceLines(source: string, langHint: string | null | undefined): SourceToken[][];
