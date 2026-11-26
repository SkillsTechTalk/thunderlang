// Code blocks in the docs, shown as small editor windows: a title bar that says what the block is (Thunder, Terminal,
// Output, Python, thunder.toml, Diagram…) and a Copy button, over the colored code. Display only: the code text is
// unchanged, so what you copy is exactly what the doc says.
import { thunderCodeRenderer } from "./thunder-tokens";
import { terminalCodeRenderer } from "./terminal-tokens";
import { sourceLang, tokenizeSource } from "./source-tokens.mjs";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const span = (cls: string, s: string) => `<span class="${cls}">${esc(s)}</span>`;

const NAMES: Record<string, string> = {
  python: "Python", py: "Python", typescript: "TypeScript", ts: "TypeScript", tsx: "TypeScript", javascript: "JavaScript",
  js: "JavaScript", jsx: "JavaScript", java: "Java", csharp: "C#", cs: "C#", go: "Go", rust: "Rust", kotlin: "Kotlin",
  sql: "SQL", ruby: "Ruby", php: "PHP", swift: "Swift", lua: "Lua", css: "CSS", json: "JSON", yaml: "YAML", yml: "YAML",
  toml: "TOML", markdown: "Markdown", md: "Markdown",
};

/** JSON, YAML, and TOML: keys, strings, numbers and true/false, [sections], and # comments. */
function configLine(line: string): string {
  const m = line.match(/^(\s*)(\[[^\]]*\])(\s*(#.*)?)$/);
  if (m) return esc(m[1]) + span("syn-type", m[2]) + (m[4] ? esc(m[3].slice(0, m[3].length - m[4].length)) + span("syn-com", m[4]) : esc(m[3]));
  let out = "";
  const re = /("(?:[^"\\]|\\.)*"|'[^']*')(\s*:)?|((?<=^\s*(?:- )?)[A-Za-z_][\w.-]*)(?=\s*[:=])|(-?\b\d+(?:\.\d+)?\b)|\b(true|false|null)\b|(\s#.*$|^#.*$)/g;
  let last = 0;
  for (const x of line.matchAll(re)) {
    out += esc(line.slice(last, x.index));
    if (x[1]) out += x[2] ? span("syn-var", x[1]) + esc(x[2]) : span("syn-str", x[1]);
    else if (x[3]) out += span("syn-var", x[3]);
    else if (x[4]) out += span("syn-num", x[4]);
    else if (x[5]) out += span("syn-const", x[5]);
    else out += span("syn-com", x[6]);
    last = (x.index ?? 0) + x[0].length;
  }
  return out + esc(line.slice(last));
}

const looksLikeDiagram = (t: string) => /[─│┌┐└┘├┤▶◀►→←↓↑]|-->|──|\|\s*$/m.test(t);

/** The title bar's words for a block, from its fence label and, for thunder.toml and the like, its first lines. */
function titleFor(lang: string, text: string, kind: string): string {
  if (kind === "thunder") return "Thunder";
  if (kind === "shell") return "Terminal";
  if (kind === "output") return "Output";
  if (kind === "diagram") return "Diagram";
  if (lang === "toml" && /^\[project\]/m.test(text)) return "thunder.toml";
  return NAMES[lang] ?? (lang ? lang : "Text");
}

/** marked's code renderer: every fenced block becomes a code window. */
export function docCodeRenderer({ text, lang }: { text: string; lang?: string }): string {
  const label = (lang || "").trim().toLowerCase().split(/\s+/)[0];
  const body = text.replace(/\n$/, "");
  let kind = "code";
  let pre = thunderCodeRenderer({ text, lang: label });
  if (pre) kind = "thunder";
  if (!pre) {
    pre = terminalCodeRenderer({ text, lang: label });
    if (pre) kind = /^(text|txt|output)$/.test(label) ? (looksLikeDiagram(body) && /[─│┌└]|──/.test(body) ? "diagram" : "output") : "shell";
  }
  if (!pre && ["json", "yaml", "yml", "toml"].includes(label)) {
    pre = `<pre class="config-code"><code>${body.split("\n").map(configLine).join("\n")}</code></pre>`;
  }
  if (!pre && label && sourceLang(label)) {
    const html = tokenizeSource(body, label).map((t) => (t.cls ? span(t.cls, t.text) : esc(t.text))).join("");
    pre = `<pre class="source-code"><code>${html}</code></pre>`;
  }
  if (!pre) {
    kind = !label && looksLikeDiagram(body) ? "diagram" : "code";
    pre = `<pre class="plain-code"><code>${esc(body)}</code></pre>`;
  }
  const title = titleFor(label, body, kind);
  const copy = kind === "diagram" || kind === "output" ? "" : `<button type="button" class="code-copy" data-copy aria-label="Copy this ${esc(title)} code">Copy</button>`;
  return `<figure class="code-window code-${kind}"><figcaption class="code-bar"><span class="code-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="code-title">${esc(title)}</span>${copy}</figcaption>${pre.trim()}</figure>\n`;
}

/** A heading's anchor id: lower-case words joined by dashes, made unique within the page. */
export function slugger() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = text.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "section";
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
}
