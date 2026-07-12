// A deterministic formatter for .intent source , the gofmt/prettier of IntentLang. It
// re-indents each line to its structural depth (two spaces per level), trims trailing
// whitespace, collapses runs of blank lines to one, and ensures a single trailing newline,
// while PRESERVING content and comments (only whitespace changes). Idempotent and
// semantic-preserving: format(format(x)) === format(x), and the re-parsed graph is unchanged.

export const FORMAT_INDENT = '  ';

/**
 * Format IntentLang source. Depth is taken from the source's own relative indentation
 * (the same stack algorithm the parser's indent tree uses), so a file with mixed 2/4-space
 * or tab indentation is normalized to consistent two-space steps.
 */
export function formatSource(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const stack = [-1]; // indentation widths seen so far; depth = stack.length - 1
  let blankPending = false;
  let inString = false; // inside an unterminated multi-line "..." string

  const quoteCount = (s) => (s.match(/(?<!\\)"/g) || []).length;

  for (const line of lines) {
    // A line CONTINUING a multi-line string is content: preserve it byte-for-byte.
    if (inString) {
      if (blankPending) { out.push(''); blankPending = false; }
      out.push(line.replace(/[\r]+$/, ''));
      if (quoteCount(line) % 2 === 1) inString = false;
      continue;
    }

    const trimmed = line.replace(/\s+$/, '').trimStart();
    if (trimmed === '') { blankPending = true; continue; }

    const indent = line.length - line.trimStart().length;
    while (stack.length > 1 && indent <= stack[stack.length - 1]) stack.pop();
    const depth = stack.length - 1;
    stack.push(indent);

    if (blankPending && out.length) out.push(''); // collapse any run of blanks to one
    blankPending = false;
    out.push(FORMAT_INDENT.repeat(depth) + trimmed);
    if (quoteCount(trimmed) % 2 === 1) inString = true; // this line opened a string
  }

  // Exactly one trailing newline; no leading blank line.
  while (out.length && out[0] === '') out.shift();
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n') + '\n';
}

/** True if the source is already in canonical form. */
export function isFormatted(source) {
  return String(source ?? '').replace(/\r\n?/g, '\n') === formatSource(source);
}
