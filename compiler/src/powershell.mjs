// PowerShell in Thunder. A linear tokenizer (strings with $var and $(…), here-strings, <# #> comments, types and
// attributes, -operators and -Parameters) and a statement reader for functions with param() blocks, if/elseif/else,
// foreach, ForEach-Object, for, while, do/until, switch (cases), try/catch/finally, trap, throw, return; cmdlets read
// by Verb-Noun ("Get-AzResourceGroup" -> "Gets the Azure resource groups"), well-known native tools through the
// shared phrasebook, comparison operators in words, classes (properties with defaults, methods) and enums as Things
// and Choices, comment-based help (.SYNOPSIS) as the author's note, and Pode routes as actions. Deterministic,
// browser-safe; what it cannot say keeps its code.
import { sayCommand, gerund, words, cap, listWords } from './commands.mjs';

function lineFinder(src) {
  const starts = [0];
  for (let i = src.indexOf('\n'); i >= 0; i = src.indexOf('\n', i + 1)) starts.push(i + 1);
  return (idx) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo + 1; };
}

// ── Tokens ────────────────────────────────────────────────────────────────────────────────────────────

const OPENERS = { '{': '}', '(': ')', '$(': ')', '@(': ')', '@{': '}', '[': ']' };
const WORD_OPS = /^-[ci]?(?:eq|ne|gt|ge|lt|le|like|notlike|match|notmatch|contains|notcontains|in|notin|replace|split|join|and|or|xor|not|is|isnot|as|band|bor|bxor|bnot|f|shl|shr)$/i;
const PUNCT = ['::', '++', '--', '+=', '-=', '*=', '/=', '%=', '2>&1', '*>', '2>>', '2>', '>>', '..', '&&', '||', '{', '}', '(', ')', ';', ',', '|', '=', '.', '+', '-', '*', '/', '%', '!', '&', '>', '<', ']', '?'];

function skipString(s, i) {
  const q = s[i];
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (q === "'") { if (c === "'") { if (s[j + 1] === "'") { j++; continue; } return j + 1; } continue; }
    if (c === '`') { j++; continue; }
    if (c === '"') { if (s[j + 1] === '"') { j++; continue; } return j + 1; }
    if (c === '$' && s[j + 1] === '(') { j = skipParen(s, j + 1) - 1; continue; }
  }
  return s.length;
}
function skipParen(s, i) {
  let d = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === "'" || c === '"') { j = skipString(s, j) - 1; continue; }
    if (c === '(') d++;
    else if (c === ')' && --d === 0) return j + 1;
  }
  return s.length;
}

function tokenize(src) {
  const toks = [];
  let i = 0;
  const n = src.length;
  const push = (t, text, at, end, extra) => toks.push({ t, text, at, end, ...extra });
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '﻿') { i++; continue; }
    if (c === '`' && (src[i + 1] === '\n' || src[i + 1] === '\r')) { i += src[i + 1] === '\r' ? 3 : 2; continue; }
    if (c === '\n') { push('nl', '\n', i, i + 1); i++; continue; }
    if (c === '<' && src[i + 1] === '#') { const e = src.indexOf('#>', i + 2); const end = e < 0 ? n : e + 2; push('comment', src.slice(i, end), i, end, { block: true }); i = end; continue; }
    if (c === '#') { let e = src.indexOf('\n', i); if (e < 0) e = n; push('comment', src.slice(i, e), i, e); i = e; continue; }
    if (c === '@' && (src[i + 1] === '"' || src[i + 1] === "'") && /^\s*\r?\n/.test(src.slice(i + 2, i + 40))) {
      const q = src[i + 1];
      const re = new RegExp(`\\n[ \\t]*${q}@`, 'g');
      re.lastIndex = i + 2;
      const m = re.exec(src);
      const end = m ? m.index + m[0].length : n;
      push('str', src.slice(i, end), i, end, { quote: q, body: src.slice(src.indexOf('\n', i) + 1, m ? m.index : n), here: true });
      i = end;
      continue;
    }
    if (c === "'" || c === '"') { const e = skipString(src, i); push('str', src.slice(i, e), i, e, { quote: c, body: src.slice(i + 1, e - 1) }); i = e; continue; }
    if (c === '$' && src[i + 1] === '(') { push('punc', '$(', i, i + 2); i += 2; continue; }
    if (c === '@' && (src[i + 1] === '(' || src[i + 1] === '{')) { push('punc', `@${src[i + 1]}`, i, i + 2); i += 2; continue; }
    if (c === '$') {
      if (src[i + 1] === '{') { const e = src.indexOf('}', i); const end = e < 0 ? n : e + 1; push('var', src.slice(i, end), i, end, { name: src.slice(i + 2, end - 1) }); i = end; continue; }
      const m = src.slice(i + 1, i + 200).match(/^(?:[A-Za-z_][\w]*:)?[A-Za-z_\d][\w]*|^[_?^$]/);
      if (m) { push('var', `$${m[0]}`, i, i + 1 + m[0].length, { name: m[0] }); i += 1 + m[0].length; continue; }
    }
    if (c === '@' && /[A-Za-z_]/.test(src[i + 1] || '')) { const m = src.slice(i + 1).match(/^\w+/); push('var', `@${m[0]}`, i, i + 1 + m[0].length, { name: m[0], splat: true }); i += 1 + m[0].length; continue; }
    if (c === '[') {
      const prev = toks[toks.length - 1];
      const glued = prev && prev.end === i && (prev.t === 'var' || prev.text === ')' || prev.text === ']' || prev.t === 'str' || prev.t === 'word');
      if (!glued) {
        let d = 0, j = i;
        for (; j < n; j++) {
          const ch = src[j];
          if (ch === "'" || ch === '"') { j = skipString(src, j) - 1; continue; }
          if (ch === '[' || ch === '(') d++;
          else if ((ch === ']' || ch === ')') && --d === 0 && ch === ']') break;
          if (ch === '\n' && d <= 1 && !/\(/.test(src.slice(i, j))) break;
        }
        const text = src.slice(i, j + 1);
        if (src[j] === ']' && /^\[\s*[A-Za-z_][\w.`]*(?:\[[^\]]*\])?\s*(?:\([\s\S]*\))?\s*\]$/.test(text)) {
          push(/\(/.test(text) ? 'attr' : 'type', text, i, j + 1, { name: /\(/.test(text) ? text.match(/^\[\s*([\w.`]+)/)[1] : text.slice(1, -1).trim() });
          i = j + 1;
          continue;
        }
      }
      push('punc', '[', i, i + 1);
      i++;
      continue;
    }
    if (c === '-' && /[A-Za-z]/.test(src[i + 1] || '')) {
      const m = src.slice(i).match(/^-[A-Za-z][\w-]*:?/);
      const text = m[0];
      push(WORD_OPS.test(text) ? 'op' : 'param', text, i, i + text.length);
      i += text.length;
      continue;
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] || ''))) {
      const m = src.slice(i).match(/^(?:0x[\da-fA-F]+|\d*\.?\d+(?:[eE][+-]?\d+)?)(?:KB|MB|GB|TB|PB|[lLdD])?(?![\w.-])/i);
      if (m) { push('num', m[0], i, i + m[0].length); i += m[0].length; continue; }
    }
    const prevT = toks[toks.length - 1];
    if (prevT && prevT.end === i && prevT.t === 'punc' && (prevT.text === '.' || prevT.text === '::') && /[A-Za-z_]/.test(c)) {
      const m = src.slice(i).match(/^[A-Za-z_]\w*/);
      push('word', m[0], i, i + m[0].length);
      i += m[0].length;
      continue;
    }
    const path = (c === '*' && /\s/.test(src[i - 1] || ' ') && /[\w.*\\\/]/.test(src[i + 1] || '')) || (c === '.' && /[\\/]/.test(src[i + 1] || '')) || src.startsWith('..\\', i) || src.startsWith('../', i) || (c === '-' && src[i + 1] === '-' && /[A-Za-z]/.test(src[i + 2] || ''));
    const p = path ? null : PUNCT.find((x) => src.startsWith(x, i));
    if (p) { push('punc', p, i, i + p.length); i += p.length; continue; }
    // A bareword: a command name, a path, a native argument.
    const dashed = c === '-';
    let j = i;
    while (j < n && !/[\s{}();,|"'`]/.test(src[j])) {
      if (src[j] === '=' && !dashed) break;
      if (src[j] === '[' && j > i && !/[\\/:*]/.test(src.slice(i, j))) break;
      if (src[j] === ']') break;
      j++;
    }
    if (j === i) j = i + 1;
    push('word', src.slice(i, j), i, j);
    i = j;
  }
  // Bracket matching, so every statement and block can be cut out in one pass.
  toks.forEach((t, k) => { t.i = k; Object.defineProperty(t, 'all', { value: toks, enumerable: false }); });
  const stack = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t === 'punc' && OPENERS[t.text]) { stack.push(k); continue; }
    if (t.t === 'punc' && (t.text === '}' || t.text === ')' || t.text === ']')) {
      for (let s = stack.length - 1; s >= 0; s--) { if (OPENERS[toks[stack[s]].text] === t.text) { toks[stack[s]].match = k; stack.length = s; break; } }
    }
  }
  return toks;
}

// ── Values and conditions in words ───────────────────────────────────────────────────────────────────

const SPECIAL_VARS = { _: 'it', psitem: 'it', true: 'yes', false: 'no', null: 'nothing', psscriptroot: "this script's folder", pscommandpath: 'this script', args: 'the inputs', lastexitcode: "the last program's exit code", pwd: 'the current folder', home: 'the home folder', error: 'the errors so far', this: 'it' };
function varWords(name) {
  const n = String(name);
  const env = n.match(/^env:(.+)$/i);
  if (env) return `the ${words(env[1])} setting`;
  const scoped = n.replace(/^(?:script|global|local|private|using):/i, '');
  return SPECIAL_VARS[scoped.toLowerCase()] ?? words(scoped);
}
/** Text of a string with its variables as {words}: "Deploying {name} to {env}". */
function stringText(tok) {
  if (tok.quote === "'") return tok.body.replace(/''/g, "'");
  let out = '';
  const b = tok.body;
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c === '`') { const e = b[i + 1]; out += e === 'n' || e === 't' || e === 'r' ? ' ' : e ?? ''; i++; continue; }
    if (c === '$' && b[i + 1] === '(') { const e = skipParen(b, i + 1); const inner = b.slice(i + 2, e - 1); const said = sayValue(tokenize(inner).filter((t) => t.t !== 'nl' && t.t !== 'comment')); out += `{${said ?? inner.trim()}}`; i = e - 1; continue; }
    if (c === '$') {
      const m = b.slice(i + 1).match(/^\{([^}]+)\}|^(?:[A-Za-z_]\w*:)?[A-Za-z_]\w*/);
      if (m) {
        let name = m[1] ?? m[0], k = i + 1 + m[0].length;
        out += `{${varWords(name)}}`;
        i = k - 1;
        continue;
      }
    }
    out += c;
  }
  return out.replace(/\s+/g, ' ').trim();
}
const quoteText = (t) => `"${t.length > 100 ? `${t.slice(0, 99)}…` : t}"`;

const at0 = (toks) => toks.filter((t) => t.t !== 'nl' && t.t !== 'comment');
/** Tokens grouped at the top level: each item is one token, or a bracket with everything inside it. */
function groups(list) {
  const out = [];
  let cur = null, depth = 0;
  for (const t of list) {
    if (depth === 0) { cur = [t]; out.push(cur); } else cur.push(t);
    if (t.t === 'punc' && OPENERS[t.text]) depth++;
    else if (t.t === 'punc' && (t.text === ')' || t.text === '}' || t.text === ']')) depth = Math.max(0, depth - 1);
  }
  return out;
}
/** A member chain `$x.Name.Length` or `$x.Items.Count` in words. */
function chainWords(base, members) {
  const ms = members.filter(Boolean);
  if (!ms.length) return base;
  const last = ms[ms.length - 1];
  const owner = ms.length > 1 ? possessive(base, ms[ms.length - 2]) : base;
  if (/^count$/i.test(last) || (/^length$/i.test(last) && owner !== 'it')) return `how many ${owner}`;
  return possessive(owner, last);
}
const owns = (x) => (/s$/.test(x) ? `${x}'` : `${x}'s`);
const possessive = (owner, member) => (owner === 'it' ? words(member) : `${owns(/^the /.test(owner) ? owner : `the ${owner}`)} ${words(member)}`);

/** A value (a group of tokens) in words, or null when it is something Thunder will not guess at. */
function sayValue(toks, plain = false) {
  toks = at0(toks);
  if (!toks.length) return null;
  while (toks[0].t === 'type' && toks.length > 1 && toks[1].text !== '::') toks = toks.slice(1);
  const g = groups(toks);
  const first = g[0];
  if (g.length === 1 && first.length === 1) {
    const t = first[0];
    if (t.t === 'str') return quoteText(stringText(t));
    if (t.t === 'num') return t.text;
    if (t.t === 'var') return varWords(t.name);
    if (t.t === 'word') return /^[\w.:\\/*?-]+$/.test(t.text) ? quoteText(t.text) : null;
  }
  if (g.length === 1 && first.length > 1) {
    const open = first[0].text;
    const inner = first.slice(1, -1);
    if (open === '@(') return inner.length ? `the list ${listWords(splitCommas(inner).map((x) => sayValue(x) ?? 'a value').slice(0, 6))}` : 'an empty list';
    if (open === '{') return 'a set of steps to run later (a script block)';
    if (open === '@{') { const keys = at0(inner).filter((t, k, a) => (t.t === 'word' || t.t === 'str') && a[k + 1]?.text === '=').map((t) => words(t.t === 'str' ? t.body : t.text)); return keys.length ? `a table of ${listWords(keys.slice(0, 6))}` : 'an empty table'; }
    if ((open === '(' || open === '$(') && first[0].match != null) {
      const all = first[0].all;
      const st = splitStatements(all, first[0].i + 1, first[0].match);
      if (st.length === 1) { const s = pipelineWords(all.slice(st[0][0], st[0][1])); if (s?.command) return `the result of ${gerund(s.says)}`; if (s) return s.says; }
      return null;
    }
  }
  // (Get-Item $p).FullName: a fact about what the command gives back.
  if (g.length === 3 && first[0].text === '(' && g[1][0].text === '.' && g[2][0].t === 'word') {
    const inner = sayValue(first, true);
    if (inner) return `the ${words(g[2][0].text)} of ${inner}`;
  }
  // $x.Member, $x.Member.Count, $x.Method(...), [Type]::Member
  if (first.length === 1 && (first[0].t === 'var' || first[0].t === 'type')) {
    const members = [];
    let k = 1, call = null;
    let index = null;
    while (k < g.length) {
      // $matches['ver'], $args[0]: an item of the list or table.
      if (g[k][0].text === '[' && g[k].length > 2) { const key = at0(g[k].slice(1, -1)); index = key.length === 1 && key[0].t === 'str' ? key[0].body : ''; k++; continue; }
      if (g[k][0].text !== '.' && g[k][0].text !== '::') break;
      const m = g[k + 1]?.[0];
      if (!m || m.t !== 'word') break;
      if (g[k + 2]?.[0].text === '(') { call = m.text; k += 3; break; }
      if (index != null) { members.push(index || 'item'); index = null; }
      members.push(m.text);
      k += 2;
    }
    const owner = first[0].t === 'var' ? varWords(first[0].name) : `the ${first[0].name.split('.').pop()}`;
    if (index != null && k === g.length && !call) return index ? possessive(chainWords(owner, members), index) : `an item of ${chainWords(owner, members)}`;
    if (k === g.length && first[0].t === 'type' && !call && members.length) return `the ${words(members[members.length - 1])} (${first[0].name.split('.').pop()})`;
    if (k === g.length && first[0].t === 'var' && !call) return chainWords(varWords(first[0].name), members);
    if (k === g.length && call) {
      if (/^new$/i.test(call) && first[0].t === 'type') return `a new ${first[0].name.replace(/\[.*$/, '').split('.').pop()}`;
      return `the result of ${words(call)}${first[0].t === 'var' ? ` on ${chainWords(varWords(first[0].name), members)}` : ''}`;
    }
  }
  // Arithmetic and text joined with + - * /.
  const AR = { '+': 'plus', '-': 'minus', '*': 'times', '/': 'divided by', '%': 'remainder after dividing by' };
  const opAt = g.findIndex((x) => x.length === 1 && AR[x[0].text]);
  if (opAt > 0) { const a = sayValue(g.slice(0, opAt).flat()), b = sayValue(g.slice(opAt + 1).flat()); if (a && b) return `${a} ${AR[g[opAt][0].text]} ${b}`; }
  if (g.some((x) => x.length === 1 && x[0].t === 'op' && /^-[ci]?f$/i.test(x[0].text)) && first[0].t === 'str') {
    const args = splitCommas(g.slice(g.findIndex((x) => /^-[ci]?f$/i.test(x[0].text)) + 1).flat()).map((x) => sayValue(x) ?? '…');
    return quoteText(stringText(first[0]).replace(/\{(\d+)(?::[^}]*)?\}/g, (m, d) => `{${String(args[d] ?? '…').replace(/^"|"$/g, '')}}`));
  }
  // Text operators: a -join ', ', a -split ',', a -replace 'x', 'y'.
  const tOp = g.findLastIndex((x, k) => k > 0 && x.length === 1 && x[0].t === 'op' && /^(join|replace|split)$/.test(opName(x[0])));
  if (tOp > 0) {
    const a = sayValue(g.slice(0, tOp).flat(), plain);
    const rest = splitCommas(g.slice(tOp + 1).flat()).map((x) => sayValue(x, true) ?? '…');
    const o = opName(g[tOp][0]);
    if (a) return o === 'join' ? `${a} joined with ${rest[0] ?? 'nothing'}` : o === 'split' ? `${a} split at ${rest[0] ?? 'spaces'}` : `${a} with ${rest[0] ?? '…'} replaced by ${rest[1] ?? 'nothing'}`;
  }
  // Several values separated by commas are a list.
  if (g.some((x) => x.length === 1 && x[0].text === ',')) { const items = splitCommas(toks).map((x) => sayValue(x, true)); if (items.every(Boolean)) return `the list ${listWords(items.slice(0, 6))}${items.length > 6 ? ', …' : ''}`; }
  if (!plain && g.some((x) => x.length === 1 && x[0].t === 'op')) { const c = condWords(toks, false); if (c) return `whether ${c}`; }
  const cmd = toks[0].t === 'word' || toks[0].text === '&' ? pipelineWords(toks) : null;
  if (cmd?.command) return `the result of ${gerund(cmd.says)}`;
  return null;
}
function splitCommas(toks) {
  const out = [[]];
  for (const g of groups(toks)) { if (g.length === 1 && g[0].text === ',') out.push([]); else out[out.length - 1].push(...g); }
  return out.filter((x) => at0(x).length);
}

const CMP = { eq: ['is', 'is not'], ne: ['is not', 'is'], gt: ['is more than', 'is at most'], ge: ['is at least', 'is less than'], lt: ['is less than', 'is at least'], le: ['is at most', 'is more than'], like: ['matches', 'does not match'], notlike: ['does not match', 'matches'], match: ['matches the pattern', 'does not match the pattern'], notmatch: ['does not match the pattern', 'matches the pattern'], contains: ['includes', 'does not include'], notcontains: ['does not include', 'includes'], in: ['is one of', 'is not one of'], notin: ['is not one of', 'is one of'], is: ['is a', 'is not a'], isnot: ['is not a', 'is a'], as: ['can be turned into a', 'cannot be turned into a'] };
const BASE_OPS = new Set(['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'like', 'notlike', 'match', 'notmatch', 'contains', 'notcontains', 'in', 'notin', 'is', 'isnot', 'as', 'and', 'or', 'xor', 'not', 'replace', 'split', 'join', 'f', 'band', 'bor', 'bxor', 'bnot', 'shl', 'shr']);
const opName = (t) => { const x = t.text.toLowerCase().slice(1); return BASE_OPS.has(x) ? x : x.replace(/^[ci]/, ''); };

/** A condition in words: `$Count -gt 0 -and -not $Force` -> "count is more than 0 and force is not set". */
function condWords(toks, neg) {
  const g = groups(at0(toks));
  if (!g.length) return null;
  const split = (names) => { const parts = [[]]; for (const x of g) { if (x.length === 1 && x[0].t === 'op' && names.includes(opName(x[0]))) parts.push([]); else parts[parts.length - 1].push(x); } return parts; };
  for (const [names, join, flip] of [[['or', 'xor'], ' or ', ' and '], [['and'], ' and ', ' or ']]) {
    const parts = split(names);
    if (parts.length > 1) { const said = parts.map((p) => condWords(p.flat(), neg)); return said.some((x) => !x) ? null : said.join(neg ? flip : join); }
  }
  if ((g[0].length === 1 && ((g[0][0].t === 'op' && opName(g[0][0]) === 'not') || g[0][0].text === '!'))) return condWords(g.slice(1).flat(), !neg);
  if (g.length === 1 && g[0].length > 1 && g[0][0].text === '(') {
    const inner = g[0].slice(1, -1);
    const ig = groups(at0(inner));
    if (ig[0]?.length === 1 && ig[0][0].t === 'word' && /-/.test(ig[0][0].text)) return commandCond(at0(inner), neg);
    return condWords(inner, neg);
  }
  if (g[0].length === 1 && g[0][0].t === 'word' && /^[A-Za-z]+-[A-Za-z]/.test(g[0][0].text)) return commandCond(at0(toks), neg);
  const at = g.findIndex((x) => x.length === 1 && x[0].t === 'op' && CMP[opName(x[0])]);
  if (at > 0) {
    const op = opName(g[at][0]);
    const left = g.slice(0, at).flat(), right = g.slice(at + 1).flat();
    const isNull = (x) => x.length === 1 && x[0].t === 'var' && /^null$/i.test(x[0].name);
    if (isNull(left) || isNull(right)) {
      const other = sayValue(isNull(left) ? right : left);
      if (!other || !['eq', 'ne'].includes(op)) return null;
      return `${other} is ${(op === 'eq') !== neg ? 'empty' : 'set'}`;
    }
    const a = sayValue(left), b = right.length === 1 && right[0].t === 'type' ? right[0].name.split('.').pop() : sayValue(right);
    if (!a || !b) return null;
    if (op === 'contains' || op === 'notcontains') return `${a} ${CMP[op][neg ? 1 : 0]} ${b}`;
    return `${a} ${CMP[op][neg ? 1 : 0]} ${b}`;
  }
  const v = sayValue(at0(toks), true);
  if (!v) return null;
  if (v === 'yes' || v === 'no') return (v === 'yes') !== neg ? 'always' : 'never';
  return `${v} is ${neg ? 'not ' : ''}set`;
}
/** A command used as a question: Test-Path -> "the file exists", anything else -> "it finds something". */
function commandCond(toks, neg) {
  const name = toks[0].text;
  const args = argsOf(toks.slice(1));
  if (/^test-path$/i.test(name)) { const p = args.named.path ?? args.named.literalpath ?? args.pos[0]; return `${p ? sayValue(p) : 'the path'} ${neg ? 'does not exist' : 'exists'}`; }
  if (/^get-command$/i.test(name)) { const p = args.named.name ?? args.pos[0]; return `${p ? sayValue(p) : 'the command'} is ${neg ? 'not ' : ''}installed`; }
  const s = commandWords(toks);
  if (s && /^test-/i.test(name)) return `${gerund(s)} says ${neg ? 'no' : 'yes'}`;
  return s ? `${gerund(s)} ${neg ? 'finds nothing' : 'finds something'}` : null;
}

/** A condition as an expression the Thunder decision reader understands (`score >= 90 && member`), or null. */
export function condJs(toks) {
  const out = [];
  for (const t of at0(toks)) {
    if (t.t === 'op') {
      const o = opName(t);
      const m = { eq: '==', ne: '!=', gt: '>', ge: '>=', lt: '<', le: '<=', and: '&&', or: '||', not: '!' }[o];
      if (!m) return null;
      out.push(m);
    } else if (t.t === 'var') {
      if (/^true$/i.test(t.name)) out.push('true'); else if (/^false$/i.test(t.name)) out.push('false'); else if (/^null$/i.test(t.name)) return null;
      else out.push(t.name.replace(/^(?:script|global|local):/i, '').replace(/^this$/i, 'this'));
    } else if (t.t === 'str') { if (t.quote === '"' && /\$/.test(t.body)) return null; out.push(JSON.stringify(t.body.replace(/''/g, "'"))); }
    else if (t.t === 'num') { if (!/^-?\d+(\.\d+)?$/.test(t.text)) return null; out.push(t.text); }
    else if (t.t === 'punc' && ['(', ')', '.', '!'].includes(t.text)) out.push(t.text);
    else if (t.t === 'word' && out[out.length - 1] === '.') out.push(t.text);
    else return null;
  }
  return out.join(' ').replace(/ \. /g, '.');
}

// ── Commands ──────────────────────────────────────────────────────────────────────────────────────────

/** A command's arguments: { named: { name: tokens }, pos: [tokens], switches: Set, block: tokens|null }. */
function argsOf(toks) {
  const named = {}, pos = [], switches = new Set();
  const g = groups(at0(toks));
  for (let k = 0; k < g.length; k++) {
    const x = g[k];
    if (x.length === 1 && x[0].t === 'param') {
      const name = x[0].text.slice(1).replace(/:$/, '').toLowerCase();
      const next = g[k + 1];
      if (x[0].text.endsWith(':') && next) { named[name] = next; k++; continue; }
      if (next && !(next.length === 1 && (next[0].t === 'param' || next[0].text === ','))) {
        if (SWITCH.has(name)) { switches.add(name); continue; }
        // Values joined by commas belong together: -Name a, b.
        let val = [...next];
        k++;
        while (g[k + 1]?.[0].text === ',' && g[k + 2]) { val = [...val, ...g[k + 1], ...g[k + 2]]; k += 2; }
        named[name] = val;
      } else switches.add(name);
      continue;
    }
    pos.push(x);
  }
  return { named, pos, switches };
}
const SWITCH = new Set(['force', 'recurse', 'whatif', 'confirm', 'passthru', 'asjob', 'noprofile', 'nonewline', 'raw', 'descending', 'unique', 'wait', 'erroraction', 'append', 'notypeinformation']);
SWITCH.delete('erroraction');

const VERB = { get: 'Gets', set: 'Sets', new: 'Makes', remove: 'Removes', add: 'Adds', clear: 'Clears', copy: 'Copies', move: 'Moves', rename: 'Renames', start: 'Starts', stop: 'Stops', restart: 'Restarts', invoke: 'Runs', test: 'Checks', write: 'Writes', read: 'Reads', import: 'Loads', export: 'Saves', install: 'Installs', uninstall: 'Uninstalls', update: 'Updates', wait: 'Waits for', join: 'Joins', split: 'Splits', enable: 'Turns on', disable: 'Turns off', register: 'Registers', unregister: 'Unregisters', publish: 'Publishes', send: 'Sends', receive: 'Receives', connect: 'Connects to', disconnect: 'Disconnects from', resolve: 'Works out', push: 'Saves and moves to', pop: 'Goes back to', enter: 'Enters', exit: 'Leaves', find: 'Finds', search: 'Searches for', show: 'Shows', hide: 'Hides', format: 'Formats', compare: 'Compares', confirm: 'Confirms', use: 'Uses', grant: 'Grants', revoke: 'Revokes', protect: 'Protects', unprotect: 'Unprotects', lock: 'Locks', unlock: 'Unlocks', mount: 'Mounts', dismount: 'Unmounts', deploy: 'Deploys', build: 'Builds', merge: 'Merges', initialize: 'Sets up', reset: 'Resets', edit: 'Edits', expand: 'Unpacks', compress: 'Packs', save: 'Saves', sync: 'Syncs', restore: 'Restores', backup: 'Backs up', submit: 'Submits', request: 'Requests', close: 'Closes', open: 'Opens', convert: 'Turns', convertto: 'Turns', convertfrom: 'Reads', measure: 'Measures', select: 'Picks', sort: 'Sorts', group: 'Groups', out: 'Sends', assert: 'Checks', approve: 'Approves', block: 'Blocks', unblock: 'Unblocks', suspend: 'Pauses', resume: 'Resumes', repair: 'Repairs', debug: 'Debugs', trace: 'Traces', limit: 'Limits', optimize: 'Optimizes', redo: 'Redoes', undo: 'Undoes', complete: 'Finishes', checkpoint: 'Checkpoints', watch: 'Watches', step: 'Steps', skip: 'Skips', switch: 'Switches', ping: 'Pings', mock: 'Fakes' };
const NOUN_PREFIX = [[/^AzureRm/, 'Azure '], [/^AzureAD/, 'Azure AD '], [/^Az(?=[A-Z])/, 'Azure '], [/^Mg(?=[A-Z])/, 'Microsoft Graph '], [/^AD(?=[A-Z])/, 'Active Directory '], [/^Exo(?=[A-Z])/, 'Exchange Online '], [/^Pnp(?=[A-Z])/i, 'SharePoint '], [/^Pode(?=[A-Z])/, 'Pode ']];
function nounWords(noun) {
  let pre = '', n = noun;
  for (const [re, w] of NOUN_PREFIX) if (re.test(n)) { pre = w; n = n.replace(re, ''); break; }
  const parts = n.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+/g) || [n];
  return pre + parts.map((p) => (/^[A-Z]{2,}$/.test(p) ? p : p.toLowerCase())).join(' ');
}
const pluralNoun = (n) => (/(?:s|sh|ch|x)$/.test(n) ? `${n}es` : /[^aeiou]y$/.test(n) ? `${n.slice(0, -1)}ies` : `${n}s`);

const ALIASES = { ls: 'Get-ChildItem', dir: 'Get-ChildItem', gci: 'Get-ChildItem', cd: 'Set-Location', sl: 'Set-Location', chdir: 'Set-Location', rm: 'Remove-Item', del: 'Remove-Item', ri: 'Remove-Item', rmdir: 'Remove-Item', erase: 'Remove-Item', cp: 'Copy-Item', copy: 'Copy-Item', cpi: 'Copy-Item', mv: 'Move-Item', move: 'Move-Item', mi: 'Move-Item', cat: 'Get-Content', gc: 'Get-Content', type: 'Get-Content', echo: 'Write-Output', write: 'Write-Output', '%': 'ForEach-Object', foreach: 'ForEach-Object', '?': 'Where-Object', where: 'Where-Object', select: 'Select-Object', sort: 'Sort-Object', iex: 'Invoke-Expression', irm: 'Invoke-RestMethod', iwr: 'Invoke-WebRequest', md: 'New-Item', mkdir: 'New-Item', pwd: 'Get-Location', cls: 'Clear-Host', ni: 'New-Item', sc: 'Set-Content', ac: 'Add-Content', ipmo: 'Import-Module', gm: 'Get-Member', measure: 'Measure-Object', group: 'Group-Object', tee: 'Tee-Object', sleep: 'Start-Sleep', start: 'Start-Process', saps: 'Start-Process', kill: 'Stop-Process', ps: 'Get-Process', gps: 'Get-Process', gsv: 'Get-Service', ft: 'Format-Table', fl: 'Format-List' };

let STOP_ON_ERROR = false;
let KNOWN_FNS = new Set();

/** One command (name and argument tokens) in words, or null. */
function commandWords(toks, ctx = {}) {
  toks = at0(toks);
  if (!toks.length) return null;
  let head = toks[0];
  let rest = toks.slice(1);
  if ((head.text === '&' || head.text === '.') && rest.length) {
    const target = rest[0];
    const said = target.t === 'word' ? null : sayValue([target]);
    if (target.t === 'word' && !/[\\/]/.test(target.text)) { head = target; rest = rest.slice(1); }
    else return `${head.text === '.' ? 'Loads the commands in' : 'Runs'} ${said ?? quoteText(target.text)}`;
  }
  if (head.t !== 'word') return null;
  const raw = head.text;
  const name = ALIASES[raw.toLowerCase()] && !(raw.toLowerCase() === 'mkdir' && false) ? ALIASES[raw.toLowerCase()] : raw;
  const a = argsOf(rest);
  const val = (k, ...more) => { for (const n of [k, ...more]) if (a.named[n]) return sayValue(a.named[n]); return null; };
  const p0 = a.pos[0] ? sayValue(a.pos[0]) : null;
  const target = val('path', 'literalpath', 'name', 'filepath', 'uri', 'id', 'identity', 'resourcegroupname') ?? p0;
  const lower = name.toLowerCase();
  if (/^(mkdir|md)$/i.test(raw)) return `Makes the folder ${target ?? '?'}`;
  switch (lower) {
    case 'write-host': case 'write-output': case 'write-information': {
      const msg = val('object', 'messagedata') ?? (a.pos.length ? a.pos.map((x) => sayValue(x) ?? '…').join(' ') : '');
      const text = msg.replace(/^"|"$/g, '');
      return lower === 'write-output' && !/^"/.test(msg) && msg ? `Writes out ${msg}` : `${lower === 'write-host' ? 'Shows' : 'Writes'} a message: "${text}"`;
    }
    case 'write-verbose': return `Writes a detailed message: "${(val('message') ?? p0 ?? '').replace(/^"|"$/g, '')}"`;
    case 'write-debug': return `Writes a debugging message: "${(val('message') ?? p0 ?? '').replace(/^"|"$/g, '')}"`;
    case 'write-warning': return `Warns: "${(val('message') ?? p0 ?? '').replace(/^"|"$/g, '')}"`;
    case 'write-progress': return `Shows progress: ${val('activity') ?? p0 ?? '…'}`;
    case 'new-item': {
      const type = String(val('itemtype', 'type') ?? '').replace(/"/g, '').toLowerCase();
      const what = /directory|folder/.test(type) || /^(mkdir|md)$/i.test(raw) ? 'a folder' : /file/.test(type) ? 'a file' : /symbolic/.test(type) ? 'a link' : 'an item';
      return `Makes ${what} ${target ?? '?'}${val('value') ? ` containing ${val('value')}` : ''}`;
    }
    case 'remove-item': return `Removes ${target ?? 'them'}${a.switches.has('recurse') ? ' and everything in it' : ''}`;
    case 'set-content': return `Writes ${val('value') ?? (a.pos[1] ? sayValue(a.pos[1]) : 'it')} to ${val('path', 'literalpath') ?? p0 ?? '?'}`;
    case 'add-content': return `Adds ${val('value') ?? (a.pos[1] ? sayValue(a.pos[1]) : 'it')} to the end of ${val('path', 'literalpath') ?? p0 ?? '?'}`;
    case 'get-content': return `Reads ${target ?? 'the file'}`;
    case 'out-file': return `Saves it to ${val('filepath', 'path') ?? p0 ?? '?'}`;
    case 'copy-item': return `Copies ${target ?? '?'} to ${val('destination') ?? (a.pos[1] ? sayValue(a.pos[1]) : '?')}${a.switches.has('recurse') ? ', with everything inside' : ''}`;
    case 'move-item': return `Moves ${target ?? '?'} to ${val('destination') ?? (a.pos[1] ? sayValue(a.pos[1]) : '?')}`;
    case 'rename-item': return `Renames ${target ?? '?'} to ${val('newname') ?? (a.pos[1] ? sayValue(a.pos[1]) : '?')}`;
    case 'get-childitem': return `Gets the files and folders in ${target ?? 'the current folder'}${val('filter', 'include') ? ` matching ${val('filter', 'include')}` : ''}${a.switches.has('recurse') ? ', looking inside every folder' : ''}`;
    case 'set-location': return `Goes into the folder ${target ?? '?'}`;
    case 'push-location': return `Goes into the folder ${target ?? '?'}, remembering where it was`;
    case 'pop-location': return 'Goes back to the folder it was in before';
    case 'get-location': return 'Gets the current folder';
    case 'test-path': return `Checks whether ${target ?? 'the path'} exists`;
    case 'join-path': return `Joins ${target ?? '?'} and ${val('childpath') ?? (a.pos[1] ? sayValue(a.pos[1]) : '?')} into one path`;
    case 'split-path': return `Takes part of the path ${target ?? '?'}`;
    case 'invoke-restmethod': case 'invoke-webrequest': {
      const method = String(val('method') ?? 'GET').replace(/"/g, '').toUpperCase();
      const url = val('uri') ?? p0 ?? '?';
      return `Sends a ${method} request to ${url}${a.named.body ? ` with ${sayValue(a.named.body) ?? 'a body'}` : ''}${val('outfile') ? ` and saves the answer to ${val('outfile')}` : ''}`;
    }
    case 'start-sleep': { const s = val('seconds', 's') ?? p0; const ms = val('milliseconds', 'm'); return ms ? `Waits ${ms} milliseconds` : `Waits ${s ?? '?'} second${s === '1' ? '' : 's'}`; }
    case 'start-process': return `Starts the program ${val('filepath') ?? p0 ?? '?'}${a.switches.has('wait') ? ' and waits for it to finish' : ''}`;
    case 'import-module': return `Loads the module ${val('name') ?? p0 ?? '?'}`;
    case 'export-modulemember': return `Makes ${val('function') ?? p0 ?? 'these functions'} available to users of the module`;
    case 'read-host': return `Asks the person: ${val('prompt') ?? p0 ?? '…'}`;
    case 'get-date': return 'Gets the date and time';
    case 'set-strictmode': return 'Treats mistakes such as missing settings as errors';
    case 'convertto-json': return 'Turns it into JSON';
    case 'convertfrom-json': return 'Reads the JSON';
    case 'invoke-expression': return `Runs the text ${p0 ?? val('command') ?? '?'} as a command`;
    case 'invoke-command': return a.named.computername ? `Runs these steps on ${val('computername')}` : 'Runs these steps';
    case 'get-command': return `Looks up the command ${target ?? '?'}`;
    case 'new-object': return `Makes a new ${String(val('typename') ?? p0 ?? 'object').replace(/"/g, '').split('.').pop()}`;
    case 'expand-archive': return `Unpacks ${target ?? '?'}${val('destinationpath') ? ` into ${val('destinationpath')}` : ''}`;
    case 'compress-archive': return `Packs ${target ?? '?'} into ${val('destinationpath') ?? '?'}`;
    case 'add-type': return 'Loads .NET code';
    case 'clear-host': return 'Clears the screen';
    case 'export-csv': return `Saves them to the CSV file ${target ?? '?'}`;
    case 'import-csv': return `Reads the CSV file ${target ?? '?'}`;
    default: break;
  }
  if (KNOWN_FNS.has(lower)) return `Runs ${words(name)}${a.pos.length || Object.keys(a.named).length ? ` with ${listWords([...Object.keys(a.named).map(words), ...a.pos.map((x) => sayValue(x) ?? 'a value')].slice(0, 4))}` : ''}`;
  const vn = name.match(/^([A-Za-z]+)-([A-Za-z]\w*)$/);
  if (vn && (VERB[vn[1].toLowerCase()])) {
    const verb = vn[1].toLowerCase();
    const noun = nounWords(vn[2]);
    const named = val('name', 'resourcegroupname', 'identity', 'id', 'path', 'displayname', 'vmname', 'servicename', 'username');
    const object = named ?? (a.pos[0] ? sayValue(a.pos[0]) : null);
    const many = verb === 'get' && !object;
    const dup = object && !/^"/.test(object) && noun.toLowerCase().endsWith(object.toLowerCase());
    return `${VERB[verb]} the ${many ? pluralNoun(noun) : noun}${object ? (dup ? ` named by ${object}` : ` ${object}`) : ''}`;
  }
  const raws = rest.map((t) => t.text);
  const known = sayCommand(raw.replace(/\.exe$/i, ''), raws, (w) => sayValue(tokenize(w)) ?? quoteText(w));
  if (known) return known;
  if (/[\\/]|\.ps1$/i.test(raw)) return `Runs the script ${quoteText(raw)}`;
  return `Runs ${raw}`;
}

/**
 * A pipeline (`A | B | C`) or an expression statement in words. Gives { says, command, loop?, block? } or null.
 * `loop` is set when it ends in ForEach-Object with a script block (its steps are the loop's body).
 */
function pipelineWords(toks) {
  toks = at0(toks);
  const parts = [[]];
  for (const g of groups(toks)) { if (g.length === 1 && g[0].text === '|') parts.push([]); else parts[parts.length - 1].push(...g); }
  const said = [];
  let command = false, loop = null;
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k];
    if (!p.length) continue;
    const head = p[0];
    if (head.t === 'word' && /^(if|switch|foreach|for|while|do|try|function|class|return|throw)$/i.test(head.text)) return null;
    const name = head.t === 'word' ? (ALIASES[head.text.toLowerCase()] ?? head.text) : head.t === 'punc' && (head.text === '%' || head.text === '?') && k > 0 ? ALIASES[head.text] : '';
    const lower = name.toLowerCase();
    const blockG = groups(p.slice(1)).find((x) => x[0].text === '{');
    const block = blockG?.[0];
    if (lower === 'where-object') {
      const c = condWords(blockG ? blockG.slice(1, -1) : p.slice(1), false);
      said.push(`keeps only those where ${c ?? 'a condition holds'}`);
      command = true;
      continue;
    }
    if (lower === 'foreach-object' && block) {
      loop = { from: block.i + 1, to: block.match };
      command = true;
      continue;
    }
    if (lower === 'out-null') continue;
    if (lower === 'select-object') { const a = argsOf(p.slice(1)); const first = a.named.first ? sayValue(a.named.first) : null; const props = a.named.property ?? a.pos[0]; said.push(first ? `takes the first ${first}` : a.named.last ? `takes the last ${sayValue(a.named.last)}` : a.switches.has('unique') ? 'keeps one of each' : props ? `picks ${listWords(splitCommas(props).map((x) => words(at0(x)[0]?.text ?? '')))}` : 'picks some of them'); command = true; continue; }
    if (lower === 'sort-object') { const a = argsOf(p.slice(1)); const by = a.named.property ?? a.pos[0]; said.push(`sorts them${by ? ` by ${listWords(splitCommas(by).map((x) => words(at0(x)[0]?.text ?? '')))}` : ''}${a.switches.has('descending') ? ', highest first' : ''}`); command = true; continue; }
    if (lower === 'measure-object') { said.push('counts them'); command = true; continue; }
    if (lower === 'group-object') { const a = argsOf(p.slice(1)); const by = a.named.property ?? a.pos[0]; said.push(`groups them${by ? ` by ${words(at0(by)[0]?.text ?? '')}` : ''}`); command = true; continue; }
    if (lower === 'format-table' || lower === 'format-list') { said.push(`shows them as a ${lower === 'format-table' ? 'table' : 'list'}`); command = true; continue; }
    if (lower === 'tee-object') { said.push('keeps a copy as it goes'); command = true; continue; }
    if (head.t === 'word' || head.text === '&' || (head.text === '.' && p.length > 1 && p[1].t !== 'word')) {
      const s = commandWords(p);
      if (s) { said.push(k === 0 ? s : s.charAt(0).toLowerCase() + s.slice(1)); command = true; continue; }
    }
    const v = sayValue(p);
    if (!v) return null;
    said.push(k === 0 ? v : `then ${v}`);
  }
  if (!said.length && !loop) return null;
  const text = said.length ? cap(said[0]) + (said.length > 1 ? `, ${said.slice(1).map((s) => s.replace(/^then /, '')).join(', ').replace(/, ([^,]*)$/, said.length > 2 ? ', then $1' : ' then $1')}` : '') : '';
  return { says: text, command, ...(loop ? { loop } : {}) };
}

// ── Statements ────────────────────────────────────────────────────────────────────────────────────────

const BLOCK_KW = /^(if|elseif|else|foreach|for|while|do|switch|try|catch|finally|trap|function|filter|workflow|class|enum|begin|process|end|dynamicparam|until)$/i;
const CONTINUES = /^(=|\+=|-=|\*=|\/=|\||,|\+|-|\*|\/|::|\(|\{|\[)$/;

/** Statement ranges [from, to) in toks[from..to), with else/catch/while/{ on later lines joined to their statement. */
function splitStatements(toks, from, to) {
  const out = [];
  let i = from;
  while (i < to) {
    while (i < to && (toks[i].t === 'nl' || toks[i].t === 'comment' || toks[i].text === ';')) i++;
    if (i >= to) break;
    const s = i;
    const kw = toks[s].t === 'word' ? toks[s].text.toLowerCase() : '';
    while (i < to) {
      const t = toks[i];
      if (t.match != null && t.match < to) { i = t.match + 1; continue; }
      if (t.text === ';' && t.t === 'punc') break;
      if (t.t === 'nl') {
        let prev = i - 1;
        while (prev > s && toks[prev].t === 'comment') prev--;
        const p = toks[prev];
        if (p && (p.t === 'punc' && CONTINUES.test(p.text) || p.t === 'op')) { i++; continue; }
        let k = i;
        while (k < to && (toks[k].t === 'nl' || toks[k].t === 'comment')) k++;
        const nx = toks[k];
        if (nx && ((nx.t === 'punc' && nx.text === '|') || (nx.t === 'punc' && nx.text === '.' && toks[k + 1]?.t === 'word' && toks[k + 1].end === toks[k].end + toks[k + 1].text.length) || (nx.t === 'word' && /^(else|elseif)$/i.test(nx.text) && /^(if|elseif|else)$/.test(kw)) || (nx.t === 'word' && /^(catch|finally)$/i.test(nx.text) && kw === 'try') || (nx.t === 'word' && /^(while|until)$/i.test(nx.text) && kw === 'do') || (nx.t === 'punc' && nx.text === '{' && BLOCK_KW.test(kw) && !lastIsBlock(toks, s, i)))) { i = k; continue; }
        break;
      }
      i++;
    }
    out.push([s, i]);
  }
  return out;
}
function lastIsBlock(toks, s, i) { let k = i - 1; while (k > s && (toks[k].t === 'nl' || toks[k].t === 'comment')) k--; return toks[k]?.text === '}' && !/^(else|try|finally|do)$/i.test(toks[k - 1]?.text ?? ''); }

/** Parameters from a param(...) block or a function's own (...) list. */
function paramsOf(toks) {
  const out = [];
  for (const part of splitCommas(toks)) {
    const v = part.find((t) => t.t === 'var');
    if (!v) continue;
    const type = [...part.slice(0, part.indexOf(v))].reverse().find((t) => t.t === 'type');
    const t = type ? type.name.toLowerCase() : null;
    const eq = part.indexOf(part.find((t2, i) => t2.text === '=' && i > part.indexOf(v)));
    const def = eq > 0 ? part.slice(eq + 1) : null;
    out.push({ name: v.name, type: t ? (/^(int|int32|int64|long|double|decimal|float|single|byte)$/.test(t) ? 'number' : /^(string|char)$/.test(t) ? 'string' : /^(bool|boolean|switch)$/.test(t) ? 'boolean' : type.name) : null, ...(def ? { default: at0(def).map((x) => x.text).join(' ') } : {}), mandatory: part.some((x) => x.t === 'attr' && /Mandatory/i.test(x.text)) });
  }
  return out;
}

/** Comment-based help: .SYNOPSIS (or .DESCRIPTION), else the plain comment lines. */
function helpText(text) {
  const t = String(text).replace(/^<#|#>$/g, '');
  const m = t.match(/\.SYNOPSIS\s*\n([\s\S]*?)(?:\n\s*\.[A-Z]+\b|$)/i) || t.match(/\.DESCRIPTION\s*\n([\s\S]*?)(?:\n\s*\.[A-Z]+\b|$)/i);
  const body = (m ? m[1] : /^\s*\.[A-Z]/m.test(t) ? '' : t).split('\n').map((l) => l.replace(/^\s*#\s?/, '').trim());
  const para = [];
  for (const l of body) { if (!l) { if (para.length) break; continue; } para.push(l); }
  const s = para.join(' ').replace(/\s+/g, ' ').trim();
  return s ? (s.length > 300 ? `${s.slice(0, 299)}…` : s) : null;
}
function docBefore(toks, idx) {
  let k = idx - 1;
  while (k >= 0 && (toks[k].t === 'nl' || toks[k].t === 'attr')) k--;
  if (k < 0 || toks[k].t !== 'comment') return null;
  if (toks[k].block) return helpText(toks[k].text);
  const run = [];
  while (k >= 0 && toks[k].t === 'comment' && !toks[k].block) { run.unshift(toks[k].text); k--; if (toks[k]?.t === 'nl') k--; }
  return helpText(run.join('\n'));
}

function makeReader(src) {
  const toks = tokenize(src);
  const lineAt = lineFinder(src);
  const fns = [], things = [], errors = new Map(), tests = [];
  const code = (s, e) => { const t = src.slice(toks[s].at, toks[e - 1].end).replace(/\s+/g, ' ').trim(); return t.length > 160 ? `${t.slice(0, 159)}…` : t; };
  const head = (s, e) => { const t = src.slice(toks[s].at, toks[e - 1].end).split('\n')[0].trim(); return t.length > 160 ? `${t.slice(0, 159)}…` : t; };
  const spanOf = (s, e) => ({ startLine: lineAt(toks[s].at), endLine: lineAt(toks[e - 1].end - 1) });
  const base = (s, e, c = code(s, e)) => ({ code: c, line: lineAt(toks[s].at), span: spanOf(s, e) });
  const nextTok = (i, to) => { while (i < to && (toks[i].t === 'nl' || toks[i].t === 'comment')) i++; return i; };
  const blockAt = (i, to) => { const k = nextTok(i, to); return toks[k]?.text === '{' && toks[k].match != null ? [k + 1, toks[k].match] : null; };

  function stepsIn(from, to, ctx = {}) {
    const out = [];
    for (const [s, e] of splitStatements(toks, from, to)) {
      try { out.push(...statement(s, e, ctx)); } catch (err) { if (process.env.PS_DEBUG) console.error(err); out.push({ kind: 'other', says: code(s, e), ...base(s, e) }); }
    }
    return out;
  }

  function statement(s, e, ctx) {
    const t = toks[s];
    const kw = t.t === 'word' ? t.text.toLowerCase() : '';
    const parenAt = (i) => { const k = nextTok(i, e); return toks[k]?.text === '(' ? k : -1; };
    switch (kw) {
      case 'if': {
        let i = s, first = null, tail = null;
        while (i < e) {
          const w = toks[i].text.toLowerCase();
          if (w === 'if' || w === 'elseif') {
            const p = parenAt(i + 1);
            if (p < 0) break;
            const blk = blockAt(toks[p].match + 1, e);
            if (!blk) break;
            const cond = toks.slice(p + 1, toks[p].match);
            const b = { kind: 'branch', says: `If ${condWords(cond, false) ?? `\`${code(p + 1, toks[p].match)}\``}`, cond: condJs(cond), code: head(i, blk[1] + 1), line: lineAt(toks[i].at), span: first ? spanOf(i, e) : spanOf(s, e) };
            const kids = stepsIn(blk[0], blk[1], ctx);
            if (kids.length) b.children = kids;
            if (!first) first = b; else { b.elseIf = true; tail.otherwise = [b]; }
            tail = b;
            i = nextTok(blk[1] + 1, e);
            continue;
          }
          if (w === 'else' && tail) {
            const blk = blockAt(i + 1, e);
            if (!blk) break;
            tail.otherwise = stepsIn(blk[0], blk[1], ctx);
            tail.otherwiseLine = lineAt(toks[i].at);
            i = blk[1] + 1;
            continue;
          }
          break;
        }
        return first ? [first] : [{ kind: 'other', says: code(s, e), ...base(s, e) }];
      }
      case 'foreach': {
        const p = parenAt(s + 1);
        if (p < 0) break;
        const inner = at0(toks.slice(p + 1, toks[p].match));
        const inAt = inner.findIndex((x) => /^in$/i.test(x.text));
        const blk = blockAt(toks[p].match + 1, e);
        const kids = blk ? stepsIn(blk[0], blk[1], ctx) : [];
        const what = inAt > 0 ? sayValue(inner.slice(inAt + 1)) ?? `\`${inner.slice(inAt + 1).map((x) => x.text).join(' ')}\`` : 'them';
        return [{ kind: 'loop', says: `For each ${inner[0]?.t === 'var' ? varWords(inner[0].name) : 'item'} in ${what}`, ...base(s, e, head(s, e)), ...(kids.length ? { children: kids } : {}) }];
      }
      case 'for': {
        const p = parenAt(s + 1);
        if (p < 0) break;
        const parts = []; let cur = [];
        for (const x of toks.slice(p + 1, toks[p].match)) { if (x.text === ';') { parts.push(cur); cur = []; } else cur.push(x); }
        parts.push(cur);
        const blk = blockAt(toks[p].match + 1, e);
        const kids = blk ? stepsIn(blk[0], blk[1], ctx) : [];
        const init = at0(parts[0] || []);
        const cond = parts[1] ? condWords(parts[1], false) : null;
        const says = init[0]?.t === 'var' && init[1]?.text === '=' ? `Counts ${varWords(init[0].name)} from ${sayValue(init.slice(2)) ?? '…'}${cond ? ` while ${cond}` : ''}` : `Repeats${cond ? ` while ${cond}` : ''}`;
        return [{ kind: 'loop', says, ...base(s, e, head(s, e)), ...(kids.length ? { children: kids } : {}) }];
      }
      case 'while': {
        const p = parenAt(s + 1);
        if (p < 0) break;
        const blk = blockAt(toks[p].match + 1, e);
        const kids = blk ? stepsIn(blk[0], blk[1], ctx) : [];
        const c = toks.slice(p + 1, toks[p].match);
        const cw = condWords(c, false);
        return [{ kind: 'loop', says: cw === 'always' ? 'Repeats until something stops it' : `Repeats while ${cw ?? `\`${code(p + 1, toks[p].match)}\``}`, ...base(s, e, head(s, e)), ...(kids.length ? { children: kids } : {}) }];
      }
      case 'do': {
        const blk = blockAt(s + 1, e);
        if (!blk) break;
        const k = nextTok(blk[1] + 1, e);
        const until = /^until$/i.test(toks[k]?.text ?? '');
        const p = parenAt(k + 1);
        const cw = p >= 0 ? condWords(toks.slice(p + 1, toks[p].match), false) : null;
        const kids = stepsIn(blk[0], blk[1], ctx);
        return [{ kind: 'loop', says: `Runs once, then repeats ${until ? 'until' : 'while'} ${cw ?? 'a condition holds'}`, ...base(s, e, head(s, e)), ...(kids.length ? { children: kids } : {}) }];
      }
      case 'switch': {
        let i = s + 1;
        const flags = [];
        while (i < e && (toks[i].t === 'param' || toks[i].t === 'nl')) { if (toks[i].t === 'param') flags.push(toks[i].text.toLowerCase()); i++; }
        const p = parenAt(i);
        const subjectToks = p >= 0 ? toks.slice(p + 1, toks[p].match) : [];
        const blk = blockAt(p >= 0 ? toks[p].match + 1 : i, e);
        if (!blk) break;
        const arms = [];
        let k = blk[0];
        while (k < blk[1]) {
          k = nextTok(k, blk[1]);
          while (k < blk[1] && toks[k].text === ';') k = nextTok(k + 1, blk[1]);
          if (k >= blk[1]) break;
          const patStart = k;
          const pat = toks[k];
          k = pat.match != null ? pat.match + 1 : k + 1;
          const body = blockAt(k, blk[1]);
          if (!body) break;
          const kids = stepsIn(body[0], body[1], ctx);
          const label = /^default$/i.test(pat.text) ? 'Otherwise'
            : pat.text === '{' ? `When ${condWords(toks.slice(patStart + 1, pat.match), false) ?? 'a condition holds'}`
            : flags.includes('-regex') ? `When it matches the pattern ${sayValue([pat])}`
            : flags.includes('-wildcard') ? `When it matches ${sayValue([pat])}`
            : `When it is ${sayValue(toks.slice(patStart, k)) ?? pat.text}`;
          arms.push({ kind: 'check', says: label, caseLabel: true, code: head(patStart, body[1] + 1).slice(0, 90), line: lineAt(pat.at), span: spanOf(patStart, body[1] + 1), ...(kids.length ? { children: kids } : {}), _pat: pat });
          k = body[1] + 1;
        }
        for (const a of arms) delete a._pat;
        return [{ kind: 'branch', says: `Chooses by ${sayValue(subjectToks) ?? 'value'}`, ...base(s, e, head(s, e)), ...(arms.length ? { children: arms } : {}) }];
      }
      case 'try': {
        const blk = blockAt(s + 1, e);
        if (!blk) break;
        const step = { kind: 'try', says: 'Tries these steps and handles any error', ...base(s, e, head(s, e)) };
        const kids = stepsIn(blk[0], blk[1], ctx);
        if (kids.length) step.children = kids;
        let i = nextTok(blk[1] + 1, e);
        while (i < e) {
          const w = toks[i].text.toLowerCase();
          if (w === 'catch') {
            const types = [];
            let j = i + 1;
            while (j < e && (toks[j].t === 'type' || toks[j].text === ',' || toks[j].t === 'nl')) { if (toks[j].t === 'type') types.push(toks[j].name.split('.').pop()); j++; }
            const b = blockAt(j, e);
            if (!b) break;
            (step.handlers ||= []).push({ says: types.length ? `If ${types.join(' or ')} goes wrong` : 'If anything goes wrong', line: lineAt(toks[i].at), steps: stepsIn(b[0], b[1], ctx) });
            i = nextTok(b[1] + 1, e);
            continue;
          }
          if (w === 'finally') {
            const b = blockAt(i + 1, e);
            if (!b) break;
            step.always = { line: lineAt(toks[i].at), steps: stepsIn(b[0], b[1], ctx) };
            i = nextTok(b[1] + 1, e);
            continue;
          }
          break;
        }
        return [step];
      }
      case 'trap': {
        const k = toks[s + 1]?.t === 'type' ? s + 2 : s + 1;
        const blk = blockAt(k, e);
        const kids = blk ? stepsIn(blk[0], blk[1], ctx) : [];
        return [{ kind: 'call', says: 'Whenever an error happens, it runs these steps', ...base(s, e, head(s, e)), ...(kids.length ? { children: kids, nested: true } : {}) }];
      }
      case 'throw': {
        const rest = at0(toks.slice(s + 1, e));
        let name = 'an error', msg = null;
        if (rest[0]?.t === 'str') msg = stringText(rest[0]);
        else if (rest[0]?.t === 'type') { name = rest[0].name.split('.').pop(); const str = rest.find((x) => x.t === 'str'); if (str) msg = stringText(str); }
        else if (/^new-object$/i.test(rest[0]?.text ?? '')) { name = String(rest[1]?.text ?? 'error').split('.').pop(); const str = rest.find((x) => x.t === 'str'); if (str) msg = stringText(str); }
        else if (rest[0]?.t === 'punc' && rest[0].text === '(') { const str = rest.find((x) => x.t === 'str'); const ty = rest.find((x) => x.t === 'type' || /exception$/i.test(x.text)); if (ty) name = (ty.name ?? ty.text).split('.').pop(); if (str) msg = stringText(str); }
        else if (rest[0]?.t === 'var') { if (!rest.length || /^_$/.test(rest[0].name)) return [{ kind: 'fail', says: 'Fails again with the same error', error: 'the same error', ...base(s, e) }]; msg = null; name = varWords(rest[0].name); }
        else if (!rest.length) return [{ kind: 'fail', says: 'Fails again with the same error', error: 'the same error', ...base(s, e) }];
        if (msg) errors.set(msg, errors.get(msg) ?? lineAt(t.at)); else if (name !== 'an error') errors.set(name, errors.get(name) ?? lineAt(t.at));
        return [{ kind: 'fail', says: `Fails with ${name}${msg ? `: "${msg}"` : ''}`, error: name, ...(msg ? { message: msg } : {}), ...base(s, e) }];
      }
      case 'return': {
        const rest = toks.slice(s + 1, e);
        if (!at0(rest).length) return [{ kind: 'return', says: 'Stops here', ...base(s, e) }];
        // `return $(if (…) { a } else { b })`: the choice itself, each side giving back its value.
        const r0 = at0(rest);
        if (r0.length && (r0[0].text === '$(' || r0[0].text === '(') && r0[0].match === r0[r0.length - 1].i) {
          const k = nextTok(r0[0].i + 1, r0[0].match);
          if (/^(if|switch)$/i.test(toks[k]?.text ?? '')) return statement(k, r0[0].match, ctx);
        }
        const v = sayValue(rest);
        return [{ kind: 'return', says: v ? `Returns ${v}` : 'Returns a computed value', ...(v ? {} : { restates: true }), ...base(s, e), _value: rest }];
      }
      case 'exit': {
        const n = at0(toks.slice(s + 1, e))[0];
        if (!n || n.text === '0') return [{ kind: 'return', says: 'Stops the script here, finished without errors', ...base(s, e) }];
        if (n.t === 'num') return [{ kind: 'fail', says: `Fails with exit code ${n.text}`, error: `exit code ${n.text}`, ...base(s, e) }];
        return [{ kind: 'return', says: `Stops the script with the exit code in ${sayValue([n]) ?? 'a value'}`, ...base(s, e) }];
      }
      case 'break': return [];
      case 'continue': return [{ kind: 'call', says: 'Skips to the next one', ...base(s, e) }];
      case 'function': case 'filter': case 'workflow': {
        defineFunction(s, e);
        return [{ kind: 'set', says: `Defines a helper, ${words(toks[nextTok(s + 1, e)]?.text ?? 'function')}`, ...base(s, e, head(s, e)) }];
      }
      case 'class': case 'enum': defineType(s, e, kw); return [];
      case 'param': case 'using': return [];
      case 'begin': case 'process': case 'end': {
        const blk = blockAt(s + 1, e);
        if (!blk) break;
        const kids = stepsIn(blk[0], blk[1], ctx);
        if (kw === 'process' && kids.length) return [{ kind: 'loop', says: 'For each item given to it', ...base(s, e, head(s, e)), children: kids }];
        return kids;
      }
      default: break;
    }
    if (t.t === 'attr' || t.t === 'comment') { const k = nextTok(s + 1, e); return k < e ? statement(k, e, ctx) : []; }
    // Pode routes: Add-PodeRoute -Method Get -Path '/orders' -ScriptBlock { … }.
    if (/^add-poderoute$/i.test(t.text)) { podeRoute(s, e); return []; }
    if (/^(describe|context|it)$/i.test(t.text) && toks[nextTok(s + 1, e)]?.t === 'str') {
      const name = stringText(toks[nextTok(s + 1, e)]);
      const blk = toks.slice(s, e).find((x) => x.text === '{' && x.match != null);
      if (/^it$/i.test(t.text)) tests.push({ name, line: lineAt(t.at) });
      else if (blk) stepsIn(blk.i + 1, blk.match, ctx);
      return [];
    }
    return pipelineStatement(s, e, ctx);
  }

  function pipelineStatement(s, e, ctx) {
    const list = at0(toks.slice(s, e));
    // Assignment: $x = …, $x.Y = …, [int]$x = …, $x += …
    const g = groups(list);
    const eqAt = g.findIndex((x) => x.length === 1 && x[0].t === 'punc' && /^(=|\+=|-=|\*=|\/=)$/.test(x[0].text));
    if (eqAt > 0 && g.slice(0, eqAt).every((x) => x[0].t === 'var' || x[0].t === 'type' || x[0].text === '.' || x[0].t === 'word' || x[0].text === '[')) {
      const lhs = g.slice(0, eqAt).flat().filter((x) => x.t !== 'type');
      const v = lhs[0];
      const members = lhs.filter((x, i) => i > 0 && x.t === 'word').map((x) => x.text);
      const isThis = v?.t === 'var' && /^this$/i.test(v.name);
      const target = v?.t === 'var' ? (isThis ? (members.length ? words(members[members.length - 1]) : 'it') : chainWords(varWords(v.name), members)) : 'a value';
      const op = g[eqAt][0].text;
      let rhs = g.slice(eqAt + 1).flat();
      // `$null = …` runs it and throws the answer away.
      if (v?.t === 'var' && /^null$/i.test(v.name) && op === '=') {
        const pw0 = rhs[0]?.t === 'word' || rhs[0]?.text === '&' ? pipelineWords(rhs) : null;
        const said = pw0?.command ? pw0.says : sayValue(rhs) ? `Works out ${sayValue(rhs)}` : null;
        return [{ kind: 'call', says: said ? `${said}, ignoring the answer` : code(s, e), ...(said ? {} : { restates: true }), ...base(s, e) }];
      }
      // `$a = $b = $false`: every name gets the same value.
      const more = [];
      for (let rg = groups(rhs), at = rg.findIndex((x) => x.length === 1 && x[0].text === '='); at > 0 && rg[0][0].t === 'var'; rg = groups(rhs), at = rg.findIndex((x) => x.length === 1 && x[0].text === '=')) {
        more.push(varWords(rg[0][0].name));
        rhs = rg.slice(at + 1).flat();
      }
      if (more.length) { const val = sayValue(rhs); return [{ kind: 'set', says: `Sets ${listWords([target, ...more])} to ${val ?? 'a computed value'}`, ...(val ? {} : { restates: true }), ...base(s, e) }]; }
      if (/^\$?ErrorActionPreference$/i.test(v?.name ?? '') && /stop/i.test(rhs.map((x) => x.text).join(''))) return [{ kind: 'set', says: 'Stops at the first error', ...base(s, e) }];
      if (op === '+=' || op === '-=') { const val = sayValue(rhs); return [{ kind: 'set', says: `${op === '+=' ? 'Adds' : 'Subtracts'} ${val ?? 'a value'} ${op === '+=' ? 'to' : 'from'} ${target}`, ...base(s, e) }]; }
      if (isThis && rhs.length === 1 && rhs[0].t === 'var' && rhs[0].name.toLowerCase() === String(members[members.length - 1]).toLowerCase()) return [{ kind: 'set', says: `Keeps the ${target} it is given`, ...base(s, e) }];
      const piped = groups(rhs).some((x) => x.length === 1 && x[0].text === '|');
      const pw = rhs[0]?.t === 'word' || rhs[0]?.text === '&' || piped ? pipelineWords(rhs) : null;
      if (pw?.command || (piped && pw)) return [{ kind: 'set', says: `${pw.says}, keeping the result as ${target}`, ...(rhs[0].t === 'word' ? { callee: rhs[0].text } : {}), ...base(s, e) }];
      const ifV = rhs[0]?.t === 'word' && /^(if|switch|foreach|try)$/i.test(rhs[0].text);
      if (ifV) { const inner = statement(rhs[0].i, e, ctx); return inner.map((x) => ({ ...x, says: `${x.says} (the answer becomes ${target})` })); }
      const val = sayValue(rhs);
      if (val === 'an empty list' || val === 'an empty table') return [{ kind: 'set', says: `Starts ${target} as ${val}`, ...base(s, e) }];
      return [{ kind: 'set', says: val ? `Sets ${target} to ${val}` : `Works out ${target}`, ...(val ? {} : { restates: true }), ...base(s, e) }];
    }
    if (g.length === 2 && g[0][0].t === 'var' && (g[1][0].text === '++' || g[1][0].text === '--')) return [{ kind: 'set', says: `${g[1][0].text === '++' ? 'Adds one to' : 'Subtracts one from'} ${varWords(g[0][0].name)}`, ...base(s, e) }];
    const head0 = list[0];
    const lower = head0?.t === 'word' ? head0.text.toLowerCase() : '';
    if (/^write-error$/.test(lower)) {
      const a = argsOf(list.slice(1));
      const msg = a.named.message ? sayValue(a.named.message) : a.pos[0] ? sayValue(a.pos[0]) : null;
      const text = msg ? msg.replace(/^"|"$/g, '') : null;
      const stops = STOP_ON_ERROR || /stop/i.test(a.named.erroraction?.map((x) => x.text).join('') ?? '');
      if (text) errors.set(text, errors.get(text) ?? lineAt(head0.at));
      return [stops ? { kind: 'fail', says: `Fails with an error${text ? `: "${text}"` : ''}`, error: 'an error', ...(text ? { message: text } : {}), ...base(s, e) } : { kind: 'call', says: `Reports an error${text ? `: "${text}"` : ''} and carries on`, ...base(s, e) }];
    }
    // A command given a script block (`Invoke-Command { … }`, `Measure-Command { … }`): the block's steps are read.
    const lg = groups(list);
    const lastBlock = lg[lg.length - 1];
    if (head0?.t === 'word' && lg.length > 1 && !lg.some((x) => x.length === 1 && x[0].text === '|') && lastBlock[0].text === '{' && lastBlock[0].match != null && !/^(foreach-object|where-object|foreach|where)$/i.test(head0.text)) {
      const said = commandWords(list.slice(0, list.length - lastBlock.length)) ?? `Runs ${head0.text}`;
      const kids = stepsIn(lastBlock[0].i + 1, lastBlock[0].match, ctx);
      return [{ kind: 'call', says: /these steps/.test(said) ? said : `${said}, with these steps`, callee: head0.text, ...base(s, e, head(s, e)), ...(kids.length ? { children: kids } : {}) }];
    }
    const pw = pipelineWords(list);
    if (pw?.loop) {
      const kids = pw.loop.to != null ? stepsIn(pw.loop.from, pw.loop.to, ctx) : [];
      return [{ kind: 'loop', says: pw.says ? `For each result of ${gerund(pw.says)}` : 'For each one', ...base(s, e, head(s, e)), ...(kids.length ? { children: kids } : {}) }];
    }
    if (pw) {
      if (!pw.command) {
        // `$list.Add(x)`, `$sb.Append(x)`: a method that changes something reads as what it does, not as an answer.
        const mg = groups(list);
        const lastG = mg[mg.length - 1];
        if (mg.length >= 4 && lastG[0].text === '(' && mg[mg.length - 3][0].text === '.' && mg[mg.length - 2][0].t === 'word' && (mg[0][0].t === 'var' || mg[0][0].t === 'type')) {
          const method = mg[mg.length - 2][0].text;
          const owner = sayValue(mg.slice(0, -3).flat()) ?? 'it';
          const arg = splitCommas(lastG.slice(1, -1)).map((x) => sayValue(x) ?? 'a value');
          const said = /^(add|push|enqueue|append|appendline|insert)$/i.test(method) ? `Adds ${listWords(arg) || 'a line'} to ${owner}`
            : /^(remove|removeat|pop|dequeue)$/i.test(method) ? `Removes ${listWords(arg) || 'one'} from ${owner}`
            : /^clear$/i.test(method) ? `Empties ${owner}` : /^(dispose|close)$/i.test(method) ? `Closes ${owner}` : `Calls ${words(method)} on ${owner}`;
          return [{ kind: 'call', says: said, callee: method, ...base(s, e) }];
        }
        // A bare value is output: in a function it is part of what it gives back.
        const said = /^"/.test(pw.says) || /^[A-Z][a-z]*[A-Z]/.test(pw.says) ? pw.says : pw.says.charAt(0).toLowerCase() + pw.says.slice(1);
        return [{ kind: 'return', says: `Returns ${said}`, implicit: true, ...base(s, e), _value: toks.slice(s, e) }];
      }
      const callee = head0?.t === 'word' ? head0.text : undefined;
      return [{ kind: 'call', says: pw.says, ...(callee ? { callee } : {}), ...base(s, e) }];
    }
    return [{ kind: 'other', says: code(s, e), ...base(s, e) }];
  }

  // ── Functions, classes, routes ──
  function bodyParts(from, to) {
    let params = [];
    let k = nextTok(from, to);
    while (k < to && (toks[k].t === 'attr' || toks[k].t === 'nl' || toks[k].t === 'comment')) k++;
    if (/^param$/i.test(toks[k]?.text ?? '')) { const p = nextTok(k + 1, to); if (toks[p]?.text === '(') { params = paramsOf(toks.slice(p + 1, toks[p].match)); k = toks[p].match + 1; } }
    return { params, from: k };
  }
  function lastValueToReturn(list) {
    // PowerShell outputs a bare value; the function's last one is the answer it gives back.
    const last = list[list.length - 1];
    if (!last) return;
    if (last.kind === 'branch') { for (const side of [last.children, last.otherwise]) lastValueToReturn(side || []); for (const c of last.children || []) if (c.caseLabel) lastValueToReturn(c.children || []); }
  }
  function cleanSteps(list) { for (const s of list || []) { delete s._value; delete s.implicit; cleanSteps(s.children); cleanSteps(s.otherwise); for (const h of s.handlers || []) cleanSteps(h.steps); if (s.always) cleanSteps(s.always.steps); } return list; }

  function defineFunction(s, e) {
    const k = nextTok(s + 1, e);
    const nameTok = toks[k];
    if (!nameTok) return;
    const name = nameTok.text.replace(/^(?:script|global|local):/i, '');
    let i = nextTok(k + 1, e), params = [];
    if (toks[i]?.text === '(') { params = paramsOf(toks.slice(i + 1, toks[i].match)); i = toks[i].match + 1; }
    const blk = blockAt(i, e);
    if (!blk) return;
    const parts = bodyParts(blk[0], blk[1]);
    if (parts.params.length) params = parts.params;
    const inner = toks.slice(blk[0], blk[1]).find((x) => x.t === 'comment' && x.block && /\.SYNOPSIS|\.DESCRIPTION/i.test(x.text));
    const doc = docBefore(toks, s) ?? (inner ? helpText(inner.text) : null);
    const steps = stepsIn(parts.from, blk[1]);
    if (!steps.length) steps.push({ kind: 'return', says: 'Does nothing', ...base(s, e, head(s, e)) });
    lastValueToReturn(steps);
    const first = nextTok(parts.from, blk[1]);
    fns.push({ name, line: lineAt(nameTok.at), params, doc, steps, body: first < blk[1] ? [lineAt(toks[first].at), lineAt(toks[blk[1]].at)] : null, _range: [parts.from, blk[1]] });
  }

  function podeRoute(s, e) {
    const a = argsOf(toks.slice(s + 1, e));
    const method = String(a.named.method ? at0(a.named.method)[0]?.text ?? 'GET' : 'GET').replace(/['"]/g, '').toUpperCase();
    const pathTok = a.named.path ? at0(a.named.path)[0] : null;
    const path = pathTok ? (pathTok.t === 'str' ? stringText(pathTok) : pathTok.text) : '/';
    const sb = a.named.scriptblock;
    if (!sb || sb[0].text !== '{') return;
    const open = sb[0].i;
    fns.push({ name: `${method} ${path}`, line: lineAt(toks[s].at), params: [], route: { method, path }, steps: stepsIn(open + 1, sb[0].match), body: [lineAt(toks[nextTok(open + 1, sb[0].match)]?.at ?? toks[open].at), lineAt(toks[sb[0].match].at)] });
  }

  function defineType(s, e, kw) {
    const nameTok = toks[nextTok(s + 1, e)];
    const blk = toks.slice(s, e).find((x) => x.text === '{' && x.match != null);
    if (!nameTok || !blk) return;
    const open = blk.i, close = blk.match;
    const lines = [lineAt(toks[s].at), lineAt(toks[close].at)];
    const doc = docBefore(toks, s);
    if (kw === 'enum') {
      const choices = [];
      for (const [a] of splitStatements(toks, open + 1, close)) if (toks[a].t === 'word') choices.push(words(toks[a].text));
      things.push({ kind: 'choices', name: nameTok.text, lines, ...(doc ? { doc } : {}), knows: [], choices });
      return;
    }
    const thing = { kind: 'thing', name: nameTok.text, lines, ...(doc ? { doc } : {}), knows: [], choices: [], methods: 0 };
    for (const [a, b] of splitStatements(toks, open + 1, close)) {
      const st = at0(toks.slice(a, b)).filter((x) => x.t !== 'attr' && !/^(hidden|static)$/i.test(x.text));
      const v = st.findIndex((x) => x.t === 'var');
      const paren = st.findIndex((x) => x.text === '(');
      if (v >= 0 && (paren < 0 || paren > v)) {
        const type = st.slice(0, v).reverse().find((x) => x.t === 'type');
        const eq = st.findIndex((x, i) => i > v && x.text === '=');
        const def = eq > 0 ? st.slice(eq + 1) : null;
        thing.knows.push({ name: st[v].name, type: type?.name ?? null, start: def ? def.map((x) => x.text).join(' ') : null, line: lineAt(st[v].at) });
        continue;
      }
      // A method: [returnType] Name(params) { … }, or the constructor Name(params) { … }.
      const nameAt = st.findIndex((x, i) => x.t === 'word' && st[i + 1]?.text === '(');
      if (nameAt < 0) continue;
      const mTok = st[nameAt];
      const pOpen = st[nameAt + 1];
      const body = st.slice(nameAt).find((x) => x.text === '{' && x.match != null);
      if (!body) continue;
      const params = paramsOf(toks.slice(pOpen.i + 1, pOpen.match));
      const bOpen = body.i;
      const steps = stepsIn(bOpen + 1, body.match);
      if (!steps.length) steps.push({ kind: 'return', says: 'Does nothing', ...base(mTok.i, body.match + 1, head(mTok.i, body.match + 1)) });
      const first = nextTok(bOpen + 1, body.match);
      const ret = st.slice(0, nameAt).reverse().find((x) => x.t === 'type');
      if (mTok.text !== nameTok.text) thing.methods++;
      fns.push({ name: mTok.text, line: lineAt(mTok.at), params, returns: ret && !/^void$/i.test(ret.name) ? ret.name : null, doc: docBefore(toks, st[0].i), steps, body: first < body.match ? [lineAt(toks[first].at), lineAt(toks[body.match].at)] : null, _range: [bOpen + 1, body.match] });
      if (mTok.text === nameTok.text) {
        // Starting values from the constructor: $this.X = $x (a parameter) or a fixed value.
        for (const [x, y] of splitStatements(toks, bOpen + 1, body.match)) {
          const st2 = at0(toks.slice(x, y));
          if (!(st2[0]?.t === 'var' && /^this$/i.test(st2[0].name) && st2[1]?.text === '.' && st2[3]?.text === '=')) continue;
          const k2 = thing.knows.find((kk) => kk.name.toLowerCase() === st2[2].text.toLowerCase());
          const val = st2.slice(4);
          const param = val.length === 1 && val[0].t === 'var' ? params.find((p) => p.name.toLowerCase() === val[0].name.toLowerCase()) : null;
          const start = param ? (param.default ? { param: param.default } : { given: true }) : val.map((q) => q.text).join(' ');
          if (k2) { if (k2.start == null || param) k2.start = start; } else thing.knows.push({ name: st2[2].text, type: null, start, line: lineAt(st2[0].at) });
        }
      }
    }
    if (!thing.methods) thing.kind = 'record';
    delete thing.methods;
    things.push(thing);
  }

  return { toks, fns, things, errors, tests, stepsIn, lineAt, splitStatements: () => splitStatements(toks, 0, toks.length), statement, nextTok, code, cleanSteps };
}

// ── Decisions: a function that only chooses between fixed answers ─────────────────────────────────────────

const fixedOf = (toks) => {
  const v = at0(toks || []);
  if (v.length !== 1) return null;
  const t = v[0];
  if (t.t === 'str' && !(t.quote === '"' && /\$/.test(t.body))) return JSON.stringify(t.quote === "'" ? t.body.replace(/''/g, "'") : t.body);
  if (t.t === 'num' && /^-?\d+(\.\d+)?$/.test(t.text)) return t.text;
  if (t.t === 'var' && /^(true|false)$/i.test(t.name)) return t.name.toLowerCase();
  return null;
};

/**
 * Rules from the function's statements when every path ends in a fixed answer: `if (…) { 'A' } elseif … else { 'C' }`,
 * guards `if (…) { return 'A' }` before a last answer, or a `switch` whose cases each give one. Null otherwise.
 */
function decisionOf(r, from, to, subjectNames) {
  const stmts = r.splitStatements ? splitStatements(r.toks, from, to) : [];
  const toks = r.toks;
  const valueOfBlock = (a, b) => {
    const st = splitStatements(toks, a, b);
    if (st.length !== 1) return null;
    let [x, y] = st[0];
    if (/^return$/i.test(toks[x].text)) x++;
    return fixedOf(toks.slice(x, y));
  };
  const rules = [];
  let otherwise = null;
  const nextTok = r.nextTok;
  const blockAt = (i, e) => { const k = nextTok(i, e); return toks[k]?.text === '{' && toks[k].match != null ? [k + 1, toks[k].match] : null; };
  for (let n = 0; n < stmts.length; n++) {
    const [s, e] = stmts[n];
    const kw = toks[s].text.toLowerCase();
    const isLast = n === stmts.length - 1;
    if (toks[s].t === 'attr' || /^param$/i.test(kw)) continue;
    if (kw === 'if') {
      let i = s;
      const local = [];
      let fb = null, ok = true;
      while (i < e) {
        const w = toks[i].text.toLowerCase();
        if (w === 'if' || w === 'elseif') {
          const p = nextTok(i + 1, e);
          if (toks[p]?.text !== '(') { ok = false; break; }
          const blk = blockAt(toks[p].match + 1, e);
          if (!blk) { ok = false; break; }
          const cond = condJs(toks.slice(p + 1, toks[p].match));
          const val = valueOfBlock(blk[0], blk[1]);
          if (!cond || !val) { ok = false; break; }
          local.push({ cond, result: val, line: r.lineAt(toks[i].at) });
          i = nextTok(blk[1] + 1, e);
          continue;
        }
        if (w === 'else') { const blk = blockAt(i + 1, e); const val = blk ? valueOfBlock(blk[0], blk[1]) : null; if (!val) { ok = false; break; } fb = { result: val, line: r.lineAt(toks[i].at) }; i = blk[1] + 1; continue; }
        break;
      }
      if (!ok) return null;
      rules.push(...local);
      if (fb) { if (!isLast) return null; otherwise = fb; }
      continue;
    }
    if (kw === 'switch' && isLast) {
      let i = s + 1;
      while (toks[i]?.t === 'param' || toks[i]?.t === 'nl') { if (toks[i].t === 'param' && !/^-exact$/i.test(toks[i].text)) return null; i++; }
      const p = nextTok(i, e);
      if (toks[p]?.text !== '(') return null;
      const subj = condJs(toks.slice(p + 1, toks[p].match));
      if (!subj || /\s/.test(subj)) return null;
      const blk = blockAt(toks[p].match + 1, e);
      if (!blk) return null;
      let k = blk[0];
      while (k < blk[1]) {
        k = nextTok(k, blk[1]);
        if (k >= blk[1]) break;
        const pat = toks[k];
        const body = blockAt(k + 1, blk[1]);
        if (!body) return null;
        const val = valueOfBlock(body[0], body[1]);
        if (!val) return null;
        if (/^default$/i.test(pat.text)) otherwise = { result: val, line: r.lineAt(pat.at) };
        else { const pv = fixedOf([pat]) ?? (pat.t === 'word' && /^\w+$/.test(pat.text) ? JSON.stringify(pat.text) : null); if (!pv) return null; rules.push({ cond: `${subj} == ${pv}`, result: val, line: r.lineAt(pat.at) }); }
        k = body[1] + 1;
      }
      continue;
    }
    if (isLast) {
      let x = s;
      if (/^return$/i.test(kw)) x++;
      const val = fixedOf(toks.slice(x, e));
      if (!val) return null;
      otherwise = { result: val, line: r.lineAt(toks[s].at) };
      continue;
    }
    return null;
  }
  return rules.length && otherwise ? { rules, otherwise } : null;
}

/** Read a PowerShell file into functions (with steps or decision rules), Things, errors, and Pester tests. */
export function powershellReading(src, file = '') {
  STOP_ON_ERROR = /\$ErrorActionPreference\s*=\s*['"]Stop['"]/i.test(src);
  KNOWN_FNS = new Set([...src.matchAll(/^\s*(?:function|filter)\s+(?:(?:script|global):)?([\w-]+)/gim)].map((m) => m[1].toLowerCase()));
  const r = makeReader(src);
  const top = [];
  const scriptParams = [];
  for (const [s, e] of r.splitStatements()) {
    const t = r.toks[s];
    if (/^param$/i.test(t.text)) { const p = r.nextTok(s + 1, e); if (r.toks[p]?.text === '(') scriptParams.push(...paramsOf(r.toks.slice(p + 1, r.toks[p].match))); continue; }
    const st = r.statement(s, e, {});
    if (/^(function|filter|workflow)$/i.test(t.text)) continue;
    for (const x of st) if (x.code && !/^(Set-StrictMode|#requires|using)\b/i.test(x.code)) top.push(x);
  }
  for (const f of r.fns) {
    if (f._range) {
      const d = decisionOf(r, f._range[0], f._range[1]);
      if (d) f.decision = d;
      delete f._range;
    }
    r.cleanSteps(f.steps);
  }
  const fns = [...r.fns];
  const real = top.filter((x) => !/^(Export-ModuleMember|Set-StrictMode)\b/i.test(x.code ?? ''));
  if (real.length) {
    r.cleanSteps(real);
    const name = file ? String(file).split(/[\\/]/).pop() : 'script';
    const firstBlock = r.toks.find((x) => x.t !== 'nl');
    const doc = firstBlock?.t === 'comment' ? helpText(firstBlock.block ? firstBlock.text : r.toks.filter((x, i) => i < 40 && x.t === 'comment' && !x.block && x.at < (r.toks.find((y) => y.t !== 'comment' && y.t !== 'nl')?.at ?? 0)).map((x) => x.text).join('\n')) : null;
    fns.push({ name, line: real[0].line, params: scriptParams, doc, steps: real, body: [real[0].span.startLine, real[real.length - 1].span.endLine], topLevel: true, headline: `Runs ${name}, from top to bottom.` });
  }
  fns.sort((a, b) => a.line - b.line);
  const out = { fns, things: r.things, errors: [...r.errors].map(([name, line]) => ({ name, line })), tests: r.tests };
  STOP_ON_ERROR = false; KNOWN_FNS = new Set();
  return out;
}

/** Things (classes) and Choices (enums) from a PowerShell file, in the model's shape. */
export function psThings(src, file, { words: w, kindWords, startValue }) {
  const { things } = powershellReading(src, file);
  const norm = (v) => String(v ?? '').trim().replace(/^@\(\s*\)$/, '[]').replace(/^@\{\s*\}$/, '{}').replace(/^\$null$/i, 'null').replace(/^\$true$/i, 'true').replace(/^\$false$/i, 'false').replace(/^'(.*)'$/, '"$1"');
  const kind = (t) => { const x = String(t ?? '').toLowerCase(); if (!x) return null; if (/\[\]$/.test(x)) return kindWords(`List<${String(t).slice(0, -2).replace(/^string$/i, 'string').replace(/^int$/i, 'int')}>`); if (/(?:arraylist|list|collection|hashset)(?:\[|$)/.test(x)) return 'a list'; if (/^(?:hashtable|dictionary|ordered)/.test(x)) return 'a lookup table'; return kindWords(/^(int|int32|int64|long|double|decimal|float)$/.test(x) ? 'int' : /^(string|char)$/.test(x) ? 'string' : /^(bool|boolean|switch)$/.test(x) ? 'bool' : /^datetime$/.test(x) ? 'DateTime' : String(t).split('.').pop()); };
  return things.map((t) => ({
    kind: t.kind, name: t.name, file, lines: t.lines, ...(t.doc ? { doc: t.doc } : {}), choices: t.choices,
    knows: t.knows.map((k) => ({ name: k.name, label: w(k.name), kind: kind(k.type), start: k.start == null ? null : typeof k.start === 'object' ? (k.start.given ? 'given when it starts' : `${startValue(norm(k.start.param))?.replace(/ at first$/, '')} unless told otherwise`) : startValue(norm(k.start)), line: k.line })),
  }));
}

export { cap };
