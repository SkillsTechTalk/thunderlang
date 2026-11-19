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

// Logic words that change meaning: worth a second glance.
export const THUNDER_LOGIC = ["not", "and", "or", "is", "no"];
const LOGIC = new Set(THUNDER_LOGIC);

const TOKEN =
  /("(?:[^"\\]|\\.)*"?)|([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)|(->|=>|>=|<=|==|!=|[<>=])|(-?\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|(.)/g;

export type Token = { text: string; cls?: string };

/** Split one line of ThunderLang into classed tokens. Pure: shared by React views and Markdown docs. */
export function tokenizeLine(line: string): Token[] {
  if (/^\s*(#|\/\/)/.test(line)) return [{ text: line, cls: "tok-comment" }];

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

  let leading = true;
  parts.forEach((p, i) => {
    if (!p.word) {
      if (p.text.trim()) leading = false;
      return;
    }
    const next = parts.slice(i + 1).find(n => n.text.trim());
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

/** Highlighted HTML for a whole ThunderLang source (for Markdown-rendered docs). */
export function highlightToHtml(source: string): string {
  return source.split("\n").map(line => tokenizeLine(line).map(t => t.cls ? `<span class="${t.cls}">${esc(t.text)}</span>` : esc(t.text)).join("")).join("\n");
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
