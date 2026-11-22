/**
 * Small tokenizer for the code ThunderLang generates (TypeScript, Python, Go, Rust, C#, Java),
 * using the same tok-* palette as ThunderLang so source and output read as one system.
 * It only needs to cover what the translator emits, not each language's full grammar.
 */
import type { Token } from "./thunder-tokens";

export type CodeLang = "typescript" | "python" | "go" | "rust" | "csharp" | "java";

const KEYWORDS: Record<CodeLang, string[]> = {
  typescript: ["export", "function", "if", "return", "const", "let", "interface", "throw", "new", "import", "from", "type"],
  python: ["def", "if", "elif", "else", "return", "raise", "class", "import", "from"],
  go: ["package", "import", "func", "if", "return"],
  rust: ["fn", "if", "return", "let", "static"],
  csharp: ["public", "static", "if", "return", "class"],
  java: ["public", "static", "if", "return", "class"],
};

const TYPES = new Set([
  "string", "number", "boolean", "unknown", "void", "float", "bool", "str", "float64", "f64", "double", "String",
]);

const LITERALS = new Set(["true", "false", "True", "False", "None", "null", "nil"]);

const TOKEN =
  /(\/\/.*$|#.*$)|("(?:[^"\\]|\\.)*")|(===|!==|==|!=|>=|<=|&&|\|\||->|[<>!=])|(\d+(?:\.\d+)?(?:f64)?)|('static|[A-Za-z_][A-Za-z0-9_.]*)|(\s+)|(.)/gm;

export function tokenizeCode(source: string, lang: CodeLang): Token[] {
  const kw = new Set(KEYWORDS[lang]);
  const out: Token[] = [];
  let afterDef = false;
  for (const m of source.matchAll(TOKEN)) {
    const [text, comment, str, op, num, word, , punc] = m;
    if (comment && !(lang !== "python" && comment.startsWith("#"))) out.push({ text, cls: "tok-comment" });
    else if (comment) out.push({ text });
    else if (str) out.push({ text, cls: "tok-str" });
    else if (op) out.push({ text, cls: "tok-op" });
    else if (num) out.push({ text, cls: "tok-num" });
    else if (word && afterDef) { out.push({ text, cls: "tok-fn" }); afterDef = false; }
    else if (word) {
      if (/^(def|func|fn|function)$/.test(word)) afterDef = true;
      if (lang === "python" && /^(and|or|not)$/.test(word)) out.push({ text, cls: "tok-logic" });
      else if (kw.has(word)) out.push({ text, cls: "tok-key" });
      else if (LITERALS.has(word)) out.push({ text, cls: "tok-num" });
      else if (TYPES.has(word) || word === "'static") out.push({ text, cls: "tok-type" });
      else if (/^[A-Z]/.test(word)) out.push({ text, cls: "tok-type" });
      else out.push({ text });
    } else if (punc) out.push({ text, cls: "tok-punc" });
    else out.push({ text });
  }
  return out;
}
