// Color for terminal blocks in the docs (```sh / ```bash / ```console, and ```text output), matching the thunder CLI's
// own colors (compiler/src/term.mjs): commands to type in cyan, ✓ green, ✗ red, ! and ◆ yellow, labels in bold,
// comments dimmed. Display only: the text is unchanged, and every mark also has its words.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const span = (cls: string, s: string) => `<span class="${cls}">${esc(s)}</span>`;

const SHELL = new Set(["sh", "bash", "shell", "zsh", "console", "terminal"]);
const OUTPUT = new Set(["text", "txt", "output"]);

/** One shell line: `$ ` prompt, the command and its sub-command, --flags, "quoted text", and a trailing # comment. */
function shellLine(line: string): string {
  // The comment starts at a " #" that is not inside quotes.
  let q: string | null = null, cut = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) { cut = i; break; }
  }
  const code = cut >= 0 ? line.slice(0, cut) : line;
  const comment = cut >= 0 ? line.slice(cut) : "";
  let out = "";
  const parts = code.match(/(\s+|"[^"]*"|'[^']*'|[^\s"']+)/g) ?? [];
  let word = 0, first = "";
  for (const p of parts) {
    if (/^\s+$/.test(p)) { out += p; continue; }
    if (word === 0 && p === "$") { out += span("term-dim", p); continue; }
    word++;
    if (word === 1) first = p;
    if (/^["']/.test(p)) out += span("tok-str", p);
    else if (/^--?[A-Za-z]/.test(p)) out += span("term-flag", p);
    else if (word === 1) out += span(p === "thunder" ? "term-cmd" : "term-prog", p);
    else if (word === 2 && first === "thunder" && /^[a-z][a-z-]*$/.test(p)) out += span("term-sub", p);
    else out += esc(p);
  }
  return out + (comment ? span("tok-comment", comment) : "");
}

/** One line of output: marks, labels, thunder commands, money and numbers, quoted text. */
function outputLine(line: string): string {
  if (/^\s*\$ /.test(line)) return shellLine(line);
  let m: RegExpMatchArray | null;
  // A leading mark.
  const lead = line.match(/^(\s*)([✓✗!◆■▶⏱⚡·→])(?=\s|$)/);
  let out = "";
  let rest = line;
  if (lead) {
    const cls = { "✓": "term-ok", "■": "term-ok", "✗": "term-bad", "!": "term-warn", "◆": "term-warn", "⚡": "term-warn", "▶": "term-cmd", "⏱": "term-cmd", "·": "term-dim", "→": "term-dim" }[lead[2]] ?? "";
    out += esc(lead[1]) + span(cls, lead[2]);
    rest = line.slice(lead[0].length);
  }
  // "Label:" at the start (after the mark).
  if ((m = rest.match(/^(\s*)([A-Z][A-Za-z ]{1,22}:)(?=\s|$)/))) { out += esc(m[1]) + span("term-label", m[2]); rest = rest.slice(m[0].length); }
  // Inline: thunder commands, quoted text, money and numbers.
  // A command is "thunder <verb>" and the words after it, one space apart; box-drawing and two spaces end it, and a
  // sentence's closing punctuation is left out of it.
  const re = /(thunder (?:new|run|build|test|check|format|read|try|why|help|doctor|completion|replay|init|review|same|trace|write|verify|repo|thunderize)(?!\w)(?: [^\s─│▶◀┘└┌┐├┤]+)*)|("[^"\n]*")|(\$-?\d[\d,]*(?:\.\d+)?|(?<![\w.])-?\d+(?:\.\d+)?%?(?![\w.]))/g;
  let last = 0;
  for (const x of rest.matchAll(re)) {
    out += esc(rest.slice(last, x.index));
    if (x[1]) {
      const trail = x[1].match(/[.?!,;)]+$/)?.[0] ?? "";
      out += span("term-cmd", x[1].slice(0, x[1].length - trail.length)) + esc(trail);
    } else out += x[2] ? span("tok-str", x[2]) : span("tok-num", x[3]);
    last = (x.index ?? 0) + x[0].length;
  }
  out += esc(rest.slice(last));
  // A heading-like first line ("What happened", "Thunder™ doctor") is bold.
  return /^[A-Z][^:.]{0,58}$/.test(line) && !lead && !/\d/.test(line) ? `<span class="term-label">${out}</span>` : out;
}

/** Markdown (marked) code renderer for terminal blocks; false for anything else. */
export function terminalCodeRenderer({ text, lang }: { text: string; lang?: string }): string | false {
  const label = (lang || "").trim().toLowerCase();
  const kind = SHELL.has(label) ? "shell" : OUTPUT.has(label) ? "output" : null;
  if (!kind) return false;
  const lines = text.replace(/\n$/, "").split("\n").map((l) => (kind === "shell" ? shellLine(l) : outputLine(l)));
  return `<pre class="terminal-code"><code>${lines.join("\n")}</code></pre>\n`;
}
