// SQL in Thunder. Tables are Data (or Things, when they enforce rules), each column with its kind in words, its
// default, whether it is always set, and what it points to; CHECK and UNIQUE constraints are rules the database
// enforces (a No stops the row); CREATE TYPE … AS ENUM is a set of choices; views, functions, procedures, and
// triggers are steps a person can follow. Deterministic, browser-safe, no SQL engine: read by pattern, like every
// other language Thunder reads. Dialects: PostgreSQL first; MySQL, SQLite, and SQL Server syntax where it agrees.

import { sqlRoutines } from './sql-proc.mjs';

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

const LOGIC_WORD = /^(?:is|and|or|not|no)$/;
const SQL_KEYWORD = /^(?:AND|OR|NOT|IS|IN|NULL|LIKE|ILIKE|BETWEEN|TRUE|FALSE|EXISTS|NO)$/i;
/** True for a name whose words would read as logic: v_is_default, v_not_found, read_or_write (not the keywords). */
export const sqlLogicName = (id) => !SQL_KEYWORD.test(id) && String(id).split('.').some((p) => words(p.replace(/^(?:p|v|l|in|out|var)_(?=\w)/i, '')).split(' ').some((w) => LOGIC_WORD.test(w)));

/** A SQL condition as Thunder words: total >= 0 AND status IN ('a','b') -> "total is at least 0 and status is one of a, b". */
export function sqlCondition(cond, { aliases = {}, vars = false, keepAt = true, raw = false } = {}) {
  // Quoted text is held aside first and put back exactly as written: no rewrite (words, `=` -> "is") reaches inside
  // it. `"…"` is a quoted text; a held raw value (an IN list's item, a MySQL @variable) is put back as it is.
  const held = [];
  const hold = (text) => `\u0001${held.push(text) - 1}\u0002`;
  const back = (s) => { let out = String(s); for (let k = 0; k < 4 && /\u0001\d+\u0002/.test(out); k++) out = out.replace(/\u0001(\d+)\u0002/g, (m, n) => held[Number(n)]); return out; };
  // (N'…' is SQL Server's Unicode text and E'…' PostgreSQL's text with escapes: the text is as written.)
  let c = String(cond).trim().replace(/(?<![\w$])[NnEe](?=')/g, '').replace(/'((?:[^']|'')*)'/g, (m, v) => hold(`"${v.replace(/''/g, "'")}"`));
  // A system value (@@ROWCOUNT, @@FETCH_STATUS) is a name as written.
  c = c.replace(/@@[A-Za-z_][\w$.]*/g, (m) => hold(`\`${m}\``));
  // An extension's schema placeholder (@extschema@.fn(…)) is not part of the name.
  c = c.replace(/@\w+@\.([A-Za-z_]\w*)(?=\s*\()/g, (m, fn) => hold(words(fn))).replace(/@\w+@/g, (m) => hold(`\`${m}\``));
  // A MySQL @variable is a name as written, shown as code so no rewrite turns `@sys.debug` into words.
  if (keepAt) c = c.replace(/@@?[A-Za-z_][\w.$]*/g, (m) => hold(`\`${m}\``));
  else c = c.replace(/@(?=[A-Za-z_])/g, '');
  // A name whose words would read as logic (v_is_default, v_not_found, read_or_write) is kept as written: in words
  // it would be mistaken for the question's own "is", "not", or "or".
  c = c.replace(/(?<![\w.$\u0001])[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*(?![\w$])/g, (m) => (sqlLogicName(m) ? hold(`\`${m}\``) : m));
  c = c.replace(/\s+/g, ' ');
  while (/^\(.*\)$/.test(c) && parenEnd(mask(c), 0) === c.length - 1) c = c.slice(1, -1).trim();
  // In a routine, v_total and p_total read as "total"; when that would make both sides of a comparison the same
  // words ("parent table is parent table"), the prefixed names are kept as written instead (raw).
  const prefixed = /^(?:p|v|l|in|out|var)_(?=\w)/i;
  const plain = (x) => (raw && prefixed.test(x) ? `\`${x}\`` : words(vars ? String(x).replace(prefixed, '') : x));
  // Two names compared (a = b) read "a is the same as b": "Is parent interval the same as interval?", not "Is
  // parent interval interval?".
  if (vars) c = c.replace(/(?<![\w."@\u0002])([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)\s*(=|<>|!=)\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)(?![\w.(\u0001])/g, (m, a, op, b) => (/^(?:NULL|TRUE|FALSE|AND|OR|NOT|IS|IN|CURRENT_TIMESTAMP|CURRENT_DATE|NOW)$/i.test(a) || /^(?:NULL|TRUE|FALSE|AND|OR|NOT|IS|IN)$/i.test(b) ? m : `${a} ${op === '=' ? '\u0003' : '\u0004'} ${b}`));
  const name = (x) => {
    if (/^\u0001\d+\u0002$/.test(x) || /\(/.test(x)) return x;
    const p = String(x).split('.');
    if (p.length < 2) return plain(x);
    const table = aliases[p[0].toLowerCase()];
    return table ? `the ${singular(words(table))}'s ${words(p[1])}` : vars ? `the ${plain(p[0])}'s ${words(p[1])}` : `the ${singular(words(p[0]))}'s ${words(p[1])}`;
  };
  // An IN list's items, exactly as they are written (a quoted text stays quoted).
  const items = (l) => l.split(',').map((x) => hold(x.trim())).join(', ');
  const pattern = (n) => held[Number(n)].slice(1, -1);
  const out = c
    .replace(/\b(NEW|OLD)\.(\w+)/g, (m, which, col) => `the ${which === 'NEW' ? 'new' : 'old'} ${words(col)}`)
    .replace(/(\u0001\d+\u0002|(?!NOT\b)[A-Za-z_][\w.]*\([^()]*\)|(?!NOT\b)[\w."]+)\s+NOT\s+IN\s*\(([^)]*)\)/gi, (m, a, l) => `${name(a)} is not one of ${items(l)}`)
    .replace(/(\u0001\d+\u0002|(?!NOT\b)[A-Za-z_][\w.]*\([^()]*\)|(?!NOT\b)[\w."]+)\s+IN\s*\(([^)]*)\)/gi, (m, a, l) => (/^\s*select\b/i.test(l) ? `${name(a)} is in the results of a query` : `${name(a)} is one of ${items(l)}`))
    .replace(/(\u0001\d+\u0002|(?!NOT\b)[A-Za-z_][\w.]*\([^()]*\)|(?!NOT\b)[\w."]+)\s+IS\s+NOT\s+NULL/gi, (m, a) => `${name(a)} is set`)
    .replace(/(\u0001\d+\u0002|(?!NOT\b)[A-Za-z_][\w.]*\([^()]*\)|(?!NOT\b)[\w."]+)\s+IS\s+NULL/gi, (m, a) => `${name(a)} is empty`)
    .replace(/(\u0001\d+\u0002|(?!NOT\b)[A-Za-z_][\w.]*\([^()]*\)|(?!NOT\b)[\w.]+)\s+NOT\s+LIKE\s+\u0001(\d+)\u0002/gi, (m, a, n) => `${name(a)} does not match ${hold(`"${pattern(n).replace(/%/g, '…')}"`)}`)
    .replace(/(\u0001\d+\u0002|(?!NOT\b)[A-Za-z_][\w.]*\([^()]*\)|(?!NOT\b)[\w.]+)\s+I?LIKE\s+\u0001(\d+)\u0002/gi, (m, a, n) => { const p = pattern(n); return /^[^%_]+%$/.test(p) ? `${name(a)} starts with ${hold(`"${p.slice(0, -1)}"`)}` : /^%[^%_]+%$/.test(p) ? `${name(a)} contains ${hold(`"${p.slice(1, -1)}"`)}` : `${name(a)} matches ${hold(`"${p.replace(/%/g, '…')}"`)}`; })
    .replace(/([\w."]+)\s+BETWEEN\s+(\S+)\s+AND\s+(\S+)/gi, (m, a, lo, hi) => `${name(a)} is from ${lo} to ${hi}`)
    .replace(/\s*(<>|!=)\s*/g, ' is not ').replace(/\s*>=\s*/g, ' is at least ').replace(/\s*<=\s*/g, ' is at most ')
    .replace(/\s*>\s*/g, ' is more than ').replace(/\s*<\s*/g, ' is less than ').replace(/\s*=\s*/g, ' is ')
    .replace(/\bAND\b/gi, 'and').replace(/\bOR\b/gi, 'or').replace(/\bNOT\s+/gi, 'not ')
    .replace(/\b(?:length|char_length)\s*\(\s*([\w."]+)\s*\)/gi, (m, a) => `the length of ${name(a)}`)
    .replace(/\b[a-z_]\w*\.([a-z_]\w*)(?=\s*\()/gi, (m, fn) => hold(/^[A-Z_]+$/.test(fn) ? fn : words(fn)))
    .replace(/\b(?!is\b|and\b|or\b|not\b|at\b|least\b|most\b|more\b|less\b|than\b|one\b|of\b|the\b|set\b|empty\b|from\b|to\b|new\b|old\b|starts\b|with\b|contains\b|does\b|match\b|matches\b|in\b|results\b|a\b|query\b|length\b|s\b(?!\.))([a-z_][\w]*\.)?([a-z_][\w]*)\b/gi, (m, t, col) => (t ? name(`${t}${col}`) : /^[A-Z_]+$/.test(col) && col.length > 1 ? m : plain(col)))
    .replace(/\s*\u0003\s*/g, ' is the same as ').replace(/\s*\u0004\s*/g, ' is not the same as ')
    .replace(/\s+/g, ' ').trim();
  const said = back(out);
  if (vars && !raw && /(?:^|\(|\b(?:and|or|not) )((?:the [\w ]+'s )?[a-z][\w ]*?) (?:is (?:not )?(?:the same as )?|and |or )\1(?=$|[\s),])/.test(said)) return sqlCondition(cond, { aliases, vars, keepAt, raw: true });
  return said;
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
export function selectSteps(sql, line, { give = true, vars = false } = {}) {
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

/** The offset where a (1-based) line starts. */
function srcIndexOfLine(src, line) {
  let at = 0;
  for (let k = 1; k < line && at >= 0; k++) at = src.indexOf('\n', at) + 1;
  return Math.max(0, at);
}

/**
 * Why a .sql file is not read, when it is a template (dbt, Jinja): its SQL is only known once the template is filled
 * in, so reading it would be a guess. Null for plain SQL.
 */
export function sqlTemplateReason(src) {
  const m = mask(src);
  if (/\{\{[\s\S]{0,400}?\}\}|\{%-?[\s\S]{0,400}?-?%\}/.test(m)) return 'A dbt or Jinja template ({{ … }} / {% … %}): its SQL is only known once the template is filled in, so it is not read, never guessed.';
  return null;
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
      says: extra.says ?? `${words(name)} has ${steps.length} step${steps.length === 1 ? '' : 's'}.`, headline: extra.headline ?? `${words(name)}.`, guards: [], unread: extra.unread ?? [],
      // The member spans its whole definition, not only its first line.
      ...(extra.endLine && extra.endLine > line ? { endLine: extra.endLine } : {}) });
  };
  // Views: the query, as steps.
  for (const v of m.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)(?:\s*\([^)]*\))?\s+AS\s+/gi)) {
    const end = m.indexOf(';', v.index);
    const query = src.slice(v.index + v[0].length, end < 0 ? src.length : end);
    const name = bare(v[1]);
    push(name, lineAt(v.index), selectSteps(query, lineAt(v.index + v[0].length)), { doc: docAbove(src, v.index), endLine: lineAt(end < 0 ? src.length : end), says: `${words(name)} is a saved query.`, headline: `${words(name)}: a saved query.` });
  }
  // Functions and procedures: their inputs and their body, read block by block (sql-proc.mjs).
  for (const r of sqlRoutines(src, lineAt)) {
    const inputs = r.inputs.map(({ name, type }) => ({ name, type }));
    const returns = r.returns ?? (r.outs.length ? listWords(r.outs.map((o) => words(o.name))) : null);
    const steps = r.unreadWhy ? [] : r.steps;
    push(r.name, r.line, steps, { inputs, returns, doc: docAbove(src, srcIndexOfLine(src, r.line)), endLine: r.endLine,
      ...(r.unreadWhy ? { unread: [{ line: r.line, text: src.split('\n')[r.line - 1].trim().slice(0, 120), reason: `Not read: ${r.unreadWhy}. Its code is shown instead.` }] } : {}),
      says: `${words(r.name)} takes ${inputs.length ? inputs.map((p) => words(p.name)).join(', ') : 'no inputs'}${returns ? ` and returns ${returns}` : ''}.`,
      headline: `${words(r.name)} takes ${inputs.length ? inputs.map((p) => words(p.name)).join(', ') : 'no inputs'}.` });
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
      // The database's refusal is described, not quoted: the code holds no such message.
      push(name, r.line, [{ kind: 'branch', says: `If not: ${cond}`, code: `CHECK (${r.cond})`, line: r.line, children: [{ kind: 'fail', says: `Fails with Refused by the database: the ${singular(table)} needs ${cond.replace(/"/g, "'")}`, error: 'Refused by the database', message: `The ${singular(table)} needs ${cond.replace(/"/g, "'")}`, code: `CHECK (${r.cond})`, line: r.line }] }],
        { says: `Every ${singular(table)} must have ${cond}.`, headline: `Every ${singular(table)} must have ${cond}.` });
    } else {
      const cols = listWords(r.cols.map(words));
      push(r.name || `unique_${r.cols.join('_and_')}`, r.line, [{ kind: 'branch', says: `If not: no other ${singular(table)} has the same ${cols}`, code: `UNIQUE (${r.cols.join(', ')})`, line: r.line, children: [{ kind: 'fail', says: `Fails with Refused by the database: each ${cols} can be used only once`, error: 'Refused by the database', message: `Each ${cols} can be used only once`, code: `UNIQUE (${r.cols.join(', ')})`, line: r.line }] }],
        { says: `Each ${cols} can be used by only one ${singular(table)}.`, headline: `Each ${cols} can be used by only one ${singular(table)}.` });
    }
  }
  items.sort((a, b) => a.line - b.line);
  return items;
}

// Shared with the routine reader (sql-proc.mjs).
export { words as sqlWords, bare as sqlBare, singular as sqlSingular, typeWords as sqlTypeWords, listWords as sqlListWords };
