// thunder-model-v1: the one meaning that every Thunder view is drawn from. Things (classes), Data (records and
// choices), and members (actions, rules, steps, setup) with their flow as a graph, links between them, source lines,
// and everything Thunder could not read. Thunder pictures and Thunder Text are projections of this model; nothing in
// them may say more than the model does. Browser-safe: takes [{ path, source }].
import { readCode } from './read.mjs';
import { readableLanguage } from './read-repo.mjs';
import { plainFromReading } from './plain-contract.mjs';
import { visualFor } from './visual.mjs';

export const MODEL_SCHEMA = 'thunder-model-v1';
/** Languages whose classes, records, and choices are read today. Others still get every function. */
export const THING_LANGUAGES = ['python', 'typescript', 'javascript'];

const words = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const stripQuotes = (v) => v.replace(/^[rbuf]*(["'`])(.*)\1$/s, '$2');

/** How a starting value reads: "3 unless told otherwise", "empty at first", "on shelf at first". */
function startValue(expr, params = {}) {
  const e = String(expr ?? '').trim();
  if (!e) return null;
  if (e in params) return params[e] != null ? `${startValue(params[e])?.replace(/ at first$/, '')} unless told otherwise` : 'given when it starts';
  if (/^(\[\]|\{\}|list\(\)|dict\(\)|set\(\)|new (Map|Set|Array)\(\)|\[\]\s*as\s+.+)$/.test(e)) return 'empty at first';
  if (/^(None|null|undefined)$/.test(e)) return 'nothing at first';
  if (/^(True|true)$/.test(e)) return 'yes at first';
  if (/^(False|false)$/.test(e)) return 'no at first';
  if (/^-?\d+(\.\d+)?$/.test(e)) return `${e} at first`;
  if (/^[rbuf]*["'`].*["'`]$/.test(e)) return `"${stripQuotes(e)}" at first`;
  const en = e.match(/^[A-Z]\w*\.([A-Z][A-Z0-9_]+)$/);
  if (en) return `${words(en[1])} at first`;
  return 'worked out when it starts';
}

const KIND_WORDS = [
  [/^(int|float|number|double|long|decimal|Decimal|bigint)$/i, 'a number'],
  [/^(str|string|String|text)$/i, 'words'],
  [/^(bool|boolean)$/i, 'yes or no'],
  [/^(date|datetime|Date|LocalDate|Instant)$/i, 'a date'],
];
function kindWords(type) {
  const t = String(type ?? '').trim();
  if (!t) return null;
  for (const [re, w] of KIND_WORDS) if (re.test(t)) return w;
  const list = t.match(/^(?:list|List|Array|Sequence|Iterable)\[(.+)\]$|^Array<(.+)>$|^(.+)\[\]$/);
  if (list) return `a list of ${(list[1] || list[2] || list[3]).trim()}s`;
  const opt = t.match(/^Optional\[(.+)\]$|^(.+?)\s*\|\s*None$|^(.+?)\s*\|\s*(null|undefined)$/);
  if (opt) return `${kindWords(opt[1] || opt[2] || opt[3]) ?? `a ${opt[1] || opt[2] || opt[3]}`}, or nothing`;
  return /^[A-Z]/.test(t) ? `a ${t}` : null;
}

// ── Things: classes, records, and choices ───────────────────────────────────────────────────────────────

function pythonThings(src, file) {
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/);
    if (!m) continue;
    const indent = m[1].length;
    const decorators = [];
    for (let k = i - 1; k >= 0 && /^\s*@/.test(lines[k]); k--) decorators.unshift(lines[k].trim());
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trim() || /^\s*#/.test(lines[j])) continue;
      if (lines[j].match(/^\s*/)[0].length <= indent) break;
      end = j;
    }
    const body = lines.slice(i + 1, end + 1);
    const bodyIndent = (body.find((l) => l.trim()) || '').match(/^\s*/)[0].length;
    const top = body.map((l, k) => ({ text: l, line: i + 2 + k })).filter((l) => l.text.trim() && l.text.match(/^\s*/)[0].length === bodyIndent);
    const bases = (m[3] || '').split(',').map((b) => b.trim());
    const isEnum = bases.some((b) => /(^|\.)(Enum|IntEnum|StrEnum|Flag)$/.test(b));
    const isRecord = !isEnum && (decorators.some((d) => /@(dataclasses\.)?dataclass\b|@attr\.s\b|@define\b/.test(d)) || bases.some((b) => /(BaseModel|NamedTuple|TypedDict|Schema)$/.test(b)));
    const docLine = top[0] && top[0].text.trim().match(/^[rRuU]?("""|'''|"|')(.*?)(\1)?$/);
    const doc = docLine ? (docLine[3] ? docLine[2].trim() : docLine[2].trim()) || null : null;
    const thing = { kind: isEnum ? 'choices' : isRecord ? 'record' : 'thing', name: m[2], file, lines: [i + 1, end + 1], indent, ...(doc ? { doc } : {}), knows: [], choices: [] };
    for (const l of top) {
      const t = l.text.trim();
      if (/^(def|async def|class|@|"""|'''|#)/.test(t)) continue;
      let f;
      if (isEnum && (f = t.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.+)$/))) thing.choices.push(/^[rbuf]*["']/.test(f[2]) ? stripQuotes(f[2].trim()) : words(f[1]));
      else if ((f = t.match(/^(\w+)\s*:\s*([^=]+?)(?:\s*=\s*(.+))?$/))) thing.knows.push({ name: f[1], label: words(f[1]), kind: kindWords(f[2]), start: f[3] ? startValue(f[3]) : null, line: l.line });
    }
    // Facts set when a Thing starts: self.x = ... inside __init__.
    const init = body.findIndex((l) => /^\s*def\s+__init__\s*\(/.test(l));
    if (init >= 0) {
      const sig = body.slice(init).join('\n').match(/def\s+__init__\s*\(([^)]*)\)/s);
      const params = {};
      for (const p of (sig?.[1] || '').split(',').map((x) => x.trim()).filter((x) => x && x !== 'self')) {
        const pm = p.match(/^(\w+)(?:\s*:\s*[^=]+)?(?:\s*=\s*(.+))?$/);
        if (pm) params[pm[1]] = pm[2] ?? null;
      }
      const initIndent = body[init].match(/^\s*/)[0].length;
      for (let k = init + 1; k < body.length; k++) {
        const ln = body[k];
        if (ln.trim() && ln.match(/^\s*/)[0].length <= initIndent) break;
        const a = ln.trim().match(/^self\.(\w+)\s*(?::\s*([^=]+))?=\s*(.+)$/);
        if (a && !thing.knows.some((x) => x.name === a[1])) {
          // The parameter's declared type, when the value is a plain parameter name (never code in a pattern).
          const pType = /^\w+$/.test(a[3].trim()) ? (sig?.[1] || '').match(new RegExp(`\\b${a[3].trim()}\\s*:\\s*([\\w\\[\\]. |]+)`))?.[1] : undefined;
          thing.knows.push({ name: a[1], label: words(a[1]), kind: kindWords(a[2] || pType) ?? (/^\[/.test(a[3]) ? 'a list' : null), start: startValue(a[3], params), line: i + 2 + k });
        }
      }
    }
    out.push(thing);
  }
  return out;
}

function braceEnd(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { const q = c; for (i++; i < src.length && src[i] !== q; i++) if (src[i] === '\\') i++; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

function tsThings(src, file) {
  const out = [];
  const re = /(?:^|\n)[ \t]*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(class|interface|enum)\s+(\w+)[^{]*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    const close = braceEnd(src, open);
    if (close < 0) continue;
    const body = src.slice(open + 1, close);
    const startLine = lineOf(src, m.index + (m[0].startsWith('\n') ? 1 : 0));
    const before = src.slice(0, m.index).split('\n').slice(-4).join('\n');
    const docm = before.match(/\/\*\*([\s\S]*?)\*\/\s*$/);
    const doc = docm ? docm[1].split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trim()).filter((l) => l && !l.startsWith('@')).join(' ') || null : null;
    const thing = { kind: m[1] === 'enum' ? 'choices' : m[1] === 'interface' ? 'record' : 'thing', name: m[2], file, lines: [startLine, lineOf(src, close)], ...(doc ? { doc } : {}), knows: [], choices: [] };
    if (m[1] === 'enum') {
      for (const part of body.split(',')) { const e = part.trim().match(/^(\w+)(?:\s*=\s*(.+))?$/s); if (e) thing.choices.push(e[2] && /^["'`]/.test(e[2].trim()) ? stripQuotes(e[2].trim()) : words(e[1])); }
    } else {
      // Only the class's own lines, not the bodies of its methods.
      let depth = 0, own = '';
      for (const c of body) { if (c === '{') depth++; if (depth === 0) own += c; if (c === '}') depth--; }
      const ownLines = own.split(/[;\n]/).map((l) => l.trim()).filter(Boolean);
      for (const l of ownLines) {
        const f = l.match(/^(?:(?:public|private|protected|readonly|static|declare)\s+)*(\w+)(\?)?\s*:\s*([^=]+?)(?:\s*=\s*(.+))?$/) || l.match(/^(?:(?:public|private|protected|readonly|static)\s+)*(\w+)()\s*=\s*(.+)$/);
        if (!f || /\(/.test(f[1])) continue;
        const hasType = f.length > 4 && f[3] && !l.match(/^(?:(?:public|private|protected|readonly|static)\s+)*\w+\s*=/);
        thing.knows.push({ name: f[1], label: words(f[1]), kind: hasType ? kindWords(f[3]) : null, start: hasType ? (f[4] ? startValue(f[4]) : null) : startValue(f[3]), line: null });
      }
      const ctor = body.match(/constructor\s*\(([^)]*)\)\s*\{/);
      if (ctor) {
        const params = {};
        for (const p of ctor[1].split(',').map((x) => x.trim()).filter(Boolean)) { const pm = p.match(/^(?:(?:public|private|protected|readonly)\s+)*(\w+)\??(?:\s*:\s*[^=]+)?(?:\s*=\s*(.+))?$/); if (pm) params[pm[1]] = pm[2] ?? null; }
        const cOpen = body.indexOf('{', ctor.index + ctor[0].length - 1);
        const cBody = body.slice(cOpen + 1, braceEnd(body, cOpen));
        for (const a of cBody.matchAll(/this\.(\w+)\s*=\s*([^;\n]+)/g)) {
          if (!thing.knows.some((x) => x.name === a[1])) thing.knows.push({ name: a[1], label: words(a[1]), kind: null, start: startValue(a[2], params), line: null });
          else { const k = thing.knows.find((x) => x.name === a[1]); if (!k.start) k.start = startValue(a[2], params); }
        }
      }
    }
    out.push(thing);
  }
  return out;
}

// ── Flow: steps as a graph a person can follow ─────────────────────────────────────────────────────────

/**
 * What kind of step this is, in a kid's words: find, keep-only, check, calculate, save, send, ask, repeat, answer,
 * stop, or code (Thunder could not explain it). Shapes and colors key off this.
 */
export function stepDoes(step) {
  const s = step.says || '', c = step.callee || '';
  if (step.restates || step.kind === 'other') return 'code';
  if (step.kind === 'fail') return 'stop';
  if (step.kind === 'loop') return 'repeat';
  if (step.kind === 'return') return 'answer';
  if (step.kind === 'check') return 'check';
  if (step.kind === 'branch') return 'decide';
  if (/^Writes to the database|^(Records|Adds to|Removes)/.test(s)) return 'save';
  if (/^(Sends an email|Announces an event|Writes a log)/.test(s)) return 'send';
  if (/^(Calls another service|Calls Stripe)/.test(s)) return 'ask';
  if (/\b(filter|where|select|query|find|get|fetch|load|read|search|lookup|scalars|all)\b/i.test(c) || /the items in .* where|the first item in|the .* entry in|the .* with /.test(s)) return /\b(filter|where)\b/i.test(c) || / where /.test(s) ? 'keep-only' : 'find';
  if (step.kind === 'set') return 'calculate';
  return 'do';
}

/** "the book's status" for book.status; plain words for everything else. */
const possessive = (text) => String(text)
  .replace(/\b([a-z_][\w]*)\.([a-z_][\w]*)\b(?!\s*\()/gi, (m, a, b) => (/^(self|this)$/.test(a) ? `the ${words(b)}` : `the ${words(a)}'s ${words(b)}`))
  .replace(/\b([a-z]+(?:_[a-z0-9]+)+|[a-z]+(?:[A-Z][a-z0-9]*)+)\b/g, (m) => words(m)); // days_late, daysLate -> days late
/** An answer as words: NoFee -> "No fee", true -> "Yes". */
const answerWords = (r) => (/^true$/i.test(r) ? 'Yes' : /^false$/i.test(r) ? 'No' : cap(words(r)));

/**
 * A branch as a question a kid can answer with yes or no, asked the positive way round. "If book.status is not on
 * shelf" becomes "Is the book's status on shelf?" with the Stop on the No side (flip). A call to a known rule is
 * asked by the rule's own name: "Can borrow?".
 */
export function askAsQuestion(step, ruleLabel) {
  let c = String(step.says).replace(/^If /, '').replace(/ \(\d+ steps? inside\)$/, '').trim();
  let flip = false;
  if (/^not: /.test(c)) { c = c.slice(5); flip = true; }
  if (ruleLabel) {
    const negated = /^not\b|^!/.test(String(step.code || '').replace(/^\s*if\s*\(?\s*/, '')) || /\bnot\s+(self|this)\./.test(step.code || '') || /!\s*(this|self)\./.test(step.code || '');
    // The negation is read from the code alone; the step's wording may already say "not" for the same reason.
    return { text: `${ruleLabel.replace(/\?$/, '')}?`, flip: negated };
  }
  let m;
  if ((m = c.match(/^not (.+)$/))) { c = m[1]; flip = !flip; }
  if ((m = c.match(/^(.+?) is not (.+)$/))) return { text: `Is ${possessive(m[1])} ${possessive(m[2])}?`, flip: !flip };
  if ((m = c.match(/^(.+?) has no (.+)$/))) return { text: `Does ${possessive(m[1])} have ${m[2]}?`, flip: !flip };
  if ((m = c.match(/^(.+?) is (.+)$/))) return { text: `Is ${possessive(m[1])} ${possessive(m[2])}?`, flip };
  if ((m = c.match(/^(.+?) has (.+)$/))) return { text: `Does ${possessive(m[1])} have ${m[2]}?`, flip };
  return { text: `${cap(possessive(c))}?`, flip };
}

/** A rule's own picture: each rule asked in order, the first Yes gives its answer, otherwise the fallback. */
export function ruleFlow(item, start) {
  const nodes = [], edges = [];
  let n = 0;
  const node = (kind, text, extra = {}) => { const id = `n${n++}`; nodes.push({ id, kind, text, row: nodes.length, ...extra }); return id; };
  let prev = node('start', start, { lane: 0, does: 'start' });
  let label;
  for (const r of item.rules || []) {
    const d = node('decision', `${cap(possessive(r.says ?? r.when))}?`, { lane: 0, line: r.line, does: 'decide' });
    edges.push({ from: prev, to: d, ...(label ? { label } : {}) });
    const out = node('end', answerWords(r.result), { lane: 1, line: r.line, does: 'answer', answer: true, value: r.result });
    edges.push({ from: d, to: out, label: 'yes' });
    prev = d; label = 'no';
  }
  if (item.otherwise) {
    const o = node('end', answerWords(item.otherwise.result), { lane: 0, line: item.otherwise.line, does: 'answer', answer: true, otherwise: true, value: item.otherwise.result });
    edges.push({ from: prev, to: o, ...(label ? { label } : {}) });
  }
  // As a tree: each question's Yes gives its answer, its No asks the next question (or gives the fallback).
  const decisions = nodes.filter((x) => x.kind === 'decision');
  const answers = nodes.filter((x) => x.answer && !x.otherwise);
  const fallback = nodes.find((x) => x.otherwise);
  const chain = (i) => (i < decisions.length ? [{ id: decisions[i].id, yes: [{ id: answers[i].id }], no: chain(i + 1) }] : fallback ? [{ id: fallback.id }] : []);
  return { nodes, edges, blocks: chain(0) };
}

/** Turn steps into nodes and edges. Deterministic; nothing is added that the steps do not say. */
export function flowOf(steps, { start = 'Start', memberIndex = new Map(), memberLabel = new Map() } = {}) {
  const nodes = [], edges = [];
  let n = 0;
  const node = (kind, text, extra = {}) => { const id = `n${n++}`; nodes.push({ id, kind, text, ...extra }); return id; };
  const connect = (open, to) => { for (const o of open) edges.push({ from: o.id, to, ...(o.label ? { label: o.label } : {}) }); };
  // The first call in the step to another member of this file: self.can_borrow(...), delivery_fee(...), this.lateFee(...).
  const usesOf = (st) => {
    for (const c of String(st.code || '').matchAll(/(?:\b(?:self|this)\.)?\b([A-Za-z_]\w*)\s*\(/g)) {
      const id = memberIndex.get(c[1].toLowerCase());
      if (id) return id;
    }
    return null;
  };
  // walk returns { open, blocks }: open = edges still waiting for the next node; blocks = the same nodes as a tree
  // (each question with its yes and no sides, loops with their body, try with its handlers and always), which is
  // what the picture and Thunder Text are drawn from. The edges are the same flow as a graph, for other tools.
  const walk = (list, open, lane) => {
    const blocks = [];
    for (const st of list) {
      const does = stepDoes(st);
      const base = { line: st.line, lane, does, ...(usesOf(st) ? { uses: usesOf(st) } : {}) };
      if (st.kind === 'branch') {
        const { text, flip } = askAsQuestion(st, base.uses && memberLabel.get(base.uses));
        const [into, past] = flip ? ['no', 'yes'] : ['yes', 'no'];
        const d = node('decision', text, base);
        connect(open, d);
        const inside = walk(st.children || [], [{ id: d, label: into }], lane + 1);
        // The other side of the question: its else (or else-if chain) when the code has one.
        const other = st.otherwise?.length ? walk(st.otherwise, [{ id: d, label: past }], lane + 1) : { open: [{ id: d, label: past }], blocks: [] };
        blocks.push({ id: d, [into]: inside.blocks, [past]: other.blocks });
        open = [...other.open, ...inside.open];
      } else if (st.kind === 'loop') {
        const l = node('loop', st.says, base);
        connect(open, l);
        const body = walk(st.children || [], [{ id: l, label: 'each' }], lane + 1);
        for (const b of body.open) edges.push({ from: b.id, to: l, label: 'next' });
        blocks.push({ id: l, each: body.blocks });
        open = [{ id: l, label: 'done' }];
      } else if (st.kind === 'fail') {
        const sn = node('stop', st.says.replace(/^Fails with /, 'Stop: '), base);
        connect(open, sn);
        blocks.push({ id: sn });
        open = [];
      } else if (st.kind === 'return') {
        const e = node('end', st.restates ? st.code : st.says.replace(/^Returns /, 'Gives back '), { ...base, ...(st.restates ? { code: true } : {}) });
        connect(open, e);
        blocks.push({ id: e });
        open = [];
      } else if (st.kind === 'try') {
        // Try: the normal path; each "If X goes wrong" handler beside it; "Always, at the end" after both.
        const t = node('step', st.says, base);
        connect(open, t);
        const body = walk(st.children || [], [{ id: t }], lane);
        let after = body.open;
        const handlers = [];
        for (const h of st.handlers || []) {
          const hn = node('decision', `${h.says}?`, { line: h.line, lane: lane + 1, does: 'decide', handler: true });
          edges.push({ from: t, to: hn, label: 'error' });
          const hw = walk(h.steps, [{ id: hn, label: 'yes' }], lane + 1);
          handlers.push({ id: hn, blocks: hw.blocks });
          after = [...after, ...hw.open];
        }
        let always = null;
        if (st.always) {
          const an = node('step', 'Always, at the end', { line: st.always.line, lane, does: 'do', always: true });
          connect(after, an);
          const aw = walk(st.always.steps, [{ id: an }], lane);
          always = { id: an, blocks: aw.blocks };
          after = aw.open;
        }
        blocks.push({ id: t, body: body.blocks, ...(handlers.length ? { handlers } : {}), ...(always ? { always } : {}) });
        open = after;
      } else {
        const k = node(does === 'code' ? 'code' : 'step', does === 'code' ? st.code ?? st.says : st.says, base);
        connect(open, k);
        open = [{ id: k }];
        if (st.children?.length) {
          const inner = walk(st.children, open, lane + 1);
          blocks.push({ id: k, body: inner.blocks });
          open = inner.open;
        } else blocks.push({ id: k });
      }
    }
    return { open, blocks };
  };
  const s0 = node('start', start, { lane: 0, does: 'start' });
  const { open, blocks } = walk(steps || [], [{ id: s0 }], 0);
  if (open.length) connect(open, node('end', 'Done', { lane: 0, does: 'answer' }));
  // Rows: order of first appearance, so the picture reads top to bottom like the code.
  nodes.forEach((x, i) => { x.row = i; });
  return { nodes, edges, blocks };
}

// ── The model ──────────────────────────────────────────────────────────────────────────────────────────

const idOf = (...parts) => parts.join('#').replace(/\s+/g, '');

/**
 * Read files into the one Thunder model. Things come from classes in THING_LANGUAGES; every function in every
 * readable language becomes a member with its flow. Unknowns list what could not be read, so no view hides a gap.
 */
export function thunderModel(files, { name = 'app' } = {}) {
  const things = [], members = [], links = [], unknowns = [], fileInfo = [];
  for (const f of files) {
    const language = readableLanguage(f.path);
    if (!language || !f.source) continue;
    let reading;
    try { reading = readCode(f.source, { language, file: f.path }); } catch (e) { unknowns.push({ file: f.path, line: 1, why: `Could not read this file: ${e.message}` }); continue; }
    let fileThings = [];
    try { fileThings = language === 'python' ? pythonThings(f.source, f.path) : THING_LANGUAGES.includes(language) ? tsThings(f.source, f.path) : []; }
    catch (e) { unknowns.push({ file: f.path, line: 1, why: `Classes in this file could not be drawn as Things: ${e.message}` }); } // one file never stops the whole app
    if (!THING_LANGUAGES.includes(language) && /\b(class|struct|record|enum|interface|data class)\s+[A-Z]/.test(f.source)) {
      unknowns.push({ file: f.path, line: 1, why: `Classes, records, and choices in ${language} are not drawn as Things yet; their functions are read.` });
    }
    for (const t of fileThings) { t.id = idOf(f.path, t.name); t.label = cap(words(t.name)); t.can = []; things.push(t); }
    const moduleDoc = language === 'python' ? (f.source.match(/^\s*(?:#.*\n|\s*\n)*[rRuU]?("""|''')([\s\S]*?)\1/)?.[2] ?? '').trim().split(/\n\s*\n/)[0].replace(/\s+/g, ' ') : '';
    fileInfo.push({ path: f.path, language, ...(moduleDoc ? { purpose: moduleDoc } : {}) });

    const fns = reading.items.filter((i) => i.kind === 'function' || i.kind === 'decision');
    const fileMembers = fns.map((item) => {
      const owner = fileThings.filter((t) => item.line > t.lines[0] && item.line <= t.lines[1]).sort((a, b) => b.lines[0] - a.lines[0])[0];
      const v = visualFor(item);
      const setup = /^(__init__|constructor|init|New)$/.test(item.name) && owner;
      const kind = setup ? 'setup' : v.element === 'action' ? 'action' : v.element === 'decision' ? 'rule' : v.element === 'not-read' ? 'not-read' : 'steps';
      const bodyEnd = item.anchor?.bodyLines?.[1] ?? Math.max(item.line, ...(item.rules || []).map((r) => r.line || 0), item.otherwise?.line || 0);
      let rule = null;
      if (kind === 'rule') { try { rule = plainFromReading(item); } catch { rule = null; } }
      const m = {
        id: idOf(f.path, owner?.name ?? '', item.name, item.line), kind, name: item.name,
        label: setup ? `A new ${owner.label} starts with` : cap(words(item.name.replace(/^__|__$/g, ''))),
        ...(owner ? { owner: owner.id } : {}), file: f.path, language, lines: [item.line, bodyEnd],
        ...(item.doc ? { doc: item.doc } : {}), ...(item.route ? { route: `${item.route.method} ${item.route.path}`.trim() } : {}),
        youGive: (item.inputs || []).filter((p) => !/^(self|this|cls)$/.test(p.name)).map((p) => words(p.name)),
        ...(item.returns && kind !== 'rule' ? { youGetBack: kindWords(item.returns) ?? item.returns } : {}),
        ...(rule ? { rule, question: rule.question } : {}),
        // A yes/no rule is named as a question ("Can borrow?"); a rule with named answers is not ("Late fee").
        ...(kind === 'rule' ? { yesNo: [...(item.rules || []).map((r) => r.result), item.otherwise?.result].every((r) => r == null || /^(true|false)$/i.test(r)) } : {}),
        _steps: item.steps || [], _item: item,
      };
      if (owner) owner.can.push(m.id);
      if (kind === 'not-read') unknowns.push({ id: m.id, file: f.path, line: item.line, why: 'Thunder cannot explain this function yet; its code is shown instead.' });
      return m;
    });
    // Flows need every member's name in the file, so a step can link to the rule or member it uses.
    const byName = new Map(fileMembers.map((m) => [m.name.toLowerCase(), m.id]));
    const labels = new Map(fileMembers.map((m) => [m.id, m.label]));
    for (const m of fileMembers) {
      const start = m.youGive.length ? `You give it: ${m.youGive.join(', ')}` : 'Start';
      m.flow = m.kind === 'rule' || (m._item.kind === 'decision' && m._item.rules?.length) ? ruleFlow(m._item, start) : flowOf(m._steps, { start, memberIndex: byName, memberLabel: labels });
      for (const nd of m.flow.nodes) if (nd.uses && nd.uses !== m.id) links.push({ from: m.id, to: nd.uses, kind: 'uses', node: nd.id });
      delete m._steps; delete m._item;
      members.push(m);
    }
  }
  return { schema: MODEL_SCHEMA, name, files: fileInfo, things, members, links, unknowns };
}

// ── Thunder Text, projected from the model (the picture is projected from the same nodes) ──────────────

/** Thunder Text lines from a flow's blocks: the same tree the picture is drawn from. */
function flowLines(flow, depth = 1) {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const out = [];
  const pad = (d) => '  '.repeat(d);
  const at = (n) => (n.line ? `  (line ${n.line})` : '');
  const say = (n) => (n.kind === 'code' ? `\`${n.text}\` (code, not explained)` : n.kind === 'decision' ? `Ask: ${n.text}` : n.kind === 'end' && n.answer ? `Answer: ${n.text}` : n.text);
  const go = (blocks, d) => {
    for (const b of blocks || []) {
      const n = byId.get(b.id);
      out.push(`${pad(d)}- ${say(n)}${at(n)}`);
      if (n.kind === 'decision') {
        for (const side of ['yes', 'no']) {
          if (!(side in b)) continue;
          if (b[side].length) { out.push(`${pad(d + 1)}${side === 'yes' ? 'Yes' : 'No'}:`); go(b[side], d + 2); }
          else out.push(`${pad(d + 1)}${side === 'yes' ? 'Yes' : 'No'}: continue`);
        }
      }
      if (b.each) { out.push(`${pad(d + 1)}For each:`); go(b.each, d + 2); }
      if (b.body) go(b.body, d + 1);
      for (const h of b.handlers || []) { out.push(`${pad(d + 1)}${byId.get(h.id).text.replace(/\?$/, '')}:`); go(h.blocks, d + 2); }
      if (b.always) { out.push(`${pad(d + 1)}Always, at the end:`); go(b.always.blocks, d + 2); }
    }
  };
  go(flow.blocks, depth);
  return out;
}

/**
 * Thunder Text for a Thing or a member, made from the same model nodes the picture is drawn from, so the two
 * cannot disagree. Pass the model and an id.
 */
export function modelText(model, id) {
  const t = model.things.find((x) => x.id === id);
  if (t) {
    const lines = [`${t.kind === 'thing' ? 'Thing' : t.kind === 'record' ? 'Record' : 'Choices'} ${t.label}`];
    if (t.doc) lines.push(`  Author's note: ${t.doc}`);
    if (t.choices.length) lines.push(`  One of: ${t.choices.join(', ')}`);
    if (t.knows.length) { lines.push('  It knows'); for (const k of t.knows) lines.push(`    ${k.label}: ${[k.kind, k.start].filter(Boolean).join(', ') || 'a value'}`); }
    if (t.can.length) { lines.push('  It can'); for (const c of t.can) lines.push(`    ${model.members.find((m) => m.id === c)?.label}`); }
    return `${lines.join('\n')}\n`;
  }
  const m = model.members.find((x) => x.id === id);
  if (!m) throw new Error(`Nothing in the model has id ${id}.`);
  const owner = m.owner && model.things.find((x) => x.id === m.owner);
  const lines = [`${m.label}${owner && m.kind !== 'setup' ? ` (${owner.label})` : ''}${m.kind === 'rule' ? ': a rule' : ''}`];
  if (m.route) lines.push(`  When someone calls ${m.route}`);
  if (m.doc) lines.push(`  Author's note: ${m.doc}`);
  if (m.youGive.length) lines.push(`  You give it: ${m.youGive.join(', ')}`);
  if (m.youGetBack) lines.push(`  You get back: ${m.youGetBack}`);
  lines.push(...flowLines(m.flow));
  return `${lines.join('\n')}\n`;
}
