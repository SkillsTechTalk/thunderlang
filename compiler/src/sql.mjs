// SQL in Thunder. Tables are Data (or Things, when they enforce rules), each column with its kind in words, its
// default, whether it is always set, and what it points to; CHECK and UNIQUE constraints are rules the database
// enforces (a No stops the row); CREATE TYPE … AS ENUM is a set of choices; views, functions, procedures, and
// triggers are steps a person can follow. Deterministic, browser-safe, no SQL engine: read by pattern, like every
// other language Thunder reads. Dialects: PostgreSQL first; MySQL, SQLite, and SQL Server syntax where it agrees.

const words = (s) => String(s).replace(/^["`[]|["`\]]$/g, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();
const unquote = (s) => String(s).trim().replace(/^["`[](.*)["`\]]$/, '$1');
const bare = (name) => unquote(String(name).split('.').pop());
const singular = (w) => w.replace(/ies$/, 'y').replace(/(ss|sh|ch|x)es$/, '$1').replace(/([^s])s$/, '$1');
const article = (w) => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);

/** Line-start offsets once; line lookups are a binary search. */
function lineFinder(src) {
  const starts = [0];
  for (let i = src.indexOf('\n'); i >= 0; i = src.indexOf('\n', i + 1)) starts.push(i + 1);
  return (idx) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo + 1; };
}

/** Blank out comments and string contents (same length), so searches never match inside them. */
function mask(src) {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '-' && src[i + 1] === '-') { const n = src.indexOf('\n', i); const end = n < 0 ? src.length : n; out += ' '.repeat(end - i); i = end - 1; continue; }
    if (c === '/' && src[i + 1] === '*') { const n = src.indexOf('*/', i + 2); const end = n < 0 ? src.length : n + 2; out += src.slice(i, end).replace(/[^\n]/g, ' '); i = end - 1; continue; }
    if (c === "'") { let j = i + 1; for (; j < src.length; j++) { if (src[j] === "'" && src[j + 1] === "'") { j++; continue; } if (src[j] === "'") break; } out += "'" + src.slice(i + 1, j).replace(/[^\n]/g, 'x') + (j < src.length ? "'" : ''); i = j; continue; }
    out += c;
  }
  return out;
}

/** Index of the `)` closing the `(` at `open` in masked text. */
function parenEnd(m, open) {
  for (let i = open, d = 0; i < m.length; i++) { if (m[i] === '(') d++; else if (m[i] === ')' && --d === 0) return i; }
  return -1;
}

/** Split at top-level commas (masked text decides; the original text is returned). */
function splitTop(text, masked = mask(text)) {
  const out = [];
  let d = 0, start = 0;
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === '(') d++;
    else if (masked[i] === ')') d--;
    else if (masked[i] === ',' && d === 0) { out.push({ text: text.slice(start, i), at: start }); start = i + 1; }
  }
  out.push({ text: text.slice(start), at: start });
  return out.filter((p) => p.text.trim());
}

/** The `--` comment lines (or one block comment) right above a position: the author's note. */
function docAbove(src, idx) {
  const lines = src.slice(0, idx).split('\n');
  lines.pop(); // the text before the statement on its own line
  const run = [];
  for (let k = lines.length - 1; k >= 0 && /^\s*--/.test(lines[k]); k--) run.unshift(lines[k].replace(/^\s*--+\s?/, '').trim());
  const text = run.filter(Boolean).join(' ');
  return text || null;
}

const TYPE_WORDS = [
  [/^(small|big)?serial\b|^serial\d/i, 'a number, given automatically'],
  [/^(int|integer|smallint|bigint|tinyint|mediumint|numeric|decimal|real|float|double|money|number)\b|^int\d/i, 'a number'],
  [/^(text|varchar|char|character|nvarchar|nchar|citext|string|clob)\b/i, 'words'],
  [/^(bool|boolean|bit)\b/i, 'yes or no'],
  [/^(date|time|timestamp|timestamptz|datetime|datetime2|interval)\b/i, 'a date'],
  [/^uuid\b|^uniqueidentifier\b/i, 'an id'],
  [/^jsonb?\b/i, 'structured data'],
  [/^(bytea|blob|binary|varbinary)\b/i, 'a file or bytes'],
];
const typeWords = (t) => { for (const [re, w] of TYPE_WORDS) if (re.test(String(t).trim())) return w; return /\[\]$/.test(String(t).trim()) ? 'a list' : null; };

/** A default value in words, as other languages say a starting value. */
function defaultWords(v) {
  const e = String(v).trim().replace(/::\w+(\[\])?$/, '');
  if (/^null$/i.test(e)) return 'nothing at first';
  if (/^(true|false)$/i.test(e)) return `${/^true$/i.test(e) ? 'yes' : 'no'} at first`;
  if (/^-?\d+(\.\d+)?$/.test(e)) return `${e} at first`;
  if (/^'.*'$/s.test(e)) return `"${e.slice(1, -1).replace(/''/g, "'")}" at first`;
  if (/^(now\(\)|current_timestamp|current_date|getdate\(\)|sysdate|localtimestamp|transaction_timestamp\(\))$/i.test(e)) return 'the moment it is saved';
  if (/gen_random_uuid|uuid_generate|newid\(\)/i.test(e)) return 'a new id';
  return 'worked out when it is saved';
}

/** A SQL condition as Thunder words: total >= 0 AND status IN ('a','b') -> "total is at least 0 and status is one of a, b". */
export function sqlCondition(cond, { aliases = {}, vars = false } = {}) {
  let c = String(cond).trim().replace(/\s+/g, ' ');
  while (/^\(.*\)$/.test(c) && parenEnd(mask(c), 0) === c.length - 1) c = c.slice(1, -1).trim();
  // Strings first, in Thunder's quotes, so a possessive apostrophe is never mistaken for one.
  c = c.replace(/'((?:[^']|'')*)'/g, (m, v) => `"${v.replace(/''/g, "'")}"`);
  const plain = (x) => words(vars ? String(x).replace(/^(?:p|v|l|in|out|var)_(?=\w)/i, '') : x);
  const name = (x) => { const p = String(x).split('.'); if (p.length < 2) return plain(x); const table = aliases[p[0].toLowerCase()] ?? p[0]; return `the ${singular(words(table))}'s ${words(p[1])}`; };
  return c
    .replace(/\b(NEW|OLD)\.(\w+)/g, (m, which, col) => `the ${which === 'NEW' ? 'new' : 'old'} ${words(col)}`)
    .replace(/([\w."]+)\s+NOT\s+IN\s*\(([^)]*)\)/gi, (m, a, l) => `${name(a)} is not one of ${l.split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).join(', ')}`)
    .replace(/([\w."]+)\s+IN\s*\(([^)]*)\)/gi, (m, a, l) => (/^\s*select\b/i.test(l) ? `${name(a)} is in the results of a query` : `${name(a)} is one of ${l.split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).join(', ')}`))
    .replace(/([\w."]+)\s+IS\s+NOT\s+NULL/gi, (m, a) => `${name(a)} is set`)
    .replace(/([\w."]+)\s+IS\s+NULL/gi, (m, a) => `${name(a)} is empty`)
    .replace(/([\w.]+)\s+NOT\s+LIKE\s+"([^"]*)"/gi, (m, a, p) => `${name(a)} does not match "${p.replace(/%/g, '…')}"`)
    .replace(/([\w.]+)\s+I?LIKE\s+"([^"]*)"/gi, (m, a, p) => (/^[^%]+%$/.test(p) ? `${name(a)} starts with "${p.slice(0, -1)}"` : /^%[^%]+%$/.test(p) ? `${name(a)} contains "${p.slice(1, -1)}"` : `${name(a)} matches "${p.replace(/%/g, '…')}"`))
    .replace(/([\w."]+)\s+BETWEEN\s+(\S+)\s+AND\s+(\S+)/gi, (m, a, lo, hi) => `${name(a)} is from ${lo} to ${hi}`)
    .replace(/\s*(<>|!=)\s*/g, ' is not ').replace(/\s*>=\s*/g, ' is at least ').replace(/\s*<=\s*/g, ' is at most ')
    .replace(/\s*>\s*/g, ' is more than ').replace(/\s*<\s*/g, ' is less than ').replace(/\s*=\s*/g, ' is ')
    .replace(/\bAND\b/gi, 'and').replace(/\bOR\b/gi, 'or').replace(/\bNOT\s+/gi, 'not ')
    .replace(/\b(?:length|char_length)\s*\(\s*([\w."]+)\s*\)/gi, (m, a) => `the length of ${name(a)}`)
    .replace(/\b(?!is\b|and\b|or\b|not\b|at\b|least\b|most\b|more\b|less\b|than\b|one\b|of\b|the\b|set\b|empty\b|from\b|to\b|new\b|old\b|starts\b|with\b|contains\b|does\b|match\b|matches\b|in\b|results\b|a\b|query\b|length\b|s\b)([a-z_][\w]*\.)?([a-z_][\w]*)\b(?![^"]*"(?:[^"]*"[^"]*")*[^"]*$)/gi, (m, t, col) => (t ? name(`${t}${col}`) : /^[A-Z_]+$/.test(col) && col.length > 1 ? m : plain(col)))
    .replace(/\s+/g, ' ').trim();
}

// ── Tables, types: Things, Data, and Choices ─────────────────────────────────────────────────────────────

/** Tables, enums, and the rules (CHECK, UNIQUE) each table enforces, with their lines. */
function readSchema(src) {
  const m = mask(src);
  const lineAt = lineFinder(src);
  const tables = [], choices = [], rules = [];
  const docs = new Map();
  for (const c of src.matchAll(/COMMENT\s+ON\s+TABLE\s+([\w."]+)\s+IS\s+'((?:[^']|'')*)'/gi)) docs.set(bare(c[1]).toLowerCase(), c[2].replace(/''/g, "'"));
  for (const t of m.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:GLOBAL|LOCAL)\s+)?(?:TEMP(?:ORARY)?\s+|UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."[\]`]+)\s*\(/gi)) {
    const open = t.index + t[0].length - 1;
    const close = parenEnd(m, open);
    if (close < 0) continue;
    const name = bare(src.slice(t.index, open).match(/([\w."[\]`]+)\s*$/)[1]);
    const table = { name, lines: [lineAt(t.index), lineAt(close)], doc: docs.get(name.toLowerCase()) ?? docAbove(src, t.index), columns: [], checks: [], uniques: [], refs: [] };
    for (const part of splitTop(src.slice(open + 1, close), m.slice(open + 1, close))) {
      const text = part.text.trim().replace(/\s+/g, ' ');
      const line = lineAt(open + 1 + part.at + (part.text.length - part.text.trimStart().length));
      let x;
      if ((x = text.match(/^(?:CONSTRAINT\s+([\w"]+)\s+)?CHECK\s*\((.*)\)$/i))) { table.checks.push({ name: x[1] && unquote(x[1]), cond: x[2], line }); continue; }
      if ((x = text.match(/^(?:CONSTRAINT\s+([\w"`]+)\s+)?UNIQUE(?:\s+(?:KEY|INDEX))?(?:\s+([\w"`]+))?\s*\(([^)]*)\)/i))) { table.uniques.push({ name: (x[1] || x[2]) && unquote(x[1] || x[2]), cols: x[3].split(',').map((c) => unquote(c.trim())), line }); continue; }
      if ((x = text.match(/^(?:CONSTRAINT\s+[\w"]+\s+)?FOREIGN\s+KEY\s*\(([^)]*)\)\s+REFERENCES\s+([\w."]+)/i))) { for (const c of x[1].split(',')) table.refs.push({ col: unquote(c.trim()), to: bare(x[2]) }); continue; }
      if (/^(?:CONSTRAINT\s+[\w"]+\s+)?(PRIMARY\s+KEY|INDEX|KEY|EXCLUDE)\b/i.test(text)) continue;
      const col = text.match(/^([\w"`[\]]+)\s+([\w]+(?:\s*\([^)]*\))?(?:\s+(?:varying|precision|with(?:out)?\s+time\s+zone))*(?:\[\])?)(.*)$/i);
      if (!col || /^(LIKE|PERIOD)$/i.test(col[1])) continue;
      const rest = col[3] || '';
      const ref = rest.match(/\bREFERENCES\s+([\w."]+)/i);
      const def = rest.match(/\bDEFAULT\s+('(?:[^']|'')*'|\([^)]*\)|[\w.:]+(?:\(\))?)/i);
      const column = { name: unquote(col[1]), type: col[2], line, primary: /\bPRIMARY\s+KEY\b/i.test(rest), notNull: /\bNOT\s+NULL\b/i.test(rest), ...(def ? { default: def[1] } : {}), ...(ref ? { ref: bare(ref[1]) } : {}) };
      table.columns.push(column);
      const check = rest.match(/\bCHECK\s*\((.*)\)/i);
      if (check) table.checks.push({ cond: check[1], line });
      if (/\bUNIQUE\b/i.test(rest)) table.uniques.push({ cols: [column.name], line });
    }
    tables.push(table);
  }
  for (const e of m.matchAll(/\bCREATE\s+TYPE\s+([\w."]+)\s+AS\s+ENUM\s*\(/gi)) {
    const open = e.index + e[0].length - 1;
    const close = parenEnd(m, open);
    if (close < 0) continue;
    const values = [...src.slice(open + 1, close).matchAll(/'((?:[^']|'')*)'/g)].map((v) => v[1].replace(/''/g, "'").replace(/_/g, ' '));
    choices.push({ name: bare(e[1]), lines: [lineAt(e.index), lineAt(close)], doc: docAbove(src, e.index), values });
  }
  for (const t of tables) {
    for (const c of t.checks) rules.push({ table: t.name, kind: 'check', ...c });
    for (const u of t.uniques) rules.push({ table: t.name, kind: 'unique', ...u });
  }
  return { tables, choices, rules };
}

/** Things, Data, and Choices from a SQL file, in the same shape as the other languages' readers. */
export function sqlThings(src, file) {
  const { tables, choices } = readSchema(src);
  const enums = new Set(choices.map((c) => c.name.toLowerCase()));
  const out = [];
  for (const t of tables) {
    const refs = new Map(t.refs.map((r) => [r.col, r.to]));
    const knows = t.columns.map((c) => {
      const to = c.ref ?? refs.get(c.name);
      const kind = to ? `${article(singular(words(to)))} (by its id)` : c.primary ? `${typeWords(c.type) ?? 'a value'}, the id` : enums.has(bare(c.type).toLowerCase()) ? article(words(bare(c.type))) : typeWords(c.type);
      return { name: c.name, label: words(c.name), kind: kind && c.notNull && !c.primary ? `${kind}, always set` : kind, start: c.default != null ? defaultWords(c.default) : null, line: c.line };
    });
    out.push({ kind: t.checks.length || t.uniques.length ? 'thing' : 'record', name: t.name, file, lines: t.lines, ...(t.doc ? { doc: t.doc } : {}), knows, choices: [] });
  }
  for (const c of choices) out.push({ kind: 'choices', name: c.name, file, lines: c.lines, ...(c.doc ? { doc: c.doc } : {}), knows: [], choices: c.values });
  return out;
}

// ── Queries, views, functions, procedures, triggers: steps ───────────────────────────────────────────────

const colWords = (expr) => {
  const e = expr.trim();
  const as = e.match(/\s+(?:AS\s+)?([\w"]+)$/i);
  if (as && !/^(DESC|ASC|END)$/i.test(as[1]) && /[\s)]/.test(e.slice(0, as.index + 1))) return words(unquote(as[1]));
  const agg = e.match(/^(count|sum|avg|min|max)\s*\(\s*(distinct\s+)?([^)]*)\)$/i);
  if (agg) { const what = agg[3].trim() === '*' ? 'rows' : words(bare(agg[3])); return { count: `how many ${what === 'rows' ? 'rows' : what}`, sum: `the total of ${what}`, avg: `the average ${what}`, min: `the lowest ${what}`, max: `the highest ${what}` }[agg[1].toLowerCase()]; }
  if (e === '*') return 'every column';
  if (/^\w+\.\*$/.test(e)) return `every column of ${words(e.split('.')[0])}`;
  return /^[\w."]+$/.test(e) ? words(bare(e)) : 'a worked-out value';
};
const listWords = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')}${xs.length > 2 ? ',' : ''} and ${xs.at(-1)}`);

/** The steps of one SELECT: finds, joins, keeps only, groups, sorts, takes, gives back. */
function selectSteps(sql, line, { give = true, vars = false } = {}) {
  const s = sql.replace(/\s+/g, ' ').trim().replace(/;$/, '');
  const m = mask(s);
  const at = (kw) => { const r = new RegExp(`\\b${kw}\\b`, 'i').exec(m); return r ? r.index : -1; };
  const clauses = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET', 'INTO'].map((k) => [k, at(k)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]);
  const part = (k) => { const i = clauses.findIndex(([n]) => n === k); if (i < 0) return null; const start = clauses[i][1] + k.length; const end = clauses[i + 1]?.[1] ?? s.length; return s.slice(start, end).trim(); };
  const steps = [];
  const code = s;
  const from = part('FROM');
  // Table aliases (orders o, customers AS c) read as their table: o.status -> "the order's status".
  const aliases = {};
  for (const a of (from || '').matchAll(/([\w."]+)\s+(?:AS\s+)?([a-z_]\w*)\b(?=\s*(?:,|$|\bON\b|\bJOIN\b|\bLEFT\b|\bRIGHT\b|\bINNER\b|\bFULL\b|\bCROSS\b|\bWHERE\b))/gi)) {
    if (!/^(ON|JOIN|LEFT|RIGHT|INNER|FULL|CROSS|OUTER|WHERE|AS)$/i.test(a[2])) aliases[a[2].toLowerCase()] = bare(a[1]);
  }
  const cond = (text) => sqlCondition(text, { aliases, vars });
  if (from) {
    const [first, ...joins] = from.split(/\b(?:(?:LEFT|RIGHT|INNER|FULL|CROSS)\s+(?:OUTER\s+)?)?JOIN\b/i);
    const base = bare(first.trim().split(/\s+/)[0]);
    steps.push({ kind: 'call', callee: 'find', says: `Finds the ${words(base)}`, code, line });
    for (const j of joins) {
      const jt = bare(j.trim().split(/\s+/)[0]);
      const left = /\bLEFT\b/i.test(from.slice(0, from.indexOf(j)).slice(-20));
      steps.push({ kind: 'call', callee: 'find', says: `${left ? 'Adds, when there is one,' : 'Adds'} the matching ${words(singular(jt))} to each`, code, line });
    }
  }
  const where = part('WHERE');
  if (where) steps.push({ kind: 'call', callee: 'filter', says: `Keeps only those where ${cond(where)}`, code, line });
  const group = part('GROUP BY');
  if (group) steps.push({ kind: 'set', says: `Groups them by ${listWords(splitTop(group).map((p) => words(bare(p.text.trim()))))}`, code, line });
  const having = part('HAVING');
  if (having) steps.push({ kind: 'call', callee: 'filter', says: `Keeps only groups where ${cond(having.replace(/\b(count|sum|avg|min|max)\s*\(([^)]*)\)/gi, (x) => colWords(x).replace(/ /g, '_')))}`.replace(/_/g, ' '), code, line });
  const order = part('ORDER BY');
  if (order) steps.push({ kind: 'set', says: `Sorts them by ${listWords(splitTop(order).map((p) => { const t = p.text.trim(); return `${colWords(t.replace(/\s+(ASC|DESC)(\s+NULLS\s+(FIRST|LAST))?$/i, ''))}${/\bDESC\b/i.test(t) ? ', highest first' : ''}`; }))}`, code, line });
  const limit = part('LIMIT');
  if (limit && /^\d+/.test(limit)) steps.push({ kind: 'set', says: `Takes the first ${limit.match(/^\d+/)[0]}`, code, line });
  const cols = part('SELECT');
  if (give && cols) {
    const names = splitTop(cols.replace(/^DISTINCT\s+/i, '')).map((p) => colWords(p.text));
    steps.push({ kind: 'return', says: `Returns ${listWords(names.length > 8 ? [...names.slice(0, 7), 'more'] : names)}`, code, line });
  }
  return steps;
}

/** One statement in a function or procedure body, read as a step. */
function bodyStatement(text, line) {
  const cnd = (x) => sqlCondition(x, { vars: true });
  const v = (x) => words(String(x).replace(/^(?:p|v|l|var)_(?=\w)/i, ''));
  const t = text.replace(/\s+/g, ' ').trim().replace(/;$/, '');
  const code = t;
  let x;
  if ((x = t.match(/^RAISE\s+(?:EXCEPTION|ERROR)\s+'((?:[^']|'')*)'/i))) { const msg = x[1].replace(/''/g, "'").replace(/%/g, '…'); return { kind: 'fail', says: `Fails with an error: "${msg}"`, error: 'an error', message: msg, code, line }; }
  if ((x = t.match(/^(?:RAISERROR|THROW)\s*\(?\s*(?:\d+\s*,\s*)?N?'((?:[^']|'')*)'/i)) || (x = t.match(/^SIGNAL\s+SQLSTATE\s+'\w+'\s+SET\s+MESSAGE_TEXT\s*=\s*'((?:[^']|'')*)'/i))) return { kind: 'fail', says: `Fails with an error: "${x[1].replace(/''/g, "'")}"`, error: 'an error', message: x[1].replace(/''/g, "'"), code, line };
  if ((x = t.match(/^RETURN\s+QUERY\s+(SELECT\b.*)$/i))) return { kind: 'return', says: selectSteps(x[1], line).at(-1)?.says ?? 'Returns the rows a query finds', code, line, query: selectSteps(x[1], line, { give: false }) };
  if ((x = t.match(/^RETURN\s+(NEW|OLD)$/i))) return { kind: 'return', says: x[1].toUpperCase() === 'NEW' ? 'Lets the change go ahead' : 'Keeps the old row', code, line };
  if ((x = t.match(/^RETURN\s*(.*)$/i))) return { kind: 'return', says: x[1] ? (/^'(.*)'$/.test(x[1]) ? `Returns "${x[1].slice(1, -1)}"` : /^(true|false)$/i.test(x[1]) ? `Returns ${x[1].toLowerCase() === 'true' ? 'yes' : 'no'}` : `Returns ${cnd(x[1])}`) : 'Stops here', code, line };
  if ((x = t.match(/^INSERT\s+INTO\s+([\w."]+)(?:\s*\(([^)]*)\))?/i))) return { kind: 'call', says: `Records a new ${singular(words(bare(x[1])))}${x[2] ? ` with ${listWords(x[2].split(',').map((c) => words(c.trim())))}` : ''}`, code, line };
  if ((x = t.match(/^UPDATE\s+([\w."]+)\s+SET\s+(.*?)(?:\s+WHERE\s+(.*))?$/i))) {
    const sets = splitTop(x[2]).map((p) => { const kv = p.text.match(/^\s*([\w."]+)\s*=\s*(.*)$/s); return kv ? `${words(bare(kv[1]))} to ${/^'.*'$/.test(kv[2].trim()) ? `"${kv[2].trim().slice(1, -1)}"` : cnd(kv[2])}` : null; }).filter(Boolean);
    return { kind: 'call', says: `Records the change in ${words(bare(x[1]))}: sets ${listWords(sets)}${x[3] ? ` where ${cnd(x[3])}` : ''}`, code, line };
  }
  if ((x = t.match(/^DELETE\s+FROM\s+([\w."]+)(?:\s+WHERE\s+(.*))?$/i))) return { kind: 'call', says: `Removes ${words(bare(x[1]))}${x[2] ? ` where ${cnd(x[2])}` : ''}`, code, line };
  if ((x = t.match(/^SELECT\s+(.*?)\s+INTO\s+(?:STRICT\s+)?([\w,\s]+?)\s+FROM\s+(.*)$/i))) {
    const from = x[3].match(/^([\w."]+)(?:\s+(?:AS\s+)?\w+)?(?:\s+WHERE\s+(.*))?$/i);
    const what = listWords(x[2].split(',').map((n) => v(n.trim())));
    if (from) return { kind: 'call', callee: 'find', says: `Finds ${what} in the ${words(bare(from[1]))}${from[2] ? ` where ${cnd(from[2])}` : ''}`, code, line };
    const found = selectSteps(`SELECT ${x[1]} FROM ${x[3]}`, line, { give: false, vars: true });
    return { kind: 'call', callee: 'find', says: `Finds ${what}: ${found.map((f) => f.says.charAt(0).toLowerCase() + f.says.slice(1)).join(', ')}`, code, line };
  }
  if ((x = t.match(/^(?:PERFORM|CALL|EXEC(?:UTE)?)\s+([\w.]+)\s*\(/i))) return { kind: 'call', says: `Runs ${words(bare(x[1]))}`, code, line };
  if ((x = t.match(/^(?:SET\s+)?@?([\w.]+)\s*:?=\s*(.+)$/i))) return { kind: 'set', says: `Sets ${v(bare(x[1]))} to ${/^'.*'$/.test(x[2].trim()) ? `"${x[2].trim().slice(1, -1)}"` : cnd(x[2])}`, code, line };
  return { kind: 'other', says: code, code, line, restates: code };
}

/**
 * The steps of a procedural body (PL/pgSQL and friends): IF/ELSIF/ELSE/END IF become branches with their other
 * side, everything else one step per statement.
 */
function procSteps(body, firstLine) {
  const m = mask(body);
  const stmts = [];
  let start = 0;
  // Split at semicolons and around THEN/ELSE/ELSIF/END IF/LOOP keywords so IF headers stand alone.
  const re = /;|\bTHEN\b|\bELSE\b(?!\s*IF)|\bELSIF\b|\bELSEIF\b|\bEND\s+IF\b|\bBEGIN\b|\bEND\b(?!\s+IF)/gi;
  const lineAt = lineFinder(body);
  let r;
  while ((r = re.exec(m))) {
    const kw = r[0].toUpperCase().replace(/\s+/g, ' ');
    if (kw === ';') { const text = body.slice(start, r.index).trim(); if (text) stmts.push({ text, line: firstLine + lineAt(start + (body.slice(start).length - body.slice(start).trimStart().length)) - 1 }); start = r.index + 1; continue; }
    if (kw === 'THEN') { stmts.push({ text: body.slice(start, r.index).trim(), line: firstLine + lineAt(start + (body.slice(start).length - body.slice(start).trimStart().length)) - 1, then: true }); start = r.index + r[0].length; continue; }
    const before = body.slice(start, r.index).trim();
    if (before) stmts.push({ text: before, line: firstLine + lineAt(start) - 1 });
    stmts.push({ keyword: kw === 'ELSEIF' ? 'ELSIF' : kw });
    start = r.index + r[0].length;
  }
  const tail = body.slice(start).trim();
  if (tail) stmts.push({ text: tail, line: firstLine + lineAt(start) - 1 });
  let i = 0;
  const block = (stop) => {
    const out = [];
    while (i < stmts.length) {
      const s = stmts[i];
      if (s.keyword && stop.includes(s.keyword)) return out;
      i++;
      if (s.keyword === 'BEGIN' || s.keyword === 'END') continue;
      if (s.then && /^(IF|ELSIF)\b/i.test(s.text)) {
        const cond = s.text.replace(/^(IF|ELSIF)\s+/i, '');
        const step = { kind: 'branch', says: `If ${sqlCondition(cond, { vars: true })}`, code: s.text, line: s.line, children: block(['ELSIF', 'ELSE', 'END IF']) };
        let tail = step;
        while (stmts[i]?.keyword === 'ELSIF') {
          i++;
          const h = stmts[i++];
          const next = { kind: 'branch', says: `If ${sqlCondition(h.text.replace(/^ELSIF\s+/i, ''), { vars: true })}`, code: h.text, line: h.line, children: block(['ELSIF', 'ELSE', 'END IF']) };
          tail.otherwise = [next]; tail = next;
        }
        if (stmts[i]?.keyword === 'ELSE') { i++; tail.otherwise = block(['END IF']); }
        if (stmts[i]?.keyword === 'END IF') i++;
        out.push(step);
        continue;
      }
      if (s.text && !/^(DECLARE|LANGUAGE|AS)\b/i.test(s.text) && !/^\w+\s+[\w(),]+(\s*:=.*)?$/.test(s.text) || /:=/.test(s.text ?? '')) {
        if (s.text && !/^DECLARE\b/i.test(s.text)) out.push(bodyStatement(s.text.replace(/^DECLARE\s+/i, ''), s.line));
      }
    }
    return out;
  };
  return block([]);
}

/** Functions, procedures, views, triggers, and CHECK/UNIQUE rules as reading items (kind 'function'). */
export function sqlItems(src) {
  const m = mask(src);
  const lineAt = lineFinder(src);
  const items = [];
  const push = (name, line, steps, extra = {}) => {
    const code = steps.filter((s) => s.kind === 'other').length;
    items.push({ id: `${name}:${line}`, name, label: words(name).charAt(0).toUpperCase() + words(name).slice(1), line, inputs: extra.inputs ?? [], returns: extra.returns ?? null,
      ...(extra.doc ? { doc: extra.doc } : {}), provenance: 'inferred-from-code', kind: 'function', status: 'signature-only', steps, stepsMore: 0,
      stepsReadable: steps.length ? Math.round(((steps.length - code) / steps.length) * 100) / 100 : 0,
      says: extra.says ?? `${words(name)} has ${steps.length} step${steps.length === 1 ? '' : 's'}.`, headline: extra.headline ?? `${words(name)}.`, guards: [], unread: [] });
  };
  // Views: the query, as steps.
  for (const v of m.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)(?:\s*\([^)]*\))?\s+AS\s+/gi)) {
    const end = m.indexOf(';', v.index);
    const query = src.slice(v.index + v[0].length, end < 0 ? src.length : end);
    const name = bare(v[1]);
    push(name, lineAt(v.index), selectSteps(query, lineAt(v.index + v[0].length)), { doc: docAbove(src, v.index), says: `${words(name)} is a saved query.`, headline: `${words(name)}: a saved query.` });
  }
  // Functions and procedures: their parameters and body.
  for (const f of m.matchAll(/\bCREATE\s+(?:OR\s+(?:REPLACE|ALTER)\s+)?(?:DEFINER\s*=\s*\S+\s+)?(FUNCTION|PROCEDURE|PROC)\s+([\w."[\]]+)\s*\(/gi)) {
    const open = f.index + f[0].length - 1;
    const close = parenEnd(m, open);
    if (close < 0) continue;
    const name = bare(f[2]);
    const inputs = splitTop(src.slice(open + 1, close)).map((p) => {
      const pm = p.text.trim().match(/^(?:IN\s+|OUT\s+|INOUT\s+)?@?([\w"]+)\s+(.+?)(?:\s+(?:DEFAULT|=)\s+.+)?$/i);
      return pm ? { name: unquote(pm[1]).replace(/^p_|^_/, ''), type: pm[2].trim() } : null;
    }).filter(Boolean);
    const after = src.slice(close + 1);
    const ret = after.match(/^\s*RETURNS\s+(TABLE\s*\([^)]*\)|SETOF\s+[\w.]+|[\w.]+(?:\[\])?)/i);
    const dollar = after.match(/\$(\w*)\$([\s\S]*?)\$\1\$/);
    const beginAt = mask(after).search(/\bBEGIN\b/i);
    const bodyText = dollar ? dollar[2] : beginAt >= 0 ? after.slice(beginAt) : '';
    const bodyStart = close + 1 + (dollar ? dollar.index + dollar[0].indexOf(dollar[2]) : Math.max(beginAt, 0));
    const isTrigger = ret && /^trigger$/i.test(ret[1]);
    const steps = procSteps(bodyText, lineAt(bodyStart));
    const returns = ret && !isTrigger ? (typeWords(ret[1]) ?? (/^(SETOF|TABLE)\b/i.test(ret[1]) ? 'rows' : words(ret[1]))) : null;
    push(name, lineAt(f.index), steps, { inputs, returns, doc: docAbove(src, f.index),
      says: `${words(name)} takes ${inputs.length ? inputs.map((p) => words(p.name)).join(', ') : 'no inputs'}${returns ? ` and returns ${returns}` : ''}.`,
      headline: `${words(name)} takes ${inputs.length ? inputs.map((p) => words(p.name)).join(', ') : 'no inputs'}.` });
  }
  // Triggers: when the database runs a function by itself.
  for (const t of m.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+([\w."]+)\s+(BEFORE|AFTER|INSTEAD\s+OF)\s+([\w\s,]+?)\s+ON\s+([\w."]+)[\s\S]*?EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+([\w.]+)/gi)) {
    const events = t[3].split(/\s+OR\s+/i).map((e) => ({ INSERT: 'added', UPDATE: 'changed', DELETE: 'removed', TRUNCATE: 'emptied' })[e.trim().split(/\s+/)[0].toUpperCase()] || words(e)).filter(Boolean);
    const what = article(singular(words(bare(t[4]))));
    const when = `${t[2].toUpperCase() === 'BEFORE' ? 'Before' : t[2].toUpperCase() === 'AFTER' ? 'After' : 'Instead of when'} ${what} is ${events.join(' or ')}`;
    push(bare(t[1]), lineAt(t.index), [{ kind: 'call', says: `${when}, runs ${words(bare(t[5]))}`, code: t[0].replace(/\s+/g, ' '), line: lineAt(t.index) }], { says: `${when}, the database runs ${words(bare(t[5]))}.`, headline: `${when}.`, doc: docAbove(src, t.index) });
  }
  // Rules the database enforces: CHECK and UNIQUE. A No stops the row.
  for (const r of readSchema(src).rules) {
    const table = words(r.table);
    if (r.kind === 'check') {
      const cond = sqlCondition(r.cond);
      const name = r.name || `${(r.cond.match(/[a-z_]\w*/i) || ['value'])[0]}_check`;
      push(name, r.line, [{ kind: 'branch', says: `If not: ${cond}`, code: `CHECK (${r.cond})`, line: r.line, children: [{ kind: 'fail', says: `Fails with Refused by the database: "The ${singular(table)} needs ${cond.replace(/"/g, "'")}"`, error: 'Refused by the database', message: `The ${singular(table)} needs ${cond.replace(/"/g, "'")}`, code: `CHECK (${r.cond})`, line: r.line }] }],
        { says: `Every ${singular(table)} must have ${cond}.`, headline: `Every ${singular(table)} must have ${cond}.` });
    } else {
      const cols = listWords(r.cols.map(words));
      push(r.name || `unique_${r.cols.join('_and_')}`, r.line, [{ kind: 'branch', says: `If not: no other ${singular(table)} has the same ${cols}`, code: `UNIQUE (${r.cols.join(', ')})`, line: r.line, children: [{ kind: 'fail', says: `Fails with Refused by the database: "Each ${cols} can be used only once"`, error: 'Refused by the database', message: `Each ${cols} can be used only once`, code: `UNIQUE (${r.cols.join(', ')})`, line: r.line }] }],
        { says: `Each ${cols} can be used by only one ${singular(table)}.`, headline: `Each ${cols} can be used by only one ${singular(table)}.` });
    }
  }
  items.sort((a, b) => a.line - b.line);
  return items;
}
