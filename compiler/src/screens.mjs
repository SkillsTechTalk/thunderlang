// Screens: React components and Angular components read as what a person sees and does.
//
// A screen is a part of an app's interface: what it receives (props, @Input / input()), what it remembers (useState,
// useReducer, class fields, signals), what it shows (the JSX it returns, or the Angular template), what happens when
// someone acts on it (onClick, (click), …), what runs when it appears or changes (useEffect, ngOnInit), and the events
// it sends (@Output / output()). Everything comes from the code; anything Thunder cannot read is listed as not read,
// never guessed. Browser-safe: no Node APIs (templateUrl files are looked up among the files given).

import { sayCodeCondition, withLanguage } from './steps.mjs';

const words = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const lineAt = (src, i) => src.slice(0, Math.max(0, i)).split('\n').length;
const squash = (s) => String(s).replace(/\s+/g, ' ').trim();
const clip = (s, n = 80) => { s = squash(s); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const SIMPLE_PATH = /^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*|\(\))*$/;

/** A simple path in words: total → "total", item.name → "item's name", order.customer.name → "the name of order's customer". */
export function pathWords(path) {
  const parts = String(path).replace(/\?\./g, '.').replace(/\(\)/g, '').split('.').filter(Boolean).map(words);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[1] === 'length' ? `how many ${parts[0]}` : `${parts[0]}'s ${parts[1]}`;
  return `the ${parts[parts.length - 1]} of ${parts.slice(0, -1).join("'s ")}`;
}

/** A condition in words, with the shapes screens use most said plainly. */
export function conditionWords(code) {
  // (A signal is read by calling it: `todos()` is todos.)
  const c = squash(code).replace(/^\((.*)\)$/, '$1').replace(/\b([a-z]\w*)\(\)/g, '$1');
  let m;
  if ((m = /^!\s*([\w$.?]+)\.length$/.exec(c)) || (m = /^([\w$.?]+)\.length\s*===?\s*0$/.exec(c))) return `${pathWords(m[1])} is empty`;
  if ((m = /^([\w$.?]+)\.length(?:\s*>\s*0)?$/.exec(c))) return `${pathWords(m[1])} is not empty`;
  if ((m = /^!\s*([\w$.?]+)$/.exec(c))) return `not ${pathWords(m[1])}`;
  // A yes/no name reads as itself ("when open"); anything else is "set" when it has a value ("when user is set").
  if (SIMPLE_PATH.test(c)) return /(?:^|\.)(?:is|has|can|should|show|open|visible|loading|enabled|disabled|active|checked|selected|done|ready|expanded|editing|valid)[A-Z\w]*$/.test(c) ? pathWords(c) : `${pathWords(c)} is set`;
  try { return withLanguage('typescript', () => sayCodeCondition(c)); } catch { return `\`${clip(c, 60)}\``; }
}

// ── Scanning code: balanced braces, strings, template literals, and JSX inside expressions ─────────────────────────

/** The index just past the string or template literal starting at i. */
function skipString(src, i) {
  const q = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') { j++; continue; }
    if (q === '`' && src[j] === '$' && src[j + 1] === '{') { j = matchBrace(src, j + 1) ; continue; }
    if (src[j] === q) return j + 1;
  }
  return src.length;
}

/** Could a "<" at i start JSX (not a comparison)? It must follow an operator, a bracket, or `return`, and open a tag. */
function jsxStartsAt(src, i) {
  if (src[i] !== '<' || !/[A-Za-z>]/.test(src[i + 1] ?? '')) return false;
  const before = src.slice(Math.max(0, i - 12), i).replace(/\s+$/, '');
  return before === '' || /(?:[(,{[?:=&|!]|=>|\breturn|\bdefault)$/.test(before);
}

/** The index of the bracket closing the one at i ( { [ ( ), skipping strings, comments, and JSX. */
export function matchBrace(src, i) {
  const open = src[i], close = { '{': '}', '(': ')', '[': ']' }[open];
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '"' || c === "'" || c === '`') { j = skipString(src, j) - 1; continue; }
    if (c === '/' && src[j + 1] === '/') { const e = src.indexOf('\n', j); j = e < 0 ? src.length : e; continue; }
    if (c === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j + 2); j = e < 0 ? src.length : e + 1; continue; }
    if (c === '<' && jsxStartsAt(src, j)) { const r = parseJsx(src, j); if (r) { j = r.end - 1; continue; } }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return j;
  }
  return -1;
}

// ── JSX: a small tolerant parser into a shared tree ──────────────────────────────────────────────────────────────
// Nodes: { type: 'el', tag, attrs: [{ name, value, kind: 'text'|'expr'|'flag'|'spread' }], kids, line }
//        { type: 'text', parts: [string | { expr }], line }
//        { type: 'expr', code, line }   (a {…} child, analyzed later)

export function parseJsx(src, i) {
  if (src[i] !== '<') return null;
  const line = lineAt(src, i);
  let j = i + 1;
  if (src[j] === '>') { // fragment
    const kids = jsxChildren(src, j + 1, '');
    return kids ? { node: { type: 'el', tag: 'Fragment', attrs: [], kids: kids.kids, line }, end: kids.end } : null;
  }
  const tm = /^[A-Za-z][\w.:-]*/.exec(src.slice(j));
  if (!tm) return null;
  const tag = tm[0];
  j += tag.length;
  const attrs = [];
  for (;;) {
    while (/\s/.test(src[j] ?? '')) j++;
    if (j >= src.length) return null;
    if (src.startsWith('/>', j)) return { node: { type: 'el', tag, attrs, kids: [], line }, end: j + 2 };
    if (src[j] === '>') { const kids = jsxChildren(src, j + 1, tag); return kids ? { node: { type: 'el', tag, attrs, kids: kids.kids, line }, end: kids.end } : null; }
    if (src[j] === '{') {
      const e = matchBrace(src, j); if (e < 0) return null;
      const code = src.slice(j + 1, e).trim();
      attrs.push(code.startsWith('...') ? { name: '...', value: code.slice(3), kind: 'spread' } : { name: '?', value: code, kind: 'expr' });
      j = e + 1; continue;
    }
    const am = /^[^\s=/>{]+/.exec(src.slice(j));
    if (!am) return null;
    const name = am[0]; j += name.length;
    while (/\s/.test(src[j] ?? '')) j++;
    if (src[j] !== '=') { attrs.push({ name, value: true, kind: 'flag' }); continue; }
    j++;
    while (/\s/.test(src[j] ?? '')) j++;
    if (src[j] === '"' || src[j] === "'") { const e = src.indexOf(src[j], j + 1); if (e < 0) return null; attrs.push({ name, value: src.slice(j + 1, e), kind: 'text' }); j = e + 1; }
    else if (src[j] === '{') { const e = matchBrace(src, j); if (e < 0) return null; attrs.push({ name, value: src.slice(j + 1, e).trim(), kind: 'expr' }); j = e + 1; }
    else return null;
  }
}

function jsxChildren(src, j, tag) {
  const kids = [];
  let text = [], textLine = lineAt(src, j);
  // (JSX drops whitespace that holds a line break and keeps a single space otherwise: "Hello, {name}".)
  const flush = () => { const t = text.join('').replace(/\s*\n\s*/g, '').replace(/\s+/g, ' '); if (t.trim()) kids.push({ type: 'text', parts: [t], line: textLine }); text = []; };
  while (j < src.length) {
    if (src.startsWith('</', j)) {
      flush();
      const e = src.indexOf('>', j);
      if (e < 0) return null;
      return { kids, end: e + 1 };
    }
    if (src[j] === '<') { flush(); const r = parseJsx(src, j); if (!r) return null; kids.push(r.node); j = r.end; textLine = lineAt(src, j); continue; }
    if (src[j] === '{') {
      flush();
      const e = matchBrace(src, j); if (e < 0) return null;
      const code = src.slice(j + 1, e).trim();
      if (code && !/^\/\*[\s\S]*\*\/$/.test(code)) kids.push({ type: 'expr', code, line: lineAt(src, j) });
      j = e + 1; textLine = lineAt(src, j); continue;
    }
    if (!text.length) textLine = lineAt(src, j);
    text.push(src[j]); j++;
  }
  return null;
}

// ── Angular templates: HTML with Angular's bindings and control flow, into the same tree ────────────────────────────

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** Parse an Angular template (offset: where it starts in the file, for line numbers). */
export function parseTemplate(html, fileSrc = null, offset = 0) {
  const lineOf = (i) => (fileSrc ? lineAt(fileSrc, offset + i) : lineAt(html, i));
  let i = 0;
  const parseNodes = (stopTag, stopBrace) => {
    const out = [];
    let text = '', tl = lineOf(i);
    const flush = () => { if (text.trim()) out.push(textNode(text, tl)); text = ''; };
    while (i < html.length) {
      if (stopBrace && html[i] === '}') { flush(); i++; return out; }
      if (html.startsWith('<!--', i)) { flush(); const e = html.indexOf('-->', i); i = e < 0 ? html.length : e + 3; continue; }
      if (html.startsWith('</', i)) { flush(); const e = html.indexOf('>', i); i = e < 0 ? html.length : e + 1; return out; }
      if (html[i] === '@' && /^@(if|for|switch|defer|else|empty|case|default)\b/.test(html.slice(i))) { flush(); const b = parseBlock(); if (b) out.push(b); tl = lineOf(i); continue; }
      if (html[i] === '<' && /[A-Za-z]/.test(html[i + 1] ?? '')) { flush(); const el = parseElement(); if (el) out.push(el); tl = lineOf(i); continue; }
      if (!text) tl = lineOf(i);
      text += html[i]; i++;
    }
    flush();
    return out;
  };
  const textNode = (t, line) => {
    const parts = [];
    let rest = squash(t), m;
    while ((m = /\{\{\s*([\s\S]*?)\s*\}\}/.exec(rest))) { if (m.index) parts.push(rest.slice(0, m.index)); parts.push({ expr: m[1] }); rest = rest.slice(m.index + m[0].length); }
    if (rest) parts.push(rest);
    return { type: 'text', parts, line };
  };
  const parseElement = () => {
    const line = lineOf(i);
    const tm = /^<([A-Za-z][\w:-]*)/.exec(html.slice(i));
    const tag = tm[1];
    i += tm[0].length;
    const attrs = [];
    for (;;) {
      while (/\s/.test(html[i] ?? '')) i++;
      if (i >= html.length) break;
      if (html.startsWith('/>', i)) { i += 2; return { type: 'el', tag, attrs, kids: [], line }; }
      if (html[i] === '>') { i++; break; }
      const am = /^[^\s=/>]+/.exec(html.slice(i));
      if (!am) { i++; continue; }
      const name = am[0]; i += name.length;
      while (/\s/.test(html[i] ?? '')) i++;
      if (html[i] !== '=') { attrs.push({ name, value: true, kind: 'flag' }); continue; }
      i++;
      while (/\s/.test(html[i] ?? '')) i++;
      let value;
      if (html[i] === '"' || html[i] === "'") { const e = html.indexOf(html[i], i + 1); value = html.slice(i + 1, e < 0 ? html.length : e); i = e < 0 ? html.length : e + 1; }
      else { const vm = /^[^\s>]+/.exec(html.slice(i)); value = vm ? vm[0] : ''; i += value.length; }
      // [prop], (event), [(two-way)], *structural are bindings: the value is code. Plain attributes are text.
      attrs.push({ name, value, kind: /^[[(*]/.test(name) ? 'expr' : 'text' });
    }
    const kids = VOID.has(tag.toLowerCase()) ? [] : parseNodes(tag, false);
    return { type: 'el', tag, attrs, kids, line };
  };
  const parseBlock = () => {
    const line = lineOf(i);
    const m = /^@(\w+)\s*(?:\(([^)]*(?:\([^)]*\)[^)]*)*)\))?\s*\{/.exec(html.slice(i));
    if (!m) { const e = html.indexOf('\n', i); i = e < 0 ? html.length : e; return null; }
    i += m[0].length;
    const body = parseNodes(null, true);
    return { type: 'block', kind: m[1], head: (m[2] ?? '').trim(), kids: body, line };
  };
  const nodes = parseNodes(null, false);
  // Join @if / @else if / @else and @for / @empty into one node each.
  const join = (list) => {
    const out = [];
    for (const n of list) {
      if (n.type === 'el') { n.kids = join(n.kids); out.push(n); continue; }
      if (n.type !== 'block') { out.push(n); continue; }
      n.kids = join(n.kids);
      const prev = out[out.length - 1];
      if (n.kind === 'else' && prev?.type === 'cond') {
        let tail = prev; while (tail.otherwise?.length === 1 && tail.otherwise[0].type === 'cond') tail = tail.otherwise[0];
        const ei = /^if\s*\((.*)\)$/s.exec(n.head) || (/^if\b/.test(n.head) ? [null, n.head.replace(/^if\s*/, '')] : null);
        tail.otherwise = ei ? [{ type: 'cond', test: ei[1], then: n.kids, otherwise: null, line: n.line }] : n.kids;
        continue;
      }
      if (n.kind === 'empty' && prev?.type === 'each') { prev.empty = n.kids; continue; }
      if (n.kind === 'if') { out.push({ type: 'cond', test: n.head.replace(/;\s*as\s+\w+$/, ''), then: n.kids, otherwise: null, line: n.line }); continue; }
      if (n.kind === 'for') {
        const f = /^(?:let\s+)?(\w+)\s+of\s+([^;]+)/.exec(n.head);
        out.push(f ? { type: 'each', item: f[1], list: f[2].trim(), body: n.kids, line: n.line } : { type: 'unread', code: `@for (${n.head})`, why: 'a loop Thunder does not read yet', line: n.line });
        continue;
      }
      out.push({ type: 'unread', code: `@${n.kind} (${n.head})`, why: `an @${n.kind} block, not read yet`, line: n.line, kids: n.kids });
    }
    return out;
  };
  return join(nodes);
}

// ── Turning the tree into what a person sees ─────────────────────────────────────────────────────────────────────

const CONTAINERS = new Set(['div', 'span', 'section', 'main', 'article', 'aside', 'Fragment', 'React.Fragment', 'ng-container', 'ng-template', 'template', 'body', 'html']);
const INLINE = new Set(['strong', 'em', 'b', 'i', 'small', 'code', 'mark', 'u', 'sup', 'sub', 'abbr', 'time']);
const SKIP = new Set(['br', 'hr', 'wbr', 'script', 'style', 'meta', 'link']);
const TAG_WORDS = {
  h1: 'a heading', h2: 'a heading', h3: 'a heading', h4: 'a heading', h5: 'a heading', h6: 'a heading',
  p: 'a paragraph', button: 'a button', a: 'a link', img: 'an image', textarea: 'a text area', select: 'a dropdown',
  option: 'a choice', label: 'a label', li: 'a row', tr: 'a row', td: 'a cell', th: 'a column heading', table: 'a table',
  ul: 'a list', ol: 'a numbered list', form: 'a form', nav: 'a navigation bar', header: 'a header', footer: 'a footer',
  svg: 'a drawing', video: 'a video', audio: 'a sound player', dialog: 'a dialog', iframe: 'an embedded page', progress: 'a progress bar',
  thead: 'the table heading', tbody: 'the table rows', fieldset: 'a group of fields', legend: 'a group title', blockquote: 'a quote', pre: 'a block of code',
  'router-outlet': 'the page for the current address',
};
const INPUT_WORDS = { checkbox: 'a checkbox', radio: 'a choice button', submit: 'a submit button', email: 'an email box', password: 'a password box', number: 'a number box', search: 'a search box', date: 'a date box', file: 'a file picker', range: 'a slider', tel: 'a phone box', url: 'an address box', hidden: null, color: 'a color picker' };
const EVENT_WORDS = { click: 'is pressed', dblclick: 'is double-clicked', change: 'changes', input: 'is typed in', submit: 'is sent', ngsubmit: 'is sent', keydown: 'gets a key press', keyup: 'gets a key press', keypress: 'gets a key press', blur: 'is left', focus: 'is chosen', mouseenter: 'is pointed at', mouseleave: 'is no longer pointed at', scroll: 'is scrolled', load: 'loads', select: 'is selected' };

const attr = (el, ...names) => el.attrs.find((a) => names.includes(a.name));
const attrText = (el, ...names) => { const a = attr(el, ...names); return a && a.kind === 'text' ? a.value : null; };

/**
 * Describe a screen's tree. ctx: { framework, screensByName, selectors, members, state, inputs, outputs, notRead, events }.
 * Gives back outline lines: [{ says, line, kids? }].
 */
function describe(nodes, ctx) {
  const out = [];
  for (const n of nodes) {
    if (n.type === 'text') { const t = textWords(n.parts, ctx); if (t) out.push({ says: `text: ${t}`, line: n.line }); continue; }
    if (n.type === 'expr') { out.push(...exprChild(n, ctx)); continue; }
    if (n.type === 'cond') { out.push(condLine(n.test, describe(n.then, ctx), n.otherwise ? describe(n.otherwise, ctx) : null, n.line, ctx)); continue; }
    if (n.type === 'each') { out.push(eachLine(n, describe(n.body, ctx), n.empty ? describe(n.empty, ctx) : null)); continue; }
    if (n.type === 'unread') { ctx.notRead.push({ line: n.line, code: clip(n.code), why: n.why }); out.push({ says: `not read: \`${clip(n.code, 60)}\``, line: n.line, notRead: true, code: clip(n.code, 60) }); continue; }
    if (n.type === 'el') out.push(...elementLines(n, ctx));
  }
  return out;
}

function elementLines(el, ctx) {
  // Angular structural directives wrap the element they sit on.
  const ngIf = attr(el, '*ngIf');
  if (ngIf) {
    const [test, elseRef] = String(ngIf.value).split(/;\s*else\s+/);
    const inner = { ...el, attrs: el.attrs.filter((a) => a !== ngIf) };
    if (elseRef) ctx.notRead.push({ line: el.line, code: `*ngIf="${clip(ngIf.value, 50)}"`, why: 'the "else" template is elsewhere; it is not shown here' });
    return [condLine(test.trim(), elementLines(inner, ctx), null, el.line, ctx)];
  }
  const ngFor = attr(el, '*ngFor');
  if (ngFor) {
    const m = /^\s*let\s+(\w+)\s+of\s+([^;]+)/.exec(String(ngFor.value));
    const inner = { ...el, attrs: el.attrs.filter((a) => a !== ngFor) };
    if (!m) { ctx.notRead.push({ line: el.line, code: `*ngFor="${clip(ngFor.value, 50)}"`, why: 'a repeat Thunder does not read yet' }); return [{ says: `not read: \`*ngFor="${clip(ngFor.value, 40)}"\``, line: el.line, notRead: true, code: `*ngFor="${clip(ngFor.value, 40)}"` }]; }
    return [eachLine({ item: m[1], list: m[2].trim(), line: el.line }, elementLines(inner, ctx))];
  }
  const otherStructural = el.attrs.find((a) => /^\*/.test(a.name));
  if (otherStructural) ctx.notRead.push({ line: el.line, code: `${otherStructural.name}="${clip(otherStructural.value, 40)}"`, why: 'a directive Thunder does not read yet' });
  for (const a of el.attrs) if (a.kind === 'spread') ctx.notRead.push({ line: el.line, code: `{...${clip(a.value, 40)}}`, why: 'spread props: which values they hold is not known here' });

  const tag = el.tag;
  if (SKIP.has(tag)) return [];
  const kids = describe(el.kids.filter((k) => !(k.type === 'el' && INLINE.has(k.tag))), ctx);
  if (CONTAINERS.has(tag) && !eventsOf(el, ctx, 'it').length) return kids;
  const what = elementWhat(el, ctx);
  if (!what) return kids;
  const label = elementLabel(el, ctx);
  const labelFromText = label != null && !attrText(el, 'aria-label', 'alt', 'placeholder', 'title', 'name');
  const extra = [];
  const disabled = attr(el, 'disabled', '[disabled]');
  if (disabled?.kind === 'expr') extra.push(`turned off when ${conditionWords(disabled.value)}`);
  else if (disabled?.kind === 'flag') extra.push('turned off');
  const shown = attr(el, 'value', '[value]', 'checked', '[checked]', '[(ngModel)]', '[ngModel]', 'v-model');
  if (shown?.kind === 'expr' && SIMPLE_PATH.test(String(shown.value).trim())) extra.push(`${/ngModel/.test(shown.name) && shown.name.startsWith('[(') ? 'showing and changing' : 'showing'} ${pathWords(shown.value.trim())}`);
  const to = attrText(el, 'href', 'routerLink', 'to') ?? (attr(el, '[routerLink]', 'to')?.kind === 'expr' ? `«${clip(attr(el, '[routerLink]', 'to').value, 40)}»` : null);
  if (to && (tag === 'a' || attr(el, 'routerLink', '[routerLink]'))) extra.push(`to ${to}`);
  const evs = eventsOf(el, ctx, label ?? what.replace(/^an? /, 'the '));
  const says = `${what}${label ? `: ${label}` : ''}${extra.length ? ` (${extra.join('; ')})` : ''}${evs.length ? `; when it ${evs.map((e) => `${e.verb}: ${e.runs}`).join('; when it ')}` : ''}`;
  const keepKids = labelFromText ? kids.filter((k) => !k.says.startsWith('text: ')) : kids;
  return [{ says, line: el.line, ...(keepKids.length ? { kids: keepKids } : {}) }];
}

/** What an element is, in words: a heading, a button, the Cart screen, … (null for a plain container). */
function elementWhat(el, ctx) {
  const tag = el.tag;
  if (tag === 'input') { const type = (attrText(el, 'type') ?? 'text').toLowerCase(); return type in INPUT_WORDS ? INPUT_WORDS[type] : 'a text box'; }
  if (TAG_WORDS[tag]) return TAG_WORDS[tag];
  const screen = /^[A-Z]/.test(tag) ? ctx.screensByName.get(tag.split('.').pop()) : ctx.selectors.get(tag);
  if (screen) { ctx.uses.add(screen.name); return `the ${screen.label} screen`; }
  if (/^[A-Z]/.test(tag)) { ctx.uses.add(tag); return `the ${tag} component`; }
  if (tag.includes('-')) { ctx.uses.add(tag); return `the <${tag}> element`; }
  return null;
}

/** An element's visible words: its text, or what describes it (alt, placeholder, aria-label, a label's text). */
function elementLabel(el, ctx) {
  const inline = (kids) => kids.flatMap((k) => (k.type === 'text' ? k.parts : k.type === 'el' && INLINE.has(k.tag) ? inline(k.kids) : k.type === 'expr' && SIMPLE_PATH.test(k.code) ? [{ expr: k.code }] : []));
  const parts = inline(el.kids);
  const hasOther = el.kids.some((k) => (k.type === 'el' && !INLINE.has(k.tag)) || (k.type === 'expr' && !SIMPLE_PATH.test(k.code)));
  if (parts.length && !hasOther) return textWords(parts, ctx);
  const a = attrText(el, 'aria-label', 'alt', 'placeholder', 'title', 'name');
  return a ? `"${a}"` : null;
}

function textWords(parts, ctx) {
  const t = parts.map((p) => (typeof p === 'string' ? p : SIMPLE_PATH.test(squash(p.expr)) ? `{${pathWords(squash(p.expr))}}` : `{${clip(p.expr, 40)}}`)).join('').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return parts.length === 1 && typeof parts[0] === 'string' ? `"${t}"` : `"${t}"`;
}

/** The events on an element: each with the words for what happens and what runs. */
function eventsOf(el, ctx, who) {
  const out = [];
  for (const a of el.attrs) {
    let name = null;
    if (/^on[A-Z]/.test(a.name) && a.kind === 'expr') name = a.name.slice(2).toLowerCase();
    else if (/^\(([\w.]+)\)$/.test(a.name)) name = a.name.slice(1, -1).toLowerCase().split('.')[0];
    if (!name) continue;
    const verb = EVENT_WORDS[name] ?? `gets "${name}"`;
    const runs = handlerWords(String(a.value), ctx);
    out.push({ verb, runs });
    ctx.events.push({ on: who, event: name, when: `When ${who} ${verb}`, runs: runs.text ?? runs, line: el.line, ...(runs.member ? { member: runs.member } : {}) });
  }
  return out.map((e) => ({ verb: e.verb, runs: e.runs.text ?? e.runs }));
}

/** What a handler does, in words: runs checkout, sets coupon to the typed value, sends the checkout event, … */
function handlerWords(code, ctx) {
  let c = squash(code).replace(/;$/, '');
  // `() => x`, `(e) => x`, `e => { x; y }` → the body.
  const arrow = /^(?:async\s*)?(?:\(([^)]*)\)|(\w+))\s*=>\s*([\s\S]+)$/.exec(c);
  if (arrow) c = arrow[3].replace(/^\{([\s\S]*)\}$/, '$1').trim().replace(/;$/, '');
  const statements = c.split(/;\s*/).filter(Boolean);
  const said = statements.map((s) => statementWords(s.trim(), ctx));
  if (said.some((s) => s == null)) { ctx.notRead.push({ line: null, code: clip(code), why: 'an event handler Thunder does not read yet' }); return { text: `runs \`${clip(code, 50)}\`` }; }
  const member = statements.length === 1 ? said[0].member : null;
  return { text: said.map((s) => s.text).join(', then '), ...(member ? { member } : {}) };
}

function statementWords(s, ctx) {
  let m;
  // A named handler given as is: onClick={checkout} / (click)="checkout()".
  if (SIMPLE_PATH.test(s) || (m = /^([\w$.]+)\(\)$/.exec(s))) {
    const name = (m ? m[1] : s).replace(/\(\)$/, '').replace(/^this\./, '');
    if (ctx.outputs.has(name.replace(/\.emit$/, ''))) return { text: `sends the ${words(name.replace(/\.emit$/, ''))} event` };
    if (ctx.inputs.has(name)) return { text: `tells the parent (${words(name)})` };
    return { text: `runs ${words(name.split('.').pop())}`, member: ctx.memberOf(name.split('.').pop()) };
  }
  // setX(value): the state setter of x.
  if ((m = /^(set[A-Z]\w*)\(([\s\S]*)\)$/.exec(s)) && ctx.setters.has(m[1])) {
    const target = ctx.setters.get(m[1]);
    const v = m[2].trim();
    return { text: `sets ${words(target)} to ${valueWords(v, target)}` };
  }
  // signal.set(v) / signal.update(fn).
  if ((m = /^(?:this\.)?(\w+)\.(set|update)\(([\s\S]*)\)$/.exec(s)) && ctx.stateNames.has(m[1])) return { text: m[2] === 'set' ? `sets ${words(m[1])} to ${valueWords(m[3].trim(), m[1])}` : `changes ${words(m[1])}` };
  // output.emit(x) / props callback(x).
  if ((m = /^(?:this\.)?(\w+)\.emit\(([\s\S]*)\)$/.exec(s)) && ctx.outputs.has(m[1])) return { text: `sends the ${words(m[1])} event${m[2].trim() ? ` with ${valueWords(m[2].trim())}` : ''}` };
  if ((m = /^(?:this\.)?(\w+)\(([\s\S]*)\)$/.exec(s))) {
    const args = m[2].trim();
    if (ctx.inputs.has(m[1])) return { text: `tells the parent (${words(m[1])})${args ? ` with ${valueWords(args)}` : ''}` };
    if (/^[\w$.]*$|^[\w$.]+(?:,\s*[\w$.]+)*$/.test(args)) return { text: `runs ${words(m[1])}${args ? ` with ${args.split(/,\s*/).map((a) => valueWords(a)).join(' and ')}` : ''}`, member: ctx.memberOf(m[1]) };
    return null;
  }
  // x = value (Angular templates assign fields).
  if ((m = /^(?:this\.)?(\w+)\s*=\s*([^=][\s\S]*)$/.exec(s))) return { text: `sets ${words(m[1])} to ${valueWords(m[2].trim(), m[1])}` };
  return null;
}

function valueWords(v, target = null) {
  const s = squash(v).replace(/\b([a-z]\w*)\(\)/g, '$1');
  if (/^(?:e|event|ev|\$event)\.target\.(?:value|checked)$/.test(s) || s === '$event') return 'what was typed or chosen';
  if (/^["'`]/.test(s)) return `"${s.slice(1, -1)}"`;
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  if (s === 'true') return 'yes'; if (s === 'false') return 'no';
  if (s === 'null' || s === 'undefined') return 'nothing';
  if (s === '[]') return 'an empty list'; if (s === '{}') return 'nothing yet';
  if (target && (m2(s, target))) return m2(s, target);
  if (SIMPLE_PATH.test(s)) return pathWords(s);
  return `\`${clip(s, 40)}\``;
}
function m2(s, target) {
  // count + 1, !open, prev => prev + 1
  let m;
  if ((m = new RegExp(`^(?:\\(?\\w+\\)?\\s*=>\\s*)?(?:${target}|\\w+)\\s*([+-])\\s*(\\d+)$`).exec(s))) return `${words(target)} ${m[1] === '+' ? 'plus' : 'minus'} ${m[2]}`;
  if ((m = new RegExp(`^!\\s*${target}$`).exec(s))) return `the opposite of ${words(target)}`;
  return null;
}

/** A {…} child in JSX: a condition, a list, a value shown as text, or not read. */
function exprChild(n, ctx) {
  let c = n.code.trim();
  while (/^\(/.test(c) && matchBrace(c, 0) === c.length - 1) c = c.slice(1, -1).trim();
  const jsxIn = (code) => {
    const t = code.trim().replace(/^\(([\s\S]*)\)$/, '$1').trim();
    if (t === 'null' || t === 'undefined' || t === 'false' || t === "''" || t === '""') return [];
    if (t.startsWith('<')) { const r = parseJsx(t, 0); return r ? describe([shiftLines(r.node, n.line - 1)], ctx) : null; }
    if (/^["'`]/.test(t) && skipString(t, 0) === t.length) return [{ says: `text: "${t.slice(1, -1)}"`, line: n.line }];
    if (SIMPLE_PATH.test(t)) return [{ says: `text: {${pathWords(t)}}`, line: n.line }];
    return null;
  };
  // cond && <X/>
  const and = topLevelSplit(c, '&&');
  if (and && /^\s*\(?\s*</.test(and[1])) { const then = jsxIn(and[1]); if (then) return [condLine(and[0], then, null, n.line, ctx)]; }
  // cond ? A : B
  const tern = ternary(c);
  if (tern) { const a = jsxIn(tern[1]), b = jsxIn(tern[2]); if (a && b) return [condLine(tern[0], a, b.length ? b : null, n.line, ctx)]; }
  // list.map((item) => <X/>)
  const mp = /^([\s\S]+?)\.map\(\s*(?:\(\s*(\w+)(?:\s*,\s*\w+)?\s*\)|(\w+))\s*=>\s*([\s\S]+)\)$/.exec(c);
  if (mp) {
    let body = mp[4].trim();
    const block = /^\{\s*return\s+([\s\S]*?);?\s*\}$/.exec(body);
    if (block) body = block[1];
    const kids = jsxIn(body);
    if (kids) return [eachLine({ item: mp[2] ?? mp[3], list: mp[1].trim(), line: n.line }, kids)];
  }
  if (SIMPLE_PATH.test(c)) return [{ says: `text: {${pathWords(c)}}`, line: n.line }];
  ctx.notRead.push({ line: n.line, code: clip(c), why: 'an expression in what it shows that Thunder does not read yet' });
  return [{ says: `not read: \`{${clip(c, 60)}}\``, line: n.line, notRead: true, code: `{${clip(c, 60)}}` }];
}

function topLevelSplit(c, op) {
  let depth = 0;
  for (let i = 0; i < c.length - 1; i++) {
    const ch = c[i];
    if (ch === '"' || ch === "'" || ch === '`') { i = skipString(c, i) - 1; continue; }
    if (ch === '<' && jsxStartsAt(c, i)) return null; // JSX before the operator: not this shape
    if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--;
    else if (depth === 0 && c.startsWith(op, i)) return [c.slice(0, i).trim(), c.slice(i + op.length).trim()];
  }
  return null;
}

function ternary(c) {
  let depth = 0, q = -1;
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (ch === '"' || ch === "'" || ch === '`') { i = skipString(c, i) - 1; continue; }
    if (ch === '<' && jsxStartsAt(c, i)) { const r = parseJsx(c, i); if (r) { i = r.end - 1; continue; } }
    if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--;
    else if (depth === 0 && ch === '?' && c[i + 1] !== '.' && c[i + 1] !== '?' && q < 0) q = i;
    else if (depth === 0 && ch === ':' && q >= 0) return [c.slice(0, q).trim(), c.slice(q + 1, i).trim(), c.slice(i + 1).trim()];
  }
  return null;
}

function condLine(test, then, otherwise, line, ctx) {
  const words0 = conditionWords(test);
  const line0 = { says: `when ${words0}, it shows:`, line, kids: then.length ? then : [{ says: 'nothing', line }] };
  if (otherwise) return { ...line0, otherwise: { says: 'otherwise, it shows:', line, kids: otherwise } };
  return line0;
}

function eachLine(n, kids, empty = null) {
  const list = SIMPLE_PATH.test(n.list) ? pathWords(n.list) : `\`${clip(n.list, 40)}\``;
  return { says: `one of these per ${words(n.item)} in ${list}:`, line: n.line, kids, ...(empty ? { otherwise: { says: `when ${list} is empty, it shows:`, line: n.line, kids: empty } } : {}) };
}

// ── Finding screens in a file ────────────────────────────────────────────────────────────────────────────────────

/** React components in a TS/JS file: capitalized functions or arrows that return JSX. */
function reactComponents(src) {
  const out = [];
  const seen = new Set();
  const re = /(?:^|\n)[ \t]*(?:export\s+(?:default\s+)?)?(?:function\s+([A-Z]\w*)\s*(?:<[^>]*>)?\s*\(|(?:const|let)\s+([A-Z]\w*)\s*(?::[^=\n]+)?=\s*(?:(?:React\.)?(?:memo|forwardRef)\s*(?:<[^>]*>)?\(\s*)?(?:function\s*\w*\s*)?(?:async\s*)?(?:<[^>]*>)?\()/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1] ?? m[2];
    const pOpen = m.index + m[0].length - 1;
    const pClose = matchBrace(src, pOpen);
    if (pClose < 0) continue;
    let j = pClose + 1;
    const ret = /^\s*(?::\s*[^={]+?)?\s*(=>)?\s*/.exec(src.slice(j));
    j += ret[0].length;
    let body, bodyStart, exprBody = false;
    if (src[j] === '{') { const e = matchBrace(src, j); if (e < 0) continue; body = src.slice(j + 1, e); bodyStart = j + 1; }
    else if (ret[1]) {
      // An arrow whose body is one expression: `(…) => (<div/>)` or `=> <div/>`.
      if (src[j] === '(') { const e = matchBrace(src, j); if (e < 0) continue; body = `return ${src.slice(j, e + 1)};`; bodyStart = j - 7; }
      else if (src[j] === '<') { const r = parseJsx(src, j); if (!r) continue; body = `return ${src.slice(j, r.end)};`; bodyStart = j - 7; }
      else continue;
      exprBody = true;
    } else continue;
    if (!/\breturn\s*\(?\s*</.test(body)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, params: src.slice(pOpen + 1, pClose), body, bodyStart, start: m.index + (src[m.index] === '\n' ? 1 : 0), end: bodyStart + body.length, exprBody });
  }
  return out;
}

/** Top-level statements of a function body (by ; and newlines at depth 0), with their offsets. */
function topStatements(body) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(body, i) - 1; continue; }
    if (c === '/' && body[i + 1] === '/') { const e = body.indexOf('\n', i); i = e < 0 ? body.length : e; continue; }
    if (c === '<' && jsxStartsAt(body, i)) { const r = parseJsx(body, i); if (r) { i = r.end - 1; continue; } }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { depth--; if (depth === 0 && c === '}') { const rest = body.slice(i + 1).match(/^\s*(else\b)?/); if (!rest[1] && !/^\s*[).,;:?]/.test(body.slice(i + 1))) { out.push({ text: body.slice(start, i + 1).trim(), at: start }); start = i + 1; } } }
    else if (depth === 0 && c === ';') { out.push({ text: body.slice(start, i).trim(), at: start }); start = i + 1; }
  }
  if (body.slice(start).trim()) out.push({ text: body.slice(start).trim(), at: start });
  return out.filter((s) => s.text);
}

function startWords(init) {
  const s = squash(init ?? '');
  if (!s || s === 'undefined') return 'nothing';
  return valueWords(s);
}

/** A TypeScript type in words, for props and inputs. */
function typeWords(t) {
  const s = squash(t ?? '').replace(/;$/, '');
  if (!s) return null;
  if (/=>/.test(s)) return 'an action to run';
  if (s === 'string') return 'text';
  if (/^\[\s*\]$/.test(s)) return 'a list';
  if (s === 'number') return 'a number';
  if (s === 'boolean') return 'yes or no';
  let m;
  if ((m = /^(\w+)\[\]$/.exec(s)) || (m = /^(?:Array|ReadonlyArray)<(\w+)>$/.exec(s))) return `a list of ${typeWords(m[1])?.replace(/^an? /, '') ?? m[1]}`;
  if ((m = /^(.+?)\s*\|\s*(?:null|undefined)$/.exec(s))) return `${typeWords(m[1]) ?? m[1]}, or nothing`;
  if (/^['"]/.test(s)) return `one of ${s.split('|').map((x) => x.trim()).join(', ')}`;
  return /^[A-Z]/.test(s) ? `a ${s}` : s;
}

/** Fields of an interface or type alias in the file: name → { type, optional }. */
function typeFields(src, typeName) {
  const m = new RegExp(`(?:interface\\s+${typeName}\\b[^{]*|type\\s+${typeName}\\s*=\\s*)\\{`).exec(src);
  if (!m) return null;
  const open = m.index + m[0].length - 1, close = matchBrace(src, open);
  if (close < 0) return null;
  const fields = new Map();
  for (const f of src.slice(open + 1, close).split(/[;\n]/)) {
    const fm = /^\s*(?:readonly\s+)?(\w+)(\?)?\s*:\s*(.+?)\s*,?\s*$/.exec(f);
    if (fm) fields.set(fm[1], { type: fm[3], optional: !!fm[2] });
  }
  return fields;
}

function reactScreen(file, src, comp, ctxBase) {
  const ctx = { ...ctxBase, notRead: [], events: [], uses: new Set(), setters: new Map(), stateNames: new Set(), inputs: new Set(), outputs: new Set() };
  const line0 = lineAt(src, comp.start);
  // Inputs: destructured props, or props.x, with types from the props type when the file declares it.
  const inputs = [];
  const p = comp.params.trim();
  const typed = /:\s*([A-Z]\w*)\s*$/.exec(p.replace(/=\s*\{\s*\}\s*$/, '').trim());
  const fcType = /:\s*(?:React\.)?FC<\s*(\w+)\s*>/.exec(src.slice(comp.start, comp.start + 200));
  const fields = typeFields(src, typed?.[1] ?? fcType?.[1] ?? `${comp.name}Props`) ?? new Map();
  const destr = /^\{([\s\S]*)\}/.exec(p);
  if (destr) {
    for (const part of destr[1].split(',').map((x) => x.trim()).filter(Boolean)) {
      if (part.startsWith('...')) { ctx.notRead.push({ line: line0, code: `{${clip(part)}}`, why: 'the rest of its props are passed on without names' }); continue; }
      const nm = /^(\w+)(?:\s*:\s*\w+)?(?:\s*=\s*([\s\S]+))?$/.exec(part);
      if (nm) inputs.push({ name: nm[1], ...(nm[2] ? { start: startWords(nm[2]) } : {}) });
    }
  } else if (/^(\w+)/.test(p)) {
    const pn = /^(\w+)/.exec(p)[1];
    const used = [...new Set([...comp.body.matchAll(new RegExp(`\\b${pn}\\.(\\w+)`, 'g'))].map((x) => x[1]))];
    inputs.push(...used.filter((u) => u !== 'children' || true).map((name) => ({ name })));
  }
  for (const i of inputs) {
    const f = fields.get(i.name);
    i.label = words(i.name);
    if (f) { i.kind = typeWords(f.type); if (f.optional) i.optional = true; }
    if (/^on[A-Z]/.test(i.name) || i.kind === 'an action to run') i.callback = true;
    ctx.inputs.add(i.name);
  }
  // State, context, and hooks.
  const state = [];
  const effects = [];
  const early = [];
  let main = null;
  for (const st of topStatements(comp.body)) {
    const t = st.text, line = lineAt(src, comp.bodyStart + st.at + (comp.body.slice(st.at).length - comp.body.slice(st.at).trimStart().length));
    let m;
    if ((m = /^(?:const|let)\s+\[\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*(?:React\.)?useState(?:<[^>]*>)?\(([\s\S]*)\)$/.exec(t))) { state.push({ name: m[1], label: words(m[1]), start: startWords(m[3]), how: 'useState', line }); ctx.setters.set(m[2], m[1]); ctx.stateNames.add(m[1]); continue; }
    if ((m = /^(?:const|let)\s+\[\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*(?:React\.)?useReducer\(\s*(\w+)\s*,\s*([\s\S]*)\)$/.exec(t))) { state.push({ name: m[1], label: words(m[1]), start: startWords(m[4]), how: `useReducer (changed by ${words(m[3])} when ${words(m[2])} is called)`, line }); ctx.stateNames.add(m[1]); continue; }
    if ((m = /^(?:const|let)\s+(\w+|\{[^}]*\})\s*=\s*(?:React\.)?useContext\(\s*(\w+)\s*\)$/.exec(t))) { state.push({ name: m[1], label: words(m[1].replace(/[{}]/g, '')), start: `from the app's ${words(m[2].replace(/Context$/, ''))}`, how: 'useContext', line }); continue; }
    if ((m = /^(?:const|let)\s+(\w+)\s*=\s*(?:React\.)?useMemo\(\s*\(\)\s*=>\s*([\s\S]+?),\s*\[[^\]]*\]\s*\)$/.exec(t))) { state.push({ name: m[1], label: words(m[1]), start: `worked out from ${valueWords(m[2])}`, how: 'useMemo', line }); continue; }
    if ((m = /^(?:const|let)\s+(\w+|\{[^}]*\}|\[[^\]]*\])\s*=\s*(use[A-Z]\w*)\(([\s\S]*)\)$/.exec(t)) && !/^use(State|Reducer|Context|Memo|Callback|Ref|Effect|LayoutEffect)$/.test(m[2])) { state.push({ name: m[1], label: words(m[1].replace(/[{}[\]]/g, '')), start: `from ${words(m[2])}`, how: m[2], line }); continue; }
    if ((m = /^(?:React\.)?use(?:Layout)?Effect\(\s*(?:async\s*)?\(\)\s*=>\s*([\s\S]*?)(?:,\s*\[([^\]]*)\])?\s*\)$/.exec(t))) {
      const deps = m[2] == null ? null : m[2].split(',').map((x) => x.trim()).filter(Boolean);
      const when = deps == null ? 'After every change' : deps.length ? `When ${deps.map((d) => pathWords(d)).join(' or ')} changes` : 'When the screen first shows';
      const bodyText = m[1].trim().replace(/^\{([\s\S]*)\}$/, '$1');
      const runs = topStatements(bodyText).map((s) => statementWords(s.text.replace(/^await\s+/, ''), ctx));
      effects.push({ when, runs: runs.every(Boolean) && runs.length ? runs.map((r) => r.text).join(', then ') : `runs \`${clip(bodyText, 60)}\``, line });
      if (!runs.every(Boolean)) ctx.notRead.push({ line, code: clip(bodyText), why: 'what this effect does is not read yet' });
      continue;
    }
    if ((m = /^if\s*\(([\s\S]+?)\)\s*(?:\{\s*)?return\s+([\s\S]*?);?\s*\}?$/.exec(t)) && !main) {
      const r = m[2].trim();
      const shows = r === 'null' || r === '' ? [] : r.replace(/^\(([\s\S]*)\)$/, '$1').trim().startsWith('<') ? (() => { const x = parseJsx(r.replace(/^\(([\s\S]*)\)$/, '$1').trim(), 0); return x ? describe([shiftLines(x.node, line - 1)], ctx) : null; })() : null;
      if (shows) { early.push({ when: conditionWords(m[1]), shows, line }); continue; }
    }
    if ((m = /^return\s*\(?\s*</.exec(t))) {
      const lead = comp.body.slice(st.at).length - comp.body.slice(st.at).trimStart().length;
      const at = comp.bodyStart + st.at + lead + t.indexOf('<');
      const r = parseJsx(src, at);
      if (r) main = describe([r.node], ctx);
      else ctx.notRead.push({ line, code: clip(t), why: 'what it shows could not be read' });
    }
  }
  return {
    framework: 'react', name: comp.name, label: cap(words(comp.name)), file, lines: [line0, lineAt(src, comp.end)],
    inputs, state, shows: main ?? [], ...(early.length ? { early } : {}), events: ctx.events, effects, outputs: [],
    uses: [...ctx.uses], notRead: ctx.notRead,
  };
}

/** Shift the line numbers of a tree parsed from a slice (so they match the file). */
function shiftLines(node, by) {
  const s = (n) => { if (n.line) n.line += by; for (const k of n.kids ?? []) s(k); return n; };
  return s(node);
}

/** Angular @Component classes in a file. `files` gives templateUrl files by path. */
function angularComponents(file, src, files) {
  const out = [];
  const re = /@Component\s*\(\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1, close = matchBrace(src, open);
    if (close < 0) continue;
    const meta = src.slice(open + 1, close);
    const cls = /export\s+(?:default\s+)?class\s+(\w+)[^{]*\{/.exec(src.slice(close));
    if (!cls) continue;
    const cOpen = close + cls.index + cls[0].length - 1, cClose = matchBrace(src, cOpen);
    const selector = /selector\s*:\s*['"`]([^'"`]+)['"`]/.exec(meta)?.[1] ?? null;
    let template = null, templateAt = null, templateFile = null, missing = null;
    const tm = /template\s*:\s*(`|'|")/.exec(meta);
    if (tm) { const s = open + 1 + tm.index + tm[0].length - 1; const e = skipString(src, s); template = src.slice(s + 1, e - 1); templateAt = s + 1; }
    const tu = /templateUrl\s*:\s*['"`]([^'"`]+)['"`]/.exec(meta);
    if (tu) {
      const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
      const want = normalize(dir + tu[1]);
      const hit = files.find((f) => normalize(f.path) === want) ?? files.find((f) => f.path.endsWith(tu[1].replace(/^\.\//, '')));
      if (hit) { template = hit.source; templateFile = hit.path; } else missing = tu[1];
    }
    out.push({ name: cls[1], selector, template, templateAt, templateFile, missing, start: m.index, classOpen: cOpen, classBody: src.slice(cOpen + 1, cClose), classEnd: cClose });
  }
  return out;
}
const normalize = (p) => { const out = []; for (const seg of p.split('/')) { if (seg === '..') out.pop(); else if (seg && seg !== '.') out.push(seg); } return out.join('/'); };

function angularScreen(file, src, comp, ctxBase) {
  const ctx = { ...ctxBase, notRead: [], events: [], uses: new Set(), setters: new Map(), stateNames: new Set(), inputs: new Set(), outputs: new Set() };
  const inputs = [], outputs = [], state = [], effects = [], services = [];
  const body = comp.classBody;
  const lineIn = (i) => lineAt(src, comp.classOpen + 1 + i);
  let m;
  const fieldRe = /(@Input\([^)]*\)\s*|@Output\(\)\s*)?(?:(?:public|private|protected|readonly|override)\s+)*(\w+)\s*([!?])?\s*(?::\s*([^=;\n]+?))?\s*(?:=\s*([^;\n]+))?;/g;
  // Only class-level lines (depth 0 inside the class) are fields.
  let depth = 0, k = 0;
  const level0 = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(body, i) - 1; continue; }
    if (c === '{' || c === '(' || c === '[') { if (depth === 0) level0.push([k, i]); depth++; }
    else if (c === '}' || c === ')' || c === ']') { depth--; if (depth === 0) k = i + 1; }
  }
  level0.push([k, body.length]);
  const flat = body.replace(/\{[^{}]*\}/g, (x) => ' '.repeat(x.length)); // method bodies blanked (one level)
  while ((m = fieldRe.exec(flat))) {
    const [, deco, name, mark, type, init] = m;
    if (/^(constructor|if|return|for|while|switch|const|let|var)$/.test(name)) continue;
    const before = flat.slice(Math.max(0, m.index - 2), m.index);
    if (/[(.]/.test(before.trim().slice(-1))) continue;
    const line = lineIn(m.index + (deco ? 0 : 0));
    const initS = squash(body.slice(m.index, m.index + m[0].length).replace(/^[\s\S]*?=\s*/, '').replace(/;$/, ''));
    if (deco?.startsWith('@Input')) { inputs.push({ name, label: words(name), ...(type ? { kind: typeWords(type) } : {}), ...(/required\s*:\s*true/.test(deco) || mark === '!' ? { required: true } : {}), ...(init ? { start: startWords(initS) } : {}), line }); ctx.inputs.add(name); continue; }
    if (deco?.startsWith('@Output')) { outputs.push({ name, label: words(name), line }); ctx.outputs.add(name); continue; }
    if (init) {
      let s;
      if ((s = /^input(?:\.required)?(?:<([^>]+)>)?\(([\s\S]*)\)$/.exec(initS))) { inputs.push({ name, label: words(name), ...(s[1] ? { kind: typeWords(s[1]) } : {}), ...(/^input\.required/.test(initS) ? { required: true } : s[2].trim() ? { start: startWords(s[2]) } : {}), line }); ctx.inputs.add(name); continue; }
      if (/^output(?:<[^>]*>)?\(\)$/.test(initS) || /^new EventEmitter/.test(initS)) { outputs.push({ name, label: words(name), line }); ctx.outputs.add(name); continue; }
      if ((s = /^signal(?:<[^>]*>)?\(([\s\S]*)\)$/.exec(initS))) { state.push({ name, label: words(name), start: startWords(s[1]), how: 'signal', line }); ctx.stateNames.add(name); continue; }
      if ((s = /^computed\(\s*\(\)\s*=>\s*([\s\S]*)\)$/.exec(initS))) { state.push({ name, label: words(name), start: `worked out from ${valueWords(s[1].replace(/this\./g, ''))}`, how: 'computed', line }); continue; }
      if (/^inject\(/.test(initS)) { services.push(/^inject\(\s*(\w+)/.exec(initS)?.[1] ?? name); continue; }
      state.push({ name, label: words(name), start: startWords(initS), how: 'field', line }); ctx.stateNames.add(name); continue;
    }
    if (type && !/\(/.test(type)) { state.push({ name, label: words(name), ...(typeWords(type) ? { kind: typeWords(type) } : {}), start: 'nothing yet', how: 'field', line }); ctx.stateNames.add(name); }
  }
  const ctor = /constructor\s*\(([^)]*)\)/.exec(body);
  if (ctor) for (const p of ctor[1].split(',')) { const pm = /(\w+)\s*:\s*(\w+)/.exec(p); if (pm) services.push(pm[2]); }
  for (const [hook, when] of [['ngOnInit', 'When the screen first shows'], ['ngOnChanges', 'When an input changes'], ['ngAfterViewInit', 'After the screen is drawn'], ['ngOnDestroy', 'When the screen goes away']]) {
    const hm = new RegExp(`\\b${hook}\\s*\\(`).exec(body);
    if (hm) effects.push({ when, runs: `runs ${words(hook.replace(/^ng/, ''))} (its steps are in that function)`, member: ctx.memberOf(hook), line: lineIn(hm.index) });
  }
  let shows = [];
  if (comp.template != null) {
    const tree = parseTemplate(comp.template, comp.templateFile ? null : src, comp.templateAt ?? 0);
    shows = describe(tree, ctx);
    if (comp.templateFile) for (const e of [...ctx.events, ...ctx.notRead]) e.file = comp.templateFile;
  } else if (comp.missing) ctx.notRead.push({ line: lineAt(src, comp.start), code: `templateUrl: '${comp.missing}'`, why: `its template file (${comp.missing}) was not among the files read` });
  return {
    framework: 'angular', name: comp.name, label: cap(words(comp.name.replace(/Component$/, ''))), file, lines: [lineAt(src, comp.start), lineAt(src, comp.classEnd)],
    ...(comp.selector ? { selector: comp.selector } : {}), ...(comp.templateFile ? { template: comp.templateFile } : {}),
    inputs, state, shows, events: ctx.events, effects, outputs, ...(services.length ? { services: [...new Set(services)] } : {}),
    uses: [...ctx.uses], notRead: ctx.notRead,
  };
}

/**
 * The screens in a set of files: [{ id, framework, name, label, file, lines, inputs, state, shows, events, effects,
 * outputs, uses, notRead, … }]. `members` (the model's) link events and effects to the functions they run.
 */
export function readScreens(files, { members = [] } = {}) {
  const ts = files.filter((f) => /\.(tsx|jsx|ts|js|mjs)$/.test(f.path) && f.source);
  // First pass: names and selectors, so a screen that shows another can name it.
  const found = [];
  for (const f of ts) {
    const reacts = /<[A-Za-z]/.test(f.source) && /\.(tsx|jsx|js)$/.test(f.path) ? reactComponents(f.source) : [];
    const angulars = /@Component\s*\(/.test(f.source) ? angularComponents(f.path, f.source, files) : [];
    for (const c of reacts) found.push({ f, c, kind: 'react' });
    for (const c of angulars) found.push({ f, c, kind: 'angular' });
  }
  const screensByName = new Map(found.map(({ c, kind }) => [c.name, { name: c.name, label: cap(words(kind === 'angular' ? c.name.replace(/Component$/, '') : c.name)) }]));
  const selectors = new Map(found.filter((x) => x.kind === 'angular' && x.c.selector).map(({ c }) => [c.selector, screensByName.get(c.name)]));
  const screens = [];
  for (const { f, c, kind } of found) {
    const memberOf = (name) => members.find((mm) => mm.file === f.path && mm.name === name)?.id ?? members.find((mm) => mm.name === name)?.id ?? null;
    const base = { screensByName, selectors, memberOf };
    let s;
    try { s = kind === 'react' ? reactScreen(f.path, f.source, c, base) : angularScreen(f.path, f.source, c, base); }
    catch (e) { s = { framework: kind, name: c.name, label: cap(words(c.name)), file: f.path, lines: [lineAt(f.source, c.start ?? 0), lineAt(f.source, c.start ?? 0)], inputs: [], state: [], shows: [], events: [], effects: [], outputs: [], uses: [], notRead: [{ line: lineAt(f.source, c.start ?? 0), code: c.name, why: `this screen could not be read: ${e.message}` }] }; }
    for (const e of s.events) if (e.line == null) delete e.line;
    for (const n of s.notRead) { if (n.line == null) delete n.line; }
    screens.push({ id: `${f.path}#screen:${c.name}`, kind: 'screen', symbol: 'screen', ...s });
  }
  const byName = new Map(screens.map((s) => [s.name, s]));
  const bySelector = new Map(screens.filter((s) => s.selector).map((s) => [s.selector, s]));
  for (const s of screens) {
    s.uses = s.uses.map((u) => { const t = byName.get(u) ?? bySelector.get(u); return t ? { id: t.id, label: t.label } : { label: u, outside: true }; });
    s.usedBy = [];
  }
  for (const s of screens) for (const u of s.uses) if (u.id) { const t = screens.find((x) => x.id === u.id); if (t && !t.usedBy.some((x) => x.id === s.id)) t.usedBy.push({ id: s.id, label: s.label }); }
  // Which screens are pages: a Next.js page file, or a component a router opens (Angular Routes, React Router).
  // Otherwise "top" (no other screen shows it) or "part" (shown inside another screen). Never guessed from names.
  const routed = routedNames(files);
  for (const s of screens) {
    const page = pageFile(s.file);
    if (page) { s.role = 'page'; s.roleWhy = page; }
    else if (routed.has(s.name)) { s.role = 'page'; s.roleWhy = `a router opens it (${routed.get(s.name)})`; }
    else if (s.usedBy.length) { s.role = 'part'; s.roleWhy = `shown inside ${s.usedBy.map((u) => u.label).join(', ')}`; }
    else { s.role = 'top'; s.roleWhy = 'no other screen here shows it'; }
  }
  return screens;
}

/** A Next.js page or layout file, in words; null for any other file. */
function pageFile(file) {
  const f = file.replace(/\\/g, '/');
  if (/(^|\/)app\/(.+\/)?page\.(tsx|jsx|ts|js)$/.test(f)) return 'a Next.js page file (app router)';
  if (/(^|\/)pages\/(?!api\/)(?!_app\.|_document\.|_error\.)[^]*\.(tsx|jsx|ts|js)$/.test(f)) return 'a Next.js page file (pages folder)';
  return null;
}

/** Components a router opens: Angular `component: X` in Routes, React Router `element={<X` and `Component: X`. */
function routedNames(files) {
  const out = new Map();
  for (const f of files) {
    const src = f.source ?? '';
    if (/\bRoutes\b|RouterModule|provideRouter/.test(src)) for (const m of src.matchAll(/\bcomponent\s*:\s*([A-Z]\w*)/g)) if (!out.has(m[1])) out.set(m[1], `${f.path}, line ${lineAt(src, m.index)}`);
    if (/<Route\b|createBrowserRouter|createRoutesFromElements/.test(src)) for (const m of src.matchAll(/(?:\belement\s*[=:]\s*\{?\s*<|\bComponent\s*:\s*)([A-Z]\w*)/g)) if (!out.has(m[1])) out.set(m[1], `${f.path}, line ${lineAt(src, m.index)}`);
  }
  return out;
}

// ── Text ─────────────────────────────────────────────────────────────────────────────────────────────────────────

function outlineLines(items, depth, out) {
  for (const it of items) {
    out.push(`${'  '.repeat(depth)}- ${it.says}${it.line ? `  (line ${it.line})` : ''}`);
    if (it.kids) outlineLines(it.kids, depth + 1, out);
    if (it.otherwise) { out.push(`${'  '.repeat(depth)}- ${it.otherwise.says}`); outlineLines(it.otherwise.kids, depth + 1, out); }
  }
  return out;
}

/** A screen as Thunder Text. */
export function screenText(s) {
  const L = [`${s.label}: ${s.framework === 'react' ? 'a React' : 'an Angular'} screen${s.selector ? ` (<${s.selector}>)` : ''}`];
  if (s.role === 'page') L.push(`  It is a page: ${s.roleWhy}`);
  if (s.inputs.length) L.push(`  It receives: ${s.inputs.map((i) => `${i.label}${i.kind ? ` (${i.kind}${i.optional ? ', optional' : ''}${i.required ? ', required' : ''})` : i.required ? ' (required)' : ''}${i.start ? `, ${i.start} if not given` : ''}`).join('; ')}`);
  if (s.state.length) L.push(`  It remembers: ${s.state.map((x) => `${x.label}${x.start ? ` (${/^(from|worked out)/.test(x.start) ? x.start : `starts as ${x.start}`})` : ''}`).join('; ')}`);
  if (s.services?.length) L.push(`  It uses the services: ${s.services.join(', ')}`);
  for (const e of s.early ?? []) { L.push(`  When ${e.when}, it shows only:`); outlineLines(e.shows.length ? e.shows : [{ says: 'nothing' }], 2, L); }
  if (s.shows.length) { L.push('  It shows:'); outlineLines(s.shows, 2, L); }
  for (const e of s.effects) L.push(`  ${e.when}: ${e.runs}${e.line ? `  (line ${e.line})` : ''}`);
  if (s.outputs.length) L.push(`  It sends: ${s.outputs.map((o) => `${o.label} (an event)`).join(', ')}`);
  if (s.uses.length) L.push(`  It shows these screens and components: ${s.uses.map((u) => u.label).join(', ')}`);
  if (s.notRead.length) { L.push('  Not read:'); for (const n of s.notRead) L.push(`    ${n.line ? `line ${n.line}: ` : ''}\`${n.code}\`: ${n.why}`); }
  return `${L.join('\n')}\n`;
}
