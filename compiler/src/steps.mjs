// Steps: read any function as a short list of plain steps (check, branch, loop, set, call, return, fail).
// Decisions become rules; everything else becomes steps. Deterministic and pattern-based, like the rest of
// the reader: a statement it does not recognize is kept as `other` with its original text, never guessed.
export const STEPS_SCHEMA = 'thunder-steps-v1';
const MAX_STEPS = 14;

const words = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();
const clip = (s, n = 70) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const stripTail = (s) => String(s).trim().replace(/[;{]\s*$/, '').replace(/:\s*$/, '').trim();

// Calls that mean something to a reader, recognized by name. Same spirit as the Thunder map patterns.
const KNOWN_CALLS = [
  { re: /^(?:requests\.(?:get|post|put|patch|delete)|fetch|axios(?:\.\w+)?|http\.(?:Get|Post|NewRequest)|HttpClient\.\w+|client\.(?:get|post|put|delete))$/i, say: () => 'Calls another service over HTTP' },
  { re: /^stripe\./i, say: () => 'Calls Stripe' },
  { re: /^(?:send_?email|sendMail|mailer\.\w+|smtp\.\w+)$/i, say: () => 'Sends an email' },
  { re: /^(?:db|database|repo|repository|session|conn|cursor)\.(?:insert|save|add|create|update|execute|exec|query|delete|remove|commit)\w*$/i, say: (m) => `Writes to the database (${m.split('.').pop()})` },
  { re: /^(?:events?|bus|publisher|emitter|queue)\.(?:publish|emit|send|enqueue|push)$/i, say: () => 'Announces an event' },
  { re: /^(?:log|logger|console|logging|fmt|Log|System\.out|println|print|puts|echo|printf)\b/i, say: () => 'Writes a log or message' },
];

/** entry['easy'] -> "the entry's easy"; $x->y -> "the x's y"; plain names as words. */
const possessiveWords = (path) => { const parts = String(path).replace(/^\$/, '').replace(/\[\s*['"]?([\w$]+)['"]?\s*\]/g, '.$1').split(/\.|->/).filter((x) => x && !/^(self|this)$/.test(x)); return parts.length > 1 ? `the ${words(parts[parts.length - 2])}'s ${words(parts[parts.length - 1])}` : words(parts[0] || path); };

/** Enum values read as words: Status.ON_SHELF -> "on shelf", Color.RED -> "red". */
export const plainEnums = (text) => String(text).replace(/\b[A-Z][A-Za-z0-9]*\.([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*)\b(?!\s*\()/g, (m, v) => (v.length > 1 && v === v.toUpperCase() ? words(v) : m));

/** A condition as words when it can't be fully translated: c.ctx == nil -> "c.ctx is empty". */
export function sayCodeCondition(cond) {
  let c = plainEnums(String(cond)).trim().replace(/\s*(\{|:|then|do)\s*$/, '').trim();
  while (c.startsWith('(') && matchingClose(c, 0) === c.length - 1) c = c.slice(1, -1).trim();
  // A bare yes/no property reads as a sentence: `order.refunded` -> "order is refunded", `!user.isAdmin` -> "user is not admin".
  const prop = c.match(/^(not\s+|!)?(?:self\.|this\.)?([A-Za-z_]\w*)\.([A-Za-z_]\w*)(\(\))?$/);
  const plural = (w, call) => !call && !/ /.test(w) && /[^sui]s$/.test(w) && w.length > 3;
  if (prop && plural(words(prop[3]), !!prop[4])) return `${words(prop[2])} ${prop[1] ? 'has no' : 'has'} ${words(prop[3])}`;
  const yesNo = (w, call) => /^(is|has|can|should|was) /.test(w) || (!call && (/ed$/.test(w) || /^(active|valid|open|empty|ready|visible|available|enabled|required|admin|public|private|paid|due|overdue|eligible|blocked)$/.test(w)));
  if (prop && yesNo(words(prop[3]), !!prop[4])) {
    const neg = !!prop[1];
    const w = words(prop[3]).replace(/^(is|has|can|should|was) /, (m) => m);
    const verb = /^(is|was) /.test(w) ? w.replace(/^(is|was) /, neg ? '$1 not ' : '$1 ') : /^(has|can|should) /.test(w) ? (neg ? `does not ${w.replace(/^has /, 'have ')}` : w).replace(/^does not can /, 'cannot ').replace(/^does not should /, 'should not ') : `is ${neg ? 'not ' : ''}${w}`;
    return `${words(prop[2])} ${verb}`;
  }
  // Ruby predicates: `running?` -> "it is running", `order.paid?` -> "order is paid".
  let pred;
  if ((pred = c.match(/^(!|not\s+)?(?:([\w$]+)\.)?([a-z_]\w*)\?$/))) return `${pred[2] ? words(pred[2]) : 'it'} is ${pred[1] ? 'not ' : ''}${words(pred[3])}`;
  // How many: count($a) / len(a) / a.length / a.Count / a.size() -> "how many a".
  c = c.replace(/\\?\b(?:count|len|sizeof)\(\s*\$?([\w$.\[\]'">-]+)\s*\)/g, (m0, x) => `how many ${possessiveWords(x)}`)
    .replace(/\b([\w$]+(?:\.[\w$]+)*)\.(?:length|Length|Count|count\(\)|size\(\)|len\(\))(?![\w(])/g, (m0, x) => `how many ${possessiveWords(x)}`);
  // PHP built-ins and yes/no calls: !empty($x) -> "x is not empty", isset($x) -> "x is set", isValid(x) -> "is valid".
  c = c.replace(/\\(?=[a-z_]\w*\()/g, '');
  let call;
  if ((call = c.match(/^(!|not\s+)?(empty|isset|is_null)\(\s*\$?([\w$.\[\]'">-]+)\s*\)$/))) {
    const neg = !!call[1] !== (call[2] === 'isset');
    const what = possessiveWords(call[3]);
    return call[2] === 'isset' || call[2] === 'is_null' ? `${what} is ${(call[2] === 'isset') === !call[1] ? '' : 'not '}set` : `${what} is ${neg ? 'not ' : ''}empty`;
  }
  if ((call = c.match(/^(!|not\s+)?(?:(?:self|this)\.)?((?:is|has|can|should|was|are|does)[A-Z_]\w*)\s*\([^()]*\)$/))) {
    const w = words(call[2]);
    return call[1] ? `not: ${w}` : w;
  }
  // A plain name or property path used as a yes/no: `if proxy` -> "proxy is set"; `not url.host` -> "the url's host is not set".
  const bare = c.match(/^(not\s+|!)?(?:self\.|this\.)?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)$/);
  if (bare && !/^(true|false|True|False|None|null|nil)$/.test(bare[2])) {
    const parts = bare[2].split('.');
    const what = parts.length > 1 ? `the ${words(parts[0])}'s ${words(parts[1])}` : words(parts[0]);
    return `${what} is ${bare[1] ? 'not ' : ''}set`;
  }
  return clip(c
    .replace(/\s*(===|==)\s*(nil|null|None|undefined|""|'')(?=\s|\)|$)/g, ' is empty')
    .replace(/\s*(!==|!=)\s*(""|'')(?=\s|\)|$)/g, ' is not empty')
    .replace(/\s*(!==|!=)\s*(nil|null|None|undefined)\b/g, ' is set')
    .replace(/\bis not None\b/g, 'is set').replace(/\bis None\b/g, 'is empty')
    .replace(/\s*(===|==)\s*/g, ' is ').replace(/\s*(!==|!=)\s*/g, ' is not ')
    .replace(/\s*&&\s*/g, ' and ').replace(/\s*\|\|\s*/g, ' or ')
    // Membership: `book not in student.books` -> "book is not in student.books".
    .replace(/\s+not\s+in\s+/g, ' is not in ').replace(/(?<!\bis(?: not)?)\s+in\s+(?=[\w$])/g, ' is in ')
    // Comparisons as words; `->` and `=>` are never comparisons.
    .replace(/\s+<=\s+/g, ' is at most ').replace(/\s+>=\s+/g, ' is at least ').replace(/\s+<\s+/g, ' is less than ').replace(/(?<![-=])\s+>\s+/g, ' is more than ')
    .replace(/(^|[\s(])!(?=[\w(])/g, '$1not ').replace(/\s+/g, ' '), 70);
}
function matchingClose(str, open) {
  let depth = 0;
  for (let i = open; i < str.length; i++) { if (str[i] === '(') depth++; else if (str[i] === ')' && --depth === 0) return i; }
  return -1;
}
const lastWords = (path) => words(String(path).split('.').pop());
/** "cmd.commandCalledAs.called" -> "called on command called as"; "this.count" -> "count". */
function targetWords(path) {
  const parts = String(path).replace(/^[@$]+/, '').replace(/#/g, '').replace(/\[.*$/, '').split('.').filter((p) => !/^(this|self)$/.test(p));
  if (parts.length <= 1) return words(parts[0] || path);
  return `the ${words(parts[parts.length - 2])}'s ${words(parts[parts.length - 1])}`;
}

function callee(text) {
  const m = String(text).replace(/\[[^\]]*\]/g, '').match(/^(?:await\s+|try\s+|yield\s+|void\s+)?(?:new\s+)?([A-Za-z_$#@][\w$#]*(?:<[^()]*?>)?(?:(?:\.|::|->)[A-Za-z_$#][\w$#]*(?:<[^()]*?>)?(?:\(\))?)*)!?\s*\(/);
  return m ? m[1].replace(/<[^()]*?>/g, '').replace(/\(\)/g, '').replace(/::|->/g, '.').replace(/#/g, '') : null;
}
function sayCall(name, args) {
  for (const k of KNOWN_CALLS) if (k.re.test(name)) {
    const target = (args.match(/^\s*["'`]([\w.\-/: ]{1,60})["'`]/) || [])[1];
    const base = k.say(name);
    return target ? `${base}: ${target}` : base;
  }
  return null;
}
function firstArgs(text) {
  const open = text.indexOf('(');
  return open >= 0 ? text.slice(open + 1, open + 120) : '';
}

function sayValue(expr) {
  if (/^[A-Z][A-Za-z0-9]*\.[A-Z][A-Z0-9_]+$/.test(stripTail(expr))) return plainEnums(stripTail(expr));
  const e = stripTail(expr).replace(/\s+as\s+[\w.<>\[\]|, ]+$/, '');
  const py = sayPython(e);
  if (py) return py;
  const common = sayCommon(e);
  if (common) return common;
  if (/^["'`].*["'`]$/.test(e)) return `"${clip(e.slice(1, -1), 40)}"`;
  if (/^-?\d+(\.\d+)?$/.test(e) || /^(true|false|True|False|nil|null|None|undefined)$/.test(e)) return e;
  const c = callee(e);
  if (c) {
    if (/^new\s/.test(e)) return `a new ${c.split('.').pop()}`;
    return `the result of ${lastWords(c)}`;
  }
  if (/^[A-Za-z_$][\w$.]*$/.test(e)) return words(e.replace(/^\$/, '').split('.').pop());
  if (/^\$?[A-Za-z_][\w$]*(?:\[\s*['"]?\w+['"]?\s*\]|->\w+|\.\w+)+$/.test(e)) return possessiveWords(e);
  return null;
}

/**
 * Simple arithmetic between two names or numbers, used for each side of a choice: `order.total - discount` -> "the
 * order's total minus discount". `+` only with a number (two names joined by `+` may be text put together).
 */
function sayArithmetic(expr) {
  const ar = String(expr).trim().match(/^([A-Za-z_$][\w$.]*|\d+(?:\.\d+)?)\s*([-+*/])\s*([A-Za-z_$][\w$.]*|\d+(?:\.\d+)?)$/);
  if (!ar || (ar[2] === '+' && !/^\d/.test(ar[1]) && !/^\d/.test(ar[3]))) return null;
  const side = (x) => (/^\d/.test(x) ? x : possessiveWords(x));
  return `${side(ar[1])} ${{ '+': 'plus', '-': 'minus', '*': 'times', '/': 'divided by' }[ar[2]]} ${side(ar[3])}`;
}

/** Python comprehensions and the builtins that summarize a collection, said as what they produce. */
const PY_SUMMARY = [
  { re: /^any$/, say: (src, cond) => `whether any item in ${src}${cond ? ` where ${cond}` : ''} matches` },
  { re: /^all$/, say: (src, cond) => `whether every item in ${src}${cond ? ` where ${cond}` : ''} matches` },
  { re: /^sum$/, say: (src) => `a total over ${src}` },
  { re: /^min$/, say: (src) => `the smallest in ${src}` },
  { re: /^max$/, say: (src) => `the largest in ${src}` },
  { re: /^(?:sorted)$/, say: (src) => `${src}, sorted` },
];
const lastSeg = (x) => words(String(x).trim().replace(/\(\)$/, '').split('.').pop());
/** "[r for r in rules if r.active]" -> "the items in rules where active"; "any(x.ok for x in xs)" -> "whether any item in xs matches". */
function sayPython(value) {
  const e = String(value).trim();
  let m = e.match(/^\[\s*(.+?)\s+for\s+([\w, ()]+?)\s+in\s+(.+?)(?:\s+if\s+(.+?))?\s*\]$/);
  if (m) {
    const [, expr, v, src, cond] = m;
    const vars = v.replace(/[()]/g, '').split(/\s*,\s*/);
    const bareCond = cond && cond.replace(new RegExp(`\\b(?:${vars.join('|')})\\.`, 'g'), '');
    const condSaid = cond ? (/^\w+$/.test(bareCond) ? words(bareCond) : sayCodeCondition(bareCond)) : null;
    if (vars.includes(expr.trim())) return condSaid ? `the items in ${lastSeg(src)} where ${condSaid}` : `the items in ${lastSeg(src)}`;
    return `one ${lastSeg(expr.replace(/\(.*$/, ''))} for each item in ${lastSeg(src)}${condSaid ? ` where ${condSaid}` : ''}`;
  }
  if ((m = e.match(/^\{\s*(.+?)\s*:\s*.+?\s+for\s+[\w, ()]+?\s+in\s+(.+?)(?:\s+if\s+.+?)?\s*\}$/))) return `a lookup by ${lastSeg(m[1])} built from ${lastSeg(m[2])}`;
  if ((m = e.match(/^len\(\s*([\w.]+)\s*\)$/))) return `how many ${lastSeg(m[1])}`;
  if ((m = e.match(/^(\w+)\(\s*(.+?)\s+for\s+([\w, ()]+?)\s+in\s+(.+?)(?:\s+if\s+(.+?))?\s*\)$/))) {
    const hit = PY_SUMMARY.find((k) => k.re.test(m[1]));
    if (hit) {
      const vars = m[3].replace(/[()]/g, '').split(/\s*,\s*/);
      const condSaid = m[5] ? sayCodeCondition(m[5].replace(new RegExp(`\\b(?:${vars.join('|')})\\.`, 'g'), '')) : null;
      return hit.say(lastSeg(m[4]), condSaid);
    }
  }
  if ((m = e.match(/^(any|all|sum|min|max|sorted)\(\s*([\w.]+)\s*\)$/))) return PY_SUMMARY.find((k) => k.re.test(m[1])).say(lastSeg(m[2]));
  return null;
}

/**
 * Everyday value shapes said as what they are, the same in every language: a new object, a value looked up by
 * key, text built from parts, a conversion. Null when the shape is not one of these.
 */
function sayCommon(value) {
  const e = String(value).trim().replace(/\s+as\s+[\w.<>\[\]|, ]+$/, '');
  let m;
  // cond ? a : b  ->  "a if cond, otherwise b" (not TypeScript optional types or labels).
  const side = (x) => sayValue(x) ?? sayArithmetic(x) ?? possessiveWords(x.trim());
  if ((m = e.match(/^(.+?)\s+\?\s+([^:?]+?)\s+:\s+([^:?]+)$/)) && !/^(?:[\w$]+\??\s*:)/.test(e)) return `${side(m[2])} if ${sayCodeCondition(m[1])}, otherwise ${side(m[3])}`;
  if ((m = e.match(/^(.+?)\s+if\s+(.+?)\s+else\s+(.+)$/)) && !/^(?:if|unless)\b/.test(e)) return `${side(m[1])} if ${sayCodeCondition(m[2])}, otherwise ${side(m[3])}`;
  // An `if` used as a value, said like a ternary: Kotlin `if (a) b else c`, Rust `if a { b } else { c }`,
  // Ruby `if a then b else c end`.
  const ifValue = ifAsValue(e);
  if (ifValue) return `${side(ifValue.yes)} if ${sayCodeCondition(ifValue.cond)}, otherwise ${side(ifValue.no)}`;
  if ((m = e.match(/^&?([A-Z]\w*)(?:::new\s*\(|\s*\{)/)) || (m = e.match(/^(?:[\w.]+\.)?([A-Z]\w*)\{/))) return `a new ${m[1]}`;
  if ((m = e.match(/^new\s*\(\s*(?:[\w]+\.)?([A-Z]\w*)\s*\)$/))) return `a new ${m[1]}`;
  if ((m = e.match(/^&([A-Z]\w*)$/))) return `a new ${m[1]}`;
  if ((m = e.match(/^[\w.]+\.(?:get|get_or_404|find|Find|findById|find_by_id)\(\s*([A-Z]\w*)\s*,\s*([\w.]+)\s*\)$/))) return `the ${m[1]} with ${lastSeg(m[2])}`;
  if ((m = e.match(/^([\w.]+)\.get\(\s*([A-Za-z_][\w.]*)\s*[,)]/)) || (m = e.match(/^([\w.]+)\[\s*([A-Za-z_][\w.]*)\s*\]$/))) return `the ${lastSeg(m[2])} entry in ${lastSeg(m[1])}`;
  if (/["'`]\s*\+|\+\s*["'`]/.test(e) && !/[<>=!&|]/.test(e)) return 'text built from its parts';
  if ((m = e.match(/^[A-Za-z_][\w.]*(\s*,\s*[A-Za-z_][\w.]*)+$/))) return e.split(/\s*,\s*/).map(lastSeg).join(' and ');
  if ((m = e.match(/^make\(\s*(\[\]|map\[)/))) return m[1] === '[]' ? 'an empty list' : 'an empty lookup table';
  if (/^(?:f|rf|fr)["']/.test(e) || /^`[^`]*\$\{/.test(e) || /^\$"/.test(e) || /^(?:fmt\.Sprintf|String\.format|format!)\(/.test(e)) return 'text built from its parts';
  if ((m = e.match(/^([\w.]+)\.get\(\s*["'`]([\w.\-: ]{1,40})["'`]/))) return `the "${m[2]}" value from ${lastSeg(m[1])}`;
  if ((m = e.match(/^([\w.]+)\[\s*["'`]([\w.\-: ]{1,40})["'`]\s*\]$/))) return `the "${m[2]}" value from ${lastSeg(m[1])}`;
  if ((m = e.match(/^([\w.]+)\.split\(\s*["'`]([^"'`]{0,10})["'`]/))) return `${lastSeg(m[1])} split at "${m[2]}"`;
  if ((m = e.match(/^@?([\w.]+?)(?:\.copy|\.clone|\.Clone|\.dup)(?:\(\))?$/))) return `a copy of ${lastSeg(m[1])}`;
  if ((m = e.match(/^(?:str|String|string)\(\s*([\w.]+)\s*\)$/)) || (m = e.match(/^([\w.]+)\.(?:toString|to_s|ToString)\(\)$/))) return `${lastSeg(m[1])} as text`;
  if ((m = e.match(/^(?:int|float|Number|parseInt|parseFloat|strconv\.Atoi|Integer\.parseInt|int\.Parse)\(\s*([\w.]+)/))) return `${lastSeg(m[1])} as a number`;
  if ((m = e.match(/^(?:JSON\.parse|json\.loads|json\.load|JsonSerializer\.Deserialize\w*)\(\s*([\w.]+)/))) return `${lastSeg(m[1])} read as JSON`;
  if ((m = e.match(/^(?:JSON\.stringify|json\.dumps|JsonSerializer\.Serialize)\(\s*([\w.]+)/))) return `${lastSeg(m[1])} written as JSON`;
  if (/^(?:dict|Map|HashMap|map)\(\s*\)$|^\{\s*\}$|^new (?:Map|HashMap|Dictionary)\b/.test(e)) return 'an empty lookup table';
  if (/^(?:list|Array|ArrayList|vec!?)\(?\s*\)?$|^\[\s*\]$|^new (?:ArrayList|List)\b/.test(e)) return 'an empty list';
  if ((m = e.match(/^len\(\s*([\w.]+)\s*\)$/)) || (m = e.match(/^([\w.]+)\.(?:length|size\(\)|Count|count\(\)|len\(\))$/))) return `how many ${lastSeg(m[1])}`;
  return null;
}
/** `if (a) b else c` / `if a { b } else { c }` / `if a then b else c end` as { cond, yes, no }; null otherwise. */
function ifAsValue(e) {
  let m;
  if ((m = e.match(/^if\s*\(/))) {
    const close = matchingClose(e, e.indexOf('('));
    if (close < 0) return null;
    const rest = e.slice(close + 1).match(/^\s*(?:\{\s*([^{};]+?)\s*\}|([^{};]+?))\s+else\s+(?:\{\s*([^{};]+?)\s*\}|([^{};]+))$/);
    if (rest) return { cond: e.slice(e.indexOf('(') + 1, close), yes: rest[1] ?? rest[2], no: rest[3] ?? rest[4] };
    return null;
  }
  if ((m = e.match(/^if\s+([^{}]+?)\s*\{\s*([^{};]+?)\s*\}\s*else\s*\{\s*([^{};]+?)\s*\}$/))) return { cond: m[1], yes: m[2], no: m[3] };
  if ((m = e.match(/^if\s+(.+?)\s+then\s+(.+?)\s+else\s+(.+?)\s+end$/))) return { cond: m[1], yes: m[2], no: m[3] };
  if ((m = e.match(/^unless\s+(.+?)\s+then\s+(.+?)\s+else\s+(.+?)\s+end$/))) return { cond: m[1], yes: m[3], no: m[2] };
  return null;
}

/** A boolean expression (comparison or logic), said as a yes/no question. */
const LOGIC = /(&&|\|\||[<>]=?|[!=]==?|\band\b|\bor\b|\bnot\b|\bis\b|^\s*!)/;
function sayWhether(expr) {
  const e = String(expr).trim();
  if (!LOGIC.test(e) || /=>|\blambda\b|\?.*:/.test(e) || e.length > 90) return null;
  return `whether ${sayCodeCondition(e)}`;
}

/** Classify one statement (its first line or header). Returns { kind, says, code } where code is the original text. */
const CHAIN = [
  { re: /\.(?:map|Select|flatMap|SelectMany|map_values|collect\{)\s*[({]/, say: (src) => `one for each item in ${src}` },
  { re: /\.(?:filter|Where|filter_map|select|reject|grep)\s*[({]/, say: (src) => `the items in ${src} that match` },
  { re: /\.(?:find|First|FirstOrDefault|find_first|detect)\s*[({]/, say: (src) => `the first item in ${src} that matches` },
  { re: /\.(?:some|Any|any)\s*[({]/, say: (src) => `whether any item in ${src} matches` },
  { re: /\.(?:every|All|all)\s*[({]/, say: (src) => `whether every item in ${src} matches` },
  { re: /\.(?:reduce|Aggregate|fold|inject|sum|Sum)\s*[({]/, say: (src) => `a total over ${src}` },
  { re: /\.(?:sort|sorted|OrderBy|sortBy|sort_by)\s*[({]/, say: (src) => `${src}, sorted` },
  { re: /\.(?:join|Join|joinToString)\s*[({]/, say: (src) => `${src} joined into text` },
];
/** "items.filter(x => …).map(…)" -> "one for each item in items" (the last collection step wins). */
function sayChain(value) {
  const src = (value.match(/^(?:await\s+)?([A-Za-z_$#][\w$#.]*?)(?:\.(?:iter|into_iter|stream|asSequence|values|keys|entries)\(\))?\./) || [])[1];
  if (!src) return null;
  let hit = null;
  for (const c of CHAIN) { const m = value.match(c.re); if (m && (!hit || m.index > hit.index)) hit = { index: m.index, c }; }
  return hit ? hit.c.say(words(src.split('.').pop().replace(/^#/, ''))) : null;
}

const HTTP_STATUS = { 400: 'Bad Request', 401: 'Unauthorized', 402: 'Payment Required', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 410: 'Gone', 413: 'Payload Too Large', 415: 'Unsupported Media Type', 422: 'Unprocessable Content', 429: 'Too Many Requests', 500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout' };

/**
 * An HTTP error response, returned or sent: Fastify `reply.code(400).send(...)`, Express `res.status(404).json(...)`,
 * `new Response(..., { status: 403 })`, FastAPI `JSONResponse(..., status_code=422)`, Flask `return jsonify(...), 400`.
 * Gives a fail step: { kind: 'fail', says, error: '400 Bad Request', message, status } or null.
 */
function httpErrorOf(head) {
  const expr = head.replace(/^return\s+/, '').replace(/^await\s+/, '').replace(/;\s*$/, '').trim();
  let m = expr.match(/^(?:reply|res|response|resp|ctx\.response)\s*\.\s*(?:code|status|statusCode)\s*\(\s*([45]\d\d)\s*\)/)
    || expr.match(/^(?:new\s+)?(?:Response|NextResponse(?:\.json)?|HttpResponse|JSONResponse|PlainTextResponse|Response\.json)\s*\(.*\bstatus(?:_code)?\s*[:=]\s*([45]\d\d)\b/)
    || (/^return\b/.test(head) ? expr.match(/^.+,\s*([45]\d\d)\s*$/) : null);
  if (!m) return null;
  const status = Number(m[1]);
  const name = HTTP_STATUS[status] ?? (status >= 500 ? 'Server Error' : 'Client Error');
  const msg = (expr.match(/\b(?:error|message|detail|msg)\s*[:=]\s*["'`]([^"'`]{1,80})["'`]/) || expr.match(/\.(?:send|json|end)\(\s*["'`]([^"'`]{1,80})["'`]/) || [])[1];
  return { kind: 'fail', says: `Fails with ${status} ${name}${msg ? `: "${msg}"` : ''}`, error: `${status} ${name}`, ...(msg ? { message: msg } : {}), status };
}

/** Where a redirect goes, in words: '/login' stays a path, `${GOOGLE_AUTH_URL}?…` -> "the Google auth URL", url_for('home') -> "the home page". */
function redirectTarget(arg) {
  const a = String(arg || '').trim().replace(/^(?:url|to|location|redirect_to)\s*=\s*/, '');
  let m;
  if ((m = a.match(/^(?:new\s+URL\(\s*)?["'`](\/[^"'`$?#]*|https?:\/\/[^"'`$/?#]+[^"'`$?#]*)/))) return m[1];
  if ((m = a.match(/^`\$\{\s*([A-Za-z_][\w.]*)\s*\}/))) return `the ${words(m[1].split('.').pop()).replace(/\burl\b/i, 'URL')}`;
  if ((m = a.match(/\b(?:url_for|reverse|route|url)\(\s*["']([\w.:-]+)["']/))) return `the ${words(m[1].split(/[.:]/).pop())} page`;
  if ((m = a.match(/^([A-Za-z_][\w.]*)$/))) return `the ${words(m[1].split('.').pop()).replace(/\burl\b/i, 'URL')}`;
  return 'another page';
}

/**
 * A redirect: Fastify/Express `reply.redirect(url)` / `res.redirect(302, url)`, `Response.redirect(url)`,
 * `NextResponse.redirect(...)`, Flask/Django/Next `redirect(url)`, `HttpResponseRedirect(url)`,
 * FastAPI `RedirectResponse(url)`, Laravel `redirect()->route('home')`. Gives a step that says where the person goes.
 */
function redirectOf(head) {
  const isReturn = /^return\b/.test(head);
  const expr = head.replace(/^return\s+/, '').replace(/^await\s+/, '').replace(/;\s*$/, '').trim();
  let m = expr.match(/^(?:reply|res|response|resp|ctx|c)\s*\.\s*redirect\s*\(\s*(?:\d{3}\s*,\s*)?(.*)\)\s*$/)
    || expr.match(/^(?:Response|NextResponse)\s*\.\s*redirect\s*\(\s*(.*?)\s*(?:,\s*\d{3}\s*)?\)\s*$/)
    || expr.match(/^(?:HttpResponseRedirect|HttpResponsePermanentRedirect|RedirectResponse|redirect)\s*\(\s*(.*?)\s*(?:,\s*(?:\d{3}|status(?:_code)?\s*=\s*\d{3}|permanent\s*=\s*\w+)\s*)?\)\s*$/)
    || expr.match(/^redirect\(\s*\)\s*->\s*(route\(.*\))\s*$/);
  if (!m) return null;
  const to = redirectTarget(m[1]);
  return { kind: isReturn ? 'return' : 'call', says: `Sends the person to ${to}`, redirect: to };
}

/** The top-level keys of an object literal: `{ org, repos: list, ...rest, 'avg': x }` -> ['org', 'repos', 'avg']. */
function objectKeys(expr) {
  const open = expr.indexOf('{');
  if (open < 0) return [];
  let close = -1;
  for (let i = open, d = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '"' || c === "'" || c === '`') { for (i++; i < expr.length && expr[i] !== c; i++) if (expr[i] === '\\') i++; continue; }
    if (c === '{') d++; else if (c === '}' && --d === 0) { close = i; break; }
  }
  if (close < 0) return [];
  const inner = expr.slice(open + 1, close);
  const keys = [];
  let depth = 0, cur = '';
  const take = (part) => { const m = part.trim().match(/^(?:["'](\w+)["']|(\w+))\s*(?::|$|\()/); if (m && !part.trim().startsWith('...')) keys.push(m[1] || m[2]); };
  for (const c of inner) {
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { take(cur); cur = ''; } else cur += c;
  }
  if (cur.trim()) take(cur);
  return keys.length > 8 ? [...keys.slice(0, 7), 'more'] : keys;
}
const listWords = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')}${xs.length > 2 ? ',' : ''} and ${xs.at(-1)}`);

export function classifyStatement(raw, { inner = 0 } = {}) {
  const text = String(raw).trim();
  // A condition written over several lines (`if (\n  a &&\n  b\n) {`) is read whole.
  let first = text.split('\n')[0].trim();
  if (/^(?:if|else\s+if|while|for|switch)\s*\($/.test(first.replace(/\s*\{$/, '')) || (/^(?:if|else\s+if|while)\s*\(/.test(first) && !bracketsClosed(first.replace(/\{\s*$/, '')))) {
    const o = text.indexOf('('), c = matchingClose(text, o);
    if (c > 0 && c < 2000) first = `${text.slice(0, c + 1)}${text.slice(c + 1).split('\n')[0]}`.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
  }
  // TypeScript-only syntax that changes nothing for a reader: casts, non-null assertions, optional calls.
  const head = first
    .replace(/(^|[^\w$\])])\(\s*([\w$#.]+)\s+as\s+[^()]+\)/g, '$1$2').replace(/([\w$\])])\(\s*([\w$#.]+)\s+as\s+[^()]+\)/g, '$1($2)').replace(/([\w$\])])!(?=[.(\[])/g, '$1').replace(/\?\.(?=[\w(\[])/g, '.').replace(/\.\(/g, '(').replace(/^\(\*+(self|this)\)\./, '$1.')
    // Java/C# casts: ((JsonTreeReader) reader).promote() -> reader.promote(); (int) x -> x
    .replace(/\(\(\s*[A-Z][\w.<>\[\]?, ]*\s*\)\s*([\w$.]+)\s*\)/g, '$1').replace(/^(\w[\w.]*\s*=\s*)\(\s*[A-Z][\w.<>\[\]?]*\s*\)\s*/, '$1');
  const code = clip(head, 90);
  let m;
  const innerNote = inner ? ` (${inner} step${inner === 1 ? '' : 's'} inside)` : '';
  // One-line ifs: `if (x) return y;` and Ruby/Perl modifiers `return unless running?`, `notify if late`.
  let inl;
  if ((inl = head.match(/^(if|else\s+if)\s*\((.+?)\)\s*((?:return|throw|break|continue|yield)\b.*|[\w$.]+\(.*\);?|[\w$.]+(?:\+\+|--);?|(?:\+\+|--)[\w$.]+;?)$/)) && balanced(inl[2])) {
    return { kind: 'branch', says: `If ${sayCodeCondition(inl[2])}`, cond: inl[2], code, inline: inl[3] };
  }
  if ((inl = head.match(/^(.+?)\s+(if|unless)\s+(.+)$/)) && !/\belse\b/.test(head) && bracketsClosed(inl[1]) && !/^(?:if|unless|elsif|while|until|for|return\s+\S+\s+if\s+.+\s+else)\b/.test(head) && !/[=(]\s*$/.test(inl[1]) && !/^(?:[\w$.\[\]]+\s*=)/.test(inl[1])) {
    const cond = sayCodeCondition(inl[3]);
    return { kind: 'branch', says: inl[2] === 'unless' ? `If not: ${cond}` : `If ${cond}`, cond: inl[3], negate: inl[2] === 'unless', code, inline: inl[1] };
  }
  // A name declared with no value yet: `let sizeError: Error | undefined;` -> "Starts with no size error yet".
  if ((inl = head.match(/^(?:let|var|const)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?;?$/))) return { kind: 'set', says: `Starts with no ${words(inl[1])} yet`, code };
  // A function stored under a name: `ky.create = (opts) => ...` -> "Defines how ky's create works".
  if ((inl = head.match(/^([\w$.]+)\s*=\s*(?:async\s+)?(?:function\b|\([^()]*\)\s*(?::\s*[^=]+)?=>|[\w$]+\s*=>)/))) return { kind: 'set', says: `Defines how ${targetWords(inl[1])} works`, code };
  if ((inl = head.match(/^([\w$.]+)\s*:?=\s*func\s*\(/))) return { kind: 'set', says: `Defines how ${targetWords(inl[1])} works`, code };
  // JavaScript `delete registry[name]`: "Removes name from registry".
  if ((inl = head.match(/^delete\s+([\w$.]+)(?:\[\s*([^\]]+?)\s*\]|\.([\w$]+));?$/))) return { kind: 'call', says: `Removes ${words(String(inl[2] ?? inl[3]).replace(/["'`]/g, ''))} from ${targetWords(inl[1])}`, code };
  // Go `fallthrough` / C# `goto case`: this case carries on into the next one.
  if (/^fallthrough\b/.test(head)) return { kind: 'call', says: 'Carries on into the next case too', code };
  if ((inl = head.match(/^goto\s+case\s+(.+?);?$/))) return { kind: 'call', says: `Carries on into the case for ${words(plainEnums(inl[1]))}`, code };
  // do { … } while (cond): the steps run once, then again while the condition holds.
  if (/^do\s*\{?$/.test(head)) {
    const dw = text.match(/\}\s*while\s*\(([\s\S]*)\)\s*;?\s*$/);
    if (dw) return { kind: 'loop', says: `Runs once, then repeats while ${sayCodeCondition(dw[1].replace(/\s+/g, ' '))}${innerNote}`, code };
  }
  // Ruby `when x then y` inside a case: "When it is x".
  if ((inl = head.match(/^when\s+(.+?)(?:\s+then\s+(.+))?$/)) && !/[{]\s*$/.test(head) && !/^when\s*\(/.test(head)) {
    return { kind: 'check', says: armSays(inl[1]), code, caseLabel: true, ...(inl[2] ? { inline: inl[2] } : {}) };
  }
  // Kotlin `when (x) {` / `when {` read like a switch.
  if ((inl = head.match(/^when\s*(?:\((.+)\))?\s*\{$/))) return { kind: 'branch', says: inl[1] ? `Chooses by ${words(clip(inl[1], 40))}${innerNote}` : `Checks these cases in order${innerNote}`, code };
  // switch cases: `case X:` / `case X ->` read as "When it is X"; `default:` as "Otherwise".
  if ((m = head.match(/^case\s+(.+?)\s*(?::|->)\s*(.*)$/)) && /(?:[<>]=?|[!=]==?|&&|\|\|)/.test(m[1].replace(/<-|->/g, '')) && !/^["']/.test(m[1])) return { kind: 'check', says: `When ${sayCodeCondition(m[1])}`, code, caseLabel: true };
  if ((m = head.match(/^case\s+(.+?)\s*(?::|->)\s*(.*)$/))) return { kind: 'check', says: `When it is ${/^[A-Z][A-Z0-9_]+$/.test(m[1].replace(/^[A-Z]\w*\./, '')) ? words(m[1].replace(/^[A-Z]\w*\./, '')) : sayCodeCondition(plainEnums(m[1]))}`, code, caseLabel: true };
  if (/^default\s*(?::|->)/.test(head)) return { kind: 'check', says: 'Otherwise', code, caseLabel: true };
  // Failures
  if ((m = head.match(/^(?:throw|raise)\s+(?:new\s+)?([A-Za-z_][\w.]*)?/)) || /^panic!?\s*\(/.test(head)) {
    const name = m?.[1] ? m[1].split('.').pop() : null;
    const msg = (head.match(/["'`]([^"'`]{1,60})["'`]/) || [])[1];
    const said = name && /^[a-z]/.test(name) ? `the error made by ${words(name)}` : name;
    return { kind: 'fail', says: `Fails${said ? ` with ${said}` : ''}${msg ? `: "${msg}"` : ''}`, code, ...(name ? { error: name } : {}), ...(msg ? { message: msg } : {}) };
  }
  // An HTTP error response (4xx/5xx) is a Stop: the request is refused, with a status and a message.
  const httpFail = httpErrorOf(head);
  if (httpFail) return { ...httpFail, code };
  // A redirect sends the person somewhere else: "Sends the person to the Google auth URL".
  const redirect = redirectOf(head);
  if (redirect) return { ...redirect, code };
  // Returns (Go/Rust error returns read as failures)
  if ((m = head.match(/^return\b\s*(.*)$/))) {
    const expr = stripTail(m[1]);
    if (!expr) return { kind: 'return', says: 'Stops here', code };
    const lastVal = expr.split(',').pop().trim();
    if (/,/.test(expr) && /^(?:err|error|e)$|^Err[A-Z]\w*$|^\w*Error$|^errors\.New\(|^fmt\.Errorf\(/.test(lastVal)) {
      const named = /^Err[A-Z]\w*$|^\w+Error$/.test(lastVal) ? `: ${lastVal}` : '';
      return { kind: 'fail', says: `Returns an error to the caller${named}`, code };
    }
    if (/^(Err|Error)\s*\(/.test(expr) || /\berrors\.New\(|fmt\.Errorf\(/.test(expr)) {
      const msg = (expr.match(/["'`]([^"'`]{1,60})["'`]/) || [])[1];
      return { kind: 'fail', says: `Returns an error${msg ? `: "${msg}"` : ''}`, code };
    }
    const chain = sayChain(expr);
    if (chain) return { kind: 'return', says: `Returns ${chain}`, code };
    if (/^\(?\s*\{/.test(expr)) {
      // Name what is in it: { org, repos, avg: x } -> "Returns org, repos, and avg".
      const keys = objectKeys(expr);
      return { kind: 'return', says: keys.length ? `Returns ${listWords(keys.map(words))}` : 'Returns an object', code, ...(keys.length ? { keys } : {}) };
    }
    if (/^\(?\s*</.test(expr)) return { kind: 'return', says: 'Returns what to show on screen', code };
    const v = sayValue(expr) || sayWhether(expr);
    return { kind: 'return', says: v ? `Returns ${v}` : 'Returns a computed value', code, ...(v ? {} : { value: clip(expr, 60) }) };
  }
  // Loops
  // Counted loops: for i := 0; i < n; i++ (Go) and for (int i = 0; i < n; i++) (C-style): "Counts i from 0 while i is less than n".
  if ((m = head.match(/^for\b\s*\(?\s*(?:(?:var|let|const|int|long|size_t|auto|\$)\s*)?\$?(\w+)\s*:?=\s*([^;]+?)\s*;\s*([^;]*?)\s*;\s*[^)]*?\)?\s*\{?\s*$/))) {
    return { kind: 'loop', says: `Counts ${words(m[1])} from ${clip(m[2], 20)}${m[3] ? ` while ${sayCodeCondition(m[3])}` : ''}${innerNote}`, code };
  }
  // A C-style loop with no counter of its own: `for (; pos < limit; i++)` / `for (;;)`.
  if ((m = head.match(/^for\s*\(\s*[^;]*;\s*([^;]*?)\s*;[^)]*\)\s*\{?\s*$/))) return { kind: 'loop', says: m[1] ? `Repeats while ${sayCodeCondition(m[1])}${innerNote}` : `Repeats${innerNote}`, code };
  // Pairs unpacked in a loop: for (const [key, value] of entries) / for key, value in items.items() / foreach ($a as $k => $v)
  if ((m = head.match(/^for\b\s*\(?\s*(?:const|let|var|val)?\s*[\[{(]?\s*([\w$]+)\s*,\s*([\w$]+)\s*[\]})]?\s+(?:of|in)\s+(.+?)\)?\s*(?:\{|:|do)?\s*$/))) {
    const src = stripTail(m[3]).replace(/\($/, '()').replace(/^Object\.entries\((.+)\)$/, '$1').replace(/\.(?:items|entries)\(\)$/, '');
    return { kind: 'loop', says: `For each ${words(m[1])} and ${words(m[2])} in ${words(src.split('.').pop())}${innerNote}`, code };
  }
  if ((m = head.match(/^for\b\s*\(?\s*(?:const|let|var|val|final|auto|[\w<>\[\],? ]+?\s)?\s*\(?([\w$, _]+?)\)?\s+(?:of|in|:)\s+(.+?)\)?\s*(?:\{|:|do)?\s*$/))) {
    return { kind: 'loop', says: `For each ${words(m[1].split(',').pop().trim())} in ${words(stripTail(m[2]).split('.').pop().replace(/\(\)$/, ''))}${innerNote}`, code };
  }
  if ((m = head.match(/^for\s+[\w, _]+\s*:=\s*range\s+(.+?)\s*\{?$/))) return { kind: 'loop', says: `For each item in ${words(stripTail(m[1]).split('.').pop())}${innerNote}`, code };
  if ((m = head.match(/^foreach\s*\(\s*(?:var\s+|\w+\s+)?(\$?\w+)\s+in\s+(.+?)\)\s*\{?$/))) return { kind: 'loop', says: `For each ${words(m[1])} in ${words(m[2].split('.').pop())}${innerNote}`, code };
  if ((m = head.match(/^foreach\s*\(\s*(.+?)\s+as\s+(?:\w+\s*=>\s*)?(\w+)\s*\)\s*\{?$/))) return { kind: 'loop', says: `For each ${words(m[2])} in ${words(m[1].split('.').pop())}${innerNote}`, code };
  if ((m = head.match(/^([\w.]+)\.each(?:_with_index)?\s+do\s*\|(\w+)/))) return { kind: 'loop', says: `For each ${words(m[2])} in ${words(m[1].split('.').pop())}${innerNote}`, code };
  if ((m = head.match(/^([\w.]+)\.(?:forEach|each|map|filter|for_each)\s*[({]/))) return { kind: 'loop', says: `For each item in ${words(m[1].split('.').pop())}${innerNote}`, code };
  if ((m = head.match(/^(?:while|until|loop)\b\s*\(?(.*?)\)?\s*(?:\{|:|do)?\s*$/))) return { kind: 'loop', says: m[1] ? `Repeats while ${sayCodeCondition(m[1])}${innerNote}` : `Repeats${innerNote}`, code };
  // Branches
  // Go: `if err := open(); err != nil` -> "If open fails"; `if v, ok := m[k]; ok` -> "If k is in m".
  if ((m = head.match(/^(?:if|else\s+if)\s+(?:[\w]+\s*,\s*)?err\s*:?=\s*([\w.]+)\(.*\);\s*err\s*!=\s*nil\s*\{?\s*$/))) return { kind: 'branch', says: `If ${lastWords(m[1])} fails${innerNote}`, code };
  if ((m = head.match(/^(?:if|else\s+if)\s+[^;{]*:=[^;{]*;\s*(.+?)\s*\{?\s*$/))) { const cond = sayCodeCondition(m[1]); return { kind: 'branch', says: `If ${cond}${innerNote}`, cond: m[1], code }; }
  if ((m = head.match(/^(?:if|elif|else\s+if|unless|when)\b\s*(.*?)\s*(?:\{|:|then)?\s*$/))) { const cond = sayCodeCondition(m[1]); return { kind: 'branch', says: `If ${/^unless\b/.test(head) ? 'not: ' : ''}${cond}${innerNote}`, cond: m[1].replace(/^\((.*)\)$/, '$1'), code, negate: /^unless\b/.test(head) }; }
  if (/^switch\s*(?:true\s*)?\{$/.test(head)) return { kind: 'branch', says: `Checks these cases in order${innerNote}`, code };
  if ((m = head.match(/^(?:switch|match|case|select)\b\s*\(?(.*?)\)?\s*(?:\{|:)?\s*$/))) return { kind: 'branch', says: `Chooses by ${words(clip(m[1], 40)) || 'value'}${innerNote}`, code };
  if (/^(?:try|begin)\b/.test(head)) return { kind: 'try', says: `Tries the next steps and handles any error${innerNote}`, code };
  if ((m = head.match(/^assert\b\s*(.*?)\s*;?$/))) return { kind: 'check', says: `Checks that ${m[1] ? sayCodeCondition(m[1].replace(/,\s*["'].*$/, '')) : 'a condition holds'}`, code };
  if ((m = head.match(/^assert(?:_\w+|That|Equals|True|False|NotNull|Null)\b/))) return { kind: 'check', says: `Checks: ${clip(head, 60)}`, code };
  if ((m = head.match(/^(?:expect|t\.(?:Error|Fatal|Errorf|Fatalf|Run)|require\.\w+|assert\.\w+)\b/))) return { kind: 'check', says: `Checks: ${clip(head, 60)}`, code };
  if ((m = head.match(/^(?:async\s+)?with\s+(.+?)\s+as\s+(.+?):\s*$/))) { const what = /^open\s*\(/.test(m[1]) ? 'a file' : words(clip(stripTail(m[1]).replace(/\(.*$/, ''), 40)); return { kind: 'set', says: `Opens ${what} as ${words(m[2].replace(/[()]/g, ''))}`, code }; }
  if ((m = head.match(/^(?:using|lock|synchronized)\s*\((.+?)\)/))) return { kind: 'set', says: `Uses ${clip(m[1], 50)}`, code };
  if (/^defer\b/.test(head)) return { kind: 'call', says: `At the end, ${clip(head.replace(/^defer\s+/, ''), 60)}`, code };
  if (/^super\b/.test(head)) return { kind: 'call', says: 'Runs the parent version first', code };
  if (/^yield\b/.test(head)) return { kind: 'call', says: 'Hands control to the given block', code };
  if ((m = head.match(/^([A-Z]\w*)(?:::\w+)*\s*\{\s*$/)) || (m = head.match(/^([A-Z]\w*)\s*\{.*\}$/))) return { kind: 'return', says: `Returns a new ${words(m[1])}`, code };
  if ((m = head.match(/^(?:[A-Z]\w*::)+([A-Z]\w*)$/))) return { kind: 'return', says: `Returns ${m[1]}`, code };
  if (/^vec!?\[/.test(head)) return { kind: 'return', says: 'Returns a list', code };
  // A bare value as a statement is an implicit return (Ruby, Rust, Kotlin/Scala expression bodies).
  if (/^(?:["'`].*["'`]|-?\d+(?:\.\d+)?|true|false|nil|null|None|self|[a-z_][\w.]*)$/.test(head) && !/^(?:else|end|break|next|redo|retry|pass)$/.test(head)) {
    const v = sayValue(head);
    return { kind: 'return', says: v ? `Returns ${v}` : 'Returns a value', code };
  }
  if ((m = head.match(/^(?:\+\+|--)?([@A-Za-z_$#][\w$#.]*)(\+\+|--)?;?$/)) && (/^(\+\+|--)/.test(head) || m[2])) return { kind: 'set', says: `${/\+\+/.test(head) ? 'Adds one to' : 'Subtracts one from'} ${targetWords(m[1].replace(/#/g, ''))}`, code };
  if ((m = head.match(/^(?:export\s+)?(?:abstract\s+)?(?:class|struct|interface|enum|record|object)\s+([A-Za-z_]\w*)/))) return { kind: 'set', says: `Defines ${words(m[1])}`, code };
  if ((m = head.match(/^(?:async\s+)?(?:function|def|fn|fun|func)\s+([A-Za-z_]\w*)/))) return { kind: 'set', says: `Defines a helper, ${words(m[1])}`, code };
  if ((m = head.match(/^(?:const|let|var|val)\s+([A-Za-z_$]\w*)\s*(?::\s*[^=]+)?=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$]\w*)\s*(?::\s*[^=]+)?=>/))) return { kind: 'set', says: `Defines a helper, ${words(m[1])}`, code };
  if ((m = head.match(/^(?:const|let|var|val)\s+([{[])\s*(.*?)\s*[}\]]\s*(?::\s*[^=]+)?=\s*(.+)$/))) {
    const names = m[2].split(',').map((x) => x.trim().split(/\s*[:=]\s*/)[0].replace(/^\.\.\./, '')).filter(Boolean).map(words);
    const value = stripTail(m[3]); const c = callee(value);
    const from = c ? lastWords(c) : (sayValue(value) || words(value.split('.').pop()));
    return { kind: 'set', says: `Takes ${names.slice(0, 4).join(', ')}${names.length > 4 ? ', …' : ''} from ${from}`, code };
  }
  if ((m = head.match(/^(?:var|const)\s*\($/))) return { kind: 'set', says: 'Declares some values', code };
  if ((m = head.match(/^var\s+([\w, ]+?)\s+[\w.*\[\]]+$/))) return { kind: 'set', says: `Declares ${m[1].split(/\s*,\s*/).map(words).join(', ')}`, code };
  // Typed declaration: Type name = value (Java, C#, C++); the value may continue on the next line.
  if ((m = head.match(/^(?:final\s+|static\s+|readonly\s+)*([A-Z][\w.]*(?:<[^=]*>)?(?:\[\])?|int|long|double|float|boolean|bool|char|byte|short|string|decimal|var|auto)\s+([a-zA-Z_$][\w$]*)\s*=(?!=)\s*(.*)$/))) {
    const value = stripTail(m[3]); const target = words(m[2]);
    const c = value ? callee(value) : null;
    const everyday = value ? sayPython(value) || sayCommon(value) : null;
    if (everyday) return { kind: 'set', says: `Sets ${target} to ${everyday}`, code };
    if (c) {
      const known = sayCall(c, firstArgs(value));
      if (known) return { kind: 'call', says: `${known}, keeping the result as ${target}`, code, callee: c };
      if (/^new\s/.test(value)) return { kind: 'set', says: `Creates a new ${c.split('.').pop()} as ${target}`, code };
      return { kind: 'set', says: `Works out ${target} from ${lastWords(c)}`, code, callee: c };
    }
    const v = value ? sayValue(value) : null;
    return { kind: 'set', says: v ? `Sets ${target} to ${v}` : `Works out ${target}`, code };
  }
  // Assignment (not comparisons)
  if ((m = head.replace(/^(?:final\s+)?(?!return\b|throw\b|yield\b|await\b|new\b)[A-Z][\w.]*(?:<[^=;]*?>)?(?:\[\])*\??\s+(?=[a-z_]\w*\s*=[^=])/, '').match(/^(?:(?:const|let|var|val|final|auto|my|local)\s+)?(?:mut\s+)?([@A-Za-z_$#][\w$#.\[\]'"@]*?(?:\s*,\s*[@A-Za-z_$#][\w$#.@]*)*)(?:\s*:\s*[\w<>\[\]?, .|]+)?\s*(:=|\+=|-=|\*=|\/=|\|\|=|\?\?=|=)(?!=)\s*(.*)$/)) && !/^(?:if|for|while|return)\b/.test(head)) {
    const target = m[1].split(/\s*,\s*/).filter((t) => t !== '_').map(targetWords).join(', ') || targetWords(m[1]);
    const value = stripTail(m[3]);
    // A yes/no value: `ok = proxy and scheme != "https"` -> "Works out ok: whether proxy and scheme is not https".
    if (m[2] === '=' && !/^(?:if|unless|match|when|case)\b/.test(value) && !/[(?]/.test(value.replace(/^\(|\)$/g, '')) && /(&&|\|\||\band\b|\bor\b|[!=]==?|(?<![-=])[<>]=?)/.test(value.replace(/->|=>/g, '.')) && !/=>/.test(value)) return { kind: 'set', says: `Works out ${target}: whether ${sayCodeCondition(value)}`, code };
    // self.max_books = max_books: the Thing keeps what it was given.
    if (m[2] === '=' && /^[A-Za-z_]\w*$/.test(value) && m[1].split('.').pop() === value && /^(self|this)\./.test(m[1])) return { kind: 'set', says: `Keeps the ${words(value)} it is given`, code };
    const chain = value ? (sayPython(value) || sayChain(value)) : null;
    if (chain) return { kind: 'set', says: `Works out ${target}: ${chain}`, code };
    const common = value ? sayCommon(m[3].trim().replace(/;$/, '')) || sayCommon(value) : null;
    if (common) return { kind: 'set', says: `Sets ${target} to ${common}`, code };
    const keyed = m[2] === '=' && m[1].match(/^([\w$.]+)\[\s*([^\]]+?)\s*\]$/);
    if (keyed) return { kind: 'set', says: `Records ${words(keyed[2].replace(/["'`]/g, ''))} in ${targetWords(keyed[1])}`, code };
    const c = callee(value);
    if (c) {
      const known = sayCall(c, firstArgs(value));
      if (known) return { kind: 'call', says: `${known}, keeping the result as ${target}`, code, callee: c };
      if (/^new\s/.test(value)) return { kind: 'set', says: `Creates a new ${c.split('.').pop()} as ${target}`, code };
      return { kind: 'set', says: `Works out ${target} from ${lastWords(c)}`, code, callee: c };
    }
    if (!value) return { kind: 'set', says: `Works out ${target}`, code };
    if (m[2] === '+=' || m[2] === '-=') { const what = /^[\w.]+$/.test(value) ? `${value.split('.').filter((p) => !/^(self|this)$/.test(p)).slice(-2).map(words).join(' ')} ` : /^-?\d+(\.\d+)?$/.test(value) ? `${value} ` : ''; return { kind: 'set', says: what ? `${m[2] === '+=' ? 'Adds' : 'Subtracts'} ${what}${m[2] === '+=' ? 'to' : 'from'} ${target}` : `${m[2] === '+=' ? 'Adds to' : 'Subtracts from'} ${target}`, code }; }
    const v = sayValue(value);
    return { kind: 'set', says: v ? `Sets ${target} to ${v}` : `Works out ${target}`, code };
  }
  // Calls
  if ((m = head.match(/^([\w$.]+)\.(?:set|Set|put|setdefault|Add)\(\s*["'`]([\w.\-: ]{1,40})["'`]\s*,/))) return { kind: 'call', says: `Sets "${m[2]}" on ${lastSeg(m[1])}`, code, callee: `${m[1]}.set` };
  if ((m = head.match(/^([\w$.]+)\.(?:remove|Remove|discard|delete|pop)\(\s*([\w$]+)\s*\)/)) && !/^(?:db|session|repo|conn|cursor)\b/.test(m[1])) {
    const owner = m[1].split('.').filter((p) => !/^(self|this)$/.test(p));
    const where = owner.length > 1 ? `${words(owner[owner.length - 2])}'s ${words(owner[owner.length - 1])}` : words(owner[0] || m[1]);
    return { kind: 'call', says: `Removes ${words(m[2])} from ${where}`, code, callee: m[1] };
  }
  if ((m = head.match(/^([\w$.]+)\.(?:append|push|add|Add|insert|appendleft|extend)\(\s*([\w$.]*)\s*\)?/)) && !/^(?:db|session|repo|conn|cursor)\b/.test(m[1])) {
    // "student.books.append(book)" -> "Adds book to student's books"
    const owner = m[1].split('.').filter((p) => !/^(self|this)$/.test(p));
    const where = owner.length > 1 ? `${words(owner[owner.length - 2])}'s ${words(owner[owner.length - 1])}` : words(owner[0] || m[1]);
    const added = /^new\s+([A-Z]\w*)/.exec(head.slice(head.indexOf('(') + 1))?.[1];
    return { kind: 'call', says: added ? `Adds a new ${words(added)} to ${where}` : m[2] && /^[A-Za-z_][\w$]*$/.test(m[2]) && m[2] !== 'new' ? `Adds ${words(m[2])} to ${where}` : `Adds to ${where}`, code, callee: m[1] };
  }
  const c = callee(head);
  if (c) {
    const known = sayCall(c, firstArgs(head));
    return { kind: 'call', says: known || `Calls ${lastWords(c)}`, code, callee: c };
  }
  if ((m = head.match(/^([a-z_][\w.]*[?!]?)\s+(?![=<>!+\-*/%]|and\b|or\b|if\b|unless\b)(.+)$/)) && !/^(?:if|for|while|return|else|elsif|when|case|def|class|module|end|not|const|let|var|val|new|await|typeof|delete|void|in|of|throw|import|export|from|as|is)$/.test(m[1])) {
    if (/^assert/.test(m[1])) return { kind: 'check', says: `Checks: ${clip(head, 60)}`, code };
    const known = sayCall(m[1], m[2]);
    const named = /^[:'"]([\w ]+)['"]?/.exec(m[2].trim())?.[1];
    return { kind: 'call', says: known || (named ? `Calls ${lastWords(m[1])}: ${words(named)}` : `Calls ${lastWords(m[1])}`), code, callee: m[1] };
  }
  return { kind: 'other', says: clip(head, 70), code };
}

/** Steps for a function body. `statements` are top-level [{ text, line, inner? }]. */
const spanOf = (s) => ({ startLine: s.line, endLine: s.endLine ?? s.line, ...(s.start != null && s.end != null ? { start: s.start, end: s.end } : {}) });

const BARE_CALL = /^[a-z_][\w.]*[?!]?$/;
const bracketsClosed = (x) => { let d = 0; for (const ch of x) { if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) d--; } return d === 0; };
const balanced = (x) => { let d = 0; for (const ch of x) { if (ch === '(') d++; else if (ch === ')' && --d < 0) return false; } return d === 0; };
function asCall(list, i) {
  const st = list[i];
  if (st?.kind === 'return' && BARE_CALL.test(st.code || '') && !/^(?:self|nil|true|false|null|none)$/i.test(st.code)) {
    list[i] = { ...st, kind: 'call', says: `Calls ${lastWords(st.code)}`, callee: st.code };
  }
}

const CLAUSE = /^(?:elif\b|elsif\b|else\s+if\b|else\b|except\b|catch\b|rescue\b|finally\b|ensure\b)/;

/** Turn a clause (else, elif, except, catch, finally) into what it means for the step it belongs to. */
function attachClause(step, clause) {
  const kw = clause.kind;
  const kids = stepsFrom(clause.children || []).steps;
  // Chains: the next clause belongs to the innermost else-if.
  let target = step;
  while (target.otherwise?.length === 1 && target.otherwise[0].elseIf) target = target.otherwise[0];
  if (kw === 'elif') {
    const head = clause.head.replace(/^(?:elif|elsif|else\s+if)\b/, 'if');
    const branch = { ...classifyStatement(head), line: clause.line, span: { startLine: clause.line, endLine: clause.endLine ?? clause.line }, elseIf: true };
    if (kids.length) branch.children = kids;
    target.otherwise = [branch];
  } else if (kw === 'else') {
    target.otherwise = kids;
    target.otherwiseLine = clause.line;
  } else if (kw === 'catch') {
    const what = (clause.head.replace(/\\/g, '.').replace(/\(\s*\./, '(').match(/^(?:except|catch|rescue)\s*\(?\s*(?:[\w.]+\s+)?\(?\.?([A-Z][\w.:]*(?:\s*[,|]\s*\.?[A-Z][\w.:]*)*)/) || [])[1]?.replace(/::/g, '.');
    (step.handlers ||= []).push({ says: what ? `If ${what.split(/\s*[,|]\s*/).map((x) => x.split('.').pop()).join(' or ')} goes wrong` : 'If anything goes wrong', line: clause.line, steps: kids });
  } else if (kw === 'finally') {
    // Code that always runs at the end is never the value given back.
    for (let i = 0; i < kids.length; i++) asCall(kids, i);
    step.always = { line: clause.line, steps: kids };
  }
}

// ── Functions inside functions, values chosen by if / match / when, Go select ──────────────────────────────────

/** "a", "a or b", "a, b or c", "a, b, c or 2 other values" — names a reader can follow. */
function orList(names) {
  const n = [...new Set(names)];
  if (n.length <= 3) return n.length > 1 ? `${n.slice(0, -1).join(', ')} or ${n[n.length - 1]}` : n[0] || '';
  return `${n.slice(0, 3).join(', ')} or ${n.length - 3} other value${n.length - 3 === 1 ? '' : 's'}`;
}
/** The watched values after a hook's function: ", [a, b])" -> ['a', 'b']; ")" -> null (none); anything else -> 'unknown'. */
function depsOf(after) {
  const a = String(after || '');
  if (/^\s*\)/.test(a)) return null;
  const m = a.match(/^\s*,\s*\[([^\]]*)\]/);
  if (!m) return 'unknown';
  return m[1].split(',').map((x) => x.trim().replace(/\?\./g, '.').replace(/\(\)$/, '')).filter(Boolean).map((x) => words(x.split('.').pop()));
}
const changesWords = (deps) => `${orList(deps)} ${deps.length > 3 ? 'change' : 'changes'}`;
function effectSays(deps) {
  if (deps === null) return 'Every time this is drawn on screen';
  if (deps === 'unknown') return 'When this first shows on screen, and whenever what it watches changes';
  if (!deps.length) return 'When this first shows on screen';
  return `When this first shows on screen, and whenever ${changesWords(deps)}`;
}
const HOOK = /^(?:(?:const|let|var)\s+([\w$]+)(?:\s*:[^=]+?)?\s*=\s*)?(?:React\.)?(use[A-Z]\w*)\s*(?:<[^(]*?>)?\(/;
const TRAILING_LAMBDA = /^(?:(?:val|var)\s+[\w$]+(?:\s*:[^=]+)?\s*=\s*)?([a-z_$][\w$]*(?:\??\.[\w$]+)*)\s*(\([^{}]*\))?\s*\{\s*(?:\(?[\w$, ]+\)?\s*->)?\s*$/;
const RUBY_DO = /^(?:[@$]?[\w]+\s*=\s*)?([a-z_][\w.?!]*)(?:\(.*\)|\s+[^|]*?)?\s+do\s*(?:\|[^|]*\|)?\s*$/;
const NOT_A_CALL = /^(?:if|else|for|while|when|return|object|init|companion|class|interface|fun|try|catch|finally|do|loop|unsafe|match|switch|select|synchronized|lock|using|get|set)$/;

/** A promise's callback: `load(x).then((r) => {` -> "When load is done"; `.catch(` -> "If load goes wrong". */
function thenSays(text) {
  const m = String(text).match(/^(?:await\s+)?([^{};\n]*?)\.(then|catch)\(\s*(?:async\s+)?(?:function\b|\(|[\w$]+\s*=>)/);
  if (!m) return null;
  const recvText = m[1].trim().replace(/^\(\s*([\w$.]+)\s+as\s+[^()]*\)$/, '$1');
  const recv = recvText.match(/^([\w$.]+)\(.*\)$/s) || recvText.match(/^([\w$.]+)$/);
  const what = recv ? lastWords(recv[1]) : 'that';
  return m[2] === 'then' ? `When ${what} is done` : `If ${what} goes wrong`;
}

/** A function inside a function, read with its own steps. Null when the statement is not one. */
function nestedStep(s, base) {
  const text = String(s.text || '').trim();
  const head = text.split('\n')[0].trim();
  const kids = () => stepsFrom(s.children || []).steps;
  const own = (step, children) => (children.length ? { ...step, children, nested: true } : step);
  let m;
  // React hooks: what the function is for, and when it runs.
  if (s.fn && s.fn.depth === 1 && (m = text.match(HOOK))) {
    const [, name, hook] = m;
    const deps = depsOf(s.fn.after);
    if (/^use\w*Effect$/.test(hook)) {
      for (const c of s.children || []) if (c.fn && /^return\b/.test(c.text.trim())) c.cleanup = deps && deps !== 'unknown' && !deps.length ? 'When this is taken off the screen, cleans up' : 'Cleans up before it runs again, and when this is taken off the screen';
      return own({ kind: 'call', says: effectSays(deps), code: base.code, callee: hook }, kids());
    }
    if (hook === 'useMemo' && name) {
      let children = kids();
      if (s.fn.expr && children.length === 1) { const v = classifyStatement(`return ${s.children[0].text}`); children = [{ ...children[0], kind: v.kind, says: v.says }]; }
      const says = deps === null ? `Works out ${words(name)}` : Array.isArray(deps) && !deps.length ? `Works out ${words(name)} once and remembers it` : Array.isArray(deps) ? `Works out ${words(name)} and remembers it until ${changesWords(deps)}` : `Works out ${words(name)} and remembers it until what it watches changes`;
      return own({ kind: 'set', says, code: base.code, callee: hook }, children);
    }
    if (/^use\w*Callback$/.test(hook) && name) return own({ kind: 'set', says: `Defines how ${words(name)} works`, code: base.code, callee: hook }, kids());
  }
  // The function an effect gives back is what cleans up after it.
  if (s.cleanup) return own({ kind: 'call', says: s.cleanup, code: base.code }, kids());
  if (s.fn && !s.fn.expr) {
    if (s.fn.depth === 0 && /^go\s+func\b/.test(head)) return own({ kind: 'call', says: 'Starts these steps running alongside, without waiting for them', code: base.code }, kids());
    if (s.fn.depth === 0 && /^defer\s+func\b/.test(head)) return own({ kind: 'call', says: 'At the end, runs these steps', code: base.code }, kids());
    if (/^return\b/.test(head) || base.kind === 'return' || base.kind === 'other' || base.kind === 'branch' || base.kind === 'fail') return null;
    if (base.kind === 'loop') return null; // forEach and friends already read their body as a loop
    let said = base.says;
    if (base.kind !== 'call') { /* a value worked out with a function's help keeps its own wording */ }
    else if ((m = text.match(/^(?:window\.|globalThis\.)?(setTimeout|setInterval)\(/))) {
      const ms = (s.fn.after.match(/^\s*,\s*(\d+)\s*\)/) || [])[1];
      said = m[1] === 'setTimeout' ? (ms ? `After ${ms} milliseconds` : 'After a wait') : (ms ? `Every ${ms} milliseconds` : 'Again and again, with a wait in between');
    } else if ((m = text.match(/\.(addEventListener|on|once)\(\s*['"`]([\w:.-]+)['"`]\s*,/))) {
      said = m[1] === 'once' ? `The first time "${m[2]}" happens` : `Whenever "${m[2]}" happens`;
    } else if (thenSays(text)) {
      said = thenSays(text);
    } else if (/^Calls [\w ]+$/.test(said)) said = `${said} with these steps`;
    return own({ ...base, kind: base.kind === 'set' ? 'set' : 'call', says: said }, kids());
  }
  if (!s.children?.length) return null;
  // Kotlin trailing lambdas: `user?.let { … }` runs only when user is set; `scope.launch { … }` hands over steps.
  const raw = String(s.text || '').split('\n')[0].trim();
  if (!s.fn && !BLOCK_HEAD.test(raw) && (m = raw.match(TRAILING_LAMBDA)) && !NOT_A_CALL.test(m[1])) {
    const safe = m[1].match(/^(.+?)\?\.(?:let|also|run|apply)$/);
    if (safe) return own({ kind: 'branch', says: `If ${words(safe[1].split(/\??\./).pop())} is set`, code: clip(raw, 90) }, kids());
    if ((m = raw.match(/^repeat\s*\(\s*(.+?)\s*\)\s*\{/))) return own({ kind: 'loop', says: `Repeats ${/^\d+$/.test(m[1]) ? m[1] : words(m[1])} times`, code: base.code }, kids());
    if (base.kind === 'loop') return null;
    if (base.kind === 'call' && /^Calls [\w ]+$/.test(base.says)) return own({ ...base, says: `${base.says} with these steps` }, kids());
    if (base.kind === 'set' || base.kind === 'call') return own(base, kids());
    return null;
  }
  // Ruby blocks: `transaction do … end`.
  if ((m = raw.match(RUBY_DO)) && base.kind !== 'loop' && !/^(?:if|unless|while|until|for|case|begin)\b/.test(raw)) {
    if (base.kind === 'call' && /^Calls [\w ]+$/.test(base.says)) return own({ ...base, says: `${base.says.replace(/: .*$/, '')} with these steps` }, kids());
    if (base.kind === 'call' || base.kind === 'set') return own(base, kids());
  }
  return null;
}

/** "if", "match", "when", "case" or "switch" giving a value to a name (or to the caller): [target | null, rest]. */
function valueChoice(s) {
  const head = headLine(s.text || '');
  let m = head.match(/^(?:(?:const|let|var|val|my)\s+(?:mut\s+)?)?([@$]?[\w$.]+)(?:\s*:\s*[^=]+?)?\s*=\s*((?:if|unless|match|when|case)\b.*|[\w.]+\s+switch\s*\{\s*)$/);
  if (m && !/^(?:if|for|while|return)$/.test(m[1])) return { target: targetWords(m[1]), rest: m[2] };
  if ((m = head.match(/^return\s+((?:if|match|when)\b.*|[\w.]+\s+switch\s*\{\s*)$/))) return { target: null, rest: m[1] };
  return null;
}
/** The subject of a match / when / switch: "match cmd {" -> "cmd"; "when {" -> null. */
function armsSubject(rest) {
  const r = rest.replace(/\{\s*$/, '').trim();
  const m = (r.match(/^match\s*\((.+)\)$/) || r.match(/^match\s+(.+)$/)) || r.match(/^when\s*\((.+)\)$/) || r.match(/^([\w.]+)\s+switch$/);
  return m ? m[1].trim() : null;
}
/** One arm's pattern in words: `0..=49` -> "from 0 to 49", `Cmd::Start | Cmd::Go` -> "start or go", `_` -> otherwise. */
function armSays(pattern) {
  let p = String(pattern).trim();
  if (/^(?:_|else|default)$/.test(p)) return 'Otherwise';
  let guard = null;
  const g = p.match(/^(.+?)\s+(?:if|when)\s+(.+)$/);
  if (g) { p = g[1]; guard = g[2]; }
  if (LOGIC.test(p) && !/^(?:!?in|!?is)\s/.test(p) && !/\.\./.test(p) && !/\|/.test(p.replace(/\|\|/g, ''))) return `When ${sayCodeCondition(p)}`;
  const parts = [];
  let depth = 0, from = 0;
  for (let i = 0; i <= p.length; i++) {
    const c = p[i];
    if (c === '(' || c === '[' || c === '{') depth++; else if (c === ')' || c === ']' || c === '}') depth--;
    if (i === p.length || (depth === 0 && ((c === '|' && p[i + 1] !== '|' && p[i - 1] !== '|') || c === ','))) { parts.push(p.slice(from, i).trim()); from = i + 1; }
  }
  const one = (x) => {
    let m;
    if ((m = x.match(/^(!?)in\s+(.+?)\.\.(=?)(.+)$/)) || (m = x.match(/^()(-?[\w.]+)\.\.(=)(-?[\w.]+)$/))) return `${m[1] ? 'not ' : ''}from ${m[2].trim()} to ${m[4].trim()}`;
    if ((m = x.match(/^(!?)is\s+([\w.<>?]+)$/))) return `${m[1] ? 'not ' : ''}a ${m[2].split('.').pop()}`;
    if ((m = x.match(/^(?:[A-Z]\w*(?:::|\.))+([A-Z]\w*)$/))) return words(m[1]);
    if (/^[A-Z][A-Z0-9_]+$/.test(x)) return words(x);
    return x;
  };
  return `When it is ${orList(parts.filter(Boolean).map(one))}${guard ? `, and ${sayCodeCondition(guard)}` : ''}`;
}
/** The last thing each side of a value choice works out becomes "Sets <target> to …" (or "Returns …" for a return). */
function giveValue(list, target) {
  if (!list?.length) return;
  if (list.some((x) => x.caseLabel)) { for (const x of list) if (x.caseLabel) giveValue(x.children, target); return; }
  const i = list.length - 1;
  const last = list[i];
  if (last.kind === 'branch' && !Object.hasOwn(last, 'valueOf')) { giveValue(last.children, target); giveValue(last.otherwise, target); return; }
  if (last.kind === 'fail' || /^(?:return|break|continue|throw|raise)\b/.test(last.code || '')) return;
  const v = classifyStatement(`return ${String(last.code || '').replace(/,$/, '')}`);
  if (v.kind !== 'return') return;
  const said = v.says.replace(/^Returns /, '');
  list[i] = target ? { ...last, kind: 'set', says: v.value ? `Sets ${target} to a computed value` : `Sets ${target} to ${said}` } : { ...last, kind: 'return', says: v.says };
  delete list[i].callee;
  if (list[i].says && restates(list[i])) list[i].restates = true; else delete list[i].restates;
}

/** Go `select`: which channel is ready first. "case msg := <-ch:" -> "When msg arrives from ch". */
function selectCaseSays(code) {
  const c = String(code).trim();
  if (/^default\s*:/.test(c)) return 'If none is ready yet';
  let m = c.match(/^case\s+(?:([\w$]+)(?:\s*,\s*([\w$]+))?\s*:?=\s*)?<-\s*(.+?)\s*:\s*$/);
  if (m) {
    const [, name, ok, ch] = m;
    let d;
    if (/\.Done\(\)$/.test(ch)) return `When ${lastWords(ch.replace(/\.Done\(\)$/, ''))} is cancelled or times out`;
    if ((d = ch.match(/^time\.After\((.+)\)$/))) {
      const t = d[1].trim();
      const u = t.match(/^(\d+)\s*\*\s*time\.(Millisecond|Second|Minute|Hour)$/) || t.match(/^time\.(Millisecond|Second|Minute|Hour)$/);
      const dur = u ? (u.length === 3 ? `${u[1]} ${u[2].toLowerCase()}${u[1] === '1' ? '' : 's'}` : `1 ${u[1].toLowerCase()}`) : words(t.split('.').pop());
      return `When ${dur} ${/s$/.test(dur) && !/^1 /.test(dur) ? 'have' : 'has'} passed`;
    }
    if (/\.C$/.test(ch)) return `When ${lastWords(ch.replace(/\.C$/, ''))} ticks`;
    const from = lastWords(ch.replace(/\(\)$/, ''));
    return name && name !== '_' ? `When ${words(name)} arrives from ${from}${ok ? ` (or ${from} is closed)` : ''}` : `When something arrives from ${from}`;
  }
  if ((m = c.match(/^case\s+(.+?)\s*<-\s*(.+?)\s*:\s*$/))) return `When ${words(m[2].split('.').pop())} can be sent to ${lastWords(m[1])}`;
  return null;
}

export function stepsFrom(statements) {
  const steps = [];
  const skipped = [];
  // After a clause written without its own block (Ruby: a method-level `rescue` or `ensure`), the statements that
  // follow belong to that clause until the next clause.
  let into = null, intoAlways = false;
  for (const s of statements) {
    const t0 = (s.text || '').trim();
    // An arm of a match / when: "When it is …", with what that arm does inside it (`else ->` is an arm, not a clause).
    if (s.arm != null) {
      const arm = { kind: 'check', says: armSays(s.arm), code: clip(t0.split('\n')[0].trim(), 90), caseLabel: true, line: s.line, span: spanOf(s) };
      const kids = stepsFrom(s.children || []).steps;
      if (kids.length) arm.children = kids;
      steps.push(arm);
      continue;
    }
    if (into && !CLAUSE.test(t0) && t0 && !/^(?:end\b|#)/.test(t0)) {
      const st = stepsFrom([s]).steps;
      into.push(...st);
      // Earlier lines of a handler are calls; nothing in `ensure` is the value given back.
      for (let i = 0; i < into.length - (intoAlways ? 0 : 1); i++) asCall(into, i);
      continue;
    }
    // A clause belongs to the step before it (indent languages write it as a sibling line).
    if (CLAUSE.test(t0)) {
      const prev = steps[steps.length - 1];
      if (/^(?:rescue|ensure|except|finally)\b/.test(t0) && steps.length && !(prev && prev.kind === 'try')) {
        // Ruby: `def x ... rescue ... end` with no `begin`: everything before the rescue is what is tried.
        const tried = steps.splice(0, steps.length);
        for (let i = 0; i < tried.length - 1; i++) asCall(tried, i);
        steps.push({ kind: 'try', says: 'Tries these steps and handles any error', code: '(the whole method)', line: tried[0].line, span: { startLine: tried[0].span.startLine, endLine: tried[tried.length - 1].span.endLine }, children: tried });
      }
      const prev2 = steps[steps.length - 1];
      if (prev2 && (prev2.kind === 'branch' || prev2.kind === 'try')) {
        const prev = prev2;
        const kw = /^(?:elif|elsif|else\s+if)\b/.test(t0) ? 'elif' : /^else\b/.test(t0) ? 'else' : /^(?:finally|ensure)\b/.test(t0) ? 'finally' : 'catch';
        const inlineElse = kw === 'else' && t0.match(/^else\s+(?!if\b)([^{:\s].*)$/);
        const clauseKids = inlineElse ? [{ text: inlineElse[1], line: s.line, endLine: s.line }, ...(s.children || [])] : s.children || [];
        attachClause(prev, { kind: kw, head: t0.replace(/:\s*$/, ''), line: s.line, endLine: s.endLine, children: clauseKids });
        intoAlways = kw === 'finally';
        into = s.children?.length ? null : kw === 'catch' ? prev.handlers?.[prev.handlers.length - 1]?.steps ?? null : kw === 'finally' ? prev.always?.steps ?? null : null;
        prev.span = { ...prev.span, endLine: Math.max(prev.span.endLine, s.endLine ?? s.line) };
        continue;
      }
      skipped.push(spanOf(s));
      continue;
    }
    if (!t0 || /^(?:end\b|\}|pass$|break;?$|continue;?$|#)/.test(t0)) { if (t0 && !/^#/.test(t0)) skipped.push(spanOf(s)); continue; }
    if (/^(?:"""|'''|r"""|\/\*\*|\*)/.test(t0)) { skipped.push(spanOf(s)); continue; } // docstrings and doc comments
    if (/^[)\]}]+[):;,]*$/.test(t0) || /^\.\.\.$/.test(t0) || /^\.[A-Za-z_]/.test(t0) || /^@\w+(?:\(.*\))?$/.test(t0) || /^#?\[[\w:]+(?:\(.*\))?\]$/.test(t0) || /^:(?:param|rtype|return|raises|type)\b/.test(t0)) { skipped.push(spanOf(s)); continue; }
    const head0 = headLine(s.text);
    // A bare block `{ … }` (a case's own scope) adds nothing to read: its statements are read in its place.
    if (/^\{/.test(t0) && s.children?.length) { steps.push(...stepsFrom(s.children).steps); continue; }
    const choice = s.children?.length || s.clauses || s.arms ? valueChoice(s) : null;
    if (s.arms) {
      const subject = armsSubject(choice ? choice.rest : head0);
      const kids = stepsFrom(s.children || []).steps;
      const chooser = { kind: 'branch', says: subject ? `Chooses by ${words(clip(subject, 40))}` : 'Checks these cases in order', code: clip(head0, 90), line: s.line, span: spanOf(s), ...(kids.length ? { children: kids } : {}), ...(choice ? { valueOf: choice.target } : {}) };
      steps.push(chooser);
      continue;
    }
    let step = { ...classifyStatement(s.text, { inner: s.inner || 0 }), line: s.line, span: spanOf(s) };
    // `val label = if (user == null) { … } else { … }` over several lines reads as the question it asks, each side
    // ending in "Sets label to …".
    if (choice && /^(?:if|unless|case)\b/.test(choice.rest) && (s.endLine ?? s.line) > s.line) {
      step = { ...classifyStatement(choice.rest, { inner: s.inner || 0 }), code: step.code, line: s.line, span: spanOf(s), valueOf: choice.target };
    } else {
      const nest = nestedStep(s, step);
      // `return new Promise((resolve) => { … })`, `return load().then((x) => { … })`: the function's steps, then the return.
      if (!nest && step.kind === 'return' && s.fn && !s.fn.expr && s.fn.depth >= 1 && s.children?.length) {
        const kids = stepsFrom(s.children).steps;
        if (kids.length) {
          let m;
          const body = s.text.trim().replace(/^return\s+/, '');
          const said = (m = body.match(/^new\s+([A-Z]\w*)/)) ? `Makes a new ${m[1]} with these steps`
            : thenSays(body) ? thenSays(body)
            : callee(body) ? `Calls ${lastWords(callee(body))} with these steps` : null;
          if (said) steps.push({ kind: 'call', says: said, code: step.code, line: s.line, span: spanOf(s), children: kids, nested: true });
        }
      }
      if (nest) {
        step = { ...nest, line: s.line, span: spanOf(s) };
        for (const c of s.clauses || []) attachClause(step, c);
        steps.push(step);
        continue;
      }
    }
    // A one-line `if (x) return reply.code(400).send({ error: 'bad' })` is one statement: its braces belong to the
    // object being sent, not to a block, so read the statement after the condition instead of the braces' inside.
    if (step.inline && !/^\{/.test(step.inline.trim())) { const kid = classifyStatement(step.inline); step.children = [{ ...kid, line: s.line, span: spanOf(s) }]; delete step.inline; }
    else if (s.children?.length && (['branch', 'loop', 'try'].includes(step.kind) || (step.kind === 'check' && step.caseLabel) || /^(?:Defines a helper|Defines how|Opens |Uses )/.test(step.says))) {
      const kids = stepsFrom(s.children).steps;
      if (kids.length) { step.children = kids; step.says = step.says.replace(/ \(\d+ steps? inside\)$/, ''); if (/^Defines/.test(step.says)) step.nested = true; }
      // Go select: whichever channel is ready first (or, with a default, whichever is ready now).
      if (/^select\s*\{/.test(head0) && step.children) {
        for (const k of step.children) if (k.caseLabel) k.says = selectCaseSays(k.code) ?? k.says;
        step.says = step.children.some((k) => /^default\b/.test(k.code || '')) ? 'Checks which of these is ready, without waiting' : 'Waits for whichever of these is ready first';
      }
    }
    if (step.inline && !step.children) { const kid = classifyStatement(step.inline); step.children = [{ ...kid, line: s.line, span: spanOf(s) }]; delete step.inline; }
    else delete step.inline;
    // An else belongs to a question; on a value already said in one line (`let x = if a { 1 } else { 2 }`) it is part of it.
    if (step.kind === 'branch' || step.kind === 'try') for (const c of s.clauses || []) attachClause(step, c);
    steps.push(step);
  }
  // A bare word is only a returned value when it is the last statement; before that it is a call (Ruby: `rollback`).
  for (let i = 0; i < steps.length - 1; i++) asCall(steps, i);
  // A value chosen by if / match / when: each side's last value is what the name is set to (or what is returned).
  for (const st of steps) if (Object.hasOwn(st, 'valueOf')) { const t = st.valueOf; delete st.valueOf; giveValue(st.children, t); giveValue(st.otherwise, t); }
  // Every step is kept (anchoring needs all of them); `more` tells a view how many to fold away.
  const more = Math.max(0, steps.length - MAX_STEPS);
  for (const st of steps) if (restates(st)) st.restates = true;
  return { steps, more, skipped, readable: readableShare(steps) };
}

/**
 * A step that only puts the code's syntax into English ("Works out actives", "Returns the result of any") tells a
 * reader nothing the code did not. It is kept, but marked `restates` and not counted as read.
 */
const GENERIC_CALLS = /^(?:get|set|run|do|call|apply|handle|process|execute|exec|make|build|create|new|init|load|fetch|parse|convert|to|from|str|int|float|bool|list|dict|set|tuple|len|any|all|map|filter|next|iter|super|format|join|split|strip|copy|update|value|values|items|keys)$/;
function restates(st) {
  const s = st.says || '';
  if (st.kind === 'other') return false;
  if (/^Works out [^:]+$/.test(s) && !/ from | remembers it/.test(s)) return true;
  const same = s.match(/^Works out (.+) from (.+)$/);
  if (same && same[1].trim() === same[2].trim()) return true; // "Works out licence from licence"
  if (/^(Returns a computed value|Returns a value|Sets .+ to a computed value)$/.test(s)) return true;
  const via = s.match(/(?:the result of|from|^Calls) ([\w ]+?)$/);
  if (via && GENERIC_CALLS.test(via[1].trim())) return true;
  return false;
}
const readableShare = (steps) => steps.length ? steps.filter((x) => x.kind !== 'other' && !x.restates).length / steps.length : 0;

const blockEnd = (text, open) => {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') { for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++; continue; }
    if (c === '{') depth++; else if (c === '}' && --depth === 0) return i;
  }
  return -1;
};

/** A statement's first line, joined with the next when it ends in a dangling `=` (`valid =\n  when (x) {`). */
const headLine = (text) => String(text).trim().replace(/^([^\n]*?=)[ \t]*\r?\n\s*/, '$1 ').split('\n')[0].trim();
const skipQuoted = (text, i) => { const q = text[i]; for (i++; i < text.length && text[i] !== q; i++) if (text[i] === '\\') i++; return i; };
/** Statements whose first brace is their own block (never a function written inside them). */
const BLOCK_HEAD = /^(?:if|else|for|foreach|while|until|switch|try|catch|finally|do|match|loop|unsafe|select|using|lock|synchronized|when|case|default|elif|with|class|struct|interface|enum|impl|fn|fun|func|def)\b/;

/**
 * The first function written inside a statement, outside any object literal: an arrow `(x) => {` or `x => expr`, a
 * `function (x) {`, a Go `func(x) T {`, a Java lambda in a call `x -> {`, a Rust closure `|x| {`.
 * Gives { open, close, depth } for a body in braces or { expr: [from, to], depth } for an expression body, where
 * depth is how many brackets it sits inside (0: the statement itself is the function, `go func() {…}()`). Null when
 * there is none. Linear in the statement's length.
 */
export function fnLiteral(text) {
  let depth = 0;
  const bodyAt = (j, d) => {
    while (j < text.length && /\s/.test(text[j])) j++;
    if (text[j] !== '{') return null;
    const close = blockEnd(text, j);
    return close < 0 ? null : { open: j, close, depth: d };
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') { i = skipQuoted(text, i); continue; }
    if (c === '(' || c === '[') { depth++; continue; }
    if (c === ')' || c === ']') { depth--; continue; }
    // Object literals, destructured parameters, struct literals: not functions; read past them.
    if (c === '{') { const e = blockEnd(text, i); if (e < 0) return null; i = e; continue; }
    if (c === '=' && text[i + 1] === '>') {
      const before = text.slice(Math.max(0, i - 80), i).trimEnd();
      // A lambda's parameters come right before its arrow: `(a, b) =>`, `x =>`, `async () =>` (not PHP `'key' =>`).
      if (!/(?:\)|[A-Za-z_$][\w$]*)(?:\s*:\s*[^=()]+)?$/.test(before) || /["']$/.test(before)) { i++; continue; }
      const body = bodyAt(i + 2, depth);
      if (body) return body;
      if (depth < 1) { i++; continue; }
      // Expression body: up to the next comma or closing bracket at the arrow's own depth.
      let j = i + 2, d = 0;
      for (; j < text.length; j++) {
        const ch = text[j];
        if (ch === '"' || ch === "'" || ch === '`') { j = skipQuoted(text, j); continue; }
        if (ch === '(' || ch === '[' || ch === '{') d++;
        else if (ch === ')' || ch === ']' || ch === '}') { if (--d < 0) break; }
        else if (ch === ',' && d === 0) break;
      }
      return { expr: [i + 2, j], depth };
    }
    if (c === '-' && text[i + 1] === '>' && depth >= 1) { const body = bodyAt(i + 2, depth); if (body) return body; i++; continue; }
    if ((c === 'f' && /\b(?:function|func)\b/y.test(text.slice(i, i + 9)) && !/[\w$.]/.test(text[i - 1] || ''))) {
      const m = text.slice(i, i + 120).match(/^(?:function\s*\*?\s*[\w$]*|func)\s*\(/);
      if (!m) continue;
      let p = i + m[0].length - 1, pd = 0;
      for (; p < text.length; p++) { if (text[p] === '(') pd++; else if (text[p] === ')' && --pd === 0) break; }
      // PHP `use (...)`, a return type (`: string`, Go `(int, error)` or `bool`), skipping Go `interface{}`/`struct{}`.
      let j = p + 1;
      const use = text.slice(j, j + 24).match(/^\s*use\s*\(/);
      if (use) { j += use[0].length - 1; for (let ud = 0; j < text.length; j++) { if (text[j] === '(') ud++; else if (text[j] === ')' && --ud === 0) { j++; break; } } }
      for (; j < text.length && j < p + 200; j++) {
        if (text[j] === '{') { if (/(?:interface|struct)\s*$/.test(text.slice(Math.max(0, j - 12), j))) { j = blockEnd(text, j); continue; } break; }
        if (text[j] === '\n' && /^\s*$/.test(text.slice(p + 1, j))) break;
      }
      const body = text[j] === '{' ? bodyAt(j, depth) : null;
      if (body) return body;
      continue;
    }
    if (c === '|' && depth >= 1 && /[(,]\s*(?:move\s+)?$/.test(text.slice(Math.max(0, i - 8), i))) {
      const m = text.slice(i, i + 200).match(/^\|[^|]*\|\s*(?:->\s*[\w<>&' ]+?\s*)?(?=\{)/);
      if (m) { const body = bodyAt(i + m[0].length, depth); if (body) return body; }
    }
  }
  return null;
}

/** The text of a statement's own lambda parameters at the start of a Kotlin block: `{ item ->` gives "item ->". */
const LAMBDA_PARAMS = /^\s*(?:\(?[\w$]+(?:\s*:\s*[\w<>?.]+)?(?:\s*,\s*[\w$]+(?:\s*:\s*[\w<>?.]+)?)*\)?|_)\s*->(?![^\n]*->)/;

/**
 * The arms of a Rust `match`, a Kotlin `when` or a C# `switch` expression: `pattern => value,` / `pattern -> value`.
 * Gives [{ pattern, body, bodyAt, at, end }] (offsets into `body`), or null when the block is not a list of arms.
 */
export function armsOf(body) {
  const arms = [];
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /[\s,;]/.test(body[i])) i++;
    if (i >= body.length) break;
    const at = i;
    let depth = 0, arrow = -1, end = -1;
    for (; i < body.length; i++) {
      const c = body[i];
      if (c === '"' || c === "'" || c === '`') { i = skipQuoted(body, i); continue; }
      if (c === '(' || c === '[' || c === '{') { depth++; continue; }
      if (c === ')' || c === ']' || c === '}') {
        depth--;
        // A block arm `X => { ... }` may end without a comma.
        if (depth === 0 && c === '}' && arrow >= 0 && /^\{/.test(body.slice(arrow + 2).trimStart())) { i++; end = i; break; }
        continue;
      }
      if (depth !== 0) continue;
      if (arrow < 0 && (c === '=' || c === '-') && body[i + 1] === '>') { arrow = i; i++; continue; }
      if (arrow >= 0 && (c === ',' || c === ';')) { end = i; break; }
      if (arrow >= 0 && c === '\n') {
        const before = body.slice(arrow + 2, i).trim();
        let j = i + 1;
        while (j < body.length && /\s/.test(body[j])) j++;
        const after = body.slice(j, j + 12);
        if (before && !/[,(\[{+\-*/%&|^=<>?:.!]$/.test(before) && !/^[.)\]}+\-*/%&|^=<>?:,]/.test(after) && !/^else\b(?!\s*->)/.test(after)) { end = i; break; }
      }
    }
    if (end < 0) end = i;
    if (arrow < 0) return null;
    const pattern = body.slice(at, arrow).trim();
    let bodyAt = arrow + 2;
    while (bodyAt < end && /\s/.test(body[bodyAt])) bodyAt++;
    if (!pattern) return null;
    arms.push({ pattern, at, end, bodyAt, body: body.slice(bodyAt, end).trim() });
    i = end + 1;
  }
  return arms.length ? arms : null;
}
/** A match/when/switch-expression header: `match x {`, `when (x) {`, `when {`, `let y = match x {`, `x switch {`. */
const ARMS_HEAD = /(?:^|=\s*|return\s+)(?:[\w.]+\s+(?=switch))?(?:match\b\s*[^{\s][^{]*|when\s*(?:\([^{]*\))?|switch)\s*\{\s*$/;

/**
 * Statements of a brace body, each with its whole block read (every depth), and every clause that follows the first
 * block: else if, else, catch, finally. Nothing is summarized away. A function written inside a statement
 * (`useEffect(() => { … })`, `go func() { … }()`) has its own body read as the statement's children, and the arms of
 * a match/when are read one by one.
 */
export function braceStatements(stmts, split = null) {
  return stmts.map((s) => {
    const text = s.text;
    const head0 = headLine(text);
    const lit = BLOCK_HEAD.test(head0) && !/^func\s*\(/.test(head0) ? null : fnLiteral(text);
    let open = lit?.open ?? text.indexOf('{');
    const lineAtPos = (pos) => s.line + (text.slice(0, pos).match(/\n/g) || []).length;
    const read = (o, e) => {
      let from = o + 1;
      // Kotlin lambda parameters (`{ item ->`) name the item; they are not a step.
      const params = text.slice(from, e).match(LAMBDA_PARAMS);
      if (params && !ARMS_HEAD.test(head0)) from += params[0].length;
      const body = e > from ? text.slice(from, e) : '';
      const base = s.start != null ? s.start + from : null;
      if (!body || !split) return [];
      const kids = split(body, lineAtPos(from)).map((c) => ({ text: c.text, line: c.line, endLine: c.endLine, ...(base != null && c.start != null ? { start: base + c.start, end: base + c.end } : {}) }));
      return braceStatements(kids, split);
    };
    // The arms of a match / when: each its own statement, with its value or block read inside it.
    const readArms = (o, e) => {
      const body = e > o ? text.slice(o + 1, e) : '';
      const arms = body ? armsOf(body) : null;
      if (!arms || !split) return null;
      return arms.map((a) => {
        const at = o + 1 + a.at, bodyAt = o + 1 + a.bodyAt, end = o + 1 + a.end;
        const pos = (p) => (s.start != null ? { start: s.start + p } : {});
        let kids = [];
        if (a.body.startsWith('{')) kids = read(bodyAt, blockEnd(text, bodyAt));
        else if (a.body) kids = braceStatements([{ text: a.body.replace(/,$/, ''), line: lineAtPos(bodyAt), endLine: lineAtPos(Math.max(bodyAt, end - 1)), ...(s.start != null ? { start: s.start + bodyAt, end: s.start + bodyAt + a.body.replace(/,$/, '').length } : {}) }], split);
        return { text: text.slice(at, end).trim(), arm: a.pattern, line: lineAtPos(at), endLine: lineAtPos(Math.max(at, end - 1)), ...pos(at), ...(s.start != null ? { end: s.start + end } : {}), inner: kids.length, children: kids };
      });
    };
    let children = [], inner = 0;
    const clauses = [];
    if (lit?.expr) {
      // An expression body (`useMemo(() => a * b, [a, b])`): the expression is the one thing it does.
      const [f, t] = lit.expr;
      const raw = text.slice(f, t);
      const lead = raw.length - raw.trimStart().length;
      const expr = raw.trim();
      if (expr) children = braceStatements([{ text: expr, line: lineAtPos(f + lead), endLine: lineAtPos(f + lead + expr.length - 1), ...(s.start != null ? { start: s.start + f + lead, end: s.start + f + lead + expr.length } : {}) }], split);
      inner = children.length;
      return { text, line: s.line, endLine: s.endLine, start: s.start, end: s.end, inner, children, fn: { depth: lit.depth, expr: true, after: text.slice(t) } };
    }
    if (open >= 0) {
      const end = blockEnd(text, open);
      if (!lit && ARMS_HEAD.test(head0)) {
        const arms = readArms(open, end);
        if (arms) return { text, line: s.line, endLine: s.endLine, start: s.start, end: s.end, inner: arms.length, children: arms, arms: true };
      }
      const body = end > open ? text.slice(open + 1, end) : '';
      inner = body ? body.split(/;|\n/).filter((l) => l.trim() && !/^[{}]$/.test(l.trim())).length : 0;
      children = read(open, end);
      let pos = end + 1;
      while (end >= 0) {
        const rest = text.slice(pos);
        const m = rest.match(/^\s*(else\s+if\b|elseif\b|elsif\b|else\b|catch\b|rescue\b|finally\b|ensure\b)/);
        if (!m) break;
        const kw = m[1].replace(/\s+/g, ' ');
        const o = text.indexOf('{', pos + m[0].length);
        if (o < 0) break;
        const e = blockEnd(text, o);
        const clauseHead = text.slice(pos + m[0].length - m[1].length, o).trim();
        clauses.push({ kind: /^(else if|elseif|elsif)$/.test(kw) ? 'elif' : kw === 'else' ? 'else' : kw === 'finally' || kw === 'ensure' ? 'finally' : 'catch', head: clauseHead, line: lineAtPos(pos + rest.indexOf(m[1])), children: read(o, e) });
        if (e < 0) break;
        pos = e + 1;
      }
    }
    return { text, line: s.line, endLine: s.endLine, start: s.start, end: s.end, inner, children, ...(clauses.length ? { clauses } : {}), ...(lit ? { fn: { depth: lit.depth, after: text.slice(lit.close + 1) } } : {}) };
  });
}

/** Top-level statements for an indentation body (Python) or depth body (Ruby). */
export function indentStatements(body, { depthKey = 'indent' } = {}) {
  if (!body?.length) return [];
  // Drop multi-line docstrings first: everything between an opening and closing triple quote.
  const kept = [];
  let inDoc = null, docEntry = null;
  for (const l of body) {
    const t = l.text.trim();
    if (inDoc) { docEntry.endLine = l.line; if (t.includes(inDoc)) inDoc = null; continue; }
    const q = (t.match(/^[rbuf]{0,2}("""|''')/) || [])[1];
    // Docstrings are kept as one entry so they count as read (skipped as documentation, not dropped).
    if (q) { const doc = { ...l, text: q, endLine: l.line }; kept.push(doc); if (t.slice(t.indexOf(q) + 3).includes(q) === false) { inDoc = q; docEntry = doc; } continue; }
    kept.push(l);
  }
  body = kept;
  if (!body.length) return [];
  const base = Math.min(...body.map((l) => l[depthKey] ?? 0));
  const out = [];
  for (let i = 0; i < body.length; i++) {
    const l = body[i];
    if ((l[depthKey] ?? 0) !== base) continue;
    let k = i + 1;
    while (k < body.length && (body[k][depthKey] ?? 0) > base) k++;
    const block = body.slice(i + 1, k);
    // Every depth is kept: the block's own statements, each with its own block (no level is folded away).
    const children = block.length ? indentStatements(block, { depthKey }) : [];
    out.push({ text: l.text, line: l.line, endLine: block.length ? block[block.length - 1].line : (l.endLine ?? l.line), inner: block.length, children });
  }
  return out;
}

