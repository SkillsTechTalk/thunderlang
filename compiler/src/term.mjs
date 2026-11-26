// Calm color for the terminal: green for what worked, red only for real problems, yellow for warnings and choices,
// cyan for commands to type, bold for headings. Off when the output is not a terminal (a file, a pipe, a script, an
// editor reading it), when NO_COLOR is set, or for TERM=dumb; FORCE_COLOR=1 turns it on. Color never carries meaning
// alone: every colored line also has its words and its mark (✓ ✗ !).
const env = (typeof process !== 'undefined' && process.env) || {};

/** Whether to color text written to `stream` (default: standard output). */
export function useColor(stream = typeof process !== 'undefined' ? process.stdout : null) {
  if (env.NO_COLOR != null && env.NO_COLOR !== '') return false;
  if (env.FORCE_COLOR != null && env.FORCE_COLOR !== '' && env.FORCE_COLOR !== '0') return true;
  if (env.TERM === 'dumb') return false;
  return !!stream?.isTTY;
}

const wrap = (open, close) => (s, on = useColor()) => (on ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));
export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const green = wrap(32, 39);
export const red = wrap(31, 39);
export const yellow = wrap(33, 39);
export const cyan = wrap(36, 39);

/** A command to type: cyan, so it stands out from the words around it. */
export const cmd = (s, on) => cyan(s, on);
/** A heading. */
export const head = (s, on) => bold(s, on);

/** Color the marks at the start of a line: ✓ green, ✗ red, ! yellow. */
export function marks(line, on = useColor()) {
  if (!on) return line;
  return line
    .replace(/^(\s*)✓/, (_, s) => `${s}${green('✓', on)}`)
    .replace(/^(\s*)✗/, (_, s) => `${s}${red('✗', on)}`)
    .replace(/^(\s*)!(?= )/, (_, s) => `${s}${yellow('!', on)}`);
}

/** The words that can follow "thunder" in a command (so prose like "thunder is on your PATH" stays plain). */
const VERBS = 'new|run|build|test|check|format|fmt|read|try|why|help|doctor|completion|init|mission|trace|review|same|write|repo|thunderize|verify|prove|lift|drift|changes|scan|report|explain|docs|atlas|index|gen|conform|export|import|runtime|anchor|text|human|graph|focus|risks|gaps|edit|mcp|lsp';
const COMMAND = new RegExp(`(^|[\\s\`(:])(thunder (?:${VERBS})\\b[^\\n\`]*)`, 'g');

/** Highlight `thunder …` commands inside a line of text: up to two spaces, a semicolon, or the end. */
export function commands(line, on = useColor()) {
  if (!on) return line;
  return line.replace(COMMAND, (_, pre, rest) => {
    let c = rest.split(/ {2,}|; /)[0];
    const tail = rest.slice(c.length);
    const trail = c.match(/[.?!,;)]+$/)?.[0] ?? '';
    c = c.slice(0, c.length - trail.length);
    return `${pre}${cyan(c, on)}${trail}${tail}`;
  });
}

/** Remove color (for tests and for measuring width). */
export const plain = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');

/**
 * Paint a screen of text: marks (✓ ✗ ! ◆ ■ ▶), `thunder …` commands, "Label:" words at the start of a line, and
 * headings (a line of its own with no indent). Plain text comes back unchanged when color is off.
 */
export function paint(text, on = useColor()) {
  if (!on) return text;
  return String(text).split('\n').map((line) => {
    if (/^─+$/.test(line)) return dim(line, on);
    let l = marks(line, on);
    l = l.replace(/^(\s*)◆/, (_, s) => `${s}${yellow('◆', on)}`).replace(/^(\s*)■/, (_, s) => `${s}${green('■', on)}`).replace(/^(\s*)▶/, (_, s) => `${s}${cyan('▶', on)}`);
    l = l.replace(/^⚡ (.+?)(?=:|$)/, (_, t) => `${yellow('⚡', on)} ${bold(t, on)}`);
    // "  Why:      …", "Answer: …", "Next: …": the label in bold.
    l = l.replace(/^(\s*)([A-Z][A-Za-z ]{1,18}:)(?=\s|$)/, (_, s, lab) => `${s}${bold(lab, on)}`);
    // A title like "Flow · Late fee  (library.py:24)".
    if (/^[A-Z][^·]* · /.test(line)) l = bold(l, on);
    // A heading: an unindented line with no colon-label, not a sentence that ends with a full stop.
    if (/^[A-Z][^.:]*$/.test(plain(line)) && plain(line).length < 60) l = bold(l, on);
    return commands(l, on);
  }).join('\n');
}

/** The full command list: headings bold, each command name cyan, its [options] dimmed. */
export function paintHelp(text, on = useColor()) {
  if (!on) return text;
  return String(text).split('\n').map((line) => {
    if (/^─+$/.test(line)) return dim(line, on);
    if (/^⚡ /.test(line)) return `${yellow('⚡', on)} ${bold(line.slice(2), on)}`;
    if (/^Advanced:/.test(line)) return yellow(line, on);
    if (/^[A-Z][^:]*$/.test(line) && !/^usage/.test(line)) return bold(line, on);
    const m = line.match(/^( {2})([a-z][a-z0-9-]*(?: \| [a-z][a-z0-9-]*)*)(.*)$/);
    if (m) return `${m[1]}${cyan(m[2], on)}${m[3].replace(/(\[[^\]]*\])/g, (x) => dim(x, on))}`;
    return line;
  }).join('\n');
}
