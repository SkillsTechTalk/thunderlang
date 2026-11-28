// Thunder Core checker: resolves every name, works out the kind (type) of every value where it can be known,
// and reports what is wrong in plain words with a stable code. It annotates the syntax tree in place:
//   expression.type = { k: 'whole' | 'number' | 'money' | 'text' | 'bool' | 'date' | 'nothing' | 'unknown' |
//                          'list' (of) | 'map' (key, of) | 'record' (name) | 'optional' (of) | 'module' }
//   name.ref        = { kind: 'var' | 'const' | 'param' | 'module' | 'elemField' | 'elemKey', py, ... }
// Unknown types are allowed (values from Python modules, inputs without a declared kind); the runtime then
// checks them (for example, Money refuses to be added to a plain number).

import { diag, closest } from './diagnostics.mjs';
import { RESERVED, LIST_ACTIONS, STATEMENT_WORDS } from './parser.mjs';

const T = (k, extra = {}) => ({ k, ...extra });
const UNKNOWN = T('unknown');
const numeric = (t) => t.k === 'whole' || t.k === 'number';
const known = (t) => t && t.k !== 'unknown';
export const typeWords = (t) => {
  if (!t) return 'a value';
  switch (t.k) {
    case 'whole': return 'a whole number';
    case 'number': return 'a number';
    case 'money': return 'money';
    case 'text': return 'text';
    case 'bool': return 'yes/no';
    case 'date': return 'a date';
    case 'nothing': return 'nothing';
    case 'list': return known(t.of) ? `a list of ${typeWords(t.of).replace(/^an? /, '')}` : 'a list';
    case 'map': return 'a map';
    case 'record': return `a ${t.text ?? t.name}`;
    case 'optional': return `${typeWords(t.of)} or nothing`;
    case 'module': return 'a library';
    default: return 'a value';
  }
};

// Python words a Thunder name must not become.
const PY_TAKEN = new Set(`False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case
print len sorted range list dict str int float bool object super isinstance getattr setattr type id input open sum min max any all map filter iter next round abs format repr hash vars dir set tuple
Decimal date dataclass field main THUNDER_SOURCE THUNDER_TESTS failure
Money Stop RuleBroken ExpectationFailed ThunderError show divide modulo to_number to_whole to_money to_text to_yes_no to_date total_of average_of smallest_of largest_of first_of last_of item_at set_item entry get_field set_field add_to remove_from round_to read_file never expect_value expect_true expect_failure explain run run_tests pairs_of`.split(/\s+/));

export function pyName(key, style = 'snake') {
  const words = key.split(' ').map((w) => w.replace(/[^\p{L}\p{N}_]/gu, '_'));
  let n = style === 'upper' ? words.join('_').toUpperCase() : style === 'pascal' ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join('') : words.join('_').toLowerCase();
  if (/^[0-9]/.test(n)) n = `_${n}`;
  while (PY_TAKEN.has(n)) n += '_';
  return n;
}

/** The closest name, also when two letters are swapped ("cuont" for "count"). */
function nearName(word, options) {
  const sorted = (w) => [...w].sort().join('');
  return closest(word, options) ?? options.find((o) => o.length === word.length && sorted(o) === sorted(word)) ?? null;
}

class Scope {
  constructor(parent, kind) { this.parent = parent; this.kind = kind; this.vars = new Map(); }
  get(key) { return this.vars.get(key) ?? this.parent?.get(key); }
}

export function checkCore(program, { imported = [] } = {}) {
  const c = new Checker(program);
  c.imported = imported;
  c.run();
  return { program, diagnostics: [...program.diagnostics, ...c.d].sort((a, b) => a.line - b.line), info: c.info };
}

class Checker {
  constructor(program) {
    this.p = program;
    this.d = [];
    this.global = new Scope(null, 'global');
    this.records = new Map(); // key -> record stmt
    this.funcs = new Map();
    this.rules = []; // top-level and record Never rules
    this.mainNames = new Map(); // key -> first line it is set in the main program
    this.elem = []; // stack of { type } for where / from / sorted
    this.info = { records: [], funcs: [], consts: [], stores: [], endpoints: [], usesHttp: false, modules: [], tests: [], rules: [], screens: [], usesDecimal: false };
    this.screens = new Map(); // key -> screen stmt
    this.narrow = []; // { name, alt } while checking a case of "Depending on" or "If x is <alternative>"
  }
  err(code, line, msg, hint) { this.d.push(diag(code, line, msg, hint)); }

  run() {
    const top = this.p.body;
    // 0. Declarations from other files of the project (tests see everything in src/).
    this.info.imported = new Set();
    for (const inf of this.imported ?? []) {
      for (const r of inf.records) { this.records.set(r.name, r); this.info.imported.add(r); }
      for (const f of inf.funcs) { this.global.vars.set(f.name, { kind: 'func', line: f.line, name: f.name, text: f.text, py: f.py, stmt: f, ret: f.ret ?? UNKNOWN }); this.funcs.set(f.name, f); this.info.imported.add(f); }
      for (const k of inf.consts) { this.global.vars.set(k.name, { kind: 'const', line: k.line, name: k.name, text: k.text, py: k.py, type: k.e.type ?? UNKNOWN }); this.info.imported.add(k); }
      for (const m of inf.modules) { this.global.vars.set(m.name, { kind: 'module', line: m.line, name: m.name, text: m.text, py: m.py, ecosystem: m.ecosystem, type: T('module') }); this.info.imported.add(m); }
    }
    // 1. Global declarations, hoisted: records, functions, modules, kept values.
    for (const s of top) {
      if (s.k === 'record') this.declare(s, 'record', s.line, { py: pyName(s.name, 'pascal'), stmt: s });
      else if (s.k === 'func') this.declare(s, 'func', s.line, { py: pyName(s.name), stmt: s, ret: UNKNOWN });
      else if (s.k === 'use') this.declare(s, 'module', s.line, { py: pyName(s.name), module: s.module, ecosystem: s.ecosystem, type: T('module') });
      else if (s.k === 'screen') {
        const prev = this.screens.get(s.name);
        if (prev) this.err('TC203', s.line, `There is already a screen called "${s.text}" (line ${prev.line}).`, 'Give one of them a different name.');
        else { this.screens.set(s.name, s); s.py = pyName(s.name, 'pascal'); for (const p of s.params) p.py = pyName(p.name); }
      }
    }
    for (const s of top) if (s.k === 'record') this.checkRecordShape(s);
    this.info.endpointsAll = top.filter((s) => s.k === 'func' && s.endpoint);
    collectMainNames(top, this.mainNames);
    // 2. Kept values, in order (they may use each other and functions).
    for (const s of top) {
      if (s.k !== 'keep') continue;
      const t = this.ex(s.e, this.global, { keep: true });
      this.declare(s, 'const', s.line, { py: pyName(s.name, 'upper'), type: t });
      this.info.consts.push(s);
    }
    // 2b. Stored lists (Store habits as a list of Habit): names every function can see, whose items change and are
    // saved between runs. A record's fields must be plain values so the file says exactly what they are.
    for (const s of top) {
      if (s.k !== 'store') continue;
      const t = s.type;
      const rec = t?.k === 'list' && t.of?.k === 'record' ? this.records.get(t.of.name) : null;
      if (!rec) { this.err('TC306', s.line, `A store holds a list of records, for example: Store habits as a list of Habit.`, 'Describe the record with "A Habit has:", then store a list of it.'); continue; }
      const plain = (ft) => ft && (['whole', 'number', 'money', 'text', 'bool', 'date'].includes(ft.k) || (ft.k === 'optional' && plain(ft.of)));
      const bad = rec.fields.find((f) => !plain(f.type));
      if (bad) { this.err('TC306', s.line, `"${rec.text ?? rec.name}" can't be stored yet: its field "${bad.text ?? bad.name}" is not a plain value.`, 'A stored record\'s fields are whole numbers, numbers, money, text, yes/no, dates, or one of those or nothing.'); continue; }
      s.record = rec;
      this.declare(s, 'store', s.line, { py: pyName(s.name, 'upper'), type: { k: 'list', of: { k: 'record', name: rec.name, text: rec.text } } });
      this.info.stores.push(s);
    }
    // 3. Never rules written at the top level or inside records.
    for (const s of top) if (s.k === 'never') this.addRule(s, null);
    for (const r of this.records.values()) for (const rule of r.rules) this.addRule(rule, r);
    // 4. Functions, then tests, then the main program.
    for (const s of top) if (s.k === 'func') this.checkFunc(s);
    for (const s of top) if (s.k === 'test') { s.py = `test_${pyName(s.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() || 'unnamed')}`.replace(/_+$/, ''); this.uniqueTestName(s); const sc = new Scope(this.global, 'test'); this.block(s.body, sc, { inTest: true }); this.info.tests.push(s); }
    for (const s of this.screens.values()) this.checkScreen(s);
    this.info.screens = [...this.screens.values()];
    const first = this.info.screens[0];
    const needs = first ? first.params.filter((p) => !p.dflt) : [];
    if (needs.length) this.err('TC214', first.line, `"${first.text}" is the first screen, where the app starts, so nothing gives it ${needs.map((p) => p.text).join(', ')}.`, `Put the screen the app starts on first, or give ${needs.length === 1 ? 'the input' : 'each input'} a value for when it isn't given: Receive ${needs[0].text} (… if not given).`);
    const main = new Scope(this.global, 'main');
    this.mainScope = main;
    const mainBody = top.filter((s) => !['record', 'func', 'use', 'keep', 'store', 'never', 'test', 'screen'].includes(s.k));
    this.block(mainBody, main, {});
    this.p.main = mainBody;
    this.info.records = [...this.records.values()];
    this.info.funcs = [...this.funcs.values()];
    this.info.modules = top.filter((s) => s.k === 'use');
    this.info.rules = this.rules;
  }

  uniqueTestName(s) {
    this.testNames ??= new Set();
    let n = s.py, k = 2;
    while (this.testNames.has(n)) n = `${s.py}_${k++}`;
    s.py = n; this.testNames.add(n);
  }

  declare(s, kind, line, extra) {
    const prev = kind === 'record' ? this.records.get(s.name) : this.global.vars.get(s.name);
    if (prev) { this.err('TC203', line, `"${s.text}" is already defined on line ${prev.line}.`, 'Give one of them a different name.'); return; }
    const entry = { kind, line, name: s.name, text: s.text, ...extra };
    if (kind === 'record') { this.records.set(s.name, s); s.py = extra.py; return; }
    this.global.vars.set(s.name, entry);
    if (kind === 'func') this.funcs.set(s.name, s);
    s.py = extra.py;
  }

  checkRecordShape(r) {
    const seen = new Set();
    r.fieldMap = new Map();
    for (const f of r.fields) {
      if (seen.has(f.name)) this.err('TC203', f.line, `${r.text} already has a field "${f.text}".`);
      seen.add(f.name);
      f.py = pyName(f.name);
      this.resolveType(f.type, f.line);
      r.fieldMap.set(f.name, f);
    }
    if (r.alts) this.checkAlternatives(r);
  }
  /** A data type with alternatives: each alternative's fields, one kind per field name, and no field called "which". */
  /**
   * Depending on payment: one case per alternative (or Otherwise). A missing alternative is reported at this line.
   * Then it runs as If payment is successful … Otherwise if payment is declined …, with the value read once per test.
   */
  depending(s, sc, ctx) {
    const line = s.line;
    const t = this.ex(s.subject, sc);
    const r = t.k === 'record' ? this.records.get(t.name) : null;
    const name = s.subject.k === 'name' ? s.subject.name : null;
    const bodies = () => { for (const c of s.cases) this.block(c.body, sc, ctx); if (s.otherwise) this.block(s.otherwise, sc, ctx); };
    if (!r?.altMap) {
      if (known(t)) this.err('TC305', line, `"Depending on" chooses by the alternative a value is, but this is ${typeWords(t)}, not a data type with alternatives.`, 'For other values, use When … / Otherwise when ….');
      bodies(); s.k = 'if'; s.branches = []; return;
    }
    if (!['name', 'field'].includes(s.subject.k)) this.err('TC305', line, `"Depending on" reads its value once for each case, so give it a name first.`, `Set result to …, then write: Depending on result:`);
    const seen = new Set();
    for (const c of s.cases) {
      if (!r.altMap.has(c.alt)) { this.err('TC217', c.line, `A ${r.text} is ${this.altList(r)}; "${c.text}" isn't one of them.`); this.block(c.body, sc, ctx); continue; }
      if (seen.has(c.alt)) this.err('TC203', c.line, `"${c.text}" already has a case above.`);
      seen.add(c.alt);
      if (name) this.narrow.push({ name, alt: c.alt });
      try { this.block(c.body, sc, ctx); } finally { if (name) this.narrow.pop(); }
    }
    if (s.otherwise) this.block(s.otherwise, sc, ctx);
    const missing = [...r.altMap.values()].filter((a) => !seen.has(a.name));
    if (missing.length && !s.otherwise) {
      const ws = missing.map((a) => a.text.toLowerCase());
      this.err('TC215', line, `"Depending on ${s.subject.text ?? 'this'}" doesn't say what to do when it is ${ws.length <= 2 ? ws.join(' or ') : `${ws.slice(0, -1).join(', ')}, or ${ws[ws.length - 1]}`}.`,
        `Add ${missing.map((a) => `"${a.text}:"`).join(' and ')} with what to do, or "Otherwise:" for every case not listed.`);
    }
    const cases = s.cases.filter((c) => r.altMap.has(c.alt));
    Object.assign(s, { k: 'if', branches: cases.map((c) => ({ cond: this.altTest(s.subject, r, c.alt, false, c.line), body: c.body, line: c.line })), otherwise: s.otherwise });
  }

  checkAlternatives(r) {
    r.altMap = new Map();
    for (const a of r.alts) {
      if (r.altMap.has(a.name)) this.err('TC203', a.line, `${r.text} already has an alternative "${a.text}".`);
      a.fieldMap = new Map();
      for (const f of a.fields) {
        if (f.name === 'which') { this.err('TC203', f.line, `"which" is the name Thunder gives to the alternative a ${r.text} is, so a field can't be called that.`, 'Give the field another name.'); continue; }
        if (a.fieldMap.has(f.name)) this.err('TC203', f.line, `${a.text} already has a field "${f.text}".`);
        f.py = pyName(f.name);
        this.resolveType(f.type, f.line);
        const shared = r.fieldMap.get(f.name);
        const plain = (t) => (t.k === 'optional' ? t.of : t);
        if (shared && known(f.type) && known(shared.type) && !sameKind(plain(shared.type), plain(f.type))) {
          this.err('TC303', f.line, `"${f.text}" is ${typeWords(plain(shared.type))} in another alternative of ${r.text}, so here it can't be ${typeWords(plain(f.type))}.`, 'Use one kind for a field name in every alternative, or give the fields different names.');
        }
        a.fieldMap.set(f.name, f);
      }
      r.altMap.set(a.name, a);
    }
  }
  /** The alternatives of a data type, as a person reads them: successful, declined, or pending. */
  altList(r, joiner = 'or') {
    const ws = [...r.altMap.values()].map((a) => a.text.toLowerCase());
    return ws.length <= 2 ? ws.join(` ${joiner} `) : `${ws.slice(0, -1).join(', ')}, ${joiner} ${ws[ws.length - 1]}`;
  }
  /** The alternative a name is known to be here (inside its case, or after "If x is …"), or null. */
  narrowed(e) {
    if (e.k !== 'name') return null;
    for (let i = this.narrow.length - 1; i >= 0; i--) if (this.narrow[i].name === e.name) return this.narrow[i].alt;
    return null;
  }
  /** "x is successful", as the program runs it: x's which equals "successful". */
  altTest(subject, r, alt, neg, line) {
    const which = { k: 'field', obj: subject, name: 'which', text: 'which', py: 'which', static: true, line, type: { k: 'text' } };
    return { k: 'cmp', op: neg ? '!=' : '==', l: which, r: { k: 'str', parts: [alt], line, type: { k: 'text' } }, line, type: { k: 'bool' } };
  }
  resolveType(t, line) {
    if (!t) return;
    if (t.k === 'record') {
      const r = this.records.get(t.name);
      if (!r) this.err('TC209', line, `I don't know a record called "${t.name}".`); else { t.text = r.text; t.py = r.py; }
    }
    if (t.of) this.resolveType(t.of, line);
    if (t.key) this.resolveType(t.key, line);
  }

  addRule(rule, record) {
    // A rule is about exactly one value that changes (a name or a field); kept values may also appear.
    const names = [];
    walkExpr(rule.cond, (e) => { if (e.k === 'name') names.push(e); });
    const changing = [...new Set(names.filter((n) => this.global.vars.get(n.name)?.kind !== 'const').map((n) => n.name))];
    if (changing.length !== 1) {
      this.err('TC403', rule.line, changing.length ? `"${rule.text}" names ${changing.length} changing values (${changing.join(', ')}). In Thunder Core a Never rule is about one value.` : `"${rule.text}" does not name a value to watch.`,
        'Split it into one rule per value, or check the combination with "When … : Stop with …".');
      return;
    }
    const subject = changing[0];
    const fieldOf = record ? (record.fieldMap.has(subject) ? [record] : []) : [...this.records.values()].filter((r) => r.fieldMap.has(subject));
    if (record && !fieldOf.length) { this.err('TC206', rule.line, `${record.text} has no field "${subject}" for this rule to watch.`); return; }
    const isVar = !record && (this.mainNames.has(subject) || this.anyParamOrLocal(subject));
    if (!fieldOf.length && !isVar) { this.err('TC201', rule.line, `"${rule.text}" watches "${subject}", but nothing in this program is called that.`); return; }
    // Type the condition with the subject as an unknown value (it is checked against each place it is set).
    const sc = new Scope(this.global, 'rule');
    const fieldType = fieldOf[0]?.fieldMap.get(subject).type ?? UNKNOWN;
    sc.vars.set(subject, { kind: 'subject', py: 'value', type: fieldType });
    this.ex(rule.cond, sc, {});
    const entry = { rule, subject, records: fieldOf, watchesVar: isVar, line: rule.line, text: rule.text };
    this.rules.push(entry);
    for (const r of fieldOf) (r.rulesToCheck ??= []).push(entry);
  }
  anyParamOrLocal(key) {
    let hit = false;
    const visit = (body) => { for (const s of body) { if (s.k === 'set' && s.target.k === 'name' && s.target.name === key) hit = true; for (const b of childBlocks(s)) visit(b); } };
    for (const f of this.funcs.values()) { if (f.params.some((p) => p.name === key)) hit = true; visit(f.body); }
    for (const s of this.p.body) if (s.k === 'test') visit(s.body);
    return hit;
  }
  rulesFor(key) { return this.rules.filter((r) => r.watchesVar && r.subject === key); }

  /**
   * An endpoint (When someone calls GET /habits/{name}:): a known method, one per method and path, every {part} of
   * the path received, and inputs of kinds a request can carry (an input with no kind is text).
   */
  checkEndpoint(f) {
    const ep = f.endpoint;
    const line = ep.line;
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(ep.method)) this.err('TC108', line, `"${ep.method}" isn't an HTTP method Thunder answers.`, 'Use GET, POST, PUT, PATCH, or DELETE.');
    this.routes ??= new Map();
    const key = `${ep.method} /${ep.segments.map((g) => (g.param ? '{}' : g.lit)).join('/')}`;
    // The same method and path twice is already reported as a name defined twice ("GET /x" is already defined); a
    // different spelling of one route (/x/{a} and /x/{b}) is caught here.
    if (this.routes.has(key) && this.routes.get(key).path !== ep.path) this.err('TC203', line, `${ep.method} ${ep.path} is answered already, by ${ep.method} ${this.routes.get(key).path} (line ${this.routes.get(key).line}).`, 'Each method and path is answered by one endpoint.');
    else if (!this.routes.has(key)) this.routes.set(key, ep);
    const plain = (t) => t && (['whole', 'number', 'money', 'text', 'bool', 'date'].includes(t.k) || (t.k === 'optional' && plain(t.of)));
    for (const p of f.params) {
      if (!p.type) p.type = { k: 'text' };
      if (!plain(p.type)) this.err('TC306', p.line, `"${p.text}" can't come from a request: it is ${typeWords(p.type)}.`, 'An endpoint receives whole numbers, numbers, money, text, yes/no, dates, or optional ones of those. Receive a record\'s fields one by one.');
    }
    for (const g of ep.segments.filter((x) => x.param)) {
      const p = f.params.find((x) => x.name === g.param);
      if (!p) this.err('TC207', line, `The path has {${g.text}}, but the endpoint doesn't receive "${g.text}".`, `Add: Receive ${g.text} as text (or the kind it is).`);
      else g.py = pyName(p.name);
    }
    this.info.endpoints.push(f);
  }

  /** calling GET /habits/walk with name "run": the endpoint that answers it, called directly with those inputs. */
  callEndpoint(e, sc, o) {
    const segs = e.path.split('/').filter(Boolean);
    const f = this.info.endpointsAll?.find((x) => x.endpoint.method === e.method && x.endpoint.segments.length === segs.length && x.endpoint.segments.every((g, i) => g.param || g.lit === segs[i]));
    if (!f) {
      const known = (this.info.endpointsAll ?? []).map((x) => `${x.endpoint.method} ${x.endpoint.path}`);
      this.err('TC207', e.line, `Nothing in this program answers ${e.method} ${e.path}.`, known.length ? `Endpoints: ${known.join(', ')}.` : 'Write one: When someone calls GET /habits:');
      for (const fl of e.fields) this.ex(fl.e, sc, o);
      return UNKNOWN;
    }
    const given = new Map();
    f.endpoint.segments.forEach((g, i) => { if (g.param) given.set(g.param, this.pathValue(segs[i], f.params.find((p) => p.name === g.param), e.line)); });
    for (const fl of e.fields) {
      if (!f.params.some((p) => p.name === fl.name)) { this.err('TC207', e.line, `${f.endpoint.method} ${f.endpoint.path} doesn't receive "${fl.text}".`, `It receives: ${f.params.map((p) => p.text).join(', ') || 'nothing'}.`); continue; }
      if (given.has(fl.name)) { this.err('TC203', e.line, `"${fl.text}" is already given by the path.`); continue; }
      given.set(fl.name, fl.e);
    }
    // Inputs in order, up to the last one given: a default fills a gap, an optional one is nothing, others are needed.
    const args = [];
    const last = f.params.reduce((k, p, i) => (given.has(p.name) ? i : k), -1);
    f.params.forEach((p, i) => {
      if (given.has(p.name)) { args.push(given.get(p.name)); return; }
      if (p.dflt) { if (i < last) args.push(JSON.parse(JSON.stringify(p.dflt))); return; }
      if (p.type?.k === 'optional') { if (i < last) args.push({ k: 'nothing', line: e.line }); return; }
      this.err('TC207', e.line, `${f.endpoint.method} ${f.endpoint.path} needs "${p.text}".`, `Give it: calling ${e.method} ${e.path} with ${p.text} ….`);
    });
    Object.assign(e, { k: 'call', name: f.name, text: f.text, args });
    return this.call(e, sc, o);
  }
  /** A part of a path written in a test (walk, 3) as the value its input receives. */
  pathValue(text, p, line) {
    const k = p?.type?.k === 'optional' ? p.type.of.k : p?.type?.k;
    if ((k === 'whole' || k === 'number') && /^-?\d+(\.\d+)?$/.test(text)) return { k: 'num', text, whole: !text.includes('.'), line };
    if (k === 'money' && /^\d+(\.\d+)?$/.test(text)) return { k: 'money', text, line };
    if (k === 'bool' && /^(yes|no|true|false)$/i.test(text)) return { k: 'bool', v: /^(yes|true)$/i.test(text), line };
    if (k === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(text)) return { k: 'date', text, line };
    if (k && k !== 'text') this.err('TC303', line, `"${text}" in the path isn't ${typeWords(p.type)}, which "${p.text}" is.`);
    return { k: 'str', parts: [decodeURIComponent(text)], line };
  }

  checkStatus(n, line, [lo, hi], what) {
    if (!(n >= lo && n <= hi)) this.err('TC303', line, `${what} ${n}: ${what.startsWith('Give') ? 'an answer that worked' : 'a request that could not be done'} has a status from ${lo} to ${hi}.`, what.startsWith('Give') ? 'For example 200 (done) or 201 (created). To say no, use Stop with "…" and status 404.' : 'For example 400 (bad request), 404 (not found), or 409 (conflict).');
  }

  checkFunc(f) {
    if (f.endpoint) this.checkEndpoint(f);
    const sc = new Scope(this.global, 'func');
    sc.func = f;
    f.gives = [];
    let sawDefault = false;
    for (const p of f.params) {
      if (p.dflt) {
        sawDefault = true;
        // A default is a fixed value (Python would create a list or map default once and share it between calls).
        const fixed = (e) => ['num', 'money', 'percent', 'bool', 'nothing'].includes(e.k) || (e.k === 'str' && e.parts.every((x) => typeof x === 'string'))
          || (e.k === 'neg' && fixed(e.e)) || (e.k === 'name' && this.global.vars.get(e.key ?? e.name)?.kind === 'const');
        const dt = this.ex(p.dflt, this.global, {});
        if (!fixed(p.dflt)) this.err('TC404', p.line, `The default for "${p.text}" must be a fixed value: a number, money, a percent, text, yes/no, nothing, or a kept value.`, p.dflt.k === 'list' || p.dflt.k === 'map' ? 'A list or a map as a default would be shared between calls. Give nothing, and Set it inside the function.' : null);
        else if (p.type && known(p.type) && known(dt) && !compatible(p.type, dt) && dt.k !== 'nothing') this.err('TC303', p.line, `"${p.text}" is ${typeWords(p.type)}, but its default is ${typeWords(dt)}.`);
      } else if (sawDefault) this.err('TC404', p.line, `"${p.text}" has no default, so it must come before the inputs that have one.`);
      if (sc.vars.has(p.name)) this.err('TC203', p.line, `"${p.text}" is received twice.`);
      if (this.global.vars.has(p.name)) this.err('TC203', p.line, `"${p.text}" is already the name of ${this.global.vars.get(p.name).kind === 'func' ? 'a function' : 'something else'} (line ${this.global.vars.get(p.name).line}).`, 'Receive it under a different name.');
      this.resolveType(p.type, p.line);
      p.py = pyName(p.name);
      p.rules = this.rulesFor(p.name);
      sc.vars.set(p.name, { kind: 'param', py: p.py, type: p.type ?? UNKNOWN, line: p.line });
    }
    this.block(f.body, sc, { inFunc: true });
    // The result's kind is known only when every Give gives the same known kind.
    const ts = f.gives;
    const entry = this.global.vars.get(f.name);
    if (entry) entry.ret = ts.length && ts.every(known) && ts.every((t) => sameKind(t, ts[0])) ? (ts.some((t) => t.k === 'number') ? T('number') : ts[0]) : UNKNOWN;
    f.ret = entry?.ret;
  }

  block(body, sc, ctx) { for (const s of body) this.stmt(s, sc, ctx); }

  stmt(s, sc, ctx) {
    const line = s.line;
    if (ctx.inPress && (s.k === 'say' || s.k === 'give' || s.k === 'expect')) {
      const word = { say: 'Say', give: 'Give', expect: 'Expect' }[s.k];
      this.err('TC407', line, `"${word}" can't run when a button is pressed.`, s.k === 'say' ? 'A screen shows things instead: Remember a value, set it here, and Show it on the screen.' : s.k === 'give' ? 'A button gives nothing back. Set a remembered value instead.' : 'Expect lines go in a "Test" block.');
      return;
    }
    switch (s.k) {
      case 'open': {
        if (!ctx.inPress) { this.err('TC402', line, '"Open" is a step for a button: under "When pressed:".'); return; }
        this.screenRef(s, line);
        return;
      }
      case 'screen': this.err('TC402', line, 'A "Screen" must be written at the left edge of the file.'); return;
      case 'say': this.ex(s.e, sc); return;
      case 'set': return this.checkSet(s, sc, ctx);
      case 'keep': this.err('TC402', line, '"Keep" is written at the left edge of the file, not inside a block.', 'Keep values are fixed for the whole program.'); return;
      case 'give': {
        if (!ctx.inFunc || ctx.inTest) { this.err('TC208', line, '"Give" can only be used inside a "To" block, to give back a result.'); return; }
        const t = this.ex(s.e, sc);
        sc.func ? sc.func.gives.push(t) : (findFunc(sc)?.gives.push(t));
        if (s.status != null) this.checkStatus(s.status, line, [200, 299], 'Give … with status');
        return;
      }
      case 'stop': this.ex(s.e, sc); if (s.status != null) this.checkStatus(s.status, line, [400, 599], 'Stop … and status'); return;
      case 'depending': return this.depending(s, sc, ctx);
      case 'if':
        for (const b of s.branches) {
          // If payment is successful: inside, payment is known to be successful.
          const c = b.cond.k === 'isAlt' && b.cond.e.k === 'name' ? { name: b.cond.e.name, alt: b.cond.alt } : null;
          this.cond(b.cond, sc);
          if (c && b.cond.k === 'cmp') this.narrow.push(c);
          try { this.block(b.body, sc, ctx); } finally { if (c && b.cond.k === 'cmp') this.narrow.pop(); }
        }
        if (s.otherwise) this.block(s.otherwise, sc, ctx);
        return;
      case 'each': {
        const it = this.ex(s.iter, sc);
        const inner = new Scope(sc, 'loop');
        const [a, b] = s.vars;
        let ta = UNKNOWN, tb = UNKNOWN;
        if (it.k === 'list') { ta = it.of ?? UNKNOWN; if (b && it.of?.k === 'pair') { ta = it.of.a; tb = it.of.b; } }
        else if (it.k === 'map') { ta = it.key ?? UNKNOWN; tb = it.of ?? UNKNOWN; }
        else if (it.k === 'text') ta = T('text');
        else if (known(it) && it.k !== 'optional') this.err('TC305', line, `"For each" goes through a list, a map, or text, but this is ${typeWords(it)}.`);
        if (b && it.k === 'list' && it.of?.k !== 'pair' && known(it.of)) this.err('TC305', line, `"For each ${a.text} and ${b.text}" needs a map (or a sorted map), but this is ${typeWords(it)}.`);
        s.iterKind = it.k === 'map' ? 'map' : it.k === 'list' && it.of?.k === 'pair' ? 'pairs' : it.k === 'list' || it.k === 'text' ? 'list' : 'unknown';
        for (const [v, t] of [[a, ta], [b, tb]]) if (v) { v.py = this.localPy(v.name, sc); inner.vars.set(v.name, { kind: 'var', py: v.py, type: t, line }); }
        this.block(s.body, inner, ctx);
        return;
      }
      case 'range': {
        for (const e of [s.from, s.to]) { const t = this.ex(e, sc); if (known(t) && t.k !== 'whole') this.err('TC305', line, `"For each … from … to" counts in whole numbers, but this is ${typeWords(t)}.`); }
        const inner = new Scope(sc, 'loop');
        s.v.py = this.localPy(s.v.name, sc);
        inner.vars.set(s.v.name, { kind: 'var', py: s.v.py, type: T('whole'), line });
        this.block(s.body, inner, ctx);
        return;
      }
      case 'while': this.cond(s.cond, sc); this.block(s.body, sc, ctx); return;
      case 'times': { const t = this.ex(s.count, sc); if (known(t) && t.k !== 'whole') this.err('TC305', line, `"Repeat … times" needs a whole number, but this is ${typeWords(t)}.`); this.block(s.body, sc, ctx); return; }
      case 'func': case 'record': case 'use': case 'test': this.err('TC402', line, 'This must be written at the left edge of the file.'); return;
      case 'never': this.err('TC402', line, 'In Thunder Core, "Never allow" is written at the left edge of the file or inside a record ("A … has:").', 'It then watches the value everywhere it is set.'); return;
      case 'expect': return this.checkExpect(s, sc);
      case 'add': case 'remove': {
        const tt = this.ex(s.target, sc);
        const te = this.ex(s.e, sc);
        this.lvalue(s.target, sc, line);
        s.targetKind = tt.k === 'list' ? 'list' : (numeric(tt) || tt.k === 'money') ? 'number' : tt.k === 'map' && s.k === 'remove' ? 'map' : 'unknown';
        if (known(tt) && s.targetKind === 'unknown') this.err('TC305', line, `I can only ${s.k} ${s.k === 'add' ? 'to' : 'from'} a list or a number, but this is ${typeWords(tt)}.`);
        if (s.targetKind === 'number') this.arith(s.k === 'add' ? '+' : '-', tt, te, line);
        if (s.targetKind === 'list' && known(tt.of) && known(te) && !compatible(tt.of, te)) this.err('TC303', line, `This list holds ${typeWords(tt.of)}, so ${typeWords(te)} can't be added to it.`);
        // An empty list learns what it holds from the first thing added to it.
        if (s.k === 'add' && s.targetKind === 'list' && !known(tt.of) && known(te) && s.target.k === 'name' && s.target.ref?.type?.k === 'list') s.target.ref.type = T('list', { of: te });
        this.afterAssign(s, s.target, sc);
        return;
      }
      case 'increase': case 'decrease': {
        const tt = this.ex(s.target, sc);
        const te = this.ex(s.e, sc);
        this.lvalue(s.target, sc, line);
        if (known(tt) && !numeric(tt) && tt.k !== 'money') this.err('TC305', line, `Only a number or money can be ${s.k}d, but this is ${typeWords(tt)}.`);
        this.arith(s.k === 'increase' ? '+' : '-', tt, te, line);
        this.afterAssign(s, s.target, sc);
        return;
      }
      case 'sort': case 'reverse': {
        const tt = this.ex(s.target, sc);
        if (known(tt) && tt.k !== 'list') this.err('TC305', line, `Only a list can be ${s.k === 'sort' ? 'sorted' : 'reversed'}, but this is ${typeWords(tt)}.`);
        if (s.k === 'sort' && s.by) s.field = this.fieldOfElem(tt.of ?? UNKNOWN, s.by, s.text, line);
        return;
      }
      case 'unknownVerb': return this.unknownVerb(s, sc);
      case 'do': this.ex(s.e, sc); return;
      case 'tryFail': {
        this.stmt(s.stmt, sc, ctx);
        const inner = new Scope(sc, 'handler');
        s.errPy = this.localPy('error', sc);
        inner.vars.set('error', { kind: 'var', py: s.errPy, type: T('text'), line });
        this.block(s.handler, inner, ctx);
        return;
      }
      default: this.err('TC402', line, `Thunder Core does not support "${s.k}" here yet.`);
    }
  }

  // ------------------------------------------------------------ screens

  inputChanged(e, entry, line) {
    if (entry.kind === 'item') {
      this.err('TC213', line, `"${e.text}" is an item of the list shown on line ${entry.line}, so it can't be changed here.`, 'Change the remembered list it comes from instead (for example: Remove it from the list, then Add the changed one).');
      return;
    }
    this.err('TC213', line, `"${e.text}" is an input of the screen (line ${entry.line}): the screen that shows it gives it, so it can't be changed here.`,
      `To change it on this screen, remember a copy: Remember ${e.text} now starting at ${e.text}, and change that.`);
  }

  /** "opens Home" / "Open Home": the screen must exist, and it must not need inputs (nothing gives them). */
  screenRef(s, line) {
    const target = this.screens.get(s.name);
    if (!target) {
      const near = nearName(s.name, [...this.screens.keys()]);
      this.err('TC212', line, `I don't know a screen called "${s.text}".`, near ? `Did you mean "${this.screens.get(near).text}"?` : this.screens.size ? `The screens: ${[...this.screens.values()].map((x) => x.text).join(', ')}.` : 'Write it: Screen <name>: and what it shows.');
      return null;
    }
    s.py = target.py;
    const needs = target.params.filter((p) => !p.dflt);
    if (needs.length) this.err('TC214', line, `"${target.text}" needs ${needs.map((p) => p.text).join(', ')}, and a screen that is opened is given no inputs.`, `Give ${needs.length === 1 ? 'it' : 'each'} a value to use when it isn't given: Receive ${needs[0].text} (… if not given). Or show it inside this screen: Show ${target.text}: with the inputs under it.`);
    return target;
  }

  checkScreen(s) {
    const sc = new Scope(this.global, 'screen');
    sc.screen = s;
    for (const p of s.params) {
      if (p.dflt) this.ex(p.dflt, this.global, {});
      if (sc.vars.has(p.name)) this.err('TC203', p.line, `"${p.text}" is received twice.`);
      if (this.global.vars.has(p.name)) this.err('TC203', p.line, `"${p.text}" is already the name of ${this.global.vars.get(p.name).kind === 'func' ? 'a function' : 'something else'} (line ${this.global.vars.get(p.name).line}).`, 'Receive it under a different name.');
      this.resolveType(p.type, p.line);
      if (p.type && p.dflt && known(p.type) && known(p.dflt.type) && !compatible(p.type, p.dflt.type) && p.dflt.type.k !== 'nothing') this.err('TC303', p.line, `"${p.text}" is ${typeWords(p.type)}, but its default is ${typeWords(p.dflt.type)}.`);
      p.py = pyName(p.name);
      sc.vars.set(p.name, { kind: 'input', py: p.py, type: p.type ?? (p.dflt && known(p.dflt.type) ? p.dflt.type : UNKNOWN), line: p.line });
    }
    for (const r of s.remember) {
      const t = this.ex(r.e, sc);
      this.resolveType(r.type, r.line);
      if (r.type && known(r.type) && known(t) && !compatible(r.type, t) && !(t.k === 'list' && r.type.k === 'list' && !known(t.of))) this.err('TC303', r.line, `"${r.text}" is ${typeWords(r.type)}, but it starts at ${typeWords(t)}.`);
      if (sc.vars.has(r.name)) { this.err('TC203', r.line, `"${r.text}" is already ${sc.vars.get(r.name).kind === 'input' ? 'an input' : 'remembered'} on line ${sc.vars.get(r.name).line}.`, 'Give one of them a different name.'); continue; }
      if (this.global.vars.has(r.name)) { this.err('TC203', r.line, `"${r.text}" is already the name of ${this.global.vars.get(r.name).kind === 'func' ? 'a function' : 'something else'} (line ${this.global.vars.get(r.name).line}).`); continue; }
      r.py = pyName(r.name);
      sc.vars.set(r.name, { kind: 'state', py: r.py, type: r.type ?? t, line: r.line });
    }
    this.elements(s.body, sc, s);
  }

  elements(els, sc, screen) {
    for (const el of els) {
      const line = el.line;
      switch (el.k) {
        case 'heading': case 'text': this.ex(el.e, sc); break;
        case 'when':
          for (const b of el.branches) { this.cond(b.cond, sc); this.elements(b.body, sc, screen); }
          if (el.otherwise) this.elements(el.otherwise, sc, screen);
          break;
        case 'list': {
          const it = this.ex(el.iter, sc);
          if (known(it) && it.k !== 'list' && it.k !== 'optional') this.err('TC305', line, `"Show a list" goes through a list, but this is ${typeWords(it)}.`);
          const inner = new Scope(sc, 'loop');
          el.v.py = pyName(el.v.name);
          inner.vars.set(el.v.name, { kind: 'item', py: el.v.py, type: it.k === 'list' ? it.of ?? UNKNOWN : UNKNOWN, line });
          this.elements(el.body, inner, screen);
          break;
        }
        case 'row': this.elements(el.body, sc, screen); break;
        case 'textbox': case 'numberbox': {
          this.ex(el.label, sc);
          const v = sc.get(el.target.name);
          if (!v || (v.kind !== 'state' && v.kind !== 'input')) {
            const near = nearName(el.target.name, [...sc.vars.keys()].filter((k) => sc.vars.get(k).kind === 'state'));
            this.err('TC201', line, `A box changes a remembered value, and this screen remembers nothing called "${el.target.text}".`, near ? `Did you mean "${near}"?` : `Add it at the top of the screen: Remember ${el.target.text} starting at ${el.k === 'textbox' ? '""' : '0'}.`);
            break;
          }
          if (v.kind === 'input') { this.inputChanged(el.target, v, line); break; }
          el.target.ref = v;
          if (el.k === 'textbox' && known(v.type) && v.type.k !== 'text') this.err('TC305', line, `A text box holds text, but "${el.target.text}" is ${typeWords(v.type)}.`, numeric(v.type) ? `Use a number box: Show a number box … for ${el.target.text}.` : null);
          if (el.k === 'numberbox' && known(v.type) && !numeric(v.type)) this.err('TC305', line, `A number box holds a number, but "${el.target.text}" is ${typeWords(v.type)}.`, v.type.k === 'text' ? `Use a text box: Show a text box … for ${el.target.text}.` : 'Money in a box is not supported yet: remember a number.');
          if (!known(v.type)) v.type = el.k === 'textbox' ? T('text') : T('number');
          el.boxKind = v.type.k;
          break;
        }
        case 'button': {
          this.ex(el.label, sc);
          if (el.off) this.cond(el.off, sc);
          if (el.opens) this.screenRef(el.opens, line);
          if (el.press) {
            const ps = new Scope(sc, 'press');
            this.block(el.press.body, ps, { inPress: true });
            el.press.locals = [...ps.vars.values()].map((v) => v.py);
          }
          break;
        }
        case 'child': {
          const target = this.screens.get(el.screen.name);
          if (!target) break; // (the parser knew it)
          el.screen.py = target.py;
          if (target === screen) { this.err('TC402', line, `"${screen.text}" can't show itself: it would never finish showing.`); break; }
          const keys = target.params.map((p) => p.name);
          const given = new Map();
          for (const g of el.given) {
            const t = this.ex(g.e, sc);
            const p = target.params.find((x) => x.name === g.name);
            if (!p) {
              const near = nearName(g.name, keys);
              this.err('TC214', g.line, `"${target.text}" has no input called "${g.text}".${near ? ` Did you mean "${near}"?` : ''}`, keys.length ? `Its inputs: ${keys.join(', ')}.` : `"${target.text}" receives no inputs.`);
              continue;
            }
            if (given.has(g.name)) { this.err('TC114', g.line, `"${g.text}" is given twice (also on line ${given.get(g.name).line}).`, 'Give each input once.'); continue; }
            given.set(g.name, g);
            g.py = p.py;
            if (p.type && known(p.type) && known(t) && !compatible(p.type, t)) this.err('TC303', g.line, `"${target.text}" receives ${p.text} as ${typeWords(p.type)}, but ${typeWords(t)} was given.`);
          }
          const missing = target.params.filter((p) => !p.dflt && !given.has(p.name));
          if (missing.length) this.err('TC214', line, `"${target.text}" needs ${missing.map((p) => p.text).join(', ')}, but ${missing.length === 1 ? 'it is' : 'they are'} not given.`, `Write it as a block:\n    Show ${target.text}:\n      ${missing.map((p) => `${p.text}: …`).join('\n      ')}`);
          break;
        }
        default: this.err('TC402', line, `A screen can't show "${el.k}" yet.`);
      }
    }
  }

  localPy(key, sc) { return pyName(key); }

  checkSet(s, sc, ctx) {
    const line = s.line;
    const tv = this.ex(s.e, sc);
    const tgt = s.target;
    if (tgt.k === 'name') {
      const g = this.global.vars.get(tgt.name);
      if (g && g.kind === 'store') { this.err('TC205', line, `"${tgt.text}" is a stored list (line ${g.line}): change its items, don't replace it.`, `Use Add … to ${tgt.text}, Remove … from ${tgt.text}, or Set ${tgt.text} at <position> to ….`); return; }
      if (g && g.kind === 'const') { this.err('TC205', line, `"${tgt.text}" is kept at a fixed value (line ${g.line}), so it can't be set.`, 'Use a different name for a value that changes, or change the Keep line.'); return; }
      if (g && g.kind !== 'const') { this.err('TC203', line, `"${tgt.text}" is already the name of ${g.kind === 'func' ? 'a function' : g.kind === 'record' ? 'a record' : 'a module'} (line ${g.line}).`, 'Give this value a different name.'); return; }
      const cur = sc.get(tgt.name);
      if (cur && (cur.kind === 'input' || cur.kind === 'item')) { this.inputChanged(tgt, cur, line); return; }
      if (cur && cur.kind !== 'subject') {
        if (cur.kind === 'param' && cur.type && known(cur.type) && known(tv) && !compatible(cur.type, tv)) this.err('TC303', line, `"${tgt.text}" is ${typeWords(cur.type)}, so it can't be set to ${typeWords(tv)}.`);
        else if (known(cur.type) && known(tv) && !compatible(cur.type, tv)) this.err('TC303', line, `"${tgt.text}" was ${typeWords(cur.type)} (line ${cur.line}); now it is set to ${typeWords(tv)}. A name keeps one kind of value.`, 'Use a new name for the new kind of value.');
        else if (!known(cur.type) && known(tv)) cur.type = tv;
        else if (cur.type?.k === 'whole' && tv.k === 'number') cur.type = tv;
        tgt.ref = cur; tgt.type = cur.type;
      } else {
        // A new name lives in the nearest function, test, or main program (not only in a loop or a branch).
        let home = sc;
        while (home.kind === 'loop' || home.kind === 'handler') home = home.parent;
        const entry = { kind: 'var', py: pyName(tgt.name), type: tv, line };
        home.vars.set(tgt.name, entry);
        tgt.ref = entry; tgt.type = tv;
      }
    } else {
      const tt = this.ex(tgt, sc);
      if (tgt.k === 'field' && tgt.name === 'which' && tgt.obj.type?.k === 'record' && this.records.get(tgt.obj.type.name)?.altMap) this.err('TC205', line, `Which alternative a ${tgt.obj.type.text ?? 'value'} is can't be changed.`, 'Build a new one instead: Set payment to a declined Payment with ….');
      this.lvalue(tgt, sc, line);
      if (known(tt) && known(tv) && !compatible(tt, tv)) this.err('TC303', line, `${tgt.k === 'field' ? `The field "${tgt.text}"` : 'This entry'} holds ${typeWords(tt)}, so it can't be set to ${typeWords(tv)}.`);
    }
    this.afterAssign(s, tgt, sc);
  }
  lvalue(e, sc, line) {
    let root = e;
    while (root.k === 'field' || root.k === 'at') root = root.obj;
    if (root.k === 'name' && (root.ref?.kind === 'input' || root.ref?.kind === 'item')) { this.inputChanged(root, root.ref, line); return; }
    if (e.k === 'name') {
      if (e.ref?.kind === 'const') this.err('TC205', line, `"${e.text}" is kept at a fixed value, so it can't be changed.`);
    } else if (e.k === 'field' || e.k === 'at') {
      if (e.obj.k === 'name' && e.obj.ref?.kind === 'const') this.err('TC205', line, `"${e.obj.text}" is kept at a fixed value, so it can't be changed.`);
    } else this.err('TC305', line, 'Only a name, a field, or an entry can be changed here.');
  }
  // Never rules on a name are checked right after it is set (the check names the line where it was set).
  afterAssign(s, tgt, sc) {
    if (tgt.k === 'name') s.rules = this.rulesFor(tgt.name);
  }

  checkExpect(s, sc) {
    const line = s.line;
    if (s.mode === 'true') { this.cond(s.e, sc); return; }
    if (s.mode === 'fail') { this.ex(s.e, sc); if (s.msg) this.ex(s.msg, sc); return; }
    const ta = this.ex(s.e, sc);
    if (s.mode === 'cmp') { this.ex(s.want, sc); return; }
    const c = s.check;
    const hole = (e) => { if (e && e.k === 'hole') e.type = ta; };
    hole(c.l); hole(c.e);
    const inner = c.k === 'not' ? c.e : c;
    hole(inner.l); hole(inner.e);
    walkExpr(c, (e) => { if (e.k === 'hole') e.type = ta; });
    this.ex(c, sc);
  }

  unknownVerb(s, sc) {
    const verb = s.verb.toLowerCase();
    const t = s.object ? this.exQuiet(s.object, sc) : UNKNOWN;
    const funcs = [...this.funcs.values()].map((f) => f.name);
    const guess = closest(verb, [...funcs, ...STATEMENT_WORDS]);
    if (t.k === 'list') this.err('TC401', s.line, `I don't know how to '${verb}' a list yet. Supported: ${LIST_ACTIONS.join(', ')}.`, guess ? `Did you mean "${guess}"?` : 'You can also write a "To" block that does it.');
    else this.err('TC401', s.line, `I don't know how to '${verb}' yet.`, guess ? `Did you mean "${guess}"?` : `A line starts with one of: ${STATEMENT_WORDS.join(', ')}, or the name of a "To" block.`);
  }
  exQuiet(e, sc) { const n = this.d.length; try { return this.ex(e, sc); } finally { this.d.length = n; } }

  cond(e, sc) {
    const t = this.ex(e, sc);
    if (known(t) && t.k !== 'bool') this.err('TC304', e.line, `A condition must be yes or no, but this is ${typeWords(t)}.`, t.k === 'list' || t.k === 'text' ? 'Did you mean "is empty" or "is not empty"?' : 'Compare it with something, for example: is at least 10.');
  }

  // ------------------------------------------------------------ expressions
  ex(e, sc, o = {}) { const t = this.ex1(e, sc, o) ?? UNKNOWN; e.type = t; return t; }

  ex1(e, sc, o) {
    const line = e.line;
    switch (e.k) {
      case 'num': if (!e.whole) this.info.usesDecimal = true; return T(e.whole ? 'whole' : 'number');
      case 'money': return T('money');
      case 'percent': this.info.usesDecimal = true; return T('number');
      case 'str': for (const p of e.parts) if (typeof p !== 'string') this.ex(p.e, sc, o); return T('text');
      case 'bool': return T('bool');
      case 'nothing': return T('nothing');
      case 'hole': return e.type ?? UNKNOWN;
      case 'draftHole': return this.draftHole(e, sc);
      case 'callEndpoint': return this.callEndpoint(e, sc, o);
      case 'httpCall': {
        this.info.usesHttp = true;
        const ut = this.ex(e.url, sc, o);
        if (known(ut) && ut.k !== 'text') this.err('TC305', line, `The address to call is text ("https://…"), but this is ${typeWords(ut)}.`);
        if (e.body) this.ex(e.body, sc, o);
        if (!e.as) return T('text');
        this.resolveType(e.as, line);
        const rec = e.as.k === 'record' ? this.records.get(e.as.name) : e.as.k === 'list' && e.as.of?.k === 'record' ? this.records.get(e.as.of.name) : null;
        const plain = (t) => t && (['whole', 'number', 'money', 'text', 'bool', 'date'].includes(t.k) || (t.k === 'optional' && plain(t.of)));
        if (!rec) { this.err('TC306', line, `An answer is read as a record or a list of records, for example: as Rate, as list of Rate.`, 'Without "as", the answer is its text.'); return UNKNOWN; }
        const bad = rec.fields.find((f) => !plain(f.type));
        if (bad) { this.err('TC306', line, `An answer can't be read as ${rec.text} yet: its field "${bad.text}" is not a plain value.`); return UNKNOWN; }
        e.record = rec;
        return e.as;
      }
      case 'isAlt': {
        const t = this.ex(e.e, sc, o);
        const r = t.k === 'record' ? this.records.get(t.name) : null;
        if (!r?.altMap) { if (known(t)) this.err('TC305', line, `"is ${e.text}" asks which alternative a value is, but this is ${typeWords(t)}, not a data type with alternatives.`); return T('bool'); }
        if (!r.altMap.has(e.alt)) { this.err('TC217', line, `A ${r.text} is ${this.altList(r)}; "${e.text}" isn't one of them.`); return T('bool'); }
        const neg = e.neg;
        Object.assign(e, this.altTest(e.e, r, e.alt, false, line));
        return T('bool');
      }
      case 'today': case 'date': return T('date');
      case 'paren': return this.ex(e.e, sc, o);
      case 'list': {
        if (!e.items) return T('map', { key: UNKNOWN, of: UNKNOWN });
        const ts = e.items.map((x) => this.ex(x, sc, o));
        if (e.of) { this.resolveType(e.of, line); return T('list', { of: e.of }); }
        const kt = ts.find(known);
        if (kt && ts.some((x) => known(x) && !compatible(x, kt))) this.err('TC303', line, 'All items in a list should be the same kind of value.', `This list mixes ${[...new Set(ts.filter(known).map(typeWords))].join(' and ')}.`);
        return T('list', { of: kt ?? UNKNOWN });
      }
      case 'map': return T('map', { key: UNKNOWN, of: UNKNOWN });
      case 'name': return this.name(e, sc, o);
      case 'call': return this.call(e, sc, o);
      case 'new': return this.newRecord(e, sc, o);
      case 'field': {
        const ot = this.ex(e.obj, sc, o);
        const r = ot.k === 'record' ? this.records.get(ot.name) : null;
        if (r?.altMap && e.name !== 'which' && r.fieldMap.has(e.name)) {
          // A field one alternative has: only where that alternative is known.
          const alt = this.narrowed(e.obj);
          const a = alt ? r.altMap.get(alt) : null;
          const owners = [...r.altMap.values()].filter((x) => x.fieldMap.has(e.name));
          const f = a?.fieldMap.get(e.name);
          e.py = r.fieldMap.get(e.name).py; e.static = true;
          if (f) return f.type;
          const who = owners.map((x) => x.text.toLowerCase()).join(' or ');
          if (a) this.err('TC216', line, `A ${a.text.toLowerCase()} ${r.text} has no ${e.text}; only a ${who} one does.`, `Fields of a ${a.text.toLowerCase()} ${r.text}: ${[...a.fieldMap.keys()].join(', ') || 'none'}.`);
          else this.err('TC216', line, `Only a ${who} ${r.text} has ${/^[aeiou]/i.test(e.text) ? 'an' : 'a'} ${e.text}, and here it could be any of them.`, e.obj.k === 'name'
            ? `Check which it is first: put this under "Depending on ${e.obj.text}:" in the ${owners[0]?.text ?? ''} case, or under "If ${e.obj.text} is ${owners[0]?.text.toLowerCase() ?? ''}:".`
            : `Set it to a name first, then check which it is with "Depending on …:".`);
          return UNKNOWN;
        }
        if (r) {
          const f = r.fieldMap.get(e.name);
          if (!f) { const g = closest(e.name, [...r.fieldMap.keys()]); this.err('TC206', line, `A ${r.text} has no field "${e.text}".`, g ? `Did you mean "${g}"? Fields: ${[...r.fieldMap.keys()].join(', ')}.` : `Fields: ${[...r.fieldMap.keys()].join(', ')}.`); return UNKNOWN; }
          e.py = f.py; e.static = true;
          return f.type;
        }
        if (known(ot) && ot.k !== 'map' && ot.k !== 'optional') { this.err('TC305', line, `"'s ${e.text}" reads a field of a record, but this is ${typeWords(ot)}.`); return UNKNOWN; }
        return UNKNOWN;
      }
      case 'at': {
        const ot = this.ex(e.obj, sc, o);
        const kt = this.ex(e.key, sc, o);
        if (e.dflt) this.ex(e.dflt, sc, o);
        e.objKind = ot.k === 'map' ? 'map' : ot.k === 'list' ? 'list' : 'unknown';
        if (ot.k === 'list') { if (known(kt) && kt.k !== 'whole') this.err('TC305', line, `A position in a list is a whole number (1 is the first item), but this is ${typeWords(kt)}.`); return ot.of ?? UNKNOWN; }
        if (ot.k === 'map') return ot.of ?? UNKNOWN;
        if (known(ot)) this.err('TC305', line, `"at" looks up an entry in a map or a position in a list, but this is ${typeWords(ot)}.`);
        return UNKNOWN;
      }
      case 'conv': {
        const from = this.ex(e.e, sc, o);
        this.resolveType(e.type, line);
        const to = e.type;
        if (!['number', 'whole', 'money', 'text', 'bool', 'date', 'list'].includes(to.k)) { this.err('TC402', line, `Converting to ${typeWords(to)} is not supported yet. Supported: number, whole number, money, text, yes/no, date, list.`); return UNKNOWN; }
        if (to.k === 'list') { e.to = 'list'; return T('list', { of: to.of ?? UNKNOWN }); }
        if (to.k === 'number' || to.k === 'money') this.info.usesDecimal = true;
        e.to = to.k; e.from = from;
        return T(to.k);
      }
      case 'where': {
        const lt = this.ex(e.list, sc, o);
        if (known(lt) && lt.k !== 'list') this.err('TC305', line, `"where" picks items from a list, but this is ${typeWords(lt)}.`);
        this.elem.push({ type: lt.of ?? UNKNOWN });
        this.cond(e.cond, sc);
        this.elem.pop();
        return lt.k === 'list' ? lt : T('list', { of: UNKNOWN });
      }
      case 'from': {
        const lt = this.ex(e.list, sc, o);
        if (known(lt) && lt.k !== 'list') { this.err('TC305', line, `"${e.text} from …" takes a field from each item of a list, but this is ${typeWords(lt)}.`); return UNKNOWN; }
        const f = this.fieldOfElem(lt.of ?? UNKNOWN, e.name, e.text, line, true);
        e.field = f;
        return T('list', { of: f?.type ?? UNKNOWN });
      }
      case 'sorted': {
        const lt = this.ex(e.list, sc, o);
        if (lt.k === 'map') {
          if (e.by !== 'key' && e.by !== 'value') { this.err('TC305', line, 'A map is sorted by "key" or by "value".'); return UNKNOWN; }
          e.mapSort = true;
          return T('list', { of: T('pair', { a: lt.key ?? UNKNOWN, b: lt.of ?? UNKNOWN }) });
        }
        if (known(lt) && lt.k !== 'list') { this.err('TC305', line, `Only a list or a map can be sorted, but this is ${typeWords(lt)}.`); return UNKNOWN; }
        e.field = this.fieldOfElem(lt.of ?? UNKNOWN, e.by, e.text, line, true);
        return lt.k === 'list' ? lt : T('list', { of: UNKNOWN });
      }
      case 'dot': {
        const ot = this.ex(e.obj, sc, o);
        if (ot.k !== 'module') this.err('TC402', line, `"${e.attr}" with a dot reaches into a library brought in with "Use". ${e.obj.k === 'name' ? `"${e.obj.text}"` : 'This'} is not one.`, 'Write "Use <module> as <name>" (Python) or Use "<package>" from npm as <name> at the top of the file first.');
        for (const a of e.args ?? []) this.ex(a, sc, o);
        return UNKNOWN;
      }
      case 'op': return this.op(e, sc, o);
      case 'sortedValues': {
        const lt = this.ex(e.list, sc, o);
        if (known(lt) && lt.k !== 'list') this.err('TC305', line, `Only a list can be sorted this way, but this is ${typeWords(lt)}.`, lt.k === 'map' ? 'A map is sorted by "key" or by "value".' : null);
        return lt.k === 'list' ? lt : T('list', { of: UNKNOWN });
      }
      case 'joined': {
        const lt = this.ex(e.list, sc, o), st = this.ex(e.sep, sc, o);
        if (known(lt) && lt.k !== 'list') this.err('TC305', line, `"joined with" joins the items of a list, but this is ${typeWords(lt)}.`);
        if (lt.k === 'list' && known(lt.of) && lt.of.k !== 'text') this.err('TC305', line, `"joined with" joins text, but this list holds ${typeWords(lt.of)}.`, 'Turn each item into text first: (item as text).');
        if (known(st) && st.k !== 'text') this.err('TC305', line, 'What goes between the items is text, for example: joined with ", ".');
        return T('text');
      }
      case 'splitAt': {
        const tt = this.ex(e.text, sc, o), st = this.ex(e.sep, sc, o);
        for (const [x, what] of [[tt, 'what is split'], [st, 'what it is split at']]) if (known(x) && x.k !== 'text') this.err('TC305', line, `"split at" works on text: ${what} is ${typeWords(x)}.`);
        return T('list', { of: T('text') });
      }
      case 'replacing': {
        for (const [x, what] of [[e.text, 'the text'], [e.from, 'what is replaced'], [e.to, 'what replaces it']]) { const xt = this.ex(x, sc, o); if (known(xt) && xt.k !== 'text') this.err('TC305', line, `"replacing … with" works on text: ${what} is ${typeWords(xt)}.`); }
        return T('text');
      }
      case 'affix': {
        for (const x of [e.l, e.r]) { const xt = this.ex(x, sc, o); if (known(xt) && xt.k !== 'text') this.err('TC305', line, `"${e.end ? 'ends' : 'starts'} with" compares text, but this is ${typeWords(xt)}.`); }
        return T('bool');
      }
      case 'round': {
        const t = this.ex(e.e, sc, o);
        if (e.places) { const pt = this.ex(e.places, sc, o); if (known(pt) && pt.k !== 'whole') this.err('TC305', line, 'The number of places to round to is a whole number.'); }
        if (known(t) && !numeric(t) && t.k !== 'money') this.err('TC305', line, `Only a number or money can be rounded, but this is ${typeWords(t)}.`);
        return t.k === 'money' ? t : !e.places && numeric(t) ? T('whole') : known(t) ? T('number') : UNKNOWN;
      }
      case 'readFile': { const t = this.ex(e.path, sc, o); if (known(t) && t.k !== 'text') this.err('TC305', line, 'A file is named with text, for example: read file "orders.csv".'); return T('text'); }
      case 'neg': { const t = this.ex(e.e, sc, o); if (known(t) && !numeric(t) && t.k !== 'money') this.err('TC305', line, `Only numbers and money can be negative, but this is ${typeWords(t)}.`); return t; }
      case 'not': this.cond(e.e, sc); return T('bool');
      case 'bin': {
        if (e.op === 'and' || e.op === 'or') { this.cond(e.l, sc); this.cond(e.r, sc); return T('bool'); }
        const l = this.ex(e.l, sc, o), r = this.ex(e.r, sc, o);
        return this.arith(e.op, l, r, line);
      }
      case 'cmp': {
        const l = this.ex(e.l, sc, o);
        // paid is refunded: a word that is neither a value here nor an alternative of the data type.
        const lr = l.k === 'record' ? this.records.get(l.name) : null;
        if (lr?.altMap && e.r.k === 'name' && !sc.get(e.r.name) && !this.global.vars.get(e.r.name)) { this.err('TC217', line, `A ${lr.text} is ${this.altList(lr)}; "${e.r.text}" isn't one of them.`); return T('bool'); }
        const r = this.ex(e.r, sc, o);
        this.comparable(l, r, line, e.op);
        return T('bool');
      }
      case 'between': { const t = this.ex(e.e, sc, o); this.comparable(t, this.ex(e.lo, sc, o), line, '<='); this.comparable(t, this.ex(e.hi, sc, o), line, '<='); return T('bool'); }
      case 'contains': {
        const l = this.ex(e.l, sc, o), r = this.ex(e.r, sc, o);
        if (known(l) && !['list', 'text', 'map'].includes(l.k)) this.err('TC305', line, `"contains" looks inside a list, a map, or text, but this is ${typeWords(l)}.`);
        if (l.k === 'text' && known(r) && r.k !== 'text') this.err('TC302', line, `Text can only contain text, but this is ${typeWords(r)}.`);
        return T('bool');
      }
      case 'adj': {
        const t = this.ex(e.e, sc, o);
        if (e.adj === 'empty') { if (known(t) && !['list', 'text', 'map'].includes(t.k)) this.err('TC305', line, `Only a list, a map, or text can be empty, but this is ${typeWords(t)}.`); }
        else if (known(t) && !numeric(t) && t.k !== 'money') this.err('TC305', line, `Only numbers and money can be ${e.adj}, but this is ${typeWords(t)}.`);
        return T('bool');
      }
      case 'isNothing': this.ex(e.e, sc, o); return T('bool');
      default: this.err('TC402', line, `Thunder Core can't use "${e.k}" here yet.`); return UNKNOWN;
    }
  }

  name(e, sc, o) {
    const line = e.line;
    // Inside "where" / "sorted by": a field of each item comes first.
    const el = this.elem[this.elem.length - 1];
    if (el) {
      const r = el.type.k === 'record' ? this.records.get(el.type.name) : null;
      if (r && r.fieldMap.has(e.name)) { const f = r.fieldMap.get(e.name); e.ref = { kind: 'elemField', py: f.py }; return f.type; }
      if (!r && !sc.get(e.name) && !el.type.k.match(/^(whole|number|money|text|bool|date)$/)) { e.ref = { kind: 'elemKey', key: e.text }; return UNKNOWN; }
      if (!r && !sc.get(e.name) && e.name === 'it') { e.ref = { kind: 'elem' }; return el.type; }
    }
    if (e.name === 'it' && el) { e.ref = { kind: 'elem' }; return el.type; }
    const v = sc.get(e.name);
    if (v) {
      if (o.keep && v.kind !== 'const' && v.kind !== 'func' && v.kind !== 'module') this.err('TC204', line, `A kept value can only use numbers, text, and other kept values, but "${e.text}" changes.`);
      if (v.kind === 'record') { this.err('TC305', line, `"${e.text}" is a record. Make one with: a ${v.text} with …`); return UNKNOWN; }
      e.ref = v;
      return v.type ?? UNKNOWN;
    }
    // Not found: explain why, as precisely as possible.
    const inFunc = findScope(sc, 'func') ?? findScope(sc, 'test');
    if (inFunc && this.mainNames.has(e.name)) {
      this.err('TC204', line, `${inFunc.func ? `"${inFunc.func.text}"` : 'A test'} can't use "${e.text}", because it is set in the main program (line ${this.mainNames.get(e.name)}).`, inFunc.func ? 'Give it to the function with "Receive", or make it fixed with "Keep".' : 'Set it inside the test, or make it fixed with "Keep".');
      return UNKNOWN;
    }
    if (!inFunc && this.mainNames.has(e.name) && this.mainNames.get(e.name) >= line) {
      this.err('TC211', line, `"${e.text}" is used before it is set (it is first set on line ${this.mainNames.get(e.name)}).`);
      return UNKNOWN;
    }
    const all = [...allNames(sc)];
    const g = closest(e.name, all);
    const fieldHint = [...this.records.values()].find((r) => r.fieldMap.has(e.name));
    this.err('TC201', line, `I don't know what "${e.text}" is.`, g ? `Did you mean "${g}"?` : fieldHint ? `"${e.text}" is a field of ${fieldHint.text}. Write it with an owner: customer's ${e.text}.` : 'Set it first (Set … to …), receive it, or check the spelling.');
    return UNKNOWN;
  }

  call(e, sc, o) {
    const f = this.funcs.get(e.name);
    const entry = this.global.vars.get(e.name);
    if (!f) { this.err('TC201', e.line, `I don't know a function called "${e.text}".`); return UNKNOWN; }
    e.py = f.py;
    e.args.forEach((a, k) => { if (a.k === 'draftHole' && !a.want && f.params[k]?.type) a.expected = f.params[k].type; });
    const ts = e.args.map((a) => this.ex(a, sc, o));
    const required = f.params.filter((p) => !p.dflt).length;
    if (ts.length < required || ts.length > f.params.length) {
      const range = required === f.params.length ? `${f.params.length} value${f.params.length === 1 ? '' : 's'}` : `${required} to ${f.params.length} values`;
      this.err('TC207', e.line, `"${f.text}" receives ${range} (${f.params.map((p) => (p.dflt ? `${p.text}, if given` : p.text)).join(', ') || 'none'}), but ${ts.length} ${ts.length === 1 ? 'was' : 'were'} given.`,
        f.params.length > 1 && ts.length === 1 ? `Separate the values with commas or "and": ${f.text} with ${f.params.map((p) => p.text).join(' and ')}. To give a yes/no made with "and", put it in parentheses.` : null);
    } else f.params.slice(0, ts.length).forEach((p, k) => { if (p.type && known(p.type) && known(ts[k]) && !compatible(p.type, ts[k])) this.err('TC303', e.line, `"${f.text}" receives ${p.text} as ${typeWords(p.type)}, but ${typeWords(ts[k])} was given.`); });
    return entry?.ret ?? UNKNOWN;
  }

  /**
   * A hole in a draft (TC120): what kind of value it needs (written, or expected where it stands) and what is
   * available here with that kind. Thunder asks; it never chooses a value. The hole has its kind, so nothing else on
   * the line is reported because of it.
   */
  /** a successful Payment with amount $5: the alternative's own fields, all it needs, and "which" set for it. */
  newAlternative(e, r, sc, o) {
    const ty = T('record', { name: r.name, text: r.text });
    const a = e.alt ? r.altMap.get(e.alt) : null;
    if (!a) {
      for (const f of e.fields) this.ex(f.e, sc, o);
      const kinds = [...r.altMap.values()].map((x) => `a ${x.text.toLowerCase()} ${r.text}`);
      if (e.alt) this.err('TC217', e.line, `A ${r.text} is ${this.altList(r)}; "${e.altText}" isn't one of them.`);
      else this.err('TC217', e.line, `Say which ${r.text} it is: ${kinds.length <= 2 ? kinds.join(' or ') : `${kinds.slice(0, -1).join(', ')}, or ${kinds[kinds.length - 1]}`}.`, `For example: ${kinds[0]}${r.alts[0]?.fields.length ? ' with …' : ''}.`);
      return ty;
    }
    const given = new Set();
    for (const f of e.fields) {
      const def = a.fieldMap.get(f.name);
      if (def && f.e.k === 'draftHole' && !f.e.want) f.e.expected = def.type;
      const t = this.ex(f.e, sc, o);
      if (!def) { const others = [...r.altMap.values()].filter((x) => x.fieldMap.has(f.name)).map((x) => x.text.toLowerCase()); this.err('TC206', e.line, `A ${a.text.toLowerCase()} ${r.text} has no field "${f.text}"${others.length ? ` (a ${others.join(' or ')} one does)` : ''}.`, `Fields of a ${a.text.toLowerCase()} ${r.text}: ${[...a.fieldMap.keys()].join(', ') || 'none'}.`); continue; }
      f.py = def.py;
      if (given.has(f.name)) this.err('TC203', e.line, `The field "${f.text}" is given twice.`);
      given.add(f.name);
      if (known(def.type) && known(t) && !compatible(def.type, t)) this.err('TC303', e.line, `A ${a.text.toLowerCase()} ${r.text}'s ${def.text} is ${typeWords(def.type)}, but ${typeWords(t)} was given.`);
    }
    const missing = a.fields.filter((f) => !given.has(f.name) && f.type.k !== 'optional' && f.type.k !== 'list' && f.type.k !== 'map');
    if (missing.length) this.err('TC210', e.line, `A ${a.text.toLowerCase()} ${r.text} needs ${missing.map((f) => f.text).join(', ')}.`, `Write: a ${a.text.toLowerCase()} ${r.text} with ${a.fields.map((f) => `${f.text} …`).join(' and ')}.`);
    e.fields.unshift({ name: 'which', text: 'which', py: 'which', e: { k: 'str', parts: [a.name], line: e.line, type: T('text') }, line: e.line });
    return ty;
  }

  draftHole(e, sc) {
    // A record's kind as written in its "A … has:" line (a Line, not a line).
    const named = (t) => (!t ? t : t.k === 'record' ? { ...t, text: this.records.get(t.name)?.text ?? t.text } : t.of ? { ...t, of: named(t.of) } : t);
    const want = named(e.want ?? e.expected ?? null);
    // Stricter than compatible(): only what really is that kind (a whole number can stand for a number, not the
    // other way round, and money is not a number).
    const same = (w, t) => {
      if (!known(w) || !known(t)) return false;
      if (w.k === 'optional') return t.k === 'optional' ? same(w.of, t.of) : same(w.of, t);
      if (w.k === 'number') return t.k === 'number' || t.k === 'whole';
      if (w.k !== t.k) return false;
      if (w.k === 'record') return w.name === t.name;
      if (w.k === 'list') return !known(w.of) || same(w.of, t.of);
      return true;
    };
    const fits = (t) => !want || !known(want) || same(want, t);
    const what = { param: 'input', input: 'input', var: 'value', state: 'remembered value', item: 'item', const: 'kept value', store: 'stored list' };
    const seen = new Set();
    const available = [];
    for (let at = sc; at; at = at.parent) {
      for (const [name, v] of at.vars) {
        if (seen.has(name) || !what[v.kind]) continue;
        seen.add(name);
        if (fits(v.type)) available.push({ name: v.text ?? name, what: what[v.kind], kind: known(v.type) ? typeWords(v.type) : null });
      }
    }
    if (want && known(want)) {
      for (const f of this.funcs.values()) {
        const ret = this.global.vars.get(f.name)?.ret;
        if (same(want, ret)) available.push({ name: f.text, what: 'function', kind: typeWords(ret), call: f.params.length ? `${f.text} with ${f.params.map((p) => p.text).join(' and ')}` : f.text });
      }
    }
    const needs = want ? typeWords(want) : 'a value';
    const typed = want && known(want);
    const shown = available.slice(0, 8).map((a) => (a.what === 'function' ? `${a.call} (a function)` : `${a.name} (${a.what}${!typed && a.kind ? `, ${a.kind}` : ''})`));
    const more = available.length > 8 ? `, and ${available.length - 8} more` : '';
    const hint = !available.length ? `Nothing here is ${needs} yet. Write the value, or receive it as an input.`
      : typed ? `Here, ${needs} could come from: ${shown.join(', ')}${more}.`
        : `Values here: ${shown.join(', ')}${more}. Write the kind after the ? (?number) to see only what fits.`;
    const d = diag('TC120', e.line, `This is a hole: it needs ${needs}, and Thunder won't choose it for you. Fill it in before the program can run.`, hint);
    d.hole = { col: e.col ?? null, needs: want ? needs : null, written: !!e.want, available };
    this.d.push(d);
    return want ?? UNKNOWN;
  }

  newRecord(e, sc, o) {
    const r = this.records.get(e.record);
    if (!r) { this.err('TC209', e.line, `I don't know a record called "${e.record}".`); return UNKNOWN; }
    e.py = r.py;
    if (r.altMap) return this.newAlternative(e, r, sc, o);
    const given = new Set();
    for (const f of e.fields) {
      const def = r.fieldMap.get(f.name);
      if (f.e.k === 'draftHole' && !f.e.want && def?.type) f.e.expected = def.type;
      const t = this.ex(f.e, sc, o);
      if (!def) { const g = closest(f.name, [...r.fieldMap.keys()]); this.err('TC206', e.line, `A ${r.text} has no field "${f.text}".`, g ? `Did you mean "${g}"?` : `Fields: ${[...r.fieldMap.keys()].join(', ')}.`); continue; }
      f.py = def.py;
      if (given.has(f.name)) this.err('TC203', e.line, `The field "${f.text}" is given twice.`);
      given.add(f.name);
      if (known(def.type) && known(t) && !compatible(def.type, t)) this.err('TC303', e.line, `A ${r.text}'s ${def.text} is ${typeWords(def.type)}, but ${typeWords(t)} was given.`);
    }
    const missing = r.fields.filter((f) => !given.has(f.name) && f.type.k !== 'optional' && f.type.k !== 'list' && f.type.k !== 'map');
    if (missing.length) this.err('TC210', e.line, `A ${r.text} needs ${missing.map((f) => f.text).join(', ')}.`, `Write: a ${r.text} with ${r.fields.map((f) => `${f.text} …`).join(' and ')}.`);
    return T('record', { name: r.name, text: r.text });
  }

  op(e, sc, o) {
    const t = this.ex(e.arg, sc, o);
    const line = e.line;
    const need = (kinds, what) => { if (known(t) && !kinds.includes(t.k)) this.err('TC305', line, `"the ${e.word} of" needs ${what}, but this is ${typeWords(t)}.`); };
    const el = t.k === 'list' ? (t.of ?? UNKNOWN) : UNKNOWN;
    switch (e.op) {
      case 'sum': need(['list'], 'a list of numbers or money'); if (known(el) && !numeric(el) && el.k !== 'money') this.err('TC305', line, `Only numbers or money can be added up, but this list holds ${typeWords(el)}.`); return el;
      case 'average': need(['list'], 'a list of numbers or money'); this.info.usesDecimal = true; return el.k === 'money' ? el : known(el) ? T('number') : UNKNOWN;
      case 'count': need(['list', 'map', 'text'], 'a list, a map, or text'); return T('whole');
      case 'length': need(['list', 'map', 'text'], 'text or a list'); return T('whole');
      case 'min': case 'max': case 'first': case 'last': need(['list'], 'a list'); return el;
      case 'words': case 'lines': need(['text'], 'text'); return T('list', { of: T('text') });
      case 'lowercase': case 'uppercase': case 'trimmed': need(['text'], 'text'); return T('text');
      case 'parts': need(['text'], 'text'); return T('list', { of: T('text') });
      case 'abs': if (known(t) && !numeric(t) && t.k !== 'money') this.err('TC305', line, `"the absolute value of" needs a number or money, but this is ${typeWords(t)}.`); return known(t) ? t : UNKNOWN;
      case 'jsonText': return T('text');
      case 'jsonData': need(['text'], 'text'); return UNKNOWN;
      case 'keys': need(['map'], 'a map'); return T('list', { of: t.key ?? UNKNOWN });
      case 'values': need(['map'], 'a map'); return T('list', { of: t.of ?? UNKNOWN });
      default: return UNKNOWN;
    }
  }

  // A field of each item of a list (for "from", "sorted by", "Sort … by"). Plural words name a field only when
  // removing a final "s" or "es" gives exactly a field's name (prices -> price); otherwise the words are used as is.
  fieldOfElem(et, key, text, line, plural = false) {
    const r = et.k === 'record' ? this.records.get(et.name) : null;
    if (!r) return { dynamic: true, key: text, type: UNKNOWN };
    const options = [key, ...(plural ? [key.replace(/es$/, ''), key.replace(/s$/, '')] : [])];
    for (const k of options) if (r.fieldMap.has(k)) { const f = r.fieldMap.get(k); return { py: f.py, type: f.type }; }
    const g = closest(key, [...r.fieldMap.keys()]);
    this.err('TC206', line, `A ${r.text} has no field "${text}".`, g ? `Did you mean "${g}"?` : `Fields: ${[...r.fieldMap.keys()].join(', ')}.`);
    return { dynamic: true, key: text, type: UNKNOWN };
  }

  arith(op, l, r, line) {
    const sym = { '+': 'add', '-': 'subtract', '*': 'multiply', '/': 'divide', mod: 'take the remainder of' }[op];
    if (!known(l) || !known(r)) {
      if ((l.k === 'text' || r.k === 'text') && op !== '+') this.err('TC305', line, `Text can't be used to ${sym}.`);
      return op === '/' ? (l.k === 'money' || r.k === 'money' ? UNKNOWN : UNKNOWN) : (l.k === 'text' || r.k === 'text') && op === '+' ? T('text') : UNKNOWN;
    }
    if (op === '+' && l.k === 'text' && r.k === 'text') return T('text');
    if (op === '+' && l.k === 'list' && r.k === 'list') return l;
    if (l.k === 'text' || r.k === 'text') { this.err('TC305', line, `Text can't be used to ${sym}${op === '+' ? ' with other kinds of values' : ''}.`, op === '+' ? 'To put a value into text, write it in braces: "Total: {total}".' : null); return UNKNOWN; }
    if (numeric(l) && numeric(r)) return op === '/' ? (this.info.usesDecimal = true, T('number')) : l.k === 'whole' && r.k === 'whole' ? T('whole') : T('number');
    if (l.k === 'money' && r.k === 'money') {
      if (op === '*') { this.err('TC305', line, 'Money can\'t be multiplied by money.', 'Multiply money by a plain number: price * 3.'); return UNKNOWN; }
      return op === '/' ? T('number') : T('money');
    }
    if ((l.k === 'money' && numeric(r)) || (numeric(l) && r.k === 'money')) {
      if (op === '*' || (op === '/' && l.k === 'money')) return T('money');
      if (op === '/') { this.err('TC305', line, 'A plain number can\'t be divided by money.'); return UNKNOWN; }
      this.err('TC301', line, `I can't ${sym} money and a plain number.`, `Write the number as money (for example $${'5'}), or turn it into money with "as money".`);
      return T('money');
    }
    this.err('TC305', line, `I can't ${sym} ${typeWords(l)} and ${typeWords(r)}.`);
    return UNKNOWN;
  }

  comparable(l, r, line, op) {
    if (!known(l) || !known(r) || l.k === 'nothing' || r.k === 'nothing') return;
    const order = ['<', '<=', '>', '>='].includes(op);
    if (numeric(l) && numeric(r)) return;
    if (l.k === 'money' && r.k === 'money') return;
    if ((l.k === 'money' && numeric(r)) || (numeric(l) && r.k === 'money')) {
      this.err('TC302', line, 'Money is compared with money, not with a plain number.', `Write the amount as money, for example $100.`);
      return;
    }
    if (l.k !== r.k && !(l.k === 'optional' || r.k === 'optional')) { this.err('TC302', line, `I can't compare ${typeWords(l)} with ${typeWords(r)}.`); return; }
    if (order && (l.k === 'bool' || l.k === 'list' || l.k === 'map' || l.k === 'record')) this.err('TC302', line, `${typeWords(l)} can't be more or less than another; only equal or not.`);
  }
}

function sameKind(a, b) { return a.k === b.k || (numeric(a) && numeric(b)); }
export function compatible(a, b) {
  if (!known(a) || !known(b)) return true;
  if (a.k === 'nothing' || b.k === 'nothing') return a.k === 'optional' || b.k === 'optional' || a.k === b.k || true;
  if (a.k === 'optional') return compatible(a.of, b.k === 'optional' ? b.of : b);
  if (b.k === 'optional') return compatible(a, b.of);
  if (numeric(a) && numeric(b)) return true;
  if (a.k !== b.k) return false;
  if (a.k === 'record') return a.name === b.name;
  if (a.k === 'list') return compatible(a.of ?? UNKNOWN, b.of ?? UNKNOWN);
  return true;
}

function findScope(sc, kind) { for (let s = sc; s; s = s.parent) if (s.kind === kind) return s; return null; }
function findFunc(sc) { for (let s = sc; s; s = s.parent) if (s.func) return s.func; return null; }
function allNames(sc) { const out = new Set(); for (let s = sc; s; s = s.parent) for (const k of s.vars.keys()) out.add(k); return out; }

export function childBlocks(s) {
  switch (s.k) {
    case 'if': return [...s.branches.map((b) => b.body), ...(s.otherwise ? [s.otherwise] : [])];
    case 'each': case 'range': case 'while': case 'times': case 'func': case 'test': return [s.body];
    case 'tryFail': return [[s.stmt], s.handler];
    default: return [];
  }
}
function collectMainNames(top, out) {
  const visit = (body) => {
    for (const s of body) {
      if (s.k === 'func' || s.k === 'test' || s.k === 'record') continue;
      if (s.k === 'set' && s.target.k === 'name' && !out.has(s.target.name)) out.set(s.target.name, s.line);
      if (s.k === 'each') for (const v of s.vars) if (!out.has(v.name)) out.set(v.name, s.line);
      if (s.k === 'range' && !out.has(s.v.name)) out.set(s.v.name, s.line);
      for (const b of childBlocks(s)) visit(b);
    }
  };
  visit(top);
}

export function walkExpr(e, fn) {
  if (!e || typeof e !== 'object') return;
  fn(e);
  for (const k of ['e', 'l', 'r', 'obj', 'key', 'dflt', 'list', 'cond', 'arg', 'places', 'path', 'lo', 'hi']) if (e[k]) walkExpr(e[k], fn);
  for (const a of e.args ?? []) walkExpr(a, fn);
  for (const a of e.items ?? []) walkExpr(a, fn);
  for (const f of e.fields ?? []) walkExpr(f.e, fn);
  if (e.k === 'str') for (const p of e.parts) if (typeof p !== 'string') walkExpr(p.e, fn);
}

export { RESERVED };
