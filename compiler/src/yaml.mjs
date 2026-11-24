// A small YAML reader for the files Thunder reads as infrastructure and delivery (GitHub Actions workflows first).
// Not a full YAML 1.2 implementation: block mappings and sequences, flow lists `[a, b]` and maps `{ a: b }`, plain,
// single- and double-quoted scalars, block scalars `|` and `>` with chomping (`-`, `+`) and an indentation digit,
// comments, anchors and aliases, and `${{ … }}` expressions kept exactly as text. Every node keeps its line, so a
// reading can always point at the original. Walks line by line; no regex here can backtrack on long runs.
// Zero dependencies, browser-safe.
//
// Nodes:  { t: 'map', line, entries: [{ key, line, value }] }
//         { t: 'seq', line, items: [node] }
//         { t: 'str', line, v, plain, block? }   (scalars stay text; `toJS` gives YAML's core types)

export class YamlError extends Error {
  constructor(message, line) { super(`${message} (line ${line})`); this.line = line; }
}

const indentOf = (s) => { let i = 0; while (i < s.length && s[i] === ' ') i++; return i; };
const isBlank = (s) => { for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '#') return true; if (c !== ' ' && c !== '\t' && c !== '\r') return false; } return true; };

/** Drop a trailing comment (` # …`) that sits outside quotes and outside `${{ … }}`. */
export function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (q === '"' && c === '\\') { i++; continue; }
      if (c === q) { if (q === "'" && s[i + 1] === "'") { i++; continue; } q = null; }
      continue;
    }
    if (c === '$' && s[i + 1] === '{' && s[i + 2] === '{') { const end = s.indexOf('}}', i + 3); if (end < 0) return s; i = end + 1; continue; }
    if ((c === '"' || c === "'") && (i === 0 || /[\s[{,:-]/.test(s[i - 1]))) { q = c; continue; }
    if (c === '#' && (i === 0 || s[i - 1] === ' ' || s[i - 1] === '\t')) return s.slice(0, i).replace(/[ \t]+$/, '');
  }
  return s.replace(/[ \t\r]+$/, '');
}

/** Where a mapping key ends: the index of its `:`, or -1 when the text is not `key: value`. */
function keyColon(s) {
  if (!s || s[0] === '-' && (s[1] === ' ' || s.length === 1) || s[0] === '[' || s[0] === '{' || s[0] === '#' || s[0] === '|' || s[0] === '>') return -1;
  if (s[0] === '"' || s[0] === "'") {
    const end = quoteEnd(s, 0);
    if (end < 0) return -1;
    let j = end + 1;
    while (s[j] === ' ') j++;
    return s[j] === ':' && (j + 1 === s.length || s[j + 1] === ' ' || s[j + 1] === '\t') ? j : -1;
  }
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '$' && s[i + 1] === '{' && s[i + 2] === '{') { const end = s.indexOf('}}', i + 3); if (end < 0) return -1; i = end + 1; continue; }
    if (c === ' ' && s[i + 1] === '#') return -1;
    if (c === ':' && (i + 1 === s.length || s[i + 1] === ' ' || s[i + 1] === '\t')) return i;
  }
  return -1;
}

/** Index of the closing quote for the quote at `at`, or -1. */
function quoteEnd(s, at) {
  const q = s[at];
  for (let i = at + 1; i < s.length; i++) {
    if (q === '"' && s[i] === '\\') { i++; continue; }
    if (s[i] === q) { if (q === "'" && s[i + 1] === "'") { i++; continue; } return i; }
  }
  return -1;
}

const ESC = { n: '\n', t: '\t', r: '\r', '0': '\0', '"': '"', '\\': '\\', '/': '/', ' ': ' ', e: '\x1b', b: '\b', f: '\f', a: '\x07', v: '\v', N: '\u0085', _: ' ' };
function unquote(s) {
  if (s[0] === "'") return s.slice(1, -1).replace(/''/g, "'");
  let out = '';
  for (let i = 1; i < s.length - 1; i++) {
    const c = s[i];
    if (c !== '\\') { out += c; continue; }
    const n = s[++i];
    if (n === 'x' || n === 'u' || n === 'U') { const len = n === 'x' ? 2 : n === 'u' ? 4 : 8; out += String.fromCodePoint(parseInt(s.slice(i + 1, i + 1 + len), 16) || 0); i += len; continue; }
    out += ESC[n] ?? n;
  }
  return out;
}

/** Fold the lines of a multi-line quoted or plain scalar: one newline becomes a space, a blank line a newline. */
function foldLines(parts) {
  let out = '';
  let blank = 0;
  for (const p of parts) {
    const t = p.trim();
    if (!t) { blank++; continue; }
    out += out ? (blank ? '\n'.repeat(blank) : ' ') + t : t;
    blank = 0;
  }
  return out;
}

/** Parse YAML text. Returns the first document's node (null when empty); `parseYamlAll` gives every document. */
export function parseYaml(src) { return parseYamlAll(src)[0] ?? null; }

export function parseYamlAll(src) {
  const raw = String(src ?? '').replace(/^﻿/, '').split('\n').map((l) => l.replace(/\r$/, ''));
  for (let i = 0; i < raw.length; i++) if (raw[i].includes('\t') && /^\s*\t/.test(raw[i]) && !isBlank(raw[i])) raw[i] = raw[i].replace(/^[ \t]+/, (w) => ' '.repeat(w.replace(/\t/g, '  ').length));
  const docs = [];
  let start = 0;
  for (let i = 0; i <= raw.length; i++) {
    const l = raw[i];
    if (i === raw.length || /^(---|\.\.\.)(\s|$)/.test(l ?? '')) {
      const lines = raw.slice(start, i);
      // `--- value` on the marker line itself.
      if (i < raw.length && /^---\s+\S/.test(l)) { raw[i] = l.slice(3).replace(/^\s+/, ''); docs.push(parseDoc(lines, start)); start = i; continue; }
      if (lines.some((x) => !isBlank(x) && !/^%/.test(x))) docs.push(parseDoc(lines, start));
      start = i + 1;
    }
  }
  return docs;
}

function parseDoc(lines, offset) {
  const L = lines.map((l) => (/^%/.test(l) ? '' : l));
  let pos = 0;
  const anchors = new Map();
  const lineNo = (i) => i + offset + 1;
  const skip = () => { while (pos < L.length && isBlank(L[pos])) pos++; };

  /** A value written on one line after `key:` or `- `, possibly continuing on more-indented lines. */
  function inlineValue(text, at, parentIndent) {
    let s = text;
    let anchor = null;
    let m;
    // Tags (!!str, !Ref) and anchors (&name) before a value; an alias (*name) is the value.
    let tag = null;
    while ((m = /^(![^\s]*|&[^\s]+)\s*/.exec(s))) { if (m[1][0] === '&') anchor = m[1].slice(1); else tag = m[1]; s = s.slice(m[0].length); }
    let node;
    if (s[0] === '*' && /^\*[^\s,\]}]+$/.test(s)) {
      const ref = anchors.get(s.slice(1));
      if (!ref) throw new YamlError(`Unknown alias ${s}`, lineNo(at));
      node = ref;
    } else if (!s) {
      node = block(parentIndent, at);
    } else if (s[0] === '|' || s[0] === '>') {
      node = blockScalar(s, at, parentIndent);
    } else if (s[0] === '[' || s[0] === '{') {
      // A flow collection may span several lines: gather until its brackets balance.
      let textAll = s;
      while (!balanced(textAll) && pos < L.length) { textAll += ` ${stripComment(L[pos]).trim()}`; pos++; }
      const p = { s: textAll, i: 0, line: lineNo(at) };
      node = flowValue(p);
      ws(p);
      if (p.i < p.s.length) throw new YamlError(`Unexpected text after a flow collection: ${p.s.slice(p.i, p.i + 20)}`, lineNo(at));
    } else if (s[0] === '"' || s[0] === "'") {
      // A quoted value may continue on the next lines; its line breaks fold into spaces.
      let full = s;
      while (quoteEnd(full, 0) < 0 && pos < L.length) { full += `\n${L[pos].trim()}`; pos++; }
      const end = quoteEnd(full, 0);
      if (end < 0) throw new YamlError('A quoted value is not closed', lineNo(at));
      node = { t: 'str', line: lineNo(at), v: unquote(full.slice(0, end + 1).replace(/[ \t]*\n[ \t]*/g, ' ')), plain: false };
    } else {
      // A plain scalar, continued on following lines that are indented deeper than its parent.
      const parts = [s];
      while (pos < L.length) {
        const n = L[pos];
        if (isBlank(n)) { if (n.trim() === '' && pos + 1 < L.length && !isBlank(L[pos + 1]) && indentOf(L[pos + 1]) > parentIndent) { parts.push(''); pos++; continue; } break; }
        if (indentOf(n) <= parentIndent) break;
        const t = stripComment(n).trim();
        if (keyColon(t) >= 0 || /^- |^-$/.test(t)) break;
        parts.push(t);
        pos++;
      }
      node = { t: 'str', line: lineNo(at), v: parts.length > 1 ? foldLines(parts) : s, plain: true };
    }
    if (tag === '!!str' && node.t === 'str') node = { ...node, plain: false };
    if (anchor) anchors.set(anchor, node);
    return node;
  }

  /** A nested block (mapping or sequence) under a key or dash, or null when nothing is indented under it. */
  function block(parentIndent, at, allowSameIndentSeq = true) {
    skip();
    if (pos >= L.length) return { t: 'str', line: lineNo(at), v: null, plain: true };
    const ind = indentOf(L[pos]);
    const t = L[pos].slice(ind);
    // `key:` followed by a sequence at the same indentation is allowed (`steps:\n- run: x`).
    if (ind > parentIndent || (allowSameIndentSeq && ind === parentIndent && /^-( |$)/.test(t))) return node(ind);
    return { t: 'str', line: lineNo(at), v: null, plain: true };
  }

  function node(ind) {
    skip();
    const t = stripComment(L[pos]).slice(ind);
    if (/^-( |$)/.test(t)) return seq(ind);
    if (keyColon(t) >= 0) return map(ind);
    const at = pos++;
    return inlineValue(t.trim(), at, ind - 1);
  }

  function map(ind) {
    const out = { t: 'map', line: lineNo(pos), entries: [] };
    while (true) {
      skip();
      if (pos >= L.length) break;
      const l = L[pos];
      const li = indentOf(l);
      if (li < ind) break;
      if (li > ind) throw new YamlError('This line is indented more than the lines around it', lineNo(pos));
      const t = stripComment(l).slice(ind);
      const c = keyColon(t);
      if (c < 0) { if (/^-( |$)/.test(t)) break; throw new YamlError(`Expected "key: value", found "${t.slice(0, 40)}"`, lineNo(pos)); }
      const rawKey = t.slice(0, c).trim();
      const key = rawKey[0] === '"' || rawKey[0] === "'" ? unquote(rawKey) : rawKey;
      const at = pos++;
      const rest = t.slice(c + 1).trim();
      const value = rest ? inlineValue(rest, at, ind) : block(ind, at);
      if (key === '<<') { // merge key: copy the referenced mapping's entries
        for (const src of value.t === 'seq' ? value.items : [value]) if (src.t === 'map') for (const e of src.entries) if (!out.entries.some((x) => x.key === e.key)) out.entries.push(e);
        continue;
      }
      out.entries.push({ key, line: lineNo(at), value });
    }
    return out;
  }

  function seq(ind) {
    const out = { t: 'seq', line: lineNo(pos), items: [] };
    while (true) {
      skip();
      if (pos >= L.length) break;
      const l = L[pos];
      const li = indentOf(l);
      if (li !== ind || !/^-( |$)/.test(l.slice(ind))) break;
      const after = l.slice(ind + 1);
      const extra = indentOf(after);
      const rest = stripComment(after).trim();
      if (!rest) { const at = pos++; out.items.push(block(ind, at, false)); continue; }
      // `- key: value` starts a mapping whose keys line up one column after the dash and its spaces.
      const col = ind + 1 + extra;
      if (keyColon(rest) >= 0 || /^-( |$)/.test(rest)) { L[pos] = ' '.repeat(col) + after.slice(extra); out.items.push(node(col)); continue; }
      const at = pos++;
      out.items.push(inlineValue(rest, at, ind));
    }
    return out;
  }

  function blockScalar(head, at, parentIndent) {
    const m = /^([|>])([1-9]?)([-+]?)([1-9]?)\s*$/.exec(head);
    if (!m) throw new YamlError(`Unreadable block scalar header "${head}"`, lineNo(at));
    const folded = m[1] === '>';
    const chomp = m[3] || '';
    const explicit = Number(m[2] || m[4] || 0);
    let contentIndent = explicit ? parentIndent + explicit : 0;
    const body = [];
    let first = null;
    while (pos < L.length) {
      const l = L[pos];
      if (l.trim() === '') { body.push(''); pos++; continue; }
      const li = indentOf(l);
      if (!contentIndent) { if (li <= Math.max(parentIndent, -1)) break; contentIndent = li; }
      if (li < contentIndent) break;
      if (first == null) first = pos;
      body.push(l.slice(contentIndent));
      pos++;
    }
    // Trailing blank lines belong to the scalar only for keep chomping; give the rest back.
    let trailing = 0;
    while (body.length && body[body.length - 1] === '') { body.pop(); trailing++; }
    let text;
    if (!folded) text = body.join('\n');
    else {
      text = '';
      for (let i = 0; i < body.length; i++) {
        const cur = body[i];
        if (i === 0) { text = cur; continue; }
        const prev = body[i - 1];
        const keepBreak = cur === '' || prev === '' || /^\s/.test(cur) || /^\s/.test(prev);
        text += keepBreak ? `\n${cur}` : ` ${cur}`;
      }
      text = text.replace(/\n\n/g, '\n');
    }
    if (body.length) text += chomp === '-' ? '' : chomp === '+' ? '\n'.repeat(trailing + 1) : '\n';
    const leading = first == null ? 0 : body.findIndex((b) => b !== '');
    return { t: 'str', line: lineNo(at), v: text, plain: false, block: folded ? 'folded' : 'literal', valueLine: first == null ? lineNo(at) + 1 : lineNo(first) - Math.max(leading, 0) };
  }

  // ── Flow collections: [a, b] and { a: b } ──────────────────────────────────────────────────────────────
  function balanced(s) {
    let d = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"' || c === "'") { const e = quoteEnd(s, i); if (e < 0) return false; i = e; continue; }
      if (c === '$' && s[i + 1] === '{' && s[i + 2] === '{') { const e = s.indexOf('}}', i + 3); if (e < 0) return false; i = e + 1; continue; }
      if (c === '[' || c === '{') d++;
      else if (c === ']' || c === '}') d--;
    }
    return d <= 0;
  }
  function ws(p) { while (p.i < p.s.length && (p.s[p.i] === ' ' || p.s[p.i] === '\t')) p.i++; }
  function flowScalar(p, stops) {
    ws(p);
    const c = p.s[p.i];
    if (c === '"' || c === "'") {
      const e = quoteEnd(p.s, p.i);
      if (e < 0) throw new YamlError('A quoted value is not closed', p.line);
      const v = unquote(p.s.slice(p.i, e + 1));
      p.i = e + 1;
      return { t: 'str', line: p.line, v, plain: false };
    }
    let out = '';
    while (p.i < p.s.length) {
      const ch = p.s[p.i];
      if (ch === '$' && p.s[p.i + 1] === '{' && p.s[p.i + 2] === '{') { const e = p.s.indexOf('}}', p.i + 3); const end = e < 0 ? p.s.length : e + 2; out += p.s.slice(p.i, end); p.i = end; continue; }
      if (stops.includes(ch)) break;
      if (ch === ':' && (p.s[p.i + 1] === ' ' || p.s[p.i + 1] === ',' || p.s[p.i + 1] === '}' || p.i + 1 === p.s.length) && stops.includes(':')) break;
      out += ch; p.i++;
    }
    return { t: 'str', line: p.line, v: out.trim(), plain: true };
  }
  function flowValue(p) {
    ws(p);
    const c = p.s[p.i];
    if (c === '[') {
      p.i++;
      const out = { t: 'seq', line: p.line, items: [] };
      while (true) {
        ws(p);
        if (p.s[p.i] === ']') { p.i++; return out; }
        if (p.i >= p.s.length) throw new YamlError('A [ list is not closed', p.line);
        const item = p.s[p.i] === '[' || p.s[p.i] === '{' ? flowValue(p) : flowScalar(p, ',]:');
        ws(p);
        if (p.s[p.i] === ':') { p.i++; const v = flowValue(p); out.items.push({ t: 'map', line: p.line, entries: [{ key: item.v, line: p.line, value: v }] }); }
        else out.items.push(item);
        ws(p);
        if (p.s[p.i] === ',') p.i++;
      }
    }
    if (c === '{') {
      p.i++;
      const out = { t: 'map', line: p.line, entries: [] };
      while (true) {
        ws(p);
        if (p.s[p.i] === '}') { p.i++; return out; }
        if (p.i >= p.s.length) throw new YamlError('A { map is not closed', p.line);
        const k = flowScalar(p, ',}:');
        ws(p);
        let v = { t: 'str', line: p.line, v: null, plain: true };
        if (p.s[p.i] === ':') { p.i++; ws(p); v = p.s[p.i] === ',' || p.s[p.i] === '}' ? v : flowValue(p); }
        out.entries.push({ key: k.v, line: p.line, value: v });
        ws(p);
        if (p.s[p.i] === ',') p.i++;
      }
    }
    return flowScalar(p, ',]}');
  }

  skip();
  if (pos >= L.length) return null;
  const root = node(indentOf(L[pos]));
  skip();
  if (pos < L.length) throw new YamlError(`Unexpected text "${L[pos].trim().slice(0, 40)}"`, lineNo(pos));
  return root;
}

// ── Helpers for readers ──────────────────────────────────────────────────────────────────────────────────

/** A scalar as YAML's core schema types it: true/false, null, numbers; quoted text stays text. */
export function scalar(n) {
  if (!n || n.t !== 'str') return undefined;
  if (!n.plain || n.v == null) return n.v;
  const v = n.v;
  if (v === '' || v === '~' || /^null$/i.test(v)) return null;
  if (/^(true|false)$/i.test(v)) return /^true$/i.test(v);
  if (/^[-+]?\d+$/.test(v)) return Number(v);
  if (/^[-+]?(\d+\.\d*|\.\d+|\d+(\.\d*)?[eE][-+]?\d+)$/.test(v)) return Number(v);
  return v;
}

/** The whole node as plain JavaScript values (lines dropped). */
export function toJS(n) {
  if (!n) return null;
  if (n.t === 'map') return Object.fromEntries(n.entries.map((e) => [e.key, toJS(e.value)]));
  if (n.t === 'seq') return n.items.map(toJS);
  return scalar(n);
}

/** A mapping's value node for `key`, or undefined. */
export const get = (n, key) => (n?.t === 'map' ? n.entries.findLast((e) => e.key === key)?.value : undefined);
/** A mapping's entry for `key` (with its line), or undefined. */
export const entry = (n, key) => (n?.t === 'map' ? n.entries.findLast((e) => e.key === key) : undefined);
/** A scalar's text, or undefined for collections and missing nodes. */
export const text = (n) => (n?.t === 'str' && n.v != null ? String(n.v) : undefined);
/** A sequence's items, a single scalar as a one-item list, or []. */
export const list = (n) => (n?.t === 'seq' ? n.items : n?.t === 'str' && n.v != null ? [n] : []);
