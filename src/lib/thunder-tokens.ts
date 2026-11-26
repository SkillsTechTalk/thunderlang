/**
 * ThunderLang tokenizer, shared by every surface that shows ThunderLang (code cards, the contract
 * editor, the tutorial, Markdown docs) so the language reads the same everywhere. Display only;
 * the canonical grammar lives in the compiler.
 */

// Section words that open a block (mostly line-leading).
export const THUNDER_KEYWORDS = [
  "mission", "goal", "why", "because", "requires", "input", "output",
  "guarantees", "guarantee", "never", "constraints", "assumptions", "risks",
  "target", "style", "implementation", "verify", "test", "observe", "secure",
  "explain", "ownership", "owner", "architecture", "dependencies", "contract",
  "plan", "proof", "field", "note", "service", "owns", "consumes", "publishes",
  "database", "api", "method", "path", "errors", "event", "publishedBy",
  "consumedBy", "payload", "given", "when", "then", "purpose", "decision",
  "otherwise", "examples", "case",
];
const KEYWORDS = new Set(THUNDER_KEYWORDS);

// Words that reliably open a ThunderLang file or block (used to detect unlabeled code blocks).
const LEAD_WORDS = new Set(["mission", "contract", "decision", "goal", "guarantee", "guarantees", "never", "service", "api", "event", "test", "examples", "purpose", "requires", "verify", "target", "architecture", "database", "use"]);

// Thunder Core: the words that start a statement (written with a capital at the start of a line), and the small
// words that join a statement's parts. Statement words are bold like keywords; joining words are softer.
const CORE_LEAD = new Set(["Set", "say", "Say", "print", "Keep", "Increase", "Decrease", "Add", "Remove", "Sort", "Reverse", "When", "If", "Otherwise", "For", "Repeat", "Stop", "Give", "Receive", "To", "Test", "Expect", "Use", "Never", "A", "An"]);
const CORE_SOFT = new Set(["to", "with", "by", "from", "in", "as", "at", "each", "while", "until", "times", "back", "has", "allow", "this", "fails", "otherwise", "where", "sorted", "descending", "joined", "split", "replacing", "starts", "ends", "contains", "given", "of", "the", "count", "sum", "average", "largest", "smallest", "least", "most", "more", "than", "less", "empty", "list", "map", "be", "fail", "fails", "if", "not", "given"]);
const CORE_KINDS = new Set(["text", "money", "number", "whole", "date", "optional", "list", "map"]);
const CORE_VALUES = new Set(["yes", "nothing", "true", "false"]);

// Logic words that change meaning: worth a second glance.
export const THUNDER_LOGIC = ["not", "and", "or", "is", "no"];
const LOGIC = new Set(THUNDER_LOGIC);

const TOKEN =
  /("(?:[^"\\]|\\.)*"?)|([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)|(->|=>|>=|<=|==|!=|[<>=])|(-?\$?\d[\d,]*(?:\.\d+)?%?)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|(.)/g;

export type Token = { text: string; cls?: string };

/** Split one line of ThunderLang into classed tokens. Pure: shared by React views and Markdown docs. */
export function tokenizeLine(line: string): Token[] {
  if (/^\s*(#|\/\/)/.test(line)) return [{ text: line, cls: "tok-comment" }];
  // A comment after the code (` # …`, outside text) is dimmed too.
  let q = false, cut = -1;
  for (let i = 0; i < line.length; i++) { if (line[i] === '"' && line[i - 1] !== "\\") q = !q; else if (!q && line[i] === "#" && /\s/.test(line[i - 1] ?? "")) { cut = i; break; } }
  if (cut > 0) return [...tokenizeLine(line.slice(0, cut)), { text: line.slice(cut), cls: "tok-comment" }];

  const parts: { text: string; cls?: string; word?: boolean }[] = [];
  for (const m of line.matchAll(TOKEN)) {
    const [text, str, id, op, num, word, , punc] = m;
    if (str) parts.push({ text, cls: "tok-str" });
    else if (id) parts.push({ text, cls: "tok-id" });
    else if (op) parts.push({ text, cls: "tok-op" });
    else if (num) parts.push({ text, cls: "tok-num" });
    else if (word) parts.push({ text, word: true });
    else if (punc) parts.push({ text, cls: "tok-punc" });
    else parts.push({ text });
  }

  // A "field: value" line (a record or a call written as a block): every word of the name is the field.
  const fieldLine = /^\s*[a-z][a-z0-9_]*(?: [a-z][a-z0-9_]*)*:\s+\S/.test(line);
  let beforeColon = fieldLine;
  let leading = true;
  // Thunder Core definitions: "To greet:" names a function, "A Trade has:" names a record.
  const core = /^\s*(?:To |An? [A-Z]\w*(?: [A-Z]\w*)* has:|Set |When |Give |Receive |For each |Test "|Expect |Keep |Increase |Decrease |Add |Repeat |say |Say |Stop |Otherwise|If |Use |Never )/.test(line);
  const fnDef = /^\s*To [a-z]/.test(line);
  // A record's field: "  Symbol is text", "  Buy price is money", "  Author is optional text".
  const kindLine = /^\s+[A-Z][\w ]* is (?:an? )?(?:optional )?(?:text|money|number|whole number|date|yes\/no|yes or no|list|map)\b/.test(line);
  let inName = false;
  parts.forEach((p, i) => {
    if (beforeColon && p.text === ":") beforeColon = false;
    if (beforeColon && p.word) { p.cls = "tok-field"; leading = false; return; }
    if (!p.word) {
      if (p.text.trim()) leading = false;
      return;
    }
    const next = parts.slice(i + 1).find(n => n.text.trim());
    if (kindLine) {
      if (CORE_KINDS.has(p.text) || p.text === "yes" || p.text === "no") { p.cls = "tok-type"; return; }
      if (LOGIC.has(p.text)) { p.cls = "tok-logic"; return; }
      if (/^[A-Z]/.test(p.text) && leading) { p.cls = "tok-field"; leading = false; return; }
      p.cls = "tok-field"; return;
    }
    if (core) {
      if (leading && CORE_LEAD.has(p.text)) { p.cls = "tok-key"; leading = false; inName = fnDef && p.text === "To"; return; }
      if (inName) { if (p.text === ":") inName = false; else { p.cls = "tok-fn"; return; } }
      if (CORE_VALUES.has(p.text)) { p.cls = "tok-num"; leading = false; return; }
      if (p.text === "each" && parts.slice(0, i).some((x) => x.text === "For")) { p.cls = "tok-key"; return; }
      if (LOGIC.has(p.text)) { p.cls = "tok-logic"; leading = false; return; }
      if (CORE_SOFT.has(p.text)) { p.cls = "tok-key-soft"; leading = false; return; }
      // A capitalised name in a statement is a record (Trade); other names stay plain unless a "field: value" line.
      if (/^[A-Z][A-Za-z0-9_]*$/.test(p.text)) { p.cls = "tok-type"; leading = false; return; }
      if (!fieldLine) { leading = false; return; }
    }
    if (KEYWORDS.has(p.text)) p.cls = leading ? "tok-key" : "tok-key-soft";
    else if (LOGIC.has(p.text)) p.cls = "tok-logic";
    else if (p.text === "true" || p.text === "false") p.cls = "tok-num";
    else if (next?.text === ":") p.cls = "tok-field";
    // Capitalised identifiers are types, unless they just start a prose sentence.
    else if (/^[A-Z][A-Za-z0-9_]+$/.test(p.text) && !(next?.word && /^[a-z]/.test(next.text))) p.cls = "tok-type";
    leading = false;
  });

  return parts.map(({ text, cls }) => ({ text, cls }));
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A text value with its {holes} marked, so a value written into text stands out from the words around it. */
const textHtml = (t: string) => esc(t).replace(/\{[^{}"]+\}/g, (h) => `<span class="tok-interp">${h}</span>`);

/** Highlighted HTML for a whole ThunderLang source (for Markdown-rendered docs). */
export function highlightToHtml(source: string): string {
  return source.split("\n").map(line => tokenizeLine(line).map(t => t.cls === "tok-str" ? `<span class="tok-str">${textHtml(t.text)}</span>` : t.cls ? `<span class="${t.cls}">${esc(t.text)}</span>` : esc(t.text)).join("")).join("\n");
}

/** True when a code block reads as ThunderLang: its first meaningful word opens a ThunderLang block. */
export function looksLikeThunder(source: string): boolean {
  const first = source.split("\n").map(l => l.trim()).find(l => l && !l.startsWith("#") && !l.startsWith("//"));
  const word = first?.match(/^[A-Za-z_]+/)?.[0];
  return !!word && LEAD_WORDS.has(word);
}

/**
 * Markdown (marked) code renderer: ThunderLang blocks get the shared palette. A block counts as
 * ThunderLang when labeled thunder/intent/thunderlang, or unlabeled and opening with a ThunderLang
 * block word. Anything else returns false so marked renders it as before.
 */
export function thunderCodeRenderer({ text, lang }: { text: string; lang?: string }): string | false {
  const label = (lang || "").trim().toLowerCase();
  const isThunder = ["thunder", "intent", "thunderlang", "thunder-human"].includes(label) || (!label && looksLikeThunder(text));
  if (!isThunder) return false;
  return `<pre class="thunder-code"><code>${highlightToHtml(text.replace(/\n$/, ""))}</code></pre>\n`;
}
