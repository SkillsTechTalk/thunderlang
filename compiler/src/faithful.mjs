// The faithfulness gate: words that say what code does must account for every operator in that code.
//
// A reading that drops a `!`, an `||` term, or a comparison is worse than no reading: it tells a person the
// opposite of what the code does, with Thunder's confidence. So before a condition (or a value) is put into
// words, the words are checked against the code: the same number of negations (`!`, `not`, `!=`, `unless`, …),
// the same number of `and` / `or` terms, and at least as many comparisons. When they do not match, the code is
// shown as code, marked "not explained", instead of a paraphrase. Vague but true beats precise but false.
//
// Everything here is linear in the length of the text: single passes and regexes with no nested quantifiers.

/** Text with every quoted string replaced by Q (so operators inside strings are not counted). */
export const stripQuoted = (s) => String(s).replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, 'Q');

/** Skip a quoted string starting at i; returns the index of its closing quote (or the end). */
function skipQuote(s, i) {
  const q = s[i];
  for (let j = i + 1; j < s.length; j++) { if (s[j] === '\\') { j++; continue; } if (s[j] === q) return j; }
  return s.length - 1;
}

/** Index of the bracket that closes the one at `open` (quote-aware), or -1. */
export function closeOf(s, open) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const want = pairs[s[open]];
  if (!want) return -1;
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') { i = skipQuote(s, i); continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) return c === want ? i : -1; }
  }
  return -1;
}

/** True when the whole text is one bracketed group: `(a || b)`. */
export const wrapped = (s) => { const t = String(s).trim(); return t.startsWith('(') && closeOf(t, 0) === t.length - 1; };

/** Brackets and quotes balanced in this text. */
export function balancedText(s) {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') { const e = skipQuote(s, i); if (e >= s.length - 1 && s[e] !== c) return false; i = e; continue; }
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') { if (--d < 0) return false; }
  }
  return d === 0;
}

/**
 * Split a condition at its top-level `and` / `or` (`&&`, `||`, `and`, `or`, `andalso`), outside brackets and
 * quotes. Returns { terms, ops } (ops[i] joins terms[i] and terms[i + 1]), or null when the text has a top-level
 * ternary or an unbalanced bracket (it cannot be split safely).
 */
export function splitLogic(text) {
  const s = String(text);
  const terms = [], ops = [];
  let depth = 0, from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') {
      // A Ruby/Rust lifetime or char like 'a is not a string start we can close; give up on a lone quote.
      const e = skipQuote(s, i);
      if (s[e] !== c) return null;
      i = e; continue;
    }
    if (c === '(' || c === '[' || c === '{') { depth++; continue; }
    if (c === ')' || c === ']' || c === '}') { if (--depth < 0) return null; continue; }
    if (depth) continue;
    let op = null, len = 0;
    if ((c === '&' && s[i + 1] === '&') || (c === '|' && s[i + 1] === '|')) { op = c === '&' ? 'and' : 'or'; len = 2; }
    else if (/\s/.test(c)) {
      const w = /^\s(and|or)(?=\s)/.exec(s.slice(i, i + 5));
      if (w) { op = w[1]; len = 1 + w[1].length; }
    } else if (c === '?' && /\s/.test(s[i - 1] || '') && /\s/.test(s[i + 1] || '')) return null; // a ? b : c
    if (op) { terms.push(s.slice(from, i).trim()); ops.push(op); from = i + len; i += len - 1; }
  }
  if (depth !== 0) return null;
  terms.push(s.slice(from).trim());
  if (terms.some((t) => !t)) return null;
  return { terms, ops };
}

const KEYWORD = /^(?:not|and|or|is|in|instanceof|typeof|true|false|null|nil|None|undefined|this|self|new|await)$/;
const wordsOf = (name) => String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().split(/\s+/).filter(Boolean);
const NEG_WORD = /^(?:not|no|non|never|cannot|none)$/;

/** Negations in names (`notFound`, `no_cache`): kept as words, so they count on both sides. */
function nameNegations(code) {
  let n = 0;
  for (const id of code.match(/[A-Za-z_][\w]*/g) || []) if (!KEYWORD.test(id)) for (const w of wordsOf(id)) if (NEG_WORD.test(w)) n++;
  return n;
}

/**
 * Operator counts in one code condition. Negations: `!`, `not`, `!=`, `!==`, `<>`, `is not`, `not in`; a loose
 * `!= null` / `!= nil` / `is not None` reads as "is set" (the negation is part of the meaning), so it is not
 * counted. Logic: `&&`, `||`, `and`, `or`. Comparisons: `==`, `!=`, `<`, `>`, `<=`, `>=`, `is`, `in`, `instanceof`.
 */
export function codeCounts(code) {
  let s = stripQuoted(code);
  s = s.replace(/(?<![!=])!=\s*(?:null|nil|None|undefined)\b/g, ' SET ').replace(/\bis\s+not\s+None\b/g, ' SET ').replace(/!==\s*(?:nil|None)\b/g, ' SET ');
  const neg = (s.match(/!==?|<>|!(?!=)|\bnot\b/g) || []).length + nameNegations(s);
  const logic = (s.match(/&&|\|\||\band\b|\bor\b/g) || []).length;
  const compare = (s.match(/===?|!==?|<=|>=|<>|(?<![-=<])<(?![=<-])|(?<![-=>])>(?![=>])|\bis\b|\bin\b|\binstanceof\b|\bSET\b/g) || []).length;
  return { neg, logic, compare };
}

/** The same counts in the words Thunder wrote. */
export function wordCounts(said) {
  const s = stripQuoted(String(said).replace(/`[^`]*`/g, 'Q'));
  // (`None` written as a value is Python's empty value, not a negation.)
  const neg = (s.match(/\b(?:[Nn]ot|[Nn]o|[Nn]on|[Nn]ever|[Cc]annot|none)\b|n't\b/g) || []).length;
  const logic = (s.match(/\band\b|\bor\b/g) || []).length;
  const compare = (s.match(/\b(?:is|are|was|has|have|does|than|at least|at most|in|instanceof|equals?|matches|set|empty|null|undefined|nil|true|false)\b|[<>=]/g) || []).length;
  return { neg, logic, compare };
}

/** True when the words keep every negation and every and/or of the code, and do not drop a comparison. */
export function accountsFor(code, said) {
  // Operators left as symbols mean the code was not put into words.
  const bare = stripQuoted(String(said).replace(/`[^`]*`/g, 'Q'));
  if (/&&|\|\||[!=]==?|<=|>=|\s[<>]\s|^\s*[<>]|\bis is\b/.test(bare)) return false;
  const c = codeCounts(code), w = wordCounts(said);
  return c.neg === w.neg && c.logic === w.logic && w.compare >= c.compare;
}

/** A piece of code shown as code: in backticks, shortened visibly when it is long. */
export const asCodeWords = (code, n = 120) => { const t = String(code).replace(/\s+/g, ' ').trim(); return `\`${t.length > n ? `${t.slice(0, n - 1)}…` : t}\``; };
/** True when a condition's words are the code itself (the gate fell back). */
export const isCodeWords = (said) => /^`[^]*`$/.test(String(said).trim());
