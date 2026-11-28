// Thunder Core lexer: source text -> lines of tokens, with indentation.
//
// A Thunder Core program is a list of lines. A line that ends with ":" opens a block; the lines under it are
// indented further (spaces only). "#" starts a comment that runs to the end of the line, outside text.
//
// Tokens:
//   word     letters, digits, underscores; `yes/no` is one word          { t: 'word', text, lower }
//   poss     the possessive 's (customer's balance)                     { t: 'poss' }
//   num      12, 0.10, 1_000                                            { t: 'num', text, whole }
//   money    $200, $0.10                                                { t: 'money', text }
//   percent  20%, 12.5%                                                 { t: 'percent', text }
//   str      "Hello, {name}!"  (parts: strings and { tokens } holes)    { t: 'str', parts }
//   sym      + - * / ( ) [ ] , : . = == != <> < <= > >= ?                { t: 'sym', text }  (? is a hole: ?number)

import { diag, CoreError } from './diagnostics.mjs';

const SYMS = ['==', '!=', '<>', '<=', '>=', '+', '-', '*', '/', '(', ')', '[', ']', ',', ':', '.', '=', '<', '>', '?'];
const WORD_START = /[\p{L}_]/u;
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** Tokenize one line's text (no newline). Throws CoreError with a TC1xx diagnostic. */
export function tokenizeLine(text, line, colOffset = 0) {
  const toks = [];
  let i = 0;
  const at = (k = 0) => text[i + k];
  while (i < text.length) {
    const c = at();
    const col = i + colOffset + 1;
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '#') break; // comment
    if (c === '"' || c === '“') { const [tok, end] = readString(text, i, line, colOffset); toks.push({ ...tok, col }); i = end; continue; }
    if (c === '$' && /[0-9]/.test(at(1) ?? '')) {
      const m = text.slice(i + 1).match(/^[0-9][0-9_]*(\.[0-9]+)?/);
      toks.push({ t: 'money', text: m[0].replace(/_/g, ''), col, line }); i += 1 + m[0].length; continue;
    }
    if (/[0-9]/.test(c)) {
      const m = text.slice(i).match(/^[0-9][0-9_]*(\.[0-9]+)?/);
      const num = m[0].replace(/_/g, '');
      i += m[0].length;
      if (at() === '%') { toks.push({ t: 'percent', text: num, col, line }); i++; continue; }
      toks.push({ t: 'num', text: num, whole: !num.includes('.'), col, line }); continue;
    }
    if (WORD_START.test(c)) {
      let j = i;
      while (j < text.length && WORD_CHAR.test(text[j])) j++;
      let word = text.slice(i, j);
      if (word.toLowerCase() === 'yes' && text.slice(j, j + 3).toLowerCase() === '/no') { word = text.slice(i, j + 3); j += 3; }
      toks.push({ t: 'word', text: word, lower: word.toLowerCase(), col, line });
      i = j;
      if ((text[i] === "'" || text[i] === '’') && (text[i + 1] === 's' || text[i + 1] === 'S') && !WORD_CHAR.test(text[i + 2] ?? ' ')) {
        toks.push({ t: 'poss', col: i + colOffset + 1, line }); i += 2;
      }
      continue;
    }
    const sym = SYMS.find((s) => text.startsWith(s, i));
    if (sym) { toks.push({ t: 'sym', text: sym === '<>' ? '!=' : sym, col, line }); i += sym.length; continue; }
    throw new CoreError(diag('TC105', line, `I can't read the character "${c}" (column ${col}).`, 'Text goes inside double quotes: "like this".'));
  }
  return toks;
}

function readString(text, start, line, colOffset) {
  const close = text[start] === '“' ? '”' : '"';
  const parts = [];
  let buf = '';
  let i = start + 1;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      const n = text[i + 1];
      buf += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n ?? '';
      i += 2; continue;
    }
    if (c === close || (close === '”' && c === '"')) {
      if (buf || !parts.length) parts.push(buf);
      return [{ t: 'str', parts, line }, i + 1];
    }
    if (c === '{' && text[i + 1] === '{') { buf += '{'; i += 2; continue; }
    if (c === '}' && text[i + 1] === '}') { buf += '}'; i += 2; continue; }
    if (c === '{') {
      const end = text.indexOf('}', i);
      if (end < 0) throw new CoreError(diag('TC107', line, 'A "{" inside text has no closing "}".', 'Write {{ for a brace that is just text.'));
      if (buf) parts.push(buf);
      buf = '';
      const inner = text.slice(i + 1, end);
      parts.push({ tokens: tokenizeLine(inner, line, colOffset + i + 1), source: inner.trim() });
      i = end + 1; continue;
    }
    buf += c; i++;
  }
  throw new CoreError(diag('TC106', line, 'This text is missing its closing quote (").'));
}

/**
 * Split source into logical lines: { line, indent, tokens, raw }. Blank and comment-only lines are dropped.
 * Collects diagnostics instead of stopping at the first one.
 */
export function lex(source) {
  const lines = [];
  const diagnostics = [];
  source.replace(/\r\n?/g, '\n').split('\n').forEach((raw, idx) => {
    const line = idx + 1;
    const m = raw.match(/^([ \t]*)/);
    if (m[1].includes('\t')) { diagnostics.push(diag('TC101', line, 'This line is indented with a tab. Thunder uses spaces (two per level).')); return; }
    const body = raw.slice(m[1].length);
    if (!body.trim() || body.trimStart().startsWith('#')) return;
    try {
      const tokens = tokenizeLine(body, line, m[1].length);
      if (tokens.length) lines.push({ line, indent: m[1].length, tokens, raw: body.replace(/\s+$/, '') });
    } catch (e) {
      if (e instanceof CoreError) diagnostics.push(e.diagnostic); else throw e;
    }
  });
  return { lines, diagnostics };
}
