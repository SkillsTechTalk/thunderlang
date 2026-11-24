// R in Thunder. A linear tokenizer and statement reader for R: `name <- function(a, b = 3) { … }` (and `=`, `<<-`),
// if / else if / else, for, while, repeat, switch() (cases), stop() as a Stop with its message, warning(), message(),
// tryCatch(error = …, warning = …, finally = …) as handlers and an always-at-the-end, return() and the implicit last
// value, library()/require() as setup, data-frame pipelines (|> and %>%) as one step per verb ("Keeps only the rows
// where x is more than 1"), lapply/purrr::map as loops, R6Class / setRefClass / setClass as Things, roxygen #' and
// plumber #* @get /path annotations, and testthat tests. Deterministic, browser-safe; what it cannot say keeps its code.
import { words, cap, listWords, gerund } from './commands.mjs';

function lineFinder(src) {
  const starts = [0];
  for (let i = src.indexOf('\n'); i >= 0; i = src.indexOf('\n', i + 1)) starts.push(i + 1);
  return (idx) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo + 1; };
}

// ── Tokens ────────────────────────────────────────────────────────────────────────────────────────────

const OPS = [':::', '<<-', '->>', '|>', '<-', '->', '<=', '>=', '==', '!=', '&&', '||', '::', '[[', '(', ')', '{', '}', '[', ']', ',', ';', '=', '+', '-', '*', '/', '^', '~', '?', ':', '$', '@', '!', '&', '|', '<', '>', '\\'];
const CLOSE = { '(': ')', '{': '}', '[': ']', '[[': ']]' };

function tokenize(src) {
  const toks = [];
  const stack = [];
  let i = 0;
  const n = src.length;
  const push = (t, text, at, end, extra) => { const tok = { t, text, at, end, i: toks.length, ...extra }; toks.push(tok); return tok; };
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '﻿') { i++; continue; }
    if (c === '\n') { push('nl', '\n', i, i + 1); i++; continue; }
    if (c === '#') { let e = src.indexOf('\n', i); if (e < 0) e = n; push('comment', src.slice(i, e), i, e); i = e; continue; }
    const raw = src.slice(i, i + 3).match(/^[rR](["'])(-*)[([{]/) && src.slice(i).match(/^[rR](["'])(-*)([([{])/);
    if (raw) {
      const closer = { '(': ')', '[': ']', '{': '}' }[raw[3]] + raw[2] + raw[1];
      const e = src.indexOf(closer, i + raw[0].length);
      const end = e < 0 ? n : e + closer.length;
      push('str', src.slice(i, end), i, end, { value: src.slice(i + raw[0].length, e < 0 ? n : e) });
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, v = '';
      for (; j < n && src[j] !== c; j++) { if (src[j] === '\\') { const e = src[j + 1]; v += e === 'n' || e === 't' ? ' ' : e ?? ''; j++; } else v += src[j]; }
      push('str', src.slice(i, j + 1), i, Math.min(n, j + 1), { value: v });
      i = j + 1;
      continue;
    }
    if (c === '`') { const e = src.indexOf('`', i + 1); const end = e < 0 ? n : e + 1; push('id', src.slice(i + 1, end - 1), i, end); i = end; continue; }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] || ''))) {
      const m = src.slice(i, i + 60).match(/^(?:0[xX][\da-fA-F]+|\d*\.?\d+(?:[eE][+-]?\d+)?|\d+\.)[Li]?/);
      push('num', m[0], i, i + m[0].length);
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_.]/.test(c)) {
      const m = src.slice(i, i + 200).match(/^[A-Za-z_.][\w.]*/);
      push('id', m[0], i, i + m[0].length);
      i += m[0].length;
      continue;
    }
    if (c === '%') { const e = src.indexOf('%', i + 1); const nl = src.indexOf('\n', i); if (e > 0 && (nl < 0 || e < nl)) { push('op', src.slice(i, e + 1), i, e + 1); i = e + 1; continue; } }
    if (c === ']' && stack[stack.length - 1]?.text === '[[' && src[i + 1] === ']') {
      const t = push('op', ']]', i, i + 2);
      stack.pop().match = t.i;
      i += 2;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i)) ?? c;
    const t = push('op', op, i, i + op.length);
    if (CLOSE[op]) stack.push(t);
    else if (op === ')' || op === '}' || op === ']') {
      for (let k = stack.length - 1; k >= 0; k--) if (CLOSE[stack[k].text] === op) { stack[k].match = t.i; stack.length = k; break; }
    }
    i += op.length;
  }
  return toks;
}

// ── Statements ────────────────────────────────────────────────────────────────────────────────────────

const BINARY = new Set(['<-', '<<-', '=', '->', '->>', '|>', '+', '-', '*', '/', '^', '~', '==', '!=', '<', '>', '<=', '>=', '&', '&&', '|', '||', ',', '$', '@', ':', '::', ':::', '!', '?', '\\']);
const isOp = (t, v) => t && t.t === 'op' && t.text === v;
const isId = (t, v) => t && t.t === 'id' && t.text === v;

/** Statement ranges in toks[from..to): R ends a statement at a line break once the expression is complete. */
function splitStatements(toks, from, to) {
  const out = [];
  let i = from;
  while (i < to) {
    while (i < to && (toks[i].t === 'nl' || toks[i].t === 'comment' || isOp(toks[i], ';'))) i++;
    if (i >= to) break;
    const s = i;
    let needBody = false;
    while (i < to) {
      const t = toks[i];
      if (t.match != null && t.match < to) {
        const before = toks[i - 1];
        // `if (…)`, `for (…)`, `while (…)`, `function(…)` still need their body.
        needBody = isOp(t, '(') && before && (isId(before, 'if') || isId(before, 'for') || isId(before, 'while') || isId(before, 'function') || isOp(before, '\\'));
        i = t.match + 1;
        continue;
      }
      if (isOp(t, ';')) break;
      if (t.t === 'nl' || t.t === 'comment') {
        let k = i;
        while (k < to && (toks[k].t === 'nl' || toks[k].t === 'comment')) k++;
        let p = i - 1;
        while (p > s && toks[p].t === 'comment') p--;
        const prev = toks[p];
        if (needBody || (prev && prev.t === 'op' && (BINARY.has(prev.text) || /^%.*%$/.test(prev.text))) || isId(prev, 'else') || isId(prev, 'repeat') || isId(toks[k], 'else')) { i = k; needBody = false; continue; }
        break;
      }
      needBody = isId(t, 'else') || isId(t, 'repeat');
      i++;
    }
    out.push([s, i]);
  }
  return out;
}

const at0 = (list) => list.filter((t) => t.t !== 'nl' && t.t !== 'comment');
/** Top-level items of a token list: each a token, or a bracket with its contents. */
function groups(list) {
  const out = [];
  let cur = null, depth = 0;
  for (const t of list) {
    if (depth === 0) { cur = [t]; out.push(cur); } else cur.push(t);
    if (t.t === 'op' && CLOSE[t.text]) depth++;
    else if (t.t === 'op' && (t.text === ')' || t.text === '}' || t.text === ']' || t.text === ']]')) depth = Math.max(0, depth - 1);
  }
  return out;
}
/** Arguments of a call: [{ name, toks }] split at top-level commas. */
function argsOf(list) {
  const parts = [[]];
  for (const g of groups(at0(list))) { if (g.length === 1 && isOp(g[0], ',')) parts.push([]); else parts[parts.length - 1].push(...g); }
  return parts.map((p) => (p.length >= 2 && (p[0].t === 'id' || p[0].t === 'str') && isOp(p[1], '=') ? { name: p[0].t === 'str' ? p[0].value : p[0].text, toks: p.slice(2) } : { name: null, toks: p }));
}

// ── Words ─────────────────────────────────────────────────────────────────────────────────────────────

const rWords = (name) => { const w = words(String(name).replace(/^\.+/, '').replace(/\./g, ' ')); return w || String(name); };
const quote = (s) => `"${s.length > 100 ? `${s.slice(0, 99)}…` : s}"`;
const AGG = { sum: 'the total of', mean: 'the average of', median: 'the middle value of', max: 'the highest', min: 'the lowest', sd: 'how spread out', n_distinct: 'how many different', first: 'the first', last: 'the last' };

/** A call's text parts: paste0("a", x) -> "a{x}". */
function textOf(args, sep = '') {
  return args.filter((a) => !a.name).map((a) => { const v = at0(a.toks); return v.length === 1 && v[0].t === 'str' ? v[0].value : `{${(sayValue(a.toks) ?? '…').replace(/^"|"$/g, '')}}`; }).join(sep);
}
const glueText = (s) => String(s).replace(/\{([^{}]+)\}/g, (m, x) => `{${rWords(x.trim())}}`);

/** A value in words, or null when Thunder will not guess. */
function sayValue(list) {
  const v = at0(list);
  if (!v.length) return null;
  const g = groups(v);
  if (g.length === 1 && g[0].length === 1) {
    const t = g[0][0];
    if (t.t === 'str') return quote(t.value);
    if (t.t === 'num') return t.text.replace(/L$/, '');
    if (t.t === 'id') return { TRUE: 'yes', FALSE: 'no', T: 'yes', F: 'no', NULL: 'nothing', NA: 'missing', Inf: 'infinity' }[t.text] ?? rWords(t.text);
  }
  if (g.length === 2 && isOp(g[0][0], '-') && g[1].length === 1 && g[1][0].t === 'num') return `-${g[1][0].text.replace(/L$/, '')}`;
  // a %||% b: a, or b when a is not set (rlang and base R 4.4).
  const orNull = g.findIndex((x, k) => k > 0 && x.length === 1 && isOp(x[0], '%||%'));
  if (orNull > 0) { const a = sayValue(g.slice(0, orNull).flat()), b = sayValue(g.slice(orNull + 1).flat()); return a && b ? `${a} (or ${b} when it is not set)` : null; }
  // f(x)$field: a fact about what a call gives back.
  if (g.length >= 3 && g[g.length - 1].length === 1 && g[g.length - 1][0].t === 'id' && isOp(g[g.length - 2][0], '$') && g.slice(0, -2).some((x) => isOp(x[0], '('))) {
    const owner = sayValue(g.slice(0, -2).flat());
    if (owner && /^the result of /.test(owner)) return `the ${rWords(g[g.length - 1][0].text)} from ${owner.replace(/^the result of /, '')}`;
  }
  // obj$method(args): what the method gives back.
  const lg = g[g.length - 1];
  if (g.length >= 4 && isOp(lg[0], '(') && g[g.length - 2][0].t === 'id' && isOp(g[g.length - 3][0], '$')) {
    const owner = sayValue(g.slice(0, -3).flat());
    if (owner) return `the result of ${rWords(g[g.length - 2][0].text)} on ${owner}`;
  }
  // Binary operators, lowest first.
  for (const [ops, say] of [[['||', '|', '&&', '&'], null], [['==', '!=', '<', '>', '<=', '>=', '%in%'], null], [['+', '-'], { '+': 'plus', '-': 'minus' }], [['*', '/', '%%', '%/%'], { '*': 'times', '/': 'divided by', '%%': 'remainder after dividing by', '%/%': 'divided by (whole number)' }], [['^'], { '^': 'to the power of' }], [[':'], { ':': 'to' }]]) {
    let at = -1;
    for (let k = g.length - 1; k > 0; k--) if (g[k].length === 1 && g[k][0].t === 'op' && ops.includes(g[k][0].text)) { at = k; break; }
    if (at > 0) {
      if (!say) { const c = condWords(v, false); return c ? `whether ${c}` : null; }
      const a = sayValue(g.slice(0, at).flat()), b = sayValue(g.slice(at + 1).flat());
      return a && b ? `${a} ${say[g[at][0].text]} ${b}` : null;
    }
  }
  if (g.length === 2 && isOp(g[0][0], '!')) { const c = condWords(v, false); return c ? `whether ${c}` : null; }
  // x$y, x[["y"]], x@y, pkg::name
  if (v[0].t === 'id' && g.every((x, k) => k === 0 || (x.length === 1 && (x[0].t === 'id' || isOp(x[0], '$') || isOp(x[0], '@'))) || (x[0].text === '[[' && x.length === 3 && x[1].t === 'str'))) {
    const parts = [v[0].text];
    for (let k = 1; k < g.length; k++) { const x = g[k]; if (x[0].t === 'id') parts.push(x[0].text); else if (x[0].text === '[[') parts.push(x[1].value); }
    if (parts.length >= 2) {
      const owns = (x) => (/s$/.test(x) ? `${x}'` : `${x}'s`);
      const owner = parts.length > 2 ? `${owns(`the ${rWords(parts[parts.length - 3])}`)} ${rWords(parts[parts.length - 2])}` : rWords(parts[0]);
      return owner === 'self' || owner === 'private' || owner === 'self' ? rWords(parts.at(-1)) : `${owns(/^the /.test(owner) ? owner : `the ${owner}`)} ${rWords(parts.at(-1))}`;
    }
  }
  // x[rows, cols]: the rows of x where …, or an item of x.
  const last = g[g.length - 1];
  if (g.length >= 2 && last[0].text === '[' && last.length > 2) {
    const owner = sayValue(g.slice(0, -1).flat());
    if (owner) {
      const parts = argsOf(last.slice(1, -1));
      const rows = parts[0] && at0(parts[0].toks).length ? parts[0].toks : null;
      if (parts.length === 2 && rows) { const c = condWords(rows, false); if (c) return `the rows of ${owner} where ${c}`; }
      return `part of ${owner}`;
    }
  }
  if (g.length >= 2 && last[0].text === '[[' ) { const owner = sayValue(g.slice(0, -1).flat()); if (owner) return `an item of ${owner}`; }
  const call = callOf(v);
  if (call) return callNoun(call) ?? (callVerb(call) ? `the result of ${gerund(callVerb(call))}` : `the result of ${rWords(call.name)}`);
  if (g.length === 1 && isOp(g[0][0], '(')) return sayValue(g[0].slice(1, -1));
  if (isId(v[0], 'function') || isOp(v[0], '\\')) return 'a small function';
  return null;
}

/** `pkg::name(args)` or `name(args)` taking the whole list. */
function callOf(v) {
  let k = 0, name = '';
  if (v[0]?.t !== 'id') return null;
  name = v[0].text;
  if (isOp(v[1], '::') || isOp(v[1], ':::')) { if (v[2]?.t !== 'id') return null; name = `${v[0].text}::${v[2].text}`; k = 2; }
  const open = v[k + 1];
  if (!isOp(open, '(') || open.match == null) return null;
  const close = v.findIndex((t) => t.i === open.match);
  if (close !== v.length - 1) return null;
  const bare = name.replace(/^\w+:::?/, '');
  return { name, bare, args: argsOf(v.slice(k + 2, close)), open, close: v[close] };
}

/** A call as a noun phrase ("the total of x"), or null. */
function callNoun({ bare, args }) {
  const a0 = args[0] ? sayValue(args[0].toks) : null;
  switch (bare) {
    case 'c': case 'list': case 'vector': return args.length && at0(args[0].toks).length ? `the list ${listWords(args.slice(0, 6).map((a) => (a.name ? `${rWords(a.name)} = ${sayValue(a.toks) ?? '…'}` : sayValue(a.toks) ?? '…')))}` : 'an empty list';
    case 'character': case 'numeric': case 'integer': case 'logical': return 'an empty list';
    case 'paste0': return quote(textOf(args));
    case 'paste': return quote(textOf(args, ' '));
    case 'sprintf': { const fmt = at0(args[0]?.toks ?? [])[0]; let k = 1; return fmt?.t === 'str' ? quote(fmt.value.replace(/%[-\d.]*[sdfi]/g, () => `{${(sayValue(args[k++]?.toks ?? []) ?? '…').replace(/^"|"$/g, '')}}`)) : null; }
    case 'glue': case 'str_glue': { const s = at0(args[0]?.toks ?? [])[0]; return s?.t === 'str' ? quote(glueText(s.value)) : null; }
    case 'nrow': return `the number of rows in ${a0 ?? 'it'}`;
    case 'ncol': return `the number of columns in ${a0 ?? 'it'}`;
    case 'length': case 'NROW': return `how many ${a0 ?? 'items'}`;
    case 'nchar': return `the length of ${a0 ?? 'the text'}`;
    case 'n': return 'how many rows';
    case 'Sys.time': case 'now': return 'the current time';
    case 'Sys.Date': case 'today': return "today's date";
    case 'Sys.getenv': return `the ${at0(args[0]?.toks ?? [])[0]?.value ? rWords(at0(args[0].toks)[0].value) : 'environment'} setting`;
    case 'file.path': return quote(args.map((a) => { const x = at0(a.toks); return x.length === 1 && x[0].t === 'str' ? x[0].value : `{${(sayValue(a.toks) ?? '…').replace(/^"|"$/g, '')}}`; }).join('/'));
    case 'toupper': return `${a0} in capital letters`;
    case 'tolower': return `${a0} in small letters`;
    case 'round': return `${a0} rounded`;
    case 'abs': return `the size of ${a0} (without its sign)`;
    case 'seq_along': return `the positions in ${a0}`;
    case 'seq_len': return `1 to ${a0}`;
    case 'invisible': return a0;
    case 'conditionMessage': return `the message of ${a0 ?? 'the error'}`;
    case 'data.frame': case 'tibble': case 'data.table': return args.length ? `a table of ${listWords(args.filter((x) => x.name).map((x) => rWords(x.name)).slice(0, 6))}` : 'an empty table';
    case 'new': return `a new ${at0(args[0]?.toks ?? [])[0]?.value ?? 'object'}`;
    case 'is.null': case 'is.na': case 'file.exists': case 'dir.exists': case 'nzchar': case 'isTRUE': case 'isFALSE': case 'inherits': case 'identical': case 'exists': case 'missing': case 'is.character': case 'is.numeric': case 'is.function': case 'is.list': case 'is.data.frame': case 'any': case 'all': { const c = condWords([...[]], false, { bare, args }); return c ? `whether ${c}` : null; }
    default: return AGG[bare] && a0 ? `${AGG[bare]} ${a0}` : null;
  }
}
/** A call as a verb phrase ("Reads the CSV file "orders.csv""), or null. */
function callVerb({ bare, name, args }) {
  const a0 = args[0] ? sayValue(args[0].toks) : null;
  const named = (k) => { const x = args.find((a) => a.name === k); return x ? sayValue(x.toks) : null; };
  switch (bare) {
    case 'read.csv': case 'read_csv': case 'fread': case 'read.csv2': case 'read_tsv': case 'read.delim': return `Reads the ${/tsv|delim/.test(bare) ? 'TSV' : 'CSV'} file ${a0 ?? '?'}`;
    case 'readRDS': case 'read_rds': return `Reads the R data file ${a0 ?? '?'}`;
    case 'readLines': case 'read_lines': return `Reads the lines of ${a0 ?? '?'}`;
    case 'read_excel': case 'read.xlsx': return `Reads the Excel file ${a0 ?? '?'}`;
    case 'fromJSON': case 'read_json': return `Reads the JSON ${a0 ?? ''}`.trim();
    case 'write.csv': case 'write_csv': case 'fwrite': return `Saves ${a0 ?? 'the table'} to the CSV file ${named('file') ?? (args[1] ? sayValue(args[1].toks) : '?')}`;
    case 'saveRDS': case 'write_rds': return `Saves ${a0 ?? 'it'} to the R data file ${named('file') ?? (args[1] ? sayValue(args[1].toks) : '?')}`;
    case 'writeLines': case 'write_lines': return `Writes ${a0 ?? 'the lines'}${args[1] || named('con') ? ` to ${named('con') ?? sayValue(args[1].toks)}` : ''}`;
    case 'toJSON': return 'Turns it into JSON';
    case 'GET': case 'POST': case 'PUT': case 'DELETE': case 'PATCH': case 'HEAD': return `Sends a ${bare} request to ${a0 ?? '?'}`;
    case 'request': return `Prepares a request to ${a0 ?? '?'}`;
    case 'req_perform': return 'Sends the request';
    case 'download.file': return `Downloads ${a0 ?? '?'}${args[1] ? ` to ${sayValue(args[1].toks)}` : ''}`;
    case 'dir.create': return `Makes the folder ${a0 ?? '?'}`;
    case 'unlink': case 'file.remove': return `Deletes ${a0 ?? '?'}`;
    case 'file.copy': return `Copies ${a0 ?? '?'} to ${args[1] ? sayValue(args[1].toks) : '?'}`;
    case 'setwd': return `Goes into the folder ${a0 ?? '?'}`;
    case 'Sys.setenv': return `Sets ${listWords(args.filter((x) => x.name).map((x) => `the ${rWords(x.name)} setting to ${sayValue(x.toks) ?? '…'}`))}`;
    case 'set.seed': return `Fixes the random numbers (seed ${a0 ?? '?'}) so results repeat`;
    case 'print': return `Shows ${a0 ?? 'it'}`;
    case 'cat': return `Shows ${quote(textOf(args).trim())}`;
    case 'message': case 'inform': case 'cli_alert_info': case 'cli_inform': case 'cli_alert': case 'cli_alert_success': return `Writes a message: ${quote(bare.startsWith('cli') || bare === 'inform' ? glueText(textOf(args)) : textOf(args))}`;
    case 'warning': case 'warn': case 'cli_warn': case 'cli_alert_warning': return `Warns: ${quote(bare.startsWith('cli') || bare === 'warn' ? glueText(textOf(args)) : textOf(args.filter((x) => x.name !== 'call.')))}`;
    case 'ggplot': return `Draws a chart of ${a0 ?? 'the data'}`;
    case 'ggsave': return `Saves the chart to ${a0 ?? '?'}`;
    case 'plot': case 'hist': case 'barplot': case 'boxplot': return `Draws a ${bare === 'hist' ? 'histogram' : bare === 'plot' ? 'chart' : bare} of ${a0 ?? 'the data'}`;
    case 'lm': case 'glm': return `Fits a ${bare === 'lm' ? 'straight-line' : 'general'} model: ${a0 ?? 'a formula'}`;
    case 'Sys.sleep': return `Waits ${a0 ?? '?'} seconds`;
    case 'match.arg': return `Checks that ${a0 ?? 'the choice'} is one of the allowed choices`;
    case 'system': case 'system2': return `Runs the command ${a0 ?? '?'}`;
    case 'dbConnect': return 'Connects to the database';
    case 'dbGetQuery': case 'dbReadTable': return 'Reads from the database';
    case 'dbExecute': case 'dbWriteTable': case 'dbAppendTable': return 'Writes to the database';
    case 'dbDisconnect': return 'Disconnects from the database';
    case 'assign': return `Sets ${a0 ?? 'a value'} to ${args[1] ? sayValue(args[1].toks) ?? 'a value' : 'a value'}`;
    case 'rm': return `Forgets ${listWords(args.filter((x) => !x.name).map((x) => sayValue(x.toks) ?? '…'))}`;
    case 'invisible': return null;
    case 'deprecate_warn': case 'deprecate_soft': return `Warns that ${a0 ? `${a0} is` : 'this is'} out of date (deprecated)`;
    case 'signal_stage': return `Marks this as ${a0 ?? 'changing'}`;
    default:
      if (/^(?:\w+_)?check_\w+$/.test(bare)) { const what = rWords(bare.replace(/^(?:\w+_)?check_/, '')); return a0 && a0 !== 'nothing' ? `Checks that ${a0} is a valid ${what}` : `Runs the check ${what}`; }
      return KNOWN_FNS.has(name) ? `Runs ${rWords(bare)}${args.length ? ` with ${listWords(args.slice(0, 4).map((x) => (x.name ? rWords(x.name) : sayValue(x.toks) ?? 'a value')))}` : ''}` : null;
  }
}

const CMP = { '==': ['is', 'is not'], '!=': ['is not', 'is'], '>': ['is more than', 'is at most'], '>=': ['is at least', 'is less than'], '<': ['is less than', 'is at least'], '<=': ['is at most', 'is more than'], '%in%': ['is one of', 'is not one of'] };
const KIND_IS = { 'is.character': 'text', 'is.numeric': 'a number', 'is.function': 'a function', 'is.list': 'a list', 'is.data.frame': 'a table', 'is.logical': 'yes or no', 'is.factor': 'a set of categories', 'is.environment': 'an environment' };
/** A condition in words: `x > 1 && !is.null(y)` -> "x is more than 1 and y is set". */
function condWords(list, neg, preCall = null) {
  const v = at0(list);
  if (!v.length && !preCall) return null;
  const g = groups(v);
  for (const [ops, join, flip] of [[['||', '|'], ' or ', ' and '], [['&&', '&'], ' and ', ' or ']]) {
    const parts = [[]];
    for (const x of g) { if (x.length === 1 && x[0].t === 'op' && ops.includes(x[0].text)) parts.push([]); else parts[parts.length - 1].push(...x); }
    if (parts.length > 1) { const said = parts.map((p) => condWords(p, neg)); return said.some((s) => !s) ? null : said.join(neg ? flip : join); }
  }
  if (!preCall && isOp(g[0]?.[0], '!')) return condWords(v.slice(1), !neg);
  if (!preCall && g.length === 1 && isOp(g[0][0], '(')) return condWords(g[0].slice(1, -1), neg);
  if (!preCall) {
    for (let k = g.length - 1; k > 0; k--) {
      const x = g[k];
      if (x.length === 1 && x[0].t === 'op' && CMP[x[0].text]) {
        const a = sayValue(g.slice(0, k).flat()), b = sayValue(g.slice(k + 1).flat());
        return a && b ? `${a} ${CMP[x[0].text][neg ? 1 : 0]} ${b}` : null;
      }
    }
  }
  const call = preCall ?? callOf(v);
  if (call) {
    const a0 = call.args[0] ? sayValue(call.args[0].toks) : null;
    const yes = (p, n) => (neg ? n : p);
    switch (call.bare) {
      case 'is.null': return `${a0} is ${yes('empty', 'set')}`;
      case 'is.na': return `${a0} is ${yes('missing', 'not missing')}`;
      case 'missing': return `${a0} was ${yes('not given', 'given')}`;
      case 'file.exists': return `the file ${a0} ${yes('exists', 'does not exist')}`;
      case 'dir.exists': return `the folder ${a0} ${yes('exists', 'does not exist')}`;
      case 'exists': return `${a0} ${yes('exists', 'does not exist')}`;
      case 'nzchar': return `${a0} is ${yes('not empty', 'empty')}`;
      case 'isTRUE': return `${a0} is ${yes('yes', 'not yes')}`;
      case 'isFALSE': return `${a0} is ${yes('no', 'not no')}`;
      case 'inherits': case 'is': return `${a0} is ${yes('', 'not ')}a ${call.args[1] ? (at0(call.args[1].toks)[0]?.value ?? sayValue(call.args[1].toks)) : 'kind'}`;
      case 'identical': return `${a0} is ${yes('', 'not ')}${call.args[1] ? sayValue(call.args[1].toks) : '?'}`;
      case 'interactive': return `it is ${yes('', 'not ')}running with a person at the keyboard`;
      case 'requireNamespace': return `the ${at0(call.args[0]?.toks ?? [])[0]?.value ?? 'needed'} package is ${yes('installed', 'not installed')}`;
      case 'any': return `${yes('any', 'none')} of ${a0 ?? 'them'}${call.args[0] ? '' : ''} ${neg ? 'holds' : 'holds'}`.replace(/ +/g, ' ');
      case 'all': return `${yes('all', 'not all')} of ${a0 ?? 'them'} hold`;
      default:
        if (KIND_IS[call.bare]) return `${a0} is ${yes('', 'not ')}${KIND_IS[call.bare]}`;
        return `${yes('', 'not: ')}${rWords(call.bare)}${a0 ? ` (${a0})` : ''}`;
    }
  }
  const val = sayValue(v);
  if (!val) return null;
  if (val === 'yes' || val === 'no') return (val === 'yes') !== neg ? 'always' : 'never';
  return neg ? `not ${val}` : val;
}

/** A condition as an expression the Thunder decision reader understands (`score >= 90 && member`), or null. */
function condJs(list) {
  const out = [];
  const v = at0(list);
  for (let k = 0; k < v.length; k++) {
    const t = v[k];
    if (t.t === 'id') { if (/^(TRUE|T)$/.test(t.text)) out.push('true'); else if (/^(FALSE|F)$/.test(t.text)) out.push('false'); else if (/^(NULL|NA)$/.test(t.text) || isOp(v[k + 1], '(')) return null; else out.push(t.text.replace(/\./g, '_')); continue; }
    if (t.t === 'num') { out.push(t.text.replace(/L$/, '')); continue; }
    if (t.t === 'str') { out.push(JSON.stringify(t.value)); continue; }
    const m = { '==': '==', '!=': '!=', '<': '<', '>': '>', '<=': '<=', '>=': '>=', '&&': '&&', '&': '&&', '||': '||', '|': '||', '!': '!', '(': '(', ')': ')', $: '.' }[t.text];
    if (!m) return null;
    out.push(m);
  }
  return out.join(' ').replace(/ \. /g, '.');
}
const fixedOf = (list) => {
  const v = at0(list);
  if (v.length === 1 && v[0].t === 'str') return v[0].value ? JSON.stringify(v[0].value) : null;
  if (v.length === 1 && v[0].t === 'num' && /^\d+(\.\d+)?L?$/.test(v[0].text)) return v[0].text.replace(/L$/, '');
  if (v.length === 2 && isOp(v[0], '-') && v[1].t === 'num') return `-${v[1].text.replace(/L$/, '')}`;
  if (v.length === 1 && v[0].t === 'id' && /^(TRUE|FALSE)$/.test(v[0].text)) return v[0].text.toLowerCase();
  const call = callOf(v);
  if (call && (call.bare === 'return' || call.bare === 'invisible') && call.args.length === 1) return fixedOf(call.args[0].toks);
  return null;
};

// ── Pipelines: data-frame verbs as steps ─────────────────────────────────────────────────────────────────

const colsOf = (args) => listWords(args.map((a) => (a.name ? rWords(a.name) : sayValue(a.toks) ?? '…')).slice(0, 6));
function verbStep(call) {
  const { bare, args } = call;
  const plain = args.filter((a) => !a.name);
  switch (bare) {
    case 'filter': case 'subset': { const c = plain.map((a) => condWords(a.toks, false)); return { kind: 'call', callee: 'filter', says: `Keeps only the rows where ${c.every(Boolean) ? c.join(' and ') : 'a condition holds'}` }; }
    case 'select': { const drop = plain.every((a) => isOp(at0(a.toks)[0], '-')); return { kind: 'call', callee: 'select', says: drop ? `Drops the column${plain.length > 1 ? 's' : ''} ${listWords(plain.map((a) => sayValue(at0(a.toks).slice(1)) ?? '…'))}` : `Keeps only the column${args.length > 1 ? 's' : ''} ${colsOf(args)}` }; }
    case 'mutate': case 'transmute': return { kind: 'set', says: args.filter((a) => a.name).map((a) => `Works out the column ${rWords(a.name)}: ${sayValue(a.toks) ?? 'a calculation'}`).join('; ') || 'Changes some columns' };
    case 'summarise': case 'summarize': return { kind: 'set', says: `Sums up ${args.some((a) => a.name === '.by') ? 'each group' : 'the rows'}: ${args.filter((a) => a.name && a.name !== '.by' && a.name !== '.groups').map((a) => `${rWords(a.name)} is ${sayValue(a.toks) ?? 'a calculation'}`).join(', ')}` };
    case 'group_by': return { kind: 'set', says: `Groups the rows by ${colsOf(args)}` };
    case 'ungroup': return { kind: 'set', says: 'Stops grouping the rows' };
    case 'arrange': return { kind: 'set', says: `Sorts the rows by ${listWords(args.map((a) => { const c = callOf(at0(a.toks)); return c?.bare === 'desc' ? `${sayValue(c.args[0]?.toks ?? []) ?? '…'}, highest first` : sayValue(a.toks) ?? '…'; }))}` };
    case 'head': case 'slice_head': { const n = args.find((a) => a.name === 'n') ?? plain[bare === 'head' ? 1 : 0]; return { kind: 'set', says: `Takes the first ${n ? sayValue(n.toks) : bare === 'head' ? '6' : '1'} rows` }; }
    case 'tail': case 'slice_tail': { const n = args.find((a) => a.name === 'n') ?? plain[bare === 'tail' ? 1 : 0]; return { kind: 'set', says: `Takes the last ${n ? sayValue(n.toks) : '6'} rows` }; }
    case 'slice_max': case 'slice_min': { const n = args.find((a) => a.name === 'n'); return { kind: 'set', says: `Takes the ${n ? sayValue(n.toks) : '1'} rows with the ${bare === 'slice_max' ? 'highest' : 'lowest'} ${plain[0] ? sayValue(plain[0].toks) : 'value'}` }; }
    case 'left_join': case 'inner_join': case 'right_join': case 'full_join': case 'merge': { const by = args.find((a) => a.name === 'by'); const other = plain[0] ? sayValue(plain[0].toks) : 'the other table'; return { kind: 'call', callee: 'find', says: `${bare === 'inner_join' ? 'Keeps only the rows that match' : 'Adds the matching rows from'} ${other}${by ? `, by ${sayValue(by.toks)}` : ''}` }; }
    case 'anti_join': return { kind: 'call', callee: 'filter', says: `Keeps only the rows with no match in ${plain[0] ? sayValue(plain[0].toks) : 'the other table'}` };
    case 'count': case 'tally': return { kind: 'set', says: args.length ? `Counts the rows for each ${colsOf(plain)}` : 'Counts the rows' };
    case 'distinct': case 'unique': return { kind: 'set', says: args.length ? `Keeps one row for each ${colsOf(plain)}` : 'Removes repeated rows' };
    case 'rename': return { kind: 'set', says: `Renames ${listWords(args.filter((a) => a.name).map((a) => `${sayValue(a.toks) ?? '…'} to ${rWords(a.name)}`))}` };
    case 'pull': return { kind: 'set', says: `Takes out the column ${plain[0] ? sayValue(plain[0].toks) : 'it needs'}` };
    case 'drop_na': case 'na.omit': return { kind: 'call', callee: 'filter', says: 'Removes the rows with missing values' };
    case 'bind_rows': case 'rbind': return { kind: 'set', says: `Adds the rows of ${listWords(plain.map((a) => sayValue(a.toks) ?? '…'))}` };
    case 'pivot_longer': case 'pivot_wider': case 'gather': case 'spread': return { kind: 'set', says: `Reshapes the table ${/longer|gather/.test(bare) ? 'into more rows' : 'into more columns'}` };
    case 'nrow': return { kind: 'set', says: 'Counts the rows' };
    case 'print': return { kind: 'call', says: 'Shows it' };
    case 'as_tibble': case 'as.data.frame': case 'data.frame': return { kind: 'set', says: 'Turns it into a table' };
    default: {
      const verb = callVerb({ ...call, args: [{ name: null, toks: [] }, ...args] });
      if (verb) return { kind: 'call', says: verb.replace(/ \?/g, '') };
      const noun = callNoun(call);
      if (noun) return { kind: 'set', says: `Works out ${noun}` };
      return { kind: 'call', says: `Calls ${rWords(bare)}`, callee: bare };
    }
  }
}

// ── The reader ────────────────────────────────────────────────────────────────────────────────────────

let KNOWN_FNS = new Set();

function makeReader(src) {
  const toks = tokenize(src);
  const lineAt = lineFinder(src);
  const fns = [], things = [], errors = new Map(), tests = [], defs = [];
  const code = (s, e) => { const t = src.slice(toks[s].at, toks[e - 1].end).replace(/\s+/g, ' ').trim(); return t.length > 160 ? `${t.slice(0, 159)}…` : t; };
  const head = (s, e) => { const t = src.slice(toks[s].at, toks[e - 1].end).split('\n')[0].trim(); return t.length > 160 ? `${t.slice(0, 159)}…` : t; };
  const spanOf = (s, e) => ({ startLine: lineAt(toks[s].at), endLine: lineAt(toks[e - 1].end - 1) });
  const base = (s, e, c = code(s, e)) => ({ code: c, line: lineAt(toks[s].at), span: spanOf(s, e) });
  const next = (i, to) => { while (i < to && (toks[i].t === 'nl' || toks[i].t === 'comment')) i++; return i; };
  const range = (list) => [list[0].i, list[list.length - 1].i + 1];

  /** A body: `{ … }` (its statements) or one expression. Gives [from, to). */
  const bodyRange = (i, to) => { const k = next(i, to); return isOp(toks[k], '{') && toks[k].match != null && toks[k].match < to ? [k + 1, toks[k].match, true] : [k, to, false]; };

  function stepsIn(from, to, ctx = {}) {
    const out = [];
    const stmts = splitStatements(toks, from, to);
    stmts.forEach(([s, e], n) => {
      try { out.push(...statement(s, e, { ...ctx, last: ctx.last && n === stmts.length - 1 })); } catch (err) { if (typeof process !== 'undefined' && process.env?.R_DEBUG) console.error(err); out.push({ kind: 'other', says: code(s, e), ...base(s, e) }); }
    });
    return out;
  }
  /** Steps of an expression or block used as a branch, loop body, or handler. */
  const stepsOfBody = (i, to, ctx) => { const [a, b] = bodyRange(i, to); return a < b ? stepsIn(a, b, ctx) : []; };

  function ifSteps(s, e, ctx) {
    const open = next(s + 1, e);
    if (!isOp(toks[open], '(') || toks[open].match == null) return null;
    const close = toks[open].match;
    const condT = toks.slice(open + 1, close);
    // Then-part: a block, or an expression up to `else`.
    let k = next(close + 1, e), thenTo, elseAt = -1;
    if (isOp(toks[k], '{') && toks[k].match != null) { thenTo = toks[k].match + 1; const n2 = next(thenTo, e); if (isId(toks[n2], 'else')) elseAt = n2; }
    else { let d = k; for (; d < e; d++) { if (toks[d].match != null && toks[d].match < e) { d = toks[d].match; continue; } if (isId(toks[d], 'else')) { elseAt = d; break; } } thenTo = elseAt >= 0 ? elseAt : e; }
    const c = condWords(condT, false);
    const step = { kind: 'branch', says: `If ${c ?? `\`${code(open + 1, close)}\``}`, cond: condJs(condT), code: head(s, e), line: lineAt(toks[s].at), span: spanOf(s, e) };
    const kids = stepsOfBody(close + 1, thenTo, ctx);
    if (kids.length) step.children = kids;
    if (elseAt >= 0) {
      const after = next(elseAt + 1, e);
      if (isId(toks[after], 'if')) { const inner = ifSteps(after, e, ctx); if (inner) { inner.elseIf = true; inner.span = spanOf(after, e); step.otherwise = [inner]; } }
      else { step.otherwise = stepsOfBody(elseAt + 1, e, ctx); step.otherwiseLine = lineAt(toks[elseAt].at); }
    }
    return step;
  }

  /** The value an expression gives back, as a step (last statement of a function, or `return(x)`). */
  function returnStep(list, s, e) {
    const v = at0(list);
    const call = callOf(v);
    if (call && (call.bare === 'return' || call.bare === 'invisible') && call.args.length <= 1) {
      if (!call.args.length || !at0(call.args[0].toks).length) return { kind: 'return', says: 'Stops here', ...base(s, e) };
      return returnStep(call.args[0].toks, s, e);
    }
    const pipe = pipeline(v);
    if (pipe) return null;
    const said = sayValue(v);
    if (said) return { kind: 'return', says: `Returns ${said}`, ...base(s, e) };
    if (call) { const verb = callVerb(call); if (verb) return { kind: 'return', says: `Returns the result of ${gerund(verb)}`, ...base(s, e) }; }
    return { kind: 'return', says: 'Returns a computed value', restates: true, ...base(s, e) };
  }

  /** `x |> f() |> g()` or `x %>% f() %>% g()`: the source and each verb. Null when there is no pipe. */
  function pipeline(v) {
    const g = groups(v);
    const parts = [[]];
    for (const x of g) { if (x.length === 1 && (isOp(x[0], '|>') || isOp(x[0], '%>%'))) parts.push([]); else parts[parts.length - 1].push(...x); }
    return parts.length > 1 ? parts : null;
  }
  function pipelineSteps(parts, s, e) {
    const steps = [];
    const src0 = at0(parts[0]);
    const call0 = callOf(src0);
    const verb0 = call0 ? callVerb(call0) : null;
    steps.push(verb0 ? { kind: 'call', says: verb0 } : { kind: 'set', says: `Starts from ${sayValue(src0) ?? 'the data'}` });
    for (const p of parts.slice(1)) {
      const c = callOf(at0(p));
      steps.push(c ? verbStep(c) : { kind: 'other', says: at0(p).map((t) => t.text).join(' ') });
    }
    return steps.map((x) => ({ ...x, ...base(s, e) }));
  }

  /** The function value in `name <- function(…) body`: its params and body token range. */
  function fnValue(list) {
    const v = at0(list);
    if (!(isId(v[0], 'function') || isOp(v[0], '\\'))) return null;
    const open = v[1];
    if (!isOp(open, '(') || open.match == null) return null;
    const params = argsOf(toks.slice(open.i + 1, open.match)).filter((a) => a.name || at0(a.toks).length).map((a) => ({ name: a.name ?? at0(a.toks)[0]?.text, type: null, default: a.name ? a.toks : null }));
    const end = v[v.length - 1].i + 1;
    return { params: params.filter((p) => p.name && p.name !== '...'), from: open.match + 1, to: end };
  }
  function docAbove(s) {
    const lines = [];
    let route = null;
    let k = s - 1;
    while (k >= 0 && toks[k].t === 'nl') k--;
    const run = [];
    while (k >= 0 && toks[k].t === 'comment') { run.unshift(toks[k].text); k--; while (k >= 0 && toks[k].t === 'nl' && toks[k - 1]?.t === 'comment' && toks[k - 1].end === toks[k].at) k--; if (toks[k]?.t === 'nl') { if (toks[k - 1]?.t !== 'comment') break; k--; } }
    for (const r of run) {
      const t = r.replace(/^#['*]?\s?/, '').trim();
      const m = t.match(/^@(get|post|put|delete|patch|head)\s+(\S+)/i);
      if (m && /^#[*']/.test(r)) { route = { method: m[1].toUpperCase(), path: m[2] }; continue; }
      if (/^@/.test(t)) { if (lines.length) break; continue; }
      if (!t) { if (lines.length) break; continue; }
      lines.push(t);
    }
    const doc = lines.join(' ').replace(/\s+/g, ' ').trim();
    return { doc: doc ? (doc.length > 300 ? `${doc.slice(0, 299)}…` : doc) : null, route };
  }
  function defineFunction(name, fv, s, nameTok, owner = null) {
    const { doc, route } = docAbove(s);
    const params = fv.params.map((p) => ({ name: p.name, type: null }));
    const fnSteps = stepsOfBody(fv.from, fv.to, { last: true, fn: true });
    if (!fnSteps.length) fnSteps.push({ kind: 'return', says: 'Does nothing', ...base(nameTok.i, fv.to, head(nameTok.i, fv.to)) });
    const [a, b] = bodyRange(fv.from, fv.to);
    const f = { name: route && !name ? `${route.method} ${route.path}` : name, line: lineAt(nameTok.at), params, doc, steps: fnSteps, body: a < b && next(a, b) < b ? [lineAt(toks[next(a, b)].at), lineAt(toks[b - 1].end - 1)] : null, ...(route ? { route } : {}), _fv: fv, ...(owner ? { owner } : {}) };
    fns.push(f);
    return f;
  }

  function statement(s, e, ctx) {
    const v = at0(toks.slice(s, e));
    const t0 = v[0];
    if (!t0) return [];
    if (isId(t0, 'if')) { const st = ifSteps(s, e, ctx); return st ? [st] : [{ kind: 'other', says: code(s, e), ...base(s, e) }]; }
    if (isId(t0, 'for')) {
      const open = v[1];
      if (!isOp(open, '(') || open.match == null) return [{ kind: 'other', says: code(s, e), ...base(s, e) }];
      const inner = at0(toks.slice(open.i + 1, open.match));
      const inAt = inner.findIndex((x) => isId(x, 'in'));
      const x = inner[0]?.text ?? 'item';
      const over = inner.slice(inAt + 1);
      const call = callOf(over);
      const og = groups(over);
      let says;
      if (call?.bare === 'seq_along') says = `For each position ${rWords(x)} in ${sayValue(call.args[0]?.toks ?? []) ?? 'the list'}`;
      else if (call?.bare === 'seq_len') says = `Counts ${rWords(x)} from 1 to ${sayValue(call.args[0]?.toks ?? []) ?? 'n'}`;
      else if (og.length === 3 && isOp(og[1][0], ':')) says = `Counts ${rWords(x)} from ${sayValue(og[0]) ?? '?'} to ${sayValue(og[2]) ?? '?'}`;
      else says = `For each ${rWords(x)} in ${sayValue(over) ?? 'the list'}`;
      const kids = stepsOfBody(open.match + 1, e, { ...ctx, last: false });
      return [{ kind: 'loop', says, ...base(s, e, head(s, e)), ...(kids.length ? { children: kids } : {}) }];
    }
    if (isId(t0, 'while')) {
      const open = v[1];
      if (!isOp(open, '(') || open.match == null) return [{ kind: 'other', says: code(s, e), ...base(s, e) }];
      const c = condWords(toks.slice(open.i + 1, open.match), false);
      const kids = stepsOfBody(open.match + 1, e, { ...ctx, last: false });
      return [{ kind: 'loop', says: c === 'always' ? 'Repeats until something stops it' : `Repeats while ${c ?? 'a condition holds'}`, ...base(s, e, head(s, e)), ...(kids.length ? { children: kids } : {}) }];
    }
    if (isId(t0, 'repeat')) { const kids = stepsOfBody(t0.i + 1, e, { ...ctx, last: false }); return [{ kind: 'loop', says: 'Repeats until something stops it', ...base(s, e, head(s, e)), ...(kids.length ? { children: kids } : {}) }]; }
    if (isId(t0, 'break') && v.length === 1) return [];
    if (isId(t0, 'next') && v.length === 1) return [{ kind: 'call', says: 'Skips to the next one', ...base(s, e) }];
    if (isId(t0, 'NULL') && v.length === 1) return [];
    // Assignment: name <- value, name = value, name <<- value, value -> name.
    const g = groups(v);
    const asg = g.findIndex((x) => x.length === 1 && x[0].t === 'op' && (x[0].text === '<-' || x[0].text === '<<-' || x[0].text === '='));
    const rasg = g.findIndex((x) => x.length === 1 && x[0].t === 'op' && (x[0].text === '->' || x[0].text === '->>'));
    if (asg > 0 || rasg > 0) {
      const lhs = asg > 0 ? g.slice(0, asg).flat() : g.slice(rasg + 1).flat();
      let rhs = asg > 0 ? g.slice(asg + 1).flat() : g.slice(0, rasg).flat();
      // a <- b <- NULL: every name gets the same value.
      const names = [];
      for (let rg = groups(rhs), at = rg.findIndex((x) => x.length === 1 && isOp(x[0], '<-')); asg > 0 && at === 1 && rg[0][0].t === 'id'; rg = groups(rhs), at = rg.findIndex((x) => x.length === 1 && isOp(x[0], '<-'))) { names.push(rWords(rg[0][0].text)); rhs = rg.slice(2).flat(); }
      if (names.length) { const val = sayValue(rhs); return [{ kind: 'set', says: `Sets ${listWords([sayValue(lhs) ?? 'a value', ...names])} to ${val ?? 'a computed value'}`, ...(val ? {} : { restates: true }), ...base(s, e) }]; }
      return assignSteps(lhs, rhs, s, e, ctx);
    }
    // Anonymous function at the top level: a plumber endpoint (#* @get /path above it).
    const fv = fnValue(v);
    if (fv) { const f = defineFunction(null, fv, s, t0); if (!f.route) f.name = `function at line ${f.line}`; return []; }
    return exprSteps(v, s, e, ctx);
  }

  function assignSteps(lhs, rhs, s, e, ctx) {
    const lv = at0(lhs);
    const target = sayValue(lv) ?? (lv[0] ? rWords(lv[0].text) : 'a value');
    const fv = fnValue(rhs);
    if (fv && lv.length === 1) {
      defineFunction(lv[0].text, fv, s, lv[0]);
      return ctx.fn ? [{ kind: 'set', says: `Defines a helper, ${rWords(lv[0].text)}`, ...base(s, e, head(s, e)) }] : [];
    }
    const rv = at0(rhs);
    const call = callOf(rv);
    if (call && /^(R6Class|setRefClass|setClass)$/.test(call.bare)) { defineThing(lv[0]?.text ?? '', call, s, e); return []; }
    if (call && call.bare === 'tryCatch') return [tryStep(call, s, e, ctx, target)];
    if (call && /^(lapply|sapply|vapply|map|map_chr|map_dbl|map_int|map_lgl|map_dfr|purrr::map|Map|mapply)$/.test(call.bare)) { const l = loopOfApply(call, s, e, ctx); if (l) return [{ ...l, says: `${l.says}, keeping the answers as ${target}` }]; }
    if (isId(rv[0], 'if')) { const st = ifSteps(rv[0].i, e, { ...ctx, last: false }); if (st) { giveValue(st, target); return [st]; } }
    const pipe = pipeline(rv);
    if (pipe) return [{ kind: 'set', says: `Works out ${target}, step by step`, ...base(s, e, head(s, e)), children: pipelineSteps(pipe, s, e) }];
    if (lv.length >= 3 && isId(lv[0], 'self') && isOp(lv[1], '$') && rv.length === 1 && rv[0].t === 'id' && rv[0].text === lv[2].text) return [{ kind: 'set', says: `Keeps the ${rWords(rv[0].text)} it is given`, ...base(s, e) }];
    if (lv.length === 1 && rv.length === 1 && rv[0].t === 'id' && ctx.fn && rv[0].text === lv[0].text) return [{ kind: 'set', says: `Keeps the ${rWords(rv[0].text)} it is given`, ...base(s, e) }];
    if (call) {
      if (call.bare === 'switch') { const st = switchStep(call, s, e, { ...ctx, last: false }); giveValue(st, target); return [st]; }
      const verb = callVerb(call);
      if (verb) return [{ kind: 'call', says: `${verb}, keeping it as ${target}`, callee: call.bare, ...base(s, e) }];
      const noun = callNoun(call);
      if (noun) return [{ kind: 'set', says: noun === 'an empty list' || noun === 'an empty table' ? `Starts ${target} as ${noun}` : `Sets ${target} to ${noun}`, ...base(s, e) }];
      return [{ kind: 'set', says: `Works out ${target} from ${rWords(call.bare)}`, callee: call.bare, ...base(s, e) }];
    }
    const val = sayValue(rv);
    return [{ kind: 'set', says: val ? `Sets ${target} to ${val}` : `Works out ${target}`, ...(val ? {} : { restates: true }), ...base(s, e) }];
  }

  /** Make the last value in each side of a choice say it sets `target` (or returns, when target is null). */
  function giveValue(step, target) {
    const fix = (list) => {
      if (!list?.length) return;
      const last = list[list.length - 1];
      if (last.kind === 'branch') { fix(last.children); fix(last.otherwise); for (const c of last.children || []) if (c.caseLabel) fix(c.children); return; }
      if (last.kind === 'return' && /^Returns /.test(last.says) && target) list[list.length - 1] = { ...last, kind: 'set', says: last.says.replace(/^Returns /, `Sets ${target} to `) };
    };
    fix([step]);
  }

  function loopOfApply(call, s, e, ctx) {
    const [xs, f] = call.args.filter((a) => !a.name || a.name === 'X' || a.name === 'FUN' || a.name === '.x' || a.name === '.f');
    if (!xs || !f) return null;
    const fv = fnValue(f.toks);
    const what = sayValue(xs.toks) ?? 'the list';
    if (!fv) { const fname = at0(f.toks)[0]; return { kind: 'loop', says: `For each item in ${what}, runs ${rWords(fname?.text ?? 'a function')}`, ...base(s, e) }; }
    const kids = stepsOfBody(fv.from, fv.to, { ...ctx, last: true, fn: true });
    return { kind: 'loop', says: `For each ${rWords(fv.params[0]?.name ?? 'item')} in ${what}`, ...base(s, e, head(s, e)), ...(kids.length ? { children: kids } : {}) };
  }

  function tryStep(call, s, e, ctx, target = null) {
    const step = { kind: 'try', says: `Tries these steps and handles any error${target ? ` (the answer becomes ${target})` : ''}`, ...base(s, e, head(s, e)) };
    const expr = call.args.find((a) => !a.name || a.name === 'expr');
    if (expr && at0(expr.toks).length) { const r = range(at0(expr.toks)); const kids = stepsOfBody(r[0], r[1], { ...ctx, last: !!target || ctx.last }); if (kids.length) step.children = kids; }
    for (const a of call.args.filter((x) => x.name && x.name !== 'expr')) {
      const fv = fnValue(a.toks);
      const r = at0(a.toks).length ? range(at0(a.toks)) : null;
      if (a.name === 'finally') { step.always = { line: lineAt(at0(a.toks)[0]?.at ?? toks[s].at), steps: r ? stepsOfBody(r[0], r[1], { ...ctx, last: false }) : [] }; continue; }
      const says = a.name === 'error' ? 'If anything goes wrong' : a.name === 'warning' ? 'If there is a warning' : a.name === 'message' ? 'If a message is written' : a.name === 'interrupt' ? 'If it is stopped' : `If ${a.name} goes wrong`;
      (step.handlers ||= []).push({ says, line: lineAt(at0(a.toks)[0]?.at ?? toks[s].at), steps: fv ? stepsOfBody(fv.from, fv.to, { ...ctx, last: !!target || ctx.last, fn: true }) : [] });
    }
    if (target) { for (const list of [step.children, ...(step.handlers || []).map((h) => h.steps)]) if (list?.length) giveValue({ kind: 'branch', children: list }, target); }
    return step;
  }

  function switchStep(call, s, e, ctx) {
    const [subject, ...rest] = call.args;
    const arms = [];
    let pending = [];
    for (const a of rest) {
      const vtoks = at0(a.toks);
      if (a.name && !vtoks.length) { pending.push(a.name); continue; }
      const names = a.name ? [...pending, a.name] : null;
      pending = [];
      const r = vtoks.length ? range(vtoks) : null;
      const kids = r ? stepsOfBody(r[0], r[1], ctx) : [];
      arms.push({ kind: 'check', says: names ? `When it is ${listWords(names.map((n) => `"${n}"`)).replace(/,? and ([^,]*)$/, ' or $1')}` : 'Otherwise', caseLabel: true, code: names ? `${names.join(', ')} =` : '(default)', line: lineAt(vtoks[0]?.at ?? toks[s].at), span: r ? spanOf(r[0], r[1]) : spanOf(s, e), ...(kids.length ? { children: kids } : {}) });
    }
    return { kind: 'branch', says: `Chooses by ${sayValue(subject?.toks ?? []) ?? 'value'}`, ...base(s, e, head(s, e)), ...(arms.length ? { children: arms } : {}) };
  }

  function exprSteps(v, s, e, ctx) {
    const pipe = pipeline(v);
    if (pipe) {
      const steps = pipelineSteps(pipe, s, e);
      if (ctx.last) steps.push({ kind: 'return', says: 'Returns the result', ...base(s, e) });
      return steps;
    }
    const call = callOf(v);
    if (call) {
      const { bare, args } = call;
      const a0 = args[0] ? sayValue(args[0].toks) : null;
      if (bare === 'stop' || bare === 'abort' || bare === 'cli_abort' || bare === 'stopf') {
        const parts = args.filter((a) => !a.name || a.name === 'message');
        const one = at0(parts[0]?.toks ?? []);
        const isVar = parts.length === 1 && one.length === 1 && one[0].t === 'id';
        const msg = isVar ? null : (bare === 'cli_abort' || bare === 'abort' ? glueText(textOf(parts)) : textOf(parts));
        if (msg) errors.set(msg, errors.get(msg) ?? lineAt(toks[s].at));
        const cls = args.find((a) => a.name === 'class');
        const name = cls ? (at0(cls.toks)[0]?.value ?? 'an error') : 'an error';
        return [{ kind: 'fail', says: isVar ? `Fails with the error in ${rWords(one[0].text)}` : `Fails with ${name}${msg ? `: "${msg}"` : ''}`, error: name, ...(msg ? { message: msg } : {}), ...base(s, e) }];
      }
      if (bare === 'deprecate_stop') {
        const what = at0(args[1]?.toks ?? [])[0]?.value;
        const msg = `${what ?? 'This'} is no longer available`;
        return [{ kind: 'fail', says: `Fails with an error: "${msg}"`, error: 'an error', message: msg, ...base(s, e) }];
      }
      if (bare === 'stopifnot') {
        const c = args.map((a) => (a.name ? quote(a.name) : condWords(a.toks, false)));
        return [{ kind: 'check', says: `Checks that ${c.every(Boolean) ? c.join(' and ') : 'its conditions hold'} (stops with an error if not)`, ...base(s, e) }];
      }
      if (/^(library|require|requireNamespace|suppressPackageStartupMessages|suppressMessages)$/.test(bare)) {
        const inner = bare.startsWith('suppress') ? callOf(at0(args[0]?.toks ?? [])) : call;
        if (inner && /^(library|require)$/.test(inner.bare)) { const p = at0(inner.args[0]?.toks ?? [])[0]; return [{ kind: 'set', says: `Loads the ${p?.value ?? p?.text ?? '?'} package`, ...base(s, e) }]; }
        if (!inner) return [{ kind: 'call', says: 'Runs it quietly', ...base(s, e) }];
      }
      if (bare === 'source') return [{ kind: 'call', says: `Runs the R file ${a0 ?? '?'}`, ...base(s, e) }];
      if (bare === 'tryCatch' || bare === 'withCallingHandlers') return [tryStep(call, s, e, ctx)];
      if (bare === 'try') {
        const r = args[0] && at0(args[0].toks).length ? range(at0(args[0].toks)) : null;
        const kids = r ? stepsOfBody(r[0], r[1], { ...ctx, last: false }) : [];
        return [{ kind: 'try', says: 'Tries these steps, and carries on if they fail', ...base(s, e, head(s, e)), ...(kids.length ? { children: kids } : {}), handlers: [{ says: 'If anything goes wrong', line: lineAt(toks[s].at), steps: [] }] }];
      }
      if (bare === 'on.exit') {
        const r = args[0] && at0(args[0].toks).length ? range(at0(args[0].toks)) : null;
        const kids = r ? stepsOfBody(r[0], r[1], { ...ctx, last: false }) : [];
        return [{ kind: 'call', says: 'At the end, even if something fails, it runs these steps', ...base(s, e, head(s, e)), ...(kids.length ? { children: kids, nested: true } : {}) }];
      }
      if (bare === 'switch') return [switchStep(call, s, e, ctx)];
      if (/^(lapply|sapply|vapply|map|walk|map_chr|map_dbl|map_int|map_lgl|map_dfr|Map|mapply|purrr::walk)$/.test(bare)) { const l = loopOfApply(call, s, e, ctx); if (l) return [l]; }
      if (bare === 'test_that') { const name = at0(args[0]?.toks ?? [])[0]?.value; if (name) tests.push({ name, line: lineAt(toks[s].at) }); return []; }
      if (bare === 'return' || bare === 'invisible') { const r = returnStep(v, s, e); return r ? [r] : []; }
      if (/^(setGeneric|setValidity|setMethod)$/.test(bare)) {
        if (bare === 'setMethod') {
          const name = at0(args[0]?.toks ?? [])[0]?.value;
          const cls = at0(args[1]?.toks ?? [])[0]?.value;
          const def = args.find((a) => a.name === 'definition') ?? args[2];
          const fv2 = def ? fnValue(def.toks) : null;
          if (name && fv2) defineFunction(name, fv2, s, toks[s], cls);
        }
        return [];
      }
      if (ctx.last) { const r = returnStep(v, s, e); if (r && !r.restates) return [r]; }
      const verb = callVerb(call);
      if (verb) return [{ kind: 'call', says: verb, callee: bare, ...base(s, e) }];
      if (ctx.last) { const r = returnStep(v, s, e); if (r) return [r]; }
      return [{ kind: 'call', says: `Calls ${rWords(bare)}`, callee: bare, ...base(s, e) }];
    }
    if (ctx.last) { const r = returnStep(v, s, e); if (r) return [r]; }
    const val = sayValue(v);
    return [val ? { kind: 'call', says: `Works out ${val}`, ...base(s, e) } : { kind: 'other', says: code(s, e), ...base(s, e) }];
  }

  // ── Things: R6Class, setRefClass, setClass ──
  function defineThing(name, call, s, e) {
    const lines = [lineAt(toks[s].at), lineAt(toks[e - 1].end - 1)];
    const className = at0(call.args[0]?.toks ?? [])[0]?.value ?? (at0(call.args.find((a) => a.name === 'Classname')?.toks ?? [])[0]?.value) ?? name;
    const { doc } = docAbove(s);
    const thing = { kind: 'record', name: className || name, lines, ...(doc ? { doc } : {}), knows: [], choices: [], memberRanges: [] };
    const listArgs = (a) => { const c = a ? callOf(at0(a.toks)) : null; return c && /^(list|c|representation)$/.test(c.bare) ? c.args : null; };
    const R_TYPE = { numeric: 'number', integer: 'int', character: 'string', logical: 'bool', Date: 'date', list: null, 'data.frame': null };
    const knowsFrom = (args, typed) => {
      for (const a of args || []) {
        if (!a.name) { const sv = at0(a.toks)[0]; if (sv?.t === 'str') thing.knows.push({ name: sv.value, type: null, start: null, line: lineAt(sv.at) }); continue; }
        const vt = at0(a.toks);
        if (fnValue(vt)) continue;
        const tv = typed && vt.length === 1 && vt[0].t === 'str' ? vt[0].value : null;
        thing.knows.push({ name: a.name, type: tv ? (R_TYPE[tv] ?? tv) : null, start: typed ? null : vt.map((x) => x.text).join(''), line: lineAt(vt[0]?.at ?? toks[s].at) });
      }
    };
    let methods = 0;
    const methodsFrom = (args) => {
      for (const a of args || []) {
        const fv = a.name ? fnValue(a.toks) : null;
        if (!fv) continue;
        const f = defineFunction(a.name, fv, at0(a.toks)[0].i, toks[at0(a.toks)[0].i - 2] ?? toks[s]);
        f.line = lineAt(toks[at0(a.toks)[0].i - 2]?.at ?? toks[s].at);
        if (a.name !== 'initialize') methods++;
        if (a.name === 'initialize') {
          // Starting values: self$x <- param, or .self / field <<- param.
          const byName = new Map(fv.params.map((p) => [p.name, p.default ? at0(p.default).map((x) => x.text).join('') : null]));
          const [ba, bb] = bodyRange(fv.from, fv.to);
          for (const [x, y] of splitStatements(toks, ba, bb)) {
            const st = at0(toks.slice(x, y));
            const m = st.length >= 5 && /^(self|\.self)$/.test(st[0].text) && isOp(st[1], '$') && (isOp(st[3], '<-') || isOp(st[3], '=')) ? [st[2].text, st.slice(4)] : st.length >= 3 && st[0].t === 'id' && isOp(st[1], '<<-') ? [st[0].text, st.slice(2)] : null;
            if (!m) continue;
            const [field, val] = m;
            const k = thing.knows.find((q) => q.name === field);
            const start = val.length === 1 && byName.has(val[0].text) ? { param: byName.get(val[0].text) } : val.map((q) => q.text).join('');
            if (k) { if (k.start == null || typeof start === 'object') k.start = start; } else thing.knows.push({ name: field, type: null, start, line: lineAt(st[0].at) });
          }
        }
      }
    };
    if (call.bare === 'R6Class') {
      for (const part of ['public', 'private', 'active']) { const args = listArgs(call.args.find((a) => a.name === part)); knowsFrom(args, false); methodsFrom(args); }
    } else if (call.bare === 'setRefClass') {
      knowsFrom(listArgs(call.args.find((a) => a.name === 'fields')), true);
      methodsFrom(listArgs(call.args.find((a) => a.name === 'methods')));
    } else {
      knowsFrom(listArgs(call.args.find((a) => a.name === 'representation' || a.name === 'slots') ?? call.args.find((a, k) => k === 1 && !a.name)), true);
      for (const p of listArgs(call.args.find((a) => a.name === 'prototype')) || []) { const k = thing.knows.find((q) => q.name === p.name); if (k) k.start = at0(p.toks).map((x) => x.text).join(''); }
    }
    if (methods) thing.kind = 'thing';
    thing._methods = methods;
    things.push(thing);
  }

  return { toks, fns, things, errors, tests, stepsIn, lineAt, next, statement, code, base };
}

// ── Decisions: a function that only chooses between fixed answers ─────────────────────────────────────────

function decisionOf(r, fv) {
  const { toks } = r;
  const [from, to] = (() => { const k = r.next(fv.from, fv.to); return isOp(toks[k], '{') && toks[k].match != null ? [k + 1, toks[k].match] : [k, fv.to]; })();
  const stmts = splitStatements(toks, from, to);
  const rules = [];
  let otherwise = null;
  const valueOf = (a, b) => {
    const k = r.next(a, b);
    if (isOp(toks[k], '{') && toks[k].match != null) { const st = splitStatements(toks, k + 1, toks[k].match); return st.length === 1 ? fixedOf(toks.slice(st[0][0], st[0][1])) : null; }
    return fixedOf(toks.slice(k, b));
  };
  const ifChain = (s, e, isLast) => {
    const local = [];
    let at = s;
    for (;;) {
      const open = r.next(at + 1, e);
      if (!isOp(toks[open], '(') || toks[open].match == null) return null;
      const cond = condJs(toks.slice(open + 1, toks[open].match));
      if (!cond) return null;
      let k = r.next(toks[open].match + 1, e), thenTo, elseAt = -1;
      if (isOp(toks[k], '{') && toks[k].match != null) { thenTo = toks[k].match + 1; const n2 = r.next(thenTo, e); if (isId(toks[n2], 'else')) elseAt = n2; }
      else { let d = k; for (; d < e; d++) { if (toks[d].match != null && toks[d].match < e) { d = toks[d].match; continue; } if (isId(toks[d], 'else')) { elseAt = d; break; } } thenTo = elseAt >= 0 ? elseAt : e; }
      const thenToks = toks.slice(toks[open].match + 1, thenTo);
      const val = valueOf(toks[open].match + 1, thenTo);
      // Before the last statement, a branch answers only through return().
      if (!val || (!isLast && !at0(thenToks).some((x) => isId(x, 'return')))) return null;
      local.push({ cond, result: val, line: r.lineAt(toks[at].at) });
      if (elseAt < 0) return { local, fallback: null };
      const after = r.next(elseAt + 1, e);
      if (isId(toks[after], 'if')) { at = after; continue; }
      const fb = valueOf(elseAt + 1, e);
      if (!fb || !isLast) return null;
      return { local, fallback: { result: fb, line: r.lineAt(toks[elseAt].at) } };
    }
  };
  for (let n = 0; n < stmts.length; n++) {
    const [s, e] = stmts[n];
    const isLast = n === stmts.length - 1;
    const first = toks[s];
    if (isId(first, 'if')) {
      const c = ifChain(s, e, isLast);
      if (!c) return null;
      rules.push(...c.local);
      if (c.fallback) otherwise = c.fallback;
      continue;
    }
    if (!isLast) return null;
    const v = at0(toks.slice(s, e));
    const call = callOf(v);
    if (call?.bare === 'switch') {
      const subj = condJs(call.args[0]?.toks ?? []);
      if (!subj || /\s/.test(subj)) return null;
      let pending = [];
      for (const a of call.args.slice(1)) {
        const vt = at0(a.toks);
        if (a.name && !vt.length) { pending.push(a.name); continue; }
        const val = fixedOf(vt);
        if (!val) return null;
        if (!a.name) { otherwise = { result: val, line: r.lineAt(vt[0].at) }; continue; }
        for (const nm of [...pending, a.name]) rules.push({ cond: `${subj} == ${JSON.stringify(nm)}`, result: val, line: r.lineAt(vt[0].at) });
        pending = [];
      }
      continue;
    }
    const val = fixedOf(v);
    if (!val) return null;
    otherwise = { result: val, line: r.lineAt(first.at) };
  }
  return rules.length && otherwise ? { rules, otherwise } : null;
}

const DEFINITION = /^(?:library|require|suppressPackageStartupMessages|setGeneric|setMethod|setValidity|setClass|setRefClass|R6Class|test_that|context|NULL)$/;

/** Read an R file: functions (with steps or decision rules), plumber routes, Things, errors, and testthat tests. */
export function rReading(src, file = '') {
  KNOWN_FNS = new Set([...src.matchAll(/^\s*([A-Za-z.][\w.]*)\s*(?:<-|=|<<-)\s*function\b/gm)].map((m) => m[1]));
  const r = makeReader(src);
  const topSteps = [];
  let real = false;
  for (const [s, e] of splitStatements(r.toks, 0, r.toks.length)) {
    const v = at0(r.toks.slice(s, e));
    const steps = r.statement(s, e, {});
    const call = callOf(v);
    const assign = groups(v).findIndex((x) => x.length === 1 && x[0].t === 'op' && /^(<-|=|<<-)$/.test(x[0].text));
    const rhs = assign > 0 ? callOf(groups(v).slice(assign + 1).flat()) : null;
    const isDef = (call && DEFINITION.test(call.bare)) || (rhs && DEFINITION.test(rhs.bare)) || !steps.length;
    if (!isDef) real = true;
    topSteps.push(...steps);
  }
  for (const f of r.fns) {
    const d = decisionOf(r, f._fv);
    if (d) f.decision = d;
    delete f._fv;
  }
  const fns = r.fns.filter((f) => !/^function at line /.test(f.name) || f.route);
  if (real && topSteps.length) {
    const name = file ? String(file).split(/[\\/]/).pop() : 'script';
    fns.push({ name, line: topSteps[0].line, params: [], doc: null, steps: topSteps, body: [topSteps[0].span.startLine, topSteps[topSteps.length - 1].span.endLine], topLevel: true, headline: `Runs ${name}, from top to bottom.` });
  }
  fns.sort((a, b) => a.line - b.line);
  // Methods written with setMethod("name", "Class", …) belong to that class.
  for (const f of fns) if (f.owner) { const t = r.things.find((x) => x.name === f.owner); if (t) { t.memberRanges.push([f.line, f.body?.[1] ?? f.line]); if (t.kind === 'record') t.kind = 'thing'; } delete f.owner; }
  KNOWN_FNS = new Set();
  return { fns, things: r.things.map(({ _methods, ...t }) => t), errors: [...r.errors].map(([name, line]) => ({ name, line })), tests: r.tests };
}

/** Things from an R file, in the model's shape. */
export function rThings(src, file, { words: w, kindWords, startValue }) {
  const norm = (v) => String(v ?? '').trim().replace(/^(?:list|c|character|numeric|integer|logical|vector)\(\s*(?:0)?\s*\)$/, '[]').replace(/^NULL$/, 'null').replace(/^NA$/, 'null').replace(/^TRUE$/, 'true').replace(/^FALSE$/, 'false').replace(/^(\d+)L$/, '$1').replace(/^'(.*)'$/, '"$1"');
  return rReading(src, file).things.map((t) => ({
    kind: t.kind, name: t.name, file, lines: t.lines, ...(t.doc ? { doc: t.doc } : {}), choices: t.choices, memberRanges: t.memberRanges,
    knows: t.knows.map((k) => ({ name: k.name, label: w(k.name.replace(/\./g, '_')), kind: k.type ? kindWords(k.type) : null, start: k.start == null || k.start === '' ? null : typeof k.start === 'object' ? (k.start.param == null ? 'given when it starts' : `${startValue(norm(k.start.param))?.replace(/ at first$/, '')} unless told otherwise`) : startValue(norm(k.start)), line: k.line })),
  }));
}

export { cap };
