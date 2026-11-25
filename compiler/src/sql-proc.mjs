// SQL routines in Thunder: functions, procedures, and their bodies, read by a block-structured parser.
//
// PL/pgSQL, MySQL/MariaDB stored programs, and T-SQL all nest: IF … ELSIF … ELSE … END IF, CASE … END CASE, loops,
// BEGIN … EXCEPTION … END, TRY/CATCH, labels. Reading them line by line put an ELSE's steps outside their IF, turned
// `ELSIF x = 'id'` into "Sets x to "id"", and lost `IF v_done THEN LEAVE`. So a body is tokenized (strings, quoted
// names, comments, and dollar quotes are single tokens), then parsed into the same nested steps every other language
// gives: questions with their two sides, loops with their body, tries with their handlers, and the statements that
// end a path (RETURN, RAISE EXCEPTION, SIGNAL, THROW) or jump out of a loop (EXIT, LEAVE, ITERATE, CONTINUE, BREAK).
//
// Faithfulness (faithful.mjs): a statement or condition is put into words only when the words account for it
// exactly; anything else is shown as code ("code, not explained"). A body whose structure cannot be matched (an IF
// without its END IF) is not guessed at: the routine is shown as not read.
//
// Deterministic, browser-safe, linear in the length of the file.
import { accountsFor, asCodeWords } from './faithful.mjs';
import { sqlCondition, sqlLogicName, sqlWords, sqlBare, sqlSingular, sqlTypeWords, sqlListWords } from './sql.mjs';

const plainName = (x) => sqlWords(String(x).replace(/^@+/, '').replace(/^(?:p|v|l|in|out|var)_(?=\w)/i, ''));
const unq = (s) => String(s).trim().replace(/^["`[](.*)["`\]]$/s, '$1');
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const lower1 = (s) => String(s).charAt(0).toLowerCase() + String(s).slice(1);

// ── Tokens ───────────────────────────────────────────────────────────────────────────────────────────────

const PUNCT = ['->>', '#>>', ':=', '::', '..', '<>', '!=', '<=', '>=', '||', '=>', '<<', '>>', '->', '@>', '<@', '#>'];

/**
 * Tokens of src[from, to): { t: 'word' | 'str' | 'num' | 'p', v, up, s, e }. Comments are skipped; a string, a quoted
 * name ("x", `x`, [x]), and a dollar-quoted body are one token each. `up` is the upper-case word (unquoted words only).
 */
export function lexSql(src, from = 0, to = src.length, dialect = 'pg') {
  const toks = [];
  let i = from;
  while (i < to) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v') { i++; continue; }
    if (c === '-' && src[i + 1] === '-') { const n = src.indexOf('\n', i); i = n < 0 || n > to ? to : n; continue; }
    if (c === '#' && dialect === 'mysql' && /[\s#!-]/.test(src[i + 1] || ' ')) { const n = src.indexOf('\n', i); i = n < 0 || n > to ? to : n; continue; }
    if (c === '/' && src[i + 1] === '*' && src[i + 2] === '!' && dialect === 'mysql') {
      // /*!50602 … */ is not a comment: MySQL 5.6.2 and later run what is inside.
      const close = src.indexOf('*/', i + 3);
      const e = close < 0 || close + 2 > to ? to : close + 2;
      const ver = /^\d{5,6}/.exec(src.slice(i + 3, i + 9));
      toks.push({ t: 'ver', v: src.slice(i, e), s: i, e, version: ver ? Number(ver[0]) : null, innerS: i + 3 + (ver ? ver[0].length : 0), innerE: close < 0 ? e : close });
      i = e; continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      let d = 1, j = i + 2;
      while (j < to && d) { if (dialect === 'pg' && src[j] === '/' && src[j + 1] === '*') { d++; j += 2; continue; } if (src[j] === '*' && src[j + 1] === '/') { d--; j += 2; continue; } j++; }
      i = j; continue;
    }
    const pre = /[EeNnBbXx]/.test(c) && src[i + 1] === "'" && !/[\w$]/.test(src[i - 1] || '');
    if (c === "'" || pre) {
      const esc = dialect === 'mysql' || (pre && /[Ee]/.test(c));
      let j = i + (pre ? 2 : 1);
      for (; j < to; j++) { if (esc && src[j] === '\\') { j++; continue; } if (src[j] === "'") { if (src[j + 1] === "'") { j++; continue; } break; } }
      const e = Math.min(j + 1, to);
      toks.push({ t: 'str', v: src.slice(i, e), s: i, e, prefix: pre ? c.toUpperCase() : '' });
      i = e; continue;
    }
    if (c === '$' && dialect === 'pg') {
      const m = /^\$([A-Za-z_][\w]*)?\$/.exec(src.slice(i, i + 66));
      if (m) {
        const close = src.indexOf(m[0], i + m[0].length);
        const e = close < 0 || close + m[0].length > to ? to : close + m[0].length;
        toks.push({ t: 'str', dollar: m[0], v: src.slice(i, e), s: i, e });
        i = e; continue;
      }
      const d = /^\$\d+/.exec(src.slice(i, i + 12));
      if (d) { toks.push({ t: 'word', v: d[0], up: d[0], s: i, e: i + d[0].length }); i += d[0].length; continue; }
    }
    if (c === '"' && dialect === 'mysql') {
      let j = i + 1;
      for (; j < to; j++) { if (src[j] === '\\') { j++; continue; } if (src[j] === '"') { if (src[j + 1] === '"') { j++; continue; } break; } }
      const e = Math.min(j + 1, to);
      toks.push({ t: 'str', dq: true, v: src.slice(i, e), s: i, e });
      i = e; continue;
    }
    if (c === '"' || c === '`' || (c === '[' && dialect === 'tsql')) {
      const close = c === '[' ? ']' : c;
      let j = i + 1;
      for (; j < to; j++) { if (src[j] === close) { if (src[j + 1] === close) { j++; continue; } break; } }
      const e = Math.min(j + 1, to);
      toks.push({ t: 'word', quoted: true, v: src.slice(i, e), up: null, s: i, e });
      i = e; continue;
    }
    let m;
    const rest = src.slice(i, Math.min(to, i + 200));
    // (A `$` inside a name only when a name character follows it: MySQL's `END$$` is END and the delimiter.)
    if ((m = (dialect === 'pg' ? /^@[A-Za-z_]\w*@/ : /^(?:@@?|##?)[A-Za-z_][\w#@]*(?:\$+\w+)*/).exec(rest)) || (m = /^[A-Za-z_\u0080-￿][\w\u0080-￿]*(?:\$+[\w\u0080-￿]+)*/.exec(rest))) {
      toks.push({ t: 'word', v: m[0], up: m[0].toUpperCase(), s: i, e: i + m[0].length });
      i += m[0].length; continue;
    }
    if ((m = /^\d+(?:\.(?!\.)\d*)?(?:[eE][-+]?\d+)?/.exec(rest))) { toks.push({ t: 'num', v: m[0], s: i, e: i + m[0].length }); i += m[0].length; continue; }
    const p = PUNCT.find((x) => src.startsWith(x, i)) ?? c;
    toks.push({ t: 'p', v: p, s: i, e: i + p.length });
    i += p.length;
  }
  return toks;
}

const isW = (t, ...ws) => !!t && t.t === 'word' && !t.quoted && (ws.length === 0 || ws.includes(t.up));
const isP = (t, v) => !!t && t.t === 'p' && t.v === v;

class Unmatched extends Error {}

// ── Words for values and conditions (faithful or code) ───────────────────────────────────────────────────

// Things the condition words cannot say exactly: subqueries, CASE, quantifiers, array and JSON operators.
const NOT_IN_WORDS = /:=|=>|\b(?:SELECT|CASE|EXISTS|ANY|ALL|SOME|ARRAY|OVER|WITHIN|FILTER|COLLATE|ESCAPE|SIMILAR|DISTINCT|ROW|AT\s+TIME\s+ZONE|IS\s+(?:NOT\s+)?DISTINCT)\b|->|#>|@>|<@|\?|~|\[|\{|\$\d|\bIS\s+(?:NOT\s+)?(?:TRUE|FALSE|UNKNOWN)\b|\bREGEXP\b|\bRLIKE\b|\bMOD\b|\bDIV\b|\bXOR\b|&|\||\^/i;

/** Strings blanked (same length), so a search never matches inside one. */
const blankStrings = (s) => String(s).replace(/'(?:[^']|'')*'/g, (m) => `'${'x'.repeat(Math.max(0, m.length - 2))}'`);

/** SQL code in the shape the faithfulness counts expect (`and`, `not`, `==`, `!= null` for IS NOT NULL). */
function countable(code) {
  return String(code).replace(/'(?:[^']|'')*'/g, 'Q')
    // (Names kept as written, `v_is_default`, are not counted on either side.)
    .replace(/(?<![\w.$@])[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*(?![\w$])/g, (m) => (sqlLogicName(m) ? 'Q' : m))
    .replace(/\bIS\s+NOT\s+NULL\b/gi, ' != null ').replace(/\bIS\s+NULL\b/gi, ' == null ')
    .replace(/\bBETWEEN\s+(\S+)\s+AND\s+/gi, ' between $1 , ')
    .replace(/\|\|/g, ' + ')
    // (`<>` is worded "is different from": a comparison, not a negation.)
    .replace(/<>|!=/g, ' == ')
    .replace(/\bNOT\b/gi, 'not').replace(/\bAND\b/gi, 'and').replace(/\bOR\b/gi, 'or').replace(/\bIN\b/gi, 'in').replace(/\bIS\b/gi, 'is')
    .replace(/(?<![<>!:=])=(?!=)/g, '==');
}

/** A condition in words when the words keep every negation, and/or, and comparison; otherwise null. */
function condWords(text, ctx) {
  const t = String(text).trim().replace(/\s+/g, ' ');
  if (!t || NOT_IN_WORDS.test(blankStrings(t))) return null;
  // MySQL user variables (@x, @sys.debug) and system variables (@@x) are kept as written.
  // PL/pgSQL's FOUND: whether the last query found (or changed) a row.
  if (ctx.dialect === 'pg' && /^(NOT\s+)?FOUND$/i.test(t)) return /^NOT/i.test(t) ? 'not: the last statement found or changed a row' : 'the last statement found or changed a row';
  let said;
  try { said = sqlCondition(t, { vars: true, keepAt: ctx.dialect !== 'tsql' }); } catch { return null; }
  return said && accountsFor(countable(t), said) ? said : null;
}

/** A string literal's text, exactly as the code writes it (doubled quotes undone). */
const strText = (tok) => (tok.dollar ? tok.v.slice(tok.dollar.length, -tok.dollar.length) : tok.v.slice(tok.prefix ? 2 : 1, -1).replace(tok.dq ? /""/g : /''/g, tok.dq ? '"' : "'"));

/** A value in words: a quoted text exactly, yes/no, a number, NULL, text joined with ||, or a condition's words. */
function valueWords(text, ctx, toks = null) {
  const t = String(text).trim();
  const ts = toks ?? lexSql(t, 0, t.length, ctx.dialect);
  if (ts.length === 1 && ts[0].t === 'str' && !ts[0].dollar && ts[0].prefix !== 'B' && ts[0].prefix !== 'X') return `"${strText(ts[0])}"`;
  if (ts.length === 1 && isW(ts[0], 'TRUE', 'FALSE')) return ts[0].up === 'TRUE' ? 'yes' : 'no';
  if (ts.length === 1 && isW(ts[0], 'NULL')) return 'NULL';
  if (ts.length === 1 && ts[0].t === 'num') return ts[0].v;
  if (ts.length === 2 && isP(ts[0], '-') && ts[1].t === 'num') return `-${ts[1].v}`;
  const joined = joinedText(ts, ctx);
  if (joined) return joined;
  return condWords(t, ctx);
}

/**
 * Text joined with `||` whose parts are quoted texts and plain names: one quoted text with each name as a
 * «placeholder», spelled as the code spells it ('Table '||v_name||' moved' -> "Table «v_name» moved").
 */
function joinedText(ts, ctx) {
  if (!ts.some((x) => isP(x, '||'))) return null;
  const parts = [[]];
  for (const x of ts) { if (isP(x, '||')) parts.push([]); else parts.at(-1).push(x); }
  let out = '', hasText = false;
  for (const p of parts) {
    if (p.length === 1 && p[0].t === 'str' && !p[0].dollar) { out += strText(p[0]); hasText = true; continue; }
    if (p.length && p.every((x, k) => (k % 2 === 0 ? x.t === 'word' && !/^(?:NULL|TRUE|FALSE)$/.test(x.up ?? '') : isP(x, '.'))) && p.length % 2 === 1) { out += `«${p.map((x) => x.v).join('')}»`; continue; }
    return null;
  }
  return hasText ? `"${out}"` : null;
}

/**
 * The SQL text a dynamic statement runs: the text in a variable, a quoted text, text joined with ||, or
 * format('…%I…%L…%s…', a, b, c) with each conversion paired with its value: "ALTER TABLE «a as %I» …". Null otherwise.
 */
function sqlTextWords(ts, ctx) {
  if (!ts.length) return null;
  if (ts.every((x, k) => (k % 2 === 0 ? x.t === 'word' && !x.quoted : isP(x, '.')))) { const v = targetWords(ctx.src.slice(ts[0].s, ts.at(-1).e), ctx); return v ? `text in ${v}` : null; }
  if (ts.length === 1 && ts[0].t === 'str' && !ts[0].dollar) return `"${strText(ts[0])}"`;
  const joined = joinedText(ts, ctx);
  if (joined) return joined;
  if (isW(ts[0], 'FORMAT') && isP(ts[1], '(') && matchParen(ts, 1) === ts.length - 1) {
    const args = splitComma(ts.slice(2, -1));
    if (!(args[0]?.length === 1 && args[0][0].t === 'str')) return null;
    const vals = args.slice(1).map((p) => ctx.src.slice(p[0].s, p.at(-1).e).trim());
    let k = 0, ok = true;
    const out = strText(args[0][0]).replace(/%(?:\d+\$)?-?\d*[sIL%]?/g, (m) => {
      if (m === '%%') return '%';
      if (!/^%[sIL]$/.test(m)) { ok = false; return m; } // positions and widths are not paired here
      const v = vals[k++];
      if (v == null) { ok = false; return m; }
      return m === '%s' ? `«${v}»` : `«${v} as ${m}»`;
    });
    return ok && k === vals.length ? `"${out}"` : null;
  }
  return null;
}

/** A name being set or read, in words: v_total -> total, v_row.count -> the row's count; @x (MySQL) as written. */
function targetWords(text, ctx) {
  const t = String(text).trim();
  if (/^@@/.test(t) || (ctx.dialect === 'mysql' && /^@/.test(t))) return /^@@?[\w.$]+$/.test(t) ? `\`${t}\`` : null;
  const parts = t.replace(/^@/, '').split('.');
  if (!parts.every((p) => /^[A-Za-z_#][\w$#]*$|^"[^"]+"$|^`[^`]+`$|^\[[^\]]+\]$/.test(p))) return null;
  if (parts.length === 1) return plainName(unq(parts[0]));
  if (parts.length === 2) return `the ${plainName(unq(parts[0]))}'s ${sqlWords(unq(parts[1]))}`;
  return null;
}

// ── Statements ───────────────────────────────────────────────────────────────────────────────────────────

// Code on one line: a `--` comment becomes /* … */ so it does not swallow the rest of the line.
const code = (text) => String(text).replace(/('(?:[^']|'')*')|--([^\n]*)/g, (m, str, note) => str ?? `/*${note.replace(/\*\//g, '* /')} */`).replace(/\s+/g, ' ').trim();
/** "x to y", or the names as written when both read the same (v_retention := p_retention). */
const setPair = (target, v, rawT, rawV) => (target === v && rawT.trim() !== rawV.trim() ? `\`${rawT.trim()}\` to \`${rawV.trim()}\`` : `${target} to ${v}`);
const asCode = (text, base) => ({ kind: 'other', says: code(text), code: code(text), restates: code(text), ...base });

/** Top-level pieces of a token run split at commas. */
function splitComma(ts) {
  const out = [[]];
  let d = 0;
  for (const x of ts) {
    if (isP(x, '(') || isP(x, '[')) d++;
    else if (isP(x, ')') || isP(x, ']')) d--;
    if (d === 0 && isP(x, ',')) { out.push([]); continue; }
    out.at(-1).push(x);
  }
  return out.filter((p) => p.length);
}

/** Index (in ts) of the first top-level word among `ws`, or -1. */
function topWord(ts, ws, from = 0) {
  let d = 0;
  for (let k = from; k < ts.length; k++) {
    const x = ts[k];
    if (isP(x, '(') || isP(x, '[')) d++;
    else if (isP(x, ')') || isP(x, ']')) d--;
    else if (d === 0 && isW(x) && ws.includes(x.up)) return k;
  }
  return -1;
}

/** An error message with its % conversions paired with RAISE's arguments: "Order «p_id» does not exist". */
function raiseMessage(fmt, args) {
  let k = 0, ok = true;
  const out = fmt.replace(/%%|%/g, (m) => { if (m === '%%') return '%'; const a = args[k++]; if (!a) { ok = false; return m; } return `«${a}»`; });
  return ok && k === args.length ? out : null;
}

/**
 * One simple statement (tokens ts, its source text) as a step. Every wording here is exact or the statement is code.
 */
function statementStep(ts, text, base, ctx) {
  const head = ts[0];
  const up = head?.up;
  const t = code(text);
  const rest = ts.slice(1);
  const restText = (k = 1) => (ts[k] ? ctx.src.slice(ts[k].s, ts.at(-1).e) : '');
  const at = (k) => ts[k];
  const fail = (says, extra = {}) => ({ kind: 'fail', says: `Fails with ${says}`, error: extra.error ?? 'an error', ...(extra.message != null ? { message: extra.message } : {}), code: t, ...base });

  // ── Endings and jumps ──
  if (up === 'RETURN') {
    if (ctx.dialect === 'pg' && isW(at(1), 'NEXT')) {
      const v = ts.length > 2 ? valueWords(restText(2), ctx) : null;
      return { kind: 'call', says: ts.length > 2 ? (v ? `Adds ${v} to the rows it gives back, and carries on` : 'Adds a row to the rows it gives back, and carries on') : 'Adds the current row to the rows it gives back, and carries on', code: t, ...base, rowOut: true };
    }
    if (ctx.dialect === 'pg' && isW(at(1), 'QUERY')) return { kind: 'call', says: isW(at(2), 'EXECUTE') ? 'Adds the rows of a query built when it runs to the rows it gives back, and carries on' : 'Adds the rows a query finds to the rows it gives back, and carries on', code: t, ...base, rowOut: true };
    if (ts.length === 1) return { kind: 'return', says: ctx.setof ? 'Returns the rows it has added' : 'Stops here', code: t, ...base };
    if (ctx.trigger && ts.length === 2 && isW(at(1), 'NEW', 'OLD')) return { kind: 'return', says: at(1).up === 'NEW' ? 'Lets the change go ahead' : 'Keeps the old row', code: t, ...base };
    const v = valueWords(restText(1), ctx, rest);
    if (ctx.routine === 'procedure') return { kind: 'return', says: v ? `Stops here, with return code ${v}` : `Stops here, with the return code ${asCodeWords(restText(1))}`, code: t, ...base };
    if (!v) return { kind: 'return', says: t, code: t, restates: t, ...base };
    return { kind: 'return', says: `Returns ${v}`, code: t, ...base };
  }
  if (up === 'RAISE' && ctx.dialect === 'pg') {
    let k = 1;
    const level = isW(at(1), 'DEBUG', 'LOG', 'INFO', 'NOTICE', 'WARNING', 'EXCEPTION') ? at(k++).up : 'EXCEPTION';
    if (ts.length === 1) return fail('the same error again: passes it on', { error: 'the same error' });
    const fmt = at(k);
    let message = null;
    if (fmt?.t === 'str') {
      const using = topWord(ts, ['USING'], k + 1);
      const argTs = ts.slice(k + 1, using < 0 ? ts.length : using);
      const args = isP(argTs[0], ',') ? splitComma(argTs.slice(1)).map((p) => ctx.src.slice(p[0].s, p.at(-1).e).trim()) : [];
      if (argTs.length && !isP(argTs[0], ',')) return level === 'EXCEPTION' ? fail('an error', { message: null }) : asCode(t, base);
      message = raiseMessage(strText(fmt), args);
      if (message == null) return level === 'EXCEPTION' ? { ...fail('an error'), says: `Fails with an error: ${asCodeWords(t)}` } : asCode(t, base);
    }
    if (level === 'EXCEPTION') {
      if (message != null) return fail(`an error: "${message}"`, { message });
      if (fmt?.t === 'word' && !isW(fmt, 'USING')) return fail(`the error ${sqlWords(fmt.v)}`, { error: sqlWords(fmt.v) });
      return fail('an error (its message is worked out when it runs)');
    }
    if (message != null) return { kind: 'call', says: `${level === 'WARNING' ? 'Warns' : 'Writes a message'}: "${message}"`, code: t, ...base };
    return asCode(t, base);
  }
  if (up === 'SIGNAL' || up === 'RESIGNAL') {
    if (up === 'RESIGNAL' && ts.length === 1) return fail('the same error again: passes it on', { error: 'the same error' });
    const mt = ts.findIndex((x) => isW(x, 'MESSAGE_TEXT'));
    if (mt > 0 && isP(at(mt + 1), '=')) {
      const val = at(mt + 2), after = at(mt + 3);
      if (val?.t === 'str' && (!after || isP(after, ','))) return fail(`an error: "${strText(val)}"`, { message: strText(val) });
      const end = ts.findIndex((x, k) => k > mt + 1 && isP(x, ','));
      const vw = targetWords(ctx.src.slice(val.s, (end < 0 ? ts.at(-1) : ts[end - 1]).e), ctx);
      if (vw) return fail(`an error whose message is in ${vw}`);
    }
    return fail('an error', {});
  }
  if (up === 'THROW') {
    if (ts.length === 1) return fail('the same error again: passes it on', { error: 'the same error' });
    const args = splitComma(rest);
    if (args.length === 3 && args[1].length === 1 && args[1][0].t === 'str') return fail(`an error: "${strText(args[1][0])}"`, { message: strText(args[1][0]) });
    if (args.length === 3) { const vw = targetWords(ctx.src.slice(args[1][0].s, args[1].at(-1).e), ctx); if (vw) return fail(`an error whose message is in ${vw}`); }
    return fail('an error');
  }
  if (up === 'RAISERROR' && isP(at(1), '(')) {
    const close = matchParen(ts, 1);
    const args = close > 0 ? splitComma(ts.slice(2, close)) : [];
    const sev = args[1]?.length === 1 && args[1][0].t === 'num' ? Number(args[1][0].v) : null;
    const m = args[0]?.length === 1 && args[0][0].t === 'str' ? `"${strText(args[0][0])}"` : args[0] ? (targetWords(ctx.src.slice(args[0][0].s, args[0].at(-1).e), ctx) ? `the text in ${targetWords(ctx.src.slice(args[0][0].s, args[0].at(-1).e), ctx)}` : null) : null;
    if (sev == null || !m) return asCode(t, base);
    // Severity 10 or less is a message; 11-19 is an error that does not stop the procedure unless it runs inside TRY.
    if (sev <= 10) return { kind: 'call', says: `Writes a message: ${m}`, code: t, ...base };
    if (sev >= 20 || ctx.inTry) return fail(m.startsWith('"') ? `an error: ${m}` : `an error whose message is ${m}`, m.startsWith('"') ? { message: m.slice(1, -1) } : {});
    return { kind: 'call', says: `Reports an error and carries on (unless a TRY … CATCH that called it catches the error): ${m}`, code: t, ...base };
  }
  if (up === 'PRINT') {
    const v = valueWords(restText(1), ctx, rest);
    return v ? { kind: 'call', says: `Writes a message: ${v}`, code: t, ...base } : asCode(t, base);
  }

  // ── Running other code ──
  if ((up === 'PERFORM' || up === 'CALL') && isW(at(1))) {
    let k = 1;
    while (isP(at(k + 1), '.') && isW(at(k + 2))) k += 2;
    if (isP(at(k + 1), '(') && matchParen(ts, k + 1) === ts.length - 1) return { kind: 'call', says: `Runs ${sqlWords(unq(at(k).v))}`, callee: unq(at(k).v), code: t, ...base };
    return asCode(t, base);
  }
  if (up === 'EXEC' || up === 'EXECUTE') {
    if (ctx.dialect === 'pg') {
      // Dynamic SQL: the text it runs, with each inserted value as a «placeholder»; USING (bound values) is code.
      const into = topWord(ts, ['INTO']);
      if (topWord(ts, ['USING']) >= 0 || ts.length < 2) return asCode(t, base);
      const what = sqlTextWords(ts.slice(1, into < 0 ? ts.length : into), ctx);
      if (!what) return asCode(t, base);
      let keep = '';
      if (into >= 0) {
        const strict = isW(ts[into + 1], 'STRICT') ? 1 : 0;
        const targets = splitComma(ts.slice(into + 1 + strict)).map((p) => targetWords(ctx.src.slice(p[0].s, p.at(-1).e), ctx));
        if (!targets.length || !targets.every(Boolean)) return asCode(t, base);
        keep = `, and keeps what it gives back in ${sqlListWords(targets)}`;
      }
      return { kind: 'call', says: `Runs the SQL ${what}${keep}`, code: t, ...base };
    }
    if (ctx.dialect === 'mysql') {
      if (isW(at(1)) && (ts.length === 2 || isW(at(2), 'USING'))) return { kind: 'call', says: `Runs the prepared statement ${at(1).v}`, code: t, ...base };
      return asCode(t, base);
    }
    // T-SQL: EXEC proc …, EXEC @rc = proc …, EXEC (@sql), EXEC sp_executesql @sql, …; EXECUTE AS changes who it runs as.
    if (isW(at(1), 'AS')) return asCode(t, base);
    if (isP(at(1), '(')) {
      const close = matchParen(ts, 1);
      const inner = close === ts.length - 1 ? ts.slice(2, close) : null;
      const vw = inner && inner.length === 1 && inner[0].t === 'word' ? targetWords(inner[0].v, ctx) : null;
      return vw ? { kind: 'call', says: `Runs the SQL text in ${vw}`, code: t, ...base } : asCode(t, base);
    }
    let k = 1, keep = null;
    if (isW(at(1)) && /^@/.test(at(1).v) && isP(at(2), '=')) { keep = targetWords(at(1).v, ctx); k = 3; }
    if (!isW(at(k))) return asCode(t, base);
    let name = at(k).v; let j = k;
    while (isP(at(j + 1), '.') && isW(at(j + 2))) { j += 2; name = at(j).v; }
    if (/^@/.test(at(k).v) && j === k && !keep) return asCode(t, base);
    if (/^sp_executesql$/i.test(unq(name))) {
      const first = at(j + 1);
      const vw = first && first.t === 'word' && (!at(j + 2) || isP(at(j + 2), ',')) ? targetWords(first.v, ctx) : null;
      return vw ? { kind: 'call', says: `Runs the SQL text in ${vw}`, code: t, ...base } : asCode(t, base);
    }
    return { kind: 'call', says: `Runs ${sqlWords(unq(name))}${keep ? ` and keeps its return code in ${keep}` : ''}`, callee: unq(name), code: t, ...base };
  }
  if (up === 'PREPARE' && ctx.dialect === 'mysql' && isW(at(1)) && isW(at(2), 'FROM')) {
    const v = valueWords(restText(3), ctx, ts.slice(3));
    return v ? { kind: 'call', says: `Prepares the statement ${at(1).v} from ${v}`, code: t, ...base } : asCode(t, base);
  }
  if ((up === 'DEALLOCATE' || up === 'DROP') && isW(at(1), 'PREPARE') && isW(at(2)) && ts.length === 3) return { kind: 'call', says: `Frees the prepared statement ${at(2).v}`, code: t, ...base };
  if (up === 'DEALLOCATE' && ctx.dialect === 'tsql' && ts.length === 2 && isW(at(1))) return { kind: 'call', says: `Frees the cursor ${at(1).v}`, code: t, ...base };
  if (up === 'OPEN' && ts.length === 2 && isW(at(1))) return { kind: 'call', says: `Opens the cursor ${at(1).v}`, code: t, ...base };
  if (up === 'CLOSE' && ts.length === 2 && isW(at(1))) return { kind: 'call', says: `Closes the cursor ${at(1).v}`, code: t, ...base };
  if (up === 'FETCH') {
    const into = topWord(ts, ['INTO']);
    const from = topWord(ts, ['FROM', 'IN']);
    const cur = from > 0 ? at(from + 1) : at(1);
    const plainFetch = into > 0 && cur && isW(cur) && (from > 0 ? into === from + 2 && ts.slice(1, from).every((x) => isW(x, 'NEXT')) : into === 2);
    if (plainFetch) {
      const targets = splitComma(ts.slice(into + 1)).map((p) => (p.length === 1 ? targetWords(p[0].v, ctx) : null));
      if (targets.every(Boolean)) return { kind: 'call', says: `Takes the next row of ${cur.v} into ${sqlListWords(targets)}`, code: t, ...base };
    }
    return asCode(t, base);
  }

  // ── Setting values ──
  if (up === 'GET' && ctx.dialect === 'pg') {
    const m = t.match(/^GET\s+(?:CURRENT\s+)?DIAGNOSTICS\s+([\w.]+)\s*(?::=|=)\s*ROW_COUNT$/i);
    if (m && targetWords(m[1], ctx)) return { kind: 'set', says: `Sets ${targetWords(m[1], ctx)} to how many rows the last statement changed`, code: t, ...base };
    return asCode(t, base);
  }
  if (up === 'SET' && ctx.dialect !== 'pg') {
    // SET a = x, b = y (MySQL) / SET @a = x (T-SQL). Options (SET NOCOUNT ON, SET NAMES …) are code.
    const parts = splitComma(rest);
    const sets = [];
    for (const p of parts) {
      let k = 0;
      if (isW(p[0], 'SESSION', 'GLOBAL', 'LOCAL', 'PERSIST')) k = 1;
      let j = k;
      while (isP(p[j + 1], '.') && isW(p[j + 2])) j += 2;
      const op = p[j + 1];
      if (!isW(p[k]) || !(isP(op, '=') || isP(op, ':='))) return [asCode(t, base)];
      const target = targetWords(ctx.src.slice(p[k].s, p[j].e), ctx);
      const vts = p.slice(j + 2);
      const v = vts.length ? valueWords(ctx.src.slice(vts[0].s, vts.at(-1).e), ctx, vts) : null;
      if (!target || !v || k) return [asCode(t, base)];
      sets.push(setPair(target, v, ctx.src.slice(p[k].s, p[j].e), ctx.src.slice(vts[0].s, vts.at(-1).e)));
    }
    return { kind: 'set', says: `Sets ${sqlListWords(sets)}`, code: t, ...base };
  }
  if (up === 'SELECT') return selectStatement(ts, t, base, ctx);
  {
    // PL/pgSQL assignment: target := value (or =).
    let j = 0;
    if (ctx.dialect === 'pg' && isW(at(0))) {
      while (isP(at(j + 1), '.') && isW(at(j + 2))) j += 2;
      if (isP(at(j + 1), ':=') || (isP(at(j + 1), '=') && !isW(at(0), 'UPDATE', 'DELETE', 'INSERT'))) {
        const target = targetWords(ctx.src.slice(at(0).s, at(j).e), ctx);
        const vts = ts.slice(j + 2);
        const v = vts.length ? valueWords(ctx.src.slice(vts[0].s, vts.at(-1).e), ctx, vts) : null;
        if (target && v) return { kind: 'set', says: `Sets ${setPair(target, v, ctx.src.slice(at(0).s, at(j).e), ctx.src.slice(vts[0].s, vts.at(-1).e))}`, code: t, ...base };
        return asCode(t, base);
      }
    }
  }

  // ── Changing tables ──
  if (up === 'INSERT') return insertStatement(ts, t, base, ctx);
  if (up === 'UPDATE') {
    const set = topWord(ts, ['SET']);
    let tEnd = 1;
    while (isP(at(tEnd + 1), '.') && isW(at(tEnd + 2))) tEnd += 2;
    if (!isW(at(1)) || (set !== tEnd + 1 && !(set === tEnd + 2 && isW(at(tEnd + 1))))) return asCode(t, base);
    if (topWord(ts, ['FROM', 'RETURNING', 'OUTPUT', 'JOIN', 'ORDER', 'LIMIT', 'WHERE CURRENT'], set) >= 0) return asCode(t, base);
    const where = topWord(ts, ['WHERE'], set);
    const setTs = ts.slice(set + 1, where < 0 ? ts.length : where);
    const sets = [];
    for (const p of splitComma(setTs)) {
      const eq = p.findIndex((x) => isP(x, '='));
      if (eq < 1) return asCode(t, base);
      const target = targetWords(ctx.src.slice(p[0].s, p[eq - 1].e), { ...ctx, dialect: 'pg' });
      const vts = p.slice(eq + 1);
      const v = vts.length ? valueWords(ctx.src.slice(vts[0].s, vts.at(-1).e), ctx, vts) : null;
      if (!target || !v) return asCode(t, base);
      sets.push(`${target.replace(/^the .*'s /, '')} to ${v}`);
    }
    const w = where < 0 ? '' : condWords(ctx.src.slice(at(where + 1).s, ts.at(-1).e), ctx);
    if (w == null) return asCode(t, base);
    return { kind: 'call', says: `Records the change in ${sqlWords(sqlBare(ctx.src.slice(at(1).s, at(tEnd).e)))}: sets ${sqlListWords(sets)}${where < 0 ? ' in every row' : ` where ${w}`}`, code: t, ...base };
  }
  if (up === 'DELETE' && isW(at(1), 'FROM') && isW(at(2))) {
    let j = 2;
    while (isP(at(j + 1), '.') && isW(at(j + 2))) j += 2;
    const table = sqlWords(sqlBare(ctx.src.slice(at(2).s, at(j).e)));
    if (ts.length === j + 1) return { kind: 'call', says: `Removes every row in ${table}`, code: t, ...base };
    if (!isW(at(j + 1), 'WHERE') || topWord(ts, ['USING', 'RETURNING', 'OUTPUT', 'JOIN', 'FROM', 'ORDER', 'LIMIT'], j + 1) >= 0) return asCode(t, base);
    const w = condWords(ctx.src.slice(at(j + 2).s, ts.at(-1).e), ctx);
    return w ? { kind: 'call', says: `Removes ${table} where ${w}`, code: t, ...base } : asCode(t, base);
  }
  if (up === 'TRUNCATE') {
    const k = isW(at(1), 'TABLE') ? 2 : 1;
    let j = k;
    while (isP(at(j + 1), '.') && isW(at(j + 2))) j += 2;
    if (isW(at(k)) && ts.length === j + 1) return { kind: 'call', says: `Removes every row in ${sqlWords(sqlBare(ctx.src.slice(at(k).s, at(j).e)))}`, code: t, ...base };
    return asCode(t, base);
  }
  return asCode(t, base);
}

/** Index of the `)` matching the `(` at ts[k], or -1. */
function matchParen(ts, k) {
  for (let d = 0, j = k; j < ts.length; j++) { if (isP(ts[j], '(')) d++; else if (isP(ts[j], ')') && --d === 0) return j; }
  return -1;
}

/** SELECT … INTO targets FROM table WHERE … (PL/pgSQL, MySQL); anything else is a result or code. */
function selectStatement(ts, t, base, ctx) {
  const into = topWord(ts, ['INTO']);
  const from = topWord(ts, ['FROM']);
  if (ctx.dialect === 'tsql') {
    // SELECT @a = x, @b = y (no FROM) sets values; SELECT … INTO #t makes a table; other SELECTs send rows back.
    if (from < 0 && into < 0) {
      const sets = [];
      for (const p of splitComma(ts.slice(1))) {
        if (!(p[0]?.t === 'word' && /^@/.test(p[0].v) && isP(p[1], '='))) return asCode(t, base);
        const v = valueWords(ctx.src.slice(p[2]?.s ?? 0, p.at(-1).e), ctx, p.slice(2));
        if (!p[2] || !v) return asCode(t, base);
        sets.push(`${targetWords(p[0].v, ctx)} to ${v}`);
      }
      return sets.length ? { kind: 'set', says: `Sets ${sqlListWords(sets)}`, code: t, ...base } : asCode(t, base);
    }
    return asCode(t, base);
  }
  if (into < 0) return asCode(t, base);
  if (into > from && from > 0) return asCode(t, base); // MySQL's INTO at the end
  const strict = isW(ts[into + 1], 'STRICT') ? 1 : 0;
  const targetTs = ts.slice(into + 1 + strict, from < 0 ? ts.length : from);
  const targets = splitComma(targetTs).map((p) => targetWords(ctx.src.slice(p[0].s, p.at(-1).e), ctx));
  const cols = splitComma(ts.slice(1, into));
  if (!targets.length || !targets.every(Boolean) || !cols.length) return asCode(t, base);
  if (from < 0) {
    // SELECT x INTO v (no table): sets v to x.
    if (cols.length !== targets.length) return asCode(t, base);
    const vals = cols.map((p) => valueWords(ctx.src.slice(p[0].s, p.at(-1).e), ctx, p));
    if (!vals.every(Boolean)) return asCode(t, base);
    return { kind: 'set', says: `Sets ${sqlListWords(targets.map((x, k) => `${x} to ${vals[k]}`))}`, code: t, ...base };
  }
  // FROM one table [alias] [WHERE …] and nothing else.
  let j = from + 1;
  if (!isW(ts[j])) return asCode(t, base);
  while (isP(ts[j + 1], '.') && isW(ts[j + 2])) j += 2;
  const table = sqlWords(sqlBare(ctx.src.slice(ts[from + 1].s, ts[j].e)));
  let k = j + 1;
  if (isW(ts[k], 'AS')) k++;
  if (isW(ts[k]) && !isW(ts[k], 'WHERE')) k++;
  if (k < ts.length && !isW(ts[k], 'WHERE')) return asCode(t, base);
  if (topWord(ts, ['GROUP', 'ORDER', 'LIMIT', 'HAVING', 'UNION', 'OFFSET', 'FOR', 'JOIN', 'WINDOW', 'FETCH'], from) >= 0) return asCode(t, base);
  const w = k < ts.length ? condWords(ctx.src.slice(ts[k + 1].s, ts.at(-1).e), ctx) : '';
  if (w == null) return asCode(t, base);
  // Each column: a plain column name, or count(*) and friends.
  const colWords = cols.map((p) => {
    if (p.length === 1 && isW(p[0])) return sqlWords(unq(p[0].v));
    if (p.length === 3 && isW(p[0]) && isP(p[1], '.') && isW(p[2])) return sqlWords(unq(p[2].v));
    const agg = ctx.src.slice(p[0].s, p.at(-1).e).match(/^(count|sum|avg|min|max)\s*\(\s*(\*|[\w.]+)\s*\)$/i);
    if (agg) { const what = agg[2] === '*' ? 'rows' : sqlWords(sqlBare(agg[2])); return { count: `how many ${what}`, sum: `the total of ${what}`, avg: `the average ${what}`, min: `the lowest ${what}`, max: `the highest ${what}` }[agg[1].toLowerCase()]; }
    return null;
  });
  if (!colWords.every(Boolean) || colWords.length !== targets.length) return asCode(t, base);
  const where = w ? ` where ${w}` : '';
  const same = colWords.every((c, n) => c === targets[n]);
  return { kind: 'call', callee: 'find', says: same ? `Finds ${sqlListWords(targets)} in the ${table}${where}` : `Finds ${sqlListWords(colWords)} in the ${table}${where}, as ${sqlListWords(targets)}`, code: t, ...base };
}

/** INSERT INTO table (cols) VALUES (…) | SELECT …; anything with ON CONFLICT, RETURNING, OUTPUT is code. */
function insertStatement(ts, t, base, ctx) {
  if (!isW(ts[1], 'INTO') || !isW(ts[2])) return asCode(t, base);
  if (topWord(ts, ['ON', 'RETURNING', 'OUTPUT', 'IGNORE']) >= 0) return asCode(t, base);
  let j = 2;
  while (isP(ts[j + 1], '.') && isW(ts[j + 2])) j += 2;
  const table = sqlBare(ctx.src.slice(ts[2].s, ts[j].e));
  let k = j + 1, cols = [];
  if (isP(ts[k], '(')) {
    const close = matchParen(ts, k);
    if (close < 0) return asCode(t, base);
    cols = splitComma(ts.slice(k + 1, close)).map((p) => (p.length === 1 && isW(p[0]) ? sqlWords(unq(p[0].v)) : null));
    if (!cols.every(Boolean)) return asCode(t, base);
    k = close + 1;
  }
  const withCols = cols.length ? ` with ${sqlListWords(cols)}` : '';
  if (isW(ts[k], 'VALUES')) {
    const rows = splitComma(ts.slice(k + 1));
    return { kind: 'call', says: rows.length === 1 ? `Records a new ${sqlSingular(sqlWords(table))}${withCols}` : `Records ${rows.length} new ${sqlWords(table)}${withCols}`, code: t, ...base };
  }
  if (isW(ts[k], 'SELECT', 'WITH')) return { kind: 'call', says: `Records in ${sqlWords(table)} the rows a query finds${withCols}`, code: t, ...base };
  return asCode(t, base);
}

// ── The block parser ─────────────────────────────────────────────────────────────────────────────────────

// T-SQL has no statement terminator: a statement ends where the next one starts.
const TSQL_START = new Set('SELECT INSERT UPDATE DELETE SET DECLARE IF ELSE WHILE BEGIN END RETURN EXEC EXECUTE PRINT RAISERROR THROW CREATE DROP ALTER TRUNCATE MERGE OPEN FETCH CLOSE DEALLOCATE BREAK CONTINUE GOTO WAITFOR USE GRANT REVOKE DENY COMMIT ROLLBACK SAVE DBCC BULK BACKUP RESTORE KILL RECONFIGURE CHECKPOINT WITH'.split(' '));

/**
 * The steps of a routine body: tokens toks[from, to), parsed as blocks. ctx: { src, lineAt, dialect ('pg' | 'mysql'
 * | 'tsql'), routine ('function' | 'procedure'), setof, trigger }.
 */
export function bodySteps(toks, ctx, opts = {}) {
  let i = 0;
  const n = toks.length;
  const labels = [];
  const peek = (k = 0) => toks[i + k];
  const lineOf = (tok) => ctx.lineAt(tok.s);
  const baseOf = (a, b) => ({ line: lineOf(toks[a]), span: { startLine: lineOf(toks[a]), endLine: lineOf(toks[Math.max(a, b - 1)]) } });
  const textOf = (a, b) => ctx.src.slice(toks[a].s, toks[b - 1].e);
  const semi = ctx.dialect !== 'tsql';
  const expect = (cond, what) => { if (!cond) throw new Unmatched(`${what} (line ${peek() ? lineOf(peek()) : 'end'})`); };
  const skipSemis = () => { while (isP(peek(), ';')) i++; };

  /** End of a simple statement starting at a: index of its last token + 1 (i is not moved). */
  const simpleEnd = (a) => {
    let d = 0, cs = 0;
    const head = toks[a].up;
    let seenSelect = false, seenSet = false, seenExec = false, cursorFor = false;
    for (let j = a; j < n; j++) {
      const x = toks[j];
      if (isP(x, '(') || isP(x, '[')) { d++; continue; }
      if (isP(x, ')') || isP(x, ']')) { d--; continue; }
      if (d > 0) continue;
      if (isP(x, ';')) return j;
      if (!isW(x)) continue;
      if (x.up === 'CASE') { cs++; continue; }
      if (x.up === 'END') { if (cs > 0) { cs--; continue; } if (j > a) return j; continue; }
      if (cs > 0 || j === a) continue;
      // T-SQL RETURN (…) / a function's RETURN SELECT …: the value is part of the RETURN.
      if (!semi && head === 'RETURN' && j === a + 1 && (isP(x, '(') || (ctx.routine === 'function' && isW(x, 'SELECT', 'WITH')))) continue;
      if (semi) {
        if (x.up === 'ELSIF' || x.up === 'ELSEIF' || x.up === 'ELSE' || x.up === 'UNTIL') return j;
        if (x.up === 'EXCEPTION' && isW(toks[j + 1], 'WHEN') && !isW(toks[j - 1], 'RAISE')) return j;
        continue;
      }
      // T-SQL: the next statement starts here unless this word continues the current one.
      const prev = toks[j - 1];
      if (x.up === 'FOR' && head === 'DECLARE') cursorFor = true;
      if (!TSQL_START.has(x.up)) continue;
      if (isP(toks[j + 1], '(') && x.up === 'UPDATE') continue; // IF UPDATE(col)
      if (isP(prev, '.') || isP(toks[j + 1], '.')) continue; // a name: x.[delete]
      if (isP(prev, ':') || isP(prev, '::')) continue;
      if (head === 'MERGE') continue;
      if (x.up === 'SELECT') {
        if (isW(prev, 'UNION', 'ALL', 'EXCEPT', 'INTERSECT', 'DISTINCT')) continue;
        if (!seenSelect && (head === 'INSERT' || head === 'WITH' || (head === 'DECLARE' && cursorFor) || head === 'CREATE' || head === 'GRANT' || head === 'REVOKE' || head === 'DENY')) { seenSelect = true; continue; }
        return j;
      }
      if (x.up === 'SET' && !seenSet && (head === 'UPDATE' || head === 'ALTER')) { seenSet = true; continue; }
      if ((x.up === 'EXEC' || x.up === 'EXECUTE') && !seenExec && (head === 'INSERT' || head === 'GRANT' || head === 'REVOKE' || head === 'DENY' || isW(prev, 'WITH', 'AS'))) { seenExec = true; continue; }
      if ((x.up === 'INSERT' || x.up === 'UPDATE' || x.up === 'DELETE') && (head === 'WITH' || head === 'GRANT' || head === 'REVOKE' || head === 'DENY' || isW(prev, 'FOR', 'ON', 'OF', 'AFTER', 'INSTEAD', ','))) { if (head === 'WITH') seenSelect = true; continue; }
      if (x.up === 'IF' && isW(toks[j + 1], 'EXISTS', 'NOT')) continue; // DROP TABLE IF EXISTS
      if (x.up === 'WITH') { if (isW(toks[j + 1]) && isW(toks[j + 2], 'AS') && isP(toks[j + 3], '(')) return j; continue; }
      if (x.up === 'FETCH' && isW(prev, 'ROWS', 'ROW')) continue;
      if (x.up === 'CREATE' && head === 'WITH') continue;
      if (x.up === 'USE' && head !== 'USE') continue;
      if (x.up === 'BEGIN' && head === 'WITH') return j;
      if ((x.up === 'COMMIT' || x.up === 'ROLLBACK' || x.up === 'SAVE') && isW(prev, 'ON')) continue;
      if ((x.up === 'DROP' || x.up === 'ALTER' || x.up === 'CREATE') && (head === 'GRANT' || head === 'REVOKE' || head === 'DENY' || head === 'ALTER')) continue;
      return j;
    }
    return n;
  };

  /** A condition from i up to (not including) a token that `stop` accepts at top level; i moves to that token. */
  const condUntil = (stop) => {
    const a = i;
    let d = 0, cs = 0;
    for (; i < n; i++) {
      const x = toks[i];
      if (isP(x, '(') || isP(x, '[')) { d++; continue; }
      if (isP(x, ')') || isP(x, ']')) { d--; continue; }
      if (d > 0) continue;
      if (isW(x, 'CASE')) { cs++; continue; }
      if (isW(x, 'END') && cs > 0) { cs--; continue; }
      if (cs === 0 && i > a && stop(x, i)) break;
    }
    expect(i > a && i < n, 'a condition without its end');
    return [a, i];
  };

  const branch = (a, b, children, otherwise, extraLine = null) => {
    const text = code(textOf(a, b));
    const w = condWords(text, ctx);
    return { kind: 'branch', says: `If ${w ?? asCodeWords(text, 400)}`, code: text, cond: text, ...baseOf(a, b), ...(extraLine ? { line: extraLine } : {}), children, ...(otherwise ? { otherwise } : {}) };
  };

  const jumpStep = (kind, label, a, b) => {
    const l = label ? labels.findLast((x) => x.name.toLowerCase() === label.toLowerCase()) : labels.findLast((x) => x.kind === 'loop');
    const base = baseOf(a, b);
    const t = code(textOf(a, b));
    if (kind === 'continue') return { kind: 'call', says: `Skips to the next round of the loop${label ? ` (${label})` : ''}`, code: t, jump: 'continue', ...base };
    if (l && l.kind === 'body') return { kind: 'return', says: 'Stops here', code: t, ...base };
    if (l && l.kind === 'block') return { kind: 'call', says: `Leaves the block ${label}`, code: t, jump: 'break', ...base };
    return { kind: 'call', says: `Leaves the loop${label ? ` (${label})` : ''}`, code: t, jump: 'break', ...base };
  };

  const block = (stop) => {
    const out = [];
    for (;;) {
      skipSemis();
      const t = peek();
      if (!t || stop(t)) return out;
      const before = i;
      out.push(...statement());
      if (i === before) i++;
    }
  };
  const endsWith = (...ws) => (t) => isW(t) && ws.includes(t.up);

  /** END <word> [label] [;] */
  const closeWith = (word, what) => {
    expect(isW(peek(), 'END') && (!word || isW(peek(1), word)), `${what} without its END${word ? ` ${word}` : ''}`);
    i += word ? 2 : 1;
    if (isW(peek()) && !isW(peek(), 'IF', 'WHILE', 'ELSE', 'BEGIN', 'END') && semi && (isP(peek(1), ';') || !peek(1))) i++; // END LOOP label;
    if (isP(peek(), ';')) i++;
  };

  const tsqlBody = () => {
    // One statement, or BEGIN … END as a block of statements.
    skipSemis();
    if (isW(peek(), 'BEGIN') && !isW(peek(1), 'TRAN', 'TRANSACTION', 'DISTRIBUTED', 'TRY', 'CATCH')) {
      i++;
      const kids = block(endsWith('END'));
      closeWith(null, 'BEGIN');
      return kids;
    }
    return statement();
  };

  const loopStep = (says, a, b, label, bodyFn) => {
    labels.push({ name: label ?? '', kind: 'loop' });
    const kids = bodyFn();
    labels.pop();
    return { kind: 'loop', says, code: code(textOf(a, b)), ...baseOf(a, b), children: kids };
  };

  function statement(label = null) {
    const a = i;
    const t = peek();
    // Labels: <<name>> (PL/pgSQL), name: (MySQL, T-SQL).
    if (isP(t, '<<') && isW(peek(1)) && isP(peek(2), '>>')) { i += 3; return statement(peek(-2).v); }
    if (isW(t) && isP(peek(1), ':') && !TSQL_START.has(t.up)) {
      i += 2;
      if (isW(peek(), 'BEGIN', 'LOOP', 'WHILE', 'REPEAT', 'FOR', 'FOREACH')) return statement(t.v);
      return []; // a GOTO target
    }
    if (t.t === 'ver') {
      // A versioned comment at the start of a statement: its statements, on the versions that run them.
      i++;
      const inner = lexSql(ctx.src, t.innerS, t.innerE, 'mysql');
      let kids;
      try { kids = bodySteps(inner, { ...ctx, depth: 1 }); } catch (err) { if (!(err instanceof Unmatched)) throw err; kids = [asCode(t.v, baseOf(a, a + 1))]; }
      if (t.version == null) return kids;
      const v = `${Math.floor(t.version / 10000)}.${Math.floor(t.version / 100) % 100}.${t.version % 100}`;
      return [{ kind: 'branch', says: `If the MySQL server is version ${v} or later`, code: code(t.v), cond: `MySQL version >= ${v}`, ...baseOf(a, a + 1), children: kids }];
    }
    if (!isW(t)) { const e = simpleEnd(a); i = Math.max(e, a + 1); if (isP(peek(), ';')) i++; return [asCode(textOf(a, Math.max(e, a + 1)), baseOf(a, Math.max(e, a + 1)))]; }
    const up = t.up;

    if (up === 'IF' && semi) {
      i++;
      const [c0, c1] = condUntil((x) => isW(x, 'THEN'));
      i++;
      const step = branch(c0, c1, block(endsWith('ELSIF', 'ELSEIF', 'ELSE', 'END')));
      step.line = lineOf(toks[a]);
      let tail = step;
      while (isW(peek(), 'ELSIF', 'ELSEIF')) {
        const at = i;
        i++;
        const [e0, e1] = condUntil((x) => isW(x, 'THEN'));
        i++;
        const next = branch(e0, e1, block(endsWith('ELSIF', 'ELSEIF', 'ELSE', 'END')), null, lineOf(toks[at]));
        tail.otherwise = [next]; tail = next;
      }
      if (isW(peek(), 'ELSE')) { tail.otherwiseLine = lineOf(peek()); i++; tail.otherwise = block(endsWith('END')); }
      closeWith('IF', 'IF');
      return [step];
    }
    if (up === 'IF' && !semi) {
      i++;
      const [c0, c1] = condUntil((x) => isW(x) && TSQL_START.has(x.up) && !(x.up === 'UPDATE' && isP(toks[i + 1], '(')) && !isP(toks[i - 1], '.'));
      const kids = tsqlBody();
      skipSemis();
      const step = branch(c0, c1, kids);
      step.line = lineOf(toks[a]);
      if (isW(peek(), 'ELSE')) { step.otherwiseLine = lineOf(peek()); i++; step.otherwise = tsqlBody(); }
      return [step];
    }
    if (up === 'CASE') {
      // A CASE statement: each WHEN a question; with no ELSE, a value that matches no WHEN is an error.
      i++;
      let subject = null;
      if (!isW(peek(), 'WHEN')) { const [s0, s1] = condUntil((x) => isW(x, 'WHEN')); subject = [s0, s1]; }
      const arms = [];
      while (isW(peek(), 'WHEN')) {
        const at = i;
        i++;
        const [w0, w1] = condUntil((x) => isW(x, 'THEN'));
        i++;
        arms.push({ at, w0, w1, kids: block(endsWith('WHEN', 'ELSE', 'END')) });
      }
      expect(arms.length, 'CASE without WHEN');
      let elseKids = null, elseLine = null;
      if (isW(peek(), 'ELSE')) { elseLine = lineOf(peek()); i++; elseKids = block(endsWith('END')); }
      closeWith(semi ? 'CASE' : null, 'CASE');
      const steps = arms.map((arm) => {
        let text;
        if (subject) {
          const subj = code(textOf(subject[0], subject[1]));
          const vals = splitComma(toks.slice(arm.w0, arm.w1)).map((p) => code(ctx.src.slice(p[0].s, p.at(-1).e)));
          text = vals.length === 1 ? `${subj} = ${vals[0]}` : `${subj} IN (${vals.join(', ')})`;
        } else text = code(textOf(arm.w0, arm.w1));
        const w = condWords(text, ctx);
        return { kind: 'branch', says: `If ${w ?? asCodeWords(text, 400)}`, code: text, cond: text, line: lineOf(toks[arm.at]), span: { startLine: lineOf(toks[arm.at]), endLine: lineOf(toks[arm.w1 - 1]) }, children: arm.kids };
      });
      for (let k = 0; k < steps.length - 1; k++) steps[k].otherwise = [steps[k + 1]];
      const last = steps.at(-1);
      if (elseKids) { last.otherwise = elseKids; last.otherwiseLine = elseLine; }
      else last.otherwise = [{ kind: 'fail', says: 'Fails with an error: no WHEN matched and there is no ELSE (case not found)', error: 'case not found', code: code(textOf(a, i)), line: lineOf(toks[a]) }];
      return [steps[0]];
    }
    if (up === 'LOOP' && semi) {
      i++;
      const step = loopStep('Repeats until a step inside stops it', a, a + 1, label, () => block(endsWith('END')));
      closeWith('LOOP', 'LOOP');
      return [step];
    }
    if (up === 'WHILE') {
      i++;
      const [c0, c1] = semi ? condUntil((x) => isW(x, 'LOOP', 'DO')) : condUntil((x) => isW(x) && TSQL_START.has(x.up) && !isP(toks[i - 1], '.'));
      const text = code(textOf(c0, c1));
      const w = condWords(text, ctx);
      if (semi) {
        const kw = peek().up;
        i++;
        const step = loopStep(`While ${w ?? asCodeWords(text, 400)}`, a, c1 + 1, label, () => block(endsWith('END')));
        closeWith(kw === 'DO' ? 'WHILE' : 'LOOP', 'WHILE');
        return [step];
      }
      return [loopStep(`While ${w ?? asCodeWords(text, 400)}`, a, c1, label, () => tsqlBody())];
    }
    if (up === 'REPEAT' && ctx.dialect === 'mysql') {
      i++;
      labels.push({ name: label ?? '', kind: 'loop' });
      const kids = block(endsWith('UNTIL'));
      labels.pop();
      expect(isW(peek(), 'UNTIL'), 'REPEAT without UNTIL');
      i++;
      const [c0, c1] = condUntil((x) => isW(x, 'END'));
      const text = code(textOf(c0, c1));
      const w = condWords(text, ctx);
      closeWith('REPEAT', 'REPEAT');
      return [{ kind: 'loop', says: `Runs once, then repeats until ${w ?? asCodeWords(text, 400)}`, code: code(textOf(a, c1)), ...baseOf(a, c1), children: kids }];
    }
    if ((up === 'FOR' || up === 'FOREACH') && ctx.dialect === 'pg') {
      i++;
      const [h0, h1] = condUntil((x) => isW(x, 'LOOP'));
      i++;
      const head = toks.slice(h0, h1);
      let says;
      const inAt = head.findIndex((x) => isW(x, 'IN'));
      const vars = inAt > 0 ? splitComma(head.slice(0, inAt)).map((p) => (p.length === 1 ? plainName(unq(p[0].v)) : null)) : [null];
      const what = head.slice(inAt + 1);
      const dots = what.findIndex((x) => isP(x, '..'));
      if (!vars.every(Boolean)) says = `Repeats for ${asCodeWords(code(textOf(h0, h1)), 400)}`;
      else if (up === 'FOREACH') {
        const arr = what[0] && isW(what[0], 'ARRAY') ? targetWords(ctx.src.slice(what[1].s, what.at(-1).e), ctx) : null;
        const slice = head.some((x) => isW(x, 'SLICE'));
        says = arr && !slice ? `For each ${vars.join(' and ')} in ${arr}` : `Repeats for ${asCodeWords(code(textOf(h0, h1)), 400)}`;
      } else if (dots > 0) {
        let k = 0;
        const reverse = isW(what[0], 'REVERSE');
        if (reverse) k = 1;
        const byAt = what.findIndex((x) => isW(x, 'BY'));
        const lo = valueWords(ctx.src.slice(what[k].s, what[dots - 1].e), ctx, what.slice(k, dots));
        const hiTs = what.slice(dots + 1, byAt < 0 ? what.length : byAt);
        const hi = hiTs.length ? valueWords(ctx.src.slice(hiTs[0].s, hiTs.at(-1).e), ctx, hiTs) : null;
        const by = byAt < 0 ? null : valueWords(ctx.src.slice(what[byAt + 1].s, what.at(-1).e), ctx, what.slice(byAt + 1));
        says = lo && hi && (byAt < 0 || by) ? `Counts ${vars[0]} from ${lo} ${reverse ? 'down ' : ''}to ${hi}${by ? `, in steps of ${by}` : ''}` : `Repeats for ${asCodeWords(code(textOf(h0, h1)), 400)}`;
      } else if (isW(what[0], 'EXECUTE')) says = `For each row (${vars.join(', ')}) of a query built when it runs`;
      else if (isW(what[0], 'SELECT', 'WITH', 'VALUES', 'TABLE')) says = `For each row (${vars.join(', ')}) the query finds`;
      else says = `Repeats for ${asCodeWords(code(textOf(h0, h1)), 400)}`;
      const step = loopStep(says, a, h1 + 1, label, () => block(endsWith('END')));
      closeWith('LOOP', 'FOR');
      return [step];
    }
    if ((up === 'EXIT' || up === 'CONTINUE' || up === 'LEAVE' || up === 'ITERATE' || up === 'BREAK') && (semi || up === 'BREAK' || up === 'CONTINUE')) {
      const e = simpleEnd(a);
      const ts = toks.slice(a, e);
      i = e;
      if (isP(peek(), ';')) i++;
      const kind = up === 'CONTINUE' || up === 'ITERATE' ? 'continue' : 'break';
      const lab = isW(ts[1]) && !isW(ts[1], 'WHEN') ? ts[1].v : null;
      const when = ts.findIndex((x) => isW(x, 'WHEN'));
      const jump = jumpStep(kind, lab, a, e);
      if (when > 0 && ctx.dialect === 'pg') return [branch(a + when + 1, e, [jump])];
      return [jump];
    }
    if (up === 'BEGIN') {
      if (!semi && isW(peek(1), 'TRAN', 'TRANSACTION', 'DISTRIBUTED')) { const e = simpleEnd(a + 1); i = e; if (isP(peek(), ';')) i++; return [asCode(textOf(a, e), baseOf(a, e))]; }
      if (!semi && isW(peek(1), 'TRY')) {
        i += 2;
        const was = ctx.inTry; ctx.inTry = true;
        const kids = block(endsWith('END'));
        ctx.inTry = was;
        closeWith('TRY', 'BEGIN TRY');
        skipSemis();
        expect(isW(peek(), 'BEGIN') && isW(peek(1), 'CATCH'), 'BEGIN TRY without BEGIN CATCH');
        const hLine = lineOf(peek());
        i += 2;
        const handler = block(endsWith('END'));
        closeWith('CATCH', 'BEGIN CATCH');
        return [{ kind: 'try', says: 'Tries these steps and handles any error', code: 'BEGIN TRY', ...baseOf(a, a + 2), children: kids, handlers: [{ says: 'If anything goes wrong', line: hLine, steps: handler }] }];
      }
      i++;
      if (semi && isW(peek(), 'ATOMIC')) i++;
      const top = labels.length === 0 && ctx.depth === 0;
      labels.push({ name: label ?? '', kind: top ? 'body' : 'block' });
      ctx.depth++;
      const kids = block(endsWith('END', 'EXCEPTION'));
      let handlers = null;
      if (ctx.dialect === 'pg' && isW(peek(), 'EXCEPTION')) {
        i++;
        handlers = [];
        while (isW(peek(), 'WHEN')) {
          const hAt = i;
          i++;
          const [c0, c1] = condUntil((x) => isW(x, 'THEN'));
          i++;
          const names = toks.slice(c0, c1).filter((x) => !isW(x, 'OR', 'SQLSTATE')).map((x) => (x.t === 'str' ? `error ${strText(x)}` : sqlWords(x.v)));
          const any = toks.slice(c0, c1).some((x) => isW(x, 'OTHERS'));
          handlers.push({ says: any ? 'If anything goes wrong' : `If ${names.join(' or ')} goes wrong`, line: lineOf(toks[hAt]), steps: block(endsWith('WHEN', 'END')) });
        }
      }
      ctx.depth--;
      labels.pop();
      closeWith(null, 'BEGIN');
      if (handlers) return [{ kind: 'try', says: 'Tries these steps and handles any error', code: 'BEGIN', ...baseOf(a, a + 1), children: kids, handlers }];
      return kids;
    }
    if (up === 'DECLARE') {
      if (ctx.dialect === 'pg') {
        // The declaration section, up to its BEGIN: a starting value is a step; a plain declaration is not.
        i++;
        const out = [];
        while (peek() && !isW(peek(), 'BEGIN')) {
          const d0 = i;
          let d = 0;
          while (peek() && !(d === 0 && isP(peek(), ';'))) { if (isP(peek(), '(')) d++; else if (isP(peek(), ')')) d--; i++; }
          const ts = toks.slice(d0, i);
          if (isP(peek(), ';')) i++;
          if (!ts.length || isW(ts[1], 'CURSOR', 'ALIAS') || isW(ts[0], 'DECLARE')) continue;
          const at = ts.findIndex((x) => isP(x, ':=') || isP(x, '=') || isW(x, 'DEFAULT'));
          if (at < 0) continue;
          const target = targetWords(ts[0].v, ctx);
          const vts = ts.slice(at + 1);
          const v = vts.length ? valueWords(ctx.src.slice(vts[0].s, vts.at(-1).e), ctx, vts) : null;
          out.push(target && v ? { kind: 'set', says: `Sets ${setPair(target, v, ts[0].v, ctx.src.slice(vts[0].s, vts.at(-1).e))}`, code: code(textOf(d0, d0 + ts.length)), ...baseOf(d0, d0 + ts.length) } : asCode(textOf(d0, d0 + ts.length), baseOf(d0, d0 + ts.length)));
        }
        return out;
      }
      if (ctx.dialect === 'mysql' && isW(peek(1), 'CONTINUE', 'EXIT', 'UNDO') && isW(peek(2), 'HANDLER') && isW(peek(3), 'FOR')) {
        const kind = peek(1).up;
        i += 4;
        const conds = [];
        for (;;) {
          if (isW(peek(), 'NOT') && isW(peek(1), 'FOUND')) { conds.push('no row is found'); i += 2; }
          else if (isW(peek(), 'SQLEXCEPTION')) { conds.push('an error happens'); i++; }
          else if (isW(peek(), 'SQLWARNING')) { conds.push('a warning happens'); i++; }
          else if (isW(peek(), 'SQLSTATE')) { i++; if (isW(peek(), 'VALUE')) i++; conds.push(`error state "${peek()?.t === 'str' ? strText(peek()) : peek()?.v}" happens`); i++; }
          else if (peek()?.t === 'num') { conds.push(`MySQL error ${peek().v} happens`); i++; }
          else if (isW(peek())) { conds.push(`${sqlWords(peek().v)} happens`); i++; }
          else break;
          if (isP(peek(), ',')) { i++; continue; }
          break;
        }
        const h0 = i;
        const was = ctx.depth; ctx.depth = 1; // a handler's BEGIN is its own block, not the body
        const kids = statement();
        ctx.depth = was;
        const simple = kids.length === 1 && kids[0].kind === 'set';
        const after = kind === 'CONTINUE' ? 'then carries on after the statement that caused it' : 'then leaves the block it is declared in';
        const base = baseOf(a, Math.max(h0, i));
        if (simple) return [{ kind: 'call', says: `From here on, whenever ${conds.join(' or ')}: ${lower1(kids[0].says)}, ${after}`, code: code(textOf(a, i)), ...base }];
        return [asCode(textOf(a, i), base)];
      }
      // MySQL DECLARE a, b INT DEFAULT 0 / T-SQL DECLARE @a INT = 0, @b INT: a starting value is a step.
      const e = simpleEnd(a);
      const ts = toks.slice(a + 1, e);
      i = e;
      if (isP(peek(), ';')) i++;
      if (ctx.dialect === 'mysql') {
        const def = topWord(ts, ['DEFAULT']);
        if (def < 0 || isW(ts[1], 'CURSOR', 'CONDITION')) return [];
        const names = [];
        for (let k = 0; k < ts.length && isW(ts[k]); k += 2) { names.push(ts[k].v); if (!isP(ts[k + 1], ',')) break; }
        const vts = ts.slice(def + 1);
        const v = vts.length ? valueWords(ctx.src.slice(vts[0].s, vts.at(-1).e), ctx, vts) : null;
        const targets = names.map((x) => targetWords(x, ctx));
        if (!v || !targets.every(Boolean)) return [asCode(textOf(a, e), baseOf(a, e))];
        return [{ kind: 'set', says: `Sets ${sqlListWords(targets)} to ${v}`, code: code(textOf(a, e)), ...baseOf(a, e) }];
      }
      if (isW(ts[1], 'CURSOR')) return [];
      const sets = [];
      for (const p of splitComma(ts)) {
        const eq = p.findIndex((x) => isP(x, '='));
        if (eq < 0) continue;
        const target = targetWords(p[0].v, ctx);
        const vts = p.slice(eq + 1);
        const v = vts.length ? valueWords(ctx.src.slice(vts[0].s, vts.at(-1).e), ctx, vts) : null;
        if (!target || !v) return [asCode(textOf(a, e), baseOf(a, e))];
        sets.push(setPair(target, v, p[0].v, ctx.src.slice(vts[0].s, vts.at(-1).e)));
      }
      return sets.length ? [{ kind: 'set', says: `Sets ${sqlListWords(sets)}`, code: code(textOf(a, e)), ...baseOf(a, e) }] : [];
    }
    if (up === 'NULL' && semi) { i++; if (isP(peek(), ';')) i++; return []; } // PL/pgSQL's "do nothing"
    if (up === 'GOTO') { const e = simpleEnd(a); i = e; if (isP(peek(), ';')) i++; return [{ kind: 'call', says: `Jumps to ${toks[a + 1]?.v ?? 'a label'}`, code: code(textOf(a, e)), jump: 'break', ...baseOf(a, e) }]; }
    if (!semi && (up === 'ELSE' || up === 'END')) throw new Unmatched(`${up} without its IF or BEGIN (line ${lineOf(t)})`);
    if (semi && (up === 'ELSE' || up === 'ELSIF' || up === 'ELSEIF' || up === 'WHEN' || up === 'UNTIL' || up === 'EXCEPTION')) throw new Unmatched(`${up} outside its block (line ${lineOf(t)})`);
    if (semi && up === 'END' && !ctx.allowEnd) throw new Unmatched(`END without its BEGIN (line ${lineOf(t)})`);

    // A simple statement.
    const e = Math.max(simpleEnd(a), a + 1);
    i = e;
    if (isP(peek(), ';')) i++;
    const step = statementStep(toks.slice(a, e), textOf(a, e), baseOf(a, e), ctx);
    return Array.isArray(step) ? step : [step];
  }

  ctx.depth = ctx.depth ?? 0;
  if (opts.one) { skipSemis(); const steps = statement(); return { steps, used: Math.max(i, 1) }; }
  return block(() => false);
}

export { Unmatched };

// ── Routines: header, inputs, body ───────────────────────────────────────────────────────────────────────

/** The dialect a file is written in, from its signs: dollar quotes (PostgreSQL), DELIMITER (MySQL), GO and @ (T-SQL). */
export function sqlDialect(src) {
  if (/^\s*DELIMITER\s+\S+/im.test(src) || /\bDEFINER\s*=\s*['`"]?\w/i.test(src) || /\bSIGNAL\s+SQLSTATE\b/i.test(src)) return 'mysql';
  if (/\bAS\s+\$\w*\$/i.test(src) || /\$\w*\$\s*LANGUAGE\b/i.test(src) || /\bLANGUAGE\s+'?plpgsql\b/i.test(src) || /\bDO\s+\$\w*\$/i.test(src)) return 'pg';
  if (/^\s*GO\s*$/im.test(src) || /\b(?:PROC|PROCEDURE|FUNCTION)\s+[\w.[\]]+\s*\(?\s*@\w/i.test(src) || /\bAS\s+BEGIN\b/i.test(src) || /\bSET\s+NOCOUNT\s+ON\b/i.test(src)) return 'tsql';
  return 'pg';
}

const ROUTINE_WORDS = ['FUNCTION', 'PROCEDURE', 'PROC'];

/**
 * Every routine in a file: { name, line, endLine, kind, inputs, returns, steps, unread? }. `toks` are the file's
 * tokens (lexSql with the file's dialect).
 */
export function sqlRoutines(src, lineAt, dialect = sqlDialect(src)) {
  const toks = lexSql(src, 0, src.length, dialect);
  const out = [];
  const lineOf = (k) => lineAt(toks[Math.min(k, toks.length - 1)].s);
  for (let k = 0; k < toks.length; k++) {
    const start = k;
    let j = k;
    if (isW(toks[j], 'CREATE')) {
      j++;
      if (isW(toks[j], 'OR') && isW(toks[j + 1], 'REPLACE', 'ALTER')) j += 2;
      if (isW(toks[j], 'DEFINER') && isP(toks[j + 1], '=')) { j += 2; while (toks[j] && !isW(toks[j], ...ROUTINE_WORDS, 'AGGREGATE', 'SQL', 'TRIGGER', 'EVENT', 'VIEW') && j < k + 8) j++; }
      if (isW(toks[j], 'SQL') && isW(toks[j + 1], 'SECURITY')) j += 3;
      if (isW(toks[j], 'AGGREGATE')) j++;
      if (!isW(toks[j], ...ROUTINE_WORDS)) continue;
    } else if (isW(toks[k], 'ALTER') && dialect === 'tsql' && isW(toks[k + 1], ...ROUTINE_WORDS)) j = k + 1;
    else continue;
    const kindWord = toks[j].up;
    j++;
    // The name: a.b.c, quoted parts allowed.
    if (toks[j]?.t !== 'word') continue;
    let nameEnd = j;
    while (isP(toks[nameEnd + 1], '.') && toks[nameEnd + 2]?.t === 'word') nameEnd += 2;
    const name = unq(toks[nameEnd].v);
    j = nameEnd + 1;
    if (dialect === 'tsql' && isP(toks[j], ';') ) j++;
    // Parameters: ( … ), or T-SQL's bare list up to AS / WITH / FOR.
    let params = [];
    if (isP(toks[j], '(')) {
      const close = matchParen(toks, j);
      if (close < 0) continue;
      params = splitComma(toks.slice(j + 1, close));
      j = close + 1;
    } else if (dialect === 'tsql') {
      const p0 = j;
      while (toks[j] && !isW(toks[j], 'AS', 'WITH', 'FOR', 'RETURNS')) j++;
      params = splitComma(toks.slice(p0, j));
    } else continue;
    const routine = /^PROC/.test(kindWord) ? 'procedure' : 'function';
    const inputs = [], outs = [];
    for (const p of params) {
      let q = 0, mode = 'IN';
      if (isW(p[0], 'IN', 'OUT', 'INOUT', 'VARIADIC') && p.length > 1) { mode = p[0].up; q = 1; }
      if (isW(p[q], 'IN') && mode === 'IN' && isW(p[q + 1], 'OUT')) { mode = 'INOUT'; q += 2; }
      const nm = p[q];
      const rest = p.slice(q + 1);
      const tsqlOut = dialect === 'tsql' && rest.some((x) => isW(x, 'OUTPUT', 'OUT'));
      if (tsqlOut) mode = 'INOUT';
      const defAt = rest.findIndex((x) => isW(x, 'DEFAULT') || isP(x, '='));
      const typeTs = rest.slice(isW(rest[0], 'AS') ? 1 : 0, defAt < 0 ? rest.length : defAt).filter((x) => !isW(x, 'OUTPUT', 'OUT', 'READONLY'));
      const typeText = typeTs.length ? src.slice(typeTs[0].s, typeTs.at(-1).e) : '';
      // A PostgreSQL parameter can be a type alone (no name): it is input $1, $2, …
      const unnamed = dialect === 'pg' && (!rest.length || defAt === 0 || isP(rest[0], '(') || isP(rest[0], '[') || isP(rest[0], '.'));
      const pname = unnamed ? `$${inputs.length + outs.length + 1}` : unq(nm?.v ?? '');
      if (!pname) continue;
      const param = { name: unnamed ? `input ${inputs.length + 1}` : pname.replace(/^@/, '').replace(/^(?:p|in|out|inout)_(?=\w)/i, '').replace(/^_(?=\w)/, ''), type: unnamed ? src.slice(p[q].s, (defAt < 0 ? p.at(-1) : rest[defAt - 1] ?? p[q]).e) : typeText, ...(defAt >= 0 ? { default: src.slice(rest[defAt + 1]?.s ?? 0, p.at(-1).e).trim() } : {}) };
      if (mode === 'OUT') outs.push(param); else inputs.push(param);
      if (mode === 'INOUT') outs.push(param);
    }
    // Returns, options, and the body.
    let returns = null, setof = false, trigger = false, bodyToks = null, bodyDialect = dialect, end = j, language = null, unreadWhy = null;
    if (isW(toks[j], 'RETURNS')) {
      j++;
      if (isW(toks[j], 'SETOF')) { setof = true; j++; returns = 'rows'; while (toks[j] && (isW(toks[j]) || isP(toks[j], '.')) && !isW(toks[j], 'AS', 'LANGUAGE', 'IMMUTABLE', 'STABLE', 'VOLATILE', 'STRICT', 'SECURITY', 'BEGIN', 'RETURN', 'WITH')) j++; }
      else if (isW(toks[j], 'TABLE') && isP(toks[j + 1], '(')) { setof = true; returns = 'rows'; j = matchParen(toks, j + 1) + 1; }
      else if (dialect === 'tsql' && isW(toks[j]) && /^@/.test(toks[j].v) && isW(toks[j + 1], 'TABLE')) { returns = 'rows'; j = matchParen(toks, j + 2) + 1; }
      else if (isW(toks[j])) {
        const t0 = j;
        while (isP(toks[j + 1], '.') && isW(toks[j + 2])) j += 2;
        j++;
        while (isW(toks[j]) && /^(?:VARYING|PRECISION|WITH|WITHOUT|TIME|ZONE|UNSIGNED|SIGNED)$/.test(toks[j].up) && !(toks[j].up === 'WITH' && dialect === 'tsql')) j++;
        if (isP(toks[j], '(')) j = matchParen(toks, j) + 1;
        if (isP(toks[j], '[') && isP(toks[j + 1], ']')) j += 2;
        const rt = src.slice(toks[t0].s, toks[j - 1].e);
        trigger = /^trigger$/i.test(rt);
        returns = trigger ? null : (/^TABLE$/i.test(rt) ? 'rows' : sqlTypeWords(rt) ?? sqlWords(rt));
        if (/^void$/i.test(rt)) returns = null;
      }
    }
    if (dialect === 'pg') {
      // Options in any order, up to the statement's `;`: LANGUAGE x, AS $$body$$, IMMUTABLE, SET x = y, …
      for (; j < toks.length && !isP(toks[j], ';'); j++) {
        if (isW(toks[j], 'LANGUAGE') && toks[j + 1]) language = unq(toks[j + 1].v).toLowerCase();
        if (isW(toks[j], 'AS') && toks[j + 1]?.t === 'str') { bodyToks = toks[j + 1]; j++; if (isP(toks[j + 1], ',')) { bodyToks = null; unreadWhy = 'compiled code'; } }
        if (isW(toks[j], 'BEGIN') && isW(toks[j + 1], 'ATOMIC')) { unreadWhy = 'a SQL-standard body'; break; }
        if (isW(toks[j], 'CREATE')) { j--; break; }
      }
      end = Math.min(j, toks.length - 1);
    } else {
      // MySQL characteristics / T-SQL WITH options, then the body.
      for (;;) {
        if (isW(toks[j], 'DETERMINISTIC', 'CONTAINS', 'NO', 'READS', 'MODIFIES', 'SQL', 'DATA', 'INVOKER', 'DEFINER', 'SECURITY')) { j++; continue; }
        if (isW(toks[j], 'NOT') && isW(toks[j + 1], 'DETERMINISTIC')) { j += 2; continue; }
        if (isW(toks[j], 'LANGUAGE')) { j += 2; continue; }
        if (isW(toks[j], 'COMMENT') && toks[j + 1]?.t === 'str') { j += 2; continue; }
        if (isW(toks[j], 'CHARSET', 'CHARACTER', 'COLLATE')) { j += isW(toks[j], 'CHARACTER') ? 3 : 2; continue; }
        if (dialect === 'tsql' && isW(toks[j], 'WITH')) { j++; while (toks[j] && !isW(toks[j], 'AS')) j++; continue; }
        break;
      }
      if (dialect === 'tsql') { if (!isW(toks[j], 'AS')) continue; j++; }
    }
    // The steps.
    let steps = [], bodyEnd = end;
    const ctx = { src, lineAt, dialect: bodyDialect, routine, setof, trigger, depth: 0 };
    try {
      if (dialect === 'pg') {
        if (bodyToks && language !== 'c' && language !== 'internal') {
          const inner = bodyToks.dollar ? lexSql(src, bodyToks.s + bodyToks.dollar.length, bodyToks.e - bodyToks.dollar.length, 'pg') : null;
          if (!inner) unreadWhy = 'a body written as a quoted string';
          else if (language === 'sql') { ctx.dialect = 'pg'; ctx.sqlFunction = true; steps = sqlFunctionSteps(inner, ctx); }
          else steps = bodySteps(inner, ctx);
        }
        bodyEnd = end;
      } else if (dialect === 'mysql') {
        // The body is one statement (often BEGIN … END).
        const delim = delimiterAt(src, toks[start].s);
        let stop = toks.length;
        if (delim !== ';') for (let g = j; g < toks.length; g++) if (toks[g].t === 'p' && src.startsWith(delim, toks[g].s)) { stop = g; break; }
        const sub = toks.slice(j, stop);
        const parsed = oneStatement(sub, ctx);
        steps = parsed.steps;
        bodyEnd = j + parsed.used - 1;
      } else {
        // T-SQL: the body runs to the next GO (or the end of the file).
        let g = j;
        while (g < toks.length && !(isW(toks[g], 'GO') && /(^|\n)[ \t]*$/.test(src.slice(Math.max(0, toks[g].s - 200), toks[g].s)))) g++;
        const sub = toks.slice(j, g);
        // A function's RETURN (SELECT …) / RETURN SELECT is a query: shown as code.
        steps = bodySteps(sub, ctx);
        bodyEnd = g - 1;
      }
    } catch (e) {
      if (!(e instanceof Unmatched)) throw e;
      unreadWhy = `its structure could not be matched: ${e.message}`;
      steps = [];
    }
    if (dialect === 'tsql' || dialect === 'mysql') end = bodyEnd;
    const endLine = lineOf(Math.max(end, start));
    out.push({ name, line: lineOf(start), endLine, kind: routine, inputs, outs, returns, setof, trigger, steps, ...(unreadWhy ? { unreadWhy } : {}), headerEnd: lineOf(Math.max(start, j - 1)) });
    k = Math.max(k, Math.min(end, toks.length - 1));
  }
  return out;
}

/** One MySQL routine body statement: { steps, used } (used = tokens consumed). */
function oneStatement(sub, ctx) {
  return bodySteps(sub, ctx, { one: true });
}

/** The MySQL client delimiter in effect at offset `at` (DELIMITER $$ … ), or ';'. */
function delimiterAt(src, at) {
  let d = ';';
  for (const m of src.slice(0, at).matchAll(/^[ \t]*DELIMITER[ \t]+(\S+)/gim)) d = m[1];
  return d;
}

/** A LANGUAGE sql function: its statements; the last SELECT is what it gives back (shown as code). */
function sqlFunctionSteps(toks, ctx) {
  const steps = bodySteps(toks, ctx);
  return steps;
}

export { plainName, cap as sqlCap };
