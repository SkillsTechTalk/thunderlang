// thunder-model-v1: the one meaning that every Thunder view is drawn from. Things (classes), Data (records and
// choices), and members (actions, rules, steps, setup) with their flow as a graph, links between them, source lines,
// and everything Thunder could not read. Thunder pictures and Thunder Text are projections of this model; nothing in
// them may say more than the model does. Browser-safe: takes [{ path, source }].
import { readCode, INFRA_LANGUAGES } from './read.mjs';
import { readableLanguage, readingOf } from './read-repo.mjs';
import { plainFromReading, explainPlain } from './plain-contract.mjs';
import { visualFor, LEVELS, DOES } from './visual.mjs';
import { makeThingReaders } from './things-langs.mjs';
import { sqlThings } from './sql.mjs';
import { splitLogic, closeOf, isCodeWords } from './faithful.mjs';

export const MODEL_SCHEMA = 'thunder-model-v1';
/** Languages whose classes, records, and choices are read today. Others still get every function. */
export const THING_LANGUAGES = ['python', 'typescript', 'javascript', 'java', 'csharp', 'kotlin', 'php', 'go', 'rust', 'ruby', 'sql'];

/** Which part of the whole application a file describes (spec section 12). */
const CATEGORY = { dockerfile: 'infrastructure', 'github-actions': 'delivery', terraform: 'infrastructure', bicep: 'infrastructure', kubernetes: 'infrastructure', 'docker-compose': 'infrastructure' };
const categoryOf = (language) => CATEGORY[language] ?? 'application';

const words = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const stripQuotes = (v) => v.replace(/^[rbuf]*(["'`])(.*)\1$/s, '$2');

/** How a starting value reads: "3 unless told otherwise", "empty at first", "on shelf at first". */
function startValue(expr, params = {}) {
  const e = String(expr ?? '').trim();
  if (!e) return null;
  if (e in params) return params[e] != null ? `${startValue(params[e])?.replace(/ at first$/, '')} unless told otherwise` : 'given when it starts';
  if (/^(\[\]|\{\}|list\(\)|dict\(\)|set\(\)|new (Map|Set|Array)\(\)|\[\]\s*as\s+.+|array\(\)|new \w*(?:List|Map|Set|Dictionary|HashMap|HashSet|ArrayList|LinkedList)(?:<[^>]*>)?\(\)|(?:mutable)?(?:List|Map|Set|listOf|mapOf|setOf|mutableListOf|mutableMapOf|mutableSetOf|emptyList|emptyMap|arrayListOf)(?:<[^>]*>)?\(\)|(?:List|Set|Map)\.of\(\)|Vec::new\(\)|vec!\[\]|HashMap::new\(\)|String::new\(\)|\[\]\w+\{\}|make\(\[\][^)]*\)|new\(\)|Hash\.new|\{\s*\})$/.test(e)) return 'empty at first';
  if (/^(None|null|undefined|nil|NULL|Option::None)$/.test(e)) return 'nothing at first';
  if (/^(True|true)$/.test(e)) return 'yes at first';
  if (/^(False|false)$/.test(e)) return 'no at first';
  if (/^-?\d+(\.\d+)?$/.test(e)) return `${e} at first`;
  if (/^[rbuf]*["'`].*["'`]$/.test(e)) return `"${stripQuotes(e)}" at first`;
  const en = e.match(/^[A-Z]\w*(?:\.|::)([A-Z][A-Z0-9_]+|[A-Z][a-z]\w*)$/);
  if (en) return `${words(en[1])} at first`;
  return 'worked out when it starts';
}

const KIND_WORDS = [
  [/^(int|float|number|double|long|short|decimal|Decimal|bigint|BigDecimal|BigInteger|Integer|Int|Long|Double|Float|Short|Byte|byte|uint|usize|isize|[iuf](?:8|16|32|64|128)|int(?:8|16|32|64)|uint(?:8|16|32|64)|float(?:32|64)|Number)$/, 'a number'],
  [/^(str|string|String|text|&str|&'static str|char|Char|Character|rune)$/, 'words'],
  [/^(bool|boolean|Boolean|Bool)$/, 'yes or no'],
  [/^(date|datetime|Date|LocalDate|LocalDateTime|Instant|DateTime|DateTimeOffset|ZonedDateTime|time\.Time|NaiveDate|NaiveDateTime|DateTimeImmutable)$/, 'a date'],
];
function kindWords(type) {
  const t = String(type ?? '').trim();
  if (!t) return null;
  for (const [re, w] of KIND_WORDS) if (re.test(t)) return w;
  const list = t.match(/^(?:list|List|Array|Sequence|Iterable)\[(.+)\]$|^(?:Array|List|ArrayList|LinkedList|Vec|VecDeque|IList|IEnumerable|ICollection|IReadOnlyList|Collection|Set|HashSet|MutableList|MutableSet|Sequence|Iterable)<(.+)>$|^(.+)\[\]$|^\[\](.+)$/);
  if (list) { const inner = (list[1] || list[2] || list[3] || list[4]).trim(); return `a list of ${kindWords(inner)?.replace(/^an? /, '') ?? inner}s`.replace(/wordss$/, 'words').replace(/ys$/, 'ies').replace(/(yes or no)s$/, '$1 answers'); }
  const opt = t.match(/^Optional\[(.+)\]$|^(.+?)\s*\|\s*None$|^(.+?)\s*\|\s*(null|undefined)$|^(?:Option|Optional|Nullable)<(.+)>$|^(.+)\?$|^\*(\w+)$/);
  if (opt) { const inner = opt[1] || opt[2] || opt[3] || opt[5] || opt[6] || opt[7]; return `${kindWords(inner) ?? `a ${inner}`}, or nothing`; }
  const map = t.match(/^(?:Map|HashMap|Dictionary|IDictionary|MutableMap|BTreeMap|dict|Dict|Record)[<\[]/) || /^map\[/.test(t);
  if (map) return 'a lookup table';
  return /^[A-Z]/.test(t) ? `a ${t}` : null;
}

const thingsFor = makeThingReaders({ words: (x) => words(x), kindWords: (x) => kindWords(x), startValue: (x, p) => startValue(x, p) });

// ── Things: classes, records, and choices ───────────────────────────────────────────────────────────

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
  if (step.library && step.does) return step.does === 'calculate' ? 'calculate' : step.does === 'check' ? 'check' : step.does;
  if (step.restates || step.kind === 'other') return 'code';
  if (step.kind === 'fail') return 'stop';
  if (step.redirect) return 'redirect';
  if (step.kind === 'loop') return 'repeat';
  if (step.kind === 'return') return 'answer';
  if (step.kind === 'check') return 'check';
  if (step.kind === 'branch') return 'decide';
  if (/^Writes to the database|^(Records|Stores|Adds to|Removes)/.test(s)) return 'save';
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
  // A step that is already worded as a question (infrastructure readers ask their own) is asked as it is.
  if (/\?$/.test(c) && !ruleLabel) return { text: c, flip };
  // The faithfulness gate gave the code back: ask the code itself, Yes when it is true.
  if (isCodeWords(c)) return { text: `${c}?`, flip, code: true };
  if (ruleLabel) {
    const negated = /^not\b|^!/.test(String(step.code || '').replace(/^\s*if\s*\(?\s*/, '')) || /\bnot\s+(self|this)\./.test(step.code || '') || /!\s*(this|self)\./.test(step.code || '');
    // The negation is read from the code alone; the step's wording may already say "not" for the same reason.
    return { text: `${ruleLabel.replace(/\?$/, '')}?`, flip: negated };
  }
  let m;
  // A compound condition (a and b, a or not b) is asked as written: turning one part positive would flip the
  // whole question and put the Stop on the wrong side.
  if (compoundWords(c)) return { text: `${cap(possessive(c))}?`, flip };
  if ((m = c.match(/^not \((.+)\)$/)) && closeOf(c, 4) === c.length - 1) return { text: `${cap(possessive(m[1]))}?`, flip: !flip };
  if ((m = c.match(/^not (.+)$/))) { c = m[1]; flip = !flip; }
  if (compoundWords(c)) return { text: `Not ${possessive(c)}?`, flip: !flip };
  if ((m = c.match(/^(.+?) is not (.+)$/))) return { text: `Is ${possessive(m[1])} ${possessive(m[2])}?`, flip: !flip };
  if ((m = c.match(/^(.+?) has no (.+)$/))) return { text: `Does ${possessive(m[1])} have ${m[2]}?`, flip: !flip };
  if ((m = c.match(/^(.+?) is (.+)$/))) return { text: `Is ${possessive(m[1])} ${possessive(m[2])}?`, flip };
  if ((m = c.match(/^(.+?) has (.+)$/))) return { text: `Does ${possessive(m[1])} have ${m[2]}?`, flip };
  return { text: `${cap(possessive(c))}?`, flip };
}

/** True when words join two or more conditions with and / or outside brackets. */
function compoundWords(c) {
  const parts = splitLogic(String(c).replace(/`[^`]*`/g, 'Q').replace(/"[^"]*"/g, 'Q').replace(/'/g, ''));
  return !parts || parts.terms.length > 1;
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
  const connect = (open, to) => { for (const o of open) edges.push({ from: o.id, to, ...(o.label ? { label: o.label } : {}), ...(o.text ? { text: o.text } : {}) }); };
  // The first call in the step to another member of this file: self.can_borrow(...), delivery_fee(...), this.lateFee(...).
  // A method called on some other object (`console.error(…)`, `other.fillBuffer(…)`) is not this file's member.
  const usesOf = (st) => {
    for (const c of String(st.code || '').matchAll(/(?:\b(?:self|this)\.|(?<![\w$.]))([A-Za-z_]\w*)\s*\(/g)) {
      const id = memberIndex.get(c[1].toLowerCase());
      if (id) return id;
    }
    return null;
  };
  // A question is asked by a rule's own name only when the condition is that call and nothing else
  // (`if (!canBorrow(x))`), never when the call is one part of a bigger condition.
  const askedByRule = (st) => {
    const cond = String(st.cond ?? '').trim().replace(/^\((.*)\)$/, '$1');
    const m = cond.match(/^(?:!\s*|not\s+)?(?:(?:self|this)\.)?[A-Za-z_]\w*\s*\(/);
    return !!m && closeOf(cond, m[0].length - 1) === cond.length - 1;
  };
  // walk returns { open, blocks }: open = edges still waiting for the next node; blocks = the same nodes as a tree
  // (each question with its yes and no sides, loops with their body, try with its handlers and always), which is
  // what the picture and Thunder Text are drawn from. The edges are the same flow as a graph, for other tools.
  const walk = (list, open, lane) => {
    const blocks = [];
    for (const st of list) {
      const does = stepDoes(st);
      const base = { line: st.line, lane, does, ...(usesOf(st) ? { uses: usesOf(st) } : {}) };
      // A choice among several cases (switch, when, match, select): one question with one side per case.
      const arms = st.kind === 'branch' && st.children?.length && st.children.every((c) => c.kind === 'check' && c.caseLabel) ? st.children : null;
      if (arms) {
        const d = node('decision', st.says.replace(/\?$/, ''), { ...base, cases: true });
        connect(open, d);
        const cases = [];
        let after = [];
        for (const arm of arms) {
          const label = arm.says;
          const w = walk(arm.children || [], [{ id: d, label: 'case', text: label }], lane + 1);
          cases.push({ label, line: arm.line, blocks: w.blocks });
          after = [...after, ...w.open];
        }
        // An else after the cases (Ruby `case … else`) is the last case.
        if (st.otherwise?.length) {
          const w = walk(st.otherwise, [{ id: d, label: 'case', text: 'Otherwise' }], lane + 1);
          cases.push({ label: 'Otherwise', line: st.otherwiseLine ?? st.otherwise[0].line, blocks: w.blocks });
          after = [...after, ...w.open];
        }
        // With no "Otherwise", a value that matches no case carries straight on.
        if (!st.otherwise?.length && !arms.some((a) => /^(Otherwise|If none is ready yet|Default)\b/i.test(a.says))) after.push({ id: d, label: 'case', text: 'None of these' });
        blocks.push({ id: d, cases });
        open = after;
        continue;
      }
      if (st.kind === 'branch') {
        const { text, flip, code } = askAsQuestion(st, base.uses && askedByRule(st) && memberLabel.get(base.uses));
        const [into, past] = flip ? ['no', 'yes'] : ['yes', 'no'];
        // whenTrue: the side the code takes when its condition holds (No when the question is asked the positive way
        // round of a negated condition). Proof by running checks each side against what a run actually did.
        const d = node('decision', text, { ...base, whenTrue: into, ...(code || st.unread ? { code: true } : {}) });
        connect(open, d);
        const inside = walk(st.children || [], [{ id: d, label: into }], lane + 1);
        // The other side of the question: its else (or else-if chain) when the code has one.
        const other = st.otherwise?.length ? walk(st.otherwise, [{ id: d, label: past }], lane + 1) : { open: [{ id: d, label: past }], blocks: [] };
        blocks.push({ id: d, [into]: inside.blocks, [past]: other.blocks });
        open = [...other.open, ...inside.open];
      } else if (st.kind === 'loop' && !st.children?.length) {
        // A loop whose body was not read is shown as its code, not as an empty "For each".
        const k = node('code', st.code ?? st.says, { ...base, does: 'code' });
        connect(open, k);
        open = [{ id: k }];
        blocks.push({ id: k });
      } else if (st.kind === 'loop') {
        const l = node('loop', st.says, base);
        connect(open, l);
        const body = walk(st.children || [], [{ id: l, label: 'each' }], lane + 1);
        for (const b of body.open) edges.push({ from: b.id, to: l, label: 'next' });
        blocks.push({ id: l, each: body.blocks });
        open = [{ id: l, label: 'done' }];
        if (st.otherwise?.length) {
          // Python `for … else:` / `while … else:` runs only when the loop was not left early.
          const e = node('step', 'If it did not leave the loop early', { line: st.otherwiseLine ?? st.otherwise[0].line, lane, does: 'do' });
          connect(open, e);
          const w = walk(st.otherwise, [{ id: e }], lane + 1);
          blocks.push({ id: e, body: w.blocks });
          open = w.open;
        }
      } else if (st.kind === 'fail') {
        const sn = node('stop', st.says.replace(/^Fails with /, 'Stop: '), base);
        connect(open, sn);
        blocks.push({ id: sn });
        open = [];
      } else if (st.kind === 'return' && !open.length && /^Stops here$/.test(st.says)) {
        // `res.status(403).json(...); return` — the bare return only ends the path the Stop already ended.
        continue;
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
        if (st.otherwise?.length) {
          // Python `try … else:` — steps that run only when nothing went wrong in the tried steps (their own errors
          // are not handled here). Drawn at the end of the tried steps, on the path where nothing failed.
          const e = node('step', 'If nothing went wrong', { line: st.otherwiseLine ?? st.otherwise[0].line, lane, does: 'do' });
          connect(after, e);
          const w = walk(st.otherwise, [{ id: e }], lane + 1);
          body.blocks.push({ id: e, body: w.blocks });
          after = w.open;
        }
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
        open = st.jump ? [] : [{ id: k }];
        if (st.children?.length && st.nested) {
          // An inner function (a hook, a callback, go/defer, a closure) runs on its own: its steps are its own
          // sub-flow, and a return or stop inside it ends only that function. The outer flow carries on from here.
          const inner = walk(st.children, [{ id: k, label: 'nested' }], lane + 1);
          blocks.push({ id: k, body: inner.blocks, nested: true });
        } else if (st.children?.length) {
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
/**
 * What a person gives an action or function: its inputs, without framework plumbing (self, the request, a database
 * session), plus the facts a handler unpacks from the request: `const { slug, name } = request.body`,
 * `const { id } = req.params`, `{ email } = await request.json()`.
 */
function inputKindsOf(item) {
  const kinds = {};
  for (const p of item.inputs || []) {
    if (/^(self|this|cls)$/.test(p.name) || p.plumbing || !p.type) continue;
    const k = kindWords(p.type) ?? (/^[A-Z]\w*$/.test(String(p.type).trim()) ? `a ${String(p.type).trim()}` : null);
    if (k) kinds[words(p.name)] = k;
  }
  return Object.keys(kinds).length ? kinds : null;
}

/** The names a destructuring pattern takes: `{ a, b: { c, d }, ...rest }: T` -> a, c, d, rest. */
function destructuredNames(text) {
  const open = text.indexOf('{');
  const close = closeOf(text, open);
  if (close < 0) return [];
  const inner = text.slice(open + 1, close);
  const out = [];
  let d = 0, from = 0;
  const part = (x) => {
    const t = x.trim();
    if (!t) return;
    // `...props`: everything else it is given, under one name.
    if (/^\.\.\.[A-Za-z_$][\w$]*$/.test(t)) { out.push(t.slice(3)); return; }
    const m = t.match(/^([A-Za-z_$][\w$]*)\s*:\s*(\{[\s\S]*\})\s*(?:=.*)?$/);
    if (m) { out.push(...destructuredNames(m[2])); return; }
    const n = t.split(/[:=]/)[0].trim();
    if (/^[A-Za-z_$][\w$]*$/.test(n)) out.push(n);
  };
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if ('{[('.includes(c)) d++; else if ('}])'.includes(c)) d--;
    else if (c === ',' && d === 0) { part(inner.slice(from, i)); from = i + 1; }
  }
  part(inner.slice(from));
  return out;
}

function youGiveOf(item) {
  const given = (item.inputs || []).filter((p) => !/^(self|this|cls)$/.test(p.name) && !p.plumbing)
    // Destructured parameters (React props `{ userId, name }`) give each name.
    // Destructured parameters (React props `{ userId, name }`, `{ route: { href }, onClick }: Props`) give each name.
    .flatMap((p) => (/^\{/.test(String(p.name).trim()) ? destructuredNames(String(p.name).trim()) : [p.name]))
    .map((n) => words(n));
  const codes = [];
  const walk = (steps) => { for (const s of steps || []) { if (s.code) codes.push(s.code); walk(s.children); walk(s.otherwise); } };
  walk(item.steps);
  for (const c of codes) {
    // Values read straight from the request: a header, a value in the address, or a field it was sent.
    for (const r of c.matchAll(/\b(?:req|request|ctx\.request|c\.req)\s*\.\s*headers\s*(?:\[\s*['"`]([^'"`]+)['"`]\s*\]|\.\s*get\(\s*['"`]([^'"`]+)['"`]\s*\))/g)) { const h = `the ${r[1] || r[2]} header`; if (!given.includes(h)) given.push(h); }
    // (Only in a web handler, where the request is plumbing; `request.body.locked` on a fetch Request is not a field.)
    if ((item.inputs || []).some((p) => !p.plumbing && /^(?:req|request)$/.test(p.name))) continue;
    for (const r of c.matchAll(/\b(?:req|request|ctx\.request|ctx|c\.req)\s*\.\s*(query|params|body)\s*(?:\.\s*([A-Za-z_][\w]*)|\[\s*['"`]([^'"`]+)['"`]\s*\])/g)) { const n = `${words(r[2] || r[3])} ${r[1] === 'body' ? '(sent in the request)' : '(in the address)'}`; if (!given.includes(n)) given.push(n); }
    const m = c.match(/^(?:const|let|var)\s*\{([^}]+)\}\s*=\s*\(?\s*(?:await\s+)?(?:req|request|ctx\.request|c\.req|event)\s*\.\s*(body|query|params|json\(\))/);
    const where = m ? (/^(query|params)$/.test(m[2]) ? ' (in the address)' : ' (sent in the request)') : '';
    if (!m) continue;
    for (const part of m[1].split(',')) {
      const name = part.split(/[:=]/)[0].replace(/^\.\.\./, '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name) && !given.includes(words(name) + where)) given.push(words(name) + where);
    }
  }
  return given;
}

const dirOf = (p) => (String(p).includes('/') ? String(p).slice(0, String(p).lastIndexOf('/')) : '');
/** The first lines of a file, so a format known by its content (Kubernetes YAML) is recognized. */
const headOf = (f) => (typeof f.source === 'string' ? f.source.slice(0, 2048) : '');

/**
 * Links whose other end is in another file, drawn once every file is read. Only exact matches: a Terraform address in
 * the same folder; a Dockerfile's image by its path; a Kubernetes address (in the same folder first, else the one
 * resource in the repository with it); a Kubernetes selector against the workloads whose pods carry those labels.
 * When more than one folder could be meant, nothing is drawn.
 */
function resolveAcrossFiles(pending, things, links, linkKeys) {
  const add = (p, to) => {
    const key = `${p.from}>${to}>${p.l.kind}>${p.l.line}`;
    if (to && to !== p.from && !linkKeys.has(key)) { linkKeys.add(key); links.push({ from: p.from, to, kind: p.l.kind, file: p.l.file, line: p.l.line }); }
  };
  const resources = things.filter((t) => t.kind === 'resource' && t.address);
  const byDirAddr = new Map(resources.map((t) => [`${dirOf(t.file)}|${t.address}`, t.id]));
  const byAddr = new Map();
  for (const t of resources) byAddr.set(t.address, [...(byAddr.get(t.address) ?? []), t]);
  const oneDir = (hits, dir) => {
    const here = hits.filter((t) => dirOf(t.file) === dir);
    if (here.length) return here;
    return new Set(hits.map((t) => dirOf(t.file))).size === 1 ? hits : [];
  };
  for (const p of pending) {
    const to = p.l.to;
    if (p.language === 'terraform') { add(p, byDirAddr.get(`${p.dir}|${to}`)); continue; }
    if (typeof to === 'string' && to.startsWith('image:')) { const hit = byAddr.get(to); if (hit?.length === 1) add(p, hit[0].id); continue; }
    if (p.l.selector) {
      const hits = resources.filter((t) => t.podLabels && (t.podLabels.ns ?? null) === (p.l.namespace ?? null) && Object.entries(p.l.selector).every(([k, v]) => t.podLabels.labels[k] === v));
      for (const t of oneDir(hits, p.dir)) add(p, t.id);
      continue;
    }
    const hits = oneDir(byAddr.get(to) ?? [], p.dir);
    if (hits.length === 1) add(p, hits[0].id);
  }
}

export function thunderModel(files, { name = 'app' } = {}) {
  const things = [], members = [], links = [], unknowns = [], fileInfo = [], permissions = [], settings = [], facts = [];
  const linkKeys = new Set(), pending = [];
  for (const f of files) {
    const language = readableLanguage(f.path, headOf(f));
    if (!language || !f.source) continue;
    let reading;
    try { reading = readingOf(f, language); } catch (e) { unknowns.push({ file: f.path, line: 1, why: `Could not read this file: ${e.message}` }); fileInfo.push({ path: f.path, language, category: categoryOf(language), skipped: `Could not read this file: ${e.message}` }); continue; }
    const infra = INFRA_LANGUAGES.includes(language) ? reading.infra : null;
    let fileThings = [];
    try { fileThings = infra ? infra.things.map((t) => ({ ...t, knows: t.knows.map((k) => ({ ...k })) })) : language === 'python' ? pythonThings(f.source, f.path) : language === 'typescript' || language === 'javascript' ? tsThings(f.source, f.path) : language === 'sql' ? sqlThings(f.source, f.path) : thingsFor(language, f.source, f.path); }
    catch (e) { unknowns.push({ file: f.path, line: 1, why: `Classes in this file could not be drawn as Things: ${e.message}` }); } // one file never stops the whole app
    if (!infra && !THING_LANGUAGES.includes(language) && /\b(class|struct|record|enum|interface|data class)\s+[A-Z]/.test(f.source)) {
      unknowns.push({ file: f.path, line: 1, why: `Classes, records, and choices in ${language} are not drawn as Things yet; their functions are read.` });
    }
    for (const t of fileThings) { t.id = idOf(f.path, t.name); t.label = infra && t.label ? t.label : cap(words(t.name)); t.can = []; things.push(t); }
    const moduleDoc = language === 'python' ? (f.source.match(/^\s*(?:#.*\n|\s*\n)*[rRuU]?("""|''')([\s\S]*?)\1/)?.[2] ?? '').trim().split(/\n\s*\n/)[0].replace(/\s+/g, ' ') : '';
    const purpose = moduleDoc || reading.purpose || '';
    fileInfo.push({ path: f.path, language, category: categoryOf(language), ...(purpose ? { purpose } : {}) });
    if (infra) {
      permissions.push(...infra.permissions.map((x) => ({ ...x })));
      settings.push(...infra.settings.map((x) => ({ ...x })));
      facts.push(...infra.facts.map((x) => ({ ...x })));
      unknowns.push(...(infra.unknowns ?? []).map((x) => ({ ...x })));
    }

    const fns = reading.items.filter((i) => i.kind === 'function' || i.kind === 'decision');
    const declaredThing = (item) => fileThings.some((t) => t.name === item.name && t.lines[0] === item.line);
    const fileMembers = fns.filter((item) => !declaredThing(item)).map((item) => {
      const owner = infra ? undefined : fileThings.filter((t) => (item.line > t.lines[0] && item.line <= t.lines[1]) || (t.memberRanges || []).some(([a, b]) => item.line >= a && item.line <= b)).sort((a, b) => b.lines[0] - a.lines[0])[0];
      const v = visualFor(item);
      const setup = (/^(__init__|constructor|init|New|__construct|initialize|new)$/.test(item.name) || (owner && item.name === owner.name)) && owner;
      const kind = language === 'github-actions' ? 'pipeline' : language === 'dockerfile' ? 'image-build' : setup ? 'setup' : v.element === 'action' ? 'action' : v.element === 'decision' ? 'rule' : v.element === 'not-read' ? 'not-read' : 'steps';
      const bodyEnd = item.endLine ?? item.anchor?.bodyLines?.[1] ?? Math.max(item.line, ...(item.rules || []).map((r) => r.line || 0), item.otherwise?.line || 0);
      let rule = null;
      if (kind === 'rule') { try { rule = plainFromReading(item); } catch { rule = null; } }
      const m = {
        id: idOf(f.path, owner?.name ?? '', item.name, item.line), kind, name: item.name,
        label: setup ? `A new ${owner.label} starts with` : infra && item.label ? item.label : cap(words(item.name.replace(/^__|__$/g, ''))),
        ...(owner ? { owner: owner.id } : {}), file: f.path, language, lines: [item.line, bodyEnd],
        ...(item.doc ? { doc: item.doc } : {}), ...(item.route ? { route: `${item.route.method} ${item.route.path}`.trim() } : {}), ...(item.when ? { when: item.when } : {}),
        youGive: youGiveOf(item),
        // Each input's kind in words, when the code says it (days late: a number; request: a PingResource).
        ...(inputKindsOf(item) ? { inputKinds: inputKindsOf(item) } : {}),
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
      const start = m.when ?? (m.youGive.length ? `You give it: ${m.youGive.join(', ')}` : 'Start');
      m.flow = m.kind === 'rule' || (m._item.kind === 'decision' && m._item.rules?.length) ? ruleFlow(m._item, start) : flowOf(m._steps, { start, memberIndex: byName, memberLabel: labels });
      if (m.when) { const s0 = m.flow.nodes.find((nd) => nd.kind === 'start'); if (s0) s0.does = 'when'; }
      for (const nd of m.flow.nodes) if (nd.uses && nd.uses !== m.id) links.push({ from: m.id, to: nd.uses, kind: 'uses', node: nd.id });
      delete m._steps; delete m._item;
      // An action's "You get back": every way it ends, from its flow (what it sends back, and the statuses it can stop
      // with), rather than only a declared return type a web handler rarely has.
      if (m.route && m.kind !== 'setup') {
        // (An ending shown as code is not a value in words: it is not listed here, so code never poses as an answer.)
        const ends = [...new Set(m.flow.nodes.filter((nd) => nd.kind === 'end' && !nd.code && !/^(?:Stops here|Done)$/.test(nd.text)).map((nd) => nd.text.replace(/^Gives back /, '')))];
        const stopsWith = [...new Set(m.flow.nodes.filter((nd) => nd.kind === 'stop').map((nd) => (nd.text.match(/^Stop:\s*(\d{3})\b/) || [])[1] ?? nd.text.replace(/^Stop:\s*/, '').split(':')[0].trim()))];
        const parts = [ends.length ? ends.join(', or ') : null, stopsWith.length ? `it stops with ${stopsWith.join(' or ')}` : null].filter(Boolean);
        if (parts.length) m.youGetBack = parts.join('; or ');
      }
      members.push(m);
    }
    // Links the file states (a stage that starts from another, a job that needs another), by member id.
    if (infra) {
      const byItem = new Map(fileMembers.map((m) => [`${m.name}:${m.lines[0]}`, m.id]));
      const byThing = new Map(fileThings.map((t) => [t.name, t.id]));
      for (const l of infra.links) {
        const from = byItem.get(l.from) ?? byThing.get(l.from), to = byItem.get(l.to) ?? byThing.get(l.to);
        const key = `${from}>${to}>${l.kind}>${l.line}`;
        if (from && to && !linkKeys.has(key)) { linkKeys.add(key); links.push({ from, to, kind: l.kind, file: l.file, line: l.line }); }
        // A Terraform module is a folder: a reference to a resource in another file of it is drawn once all are read.
        // Kubernetes and Compose resources (and the Dockerfile a Compose service builds) can be in other files too.
        else if (from && !to && (language === 'terraform' || language === 'kubernetes' || language === 'docker-compose')) pending.push({ dir: dirOf(f.path), from, l, language });
      }
    }
  }
  if (pending.length) resolveAcrossFiles(pending, things, links, linkKeys);
  // A Kubernetes workload whose image has exactly the name of the folder a Dockerfile in the repository is in uses
  // that image (`image: gcr.io/shop/cart:1.2` and `cart/Dockerfile`). Exact names only, and only one such folder.
  const dockerImages = things.filter((t) => t.resourceType === 'docker-image');
  for (const t of things) for (const im of t.images ?? []) {
    const hits = dockerImages.filter((d) => dirOf(d.address.slice('image:'.length)).split('/').pop() === im.name);
    const key = hits.length === 1 && `${t.id}>${hits[0].id}>uses>${im.line}`;
    if (key && !linkKeys.has(key)) { linkKeys.add(key); links.push({ from: t.id, to: hits[0].id, kind: 'uses', file: t.file, line: im.line }); }
  }
  for (const t of things) { delete t.memberRanges; delete t.images; delete t.podLabels; delete t.selects; } // only used while the model is made
  // An empty class (no facts, nothing it can do) is not a Thing a person needs to see: an error type is already shown
  // where it stops a path, and any other empty class is a named record with no facts.
  const owners = new Set(members.map((x) => x.owner).filter(Boolean));
  for (let i = things.length - 1; i >= 0; i--) {
    const t = things[i];
    if (t.kind !== 'thing' || t.knows.length || owners.has(t.id)) continue;
    if (/(Exception|Error)$/.test(t.name)) things.splice(i, 1); else t.kind = 'record';
  }
  return { schema: MODEL_SCHEMA, name, files: fileInfo, things, members, links, unknowns, permissions, settings, facts };
}

// ── Thunder Text, projected from the model (the picture is projected from the same nodes) ──────────────

/** Thunder Text lines from a flow's blocks: the same tree the picture is drawn from. */
function flowLines(flow, depth = 1, note = null) {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const out = [];
  const pad = (d) => '  '.repeat(d);
  // `note` (optional) adds words after a node: the running system's counts (running.mjs).
  const at = (n) => `${n.line ? `  (line ${n.line})` : ''}${(note && note(n)) || ''}`;
  const say = (n) => (n.kind === 'code' || (n.kind === 'end' && n.code) ? `\`${n.text}\` (code, not explained)` : n.kind === 'decision' && n.cases ? n.text : n.kind === 'decision' ? `Ask: ${n.text}${n.code ? ' (code, not explained)' : ''}` : n.kind === 'end' && n.answer ? `Answer: ${n.text}` : n.text);
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
      for (const c of b.cases || []) {
        if (c.blocks.length) { out.push(`${pad(d + 1)}${c.label}:`); go(c.blocks, d + 2); }
        else out.push(`${pad(d + 1)}${c.label}: nothing`);
      }
      if (b.each) { out.push(`${pad(d + 1)}For each:`); go(b.each, d + 2); }
      if (b.body) go(b.body, d + 1);
      for (const h of b.handlers || []) { const t = byId.get(h.id).text.replace(/\?$/, ''); if (h.blocks.length) { out.push(`${pad(d + 1)}${t}:`); go(h.blocks, d + 2); } else out.push(`${pad(d + 1)}${t}: nothing (the error is ignored)`); }
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
export function modelText(model, id, { note = null } = {}) {
  const t = model.things.find((x) => x.id === id);
  if (t) {
    const lines = [t.kind === 'resource' ? `Resource ${t.label} (${t.resourceType})` : `${t.kind === 'thing' ? 'Thing' : t.kind === 'record' ? 'Record' : 'Choices'} ${t.label}`];
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
  if (m.when) lines.push(`  ${m.when}`);
  else if (m.route) lines.push(`  When someone calls ${m.route}`);
  if (m.doc) lines.push(`  Author's note: ${m.doc}`);
  if (m.youGive.length) lines.push(`  You give it: ${m.youGive.join(', ')}`);
  if (m.youGetBack) lines.push(`  You get back: ${m.youGetBack}`);
  lines.push(...flowLines(m.flow, 1, note));
  return `${lines.join('\n')}\n`;
}

// ── The five reading levels: what each one shows, decided here so every product shows the same thing ─────────

const SYMBOL_OF = { action: 'action', rule: 'rule', steps: 'steps', setup: 'setup', 'not-read': 'not-read', thing: 'thing', record: 'record', choices: 'choices', pipeline: 'action', 'image-build': 'steps', resource: 'resource' };

const SETTING_WORDS = { parameter: 'given when it starts or is built', variable: 'a variable kept outside the file', secret: 'a secret (only its name is shown)', literal: 'written in the file', computed: 'worked out when it runs' };
const APPLIED_WORDS = { parameter: 'given when it is applied', computed: 'worked out when it is applied' };
/** A setting in words: where it comes from, its default when the file writes one, and whether it is a secret. */
function settingWords(x, model) {
  const lang = model.files.find((f) => f.path === x.file)?.language;
  const applied = lang === 'terraform' || lang === 'bicep';
  if (x.output) return `given back once it is applied${x.from?.length ? `, from ${x.from.join(', ')}` : ''}${x.secret ? ' (a secret: only its name is shown)' : ''}`;
  const base = (applied && APPLIED_WORDS[x.source]) || (SETTING_WORDS[x.source] ?? x.source);
  if (x.secret && x.source !== 'secret') return `${base}, a secret (only its name is shown)`;
  return `${base}${x.default != null && x.source === 'parameter' ? ` (${x.default} unless told otherwise)` : ''}`;
}

/** Every step of a flow in reading order, with how deep it sits and which path it is on (Yes, No, For each, …). */
function detailSteps(flow) {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const out = [];
  const push = (n, depth, via, text = n.text) => out.push({ id: n.id, text, does: n.does, mark: DOES[n.does]?.mark ?? '·', line: n.line ?? null, depth, ...(via ? { via } : {}), ...(n.kind === 'code' || n.code ? { notExplained: true } : {}) });
  // `via` (Yes, No, For each) labels only the first step of each path, the way Thunder Text writes "Yes:" once.
  const walk = (blocks, depth, via) => {
    for (const b of blocks || []) {
      const n = byId.get(b.id);
      if (n && n.kind !== 'start') { push(n, depth, via); via = null; }
      walk(b.yes, depth + 1, 'Yes');
      walk(b.no, depth + 1, 'No');
      walk(b.each, depth + 1, 'For each');
      for (const c of b.cases || []) walk(c.blocks, depth + 1, c.label);
      walk(b.body, depth + 1, null);
      for (const h of b.handlers || []) { const hn = byId.get(h.id); if (hn) push(hn, depth, null, hn.text.replace(/\?$/, '')); walk(h.blocks, depth + 1, null); }
      if (b.always) { const an = byId.get(b.always.id); if (an) push(an, depth, null); walk(b.always.blocks, depth + 1, null); }
    }
  };
  walk(flow.blocks, 0, null);
  return out;
}


// ── Details: what you need to check before you trust or change an action or rule ─────────────────────────

const CHANGES = /^(Sets|Adds|Removes|Subtracts|Clears|Marks|Saves|Deletes|Updates|Appends|Increases|Decreases|Sends|Records|Stores|Writes)\b/;

/** Each step with the answers that lead to it: [{ question, answer }] from the top of the flow. */
export function pathsOf(flow) {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const out = [];
  const ends = (blocks) => { const last = byId.get((blocks || []).at(-1)?.id); return !!last && (last.kind === 'stop' || last.kind === 'end'); };
  const walk = (blocks, when) => {
    for (const b of blocks || []) {
      const n = byId.get(b.id);
      // Nothing after a Stop or an answer on the same path can happen: those steps are not endings.
      if (out.ended?.has(blocks)) break;
      if (n && n.kind !== 'start') out.push({ node: n, when });
      if (n && (n.kind === 'stop' || n.kind === 'end')) (out.ended ||= new Set()).add(blocks);
      const q = n?.text ?? '';
      walk(b.yes, [...when, { question: q, answer: 'Yes' }]);
      walk(b.no, [...when, { question: q, answer: 'No' }]);
      walk(b.each, [...when, { question: q, answer: 'For each' }]);
      for (const c of b.cases || []) walk(c.blocks, [...when, { question: q, answer: c.label }]);
      // An inner function's steps end only that function: not one of this action's endings.
      if (!b.nested) walk(b.body, when);
      for (const h of b.handlers || []) { const hn = byId.get(h.id); walk(h.blocks, [...when, { question: (hn?.text ?? '').replace(/\?$/, ''), answer: 'Yes' }]); }
      if (b.always) walk(b.always.blocks, when);
      // A question whose one side ends the path (a Stop or an answer) guards everything after it: what follows only
      // happens on the other side. "Gives back org" happens when "Is org set?" is Yes, not always.
      if (n?.kind === 'decision' && (b.yes || b.no)) {
        const yesEnds = ends(b.yes), noEnds = ends(b.no);
        if (yesEnds && !noEnds) when = [...when, { question: q, answer: 'No' }];
        else if (noEnds && !yesEnds) when = [...when, { question: q, answer: 'Yes' }];
      }
    }
  };
  walk(flow.blocks, []);
  return out;
}

/** A rule's answers in words: [{ answer, when }] in order, then the otherwise answer. */
function ruleAnswers(rule) {
  const zero = Object.fromEntries(rule.inputs.map((i) => [i.id, i.kind === 'yesno' ? true : 0]));
  let explained;
  try { explained = explainPlain(rule, zero); } catch { return null; }
  const answers = explained.rules.map((r) => ({ answer: answerWords(r.outcome), when: r.checks.map((c) => c.text).join(r.join === 'any' ? ' or ' : ' and ') }));
  if (rule.otherwise) answers.push({ answer: answerWords(rule.otherwise), when: 'otherwise' });
  return answers;
}

/**
 * The exact limits of a rule with one number fact, found by running it on every whole number around each limit:
 * [{ from, to, answer }] where from/to are null for "or less" / "or more". Only when every limit is a whole number,
 * so the ranges are exact rather than approximate.
 */
function ruleRanges(rule) {
  if (rule.inputs.length !== 1 || rule.inputs[0].kind === 'yesno') return null;
  const id = rule.inputs[0].id;
  const limits = rule.rules.flatMap((r) => r.conditions).filter((c) => c.input === id && typeof c.value === 'number').map((c) => c.value);
  if (!limits.length || !limits.every(Number.isInteger)) return null;
  const lo = Math.min(...limits) - 1, hi = Math.max(...limits) + 1;
  const ranges = [];
  for (let v = lo; v <= hi; v++) {
    let outcome;
    try { outcome = answerWords(explainPlain(rule, { [id]: v }).outcome); } catch { return null; }
    const last = ranges.at(-1);
    if (last && last.answer === outcome) last.to = v; else ranges.push({ from: v, to: v, answer: outcome });
  }
  ranges[0].from = null;
  ranges.at(-1).to = null;
  return { fact: rule.inputs[0].label.replace(/^the /, ''), ranges };
}

function detailsFacts(model, member) {
  const paths = pathsOf(member.flow);
  const memberOf = (id) => model.members.find((m) => m.id === id);
  const inputs = member.youGive.map((label) => {
    const re = new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const lines = [...new Set(paths.filter((p) => re.test(p.node.text) && p.node.line).map((p) => p.node.line))];
    return { label, lines, ...(member.inputKinds?.[label] ? { kind: member.inputKinds[label] } : {}) };
  });
  const changes = paths.filter((p) => p.node.kind !== 'decision' && p.node.kind !== 'stop' && p.node.kind !== 'end' && (p.node.does === 'save' || p.node.does === 'send' || (CHANGES.test(p.node.text) && /'s\b|\bto\b|\bfrom\b/.test(p.node.text))))
    .map((p) => ({ text: p.node.text, line: p.node.line ?? null, does: p.node.does, when: p.when }));
  const stops = paths.filter((p) => p.node.kind === 'stop').map((p) => {
    // `Stop: Error: "the code's message"`, or `Stop: Refused by the database: why` (a reason Thunder words itself,
    // never quoted, since the code holds no such message).
    const m = p.node.text.match(/^Stop:\s*([^:]+?)(?::\s*"(.*)")?$/) ?? p.node.text.match(/^Stop:\s*(Refused by the database):\s*(.+)$/);
    return { error: m ? m[1].trim() : p.node.text, ...(m?.[2] ? { message: m[2] } : {}), line: p.node.line ?? null, when: p.when };
  });
  const givesBack = paths.filter((p) => p.node.kind === 'end' || p.node.answer).map((p) => ({ text: p.node.answer ? answerWords(p.node.text) : p.node.text, line: p.node.line ?? null, when: p.node.otherwise ? [{ question: 'none of the above', answer: 'Otherwise' }] : p.when }));
  const reliesOn = model.links.filter((l) => l.from === member.id).map((l) => memberOf(l.to)).filter(Boolean).map((t) => {
    const answers = t.rule ? ruleAnswers(t.rule) : null;
    const flowAnswers = [...new Set(t.flow.nodes.filter((n) => n.answer).map((n) => n.text))];
    const list = answers ? answers.map((a) => a.answer) : flowAnswers;
    const says = list.length ? `Answers ${list.join(', ').replace(/, ([^,]*)$/, list.length > 2 ? ', or $1' : ' or $1')}.`
      : t.youGetBack ? `Gives back ${t.youGetBack}.` : t.flow.nodes.some((n) => n.kind === 'stop') ? `Can stop with ${t.flow.nodes.filter((n) => n.kind === 'stop').map((n) => n.text.replace(/^Stop:\s*/, '').split(':')[0]).join(', ')}.` : `${t.flow.nodes.filter((n) => n.kind !== 'start').length} steps.`;
    return { id: t.id, label: t.label + (t.yesNo ? '?' : ''), symbol: SYMBOL_OF[t.kind], says };
  });
  const answers = member.rule ? ruleAnswers(member.rule) : null;
  const limits = member.rule ? ruleRanges(member.rule) : null;
  const openQuestions = (member.rule?.needsReview ?? []).filter((q) => !/^No examples yet/.test(q));
  return { inputs, changes, stops, givesBack, reliesOn, ...(answers ? { answers } : {}), ...(limits ? { limits } : {}), openQuestions };
}

/**
 * What one reading level shows: `level` is a LEVELS id (big-picture, flow, details, text, original); `focus` is a
 * Thing or member id, or nothing for the whole model. Flow and Details need an action or rule; without one they
 * give back `needsFocus` and the list to choose from. Deterministic; built only from the model.
 */
export function readLevel(model, level, focus) {
  const lv = LEVELS.find((l) => l.id === level);
  if (!lv) throw new Error(`Unknown reading level "${level}". Use one of: ${LEVELS.map((l) => l.id).join(', ')}.`);
  const member = focus ? model.members.find((m) => m.id === focus) : undefined;
  const thing = focus && !member ? model.things.find((t) => t.id === focus) : undefined;
  if (focus && !member && !thing) throw new Error(`Nothing in this model has the id "${focus}".`);
  const owner = member?.owner ? model.things.find((t) => t.id === member.owner) : undefined;
  const labelOf = (id) => model.members.find((m) => m.id === id)?.label ?? id;
  const short = (m) => ({ id: m.id, label: m.label + (m.yesNo ? '?' : ''), symbol: SYMBOL_OF[m.kind], ...(m.route ? { route: m.route } : {}) });
  const base = { level: lv.id, name: lv.name, question: lv.question };
  const about = member
    ? { scope: 'member', id: member.id, title: member.label + (member.yesNo ? '?' : ''), symbol: SYMBOL_OF[member.kind], file: member.file, lines: member.lines }
    : thing ? { scope: 'thing', id: thing.id, title: thing.label, symbol: SYMBOL_OF[thing.kind], file: thing.file, lines: thing.lines }
    : { scope: 'app', id: null, title: model.name, symbol: 'app', file: model.files[0]?.path ?? null, lines: null };
  const uses = member ? model.links.filter((l) => l.from === member.id).map((l) => ({ id: l.to, label: labelOf(l.to) })) : [];
  const usedBy = member ? model.links.filter((l) => l.to === member.id).map((l) => ({ id: l.from, label: labelOf(l.from) })) : [];

  if (!member && (lv.id === 'flow' || lv.id === 'details')) {
    const inScope = model.members.filter((m) => m.kind !== 'setup' && (!thing || m.owner === thing.id));
    return { ...base, ...about, needsFocus: true, says: `${lv.name} shows one action or rule. Choose one.`, choose: inScope.map(short) };
  }
  if (lv.id === 'big-picture') {
    if (member) {
      return { ...base, ...about, ...(member.route ? { route: member.route } : {}), ...(member.doc ? { doc: member.doc } : {}),
        ...(owner ? { owner: { id: owner.id, label: owner.label } } : {}), youGive: member.youGive, ...(member.youGetBack ? { youGetBack: member.youGetBack } : {}), uses, usedBy };
    }
    const inScope = (m) => m.kind !== 'setup' && (thing ? m.owner === thing.id : true);
    const resourceCard = (t) => ({ id: t.id, label: t.label, symbol: 'resource', resourceType: t.resourceType, address: t.address, file: t.file,
      knows: t.knows.map((k) => ({ label: k.label, value: k.kind, ...(k.computed ? { computed: true } : {}), ...(k.secret ? { secret: true } : {}), line: k.line })),
      links: (model.links || []).filter((l) => l.from === t.id || l.to === t.id).map((l) => ({ from: l.from, to: l.to, kind: l.kind, ...(l.line ? { line: l.line } : {}) })) });
    const resource = thing?.kind === 'resource' ? thing : null;
    const thingCard = (t) => ({ id: t.id, label: t.label, ...(t.doc ? { doc: t.doc } : {}), knows: t.knows.map((k) => ({ label: k.label, ...(k.start ? { start: k.start } : {}) })), can: model.members.filter((m) => m.owner === t.id && m.kind !== 'setup').map(short) });
    return { ...base, ...about,
      ...(thing?.doc ?? model.files[0]?.purpose ? { purpose: thing?.doc ?? model.files[0]?.purpose } : {}),
      things: (resource ? [] : thing ? [thing] : model.things.filter((t) => t.kind === 'thing')).map(thingCard),
      resources: (resource ? [resource] : thing ? [] : model.things.filter((t) => t.kind === 'resource')).map(resourceCard),
      ...(thing ? {} : { permissions: model.permissions ?? [], settings: model.settings ?? [], facts: model.facts ?? [] }),
      data: thing ? [] : model.things.filter((t) => t.kind !== 'thing' && t.kind !== 'resource').map((t) => ({ id: t.id, label: t.label, symbol: SYMBOL_OF[t.kind], ...(t.choices.length ? { choices: t.choices } : {}), knows: t.knows.map((k) => k.label) })),
      actions: model.members.filter((m) => inScope(m) && m.kind === 'action').map(short),
      rules: model.members.filter((m) => inScope(m) && m.kind === 'rule').map(short),
      loose: thing ? [] : model.members.filter((m) => !m.owner && m.kind !== 'setup' && m.kind !== 'action' && m.kind !== 'rule').map(short),
      unknowns: thing ? [] : model.unknowns };
  }
  if (lv.id === 'flow') return { ...base, ...about, flow: member.flow };
  if (lv.id === 'details') {
    const steps = detailSteps(member.flow);
    return { ...base, ...about, youGive: member.youGive, ...(member.youGetBack ? { youGetBack: member.youGetBack } : {}), ...(member.doc ? { doc: member.doc } : {}),
      ...detailsFacts(model, member), steps,
      notExplained: steps.filter((s) => s.notExplained).length, uses, usedBy, tryable: !!member.rule, ...(member.rule ? { rule: member.rule } : {}),
      source: 'Read from code by the Thunder compiler, with no AI.' };
  }
  if (lv.id === 'text') {
    const extra = [];
    if (!focus && model.permissions?.length) extra.push(`Permissions\n${model.permissions.map((p) => `  ${p.says ?? `${p.who} can ${p.can} ${p.on}`}${p.wide && !/\(wide\)/.test(p.says ?? '') ? ' (wide)' : ''}  (line ${p.line})`).join('\n')}\n`);
    if (!focus && model.settings?.length) extra.push(`Settings\n${model.settings.map((x) => `  Setting ${x.name}: ${settingWords(x, model)}  (line ${x.line})`).join('\n')}\n`);
    const text = focus ? modelText(model, focus) : [...model.things.map((t) => modelText(model, t.id)), ...model.members.filter((m) => !m.owner && m.kind !== 'setup').map((m) => modelText(model, m.id)), ...extra].join('\n');
    return { ...base, ...about, text };
  }
  return { ...base, ...about, language: (member ?? thing) ? (member?.language ?? model.files.find((f) => f.path === thing.file)?.language ?? null) : (model.files[0]?.language ?? null) };
}
