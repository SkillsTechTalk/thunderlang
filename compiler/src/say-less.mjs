// Say less: a step is put into words only when Thunder positively recognizes it, and the words account for it.
//
// The readers paraphrase code by pattern. Most patterns are right; but a reading is graded by its worst line, and a
// false line ("Calls unsafe", "Gives back the items in promise that do not match", "Sets key algo to key algo") is
// worse than none. Fixing false readings one by one does not generalize to code Thunder has not seen, so this pass
// turns the reader's output into an ALLOWLIST: after a function is read, every worded step is checked, and a step
// whose words cannot be accounted for is shown as its code, marked "code, not explained" (honest, never false).
//
// A worded step is kept only when all of these hold:
//   1. Recognized form: its words start with one of Thunder's step forms ("Calls", "Sets", "Returns", "If", "For each",
//      …), and the code is that kind of statement (an ending is a return/throw/raise/exit; "Calls X" is a call of X,
//      and X is not a keyword such as `unsafe`, `using`, `foreach`, `type`).
//   2. Every word has a source: each word is a word of the step's own code (its names, values, and text), or one of
//      the fixed words the forms are written with, or an idiom word whose trigger is in the code ("log" for a print or
//      log call, "JSON" for json, "how many" for a length, …). Nothing in the words is invented.
//   3. Every value is exact: each number and quoted text in the words is in the code.
//   4. Nothing that changes the meaning is dropped: negations, and/or, ordering comparisons (more than / at least /
//      less than / at most, each its own kind), arithmetic, and casts in the code's meaning tree (`step.expr`) are
//      all in the words. A condition (a question, a loop's while, "whether") must name every name in it.
//   5. No ambiguous names: when two different names in the code read as the same words (`KEY_ALGO`, `__KEY_ALGO`;
//      `kind`, `Kind`), words that use them cannot say which, so the step is shown as code.
//   6. A meaning tree that was not parsed (`kind: 'code'`) is worded only in a fixed safe form checked against the
//      text: a plain call ("Calls X"), an assignment from a plain call ("Works out T from X"), a bare return.
//   7. Certain structure: the steps inside a question, loop, or try lie inside its lines; nothing follows an ending in
//      the same list; an implicit return (Ruby, Rust, an expression body) is only the last thing the function does;
//      a question with nothing inside it, and alternatives under #if/#else, are shown as code.
//
// Every step then carries `explained` (true/false) and, when false, `notExplainedWhy`; each function carries
// `explainedSteps` and `totalSteps`. Everything here is linear in the size of the function.
import { namesIn, parseExpr } from './meaning.mjs';

// Every node of a tree, depth first (as meaning.mjs nodesOf), as an array remembered per tree: the checks below ask
// for the same tree's nodes many times.
const NODES = new WeakMap();
function nodesOf(tree) {
  if (!tree || typeof tree !== 'object') return [];
  let out = NODES.get(tree);
  if (out) return out;
  out = [];
  const stack = [tree];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== 'object') continue;
    if (Array.isArray(n)) { for (let i = n.length - 1; i >= 0; i--) stack.push(n[i]); continue; }
    if (n.kind) out.push(n);
    const keys = Object.keys(n);
    for (let i = keys.length - 1; i >= 0; i--) { const v = n[keys[i]]; if (v && typeof v === 'object') stack.push(v); }
  }
  NODES.set(tree, out);
  return out;
}
import { FORM_WORDS } from './form-words.mjs';
import { asCodeWords, isCodeWords, stripQuoted, codeCounts, wordCounts, accountsFor, pythonImportSays, sliceWords } from './faithful.mjs';

export const WHY = {
  form: 'the reader did not recognize this form',
  words: 'the words could not be checked against the code',
  value: 'a value in the words is not in the code',
  meaning: 'the words leave out an operator or a negation in the code',
  ambiguous: 'two names in the code read the same in words',
  unparsed: 'the reader could not parse this statement',
  structure: 'block structure uncertain',
  ending: 'not a recognized return, throw, or exit',
  build: 'one of several alternatives chosen when the code is compiled',
};

// SAYLESS_DEBUG=1 writes why each step was shown as code into its words (for working on the pass only).
const DEBUG = typeof process !== 'undefined' && !!process.env?.SAYLESS_DEBUG;

// Which check said no (for measuring the pass; not part of the reading).
let lastTag = null;
const M = (tag) => { lastTag = tag; return WHY.meaning; };

// ── Words ────────────────────────────────────────────────────────────────────────────────────────────────────

const WORDS_CACHE = new Map();
function splitWordsRaw(s) { return String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); }
/** The words of a name or text (camelCase, snake_case, and acronyms split), remembered for short texts. */
const splitWords = (s) => {
  const t = String(s);
  if (t.length > 64) return splitWordsRaw(t);
  let w = WORDS_CACHE.get(t);
  if (!w) { if (WORDS_CACHE.size > 20000) WORDS_CACHE.clear(); w = splitWordsRaw(t); WORDS_CACHE.set(t, w); }
  return w;
};
/** The parts of Thunder's words that are claims in words (quoted text, code in backticks, and placeholders removed). */
const claimTextRaw = (says) => String(says).replace(/\((?:the loop )?only in builds where[^()]*(?:\([^()]*\)[^()]*)*\)/g, ' ').replace(/`[^`]*`/g, ' ').replace(/"(?:\\.|[^"\\])*"/g, ' ').replace(/«[^»]*»/g, ' ').replace(/(?<=\w)'s\b/g, '');
const CLAIM_CACHE = new Map();
const CLAIM_WORDS = new Map();
/** The words of the claims (remembered). */
const claimWords = (says) => {
  const k = String(says);
  let v = CLAIM_WORDS.get(k);
  if (v === undefined) { if (CLAIM_WORDS.size > 20000) CLAIM_WORDS.clear(); v = splitWordsRaw(claimText(k)); CLAIM_WORDS.set(k, v); }
  return v;
};
/** The parts of Thunder's words that are claims (remembered: every check asks for them). */
const claimText = (says) => {
  const k = String(says);
  let v = CLAIM_CACHE.get(k);
  if (v === undefined) { if (CLAIM_CACHE.size > 20000) CLAIM_CACHE.clear(); v = claimTextRaw(k); CLAIM_CACHE.set(k, v); }
  return v;
};

// The fixed words Thunder's step forms are written with. Each carries no claim of its own beyond the form; meaning
// words (negations, comparisons, and/or) are counted separately against the code.
const GLUE = new Set(`
the a an of to from is are be was it its in on at by with as and or not no if otherwise when while each for one that this these those here then into than
returns return gives giving back calls sets works out result value values stops fails steps step next whether checks check stores under adds defines how helper
declares creates new keeps given repeats leaves loop skips chooses choice case cases tries handles any error errors goes wrong after takes starts yet counts nothing
jumps part named below always end caught still caller passes again same made inside until something both all set empty more less least most true false null
yes what time computed does do does makes function which order so also only there their them they has have itself own first last other else
longest shortest instead
`.trim().split(/\s+/));

// Idiom words: words with a meaning of their own, allowed only when the code has their trigger ("log" for a print or
// log call, "matches" for a filter or a pattern, "how many" for a length). A wrong idiom is the commonest false line
// ("the items in promise that do not match" for `Promise.reject(error)`), so these are checked even though they are
// form words.
const IDIOM = [
  [/^(?:log|logs|message|messages|prints|warns|warning)$/, /print|log|echo|write|puts|warn|info|debug|error|trace|fmt\.|console|cat\b|say|message|Write-|out|stdout|stderr|emit|notice|fatal|panic|<<|Host|cli_|inform|signal|message|alert/i],
  [/^json$/, /json/i],
  [/^(?:matches|match|matching)$/, /%%|##|\$\{[^}]*[#%/]|\)\s*$|\[\[|!=|find|filter|first|where|select|any\b|all\b|some|every|grep|match|reject|detect|includes|contains|index|search|test|=~|-like|Where-Object|keep|take|drop|skip|case|when|switch|guard|is\b|in\b|\bfor\b|Regex|regex|re\.|\?|startswith|endswith|startsWith|endsWith|glob|fnmatch|==|-eq/i],
  [/^(?:entry|entries)$/, /get|\[|fetch|lookup|at\b|entry|Get|find|::|\$|\./i],
  [/^(?:table|lookup)$/, /map|dict|hash|table|\{|object|Object|list|@\{/i],
  [/^many$/, /\$\{#|len|length|count|size|\$#|nrow|NROW|Count|Length|Size|n\(\)|sizeof|nchar/i],
  [/^(?:copy|copies)$/, /\bcp\b|copy|clone|dup|Copy|Clone|\.\.\.|strcpy|memcpy|strdup|Copy-Item/i],
  [/^(?:removes|deletes|frees|unsets)$/, /\brm\b|remove|delete|del\b|unset|pop|splice|free|drop|Remove|Delete|clear|discard|erase|-=|\[\]|NULL/i],
  [/^(?:empties|zeros)$/, /=\s*(?:;|$|""|''|\(\)|\[\]|0\b)|clear|truncate|memset|fill|zero|reset|bzero/i],
  [/^(?:folder|folders|directory)$/, /^\s*\(\s*(?:\n|$)|cd\b|dir|folder|path|mkdir|pushd|Path|-d\b|Item|Location/i],
  [/^(?:illegal|exception)$/, /require|check|Illegal|assert|Exception|throw|raise/],
  [/^(?:valid)$/, /valid|check|assert|stopifnot|verify/i],
  [/^(?:parent)$/, /super|base\b|parent|Parent|Base|mkdir|\.\./i],
  [/^(?:pattern|patterns|regex)$/, /match|=~|-like|grep|case|regex|Regex|re\.|\*|glob|sed|awk|\/.*\/|~|\[\[|split|-split|-replace|gsub|sub\(/i],
  [/^(?:plus|minus|times|divided|multiplied|remainder|shifted)$/, /[-+*/%<>^&|~]|\btimes\b|range|repeat|\.\./],
  [/^(?:exists|exist)$/, /exist|Exist|-[edfLhrswx]\b|Test-Path|isfile|isdir|file\.|stat|access|has|contains|in\b|key/i],
  [/^(?:setting|settings|environment)$/, /kubectl|helm|apply|env|ENV|environ|getenv|Environment|config|setting|option|\$[A-Z_]{2,}|\bget\b|\bset\s+-[a-z]*u/i],
  [/^(?:second|third|fourth|fifth)$/, /\$[2-9]|\$\{[2-9]|\[[1-9]\]|second|third|nth|at\(|\.\.\.|args/i],
  [/^(?:alongside|background)$/, /await|go\b|async|&\s*$|spawn|thread|Task|later|Start-Job|launch|coroutine/i],
  [/^(?:passed|seconds|milliseconds|minutes|hours|timer)$/, /time\.|After|setTimeout|setInterval|sleep|delay|Timer|timeout|Duration|interval|schedule|every|after/i],
  [/^(?:uploads|upload|pushes)$/, /push|upload|put|send|publish/i],
  [/^(?:latest|newest|oldest)$/, /latest|tail|sort|max|last|head|newest|oldest|-1\b|describe/i],
  [/^(?:redirect|redirects)$/, /redirect|Redirect|location|Location|30[1278]/],
  [/^(?:database|insert|inserts)$/, /db|database|save|query|sql|select|insert|update|session|repo|commit|execute|Insert|Save|create|objects|models|prisma|knex|orm/i],
  [/^(?:forbidden|unauthorized|conflict|unprocessable|unavailable|gateway|teapot)$/, /[45]\d\d|status|abort|HTTP|Http|Forbidden|Unauthorized|Conflict/],
  [/^(?:sum|total|average|mean)$/, /sum|total|reduce|\+|mean|avg|average|Sum|Measure-Object|aggregate|summari/i],
  [/^(?:sorted|sorts|sort|highest|lowest)$/, /sort|order|Sort|Order|arrange|desc|asc/i],
  [/^(?:upper|lower|uppercase|lowercase)$/, /upper|lower|Upper|Lower|toupper|tolower|capitaliz|case/i],
  [/^(?:reversed|reverse)$/, /rev|Reverse|reverse/i],
];
// Words whose presence in the words adds a negation that is part of a form, not a claim about the code.
const FORM_NEGATIONS = /\bno [\w ]{1,40}? yet\b|\bwhen that has no value\b|\bwhen it has no value\b|\bif nothing is there yet\b|\bif it has no value yet\b|\ban error is not caught here\b|\bdid not leave\b|\bnot explained\b|\bnothing\b|\bwhen it is not set\b/g;

/** Every word of the code's names, values, and text. */
function codeWordSet(code) {
  const out = new Set();
  for (const id of String(code).match(/[A-Za-z0-9]+/g) || []) {
    for (const w of splitWords(id)) out.add(w);
    // The readers split `HTTPMediaType` as "httpmedia type": both spellings are sources.
    if (/[A-Z]{2}/.test(id)) for (const w of id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(' ')) if (w) out.add(w);
  }
  // Numbers written in words by the readers ("one", "zero").
  if (/\b1\b/.test(code)) out.add('one');
  if (/\b0\b/.test(code)) out.add('zero');
  return out;
}

/** The first word that has no source: not in the code, not a fixed word, and not an idiom with its trigger. */
// Words a Python import is read with ("Loads x from the y module" / "from this package" / ", called z here"): they
// add to what a word may stand for and never take away (a word with its usual meaning is still checked as before).
const IDIOM_EXTRA = new Set([
  [/^(?:module|loads)$/, /^\s*(?:from\s+\S+\s+)?import\s/],
  [/^package$/, /^\s*from\s+\.\w*\s+import\s/],
  [/^(?:called|here)$/, /^\s*(?:from\s+\S+\s+)?import\s.*\bas\b/],
]);
IDIOM.push(...IDIOM_EXTRA);
const IDIOM_OF = new Map();
function unsourcedWord(says, code) {
  let have = null;
  const inCode = (w) => {
    have ??= codeWordSet(code);
    // Plurals and simple forms of a code word: "orders" for `order`, "named" for `name`.
    return have.has(w) || have.has(w.replace(/(?:es|s|ed|d|ing)$/, '')) || have.has(`${w}s`) || have.has(w.replace(/ies$/, 'y'));
  };
  for (const w of claimWords(says)) {
    if (/^\d+$/.test(w)) continue;
    let idiom = IDIOM_OF.get(w);
    if (idiom === undefined) { idiom = IDIOM.find(([re]) => re.test(w)) ?? null; IDIOM_OF.set(w, idiom); }
    if (idiom) { if (idiom[1].test(code) || inCode(w)) continue; if (!IDIOM_EXTRA.has(idiom)) return w; }
    if (GLUE.has(w) || FORM_WORDS.has(w)) continue;
    if (/ing$/.test(w)) { const st = w.slice(0, -3); if ([`${st}s`, `${st}es`, `${st}e`, `${st.slice(0, -1)}s`].some((x) => FORM_WORDS.has(x))) continue; }
    if (inCode(w)) continue;
    return w;
  }
  return null;
}

// Languages where $ / @ mark a name (PHP, shell, PowerShell, Ruby, Perl) rather than being part of it (JavaScript).
const SIGIL_LANGS = new Set(['php', 'shell', 'powershell', 'ruby', 'perl', 'r', 'sql']);
let currentLang = '';
let LIBRARY_STEP = false;
/** Two different spellings in the code that read as the same words, and appear in the words. */
function ambiguousName(says, code) {
  // Cheap first look: no word said twice, nothing can read the same twice.
  const sw = claimWords(says);
  if (new Set(sw).size === sw.length) return null;
  const byWords = new Map();
  const inserted = [...String(code).matchAll(/\$\{([^}]*)\}|#\{([^}]*)\}|\$\(([^)]*)\)|\$([A-Za-z_]\w*)/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]).join(' ');
  for (const id of `${stripQuoted(code)} ${inserted}`.match(/[A-Za-z_$@][\w$]*/g) || []) {
    const bare = SIGIL_LANGS.has(currentLang) ? id.replace(/^[$@]+/, '') : id;
    const w = splitWords(bare).join(' ');
    if (!w) continue;
    if (!byWords.has(w)) byWords.set(w, new Set());
    byWords.get(w).add(bare);
  }
  // A spelling written as it is (a capitalized or camelCase name such as `CodeWriter`) is told apart from the words.
  const raw = String(says).replace(/`[^`]*`/g, ' ');
  const said = ` ${splitWords(claimText(says.replace(/'s /g, ' possx '))).join(' ')} `;
  for (const [w, spellings] of byWords) {
    if (spellings.size < 2) continue;
    let open = [...spellings].filter((x) => !(/[A-Z]/.test(x) && new RegExp(`(?<![\\w$])${x.replace(/[$]/g, '\\$&')}(?![\\w$])`).test(raw)));
    open = [...new Set(open.map((x) => x[0].toLowerCase() + x.slice(1)))];
    if (open.length < 2) continue;
    // Read the same, said twice, and not told apart by an owner ("the element's value" and "value"): "Sets x to x".
    const all = said.split(` ${w} `).length - 1;
    const plain = all - (said.split(` possx ${w} `).length - 1);
    if (plain >= 2) return w;
  }
  return null;
}

function bracketsClosed(text) {
  let d = 0;
  const t = String(text).replace(/'[^'\s]{1,4}'|`[^`]*`/g, 'Q');
  for (const ch of t) { if (ch === '(' || ch === '[' || ch === '{') d++; else if (ch === ')' || ch === ']' || ch === '}') { if (--d < 0) return false; } }
  return d === 0;
}

// ── Values and meaning ──────────────────────────────────────────────────────────────────────────────────────

/** Numbers and quoted text in the words that are not in the code. */
function inventedValue(says, code) {
  const said = String(says).replace(/`[^`]*`/g, ' ').replace(/\(\d+ steps? inside\)/g, '').replace(/\(\d+ lines?\)/g, '').replace(/\bor \d+ other values?\b/g, '').replace(/\b(?:a list of|a table of|and) \d+ (?:items?|more|entries|values|names|keys)\b/g, ' ').replace(/\b\d+ more\b/g, ' ');
  const text = String(code);
  for (const num of said.replace(/"(?:\\.|[^"\\])*"/g, ' ').match(/(?<![\w.«])-?\d+(?:\.\d+)?(?![\w.»])/g) || []) {
    const n = num.replace(/^-/, '');
    if (!text.includes(n) && !/^[01]$/.test(n) && !statusNamed(n, text) && !text.includes(`..<${Number(n) + 1}`) && !new RegExp(`\\.\\.<?\\s*${Number(n) + 1}\\b`).test(text) && !new RegExp(`\\brange\\((?:\\s*\\d+\\s*,)?\\s*${Number(n) + 1}\\s*\\)`).test(text)) return num;
  }
  for (const q of String(says).replace(/^(?:If (?:not: )?|Repeats: |Fails with )?`[^]*`$/, '').match(/"(?:\\.|[^"\\])*"/g) || []) {
    if (!exactText(q.slice(1, -1), text)) return q;
  }
  return null;
}

// Text with every value inserted into it (`${x}`, `$(cmd)`, `#{x}`, `{x}`, `%s`, `\(x)`, `$x`) as \u0001 and every
// quote mark as \u0002, so a quoted text in the words can be matched against whole texts of the code.
function textSkeleton(t, words = false, open = false) {
  const s = String(t);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (words && c === '«') { const e = s.indexOf('»', i); if (e > i) { out += '\u0001'; i = e; continue; } }
    if (open && c === '$' && n === '(') { out += '\u0001'; i++; continue; }
    if ((c === '$' && (n === '{' || n === '(')) || (c === '#' && n === '{') || (c === '\\' && n === '(')) {
      const open = n, close = open === '{' ? '}' : ')';
      let d = 0, j = i + 1;
      for (; j < s.length; j++) { if (s[j] === open) d++; else if (s[j] === close && --d === 0) break; }
      out += '\u0001'; i = j; continue;
    }
    if (c === '{' && /[\w$.}:]/.test(n ?? '')) {
      let d = 0, j = i;
      for (; j < s.length && j - i < 120; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; }
      if (j < s.length && s[j] === '}') { out += '\u0001'; i = j; continue; }
    }
    if (c === '$' && /[A-Za-z_]/.test(n ?? '')) { let j = i + 1; while (j < s.length && /\w/.test(s[j])) j++; out += '\u0001'; i = j - 1; continue; }
    if (c === '$' && /[0-9*@#?!$-]/.test(n ?? '')) { out += '\u0001'; i++; continue; }
    if (c === '%' && /^[-+ #0-9.]*[sdifgxXoucpqvT]/.test(s.slice(i + 1, i + 6))) { const m = /^[-+ #0-9.]*[a-zA-Z]/.exec(s.slice(i + 1)); out += '\u0001'; i += m[0].length; continue; }
    if (c === '\\' && /["'`\\]/.test(n ?? '')) { out += n; i++; continue; }
    out += c;
  }
  return out.replace(/\s+/g, ' ');
}
/**
 * A quoted text in the words is a whole text of the code: each of its literal parts (between values the code inserts)
 * stands in the code between quote marks or inserted values, not inside a longer text. "Usage" is not the pattern
 * `"# Usage: "*`; a text the words cut short with "…" only has to start a text of the code.
 */
const SKELETON_CACHE = new Map();
const FRAG_RE = new Map();
function exactText(inner, code) { return exactIn(inner, code, false) || exactIn(inner, code, true); }
function exactIn(inner, code, open) {
  if (!/«|…/.test(inner) && inner.length && [`'${inner}'`, `"${inner}"`, `\`${inner}\``].some((q) => String(code).includes(q))) return true;
  if (!/«|…/.test(inner) && inner.trim().length) {
    const esc = inner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?:^|[\\s#%/:+=(\\-{"'])${esc}(?=$|[\\s}/)"';|])`).test(String(code))) return true;
  }
  const cut = /…$/.test(inner);
  const w = textSkeleton(inner.replace(/…$/, ''), true);
  const key = `${open ? 1 : 0}${code}`;
  let c = SKELETON_CACHE.get(key);
  if (c === undefined) { if (SKELETON_CACHE.size > 5000) SKELETON_CACHE.clear(); c = `\u0002${textSkeleton(code, false, open)}\u0002`; SKELETON_CACHE.set(key, c); }
  const parts = w.split('\u0001');
  const B = '[\u0001\u0002"\'`\\s=(,;:\\[|]', E = '[\u0001\u0002"\'`\\s),;:\\]|]';
  for (let i = 0; i < parts.length; i++) {
    const f = parts[i].trim();
    if (!f) continue;
    const esc = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const lead = i === 0 ? B : '[\u0001"\'`\\s,|]';
    const tail = i === parts.length - 1 ? (cut ? '' : E) : '[\u0001"\'`\\s,]';
    const src = `${lead}${esc}${tail ? `(?=${tail})` : ''}`;
    let re = FRAG_RE.get(src);
    if (!re) { if (FRAG_RE.size > 5000) FRAG_RE.clear(); re = new RegExp(src); FRAG_RE.set(src, re); }
    if (!re.test(c) && !(f.length > 12 && c.includes(f))) return false;
  }
  return true;
}

const STATUS_NAMES = { 400: 'badrequest', 401: 'unauthorized', 402: 'paymentrequired', 403: 'forbidden', 404: 'notfound', 405: 'methodnotallowed', 409: 'conflict', 410: 'gone', 413: 'payloadtoolarge', 415: 'unsupportedmediatype', 422: 'unprocessable', 429: 'toomanyrequests', 500: 'internalservererror', 501: 'notimplemented', 502: 'badgateway', 503: 'serviceunavailable' };
/** An HTTP status the code writes by name (`Abort(.notFound)`, `NotFoundException`). */
const statusNamed = (n, text) => !!STATUS_NAMES[n] && String(text).toLowerCase().replace(/[^a-z]/g, '').includes(STATUS_NAMES[n]);

const ORDER_WORDS = { '>': /\b(?:more|greater|longer|later|bigger|larger) than\b|\bafter\b/g, '>=': /\bat least\b/g, '<': /\b(?:less|fewer|shorter|earlier|smaller) than\b|\bbefore\b/g, '<=': /\bat most\b/g };
const FLIP = { '>': '<', '<': '>', '>=': '<=', '<=': '>=' };

/** Ordering comparisons in a tree, by kind (a comparison under a `not` is turned round: not (a < b) is a >= b). */
function orderCounts(tree) {
  const c = { '>': 0, '>=': 0, '<': 0, '<=': 0 };
  for (const n of nodesOf(tree)) {
    if (n.kind === 'compare' && c[n.op] != null) c[n.op]++;
    else if (n.kind === 'chain') for (const op of n.ops) if (c[op] != null) c[op]++;
  }
  return c;
}
function orderWords(said) {
  const c = {};
  for (const [op, re] of Object.entries(ORDER_WORDS)) c[op] = (said.match(re) || []).length;
  return c;
}
/** True when the words name each kind of ordering comparison as often as the code has it (or its mirror). */
function orderingKept(tree, said) {
  const t = orderCounts(tree), w = orderWords(claimText(said));
  const total = (o) => o['>'] + o['>='] + o['<'] + o['<='];
  if (total(t) !== total(w)) return false;
  // `a < b` may be read "b is more than a": each kind matches itself or its mirror image.
  return (t['>'] + t['<'] === w['>'] + w['<']) && (t['>='] + t['<='] === w['>='] + w['<=']);
}

/** Negations in the words, without the ones a form is written with. */
const NEG_TOKEN = /^(?:not|no|non|never|cannot|nt)$/;
const saidNegations = (said) => splitWords(claimText(said).replace(FORM_NEGATIONS, ' ').replace(/n't\b/g, ' nt')).filter((w) => NEG_TOKEN.test(w)).length;
const NULL_NAME = /^(?:NULL|nullptr|nil|None|null|undefined|Nothing)$/;
const isNullish = (x) => x && ((x.kind === 'literal' && x.type === 'null') || (x.kind === 'name' && NULL_NAME.test(x.name)));

/** Negations in a tree (as the faithfulness gate counts them). */
const isCmpCall = (x) => x?.kind === 'call' && /^(?:str|strn|mem|wcs|wcsn)(?:case)?cmp$|^_?str(?:n)?icmp$/.test(x.callee?.name ?? '');
const isZero = (x) => x?.kind === 'literal' && String(x.value) === '0';
function treeNegations(tree, skipArgs = false) {
  let neg = 0;
  const names = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.kind === 'not' && !isCmpCall(n.value)) neg++;
    else if (n.kind === 'call' && /^(?:reject|reject!|delete_if|filterNot|filterNotNull|exclude|without|dropWhile|drop_while)$/.test(n.callee?.property ?? n.callee?.name ?? '') && n.args?.some((a) => a.kind === 'lambda')) neg++;
    else if (n.kind === 'compare' && /^(?:!=|!==|<>|is not|not in|!is|!in|-ne)$/.test(n.op) && !(isCmpCall(n.left) && isZero(n.right)) && !(n.op !== '!==' && [n.left, n.right].some(isNullish))) neg++;
    else if (n.kind === 'if' && n.negate) neg++;
    if (n.kind === 'name') names.push(n.name);
    else if (n.kind === 'member') names.push(n.property);
    if (n.kind === 'lambda') return;
    for (const k of Object.keys(n)) {
      if (skipArgs && n.kind === 'call' && k === 'args') continue;
      const v = n[k];
      if (v && typeof v === 'object') walk(v);
    }
  };
  walk(tree);
  // Negative words inside names ("notFound", "WSA_NOT_ENOUGH_MEMORY") are read as words on both sides.
  for (const x of names) for (const w of splitWords(x)) if (/^(?:not|no|non|never|cannot)$/.test(w)) neg++;
  return neg;
}

/** "a new Command": the value makes a new value of that type. */
function newThing(v, says) {
  const m = / a new ([\w ]+?)(?: as [\w ]+)?(?:,|$)/.exec(says);
  if (!m) return false;
  let c = coreOf(v);
  if (c?.kind === 'unary' && c.op === '&') c = coreOf(c.value);
  const type = c?.kind === 'object' ? c.type : c?.kind === 'call' ? (c.callee.kind === 'name' ? c.callee.name : c.callee.kind === 'member' ? (/^(?:new|New)$/.test(c.callee.property) ? (c.callee.object.name ?? c.callee.object.property) : c.callee.property) : null) : null;
  return !!type && sameWords(String(type).replace(/<.*$/, '').split(/::|\./).pop(), m[1]);
}

const ARITH = new Set(['+', '-', '*', '/', '%', '**', '//', '<<', '>>', '>>>', '&', '|', '^', '&^']);
const arithCount = (tree) => { let n = 0; for (const x of nodesOf(tree)) if (x.kind === 'binary' && ARITH.has(x.op)) n++; return n; };
// (A C pointer cast `(T *)p` changes how a value is read, not the value; it is not counted.)
const castCount = (tree) => { let n = 0; for (const x of nodesOf(tree)) if (x.kind === 'cast' && x.form !== 'nonnull' && !(x.form === 'c' && /\*\s*$/.test(String(x.type)))) n++; return n; };

// Names a reader says by what they stand for.
const SAID_AS = {
  process: / setting /, env: / setting | environment /, environ: / setting /, os: / setting /, getenv: / setting /, ENV: / setting /,
  headers: / header /, header: / header /, req: / header | request | parameter | query | body | cookie /, request: / header | request | parameter | query | body | cookie /,
  params: / parameter | request /, query: / query | parameter | request /, body: / body | request /, cookies: / cookie /,
  str: / text /, string: / text /, bytes: / text | bytes /, basestring: / text /, unicode: / text /, 'string type': / text /,
  int: / number | whole /, float: / number /, number: / number /, numeric: / number /, integer: / number /,
  list: / list /, array: / list | array /, tuple: / list | tuple /, dict: / table | lookup | dictionary /, map: / table | lookup | map /, hash: / table | lookup | hash /,
  'to s': / text /, 'to string': / text /, 'to str': / text /, 'to i': / number /, 'to f': / number /, 'to int': / number /, 'to sym': / symbol /, 'to a': / list /, 'to h': / table | lookup /,
  dup: / copy /, clone: / copy /, copy: / copy /, deepcopy: / copy /,
  bool: / yes | true | false /, boolean: / yes | true | false /, null: / set | nothing | null | missing /, none: / set | nothing | none | missing /,
};

/** Every name and value of a tree is in the words (as words). */
function namesKept(tree, said) {
  const norm = (t) => t.replace(/ have /g, ' has ').replace(/ are /g, ' is ').replace(/ does /g, ' ');
  const base = ` ${splitWords(claimText(said)).join(' ')} ${splitWords(said).join(' ')} `;
  // "is not X" for `!isX()`: the name is matched with the negation words taken out (negations are counted apart).
  const sw = norm(`${base} ${base.replace(/ (?:not|no|does not|doesn t) /g, ' ')} `);
  const has = (x) => {
    const w = splitWords(x).join(' ');
    if (!w || /^(?:self|this|it|super)$/.test(w) || sw.includes(` ${w} `) || sw.includes(` ${w.replace(/s$/, '')} `) || sw.includes(` ${w}s `)) return true;
    // Names a reader says by what they stand for: the request's parts, settings, and types ("is text" for `str`).
    const say = SAID_AS[w];
    if (say && say.test(sw)) return true;
    // `is_array(x)` / `isString(x)`: "x is an array", "x is not text".
    const isX = /^is (.+)$/.exec(w);
    if (isX) { const t = isX[1]; const as = SAID_AS[t]; return new RegExp(` is (?:not )?(?:an? )?${t} `).test(sw) || (!!as && / is /.test(sw) && as.test(sw)); }
    return false;
  };
  const rawSaid = String(said);
  const howMany = / how many | length | size | count | number of /.test(sw);
  const isA = / is | are /.test(sw);
  const setWords = / set | empty | nothing | missing | null | nil | none | undefined | given | there | exists? /.test(sw);
  const ok = (n) => {
    if (!n || typeof n !== 'object') return true;
    if (Array.isArray(n)) return n.every(ok);
    switch (n.kind) {
      case 'name': return n.type === true || (NULL_NAME.test(n.name) ? setWords : has(n.name));
      case 'literal': if (n.type === 'text') return rawSaid.includes(String(n.value)) || String(n.value).length === 0 || rawSaid.includes(String(n.raw ?? '').slice(1, -1)) || n.interpolated || /\\\(|\$\{|#\{|\{\w/.test(String(n.raw ?? n.value)) || (SAID_AS[String(n.value).toLowerCase()]?.test(sw) ?? false);
        return n.type === 'null' ? setWords : n.type === 'bool' ? true : n.type === 'number' ? sw.includes(` ${String(n.raw ?? n.value).replace(/[^\w]+/g, ' ').trim().toLowerCase()} `) || has(String(n.value)) || /^[01]$/.test(String(n.value)) : true;
      case 'member': {
        if (/^(?:length|size|count|len|Length|Count|Size)$/.test(n.property) && howMany) return ok(n.object);
        // A constant on a type or namespace (`numeric_system::standard`, `PixelOpacity.TRANSLUCENT`): its own name is enough.
        const obj = n.object;
        if (n.static || (obj?.kind === 'name' && /^[A-Z]/.test(obj.name)) || (obj?.kind === 'member' && /^[A-Z]/.test(obj.property))) return has(n.property);
        return has(n.property) && ok(obj);
      }
      case 'call': {
        const c = n.callee;
        const name = c?.kind === 'member' ? c.property : c?.kind === 'name' ? c.name : null;
        // Calls that only walk a collection (`enumerate(xs)`, `d.items()`), or read an entry (`m.get(k)` as "the k entry in m").
        const own = c?.kind === 'member' && !(c.object?.kind === 'name' && /^[A-Z]/.test(c.object.name)) ? c.object : null;
        if (name && /^(?:enumerate|iter|iter_mut|into_iter|items|entries|values|stream|ToList|toList|AsEnumerable|toArray|asList|each_with_index|with_index|indices|withIndex|Values|Keys|keys)$/.test(name)) return ok(own) && ok(n.args);
        // Rust `s.chars()` / `text.lines()` / `data.bytes()`: "the characters of s".
        if (name && /^(?:chars|lines|bytes)$/.test(name) && own && sw.includes(` ${{ chars: 'characters', lines: 'lines', bytes: 'bytes' }[name]} of `)) return ok(own) && ok(n.args);
        // C's string compare: `!strcmp(a, "x")` is "a is "x"".
        if (name && /^(?:str|strn|mem|wcs|wcsn)(?:case)?cmp$|^_?str(?:n)?icmp$/.test(name) && / is /.test(sw)) return ok(n.args);
        if (name && /^(?:get|Get|fetch|at|get_or_default|getOrDefault|GetValueOrDefault|TryGetValue|getOrNull|Item)$/.test(name) && / entry | entries /.test(sw)) return ok(c.kind === 'member' ? c.object : null) && ok(n.args);
        // `d.get("k")` as "the "k" value from d"; `d.get("k", x)` as "…, or x if it has none" (the fallback said).
        if (name === 'get' && c?.kind === 'member' && n.args?.[0]?.kind === 'literal' && n.args[0].type === 'text' && / value from /.test(sw) && (n.args.length === 1 || (n.args.length === 2 && / if it has none /.test(sw)))) return ok(c.object) && ok(n.args);
        // "the result of X": the call is named, what it is given is one level down.
        if (name && has(name) && sw.includes(` result of ${splitWords(name).join(' ')} `)) return true;
        if (name && /^(?:new|New|create|of|from|make)$/.test(name) && / new /.test(sw) && c.kind === 'member') return ok(c.object);
        // Everyday JavaScript calls said by what they give back (steps.mjs sayCommon): the words name every argument.
        const onType = c?.kind === 'member' && c.object?.kind === 'name' ? c.object.name : null;
        if (onType === 'Math' && /^(?:max|min)$/.test(name) && / (?:largest|smallest) /.test(sw)) return ok(n.args);
        if (onType === 'Math' && /^(?:round|floor|ceil|abs|trunc)$/.test(name) && / (?:rounded|absolute|fraction) /.test(sw)) return ok(n.args);
        if (onType === 'Date' && name === 'parse' && / time written /.test(sw)) return ok(n.args);
        if (name === 'exec' && / first match of /.test(sw)) return ok(c.kind === 'member' ? c.object : null) && ok(n.args);
        if (name === 'parse' && onType && /^[A-Z]/.test(onType) && / checked and read by /.test(sw) && has(onType)) return ok(n.args);
        if (name === 'from' && onType && / made from /.test(sw)) return ok(n.args);
        // Everyday Python: a list/tuple/set made from a value, sorted, reversed, and a position found with .index().
        if (c?.kind === 'name' && /^(?:list|tuple)$/.test(name) && / as a (?:list|tuple) /.test(sw)) return ok(n.args);
        if (c?.kind === 'name' && /^(?:set|frozenset)$/.test(name) && / different values in /.test(sw)) return ok(n.args);
        if (c?.kind === 'name' && name === 'sorted' && / sorted /.test(sw)) return ok(n.args);
        if (c?.kind === 'name' && name === 'reversed' && / reverse order /.test(sw)) return ok(n.args);
        if (name === 'index' && c?.kind === 'member' && / position of /.test(sw)) return ok(c.object) && ok(n.args);
        // Questions about a collection said in words: "any item in xs matches", "every …", "the first … that matches".
        if (name && /^(?:any|some|all|every|none|find|first|filter|where|select|detect|find_index|findIndex|includes|include\?|contains|Contains|any\?|all\?|none\?|exists|Any|All|Exists|in_array|has|hasOwnProperty|has_key|key\?|containsKey|ContainsKey|startswith|endswith|startsWith|endsWith|StartsWith|EndsWith|start_with\?|end_with\?)$/.test(name) && / (?:any|every|all|no|first|matches|match|in|has|contains|starts|ends|one of) /.test(sw)) return ok(own) && n.args.every((a) => a.kind === 'lambda' || ok(a));
        if (name && /^(?:len|length|size|count|nrow|NROW|Count|sizeof|strlen|wcslen|mb_strlen|nchar|str_length|lengths|Length)$/.test(name) && howMany) return ok(c.kind === 'member' ? c.object : null) && ok(n.args);
        if (name && /^(?:isinstance|is_a\??|kind_of\??|instance_of\??|inherits|is)$/.test(name) && isA) return ok(c.kind === 'member' ? c.object : null) && ok(n.args);
        if (name && /^(?:is\.null|is_null|isNull|is\.na|isset|empty|is_none|isNone|isNil|is_nil|nil\?|null\?|blank\?|present\?|empty\?|isEmpty|IsNullOrEmpty|IsNullOrWhiteSpace|isBlank|isNotEmpty|isNotBlank|any\?|none\?)$/.test(name) && setWords) return ok(c.kind === 'member' ? c.object : null) && ok(n.args);
        return (name == null || has(name)) && (c?.kind !== 'member' || ok(c.object) || /^[A-Z]/.test(c.object?.name ?? '')) && ok(n.args);
      }
      case 'cast': return ok(n.value);
      case 'pattern': return (n.names || []).every(has);
      case 'lambda': return true;
      case 'comprehension': return n.clauses.every((c) => ok(c.iter));
      case 'binary': if (/ built from its parts /.test(sw) && /^(?:\+|\.|\.\.|<>|\|\|)$/.test(n.op)) return true; return ok(n.left) && ok(n.right);
      case 'template': return n.parts.every((x) => typeof x === 'string' || ok(x.expr));
      default:
        for (const k of Object.keys(n)) { const v = n[k]; if (v && typeof v === 'object' && !ok(v)) return false; }
        return true;
    }
  };
  return ok(tree);
}

// ── Forms ───────────────────────────────────────────────────────────────────────────────────────────────────

// Words that start a statement but are not functions: "Calls unsafe" is never true.
const KEYWORD_CALLEE = /^(?:use|unsafe|using|foreach|for|type|return|pub|public|private|protected|internal|static|final|var|let|const|val|if|while|switch|match|case|new|await|async|yield|throw|raise|def|fn|func|function|class|struct|enum|interface|impl|do|else|try|catch|lock|fixed|checked|unchecked|goto|typedef|template|typename|constexpr|sizeof|defer|go|select|when|loop|override|virtual|abstract|sealed|readonly|extern|inline|volatile|register|auto|signed|unsigned|operator|delegate|event|where|from|import|export|package|module|namespace|begin|end|unless|until|elsif|then|ensure|rescue|lambda|proc|mut|ref|out|in|is|as|not|and|or)$/;

const coreOf = (e) => {
  let c = e;
  while (c && ((c.kind === 'unary' && (c.op === 'await' || c.op === '?' || c.op === '!!')) || (c.kind === 'cast' && c.form === 'nonnull'))) c = c.value;
  return c;
};
/** The names of the calls along a value's receiver chain: a.b().c() -> [b, c]. */
function chainCallees(e) {
  const out = [];
  let c = coreOf(e);
  while (c) {
    if (c.kind === 'call') {
      const cal = c.callee;
      if (cal.kind === 'member') { out.push(cal.property); c = coreOf(cal.object); continue; }
      if (cal.kind === 'name') out.push(cal.name);
      if (cal.kind === 'index' && cal.object?.kind === 'name') out.push(cal.object.name);
      if (cal.kind === 'index' && cal.object?.kind === 'member') { out.push(cal.object.property); c = coreOf(cal.object.object); continue; }
      break;
    }
    if ((c.kind === 'logic' && c.op === 'or') || (c.kind === 'binary' && (c.op === '??' || c.op === '?:'))) {
      for (const x of c.operands ?? [c.left, c.right]) out.push(...chainCallees(x));
    }
    if (c.kind === 'member' || c.kind === 'index') { c = coreOf(c.object); continue; }
    break;
  }
  return out;
}
const sameWords = (a, b) => splitWords(a).join('') === splitWords(b).join('');
/**
 * The name a step gives a call: its own name, or (for a name that ends on a preposition, `changeApprovalFor`) its name
 * followed by its first argument, which must be a name in the code ("change approval for x"), or its name without
 * the preposition ("change approval"). See callWords in steps.mjs.
 */
const PREPOSITION_END = /(?:for|from|to|of|with|by|in|on|at|about|into|as|via)$/i;
function callNamed(callee, said, code) {
  if (sameWords(callee, said)) return true;
  const cw = splitWords(callee);
  if (!cw.length || !PREPOSITION_END.test(cw[cw.length - 1])) return false;
  const sw = splitWords(said);
  if (sw.join('') === cw.slice(0, -1).join('')) return true;
  if (sw.length <= cw.length || sw.slice(0, cw.length).join('') !== cw.join('')) return false;
  const rest = sw.slice(cw.length).join('');
  return splitWords(String(code)).some((w, i, all) => all.slice(i, i + sw.length - cw.length).join('') === rest);
}

/** Language keywords that begin the statement (the step's code). */
const leadingWord = (code) => (String(code).trim().match(/^[A-Za-z_]+/) || [''])[0];

const ENDING_CODE = /(?:^|[;&|]\s*)(?:exit|return|exec)\b|^\s*(?:return\b|yield\b|throw\b|raise\b|exit\b|die\b|abort\b|panic!?|halt\b|fail\b|Exit\b|exit\(|_exit\(|os\.Exit\(|sys\.exit\(|process\.exit\(|System\.exit\(|stop\(|Throw-|throw\(|break\b|Write-Error\b.*-ErrorAction\s+Stop|quit\(|q\()/i;
const IMPLICIT_RETURN_LANGS = new Set(['ruby', 'rust', 'kotlin', 'scala', 'swift', 'r', 'elixir', 'typescript', 'javascript', 'csharp', 'java', 'powershell', 'shell', 'python', 'go', 'php', 'cpp', 'c', 'sql']);

/**
 * Check one worded step. Returns null when its words are accounted for, else the reason it is shown as code.
 * `ctx`: { lang, last (the last thing the function does), only (the function's only step) }.
 */
function checkStep(step, ctx) {
  const says = String(step.says ?? '');
  const code = String(step.code ?? '');
  currentLang = ctx.lang;
  // The words' values and names are checked against the whole statement (the display copy can be cut short).
  let full = `${sourceOf(step, ctx)}${ctx.valueTarget ? `\n${ctx.valueTarget}` : ''}`;
  // A shell helper that always exits (`die() { …; exit 3; }`): its exit code is written in its own body, in this file.
  if (ctx.lang === 'shell' && step.kind === 'fail' && ctx.lines) {
    const callee = (/^\s*([\w-]+)/.exec(code) || [])[1];
    const def = callee && ctx.helperExits?.get(callee);
    if (def) full += `\nexit ${def}`;
  }
  const e = step.expr;
  const lang = ctx.lang;
  const tree = e && e.kind !== 'code' ? e : null;
  const hasTreeLang = !['shell', 'powershell', 'r', 'sql'].includes(lang);

  // A tree the reader could not parse: only a fixed safe form, checked against the text.
  if (hasTreeLang && (!e || e.kind === 'code') && step.kind !== 'try' && step.kind !== 'check' && !/^(?:Otherwise|Leaves the|Skips to the next|Stops here$|Tries |Runs the next steps|If anything goes wrong)/.test(says)) {
    const why = safeForm(step, says, /…$/.test(code) ? full.replace(/\s*\n\s*/g, ' ') : code, lang);
    if (why) return why;
    // A safe form was matched against the text: only the checks on values and words below apply.
    var safeOk = true;
  }

  LIBRARY_STEP = !!step.library;
  // A library phrase ("Checks that x is set; otherwise stops with …") for a call of a name this file defines itself
  // (`require(byteCount)` in okio is its own method) is not that library's call.
  if (step.library && ctx.ownFunctions) {
    const callee = (/^\s*(?:return\s+)?(?:await\s+)?(?:(?:this|self)\s*\.\s*)?([A-Za-z_]\w*)\s*\(/.exec(code) || [])[1];
    if (callee && ctx.ownFunctions.has(callee)) return WHY.form;
  }
  // Values, sources, ambiguity: every form.
  if (inventedValue(says, full)) return WHY.value;
  const u = unsourcedWord(says, full);
  if (u) return `${WHY.words} ("${u}" has no source in the code)`;
  if (ambiguousName(says, full)) return WHY.ambiguous;
  const said0 = claimText(says);
  // Shell here-strings (`<<<"$x"`) feed text to a command; the readers do not tell that apart from running it.
  if (lang === 'shell' && /<<</.test(`${code}\n${full}`)) return WHY.form;
  // Words with a token that is only punctuation ("--", "?", "-") put a flag or a symbol where a name should be.
  if (/(?:^|\s)(?:--|\?)(?:\s|$)/.test(claimText(says).replace(/\s+\?$/, ''))) return WHY.words;
  if (lang === 'shell') {
    // Brace expansion (`mkdir "$d/"{a,b}`) makes several words from one; `-` alone means standard input.
    if (/\{[^{}\s"'$]*,[^{}\s"']*\}/.test(stripQuoted(full).replace(/\$\{[^}]*\}/g, ''))) return WHY.form;
    if (/"-"/.test(says) && /(?:^|\s)-(?:\s|$)/.test(full)) return WHY.form;
  }
  // PowerShell `Get-ChildItem -File` / `-Directory` gets only files / only folders.
  if (lang === 'powershell' && /files and folders/.test(says) && /-(?:File|Directory)\b/i.test(full)) return WHY.meaning;
  // A PowerShell switch changes what a command does (`-File`, `-Recurse`, `-Raw`, `-Unique`): the words name it, or
  // the switch is one that does not change the result (`-Force`, `-ErrorAction`, `-Verbose`).
  if (lang === 'powershell' && step.kind !== 'branch' && step.kind !== 'loop') {
    const said = ` ${splitWords(says).join(' ')} `;
    // (Only a cmdlet's switches: `Get-ChildItem -File`; an outside program's flags, `git branch -r`, are its own.)
    const cmdletParts = stripQuoted(code).split('|').filter((p) => /^\s*(?:\$[\w:]+\s*=\s*)?(?:&\s*)?[A-Z][a-z]+-[A-Z]\w*/.test(p)).join(' | ');
    for (const m of `${cmdletParts} `.matchAll(/(?:^|\s)-([A-Za-z][A-Za-z]+)(?=\s+-|\s*$|\s*[|;)}])/g)) {
      const sw = m[1];
      if (/^(?:Force|ErrorAction|WarningAction|InformationAction|Verbose|Debug|Confirm|WhatIf|NoNewline|ForegroundColor|BackgroundColor|OutVariable|ErrorVariable|Scope|Global|Script|Not|Contains|NotContains|Match|NotMatch|Like|NotLike|And|Or|Eq|Ne|Gt|Lt|Ge|Le|Is|IsNot|In|NotIn|Replace|Split|Join|F|As|Band|Bor|PassThru|Mandatory|Online|NoElement|NoTypeInformation)$/i.test(sw)) continue;
      const map = { recurse: / everything | all | recursive| and every /, raw: / whole | as one | raw /, unique: / unique | once | duplicate /, file: / files? /, directory: / folders? /, leaf: / last part | leaf /, parent: / parent | folder /, descending: / descending | highest | largest | last /, first: / first /, last: / last /, sum: / total | sum /, count: / how many | count /, resolve: / full /, literalpath: / path /, encoding: / encoding /, append: / adds? | append /, nonewline: / /, quiet: / quiet /, simplematch: / plain text | as text /, casesensitive: / case /, asplaintext: / plain /, aspath: / path /, include: / including /, exclude: / except | excluding | without /, skip: / skip /, wait: / wait /, nowait: / without waiting /, nologo: / /, noprofile: / without the profile /, hidden: / hidden /, wrap: / wrap /, autosize: / size /, expandproperty: / /, property: / /, typename: / type /, list: / list /, all: / all /, tail: / last /, totalcount: / first /, delimiter: / separated /, header: / header /, noclobber: / not overwrite | replace nothing /, depth: / deep | depth /, compress: / compact | compress /, asjob: / background /, isvalid: / valid /, pathtype: / folder | file /, erroraction: / / };
      const key = sw.toLowerCase();
      if (said.includes(` ${splitWords(sw).join(' ')} `) || (map[key] && map[key].test(said))) continue;
      return WHY.meaning;
    }
  }
  // "x, or y when that has no value" is a default; `||` gives back yes or no in PHP, Java, C#, Go, Rust, C and C++.
  if (tree && /when (?:that|it) has no value/.test(says) && [...nodesOf(tree)].some((n) => n.kind === 'logic' && n.op === 'or') && !/^(?:javascript|typescript|python|ruby|r|shell|powershell|perl|lua)$/.test(lang)) return WHY.meaning;
  // `this.options` read as "the options" while the function also has its own `options`.
  if (tree && ctx.ownNames && /\b(?:this|self)\b/.test(code) && [...nodesOf(tree)].some((n) => n.kind === 'member' && n.object?.kind === 'name' && /^(?:this|self)$/.test(n.object.name) && ctx.ownNames.has(n.property)) && !/\b(?:this|self|its own|it is given)\b/.test(says)) return WHY.ambiguous;
  // "whether …" says yes or no: the value must be a comparison, a negation, and/or, or a yes/no call (`x as T` and
  // `a << 17` are not).
  if (tree && /\bwhether\b/.test(says)) {
    const v = coreOf(tree.kind === 'assign' ? tree.value : tree.kind === 'return' ? tree.value : tree);
    const yn = (n) => n && (n.kind === 'compare' || n.kind === 'chain' || n.kind === 'not' || (n.kind === 'logic' && n.operands.every(yn)) || (n.kind === 'literal' && n.type === 'bool') || (n.kind === 'call' && /^(?:is|has|can|should|does|contains|includes|exists|matches|match|fnmatch|equals|starts|ends|any|all|every|some|isinstance|[a-z_]+\?)/i.test(String(n.callee?.property ?? n.callee?.name ?? ''))) || (n.kind === 'name' && /^(?:is|has|can|should)[A-Z_]/.test(n.name)) || (n.kind === 'member' && /^(?:is|has|can|should)[A-Z_]/.test(n.property)));
    if (v && !yn(v)) return M('whether-not-yes-no');
  }
  // Java compares text with `==` by reference: `s == "true"` is not "s is true".
  if (lang === 'java' && tree && [...nodesOf(tree)].some((n) => n.kind === 'compare' && /^[!=]=$/.test(n.op) && [n.left, n.right].some((x) => x?.kind === 'literal' && x.type === 'text'))) return WHY.meaning;
  // "or y when that has no value" is a default (`??`, `?:`); `||` / `or` also skip false, 0, and "", so it is not that.
  if (tree && /when (?:that|it) has no value/.test(says) && [...nodesOf(tree)].some((n) => n.kind === 'logic' && n.op === 'or') && ![...nodesOf(tree)].some((n) => n.kind === 'binary' && (n.op === '??' || n.op === '?:'))) return WHY.meaning;
  // `kwargs.setdefault(k, v)` / `putIfAbsent` set only when nothing is there yet.
  if (tree && [...nodesOf(tree)].some((n) => n.kind === 'call' && /^(?:setdefault|putIfAbsent|computeIfAbsent|getOrPut|get_or_insert|get_or_insert_with|or_insert|or_insert_with|TryAdd|GetOrAdd)$/.test(n.callee?.property ?? n.callee?.name ?? '')) && !/\b(?:if|unless|yet|missing|not there|nothing)\b/.test(said0)) return WHY.meaning;
  // A name split into one-letter pieces (`NaN` as "na n") is not a name a reader can use.
  if (claimWords(says).some((w) => w.length === 1)) for (const id of String(full).match(/\b[A-Za-z][a-z]*[A-Z][A-Za-z]*\b/g) || []) {
    if (id.length > 4) continue;
    const parts = splitWords(id);
    if (parts.some((p) => p.length === 1) && ` ${claimWords(says).join(' ')} `.includes(` ${parts.join(' ')} `) && !String(says).includes(id)) return WHY.words;
  }
  // A `static` local (C, C++) is set once, not every time the function runs.
  if ((lang === 'c' || lang === 'cpp') && /^\s*(?:const\s+)?static\b/.test(code) && /^Sets |^Works out /.test(says)) return WHY.form;
  // "the items in x that match" is a filter: the call must be given a test (a function), not columns or names.
  if (tree && /\bthe items in\b.*\b(?:that|where)\b|\bonly those where\b/.test(says)) {
    const calls = [...nodesOf(tree)].filter((n) => n.kind === 'call');
    if (calls.length && !calls.some((c) => (c.args || []).some((a) => a.kind === 'lambda' || a.kind === 'name' || a.kind === 'member'))) return WHY.meaning;
  }
  // Ruby's "hands control to the given block" is Ruby's yield; Python's and JavaScript's yield give back values.
  if (lang !== 'ruby' && /given block/.test(says)) return WHY.form;
  // An idiom inside code written in the words (`p[how many p-1]`) is garbled: neither words nor code.
  if (/\[[^\]]*\b(?:how many|the|is|of|whether)\b[^\]]*\]/.test(claimText(says))) return WHY.words;
  // Words with a bracket left open are garbled.
  if (!bracketsClosed(claimText(says))) return WHY.words;
  // "Sets x to x" is a real self-assignment, or it hides where the value comes from.
  const self = /^Sets (.+?) to (.+?)$/.exec(says);
  if (self && sameWords(self[1], self[2]) && self[1] !== self[2] && /^[a-z]/.test(self[2].replace(/^the /, '')) && !/^\s*(?:[\w.]+)\s*=\s*\1\s*;?$/.test(code)) return WHY.ambiguous;
  if (self && self[1] === self[2] && !new RegExp(`^\\s*(?:\\S+\\s+)?([\\w.$]+)\\s*=\\s*\\$?\\{?\\1\\}?\\s*;?$`).test(code)) return WHY.ambiguous;


  if (safeOk) return null;
  const said = claimText(says);
  switch (step.kind) {
    case 'branch': {
      if (/^(?:Chooses by|Checks these cases)/.test(says)) {
        if (tree && tree.kind === 'switch' && tree.subject && !namesKept(tree.subject, says)) return M('L285');
        return null;
      }
      if (/^(?:Waits for whichever of these is ready first|Checks which of these is ready, without waiting)/.test(says)) return /^\s*select\b/.test(code) ? null : WHY.form;
      // Kotlin `x?.let { … }`: "If x is set".
      const letM = /^\s*([\w.]+)\?\.(?:let|also|run|apply)\s*\{/.exec(code);
      if (letM) { const w = /^If (.+?) is set(?: \(\d+ steps? inside\))?$/.exec(says); return w && sameWords(w[1].replace(/^the (?:[\w ]+'s )?/, ''), letM[1].split('.').pop()) ? null : WHY.form; }
      if (!/^If\b/.test(says)) return /^(?:When|Unless)\b/.test(says) ? null : WHY.form;
      return conditionKept(step, tree, says, code, lang);
    }
    case 'loop': ctx_full = full; return loopKept(step, tree, says, code, lang);
    case 'check': {
      if (/^(?:Otherwise|Default|If none)/.test(says)) return null;
      if (/^\s*case\b.*<-/.test(code) && /^When /.test(says)) return null;
      if (tree && tree.kind === 'case' && tree.patterns && !tree.patterns.every((p) => namesKept(p, says))) return M('L294');
      if (tree && tree.kind === 'case' && /\bis (?:set|not|empty)\b|\b(?:more|less) than\b|\bat (?:least|most)\b/.test(said) && !tree.patterns?.some((p) => [...nodesOf(p)].some((n) => n.kind === 'compare' || n.kind === 'not' || isNullish(n)))) return M('case-claim');
      if (tree && tree.kind === 'call' && /^Checks that /.test(says)) return conditionCore(tree.args?.[0] ?? tree, says, code, lang);
      return null;
    }
    case 'return': {
      const response = /^\s*(?:return\s+)?(?:res|reply|response|ctx|c)\s*\.\s*(?:status\([^)]*\)\s*\.\s*)?(?:json|send|end|render|redirect|sendStatus|sendFile|JSON|String|HTML)\s*\(/.test(code) || (/^\s*next\s*\(/.test(code) && ctx.last);
      if (!response && !ENDING_CODE.test(code) && !implicitReturnOk(step, ctx, code)) return WHY.ending;
      if (/^Stops here\b/.test(says)) return (tree && tree.kind === 'return' && tree.value) || !/^\s*(?:return|exit|exit\s+0)?\s*;?\s*$/.test(code.replace(/^\s*return\b/, '')) ? M('stops-not-bare') : null;
      if (/^Returns whether |^Gives back whether /.test(says)) return conditionCore(tree?.kind === 'return' ? tree.value : tree, says.replace(/^\w+ (?:back )?whether /, ''), code, lang);
      return valueKept(tree?.kind === 'return' ? tree.value : tree, says, code, lang);
    }
    case 'fail': {
      if (!ENDING_CODE.test(code) && !/^\s*(?:Write-Error|errors\.New|Err\(|return\s+Err|abort|die|bail!|ensure!|stop\(|rlang::abort|cli::cli_abort|assert)/.test(code)) {
        // A fail that is not a throw is shown as code unless its code is a recognized error return.
        // (A call of a function whose name says it stops: `t.Fatal(…)`, `log.Fatalf`, `_exiterr "…"`, `abort(…)`.)
        const callee = (/^\s*([A-Za-z_][\w.:-]*)/.exec(code) || [])[1] ?? '';
        const response = /\b(?:res|reply|response|ctx|c|w|resp)\s*\.\s*(?:status|code|sendStatus|WriteHeader|JSON|String|AbortWithStatus\w*)\s*\(\s*(?:[45]\d\d|http\.Status\w+)|\babort\(\s*[45]\d\d|HTTPException\(|Http\w*Exception|ResponseStatusException|halt\b|error\(\s*[45]\d\d/.test(code);
        if (!response)
        if (!/(?:^|[._:-])(?:fail|fatal|fatalf|fatalln|panic|panicf|abort|die|exit|exiterr|error|raise|throw|bail|stop|halt|err|reject|crash|terminate|quit)\w*$/i.test(callee)) return WHY.ending;
      }
      if (tree && saidNegations(says) > treeNegations(tree) + 1) return M('L309');
      return null;
    }
    case 'try': return /^\s*(?:try\b|begin\b|do\s*\{|do$|\$\{?|tryCatch|withCallingHandlers|catch\b|rescue\b)/.test(code) || /^(?:Tries|Runs the next steps)/.test(says) ? null : WHY.form;
    default: break;
  }

  // A call's argument that the words name is named whole: `free(history[j])` is not "Frees history".
  if (tree) {
    const core = coreOf(tree.kind === 'return' ? tree.value : tree);
    if (core?.kind === 'call') {
      const w = ` ${splitWords(says).join(' ')} `;
      for (const a of core.args || []) {
        if (a.kind !== 'index' && !(a.kind === 'member' && a.object?.kind === 'index')) continue;
        let root = a; while (root && (root.kind === 'index' || root.kind === 'member')) root = root.object;
        const rn = root?.kind === 'name' ? root.name : root?.kind === 'member' ? root.property : null;
        if (rn && w.includes(` ${splitWords(rn).join(' ')} `) && !namesKept(a, says)) return M('arg-part');
      }
    }
  }
  // "Adds X to Y" (a push, an append, an add): what is added is said in full (`push(items[0])` is not "Adds items").
  const adds = /^Adds (.+?) to (?:the end of )?(.+?)(?: \(.*\))?$/.exec(says);
  if (adds && tree) {
    // (The call that adds: along a chain such as `self.add(name).expect(MSG)`, the add.)
    let core = coreOf(tree.kind === 'assign' ? tree.value : tree);
    for (let c = core; c && c.kind === 'call'; c = c.callee?.kind === 'member' ? coreOf(c.callee.object) : null) {
      if (/^(?:add|push|append|insert|extend|concat|Add|AddRange|put|unshift|prepend|push_back|emplace_back|merge)$/.test(c.callee?.property ?? c.callee?.name ?? '')) { core = c; break; }
    }
    // An entry named by its fields ("an entry (title, rows, …)": each one a key of the object, in order) and a quoted
    // text (its exact words are checked as values, above) say what is added without its inner values.
    const entryNamed = (a) => {
      if (a?.kind !== 'object') return false;
      const keys = (a.entries || []).map((e) => (e.key?.kind === 'literal' ? String(e.key.value) : null));
      if (/^an empty entry$/.test(adds[1])) return keys.length === 0;
      if (/^an entry$/.test(adds[1])) return keys.length > 0;
      const listed = /^an entry \(([^)]*)\)/.exec(adds[1]);
      if (!listed) return false;
      const named = listed[1].split(', ').filter((k) => k !== '…');
      return named.length > 0 && named.every((k, i) => keys[i] != null && splitWords(keys[i]).join(' ') === splitWords(k).join(' '));
    };
    // (A quoted text may itself hold " to ", so the phrase may stop inside it: it starts with the quote.)
    const textNamed = (a) => ((a?.kind === 'literal' && a.type === 'text') || a?.kind === 'template') && /^"/.test(adds[1]);
    const kept = (a) => namesKept(a, adds[1]) || entryNamed(a) || textNamed(a) || /^several values$/.test(adds[1]);
    if (tree.kind === 'assign' && tree.op !== '=' && tree.op !== ':=') { if (!namesKept(tree.value, adds[1])) return M('adds-value'); }
    else if (core?.kind === 'call' && core.args?.length && !core.args.some(kept)) return M('adds-value');
    else if (core?.kind === 'call' && core.args?.some((a) => a.kind === 'index') && !core.args.every((a) => namesKept(a, adds[1]) || a.kind === 'name')) return M('adds-value');
  }
  // Calls, settings, and everything else: the words must not drop a negation, a comparison, or and/or in the tree.
  if (/^Calls /.test(says)) return callKept(step, tree, says, code, lang);
  if (tree) {
    // ("Adds an entry (…)" and "Adds several values" name what is added, not the values inside it: summaries too.)
    // (A quoted text whose «…» holds a worked-out value names that value as a placeholder only.)
    const summary = /^(?:Works out|Calls|Runs|Defines|Creates|Writes|Adds to|Adds an entry\b|Adds an empty entry\b|Adds several values\b|Takes|Declares|Starts with|Makes|Stores the result of)\b| the result of |«…»/.test(says);
    const neg = treeNegations(tree, summary), w = saidNegations(says);
    if (w !== neg && !(w < neg && (/^(?:Works out|Calls|Runs|Defines|Creates|Writes|Adds to|Adds an entry\b|Adds an empty entry\b|Adds several values\b|Takes|Declares|Starts with|Makes)\b/.test(says) || /«…»/.test(says)) && !/\b(?:whether|if|when)\b/.test(said))) return M('L320');
    if (w > neg) return M('L321');
    // A value stated in full ("Sets x to a plus b") must keep every operator; a summary ("Works out x from f") says
    // only what it names, and the rest is one level down in Details.
    if (/^Sets .+ to /.test(says)) {
      const v = tree.kind === 'assign' ? tree.value : null;
      if (v) {
        // A slice said by its ends ("the first 3 of xs"): the exact phrase for this slice, with the list's own name.
        const sl = sliceOf(v);
        if (sl) { if (!sliceSaid(sl, says)) return M('L327s'); }
        else if (!newThing(v, says) && !namesKept(v, says)) return M('L327');
        if (castCount(v) && !/\bas\b|\bcopy\b|\bconverted\b|\bturned\b/.test(said)) return M('L328');
        if (!orderingKept(v, says)) return M('L329');
      }
    }
    // Rust `let y = f(x)?;`: the words say it stops there when f fails (and only when the code has the ?).
    if (lang === 'rust' && tree.kind === 'assign' && /^(?:Works out|Sets) /.test(says)) {
      const q = tree.value?.kind === 'unary' && tree.value.op === '?';
      if (q !== / and stops here if that fails$/.test(says)) return M('rust-q');
    }
    if (/^Works out (.+?) from (.+)$/.test(says) && tree.kind === 'assign') {
      const m = /^Works out (.+?) from ([\w ]+?)(?:, and stops here if that fails)?$/.exec(says);
      const callees = chainCallees(tree.value);
      if (m && callees.length && !callees.some((c) => callNamed(c, m[2], code))) return M('L335');
    }
    if (/\bif\b.*\botherwise\b/.test(said) && ![...nodesOf(tree)].some((n) => n.kind === 'conditional' || n.kind === 'if')) return WHY.form;
  }
  return null;
}

/** "Calls X": the code calls X (its last name), and X is not a keyword. */
function callKept(step, tree, says, code, lang) {
  const m = /^Calls ([^,:(]+?)(?: with these steps| on each| for each|,|:| \(| —|$)/.exec(says);
  if (!m) return WHY.form;
  const named = m[1].trim();
  const first = splitWords(named)[0] ?? '';
  if (KEYWORD_CALLEE.test(first) && splitWords(named).length === 1 && !new RegExp(`(?:[.>:]|^)\\s*${named.replace(/\W/g, '')}\\s*\\(`).test(code.trim())) return WHY.form;
  const lead = leadingWord(code);
  if (KEYWORD_CALLEE.test(lead) && !/^(?:new|await|go|defer|yield|return|try|do|lock|using|fixed|checked|unchecked|if|unless|when)$/.test(lead) && sameWords(lead, named) && !new RegExp(`^\\s*${lead}\\s*\\(`).test(code)) return WHY.form;
  if (tree) {
    const core = coreOf(tree.kind === 'return' ? tree.value : tree);
    if (!core) return WHY.form;
    const callees = [];
    for (const n of nodesOf(core)) if (n.kind === 'call') { const c = n.callee; if (c.kind === 'member') callees.push(c.property); else if (c.kind === 'name') callees.push(c.name); }
    // Ruby and Go call without brackets: a bare name or member statement is a call of it.
    if (core.kind === 'name' && (lang === 'ruby' || lang === 'go' || lang === 'perl')) callees.push(core.name);
    if (core.kind === 'member' && lang === 'ruby') callees.push(core.property);
    if (!callees.length) return WHY.form;
    const objects = [];
    for (const n of nodesOf(core)) if (n.kind === 'call' && n.callee.kind === 'member' && n.callee.object?.kind === 'name') objects.push(n.callee.object.name);
    if (!callees.some((c) => sameWords(c, named) || splitWords(c).join(' ').endsWith(splitWords(named).join(' '))) && !objects.some((o) => sameWords(o, named))) return M('L360');
    // The words name the statement's main call: a call written inside a negation or condition is not "Calls X".
    if (core.kind === 'logic' || core.kind === 'not' || core.kind === 'compare' || core.kind === 'conditional') return WHY.form;
  } else if (!['shell', 'powershell', 'r', 'sql'].includes(lang) || lang === 'r') {
    const re = new RegExp(`(?:^|[^\\w$])${splitWords(named).map((w) => `${w}`).join('[_\\s-]*')}\\s*\\(`, 'i');
    if (!re.test(code.replace(/::/g, '.'))) return WHY.form;
  }
  return null;
}

/** A condition (question, loop test, "whether"): every negation, and/or, ordering, and name is in the words. */
function conditionCore(test, says, code, lang) {
  if (!test || test.kind === 'code') {
    // No tree: the text gate (negations, and/or, comparisons counted on the code).
    return accountsFor(code, claimText(says)) ? null : M('L374');
  }
  const said = claimText(says);
  const tn = treeNegations(test), wn = saidNegations(says);
  if (tn !== wn) return M('L378');
  let logic = 0; for (const n of nodesOf(test)) if (n.kind === 'logic') logic += n.operands.length - 1;
  const wl = (said.match(/\band\b|\bor\b/g) || []).length;
  if (logic !== wl) return M('L381');
  if (!orderingKept(test, says)) return M('L382');
  if (arithCount(test) > (said.match(/\b(?:plus|minus|times|divided|multiplied|remainder|shifted|bits?|mod|modulo)\b|[-+*/%&|^~]|<<|>>/g) || []).length + (/\bhow many\b/.test(said) ? 1 : 0)) return M('L383');
  // A question that is one call (`if not self.can_borrow(…)`, "If cannot borrow") names the call; what it is given is
  // one level down, as for "Calls X".
  const one = test.kind === 'not' ? test.value : test;
  if (one?.kind === 'call') {
    const name = one.callee?.kind === 'member' ? one.callee.property : one.callee?.name;
    const w = ` ${splitWords(said).join(' ')} `;
    if (name && w.replace(/ (?:not|cannot|can t) /g, ' ').includes(` ${splitWords(name).join(' ').replace(/^(?:is|can|has|should|does) /, '')} `)) return null;
  }
  if (!namesKept(test, says)) return M('L384');
  return null;
}

function conditionKept(step, tree, says, code, lang) {
  if (isCodeWords(says.replace(/^If (?:not: )?/, '').replace(/ \(\d+ steps? inside\)$/, ''))) return null;
  const words = says.replace(/^If (?:not: )?/, '').replace(/ \(\d+ steps? inside\)$/, '');
  const not = /^If not: /.test(says);
  if (tree && tree.kind === 'if') {
    if (tree.init) {
      const fails = /^If (.+?) fails$/.exec(says);
      const v = tree.init.kind === 'assign' ? coreOf(tree.init.value) : null;
      const t = tree.test;
      const errTest = t?.kind === 'compare' && t.op === '!=' && t.left?.kind === 'name' && /^err\w*$/i.test(t.left.name) && isNullish(t.right);
      const target = tree.init.target;
      const assignsErr = target && [...nodesOf(target)].some((n) => n.kind === 'name' && n.name === t?.left?.name);
      if (fails && errTest && assignsErr && v?.kind === 'call' && chainCallees(v).some((c) => sameWords(c, fails[1]))) return null;
      return WHY.form;
    }
    // An `unless` / `if not` written by the reader as "If not:" carries the negation in the form.
    const test = tree.negate && not ? tree.test : tree.negate ? { kind: 'not', value: tree.test } : tree.test;
    if (not && !tree.negate) return conditionCore({ kind: 'not', value: test }, `not ${words}`, code, lang);
    return conditionCore(test, words, code, lang);
  }
  if (tree) return WHY.form;
  // PowerShell and R gate their own conditions (their operators are words: -not, -eq, !is.null); shell is checked here.
  if (lang === 'powershell' || lang === 'r' || lang === 'sql') return null;
  if (lang === 'shell') return shellConditionKept(code, says);
  const cond = String(step.cond ?? code);
  if (!accountsFor(cond, `${not ? 'not ' : ''}${claimText(words)}`)) return M('L402');
  return null;
}

/**
 * A shell condition: every `!`, `!=`, `-ne`, and `grep -v` in the code is a "not" / "fails" in the words, and every
 * `&&` / `||` an "and" / "or". (A command's failure is a negation: "If running x fails" is `! x`.)
 */
function shellConditionKept(code, says) {
  const keyword = /^\s*(?:if|elif|while|until)\s/.test(String(code));
  let c = stripQuoted(String(code).replace(/^\s*(?:if|elif|while|until)\s+/, '').replace(/;\s*(?:then|do)\s*$/, ''));
  if (/<<<|<<-?\s*['"]?\w/.test(c)) return M('shell-heredoc');
  // `a || body` / `a && body`: the last `||` / `&&` joins the question to its body (`||`: the body runs when it fails).
  let connectorNeg = 0;
  if (!keyword) {
    const br = /^\s*(\[\[?)/.exec(c);
    const endBr = br ? c.indexOf(br[1] === '[[' ? ']]' : ' ]') : -1;
    const after = endBr > 0 ? /^\s*(\|\||&&)/.exec(c.slice(endBr + 2)) : null;
    const at = after ? endBr + 2 + after.index + after[0].indexOf(after[1]) : Math.max(c.lastIndexOf('||'), c.lastIndexOf('&&'));
    if (at < 0) return M('shell-form');
    connectorNeg = c.slice(at, at + 2) === '||' ? 1 : 0;
    c = c.slice(0, at);
  }
  const neg = connectorNeg + (c.match(/(?:^|\s)!(?=\s)|!=|-ne\b/g) || []).length + (c.match(/\bgrep\b(?:\s+-\w+)*\s+-[a-zA-Z]*v/g) || []).length;
  const said = claimText(says).replace(FORM_NEGATIONS, ' ');
  const wneg = splitWords(said.replace(/n't\b/g, ' nt')).filter((w) => NEG_TOKEN.test(w) || w === 'fails' || w === 'failed').length;
  if (/^If that failed$/.test(says)) return /\|\|/.test(c) ? null : M('shell-failed');
  const logic = (c.match(/&&|\|\|/g) || []).length + (/\[\s|\btest\s/.test(c) ? (c.match(/\s-a\s|\s-o\s/g) || []).length : 0);
  const wl = (said.match(/\band\b|\bor\b/g) || []).length;
  // `a && b || c`: "If a fails or b fails" (the body runs when either part fails).
  const terms = c.split('&&');
  if (connectorNeg && !/\|\||(?:^|\s)!(?=\s)/.test(c) && terms.length > 1 && wneg === terms.length && (said.match(/\bor\b/g) || []).length >= terms.length - 1) return null;
  if (neg !== wneg) return M('shell-neg');
  if (wl < logic) return M('shell-logic');
  if (/\bgrep\b/.test(c) && /\bcontains?\b|\bmatch/.test(said) && /\s-[a-zA-Z]*v/.test(c) && !/\bnot\b|n't/.test(said)) return M('shell-grep-v');
  return null;
}

let ctx_full = '';
/** `xs[1:]` / `self.rows[-1]`: the list's path and the slice's words (sliceWords), or null. */
function sliceOf(v) {
  if (v?.kind !== 'index' || currentLang !== 'python') return null;
  const path = (n) => (n?.kind === 'name' ? n.name : n?.kind === 'member' ? (path(n.object) ? `${path(n.object)}.${n.property}` : null) : null);
  const p = path(v.object);
  const num = (x) => (x == null ? undefined : x.kind === 'literal' && x.type === 'number' ? String(x.raw ?? x.value) : x.kind === 'unary' && x.op === '-' && x.value?.kind === 'literal' ? `-${x.value.raw ?? x.value.value}` : NaN);
  const ix = v.index;
  let t = null;
  if (ix?.kind === 'slice' && !ix.step) { const a = num(ix.start), b = num(ix.end); if (!Number.isNaN(a) && !Number.isNaN(b)) t = sliceWords(a, b); }
  else if (ix) { const k = num(ix); if (k === '-1') t = sliceWords(undefined, undefined, '-1'); }
  return p && t ? { path: p, words: t } : null;
}
function sliceSaid(sl, said) {
  const [pre, post] = sl.words.split('{x}').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // (The value is everything after the first " to ": "Sets h to items without the first 1".)
  const at = said.indexOf(' to ');
  const m = at >= 0 && new RegExp(`^${pre}(?:the ([\\w ]+)'s )?([\\w ]+?)${post}$`).exec(said.slice(at + 4));
  return !!m && pathSaid(sl.path, m[1], m[2]);
}
/** A plain path said as "the owner's last" (or just "last" with no owner other than self/this). */
function pathSaid(path, owner, last) {
  const parts = String(path).split('.').filter((x) => !/^(?:self|this)$/.test(x));
  if (!parts.length || !sameWords(parts[parts.length - 1], last)) return false;
  return parts.length > 1 ? !!owner && sameWords(parts[parts.length - 2], owner) : !owner;
}
/** A Python `range(…)` loop's words: the counter, where it starts, and where it stops (the end itself not included). */
function pythonRangeKept(v, argText, says) {
  const args = argText.split(',').map((x) => x.trim());
  const tail = '(?: \\(\\d+ steps? inside\\))?$';
  const P = "(?:the ([\\w ]+)'s )?([\\w ]+)";
  let w;
  if (args.length === 1 && v === '_') return new RegExp(`^Repeats ${args[0]} times${tail}`).test(says) && /^\w+$/.test(args[0]);
  const len = args.length === 1 && /^len\(\s*([A-Za-z_][\w.]*)\s*\)$/.exec(args[0]);
  if (len) return !!(w = new RegExp(`^For each position (.+?) in ${P}${tail}`).exec(says)) && sameWords(w[1], v) && pathSaid(len[1], w[2], w[3]);
  // `range(a, n + 1)`: "Counts i from a to n" (n included).
  if (args.length === 2 && /^[A-Za-z_][\w.]*\s*\+\s*1$/.test(args[1]) && /^(?:\d+|[A-Za-z_][\w.]*)$/.test(args[0])) {
    w = new RegExp(`^Counts (.+?) from (.+?) to ${P}${tail}`).exec(says);
    if (!w || !sameWords(w[1], v) || / up to /.test(says)) return false;
    const from = /^\d+$/.test(args[0]) ? w[2] === args[0] : (() => { const p = new RegExp(`^${P}$`).exec(w[2]); return !!p && pathSaid(args[0], p[1], p[2]); })();
    return from && pathSaid(args[1].replace(/\s*\+\s*1$/, ''), w[3], w[4]);
  }
  const [a, b] = args.length === 1 ? ['0', args[0]] : args;
  if (args.length > 2 || !/^(?:\d+|[A-Za-z_][\w.]*)$/.test(a) || !/^(?:\d+|[A-Za-z_][\w.]*)$/.test(b)) return false;
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return !!(w = new RegExp(`^Counts (.+?) from (\\d+) to (\\d+)${tail}`).exec(says)) && sameWords(w[1], v) && w[2] === a && Number(w[3]) === Number(b) - 1 && Number(b) > Number(a);
  w = new RegExp(`^Counts (.+?) from (.+?) up to (.+?) \\(not (.+?) itself\\)${tail}`).exec(says);
  if (!w || !sameWords(w[1], v) || w[3] !== w[4]) return false;
  const side = (code, said) => { if (/^\d+$/.test(code)) return said === code; const p = new RegExp(`^${P}$`).exec(said); return !!p && pathSaid(code, p[1], p[2]); };
  return side(a, w[2]) && side(b, w[3]);
}
/** "Repeats N times": N is in the code, with a repeat construct (`range(N)`, `N.times`, `repeat(N)`, `1..N`). */
function repeatsKept(says, full) {
  const n = /^Repeats (\w+) times/.exec(says)[1];
  return new RegExp(`\\b${n}\\b`).test(full) && /\b(?:times|range|repeat|for|Repeat|seq|upto)\b|\.\./.test(full);
}
/** `do { … } while (cond)`: the condition is on the block's last line. */
function doWhileKept(says, full, lang) {
  const w = /^Runs once, then repeats (while|until) (.+?)(?: \(\d+ steps? inside\))?$/.exec(says);
  const m = /\b(while|until)\s*\((.*)\)\s*;?\s*$/.exec(String(full).split('\n').pop() ?? '') || /\b(while|until)\s+(.*?)\s*;?\s*$/.exec(String(full).split('\n').pop() ?? '');
  if (!w || !m || w[1] !== m[1]) return WHY.form;
  const test = parseExpr(m[2], lang);
  return conditionCore(test, w[2], m[2], lang);
}

function loopKept(step, tree, says, code, lang) {
  if (/^Runs once, then repeats/.test(says)) return doWhileKept(says, ctx_full, lang);
  if (/^Repeats (\w+) times/.test(says)) return repeatsKept(says, ctx_full) ? null : WHY.form;
  if (/^`/.test(says) || /^Repeats (?:for|while) `/.test(says)) return null;
  let m;
  // Python counting loops, checked against their own code: range(N), range(a, b), range(len(xs)), enumerate(xs).
  if (lang === 'python' && (m = /^for\s+(\w+)\s+in\s+range\((.*)\)\s*:$/.exec(String(code).trim()))) return pythonRangeKept(m[1], m[2], says) ? null : WHY.unparsed;
  if (lang === 'python' && (m = /^for\s+\(?\s*(\w+)\s*,\s*(\w+)\s*\)?\s+in\s+enumerate\(\s*([A-Za-z_][\w.]*)\s*\)\s*:$/.exec(String(code).trim()))) {
    const w = /^For each (.+?) in (?:the ([\w ]+)'s )?([\w ]+), with its position (.+?) \(from 0\)(?: \(\d+ steps? inside\))?$/.exec(says);
    return w && sameWords(w[1], m[2]) && sameWords(w[4], m[1]) && pathSaid(m[3], w[2], w[3]) ? null : WHY.unparsed;
  }
  // Rust ranges: `for i in 0..n` "Counts i from 0 up to n (not n itself)", `a..=b` "from a to b".
  if (lang === 'rust' && (m = /^for\s+(\w+)\s+in\s+(\d+|[A-Za-z_][\w.]*)\s*\.\.(=?)\s*(\d+|[A-Za-z_][\w.]*)\s*\{?$/.exec(String(code).trim()))) {
    const [, v, a, inc, b] = m;
    const P = "(?:the ([\\w ]+)'s )?([\\w ]+)";
    const side = (c, said) => { if (/^\d+$/.test(c)) return said === c; const p = new RegExp(`^${P}$`).exec(said); return !!p && pathSaid(c, p[1], p[2]); };
    const tail = '(?: \\(\\d+ steps? inside\\))?$';
    if (/^\d+$/.test(a) && /^\d+$/.test(b) && !inc) { const w = new RegExp(`^Counts (.+?) from (\\d+) to (\\d+)${tail}`).exec(says); return w && sameWords(w[1], v) && w[2] === a && Number(w[3]) === Number(b) - 1 ? null : WHY.unparsed; }
    const w = inc ? new RegExp(`^Counts (.+?) from (.+?) to (.+?)${tail}`).exec(says) : new RegExp(`^Counts (.+?) from (.+?) up to (.+?) \\(not (.+?) itself\\)${tail}`).exec(says);
    return w && sameWords(w[1], v) && (inc ? !/ up to /.test(says) : w[3] === w[4]) && side(a, w[2]) && side(b, w[3]) ? null : WHY.unparsed;
  }
  if (tree && tree.kind === 'loop') {
    if (tree.form === 'each') {
      const m = /^For each (.+?) in (.+?)(?:, only those where .*)?(?: \(\d+ steps? inside\))?$/.exec(says);
      if (/^(?:For each item in|Repeats once for each item in)/.test(says)) return iterableKept(tree.iterable, says.replace(/^.*? in /, '').replace(/ \(\d+ steps? inside\)$/, '')) ? null : M('L411');
      if (!m) return WHY.form;
      for (const t of tree.targets) if (!namesKept(t, m[1])) return M('L413');
      return iterableKept(tree.iterable, m[2]) ? null : M('L416');
    }
    if (tree.form === 'while' || tree.form === 'until') {
      if (/^Repeats until (?:something|a step) inside/.test(says)) return tree.test?.kind === 'literal' && (tree.test.value === true || tree.test.value === 1) ? null : WHY.form;
      const m = /^(?:Repeats while|Runs once, then repeats while|Repeats until) (.+?)(?: \(\d+ steps? inside\))?$/.exec(says);
      if (!m) return WHY.form;
      const neg = /^Repeats until/.test(says) !== (tree.form === 'until');
      return conditionCore(neg ? { kind: 'not', value: tree.test } : tree.test, m[1], code, lang);
    }
    if (tree.form === 'for') {
      const m = /^Counts (\w[\w ]*?) from (.+?) while (.+?)(?:, (?:adding|in steps of|going) (.+?))?(?: \(\d+ steps? inside\))?$/.exec(says);
      if (!m) return /^Repeats until (?:something|a step) inside/.test(says) && !tree.test ? null : WHY.form;
      const init = tree.init, upd = tree.update;
      const v = init?.kind === 'assign' ? init.target : null;
      if (!v || v.kind !== 'name' || !sameWords(v.name, m[1])) return M('L429');
      if (!upd || !(upd.kind === 'unary' && /^(?:\+\+|--)$/.test(upd.op) && upd.value.kind === 'name' && upd.value.name === v.name)) {
        if (!m[4]) return M('L431');
      } else if (upd.op === '--' && !/\bdown\b|\bsubtract/.test(says)) return M('L432');
      if (!namesKept(init.value, m[2]) && !/^-?\d+$/.test(m[2].trim())) return M('L433');
      return conditionCore(tree.test, m[3], code, lang);
    }
    if (tree.form === 'forever') return /^Repeats until/.test(says) ? null : WHY.form;
    if (/^Repeats (\w+) times/.test(says)) return repeatsKept(says, ctx_full) ? null : WHY.form;
    return WHY.form;
  }
  if (tree) return /^(?:For each|Repeats once for each) /.test(says) && tree.kind === 'call' ? callLoopKept(tree, says) : WHY.form;
  // Script languages: the loop's own words against its code.
  if (/^Repeats while |^Repeats until /.test(says)) return accountsFor(code.replace(/^\s*(?:while|until)\b/, ''), says.replace(/^Repeats (?:while|until) /, '').replace(/ \(\d+ steps? inside\)$/, '')) ? null : M('L441');
  // `while read a b c` reads several values per pass: shown as code.
  if (/\bwhile\b[^;]*\bread\b(?:\s+-\w+)*\s+\w+\s+\w+/.test(code) || /;\s*read\b/.test(code)) return WHY.form;
  return null;
}

/** A loop's collection in words: every name in it, or the last name of its path (`order.items` as "items"), or its call. */
function iterableKept(it, words) {
  if (!it) return false;
  // "the result of X": X is the call that gives the collection (the outermost one), not a call inside it.
  const ro = /^the result of ([\w ]+)$/.exec(words);
  if (ro) { const c = coreOf(it); const n = c?.kind === 'call' ? (c.callee.kind === 'member' ? c.callee.property : c.callee.name) : null; return !!n && sameWords(n, ro[1]); }
  if (namesKept(it, words)) return true;
  const w = ` ${splitWords(words).join(' ')} `;
  let c = coreOf(it);
  if (c?.kind === 'member' && w.includes(` ${splitWords(c.property).join(' ')} `) && splitWords(words).length <= splitWords(c.property).length + 1) return true;
  return chainCallees(it).some((x) => sameWords(x, words) || w.includes(` ${splitWords(x).join(' ')} `));
}

/** `items.each do |x|`, `list.forEach(x => …)` read as a loop. */
function callLoopKept(tree, says) {
  const callees = chainCallees(tree);
  if (!callees.some((c) => /^(?:each|forEach|for_each|each_with_index|each_pair|each_key|each_value|times|map|ForEach|foreach|forEachIndexed|iter|for_each_entry|apply|lapply|sapply|walk|upto|downto|step|each_line|each_char|loop)$/i.test(c))) return WHY.form;
  return null;
}

/** A value said in full ("Returns a plus b") keeps every name and operator; "the result of X" names X's call. */
function valueKept(v, says, code, lang) {
  if (!v) return /^(?:Returns|Gives back)(?: nothing| an? (?:empty|new|computed)| this\b| itself| the same)/.test(says) || !/^(?:Returns|Gives back)/.test(says) ? null : null;
  const said = claimText(says);
  const tn = treeNegations(v, / the result of /.test(says)), wn = saidNegations(says);
  if (wn > tn) return M('L459');
  if (wn < tn && !/the result of|the items|a new|computed/.test(said)) return M('L460');
  const m = /^(?:Returns|Gives back) the result of ([\w ]+?)(?:,|$| with| on| from)/.exec(says);
  if (m) {
    const callees = chainCallees(v);
    if (!callees.some((c) => sameWords(c, m[1]))) return M('L464');
    return null;
  }
  const cond = coreOf(v);
  const iff = /^(?:Returns|Gives back) (.+) if (.+), otherwise (.+)$/.exec(says);
  if (cond?.kind === 'conditional' && iff) {
    const side = (node, phrase) => (/^a new /.test(phrase) ? newThing(node, ` ${phrase}`) : /^the result of /.test(phrase) ? chainCallees(node).some((c) => sameWords(c, phrase.replace(/^the result of /, ''))) : namesKept(node, phrase));
    if (!side(cond.then, iff[1]) || !side(cond.else, iff[3])) return M('cond-side');
    return conditionCore(cond.test, iff[2], code, lang);
  }
  if (/^(?:Returns|Gives back) a new /.test(says)) return newThing(v, says) || coreOf(v)?.kind === 'call' || coreOf(v)?.kind === 'object' || coreOf(v)?.kind === 'array' ? null : M('L467');
  if (castCount(v) && !/\bas\b|\bconverted\b|\bturned\b/.test(said)) return M('L468');
  if (!orderingKept(v, says)) return M('L469');
  // A plain value (a name, a member, a literal, an operator over them): every name in it is in the words.
  const core = coreOf(v);
  if (core && /^(?:name|member|literal|binary|compare|logic|not|unary|index)$/.test(core.kind) && !namesKept(core, says)) return M('L472');
  // A returned call (`return warning("…" + x)`) is named by the words; its arguments are not what is given back.
  if (core?.kind === 'call' && !/^(?:Returns|Gives back) (?:the result of|a new|whether|one for each|the items|the first|a copy|what)\b/.test(says)) {
    const name = core.callee?.kind === 'member' ? core.callee.property : core.callee?.name;
    // (Responses, wrappers, and conversions name what they give back: `res.json(user)`, `Ok(n)`, `w.ToString()`.)
    const wrapper = chainCallees(core).some((c) => /^(?:ConfigureAwait|unwrap|expect|await|get|Result)$/.test(c) && chainCallees(core).some((d) => ` ${splitWords(says).join(' ')} `.includes(` ${splitWords(d).join(' ')} `))) || /^(?:json|send|end|render|redirect|status|sendStatus|JSON|String|Ok|Some|Err|None|Success|Failure|Result|ToString|toString|to_s|to_str|str|repr|String|next|resolve|reject|of|from|wrap|just|pure|Task|FromResult|Promise)$/.test(String(name)) || /\bas text\b/.test(says);
    if (name && !wrapper && !` ${splitWords(says).join(' ')} `.includes(` ${splitWords(name).join(' ')} `) && !LIBRARY_STEP) return M('return-call');
  }
  if (core && core.kind === 'binary' && ARITH.has(core.op) && arithCount(core) > (said.match(/\b(?:plus|minus|times|divided|multiplied|remainder|shifted|joined|followed|added|bits?|mod)\b|[-+*/%&|^~]|<<|>>/g) || []).length + (/\bbuilt from its parts\b|\btext\b/.test(said) ? 9 : 0)) return M('L473');
  return null;
}

/**
 * A statement whose tree was not parsed: only fixed safe forms, checked against its text. Returns null (keep) or why.
 */
const SAFE_PATH = String.raw`[A-Za-z_][\w]*(?:\s*(?:\.|->|::)\s*[A-Za-z_][\w]*)*`;
const SAFE_CALL = new RegExp(String.raw`^\s*(?:await\s+)?(?:\(void\)\s*)?(${SAFE_PATH})\s*\(`);
const SAFE_ASSIGN = new RegExp(String.raw`^\s*(?:(?:const|static|unsigned|signed|struct|enum|volatile|register|auto|let|var|val|final|mut)\s+)*(?:[A-Za-z_][\w:<>,\s]*?[\s*&]+)?\**\s*(${SAFE_PATH})\s*=(?!=)\s*(?:\([A-Za-z_][\w\s*]*\)\s*)?(?:await\s+)?(${SAFE_PATH})\s*\(`);
function balancedTail(code, open) {
  // The call's brackets close at the end of the statement (`f(a)(b)` or `f(a) + 1` are not one plain call).
  let d = 0;
  for (let i = open; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"' || ch === "'") { const q = ch; for (i++; i < code.length && code[i] !== q; i++) if (code[i] === '\\') i++; continue; }
    if (ch === '(') d++;
    else if (ch === ')') { d--; if (d === 0) return /^\s*;?\s*(?:\/\/.*|\/\*.*\*\/\s*)?$/.test(code.slice(i + 1)); }
  }
  return false;
}
// Languages where `name { … }` passes a closure to a call (elsewhere `Name { … }` builds a value: a Rust struct, a Go literal).
const TRAILING_CLOSURE = new Set(['swift', 'kotlin', 'ruby', 'scala', 'groovy']);

function safeForm(step, says, code, lang = '') {
  const trailing = TRAILING_CLOSURE.has(lang);
  if (!trailing && /\{\s*$/.test(String(code).trim()) && /^(?:Calls|Returns the result of) /.test(says) && !/\)\s*\{\s*$/.test(String(code).trim())) return WHY.unparsed;
  let c = String(code).replace(/\s*\{\s*$/, '').trim().replace(/^(?:try[?!]?\s+)?(?:await\s+)?(?=[A-Za-z_])/, '');
  c = c.replace(/(?<![=!<>])=(?!=)\s*(?:try[?!]?\s+)?(?:await\s+)?/, '= ');
  // An implicit return (`try await send(…)` as a one-expression body) is read like `return send(…)`.
  if (step.kind === 'return' && !/^return\b/.test(c)) c = `return ${c.replace(/^(?:try[?!]?\s+)?(?:await\s+)?/, '')}`;
  c = c.replace(/^return\s+(?:try[?!]?\s+)?(?:await\s+)?/, 'return ');
  // A trailing closure (`write { … }`, `items.map { … }`) is a call.
  if (trailing && /^(?:return\s+)?[A-Za-z_][\w.]*\s*\{/.test(c) && /^(?:Calls|Returns the result of) /.test(says)) c = c.replace(/^((?:return\s+)?[A-Za-z_][\w.]*)\s*\{.*$/, '$1()');
  if (/^(?:return\s+)?[A-Za-z_][\w.]*\s*\(.*\)\s*\{.*$/.test(c) && /^(?:Calls|Returns the result of) /.test(says) && step.children?.length) c = c.replace(/\)\s*\{.*$/, ')');
  const lastName = (p) => p.split(/\s*(?:\.|->|::|\?\.)\s*/).pop();
  let m;
  if (/^defer\b/.test(c) && /^At the end/.test(says)) return null;
  // `return Type(…)` / `Type.init(…)` / `new Type(…)`: "Returns a new Type".
  if (step.kind === 'return' && (m = /^return\s+(?:new\s+)?([A-Z][\w]*)(?:\.init)?\s*[({]/.exec(c))) return new RegExp(`^Returns a new ${m[1]}$`, 'i').test(says) || sameWords(says.replace(/^Returns a new /, ''), m[1]) ? null : WHY.unparsed;
  // A call whose steps are inside it (a trailing closure): its last call is named.
  if (trailing && step.children?.length && /^(?:Calls (.+) with these steps|Returns the result of (.+))$/.test(says)) {
    const header = String(code).replace(/\{\s*(?:\[[^\]]*\]\s*)?(?:\(?[\w\s,$]*\)?\s+in)?\s*$/, '').trim();
    const last = /([A-Za-z_]\w*)\s*(?:\((?:[^()]|\([^()]*\))*\))?\s*$/.exec(header)?.[1];
    const named = says.replace(/^Calls (.+) with these steps$/, '$1').replace(/^Returns the result of /, '');
    if (last && !KEYWORD_CALLEE.test(last) && sameWords(last, named)) return null;
  }
  // `static MSG: &str = "never fail"` / `let x = 5`: "Sets msg to "never fail"".
  if ((m = /^(?:(?:let|const|static|var|val|final|readonly)\s+)?(?:mut\s+)?([A-Za-z_]\w*)\s*(?::[^=]+)?=\s*("(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?|true|false)\s*;?$/.exec(c)) && says === `Sets ${splitWords(m[1]).join(' ')} to ${m[2]}`) return null;
  if ((m = /^(?:(?:let|const|static|var|val)\s+)?(?:mut\s+)?([A-Za-z_]\w*)\s*(?::[^=]+)?=\s*(?:r#*)?"(?:\\.|[^"\\])*\\?$/.exec(c)) && says === `Sets ${splitWords(m[1]).join(' ')} to a text written over several lines`) return null;
  // A Python import inside a function: the words name every name it loads and the module, as written.
  if (lang === 'python' && /^(?:from|import)\s/.test(c)) return pythonImportSays(c) === says ? null : WHY.unparsed;
  // `const { a, b } = await import('./x')`: "Loads a, b from ./x".
  if ((m = /^(?:const|let|var)\s*\{([^}]*)\}\s*=\s*(?:await\s+)?(?:import|require)\(\s*['"`]([^'"`]+)['"`]\s*\)/.exec(c))) {
    const w = /^Loads (.+) from (\S+)$/.exec(says);
    return w && w[2] === m[2] && m[1].split(',').every((x) => x.trim() && ` ${splitWords(w[1]).join(' ')} `.includes(` ${splitWords(x.split(':').pop()).join(' ')} `)) ? null : WHY.unparsed;
  }
  if (step.kind === 'loop' && (m = /^for\s+_\s+in\s+([\w.]+)$/.exec(c))) return new RegExp(`^Repeats once for each item in (?:the [\\w ]+'s )?${splitWords(m[1].split('.').pop()).join(' ')}(?: \\(\\d+ steps? inside\\))?$`).test(says) ? null : WHY.unparsed;
  if ((m = /^([\w.]+)\s*=\s*\.(\w+)$/.exec(c))) { const w = /^Sets (?:the [\w ]+'s )?(.+?) to (.+)$/.exec(says); return w && sameWords(w[1], m[1].split('.').pop()) && sameWords(w[2], m[2]) ? null : WHY.unparsed; }
  if (step.kind === 'return' && /^Returns the result of /.test(says) && /^return\s+[\w.]+(?:\s*\((?:[^()]|\([^()]*\))*\)\s*\.?\s*[\w.]*)*$/.test(c)) {
    const last = /([A-Za-z_]\w*)\s*(?:\((?:[^()]|\([^()]*\))*\))?\s*$/.exec(c)?.[1];
    if (last && !KEYWORD_CALLEE.test(last) && sameWords(last, says.replace(/^Returns the result of /, ''))) return null;
  }
  // A label (`done:`): "The "done" part starts here".
  if ((m = /^([A-Za-z_]\w*)\s*:$/.exec(c)) && says === `The "${m[1]}" part starts here`) return null;
  // Swift `for i in 0..<3` / `0...2`: "Counts i from 0 to 2".
  if (step.kind === 'loop' && (m = /^for\s+(\w+)\s+in\s+(-?\d+)\s*(\.\.<|\.\.\.)\s*(-?\d+)$/.exec(c))) {
    const hi = m[3] === '..<' ? Number(m[4]) - 1 : Number(m[4]);
    return new RegExp(`^Counts ${splitWords(m[1]).join(' ')} from ${m[2]} to ${hi}(?: \\(\\d+ steps? inside\\))?$`).test(says) ? null : WHY.unparsed;
  }

  if (step.kind === 'return' && /^return\s*;?$/.test(c)) return /^Stops here$/.test(says) ? null : WHY.unparsed;
  if ((m = /^Handles (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ALL) (\S+) with these steps$/.exec(says)) && new RegExp(`\\.(?:${m[1].toLowerCase()}|${m[1]}|route|all|use)\\s*\\(`).test(c)) {
    // Every part of the path is written in the code (`app.get("orders", ":id")` is /orders/:id).
    const parts = m[2].split('/').filter(Boolean);
    return parts.every((x) => c.includes(x)) ? null : WHY.unparsed;
  }
  // Swift `guard cond else`: "If not: cond".
  if (step.kind === 'branch' && (m = /^guard\s+(?!let\b|var\b|case\b)(.+?)\s+else(?:\s*\{.*)?$/.exec(c))) {
    const w = /^If not: (.+?)(?: \(\d+ steps? inside\))?$/.exec(says);
    const test = w && parseExpr(m[1], 'swift');
    return test ? conditionCore(test, w[1], m[1], 'swift') : WHY.unparsed;
  }
  if (/^Calls .+ with these steps$/.test(says) && step.children?.length && (m = /^\s*(?:await\s+)?([A-Za-z_][\w]*(?:\s*(?:\.|->|::|\?\.)\s*[A-Za-z_][\w]*)*)\s*[({]/.exec(c))) {
    const named = /^Calls (.+?) with these steps$/.exec(says)[1];
    if (!KEYWORD_CALLEE.test(lastName(m[1])) && sameWords(lastName(m[1].replace(/\?\./g, '.')), named)) return null;
  }
  if (/^Calls /.test(says) && (m = SAFE_CALL.exec(c)) && balancedTail(c, c.indexOf('(', m.index + m[0].length - 1))) {
    const named = /^Calls (.+?)(?: \(only in builds where.*\))?$/.exec(says)?.[1] ?? '';
    return !KEYWORD_CALLEE.test(lastName(m[1])) && sameWords(lastName(m[1]), named) ? null : WHY.unparsed;
  }
  if (/^Works out /.test(says) && (m = SAFE_ASSIGN.exec(c)) && balancedTail(c, c.indexOf('(', m.index + m[0].length - 1))) {
    const w = /^Works out (.+?)(?: from (.+?))?(?: \(only in builds where.*\))?$/.exec(says);
    const target = lastName(m[1]);
    if (!w || KEYWORD_CALLEE.test(lastName(m[2]))) return WHY.unparsed;
    const tw = w[1].replace(/^the (?:[\w ]+?'s )?/, '');
    if (!sameWords(target, tw) && !sameWords(m[1].replace(/->/g, '.'), w[1])) return WHY.unparsed;
    if (w[2] && !callNamed(lastName(m[2]), w[2], c)) return WHY.unparsed;
    return null;
  }
  if (step.kind === 'return' && (m = /^return\s+(?:\([A-Za-z_][\w\s*]*\)\s*)?(?:await\s+)?([A-Za-z_][\w]*(?:\s*(?:\.|->|::)\s*[A-Za-z_][\w]*)*)\s*(\()?/.exec(c))) {
    const name = lastName(m[1]);
    if (m[2] && balancedTail(c, c.indexOf('(', m.index + m[0].length - 1))) return new RegExp(`^Returns the result of ${splitWords(name).join(' ')}(?: \\(only in builds where.*\\))?$`).test(says) && !KEYWORD_CALLEE.test(name) ? null : WHY.unparsed;
    if (!m[2] && /^return\s+[A-Za-z_][\w]*\s*;?$/.test(c)) return new RegExp(`^Returns ${splitWords(name).join(' ')}(?: \\(only in builds where.*\\))?$`).test(says) ? null : WHY.unparsed;
  }
  if (step.kind === 'return' && (m = /^return\s+(-?\d+|true|false|null|NULL|nil|nullptr)\s*;?$/.exec(c))) return says === `Returns ${m[1]}` || new RegExp(`^Returns ${m[1]}\\b`).test(says) ? null : WHY.unparsed;
  if (step.kind === 'fail' && /^(?:throw|raise)\b/.test(c)) return null;
  // Swift `if let x = y` / `guard let x = y else`: "If (not:) x is set".
  if (step.kind === 'branch' && (m = /^(guard)\s+(?:let|var)\s+(\w+)(?:\s*=\s*(.+?))?\s+(else\b.*)$/.exec(c) || /^(if)\s+(?:let|var)\s+(\w+)(?:\s*=\s*([^,{]+?))?\s*()$/.exec(c))) {
    const w = /^If (not: )?(.+?) is set(?: \(\d+ steps? inside\))?$/.exec(says);
    if (!w || !!w[1] !== (m[1] === 'guard')) return WHY.unparsed;
    return sameWords(w[2], m[2]) || (m[3] && /^[\w.]+$/.test(m[3]) && sameWords(w[2], m[3].split('.').pop())) ? null : WHY.unparsed;
  }
  if (/^(?:goto)\s+\w+\s*;?$/.test(c) && /^Jumps to the "\w+" part$/.test(says)) return null;
  if (/^(?:break|continue)\s*;?$/.test(c)) return null;
  return WHY.unparsed;
}

/** An implicit return (no `return` written): only the last thing a function does, in a language where it returns. */
function implicitReturnOk(step, ctx, code) {
  if (!IMPLICIT_RETURN_LANGS.has(ctx.lang)) return false;
  // Expression bodies (`=> x`, `fun f() = x`, Swift single expression): the function's only step.
  if (ctx.only) return !/\b(?:unless|if|while|until)\b/.test(code) || ctx.lang === 'kotlin' || ctx.lang === 'rust' || ctx.lang === 'scala';
  if (!ctx.last) return false;
  if (ctx.exprValue) return true;
  // Swift: an if / switch that is the whole body gives back each side's value (an if-expression); a bare value among
  // other statements is a result-builder part, not a return.
  if (ctx.lang === 'swift') return !!ctx.singleTop;
  if (!/^(?:ruby|rust|scala|r|elixir|powershell)$/.test(ctx.lang) && !(ctx.lang === 'kotlin' && ctx.inLambda)) return false;
  // Ruby/Rust: a modifier form (`x unless y`) or a statement ending in `;` (Rust) is not the value of the function.
  if (ctx.lang === 'ruby' && /\s(?:unless|if|while|until|rescue)\s/.test(code)) return false;
  if (ctx.lang === 'rust' && /;\s*$/.test(code)) return false;
  return true;
}

// ── Structure ───────────────────────────────────────────────────────────────────────────────────────────────

/** A step's own code, whole: its lines in the source (a block's header only); the display copy can be cut short. */
function sourceOf(step, ctx) {
  const short = String(step.code ?? '');
  const sp = step.span;
  if (!sp || !ctx.lines || step.kind === 'check') return short;
  if (isBlock(step) || step.nested || step.children?.length) {
    // The header (it can run over a few lines, up to the line that opens the block) and the block's last line.
    let head = short;
    if (sp.startLine >= 1 && !/[{:]\s*$|\b(?:then|do)\s*$/.test(String(ctx.lines[sp.startLine - 1] ?? ''))) {
      const hl = [];
      for (let l = sp.startLine; l <= Math.min(sp.endLine, sp.startLine + 5); l++) { const t = ctx.lines[l - 1] ?? ''; hl.push(t); if (/[{:]\s*$|\b(?:then|do)\s*$/.test(t)) break; }
      head = hl.join('\n');
    }
    const last = ctx.lines[(sp.endLine ?? 0) - 1];
    return last != null && sp.endLine > sp.startLine ? `${head}\n${last}` : head;
  }
  const a = sp.startLine, b = sp.endLine;
  if (!(a >= 1 && b >= a && b - a < 8)) return short;
  const text = ctx.lines.slice(a - 1, b).join('\n');
  const head = short.replace(/…$/, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return text.replace(/\s+/g, ' ').includes(head) ? text : short;
}

const lineOf = (s) => s?.line ?? s?.span?.startLine ?? null;
const endOf = (s) => s?.span?.endLine ?? s?.line ?? null;
const isEnding = (s) => s.kind === 'return' || s.kind === 'fail' || s.jump === 'break' || s.jump === 'continue';
const isBlock = (s) => s.kind === 'branch' || s.kind === 'loop' || s.kind === 'try';

/** Steps (and their own steps) in reading order. */
function* everyStep(list) {
  for (const s of list || []) {
    yield s;
    yield* everyStep(s.children); yield* everyStep(s.otherwise);
    for (const h of s.handlers || []) yield* everyStep(h.steps);
    if (s.always) yield* everyStep(s.always.steps);
  }
}

/**
 * Is a block's structure certain? Its own steps lie inside its lines, in order; nothing follows an ending in the
 * same list; a question has something inside it.
 */
function structureProblem(s, lang, srcLines) {
  const a = lineOf(s), b = endOf(s);
  const inner = [...(s.children || []), ...(s.otherwise || [])];
  if (s.kind === 'branch' && !inner.length && !s.unread && !/^(?:Chooses by|Checks these cases)/.test(String(s.says))) return true;
  // A case with nothing in it, where cases cannot fall through (Swift, Kotlin, Rust, Go, Scala): its body was lost.
  if (s.kind === 'branch' && /^(?:swift|kotlin|rust|go|scala)$/.test(lang) && s.children?.length && s.children.every((c) => c.kind === 'check' && c.caseLabel) && s.children.some((c) => !c.children?.length && !/fall/i.test(String(c.says)) && !/(?:=>|->)\s*(?:\{\s*\}|\(\s*\)|Unit)\s*,?\s*$|\bbreak\b/.test(String(c.code ?? '')))) return true;
  // A switch whose case labels were read as steps inside another case: its cases were folded together.
  if (s.kind === 'branch' && s.children?.length && s.children.every((c) => c.kind === 'check' && c.caseLabel)) {
    for (const arm of s.children) for (const k of everyStep(arm.children)) if (!k.nested && /^\s*(?:case\b|default\s*:|when\b)/.test(String(k.code ?? ''))) return true;
  }
  // (A span of the header line alone, as an else-if has, says nothing about where its body ends.)
  if (a != null && b != null && b > a) {
    for (const k of everyStep(s.children)) { const l = lineOf(k); if (l != null && (l < a || l > b + 0)) return true; }
  }
  // Brace languages: a header that opens a block on its own line ends where its brace closes.
  if (srcLines && a != null && b != null && /\{\s*(?:\/\/.*|\/\*.*\*\/)?$/.test(String(srcLines[a - 1] ?? '')) && isBlock(s) && !['python', 'ruby', 'shell', 'powershell', 'r', 'sql'].includes(lang)) {
    const close = braceClose(srcLines, a);
    if (close != null) for (const k of everyStep(s.children)) { const l = lineOf(k); if (l != null && l > close) return true; }
  }
  return false;
}

/** The line where the block opened by the last `{` on line `at` closes (quote- and comment-aware), or null. */
function braceClose(lines, at) {
  // Depth after the header line is the block's own depth (a `{…}` closed on the header line, such as a composite
  // literal, does not count); the block closes where the depth drops below it.
  let depth = 0, base = null;
  for (let l = at - 1; l < lines.length && l < at + 2000; l++) {
    const t = lines[l] ?? '';
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (ch === '/' && t[i + 1] === '/') break;
      if (ch === '"' || ch === "'" || ch === '`') { const q = ch; for (i++; i < t.length && t[i] !== q; i++) if (t[i] === '\\') i++; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (base != null && depth < base) return l + 1; }
    }
    if (base == null) { if (depth <= 0) return null; base = depth; }
  }
  return null;
}

// ── Showing a step as code ──────────────────────────────────────────────────────────────────────────────────

/** Turn a step into "code, not explained", keeping its kind's place in the flow (a question stays a question). */
const keepOriginal = (s) => { if (!('origSays' in s)) Object.defineProperty(s, 'origSays', { value: s.says, enumerable: false }); };
const PAREN_IF = new Set(['c', 'cpp', 'java', 'csharp', 'javascript', 'typescript', 'php', 'kotlin', 'scala', 'dart', 'r', 'powershell']);
let currentLines = null;
const squash = (t) => String(t).replace(/\s+/g, '');
/**
 * The code a step shows must be the code: a reader's own copy can be normalized (`set(x as S, true)` kept as `set(x)`,
 * `gsub!` as `gsub`, a here-string's `<<<` dropped). When the copy is not in the source line, the source line is shown.
 */
function exactCode(s) {
  const sp = s.span;
  if (!currentLines || !sp?.startLine) return;
  const end = Math.min(sp.endLine ?? sp.startLine, sp.startLine + 7);
  const text = currentLines.slice(sp.startLine - 1, end).join(' ');
  const short = String(s.code ?? '').replace(/…$/, '');
  const block = isBlock(s) || s.children?.length;
  // A block's header over several lines (`if a\n && b {`): the whole header, never its first line alone.
  if (block && short.trim()) {
    let head = '';
    for (let l = sp.startLine; l <= Math.min(end, sp.startLine + 5); l++) { const t = String(currentLines[l - 1] ?? ''); head += ` ${t}`; if (/[{:]\s*$|\b(?:then|do)\s*$/.test(t)) break; }
    if (squash(head).includes(squash(short)) && squash(head).length > squash(short).length + 2 && !/[{:]\s*$|\b(?:then|do)\s*$/.test(String(currentLines[sp.startLine - 1] ?? ''))) { s.code = head.replace(/\s+/g, ' ').trim(); return; }
  }
  if (!short.trim() || squash(text).includes(squash(short))) return;
  // (A block's header: its lines up to the one that opens the block.)
  let head = '';
  if (block) for (let l = sp.startLine; l <= Math.min(end, sp.startLine + 5); l++) { const t = String(currentLines[l - 1] ?? ''); head += ` ${t}`; if (/[{:]\s*$|\b(?:then|do)\s*$/.test(t)) break; }
  s.code = (block ? head : text).replace(/\s+/g, ' ').trim();
}
function asCode(s, why) {
  keepOriginal(s);
  exactCode(s);
  s.explained = false;
  s.notExplainedWhy = why;
  const code = String(s.code ?? s.says ?? '').replace(/\s+/g, ' ').trim();
  if (s.kind === 'branch' && !(s.children?.length && s.children.every((c) => c.kind === 'check' && c.caseLabel))) {
    const head = code.replace(/\s*\{\s*$/, '').replace(/\s*(?:then|do|:)\s*$/, '');
    const m = /^(?:\}\s*)?(?:else\s*)?(if|elif|elsif|else if|while|unless|guard)\s*(.*)$/.exec(head);
    if (m && m[2]) {
      let cond = m[2].trim();
      // Languages whose `if` needs brackets: the condition is the bracketed group (what follows it is a one-line body).
      // Elsewhere (Swift, Go, Rust, Python, Ruby) `(a) || (b)` is all condition.
      if (PAREN_IF.has(currentLang) && /^\(/.test(cond) && closeIdx(cond, 0) > 0) cond = cond.slice(1, closeIdx(cond, 0)).trim();
      // A guard's steps (its else) run when its condition does not hold; so do an unless's.
      const neg = m[1] === 'unless' || m[1] === 'guard';
      if (m[1] === 'guard') cond = cond.replace(/\s+else\b[^]*$/, '');
      s.says = `If ${neg ? 'not: ' : ''}${asCodeWords(cond)}`;
    } else {
      // Not a plain if: the whole region is code.
      s.kind = 'other'; s.says = asCodeWords(code);
    }
    return;
  }
  if (s.kind === 'branch') { s.says = asCodeWords(code); s.codeWords = true; return; }
  if (s.kind === 'check') { s.says = asCodeWords(code.replace(/\s*\{\s*$/, '')); s.codeWords = true; return; }
  if (s.kind === 'loop') { s.says = `Repeats: ${asCodeWords(code.replace(/\s*\{\s*$/, ''))}`; s.codeWords = true; return; }
  if (s.kind === 'return' && why !== WHY.ending) { s.restates = true; s.says = asCodeWords(code); return; }
  if (s.kind === 'fail' && why !== WHY.ending) { s.says = `Fails with ${asCodeWords(code)}`; s.codeWords = true; return; }
  if (s.kind === 'try') { s.says = asCodeWords(code); s.codeWords = true; return; }
  s.kind = 'other';
  s.says = asCodeWords(code);
}
function closeIdx(s, open) {
  let d = 0;
  for (let i = open; i < s.length; i++) { if (s[i] === '(') d++; else if (s[i] === ')' && --d === 0) return i; }
  return -1;
}

/** A whole region (a block whose structure is uncertain) shown as one piece of code. */
function regionAsCode(s, why) {
  keepOriginal(s);
  const head = String(s.code ?? s.says ?? '').replace(/\s+/g, ' ').trim();
  for (const k of ['children', 'otherwise', 'handlers', 'always']) delete s[k];
  s.kind = 'other';
  s.says = asCodeWords(head);
  s.explained = false;
  s.notExplainedWhy = why;
  delete s.jump;
  if (DEBUG) console.error(`[say-less] ${why} | ${s.origSays} | ${String(s.code).slice(0, 120)}`);
}

const alreadyCode = (s) => s.kind === 'other' || s.restates || s.codeWords || isCodeWords(String(s.says ?? '').replace(/^(?:If (?:not: )?|Repeats: |Fails with )/, '').replace(/ \(\d+ steps? inside\)$/, ''));

// ── The pass ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A length in words, one way everywhere: "the length of password" (for `password.length`, `len(p)`, `s.size()`), never
 * "how many password" for a text in one reading and "password.length" in another. Quoted text and code are untouched.
 */
function lengthWords(says, tree) {
  if (!/\bhow many\b|\.length\b|\.Length\b/.test(String(says))) return says;
  const lengths = new Set();
  for (const n of nodesOf(tree)) {
    if (n.kind === 'member' && /^(?:length|Length|size|Count|count)$/.test(n.property)) lengths.add(splitWords(sayFullName(n.object)).join(' '));
    if (n.kind === 'call' && /^(?:len|length|size|count|nchar|strlen|Count|Length)$/.test(n.callee?.property ?? n.callee?.name ?? '')) { const o = n.callee?.kind === 'member' ? n.callee.object : n.args?.[0]; if (o) lengths.add(splitWords(sayFullName(o)).join(' ')); }
  }
  if (!lengths.size) return says;
  return String(says).split(/("(?:\\.|[^"\\])*"|`[^`]*`|«[^»]*»)/).map((part, i) => (i % 2 ? part : part
    .replace(/\bhow many ((?:the [\w ]+?'s )?[\w ]+?)(?= is\b| are\b| has\b|,|$| and\b| or\b| plus\b| minus\b| to\b| from\b| times\b|\))/g, (m, x) => (lengths.has(splitWords(x.replace(/^the /, '').replace(/'s /g, ' ')).join(' ')) || lengths.has(splitWords(x).join(' ')) ? `the length of ${x}` : m))
    .replace(/\b([A-Za-z_][\w]*)\.(?:length|Length)\b(?!\s*\()/g, (m, x) => `the length of ${x}`))).join('');
}
const sayFullName = (n) => (n?.kind === 'name' ? n.name : n?.kind === 'member' ? `${sayFullName(n.object)} ${n.property}` : '');

/** The name a chooser's cases set (`val grade = when (…)`, `x = switch …`), as text, or null. */
function valueTarget(s) {
  if (typeof s.valueOf === 'string') return s.valueOf;
  if (s.kind !== 'branch') return null;
  const m = /^\s*(?:(?:val|var|let|const|auto|my|local)\s+)?([A-Za-z_$][\w$.]*)\s*(?::[^=]+)?=\s*(?:when|switch|match|case|if|select)\b/.exec(String(s.code ?? ''));
  return m ? m[1] : null;
}

function sayLessList(list, ctx, depth, top) {
  let ended = false, endedImplicit = false;
  for (let i = 0; i < (list?.length ?? 0); i++) {
    const s = list[i];
    // A label (`err:`) is reached by a jump: steps after it are not after the ending.
    if (ended && (/^\s*[A-Za-z_]\w*\s*:\s*$/.test(String(s.code ?? '')) || /^The "\w+" part starts here$/.test(String(s.says)))) ended = false;
    if (ended && s.kind === 'return' && /^Stops here$/.test(String(s.says)) && /^\s*return\s*;?\s*$/.test(String(s.code ?? ''))) { s.explained = true; continue; }
    if (ended && /^Defines (?:a helper|how)\b/.test(String(s.says))) ended = false;
    // A one-expression function (`const f = (x) => x * 2`) ends with its value: steps after it at the top belong to the
    // function around it (the reader took too much), so they are not this function's at all.
    if (ended && top && endedImplicit) { list.length = i; break; }
    if (ended) { regionAsCode(s, WHY.structure); continue; }
    // An `else` / `catch` / `finally` read as a step of its own: the block before it was misread.
    if (/^\s*\}?\s*(?:else|elseif|elsif|elif|catch|finally|rescue|ensure)\b(?!\s*(?:->|=>|:\s*$))/.test(String(s.code ?? '')) && s.kind !== 'branch' && s.kind !== 'check' && !s.caseLabel) {
      regionAsCode(s, WHY.structure);
      const prev = list[i - 1];
      if (prev && prev.kind === 'branch' && prev.explained !== false) regionAsCode(prev, WHY.structure);
      continue;
    }
    // Blocks first: when their structure is uncertain, the whole region is code.
    if (isBlock(s) && structureProblem(s, ctx.lang, ctx.lines)) {
      const empty = s.kind === 'branch' && !s.children?.length && !s.otherwise?.length;
      regionAsCode(s, WHY.structure);
      // A question whose body was not attached (`if constexpr (…)` then `return …;`): the next step is probably its
      // body, so it is not drawn as something that always happens.
      if (empty && list[i + 1]) { regionAsCode(list[i + 1], WHY.structure); i++; }
      continue;
    }
    const last = top && i === list.length - 1;
    if (!alreadyCode(s)) {
      lastTag = null;
      const sc = Object.create(ctx);
      sc.last = last || (ctx.lastPath && i === list.length - 1); sc.only = top && list.length === 1;
      const why = checkStep(s, sc);
      if (why) {
        asCode(s, why);
        if (lastTag) Object.defineProperty(s, 'whyTag', { value: lastTag, enumerable: false });
        if (DEBUG) console.error(`[say-less] ${why}${lastTag ? ` ${lastTag}` : ""} | ${s.origSays} | ${String(s.code).slice(0, 120)}`);
      }
      else { s.explained = true; s.says = lengthWords(s.says, s.expr); }
    } else {
      s.explained = false;
      const before = s.code;
      exactCode(s);
      if (s.code !== before && (s.kind === 'other' || s.restates)) s.says = asCodeWords(s.code);
      if (!s.notExplainedWhy) s.notExplainedWhy = s.restates && s.kind === 'return' && s.expr && s.expr.kind !== 'code' ? WHY.form : s.expr?.kind === 'code' ? WHY.unparsed : WHY.form;
    }
    // The last thing a function does: the last step, and (inside it) the last step of each of its sides and cases.
    // `return when (x) { … }` / `return x switch { … }`: each case's value is what the function gives back.
    if (!s.children && !s.otherwise && !s.handlers && !s.always) { if (isEnding(s) && s.kind !== 'other') { ended = true; endedImplicit = i === 0 && s.kind === 'return' && !/^\s*return\b/.test(String(s.code ?? '')); } continue; }
    const valueOf = /^\s*return\s+(?:when|switch|match|if|case)\b|^\s*return\s+\S.*\b(?:switch|match)\s*\{|^\s*=\s*(?:when|if)\b/.test(String(s.code ?? ''));
    const lastPath = ((ctx.lastPath || top) && i === list.length - 1) || (s.kind === 'check' && s.caseLabel && ctx.armsLast) || valueOf;
    const armsLast = s.kind === 'branch' && lastPath;
    const inner = { ...ctx, lastPath, armsLast, exprValue: ctx.exprValue || valueOf, ...(valueTarget(s) ? { valueTarget: valueTarget(s) } : {}) };
    // A "loop" that is a call with a callback (`lapply(files, function(path) …)`, `items.forEach(…)`): a return inside
    // it ends the callback, not the function, so it is not drawn as the function's ending.
    if (s.kind === 'loop' && !/^\s*(?:for|foreach|while|until|do|loop|repeat)\b/.test(String(s.code ?? '')) && s.children) {
      for (const k of everyStep(s.children)) if ((k.kind === 'return' || k.kind === 'fail') && !k.nested) regionAsCode(k, WHY.structure);
    }
    // An inner function (a callback, a lambda) is a function of its own: its last step is its own value.
    if (s.children) sayLessList(s.children, s.nested ? { ...ctx, lastPath: false, armsLast: false, exprValue: false, inLambda: true } : inner, depth + 1, !!s.nested);
    if (s.otherwise) sayLessList(s.otherwise, inner, depth + 1, false);
    for (const h of s.handlers || []) sayLessList(h.steps, inner, depth + 1, false);
    if (s.always) sayLessList(s.always.steps, { ...ctx, lastPath: false }, depth + 1, false);
    // Nothing follows an ending in the same list (a step after `return` means the structure was misread).
    if (isEnding(s) && s.kind !== 'other') ended = true;
  }
}

// Infrastructure and delivery files are read by their own readers (infra-*.mjs) into fixed forms; their steps are marked.
const INFRA = new Set(['dockerfile', 'github-actions', 'terraform', 'bicep', 'kubernetes', 'docker-compose']);

function markOnly(list) {
  for (const s of everyStep(list)) {
    if (alreadyCode(s)) { s.explained = false; s.notExplainedWhy ??= WHY.form; } else s.explained = true;
  }
}

/**
 * True when a condition is certainly yes or no: comparisons, negations, yes/no values, calls named as questions
 * (is…, has…, can…), and and/or of those. In JavaScript, TypeScript, Python, and Ruby `a || b` gives back a or b, so
 * an and/or of plain values is not a yes/no answer there.
 */
export function certainlyYesNo(text, lang) {
  const valueLogic = /^(?:javascript|typescript|python|ruby)$/.test(lang);
  const t = parseExpr(String(text ?? ''), lang);
  // (Where and/or always give back yes or no, a condition the tree reader cannot parse keeps the reader's call.)
  if (!t) return !valueLogic;
  const yesNo = (n) => {
    if (!n) return false;
    switch (n.kind) {
      case 'compare': case 'chain': case 'not': return true;
      case 'literal': return n.type === 'bool';
      case 'logic': return valueLogic ? n.operands.every(yesNo) : true;
      case 'call': { const name = n.callee?.kind === 'member' ? n.callee.property : n.callee?.name; return /^(?:is|has|can|should|does|did|was|are|needs?|contains|includes|exists|matches|equals|starts|ends|any|all|every|some|isinstance|is_a\?|kind_of\?|[a-z_]+\?)/i.test(String(name ?? '')) || /\?$/.test(String(name ?? '')); }
      case 'name': case 'member': { const w = n.kind === 'name' ? n.name : n.property; return !valueLogic && /^(?:is|has|can|should)[A-Z_]/.test(String(w)); }
      default: return false;
    }
  };
  return yesNo(t);
}

/** Inputs: only names written as parameters in the function's own signature, never a macro, type, or lifetime. */
function checkInputs(item, lang, srcLines) {
  if (!item.inputs?.length || ['shell', 'sql'].includes(lang)) return;
  const ids = new Set();
  const take = (a, b) => { for (const id of stripQuoted(srcLines.slice(a, b).join('\n')).match(/[A-Za-z_][\w.]*/g) || []) { ids.add(id); if (id.includes('.')) for (const part of id.split('.')) ids.add(part); } };
  const at = Math.max(0, (item.line ?? 1) - 1);
  take(at, at + 3);
  // (A signature over many lines: read further only when a name was not found in the first lines.)
  if (item.inputs.some((p) => !ids.has(String(p.name ?? '').replace(/^[$@&*]+/, '').replace(/\.\.\.$/, '')))) take(at + 3, at + 13);
  item.inputs = item.inputs.filter((p) => {
    const n = String(p.name ?? '');
    const bare = n.replace(/^[$@&*]+/, '').replace(/\.\.\.$/, '');
    // A destructured parameter (`{ userId, name }`): every name in it is in the signature.
    if (/^[{[(][^]*[}\])]$/.test(bare)) { const names = bare.match(/[A-Za-z_]\w*/g) || []; if (names.length && names.every((x) => ids.has(x))) return true; item.inputsDropped = (item.inputsDropped ?? 0) + 1; return false; }
    if (!/^[A-Za-z_][\w.]*$/.test(bare)) { item.inputsDropped = (item.inputsDropped ?? 0) + 1; return false; }
    if ((lang === 'c' || lang === 'cpp') && /^[A-Z][A-Z0-9_]{2,}$/.test(bare)) { item.inputsDropped = (item.inputsDropped ?? 0) + 1; return false; }
    if (!ids.has(bare)) { item.inputsDropped = (item.inputsDropped ?? 0) + 1; return false; }
    return true;
  });
}

/**
 * Apply the allowlist to a reading (readCode's result): every step is checked and marked explained or not.
 * Returns the same reading.
 */
export function sayLess(reading, source) {
  const lang = reading?.language;
  if (!reading?.items || !lang) return reading;
  const lines = String(source ?? '').split('\n');
  // The functions this file defines (a call of one of them is that function, not a library's of the same name).
  const ownFunctions = new Set(reading.items.filter((it) => it.kind === 'function' || it.kind === 'decision').map((it) => it.name));
  // Shell helpers that end with `exit N` (one-line definitions), by name.
  const helperExits = new Map();
  if (lang === 'shell') for (const m of String(source ?? '').matchAll(/^\s*(?:function\s+)?([\w-]+)\s*\(\)\s*\{[^}\n]*\bexit\s+(\d+)\s*;?\s*\}/gm)) helperExits.set(m[1], m[2]);
  for (const it of reading.items) {
    if (it.kind !== 'function' && it.kind !== 'decision') continue;
    if (!INFRA.has(lang)) checkInputs(it, lang, lines);
    if (!it.steps?.length) continue;
    // SQL is read by its own reader, which already shows what its gate cannot account for as code (sql-proc.mjs):
    // its steps are only marked here.
    currentLines = lines; currentLang = lang;
    if (lang === 'sql' || INFRA.has(lang)) markOnly(it.steps);
    else {
      const ownNames = new Set((it.inputs || []).map((p) => String(p.name).replace(/^[$@&*]+/, '')));
      const collect = (l) => { for (const s of l || []) { const e = s.expr; if (e?.kind === 'assign' && e.declare && e.target?.kind === 'name') ownNames.add(e.target.name); if (s.children) collect(s.children); if (s.otherwise) collect(s.otherwise); } };
      collect(it.steps);
      sayLessList(it.steps, { lang, lines, helperExits, ownNames, ownFunctions, singleTop: it.steps.length === 1 }, 0, true);
    }
    let total = 0, explained = 0;
    for (const s of everyStep(it.steps)) { total++; if (s.explained !== false) explained++; }
    it.totalSteps = total;
    it.explainedSteps = explained;
    if (it.stepsReadable != null) it.stepsReadable = Math.round((it.steps.filter((x) => x.explained !== false).length / it.steps.length) * 100) / 100;
  }
  return reading;
}
