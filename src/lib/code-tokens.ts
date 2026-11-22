/**
 * Small tokenizer for the code ThunderLang generates (TypeScript, Python, Go, Rust, C#, Java),
 * using the same tok-* palette as ThunderLang so source and output read as one system.
 * It only needs to cover what the translator emits, not each language's full grammar.
 */
import type { Token } from "./thunder-tokens";

export type CodeLang = "typescript" | "python" | "go" | "rust" | "csharp" | "java";

// Keywords per family. JavaScript, PHP, Kotlin, and Ruby borrow the closest family (see readLang below).
const KEYWORDS: Record<CodeLang, string[]> = {
  typescript: ["export", "function", "if", "else", "return", "const", "let", "var", "interface", "throw", "new", "import", "from", "type", "async", "await", "for", "while", "of", "in", "switch", "case", "default", "break", "continue", "try", "catch", "finally", "class", "extends", "implements", "public", "private", "protected", "static", "readonly", "enum", "namespace", "use", "echo", "fn", "match", "elseif", "foreach", "as"],
  python: ["def", "if", "elif", "else", "return", "raise", "class", "import", "from", "for", "while", "in", "not", "and", "or", "is", "with", "as", "try", "except", "finally", "lambda", "pass", "yield", "async", "await", "global", "nonlocal", "end", "unless", "do", "then", "module", "require", "begin", "rescue", "ensure", "elsif", "case", "when"],
  go: ["package", "import", "func", "if", "else", "return", "var", "const", "type", "struct", "interface", "for", "range", "switch", "case", "default", "break", "continue", "go", "defer", "select", "map", "chan", "fallthrough"],
  rust: ["fn", "if", "else", "return", "let", "mut", "static", "const", "pub", "use", "mod", "impl", "struct", "enum", "trait", "match", "for", "in", "while", "loop", "where", "as", "ref", "move", "async", "await", "crate", "super", "dyn", "type", "unsafe"],
  csharp: ["public", "private", "protected", "internal", "static", "if", "else", "return", "class", "using", "namespace", "new", "var", "void", "async", "await", "for", "foreach", "in", "while", "switch", "case", "default", "break", "continue", "throw", "try", "catch", "finally", "readonly", "record", "interface", "override", "virtual", "abstract", "sealed", "get", "set"],
  java: ["public", "private", "protected", "static", "final", "if", "else", "return", "class", "import", "package", "new", "void", "for", "while", "switch", "case", "default", "break", "continue", "throw", "throws", "try", "catch", "finally", "extends", "implements", "interface", "enum", "fun", "val", "var", "when", "is", "in", "object", "companion", "data", "override", "open", "internal", "suspend"],
};

/** Map any reader language to the closest highlighting family. */
export function readLang(language: string): CodeLang {
  return ({ typescript: "typescript", javascript: "typescript", php: "typescript", python: "python", ruby: "python", go: "go", rust: "rust", csharp: "csharp", java: "java", kotlin: "java" } as Record<string, CodeLang>)[language] ?? "typescript";
}

const TYPES = new Set([
  "string", "number", "boolean", "unknown", "void", "float", "bool", "str", "float64", "f64", "double", "String",
  "int", "int64", "int32", "uint", "u32", "u64", "i32", "i64", "usize", "error", "byte", "rune", "decimal", "long", "char",
  "Int", "Long", "Double", "Boolean", "Float", "Any", "Unit", "list", "dict", "Vec", "Option", "Result", "any", "object",
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
