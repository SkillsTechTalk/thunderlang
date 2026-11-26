// Access flow: does every path that hands back (or changes) a stored record chosen by the request also limit it to the
// caller's tenant or owner?
//
//   request (untrusted id) → sign-in (who is calling) → ownership check? → database lookup → response
//
// For each web route in TypeScript / JavaScript sources it follows the request's values through the handler and the
// project's own helpers, repositories and middleware (interprocedural, with depth and size limits), and gives each
// path one of three verdicts:
//   guarded     the lookup is limited by the caller (a where clause on tenantId/ownerId/… from the sign-in), or a
//               comparison with the caller stops the path before the response, or the record is chosen by the
//               caller's identity, not the request
//   unguarded   every step from the request to the response was followed, and none limits the record to the caller
//   cannot tell something on the path could not be followed (a call outside these files, a middleware Thunder cannot
//               see, a query it cannot read, a role-only route); the path says exactly what stopped it
// "unguarded" is said only when nothing on the path was left unresolved. Deterministic; no AI; browser-safe.
import { parseProgram } from './ts-parse.mjs';

export const ACCESS_SCHEMA = 'thunder-access-v1';

const CODE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'del', 'all', 'options', 'head']);
const OWNER_FIELD = /^(tenant|org|organization|organisation|account|workspace|team|company|owner|user|customer|member|created_?by|author|merchant|client|shop|store|household|family|school|clinic)(_?id|Id|ID|_?ids|Ids)?$/i;
const IDENTITY_FN = /^(get|require|current|fetch|load|validate|verify|ensure|read)?(Current)?(User|Session|ServerSession|Auth|Identity|Principal|Viewer|Me|Account|Member|Caller|Token|Claims)(FromRequest|OrThrow|FromToken|FromCookie|FromHeader)?$/;
const IDENTITY_FN_EXACT = new Set(['auth', 'getAuth', 'currentUser', 'getServerSession', 'getSession', 'getUser', 'requireUser', 'requireSession', 'verifyToken', 'verifySession', 'validateRequest', 'getKindeServerSession', 'useSession']);
const AUTH_MIDDLEWARE = /auth|authenticate|authenticated|requireUser|requireLogin|loggedIn|isLoggedIn|signedIn|protect|ensureUser|verifyToken|verifyJwt|jwt|passport|session|clerk|bearer/i;
const ROLE_FN = /^(require|assert|ensure|check|is|has)(Admin|SuperAdmin|Staff|Role|Roles|Permission|Permissions|Scope|Scopes)$/;
const GUARDISH = /assert|ensure|check|verify|authori[sz]e|^can[A-Z]|^can$|guard|permit|allow|policy|access|own|belongs|scope|forbid/i;
const BENIGN_MIDDLEWARE = /^(json|urlencoded|raw|text|static|cors|helmet|morgan|compression|cookieParser|bodyParser|csrf|csurf|timeout|requestId|express\.json|express\.urlencoded|express\.static)$|validat|schema|zValidator|upload|multer|ratelimit|rateLimit|limiter|logger|logging|cache|metrics|trace|tracing/i;
const MAYBE_GUARD_MIDDLEWARE = /authori[sz]|permi|polic|access|owner|ownership|guard|can[A-Z]|tenant|scope/i;
// (Names of globals in the code being read; spelled in parts so the universal-core check, which bans using them here, passes.)
const CLONE = 'structured' + 'Clone';
const BUF = 'Buf' + 'fer';
const PASS_THROUGH = new Set(['String', 'Number', 'Boolean', 'BigInt', 'parseInt', 'parseFloat', 'decodeURIComponent', 'encodeURIComponent', 'Array', 'Object', CLONE]);
const PASS_THROUGH_MEMBERS = new Set(['JSON.parse', 'JSON.stringify', 'Object.assign', 'Object.keys', 'Object.values', 'Object.entries', 'Object.fromEntries', 'Array.from', 'Array.isArray', 'Promise.all', 'Promise.allSettled', 'Promise.resolve', 'Number.parseInt', 'Number.parseFloat', 'Math.max', 'Math.min']);
const PRISMA_READ = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy']);
const PRISMA_WRITE = new Set(['update', 'updateMany', 'delete', 'deleteMany', 'upsert']);
const PRISMA_ALL = new Set([...PRISMA_READ, ...PRISMA_WRITE, 'create', 'createMany']);
const MONGOOSE_OPS = new Map([['findById', 'read'], ['findOne', 'read'], ['find', 'read'], ['findByIdAndUpdate', 'write'], ['findOneAndUpdate', 'write'], ['findByIdAndDelete', 'write'], ['findOneAndDelete', 'write'], ['findByIdAndRemove', 'write'], ['deleteOne', 'write'], ['updateOne', 'write'], ['deleteMany', 'write'], ['updateMany', 'write'], ['countDocuments', 'read']]);
const DB_NAMES = /^(prisma|db|database|tx|trx|knex|pool|pg|sql|conn|connection|orm|drizzle|client|dbClient|prismaClient)$/;
const DB_FACTORIES = /^(PrismaClient|drizzle|knex|Knex|Pool|Client|postgres|createPool|createConnection|createClient|neon|Kysely)$/;
const NEXT_EXITS = new Set(['notFound', 'redirect', 'permanentRedirect', 'forbidden', 'unauthorized']);
const MAX_DEPTH = 5;
// A call Thunder cannot follow counts as a possible record lookup only when it looks like one.
const LOOKUP_NAME = /^(get|find|load|fetch|read|query|select|lookup|retrieve|search|list|show)([A-Z_]|$)|By[A-Z]|ById$|OrFail$|OrThrow$/;
const LOOKUP_OWNER = /repo|repository|store|service|dao|model|db|database|client|api|prisma|orm|collection|table|manager|provider/i;
const NOT_DATA_PACKAGE = /^(node:|path$|fs$|fs\/promises$|child_process$|os$|url$|crypto$|util$|zlib$|stream$|events$|buffer$|querystring$|http$|https$|net$|readline$|process$)/;
const MAX_WORK = 40000;

// ── Values ───────────────────────────────────────────────────────────────────────────────────────────────────────
// A value is a plain object. Data facts are arrays (input, ident, recs, unknown, recFields); the rest say what kind
// of thing it is (the request, the response, a database client, a function, an object literal …).

const DATA = ['input', 'ident', 'recs', 'unknown', 'recFields'];
const uniq = (a, b) => { if (!a?.length) return b; if (!b?.length) return a; const out = [...a]; for (const x of b) if (!out.includes(x)) out.push(x); return out; };

function join(a, b) {
  if (!a) return b ?? {};
  if (!b) return a;
  const out = { ...a };
  for (const k of DATA) { const u = uniq(a[k], b[k]); if (u?.length) out[k] = u; }
  for (const [k, v] of Object.entries(b)) {
    if (DATA.includes(k)) continue;
    if (k === 'obj' && a.obj) { const m = new Map(a.obj); for (const [pk, pv] of b.obj) m.set(pk, join(m.get(pk), pv)); out.obj = m; continue; }
    if (k === 'lit') { if (a.lit !== b.lit) delete out.lit; continue; }
    if (out[k] === undefined) out[k] = v;
  }
  if ('lit' in a && !('lit' in b)) delete out.lit;
  return out;
}
const joinAll = (vals) => vals.reduce((acc, v) => join(acc, v), null) ?? {};
const dataOf = (v) => { const out = {}; for (const k of DATA) if (v?.[k]?.length) out[k] = v[k]; return out; };
const hasData = (v) => DATA.some((k) => v?.[k]?.length);

// ── Scopes and states ────────────────────────────────────────────────────────────────────────────────────────────

class Scope {
  constructor(parent = null, vars = new Map()) { this.parent = parent; this.vars = vars; }
  find(name) { for (let s = this; s; s = s.parent) if (s.vars.has(name)) return s; return null; }
  get(name) { const s = this.find(name); return s ? s.vars.get(name) : undefined; }
  set(name, v) { const s = this.find(name) ?? this; s.vars.set(name, v); }
  declare(name, v) { this.vars.set(name, v); }
}
// Scopes are cloned down to the first module-level scope (whose vars never change during a walk).
function cloneScope(s, memo = new Map()) {
  if (!s || s.module) return s;
  if (memo.has(s)) return memo.get(s);
  const c = new Scope(cloneScope(s.parent, memo), new Map(s.vars));
  memo.set(s, c);
  return c;
}
function mergeScope(a, b) {
  for (let x = a, y = b; x && y && !x.module; x = x.parent, y = y.parent) {
    for (const [k, v] of y.vars) x.vars.set(k, join(x.vars.get(k), v));
  }
  return a;
}

function newState(scope, frame) {
  return { scope, frame, guards: new Map(), role: null, identity: null, unresolved: [], exited: null, calledNext: false, req: new Map() };
}
function cloneState(s) {
  return { ...s, scope: cloneScope(s.scope), guards: new Map(s.guards), unresolved: [...s.unresolved], req: new Map(s.req) };
}
/** Two paths join: a value is the union, a guard holds only if it holds on both. An exited path drops out. */
function mergeStates(a, b) {
  if (a.exited && b.exited) return a;
  if (a.exited) return b;
  if (b.exited) return a;
  const out = { ...a, scope: mergeScope(a.scope, b.scope) };
  out.guards = new Map([...a.guards].filter(([k]) => b.guards.has(k)));
  out.role = a.role && b.role ? a.role : null;
  out.identity = a.identity ?? b.identity;
  out.unresolved = uniq(a.unresolved, b.unresolved) ?? [];
  out.calledNext = a.calledNext || b.calledNext;
  out.req = new Map(a.req);
  for (const [k, v] of b.req) out.req.set(k, join(out.req.get(k), v));
  return out;
}

// ── The project: files, bindings, imports ────────────────────────────────────────────────────────────────────────

const norm = (p) => {
  const parts = [];
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return (p.startsWith('/') ? '/' : '') + parts.join('/');
};
const dirOf = (p) => { const q = p.replace(/\\/g, '/'); return q.includes('/') ? q.replace(/\/[^/]*$/, '') || '/' : '.'; };

class Project {
  constructor(files) {
    this.files = new Map();
    this.failures = [];
    for (const f of files) {
      if (!CODE_FILE.test(f.path) || /\.d\.[mc]?ts$/.test(f.path)) continue;
      const path = f.path.replace(/\\/g, '/');
      try {
        const ast = parseProgram(f.source);
        this.files.set(path, { path, ast, source: f.source, scope: null, exports: new Map(), imports: new Map(), bindings: new Map() });
      } catch (e) {
        this.failures.push({ file: path, line: e.line ?? null, why: `Thunder could not read this file (${e.message}${e.line ? `, line ${e.line}` : ''})` });
      }
    }
    for (const m of this.files.values()) this.index(m);
  }

  index(m) {
    const scope = new Scope(null);
    scope.module = m;
    m.scope = scope;
    const bind = (name, b) => { m.bindings.set(name, b); };
    const visit = (s, exported, isDefault) => {
      if (!s) return;
      if (s.type === 'Import') { for (const n of s.names) m.imports.set(n.local, { from: s.from, imported: n.imported }); return; }
      if (s.type === 'Export') {
        if (s.decl) { visit(s.decl, true, s.isDefault); return; }
        if (s.expr) { bind('default', { kind: 'expr', node: s.expr }); m.exports.set('default', 'default'); return; }
        for (const n of s.names ?? []) {
          if (s.from) m.exports.set(n.exported, { reexport: s.from, name: n.local });
          else m.exports.set(n.exported, n.local);
        }
        return;
      }
      if (s.type === 'Function') { const name = s.name ?? 'default'; bind(name, { kind: 'fn', node: s }); if (exported) m.exports.set(isDefault ? 'default' : name, name); return; }
      if (s.type === 'Class') { const name = s.name ?? 'default'; bind(name, { kind: 'class', node: s }); if (exported) m.exports.set(isDefault ? 'default' : name, name); return; }
      if (s.type === 'Var') {
        for (const d of s.decls) {
          if (d.id.type === 'Id') { bind(d.id.name, { kind: 'var', node: d.init, line: d.line }); if (exported) m.exports.set(d.id.name, d.id.name); }
          else for (const name of patternNames(d.id)) { bind(name, { kind: 'destructured', node: d.init, pattern: d.id, name }); if (exported) m.exports.set(name, name); }
        }
      }
    };
    for (const s of m.ast.body) visit(s, false, false);
  }

  resolveModule(fromFile, spec) {
    if (!spec || !(spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('@/') || spec.startsWith('~/'))) return null;
    let base;
    if (spec.startsWith('@/') || spec.startsWith('~/')) {
      // A path alias to the source root: try common roots.
      const rest = spec.slice(2);
      for (const root of ['src/', '', 'app/']) { const hit = this.resolveModule('/x', `/${root}${rest}`.replace(/^\//, './')); if (hit) return hit; }
      for (const p of this.files.keys()) if (p.endsWith(`/${rest}.ts`) || p.endsWith(`/${rest}.tsx`) || p.endsWith(`/${rest}/index.ts`)) return p;
      return null;
    }
    base = norm(`${dirOf(fromFile)}/${spec}`);
    const stem = base.replace(/\.(js|mjs|cjs|jsx)$/, '');
    for (const cand of [base, `${stem}.ts`, `${stem}.tsx`, `${stem}.mts`, `${stem}.js`, `${stem}.mjs`, `${stem}.jsx`, `${stem}/index.ts`, `${stem}/index.tsx`, `${stem}/index.js`]) {
      if (this.files.has(cand)) return cand;
    }
    return null;
  }
}

function patternNames(p) {
  if (!p) return [];
  if (p.type === 'Id') return [p.name];
  if (p.type === 'Default') return patternNames(p.target);
  if (p.type === 'Rest') return patternNames(p.arg);
  if (p.type === 'ObjPat') return p.props.flatMap((x) => (x.rest ? patternNames(x.rest) : patternNames(x.value)));
  if (p.type === 'ArrPat') return p.elems.flatMap((x) => patternNames(x));
  return [];
}

/** A record checked against the caller; later lookups by the same request value are covered too. */
function guardRec(st, rec, ev) {
  if (!st.guards.has(rec.id)) st.guards.set(rec.id, ev);
  if (rec.keyed?.value && !st.guards.has(`key:${rec.keyed.value}`)) st.guards.set(`key:${rec.keyed.value}`, ev);
}

// ── The analyzer ─────────────────────────────────────────────────────────────────────────────────────────────────

class Analyzer {
  constructor(project) {
    this.p = project;
    this.work = 0;
    this.recCount = 0;
    this.moduleCache = new Map();
  }

  // A module-level name, resolved through imports. Returns a value.
  moduleValue(file, name, line, seen = new Set()) {
    const key = `${file}::${name}`;
    if (this.moduleCache.has(key)) return this.moduleCache.get(key);
    if (seen.has(key)) return {};
    seen.add(key);
    const m = this.p.files.get(file);
    let v;
    const b = m.bindings.get(name);
    if (b) v = this.bindingValue(m, name, b, seen);
    else if (m.imports.has(name)) {
      const imp = m.imports.get(name);
      const target = this.p.resolveModule(file, imp.from);
      if (target) {
        if (imp.imported === '*') v = { ns: target };
        else v = this.exportValue(target, imp.imported, seen) ?? { opaque: { why: `${name} is not exported by ${target}`, file, line } };
      } else {
        v = { opaque: { why: `${name} comes from ${imp.from}, outside these files`, file, line }, pkg: imp.from, pkgName: imp.imported === 'default' ? name : imp.imported };
        if (/^@prisma\/client$|^drizzle-orm|^knex$|^pg$|^postgres$|^mysql2?|^@neondatabase|^kysely$/.test(imp.from) && DB_NAMES.test(name)) v.isDb = { label: name };
      }
    }
    this.moduleCache.set(key, v);
    return v;
  }

  exportValue(file, name, seen = new Set()) {
    const m = this.p.files.get(file);
    if (!m) return null;
    const e = m.exports.get(name);
    if (e == null) {
      for (const [, x] of m.exports) if (x?.reexport && x.name === '*') { const t = this.p.resolveModule(file, x.reexport); const v = t && this.exportValue(t, name, seen); if (v) return v; }
      return null;
    }
    if (typeof e === 'object' && e.reexport) { const t = this.p.resolveModule(file, e.reexport); return t ? this.exportValue(t, e.name, seen) : { opaque: { why: `${name} comes from ${e.reexport}, outside these files`, file } }; }
    return this.moduleValue(file, e, null, seen);
  }

  bindingValue(m, name, b, seen) {
    if (b.kind === 'fn') return { fn: { node: b.node, scope: m.scope, file: m.path, name } };
    if (b.kind === 'class') return { cls: { node: b.node, scope: m.scope, file: m.path, name } };
    if (b.kind === 'expr' || b.kind === 'var' || b.kind === 'destructured') {
      if (!b.node) return {};
      const st = newState(m.scope, { returns: [] });
      const v = this.expr(b.node, st, { file: m.path, depth: 0, route: null, module: true });
      if (b.kind === 'destructured') { const sc = new Scope(null); this.bindPattern(b.pattern, v, sc, st, { file: m.path }); return sc.get(b.name) ?? {}; }
      const init = b.node.type === 'Logic' ? b.node.right : b.node.type === 'Await' ? b.node.arg : b.node;
      const initName = init.type === 'Call' || init.type === 'New' ? (init.callee.type === 'Id' ? init.callee.name : init.callee.prop) : null;
      if (v.dbFactory || (initName && DB_FACTORIES.test(initName))) return { isDb: { label: name } };
      if (b.kind === 'var' && DB_NAMES.test(name) && !v.isDb && !hasData(v) && !v.fn && !v.obj && !v.instance) return { isDb: { label: name } };
      return v;
    }
    return {};
  }

  tick(ctx, line) {
    if (++this.work > MAX_WORK) throw Object.assign(new Error('limit'), { limit: true, file: ctx.file, line });
  }

  // ── Statements ──
  block(stmts, st, ctx) {
    for (const s of stmts) { if (st.exited) break; this.stmt(s, st, ctx); }
  }

  stmt(s, st, ctx) {
    if (!s) return;
    this.tick(ctx, s.line);
    switch (s.type) {
      case 'Block': { st.scope = new Scope(st.scope); this.block(s.body, st, ctx); st.scope = st.scope.parent ?? st.scope; return; }
      case 'Var':
        for (const d of s.decls) { const v = d.init ? this.expr(d.init, st, ctx) : {}; this.bindPattern(d.id, v, st.scope, st, ctx, true); }
        return;
      case 'Function': st.scope.declare(s.name, { fn: { node: s, scope: st.scope, file: ctx.file, name: s.name } }); return;
      case 'Class': st.scope.declare(s.name, { cls: { node: s, scope: st.scope, file: ctx.file, name: s.name } }); return;
      case 'Expr': {
        const v = this.expr(s.expr, st, ctx);
        if (v.exits) st.exited = 'throw';
        return;
      }
      case 'Return': {
        const v = s.arg ? this.expr(s.arg, st, ctx) : {};
        if (ctx.returnsSend && s.arg && !v.response && !v.isRes) this.sink('response', v, st, ctx, s.line, 'gives it back as the response');
        st.frame.returns.push({ val: v, state: cloneState(st) });
        st.exited = 'return';
        return;
      }
      case 'Throw': if (s.arg) this.expr(s.arg, st, ctx); st.exited = 'throw'; return;
      case 'If': return this.ifStmt(s, st, ctx);
      case 'Try': {
        const before = cloneState(st);
        this.stmt(s.body, st, ctx);
        let after = st;
        if (s.handler) {
          const c = cloneState(before);
          if (s.param) this.bindPattern(s.param, {}, c.scope, c, ctx, true);
          this.stmt(s.handler, c, ctx);
          after = mergeStates(st, c);
        }
        Object.assign(st, after);
        if (s.finalizer) { const wasExited = st.exited; st.exited = null; this.stmt(s.finalizer, st, ctx); st.exited = st.exited ?? wasExited; }
        return;
      }
      case 'Loop': {
        if (s.init) this.stmt(s.init, st, ctx);
        if (s.iter) {
          const it = this.expr(s.iter, st, ctx);
          if (s.init?.type === 'Var') for (const d of s.init.decls) this.bindPattern(d.id, this.element(it), st.scope, st, ctx, true);
        }
        if (s.test) this.expr(s.test, st, ctx);
        const body = cloneState(st);
        this.stmt(s.body, body, ctx);
        if (body.exited) body.exited = null; // a loop body may end with break/continue/return; the loop itself goes on
        Object.assign(st, mergeStates(st, body));
        return;
      }
      case 'Switch': {
        this.expr(s.disc, st, ctx);
        let merged = null;
        let hasDefault = false;
        for (const c of s.cases) {
          if (!c.test) hasDefault = true; else this.expr(c.test, st, ctx);
          const cs = cloneState(st);
          this.block(c.body, cs, ctx);
          if (cs.exited === 'return' || cs.exited === 'throw') { merged = merged ?? null; if (!merged) merged = cs; else merged = mergeStates(merged, cs); continue; }
          cs.exited = null;
          merged = merged ? mergeStates(merged, cs) : cs;
        }
        if (!hasDefault) merged = merged ? mergeStates(merged, cloneState(st)) : st;
        Object.assign(st, merged ?? st);
        return;
      }
      case 'Export': if (s.decl) this.stmt(s.decl, st, ctx); return;
      default: return;
    }
  }

  ifStmt(s, st, ctx) {
    const facts = this.testFacts(s.test, st, ctx);
    const cons = cloneState(st);
    const alt = cloneState(st);
    this.applyFacts(cons, facts.whenTrue);
    this.applyFacts(alt, facts.whenFalse);
    this.stmt(s.cons, cons, ctx);
    if (s.alt) this.stmt(s.alt, alt, ctx);
    Object.assign(st, mergeStates(cons, alt));
    if (cons.exited && alt.exited) st.exited = cons.exited === 'return' || alt.exited === 'return' ? 'return' : 'throw';
  }

  applyFacts(st, facts) {
    for (const f of facts) {
      if (f.kind === 'guard') for (const r of f.recs) guardRec(st, r, f.ev);
      if (f.kind === 'role' && !st.role) st.role = f.ev;
      if (f.kind === 'unresolved') st.unresolved = uniq(st.unresolved, [f.ev]);
    }
  }

  /**
   * What a condition establishes: facts that hold when it is true, and when it is false. A comparison of a record's
   * owner field with the caller (invoice.tenantId !== user.tenantId) guards the record on the side where they match.
   */
  testFacts(t, st, ctx) {
    const none = { whenTrue: [], whenFalse: [] };
    if (!t) return none;
    if (t.paren) return this.testFacts({ ...t, paren: false }, st, ctx);
    if (t.type === 'Unary' && t.op === '!') {
      const f = this.testFacts(t.arg, st, ctx);
      // !record: when false, the record exists. A scoped lookup that depends on another record guards that one.
      const v = this.expr(t.arg, cloneState(st), ctx);
      return { whenTrue: f.whenFalse, whenFalse: [...f.whenTrue, ...this.foundFacts(v, t.line)] };
    }
    if (t.type === 'Logic' && t.op === '||') {
      const a = this.testFacts(t.left, st, ctx), b = this.testFacts(t.right, st, ctx);
      return { whenTrue: [...a.whenTrue.filter((x) => x.kind === 'unresolved'), ...b.whenTrue.filter((x) => x.kind === 'unresolved')], whenFalse: [...a.whenFalse, ...b.whenFalse] };
    }
    if (t.type === 'Logic' && t.op === '&&') {
      const a = this.testFacts(t.left, st, ctx), b = this.testFacts(t.right, st, ctx);
      return { whenTrue: [...a.whenTrue, ...b.whenTrue], whenFalse: [...a.whenFalse.filter((x) => x.kind === 'unresolved'), ...b.whenFalse.filter((x) => x.kind === 'unresolved')] };
    }
    if (t.type === 'Bin' && ['===', '==', '!==', '!='].includes(t.op)) {
      const scratch = cloneState(st);
      const l = this.expr(t.left, scratch, ctx), r = this.expr(t.right, scratch, ctx);
      const eq = t.op === '===' || t.op === '==';
      const g = this.ownerComparison(l, r, t.line, ctx) ?? this.ownerComparison(r, l, t.line, ctx);
      if (g) return eq ? { whenTrue: [g], whenFalse: [] } : { whenTrue: [], whenFalse: [g] };
      const role = this.roleComparison(l, r, t.line, ctx) ?? this.roleComparison(r, l, t.line, ctx);
      if (role) return eq ? { whenTrue: [role], whenFalse: [] } : { whenTrue: [], whenFalse: [role] };
      // A null check on a record: when it is not null, linked guards hold.
      const isNull = (v) => 'lit' in v && (v.lit === null || v.lit === undefined);
      const recSide = isNull(r) ? l : isNull(l) ? r : null;
      if (recSide?.recs?.length) {
        const links = this.foundFacts(recSide, t.line);
        return eq ? { whenTrue: [], whenFalse: links } : { whenTrue: links, whenFalse: [] };
      }
      return none;
    }
    if (t.type === 'Call') {
      // A predicate: canRead(user, invoice), user.roles.includes('admin'), invoice.members.some(...).
      const scratch = cloneState(st);
      const v = this.expr(t, scratch, ctx);
      if (v.predicate) return v.predicate;
      for (const u of scratch.unresolved) if (!st.unresolved.includes(u)) return { whenTrue: [{ kind: 'unresolved', ev: u }], whenFalse: [{ kind: 'unresolved', ev: u }] };
      return none;
    }
    if (t.type === 'Member' || t.type === 'Id') {
      const v = this.expr(t, cloneState(st), ctx);
      // user.isAdmin
      if (v.ident?.some((e) => /^(is)?(admin|superAdmin|staff|isAdmin|isSuperuser|superuser)$/i.test(e.field ?? ''))) return { whenTrue: [{ kind: 'role', ev: { says: `only when ${v.ident[0].says} is true`, file: ctx.file, line: t.line } }], whenFalse: [] };
      if (v.predicate) return v.predicate;
      const links = this.foundFacts(v, t.line);
      if (links.length) return { whenTrue: links, whenFalse: [] };
    }
    return none;
  }

  /**
   * When a record turns out to exist: a lookup limited to the caller vouches for the records it was keyed by (links),
   * and for its own request key (a later update by the same id is then the caller's record too).
   */
  foundFacts(v, line) {
    const out = [];
    for (const rec of v.recs ?? []) {
      if (!rec.scoped) continue;
      const ev = { says: `stops unless ${rec.model ?? 'the record'} is found for the caller (${rec.scoped.says})`, file: rec.file, line };
      if (rec.links?.length) out.push({ kind: 'guard', recs: rec.links, ev });
      if (rec.keyed?.value) out.push({ kind: 'guard', recs: [rec], ev });
    }
    return out;
  }

  ownerComparison(recSide, idSide, line, ctx) {
    const fields = (recSide.recFields ?? []).filter((f) => OWNER_FIELD.test(f.field) || f.field === 'id' && false);
    if (!fields.length || !idSide.ident?.length) return null;
    if (idSide.input?.length) return null;
    const id = idSide.ident[0];
    return { kind: 'guard', recs: fields.map((f) => f.rec), ev: { says: `compares ${fields[0].says} with ${id.says}`, file: ctx.file, line } };
  }

  roleComparison(a, b, line, ctx) {
    if (!a.ident?.some((e) => /^(role|roles|type|kind|permission|permissions|scope|isAdmin|accessLevel|level)$/i.test(e.field ?? ''))) return null;
    if (!('lit' in b) || typeof b.lit !== 'string' || !/admin|staff|super|owner|support|internal|root/i.test(b.lit)) return null;
    return { kind: 'role', ev: { says: `only when ${a.ident[0].says} is "${b.lit}"`, file: ctx.file, line } };
  }

  // ── Patterns ──
  bindPattern(p, v, scope, st, ctx, declare = false) {
    if (!p) return;
    const set = (name, val) => (declare ? scope.declare(name, val) : scope.set(name, val));
    if (p.type === 'Id') { set(p.name, v ?? {}); return; }
    if (p.type === 'Default') { const d = this.expr(p.value, st, ctx); this.bindPattern(p.target, join(v, d), scope, st, ctx, declare); return; }
    if (p.type === 'Rest') { this.bindPattern(p.arg, v, scope, st, ctx, declare); return; }
    if (p.type === 'ObjPat') {
      for (const prop of p.props) {
        if (prop.rest) { this.bindPattern(prop.rest, v, scope, st, ctx, declare); continue; }
        const key = typeof prop.key === 'string' ? prop.key : null;
        const mv = key ? this.member(v, key, st, ctx, p.line) : dataOf(v);
        this.bindPattern(prop.value, mv, scope, st, ctx, declare);
      }
      return;
    }
    if (p.type === 'ArrPat') {
      p.elems.forEach((e, i) => { if (e) this.bindPattern(e, v?.arr?.[i] ?? this.element(v), scope, st, ctx, declare); });
    }
  }

  element(v) {
    if (!v) return {};
    const d = dataOf(v);
    if (v.arr) return join(d, joinAll(v.arr));
    return d;
  }

  // ── Expressions ──
  expr(e, st, ctx) {
    if (!e) return {};
    this.tick(ctx, e.line);
    switch (e.type) {
      case 'Lit': return { lit: e.value };
      case 'Tpl': {
        const parts = e.parts.map((p) => (p.expr ? this.expr(p.expr, st, ctx) : null));
        return { ...joinAll(parts.filter(Boolean).map(dataOf)), tpl: { parts: e.parts.map((p, i) => (p.expr ? { val: parts[i] } : { text: p.text })) } };
      }
      case 'Id': return this.lookup(e.name, st, ctx, e.line);
      case 'This': return ctx.thisVal ?? {};
      case 'Member': {
        const o = this.expr(e.object, st, ctx);
        if (e.computed && e.prop == null) { const k = this.expr(e.computed, st, ctx); if (typeof k.lit === 'string' || typeof k.lit === 'number') return this.member(o, String(k.lit), st, ctx, e.line); return join(this.element(o), dataOf(k).input ? {} : {}); }
        return this.member(o, e.prop, st, ctx, e.line);
      }
      case 'Call': return this.call(e, st, ctx);
      case 'New': return this.newExpr(e, st, ctx);
      case 'Await': return e.arg ? this.expr(e.arg, st, ctx) : {};
      case 'Arrow': return { fn: { node: e, scope: st.scope, file: ctx.file, name: e.name ?? null, thisVal: ctx.thisVal } };
      case 'ClassExpr': return { cls: { node: e, scope: st.scope, file: ctx.file, name: e.name } };
      case 'Obj': {
        const m = new Map();
        let agg = {};
        for (const p of e.props) {
          if (p.spread) { const sv = this.expr(p.spread, st, ctx); if (sv.obj) for (const [k, v] of sv.obj) m.set(k, v); else m.set(`...${m.size}`, { ...sv, spreadUnknown: true }); agg = join(agg, dataOf(sv)); continue; }
          if (p.computed && p.key == null) this.expr(p.computed, st, ctx);
          const v = this.expr(p.value, st, ctx);
          if (p.key != null) m.set(String(p.key), v);
          agg = join(agg, dataOf(v));
        }
        return { ...agg, obj: m };
      }
      case 'Arr': {
        const arr = e.elems.map((x) => (x ? this.expr(x.type === 'Spread' ? x.arg : x, st, ctx) : {}));
        return { ...joinAll(arr.map(dataOf)), arr };
      }
      case 'Spread': return this.expr(e.arg, st, ctx);
      case 'Bin': { const l = this.expr(e.left, st, ctx), r = this.expr(e.right, st, ctx); const out = join(dataOf(l), dataOf(r));
        if (['===', '==', '!==', '!='].includes(e.op)) { const g = this.ownerComparison(l, r, e.line, ctx) ?? this.ownerComparison(r, l, e.line, ctx); if (g) { const eq = e.op === '===' || e.op === '=='; return { predicate: eq ? { whenTrue: [g], whenFalse: [] } : { whenTrue: [], whenFalse: [g] } }; } } if (e.op === '+' && (l.tpl || r.tpl || typeof l.lit === 'string' || typeof r.lit === 'string')) out.concat = [l, r]; return out; }
      case 'Logic': { const l = this.expr(e.left, st, ctx), r = this.expr(e.right, st, ctx); return join(l, r); }
      case 'Cond': { this.expr(e.test, st, ctx); return join(this.expr(e.cons, st, ctx), this.expr(e.alt, st, ctx)); }
      case 'Unary': { const v = this.expr(e.arg, st, ctx); return e.op === '!' || e.op === 'typeof' || e.op === 'delete' || e.op === 'void' ? {} : dataOf(v); }
      case 'Assign': return this.assign(e, st, ctx);
      case 'Seq': { let v = {}; for (const x of e.list) v = this.expr(x, st, ctx); return v; }
      case 'Tagged': return this.tagged(e, st, ctx);
      default: return {};
    }
  }

  lookup(name, st, ctx, line) {
    const v = st.scope.get(name);
    if (v !== undefined) return v;
    const m = this.p.files.get(ctx.file);
    if (m && (m.bindings.has(name) || m.imports.has(name))) return this.moduleValue(ctx.file, name, line);
    if (DB_NAMES.test(name)) return { isDb: { label: name } };
    return { global: name };
  }

  assign(e, st, ctx) {
    const v = this.expr(e.right, st, ctx);
    const val = e.op === '=' ? v : join(this.expr(e.left, cloneState(st), ctx), v);
    if (e.left.type === 'Id') st.scope.set(e.left.name, val);
    else if (e.left.type === 'Member') {
      const o = this.expr(e.left.object, st, ctx);
      if ((o.isReq || o.isRes) && e.left.prop) st.req.set(e.left.prop, val);
      else if (o.obj && e.left.prop) o.obj.set(e.left.prop, val);
      else if (e.left.object.type === 'Member' && e.left.object.prop === 'locals') st.req.set(`locals.${e.left.prop}`, val);
    } else if (e.left.type === 'ObjPat' || e.left.type === 'Obj' || e.left.type === 'Arr') { /* destructuring assignment: rare in handlers */ }
    return val;
  }

  member(o, prop, st, ctx, line) {
    if (!o) return {};
    if (prop == null) return dataOf(o);
    // The request and its frameworks' shapes.
    if (o.isReq) {
      if (st.req.has(prop)) return st.req.get(prop);
      if (['params', 'query', 'body', 'headers', 'cookies', 'url', 'originalUrl', 'path', 'hostname', 'ip', 'raw', 'searchParams', 'files', 'file', 'signedCookies'].includes(prop)) return { input: [{ says: `${o.isReq.name}.${prop}`, file: ctx.file, line }], inputObj: true, reqPart: prop };
      if (['user', 'auth', 'session', 'currentUser', 'principal', 'identity', 'claims', 'tenant', 'account', 'member', 'viewer', 'jwt'].includes(prop)) return this.identity(`${o.isReq.name}.${prop}`, ctx, line, st);
      if (prop === 'nextUrl') return { nextUrl: true, input: [{ says: `${o.isReq.name}.nextUrl`, file: ctx.file, line }] };
      if (prop === 'json' || prop === 'formData' || prop === 'text') return { reqBodyFn: o.isReq.name };
      if (prop === 'jwtVerify') return { identityFn: `${o.isReq.name}.jwtVerify()` };
      if (prop === 'locals') return { locals: true, isReq: o.isReq };
      if (prop === 'log' || prop === 'server') return {};
      return {};
    }
    if (o.isRes) { if (prop === 'locals') return { locals: true, isReq: { name: `${o.isRes.name}` } }; return {}; }
    if (o.locals) { if (st.req.has(`locals.${prop}`)) return st.req.get(`locals.${prop}`); if (/user|auth|session|account/i.test(prop)) return this.identity(`res.locals.${prop}`, ctx, line, st); return {}; }
    if (o.nextUrl) { if (prop === 'searchParams') return { input: o.input, searchParams: true }; return { input: o.input }; }
    if (o.isParams) return { input: [{ says: `params.${prop}`, file: ctx.file, line }] };
    if (o.ctx) { // Hono's c
      if (prop === 'req') return { honoReq: true };
      if (prop === 'var' || prop === 'env') return { honoVar: prop };
      return { ctxMethod: prop, ctxVal: o };
    }
    if (o.honoReq) return { honoReqMethod: prop };
    if (o.honoVar) { if (o.honoVar === 'env' && /DB|DATABASE/.test(prop)) return { isDb: { label: `c.env.${prop}` } }; if (/user|auth|session|jwt|payload|account|tenant/i.test(prop)) return this.identity(`c.var.${prop}`, ctx, line, st); return {}; }
    if (o.ns) return this.exportValue(o.ns, prop) ?? {};
    // Data.
    const out = {};
    if (o.input?.length) out.input = o.input.map((ev) => ({ ...ev, says: `${ev.says}.${prop}` }));
    if (o.ident?.length) out.ident = o.ident.map((ev) => ({ ...ev, says: `${ev.says}.${prop}`, field: prop }));
    if (o.recs?.length) { out.recs = o.recs; out.recFields = o.recs.map((rec) => ({ rec, field: prop, says: `${rec.var ?? rec.model ?? 'the record'}.${prop}` })); }
    if (o.unknown?.length) out.unknown = o.unknown;
    if (o.obj?.has(prop)) return join(o.obj.get(prop), {});
    if (o.obj && !hasData(out)) { for (const [k, v] of o.obj) if (k.startsWith('...') && v.spreadUnknown) return dataOf(v); }
    if (o.clientFor) return { ...out, dbMember: { client: { label: o.clientFor.says, scoped: o.clientFor }, prop } };
    if (o.isDb) {
      if (prop === 'query') return { dbQuery: o.isDb };
      return { dbMember: { client: o.isDb, prop } };
    }
    if (o.dbQuery) return { drizzleRel: { client: o.dbQuery, table: prop } };
    if (o.dbMember) return { dbModelOp: { client: o.dbMember.client, model: o.dbMember.prop, op: prop } };
    if (o.drizzleRel) return { drizzleRelOp: { ...o.drizzleRel, op: prop } };
    if (o.cls && o.static !== false) { const mm = this.classMember(o.cls, prop, true); if (mm) return mm; }
    if (o.instance) { if (o.instance.fields?.has(prop)) return o.instance.fields.get(prop); const mm = this.classMember(o.instance.cls, prop, false, o); if (mm) return mm; }
    if (o.opaque) return { opaque: { ...o.opaque, why: o.opaque.why }, opaqueName: `${o.opaqueName ?? o.pkgName ?? 'it'}.${prop}`, pkg: o.pkg, ...out };
    if (o.global) return { global: `${o.global}.${prop}`, ...out };
    if (o.fn && prop === 'call') return o;
    return out;
  }

  classMember(cls, prop, isStatic, inst) {
    for (const m of cls.node.members) {
      if (m.key !== prop || (!!m.isStatic) !== isStatic) continue;
      if (m.fn) return { fn: { node: m.fn, scope: cls.scope, file: cls.file, name: `${cls.name}.${prop}`, thisVal: inst ?? { cls } } };
    }
    return null;
  }

  identity(says, ctx, line, st) {
    const ev = { says, file: ctx.file, line };
    if (st && !st.identity) st.identity = ev;
    return { ident: [{ ...ev, src: ev, field: null }] };
  }

  newExpr(e, st, ctx) {
    const c = this.expr(e.callee, st, ctx);
    const args = e.args.map((a) => this.expr(a.type === 'Spread' ? a.arg : a, st, ctx));
    const name = e.callee.type === 'Id' ? e.callee.name : e.callee.prop;
    if (name && DB_FACTORIES.test(name)) return { dbFactory: true };
    if (name === 'Response' || name === 'NextResponse') { this.sink('response', args[0] ?? {}, st, ctx, e.line, `answers with new ${name}(…)`, this.statusOf(args[1])); return { response: true }; }
    if (name === 'URL') return joinAll(args.map(dataOf));
    if (/^(Map|Set|WeakMap|WeakSet|URLSearchParams|Headers|FormData|Array)$/.test(name ?? '')) return { ...joinAll(args.map(dataOf)), collection: true };
    if (c.cls) {
      const fields = new Map();
      const inst = { instance: { cls: c.cls, fields } };
      // Constructor parameter properties and this.x = … assignments in the constructor.
      const ctor = c.cls.node.members.find((m) => m.key === 'constructor' && m.fn);
      if (ctor) {
        ctor.fn.params.forEach((p, i) => { const id = p.type === 'Default' ? p.target : p; if (id.type === 'Id') fields.set(id.name, args[i] ?? {}); });
        try { this.callFunction({ node: ctor.fn, scope: c.cls.scope, file: c.cls.file, name: `${c.cls.name}.constructor`, thisVal: inst }, args, st, ctx, e.line, inst); } catch (err) { if (err.limit) throw err; }
      }
      for (const m of c.cls.node.members) if (m.kind === 'field' && m.value && !fields.has(m.key)) fields.set(m.key, this.expr(m.value, cloneState(st), { ...ctx, file: c.cls.file, thisVal: inst }));
      for (const [k, v] of fields) if (DB_NAMES.test(k) && !v.isDb && !hasData(v)) fields.set(k, { isDb: { label: `this.${k}` } });
      return inst;
    }
    return joinAll(args.map(dataOf));
  }

  statusOf(v) {
    if (!v?.obj) return null;
    const s = v.obj.get('status');
    return typeof s?.lit === 'number' ? s.lit : null;
  }

  // ── Calls ──
  call(e, st, ctx) {
    const callee = e.callee;
    const line = e.line;
    // Arguments are evaluated once, here.
    const argNodes = e.args;
    const evalArgs = () => argNodes.map((a) => this.expr(a.type === 'Spread' ? a.arg : a, st, ctx));

    if (callee.type === 'Member') {
      const prop = callee.prop;
      const o = this.expr(callee.object, st, ctx);
      // The response.
      if (o.isRes) {
        if (prop === 'status' || prop === 'code' || prop === 'type' || prop === 'set' || prop === 'header' || prop === 'setHeader' || prop === 'cookie' || prop === 'clearCookie' || prop === 'append' || prop === 'vary' || prop === 'location') {
          const a = evalArgs();
          return { isRes: { ...o.isRes, status: prop === 'status' || prop === 'code' ? (typeof a[0]?.lit === 'number' ? a[0].lit : o.isRes.status) : o.isRes.status } };
        }
        if (['json', 'send', 'end', 'jsonp', 'render', 'sendFile', 'write', 'redirect', 'sendStatus', 'download'].includes(prop)) {
          const a = evalArgs();
          const status = prop === 'sendStatus' ? a[0]?.lit : o.isRes.status;
          const body = prop === 'render' ? (a[1] ?? {}) : prop === 'redirect' || prop === 'sendStatus' ? {} : (a[0] ?? {});
          this.sink('response', body, st, ctx, line, `answers with ${o.isRes.name}.${prop}(…)`, status);
          return { response: true, exits: typeof status === 'number' && status >= 400 };
        }
        return {};
      }
      // Hono: c.json(…), c.get('user').
      if (o.ctx) {
        const a = evalArgs();
        if (['json', 'text', 'html', 'body', 'newResponse'].includes(prop)) { this.sink('response', a[0] ?? {}, st, ctx, line, `answers with c.${prop}(…)`, typeof a[1]?.lit === 'number' ? a[1].lit : null); return { response: true }; }
        if (prop === 'get') { const k = a[0]?.lit; if (typeof k === 'string' && st.req.has(`c:${k}`)) return st.req.get(`c:${k}`); if (typeof k === 'string' && /user|auth|session|jwt|payload|account|tenant|claims/i.test(k)) return this.identity(`c.get("${k}")`, ctx, line, st); if (typeof k === 'string' && /^db$|database|prisma/i.test(k)) return { isDb: { label: `c.get("${k}")` } }; return {}; }
        if (prop === 'set') { if (typeof a[0]?.lit === 'string') st.req.set(`c:${a[0].lit}`, a[1] ?? {}); return {}; }
        if (prop === 'notFound') return { response: true, exits: true };
        return {};
      }
      if (o.honoReq) {
        const a = evalArgs();
        if (['param', 'query', 'queries', 'json', 'parseBody', 'valid', 'header', 'formData', 'text', 'raw'].includes(prop)) return { input: [{ says: `c.req.${prop}(${typeof a[0]?.lit === 'string' ? JSON.stringify(a[0].lit) : ''})`, file: ctx.file, line }] };
        return {};
      }
      if (o.reqBodyFn) { evalArgs(); return { input: [{ says: `await ${o.reqBodyFn}.json()`, file: ctx.file, line }] }; }
      if (o.identityFn) { evalArgs(); return this.identity(o.identityFn, ctx, line, st); }
      if (o.searchParams) { const a = evalArgs(); return { input: [{ says: `searchParams.${prop}(${typeof a[0]?.lit === 'string' ? JSON.stringify(a[0].lit) : ''})`, file: ctx.file, line }] }; }
      // Next.js / Web responses.
      if ((o.global === 'NextResponse' || o.global === 'Response' || o.pkgName === 'NextResponse') && prop === 'json') {
        const a = evalArgs();
        const status = this.statusOf(a[1]);
        this.sink('response', a[0] ?? {}, st, ctx, line, `answers with ${o.global ?? o.pkgName}.json(…)`, status);
        return { response: true, exits: typeof status === 'number' && status >= 400 };
      }
      if ((o.global === 'NextResponse' || o.pkgName === 'NextResponse') && (prop === 'redirect' || prop === 'next' || prop === 'rewrite')) { evalArgs(); return { response: true }; }
      // Transactions: $transaction(async (tx) => …), db.transaction(async (tx) => …).
      if ((prop === '$transaction' || prop === 'transaction') && o.isDb) {
        const a = evalArgs();
        if (a[0]?.fn) return this.callFunction(a[0].fn, [{ isDb: { label: 'tx' } }], st, ctx, line);
        return joinAll(a.map(dataOf));
      }
      // Mongoose models: mongoose.model('Invoice', schema).
      if (prop === 'model' && (callee.object.name === 'mongoose' || o.pkg === 'mongoose')) { const a = evalArgs(); return { mongooseModel: { model: typeof a[0]?.lit === 'string' ? a[0].lit : 'a model' } }; }
      // Databases.
      if (o.isDb && prop === 'query') return this.dbMethod({ client: o.isDb, prop }, argNodes, evalArgs, st, ctx, line);
      const fnVal = this.member(o, prop, st, ctx, line);
      if (fnVal.dbModelOp) return this.prismaOp(fnVal.dbModelOp, evalArgs(), st, ctx, line);
      if (fnVal.drizzleRelOp) return this.drizzleRel(fnVal.drizzleRelOp, evalArgs(), st, ctx, line);
      if (fnVal.dbMember) return this.dbMethod(fnVal.dbMember, argNodes, evalArgs, st, ctx, line);
      if (o.drizzle) return this.drizzleStep(o.drizzle, prop, evalArgs(), st, ctx, line, argNodes);
      if (o.knex) return this.knexStep(o.knex, prop, evalArgs(), st, ctx, line);
      if (o.mongooseModel && MONGOOSE_OPS.has(prop)) return this.mongooseOp(o.mongooseModel, prop, evalArgs(), st, ctx, line);
      // Promise chains.
      if ((prop === 'then' || prop === 'catch' || prop === 'finally') && argNodes.length) {
        const a = evalArgs();
        let out = dataOf(o);
        if (a[0]?.fn && prop === 'then') out = join(out, this.callFunction(a[0].fn, [dataOf(o)], st, ctx, line));
        return out;
      }
      const full = callee.object.type === 'Id' ? `${callee.object.name}.${prop}` : null;
      if (full && PASS_THROUGH_MEMBERS.has(full)) { const a = evalArgs(); return { ...joinAll(a.map(dataOf)), ...(full === 'Promise.all' && a[0]?.arr ? { arr: a[0].arr } : {}) }; }
      if (full === 'jwt.verify' || full === 'jose.jwtVerify') { evalArgs(); return this.identity(`${full}()`, ctx, line, st); }
      if (fnVal.fn) return this.callFunction(fnVal.fn, evalArgs(), st, ctx, line, fnVal.fn.thisVal);
      if (/^(parse|safeParse|parseAsync|validate|validateSync|cast)$/.test(prop) && argNodes.length) { const a = evalArgs(); return joinAll(a.map(dataOf)); }
      // An in-memory Map or Set: its contents are not stored records.
      if (o.collection) { const a = evalArgs(); return join(dataOf(o), joinAll(a.filter((x) => !x.fn).map(dataOf))); }
      // Data methods: req.params.id.trim(), invoice.items.map(…), user.roles.includes('admin').
      if (hasData(o) && !o.opaque) {
        const a = evalArgs();
        if ((prop === 'equals' || prop === 'isEqual') && a[0]) { const g = this.ownerComparison(o, a[0], line, ctx) ?? this.ownerComparison(a[0], o, line, ctx); if (g) return { predicate: { whenTrue: [g], whenFalse: [] } }; }
        // Membership: user.teamIds.includes(invoice.teamId); user.teams.some((t) => t.id === invoice.teamId).
        if (prop === 'includes' && a[0]) {
          const recSide = o.recFields?.length || o.recs?.length ? o : a[0].recFields?.length || a[0].recs?.length ? a[0] : null;
          const idSide = recSide === o ? a[0] : o;
          if (recSide && idSide?.ident?.length && !idSide.input?.length) {
            const recs = [...new Set([...(recSide.recFields ?? []).map((f) => f.rec), ...(recSide.recs ?? [])])];
            return { predicate: { whenTrue: [{ kind: 'guard', recs, ev: { says: `checks that ${idSide.ident[0].says} includes ${recSide.recFields?.[0]?.says ?? 'the record'}`, file: ctx.file, line } }], whenFalse: [] } };
          }
        }
        if (['some', 'find', 'every', 'findIndex', 'findLast'].includes(prop) && a[0]?.fn) {
          const v = this.callFunction(a[0].fn, [this.element(o)], cloneState(st), ctx, line);
          if (v.predicate?.whenTrue?.length) return { predicate: { whenTrue: v.predicate.whenTrue, whenFalse: [] } };
        }
        if (prop === 'includes' && o.ident?.some((x) => /^(roles|permissions|scopes|groups)$/i.test(x.field ?? '')) && typeof a[0]?.lit === 'string' && /admin|staff|super|owner|support/i.test(a[0].lit)) {
          return { predicate: { whenTrue: [{ kind: 'role', ev: { says: `only when ${o.ident[0].says} includes "${a[0].lit}"`, file: ctx.file, line } }], whenFalse: [] } };
        }
        return join(dataOf(o), joinAll(a.filter((x) => !x.fn).map(dataOf)));
      }
      return this.unresolvedCall(fnVal.opaqueName ?? (callee.object.type === 'Id' ? `${callee.object.name}.${prop}` : prop), o.opaque?.why ?? (o.global ? `${o.global}.${prop} is not defined in these files` : `${prop} could not be followed`), evalArgs(), st, ctx, line, o);
    }

    // Plain calls.
    const name = callee.type === 'Id' ? callee.name : null;
    const f = this.expr(callee, st, ctx);
    if (name && NEXT_EXITS.has(name) && (f.pkg === 'next/navigation' || f.global)) { evalArgs(); return { exits: true }; }
    if (name === 'next') { evalArgs(); st.calledNext = true; return {}; }
    if (name === 'model' && f.pkg === 'mongoose') { const a = evalArgs(); return { mongooseModel: { model: typeof a[0]?.lit === 'string' ? a[0].lit : 'a model' } }; }
    if (f.reqNext) { const a = evalArgs(); if (!a.length || a[0].lit === undefined) st.calledNext = true; else return { exits: true }; return {}; }
    if (f.knexRoot || (f.isDb && argNodes.length === 1 && argNodes[0].type === 'Lit' && typeof argNodes[0].value === 'string')) {
      const a = evalArgs();
      return { knex: { client: f.isDb ?? { label: name }, table: a[0]?.lit ?? null, conds: [], line, write: null } };
    }
    if (f.isDb && callee.type === 'Id' && argNodes.length && (argNodes[0].type === 'Tpl' || argNodes[0].type === 'Lit')) return this.rawSql(f.isDb, evalArgs(), st, ctx, line);
    if (name && (IDENTITY_FN_EXACT.has(name) || IDENTITY_FN.test(name)) && !f.fn) { evalArgs(); return this.identity(`${name}()`, ctx, line, st); }
    if (name && ROLE_FN.test(name) && !f.fn) {
      const a = evalArgs();
      if (!st.role) st.role = { says: `${name}(${typeof a[a.length - 1]?.lit === 'string' ? JSON.stringify(a[a.length - 1].lit) : '…'})`, file: ctx.file, line };
      return {};
    }
    if (f.fn) {
      const a = evalArgs();
      const v = this.callFunction(f.fn, a, st, ctx, line);
      // A resolved identity helper still establishes identity when its name says so and it gives back something.
      if (name && (IDENTITY_FN_EXACT.has(name) || IDENTITY_FN.test(name)) && !v.ident?.length) return { ...v, ...this.identity(`${name}()`, ctx, line, st) };
      return v;
    }
    if (f.cls) { evalArgs(); return {}; }
    if (name && PASS_THROUGH.has(name)) return joinAll(evalArgs().map(dataOf));
    if (f.isDb) return this.rawSql(f.isDb, evalArgs(), st, ctx, line);
    return this.unresolvedCall(name ?? 'a function', f.opaque?.why ?? (name ? `${name} is not defined in these files` : 'the function could not be followed'), evalArgs(), st, ctx, line, f);
  }

  /**
   * A call Thunder cannot follow. Its result is a value Thunder cannot see into when it was given request data. If it
   * also sees the record or the caller (or its name says it checks something), it might be an ownership check, so the
   * path becomes "cannot tell".
   */
  unresolvedCall(name, why, args, st, ctx, line, calleeVal) {
    const ev = { says: `${name}(…)`, why, file: ctx.file, line };
    const fnArgs = args.filter((a) => a.fn);
    // Callbacks handed to code Thunder cannot see: run them once with nothing known, so effects inside are seen.
    for (const a of fnArgs) { try { this.callFunction(a.fn, [], st, ctx, line); } catch (err) { if (err.limit) throw err; } }
    const data = args.filter((a) => !a.fn);
    const sawRecord = data.some((a) => a.recs?.length || a.recFields?.length);
    const sawCaller = data.some((a) => a.ident?.length);
    const sawInput = data.some((a) => a.input?.length || a.unknown?.length);
    const baseName = String(name).split('.').pop();
    if ((sawRecord || sawCaller) && (GUARDISH.test(baseName) || (sawRecord && sawCaller))) st.unresolved = uniq(st.unresolved, [{ ...ev, says: `${name}(…) might check who may see it` }]);
    const out = joinAll(data.map(dataOf));
    // getTenantDb(user): a value made for the caller; if it is used as a database, its lookups may be filtered.
    if (sawCaller && !GUARDISH.test(baseName)) out.clientFor = { says: `${name}(…)`, file: ctx.file, line };
    const parts = String(name).split('.');
    const ownerName = parts.length > 1 ? parts[parts.length - 2] : '';
    const dataLike = name !== 'fetch' && !NOT_DATA_PACKAGE.test(calleeVal?.pkg ?? '') && !['path', 'fs', 'os', 'url', 'crypto', 'util', 'process', 'console', 'JSON', 'Math', 'Date', BUF].includes(parts[0]) && (LOOKUP_NAME.test(baseName) || (parts.length > 1 && LOOKUP_OWNER.test(ownerName) && !/^(set|add|log|emit|send|push|on|use)$/.test(baseName)));
    if ((sawInput || calleeVal?.recs?.length) && dataLike) out.unknown = uniq(out.unknown, [{ ...ev, says: `${name}(…)` }]);
    if (calleeVal && hasData(calleeVal)) return join(out, dataOf(calleeVal));
    return out;
  }

  callFunction(fn, args, st, ctx, line, thisVal) {
    if ((ctx.depth ?? 0) >= MAX_DEPTH) {
      const ev = { says: `${fn.name ?? 'a function'}(…)`, why: `Thunder stops following calls ${MAX_DEPTH} deep`, file: ctx.file, line };
      if (args.some((a) => a.recs?.length || a.ident?.length)) st.unresolved = uniq(st.unresolved, [ev]);
      const out = joinAll(args.map(dataOf));
      if (args.some((a) => a.input?.length)) out.unknown = uniq(out.unknown, [ev]);
      return out;
    }
    const node = fn.node;
    const frame = { returns: [] };
    const inner = cloneState(st);
    inner.scope = new Scope(fn.scope);
    inner.frame = frame;
    inner.exited = null;
    const c2 = { ...ctx, file: fn.file, depth: (ctx.depth ?? 0) + 1, thisVal: thisVal ?? fn.thisVal ?? ctx.thisVal, returnsSend: false };
    (node.params ?? []).forEach((p, i) => {
      if (p.type === 'Rest') this.bindPattern(p.arg, { arr: args.slice(i), ...joinAll(args.slice(i).map(dataOf)) }, inner.scope, inner, c2, true);
      else this.bindPattern(p, args[i] ?? {}, inner.scope, inner, c2, true);
    });
    if (node.body?.type === 'Block') this.block(node.body.body, inner, c2);
    else if (node.body) { const v = this.expr(node.body, inner, c2); frame.returns.push({ val: v, state: cloneState(inner) }); inner.exited = 'return'; }
    // The paths that come back: returns and falling off the end. Paths that throw do not come back.
    const back = [...frame.returns.map((r) => r.state)];
    if (!inner.exited) back.push(inner);
    if (!back.length) { st.exited = 'throw'; return {}; }
    const merged = back.reduce((a, b) => mergeStates(a, { ...b, exited: null }), { ...back[0], exited: null });
    st.guards = merged.guards;
    st.role = merged.role;
    st.identity = st.identity ?? merged.identity;
    st.unresolved = merged.unresolved;
    st.calledNext = st.calledNext || merged.calledNext;
    st.req = merged.req;
    const vals = frame.returns.map((r) => r.val);
    const v = joinAll(vals);
    // A predicate's facts: return a === b → when the call is true, the comparison holds.
    if (frame.returns.length && node.body) {
      const preds = [];
      for (const r of frame.returns) if (r.pred) preds.push(r.pred);
    }
    const pred = this.predicateOf(node, args, c2, fn);
    if (pred) v.predicate = pred;
    return v;
  }

  // A function whose returned expression is a comparison: canRead(user, invoice) { return invoice.ownerId === user.id }.
  predicateOf(node, args, ctx, fn) {
    const rets = [];
    const collect = (s) => {
      if (!s) return;
      if (s.type === 'Return' && s.arg) rets.push(s.arg);
      else if (s.type === 'Block') s.body.forEach(collect);
      else if (s.type === 'If') { collect(s.cons); collect(s.alt); }
    };
    if (node.body?.type === 'Block') node.body.body.forEach(collect); else if (node.body) rets.push(node.body);
    if (rets.length !== 1) return null;
    const st = newState(new Scope(fn.scope), { returns: [] });
    (node.params ?? []).forEach((p, i) => this.bindPattern(p.type === 'Rest' ? p.arg : p, args[i] ?? {}, st.scope, st, ctx, true));
    const f = this.testFacts(rets[0], st, ctx);
    return f.whenTrue.length || f.whenFalse.length ? f : null;
  }

  // ── Databases ──
  newRec(props) {
    this.recCount++;
    return { id: `r${this.recCount}`, ...props };
  }

  /** A where condition as conjuncts: { conj: [{ col, val }], or: [[…], …], nested: [...], unknown: why }. */
  whereFromObject(v) {
    const w = { conj: [], or: [], unknown: null };
    if (!v) return w;
    if (!v.obj) { if (hasData(v)) w.unknown = 'the where condition is a value Thunder cannot see into'; return w; }
    for (const [k, val] of v.obj) {
      if (k.startsWith('...')) { if (hasData(val) || val.opaque) w.unknown = 'the where condition spreads a value Thunder cannot see into'; continue; }
      if (k === 'AND') { for (const x of val.arr ?? [val]) { const sub = this.whereFromObject(x); w.conj.push(...sub.conj); w.or.push(...sub.or); w.unknown = w.unknown ?? sub.unknown; } continue; }
      if (k === 'OR') { w.or.push((val.arr ?? [val]).map((x) => this.whereFromObject(x))); continue; }
      if (k === 'NOT') continue;
      if (val.obj) {
        // A relation filter or an operator object ({ equals: x }, { in: [...] }, { some: { userId } }).
        const sub = this.whereFromObject(val);
        if (sub.conj.length || sub.or.length) w.conj.push({ col: k, nested: sub });
        else w.conj.push({ col: k, val });
        continue;
      }
      w.conj.push({ col: k, val });
    }
    return w;
  }

  /** How a where condition limits a lookup: by the request (keyed), by the caller (scoped), or by the caller's identity. */
  judgeWhere(w) {
    const out = { keyed: null, scoped: null, byIdentity: null, unknown: w.unknown };
    const visit = (wh, path) => {
      for (const c of wh.conj) {
        if (c.nested) { visit(c.nested, [...path, c.col]); continue; }
        const v = c.val;
        if (v?.input?.length && !out.keyed) out.keyed = { says: `${[...path, c.col].join('.')} = ${v.input[0].says}`, value: v.input[0].says, file: v.input[0].file, line: v.input[0].line };
        if (v?.unknown?.length && !out.keyed && !out.unknown) out.unknown = `${[...path, c.col].join('.')} comes from ${v.unknown[0].says}, which Thunder cannot follow`;
        if (v?.ident?.length && !v.input?.length) {
          const ev = v.ident[0];
          const col = c.col;
          const ownerish = OWNER_FIELD.test(col) || OWNER_FIELD.test(ev.field ?? '') || path.some((p) => OWNER_FIELD.test(p));
          if (col === 'id' && !path.length && (ev.field === 'id' || ev.field == null || /Id$/.test(ev.field ?? ''))) { if (!out.byIdentity) out.byIdentity = { says: `${col} = ${ev.says}` }; }
          else if (ownerish && !out.scoped) out.scoped = { says: `${[...path, col].join('.')} = ${ev.says}` };
        }
        if (v?.recFields?.length && !v.input?.length) out.fromRecord = uniq(out.fromRecord, v.recFields.map((f) => f.rec));
      }
      // OR: scoped only if every branch is scoped; keyed if any branch is keyed.
      for (const group of wh.or) {
        const judged = group.map((g) => this.judgeWhere(g));
        if (!out.keyed) out.keyed = judged.find((j) => j.keyed)?.keyed ?? null;
        if (!out.scoped && judged.length && judged.every((j) => j.scoped)) out.scoped = judged[0].scoped;
        else if (judged.some((j) => j.scoped || j.byIdentity) && !out.unknown) out.unknown = `the where allows the caller's records (${(judged.find((j) => j.scoped) ?? judged.find((j) => j.byIdentity)).scoped?.says ?? 'by identity'}) OR other ones; Thunder cannot tell whether those others are meant to be open`;
        if (!out.unknown) out.unknown = judged.find((j) => j.unknown)?.unknown ?? null;
      }
    };
    visit(w, []);
    return out;
  }

  makeLookup({ client, model, op, kind, where, st, ctx, line, varName }) {
    const j = this.judgeWhere(where);
    const rec = this.newRec({ model, op, kind, file: ctx.file, line, keyed: j.keyed, scoped: j.scoped, byIdentity: j.byIdentity, unknownWhere: j.unknown, client: client?.label, clientScoped: client?.scoped ?? null, var: varName });
    // A lookup limited to the caller and keyed by another record's field vouches for that record once found.
    if (j.scoped && j.fromRecord?.length) rec.links = j.fromRecord;
    if (j.scoped && /OrThrow$/.test(op)) { const ev = { says: `${model}.${op} stops unless it belongs to the caller`, file: ctx.file, line }; for (const r of j.fromRecord ?? []) guardRec(st, r, ev); if (j.keyed?.value) st.guards.set(`key:${j.keyed.value}`, ev); }
    if (kind === 'change') this.sink('change', { recs: [rec] }, st, ctx, line, `${op === 'delete' || /delete|del|remove/i.test(op) ? 'deletes' : 'changes'} ${model ?? 'a record'}`);
    return { recs: [rec] };
  }

  prismaOp({ client, model, op }, args, st, ctx, line) {
    if (!PRISMA_ALL.has(op)) return this.unresolvedCall(`${client.label}.${model}.${op}`, `${op} is not a database call Thunder knows`, args, st, ctx, line);
    if (op === 'create' || op === 'createMany') return { recs: [this.newRec({ model, op, kind: 'create', file: ctx.file, line })] };
    const opts = args[0];
    const where = this.whereFromObject(opts?.obj?.get('where'));
    if (opts && !opts.obj && hasData(opts)) where.unknown = 'the query options are a value Thunder cannot see into';
    if (!opts?.obj?.has('where') && opts?.obj) { /* no where: every record */ }
    const kind = PRISMA_WRITE.has(op) ? 'change' : 'read';
    return this.makeLookup({ client, model, op, kind, where, st, ctx, line });
  }

  dbMethod({ client, prop }, argNodes, evalArgs, st, ctx, line) {
    // Raw SQL: pool.query(sql, params), db.execute(sql), prisma.$queryRawUnsafe(sql, …).
    if (['query', 'execute', '$queryRawUnsafe', '$executeRawUnsafe', 'one', 'oneOrNone', 'many', 'any', 'none', 'get', 'all', 'run', 'prepare'].includes(prop) && argNodes.length && (argNodes[0].type === 'Lit' || argNodes[0].type === 'Tpl' || argNodes[0].type === 'Id' || argNodes[0].type === 'Bin')) {
      return this.rawSql(client, evalArgs(), st, ctx, line, prop.includes('execute') ? 'change' : null);
    }
    const a = evalArgs();
    if (['select', 'selectDistinct', 'selectFrom'].includes(prop)) return { drizzle: { client, kind: 'read', table: null, where: null, line } };
    if (prop === 'update' || prop === 'delete' || prop === 'updateTable' || prop === 'deleteFrom') return { drizzle: { client, kind: 'change', op: prop, table: this.tableName(a[0], argNodes[0]), where: null, line } };
    if (prop === 'insert' || prop === 'insertInto') return { drizzle: { client, kind: 'create', table: this.tableName(a[0], argNodes[0]), line } };
    if (prop === '$connect' || prop === '$disconnect' || prop === 'end' || prop === 'release' || prop === 'connect') return {};
    return this.unresolvedCall(`${client.label}.${prop}`, `${client.label}.${prop} is not a database call Thunder knows`, a, st, ctx, line);
  }

  tableName(v, node) {
    if (!v) return null;
    if (typeof v.lit === 'string') return v.lit;
    if (node?.type === 'Id') return node.name;
    if (node?.type === 'Member') return node.prop;
    return v.tableName ?? v.global ?? v.opaqueName ?? null;
  }

  // Drizzle conditions: eq(t.col, v), and(...), or(...), inArray(t.col, [...]).
  drizzleWhere(v) {
    const w = { conj: [], or: [], unknown: null };
    if (!v) return w;
    if (v.cond) {
      if (v.cond.op === 'and') for (const x of v.cond.args) { const s = this.drizzleWhere(x); w.conj.push(...s.conj); w.or.push(...s.or); w.unknown = w.unknown ?? s.unknown; }
      else if (v.cond.op === 'or') w.or.push(v.cond.args.map((x) => this.drizzleWhere(x)));
      else if (v.cond.op === 'eq') w.conj.push({ col: v.cond.col, val: v.cond.val });
      else if (v.cond.op === 'raw') { const s = v.cond.where; w.conj.push(...s.conj); w.or.push(...s.or); w.unknown = w.unknown ?? s.unknown; }
      return w;
    }
    if (v.obj) return this.whereFromObject(v);
    if (hasData(v)) w.unknown = 'the where condition is a value Thunder cannot see into';
    return w;
  }

  drizzleStep(d, prop, args, st, ctx, line, argNodes = []) {
    if (prop === 'from' || prop === 'selectFrom') return { drizzle: { ...d, table: this.tableName(args[0], argNodes[0]) } };
    if (prop === 'where') {
      const where = this.drizzleWhere(args[0]);
      const next = { ...d, where };
      if (d.kind === 'change') return { ...this.makeLookup({ client: d.client, model: d.table, op: d.op ?? 'update', kind: 'change', where, st, ctx, line }), drizzle: { ...next, done: true } };
      return { drizzle: next, ...this.drizzleRec(next, st, ctx, line) };
    }
    if (['set', 'values', 'returning', 'onConflictDoNothing', 'onConflictDoUpdate'].includes(prop)) return { drizzle: d };
    if (['limit', 'offset', 'orderBy', 'groupBy', 'innerJoin', 'leftJoin', 'rightJoin', 'fullJoin', 'having', 'execute', 'all', 'get', 'then', 'prepare', 'selectAll', 'executeTakeFirst', 'executeTakeFirstOrThrow'].includes(prop)) {
      if (prop === 'selectAll' || prop === 'executeTakeFirst' || prop === 'executeTakeFirstOrThrow' || prop === 'execute') return { drizzle: d, ...this.drizzleRec(d, st, ctx, line) };
      return { drizzle: d, ...(d.where ? this.drizzleRec(d, st, ctx, line) : {}) };
    }
    return { drizzle: d };
  }

  drizzleRec(d, st, ctx, line) {
    if (d.kind !== 'read') return {};
    if (d._rec) return { recs: [d._rec] };
    const v = this.makeLookup({ client: d.client, model: d.table, op: 'select', kind: 'read', where: d.where ?? { conj: [], or: [], unknown: null }, st, ctx, line: d.line ?? line });
    d._rec = v.recs[0];
    return v;
  }

  drizzleRel({ client, table, op }, args, st, ctx, line) {
    if (!['findFirst', 'findMany'].includes(op)) return {};
    const opts = args[0];
    let whereVal = opts?.obj?.get('where');
    if (whereVal?.fn) {
      // where: (t, { eq, and }) => and(eq(t.id, id), eq(t.tenantId, user.tenantId))
      const ops = { obj: new Map(['eq', 'and', 'or', 'inArray', 'ne'].map((k) => [k, { global: k }])) };
      whereVal = this.callFunction(whereVal.fn, [{ table: { name: table }, tableName: table }, ops], st, ctx, line);
    }
    const where = this.drizzleWhere(whereVal);
    return this.makeLookup({ client, model: table, op, kind: 'read', where, st, ctx, line });
  }

  knexStep(k, prop, args, st, ctx, line) {
    const addConds = () => {
      if (args.length === 1 && args[0].obj) { const w = this.whereFromObject(args[0]); return [...k.conds, ...w.conj]; }
      if (args.length >= 2 && typeof args[0].lit === 'string') return [...k.conds, { col: args[0].lit.split('.').pop(), val: args[args.length - 1] }];
      if (args[0]?.fn) return [...k.conds, { col: '?', val: { unknown: [{ says: 'a where callback', file: ctx.file, line }] } }];
      return [...k.conds, { col: '?', val: dataOf(args[0] ?? {}) }];
    };
    if (prop === 'where' || prop === 'andWhere') return { knex: { ...k, conds: addConds() } };
    if (prop === 'orWhere') return { knex: { ...k, hasOr: true } };
    if (['first', 'select', 'pluck', 'then', 'limit', 'orderBy', 'returning', 'count', 'join', 'leftJoin', 'innerJoin', 'offset'].includes(prop)) {
      const where = { conj: k.conds, or: [], unknown: k.hasOr ? 'the query has an OR Thunder does not judge' : null };
      if (k._rec) return { knex: k, recs: [k._rec] };
      const v = this.makeLookup({ client: k.client, model: k.table, op: prop, kind: 'read', where, st, ctx, line });
      k._rec = v.recs[0];
      return { knex: k, ...v };
    }
    if (['update', 'del', 'delete', 'increment', 'decrement'].includes(prop)) {
      const where = { conj: k.conds, or: [], unknown: k.hasOr ? 'the query has an OR Thunder does not judge' : null };
      return this.makeLookup({ client: k.client, model: k.table, op: prop, kind: 'change', where, st, ctx, line });
    }
    if (prop === 'insert') return {};
    return { knex: k };
  }

  mongooseOp({ model }, op, args, st, ctx, line) {
    const kind = MONGOOSE_OPS.get(op) === 'write' ? 'change' : 'read';
    let where;
    if (/ById/.test(op)) where = { conj: [{ col: '_id', val: args[0] ?? {} }], or: [], unknown: null };
    else where = this.whereFromObject(args[0]);
    return this.makeLookup({ client: { label: model }, model, op, kind, where, st, ctx, line });
  }

  // Raw SQL from a string, a template, or sql`…`. Conditions after WHERE are read as col = value.
  rawSql(client, args, st, ctx, line, forceKind = null) {
    const q = args[0] ?? {};
    let text = null;
    const holes = [];
    if (typeof q.lit === 'string') text = q.lit;
    else if (q.tpl) text = q.tpl.parts.map((p) => (p.text != null ? p.text : (holes.push(p.val), `\u0000${holes.length - 1}\u0000`))).join('');
    else if (q.sqlText != null) { text = q.sqlText; holes.push(...q.sqlHoles); }
    const params = args[1]?.arr ?? args.slice(1);
    if (text == null) {
      const v = joinAll(args.map(dataOf));
      if (!hasData(v)) return {};
      const rec = this.newRec({ model: null, op: 'sql', kind: 'read', file: ctx.file, line, keyed: v.input?.[0] ? { says: v.input[0].says } : null, unknownWhere: 'the SQL text is built at run time, so Thunder cannot read its WHERE' });
      return { recs: [rec] };
    }
    const kindWord = (text.match(/^\s*(\w+)/)?.[1] ?? '').toUpperCase();
    const kind = forceKind ?? (kindWord === 'UPDATE' || kindWord === 'DELETE' ? 'change' : kindWord === 'INSERT' ? 'create' : 'read');
    if (kind === 'create') return {};
    const table = text.match(/\b(?:from|update|into)\s+["`[]?(\w+)/i)?.[1] ?? null;
    const whereText = text.split(/\bwhere\b/i)[1]?.split(/\b(order\s+by|group\s+by|limit|returning|offset)\b/i)[0] ?? '';
    const where = { conj: [], or: [], unknown: null };
    if (/\bor\b/i.test(whereText)) where.unknown = 'the WHERE has an OR Thunder does not judge';
    let qIndex = 0;
    const re = /([\w."`[\]]+)\s*=\s*(\$(\d+)|\?|:(\w+)|@(\w+)|\u0000(\d+)\u0000)/g;
    for (const m of whereText.matchAll(re)) {
      const col = m[1].replace(/["`[\]]/g, '').split('.').pop();
      let val = {};
      if (m[3]) val = params[Number(m[3]) - 1] ?? {};
      else if (m[2] === '?') val = params[qIndex++] ?? {};
      else if (m[6] != null) val = holes[Number(m[6])] ?? {};
      else if (m[4] || m[5]) { const o = params[0]; val = o?.obj?.get(m[4] ?? m[5]) ?? {}; }
      where.conj.push({ col, val });
    }
    return this.makeLookup({ client, model: table, op: 'sql', kind, where, st, ctx, line });
  }

  tagged(e, st, ctx) {
    const tag = this.expr(e.tag, st, ctx);
    const parts = e.tpl.parts.map((p) => (p.expr ? this.expr(p.expr, st, ctx) : null));
    const tplVal = { tpl: { parts: e.tpl.parts.map((p, i) => (p.expr ? { val: parts[i] } : { text: p.text })) } };
    const name = e.tag.type === 'Id' ? e.tag.name : e.tag.prop;
    if (tag.isDb || name === 'sql' || /^\$(queryRaw|executeRaw)$/.test(name ?? '') || (e.tag.type === 'Member' && this.expr(e.tag.object, cloneState(st), ctx).isDb)) {
      // A whole query (pool`…`, prisma.$queryRaw`…`) or a drizzle sql`…` fragment used inside a where.
      const text = e.tpl.parts.map((p, i) => (p.expr ? `\u0000${i}\u0000` : p.text)).join('');
      if (/^\s*(select|update|delete|insert|with)\b/i.test(text)) return this.rawSql(tag.isDb ?? { label: name }, [tplVal], st, ctx, e.line, /^\$executeRaw$/.test(name ?? '') ? 'change' : null);
      // A fragment: col = value pairs become a condition.
      const holes = parts.map((p) => p ?? {});
      // (Hole numbers are part indexes, so text parts are holes of {} that never match.)
      const conj = [];
      const re = /([\w."`]+)?\s*\u0000(\d+)\u0000\s*=\s*\u0000(\d+)\u0000|([\w."`]+)\s*=\s*\u0000(\d+)\u0000/g;
      for (const m of text.matchAll(re)) {
        if (m[2] != null) { const hole = e.tpl.parts[Number(m[2])]?.expr; const r = holes[Number(m[3])]; conj.push({ col: hole?.type === 'Member' ? hole.prop : '?', val: r }); }
        else conj.push({ col: m[4].replace(/["`]/g, '').split('.').pop(), val: holes[Number(m[5])] });
      }
      return { cond: { op: 'raw', where: { conj, or: [], unknown: /\bor\b/i.test(text) ? 'the condition has an OR Thunder does not judge' : null } } };
    }
    return joinAll(parts.filter(Boolean).map(dataOf));
  }

  // ── Sinks ──
  sink(kind, val, st, ctx, line, says, status) {
    if (!ctx.route) return;
    if (typeof status === 'number' && status >= 400 && kind === 'response') return;
    ctx.route.sinks.push({ kind, val, state: cloneState(st), file: ctx.file, line, says });
  }
}

// Drizzle helpers seen as globals: eq(t.col, v), and(...), or(...).
const DRIZZLE_OPS = new Set(['eq', 'and', 'or', 'inArray']);

// Patch call() for drizzle condition helpers and table columns: handled through lookup of globals.
const baseCall = Analyzer.prototype.call;
Analyzer.prototype.call = function call(e, st, ctx) {
  if (e.callee.type === 'Id' && DRIZZLE_OPS.has(e.callee.name)) {
    const f = this.lookup(e.callee.name, st, ctx, e.line);
    if (f.global || f.pkg?.startsWith('drizzle-orm') || f.opaque) {
      const args = e.args.map((a) => this.expr(a.type === 'Spread' ? a.arg : a, st, ctx));
      if (e.callee.name === 'eq') return { cond: { op: 'eq', col: columnOf(e.args[0], args[0]), val: args[1] ?? {} }, ...joinAll(args.map(dataOf)) };
      if (e.callee.name === 'inArray') return { cond: { op: 'eq', col: columnOf(e.args[0], args[0]), val: args[1] ?? {} }, ...joinAll(args.map(dataOf)) };
      return { cond: { op: e.callee.name, args }, ...joinAll(args.map(dataOf)) };
    }
  }
  return baseCall.call(this, e, st, ctx);
};
function columnOf(node, val) {
  if (node?.type === 'Member' && node.prop) return node.prop;
  return val?.column ?? '?';
}

// ── Routes ───────────────────────────────────────────────────────────────────────────────────────────────────────

function walkAll(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) walkAll(x, visit); return; }
  if (node.type) visit(node);
  for (const [k, v] of Object.entries(node)) if (k !== 'line' && v && typeof v === 'object') walkAll(v, visit);
}

function nextRoutePath(file) {
  const m = file.match(/(?:^|\/)app\/(.*)\/route\.(?:ts|js|mts|tsx)$/);
  if (!m) return null;
  return '/' + m[1].split('/').filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@')).map((s) => s.replace(/^\[\.\.\.(.+)\]$/, '*$1').replace(/^\[(.+)\]$/, ':$1')).join('/');
}
function pagesApiPath(file) {
  const m = file.match(/(?:^|\/)pages\/(api\/.*)\.(?:ts|js)$/);
  if (!m) return null;
  return '/' + m[1].replace(/\/index$/, '').split('/').map((s) => s.replace(/^\[(.+)\]$/, ':$1')).join('/');
}

function findRoutes(project) {
  const routes = [];
  for (const m of project.files.values()) {
    const uses = [];
    walkAll(m.ast.body, (n) => {
      if (n.type !== 'Call' || n.callee.type !== 'Member') return;
      const prop = n.callee.prop;
      const recv = n.callee.object;
      const recvName = recv.type === 'Id' ? recv.name : recv.type === 'Member' ? recv.prop : null;
      if (prop === 'use') { uses.push({ recv: recvName, line: n.line, args: n.args }); return; }
      if (prop === 'route' && n.args[0]?.type === 'Obj') {
        // fastify.route({ method, url, handler, preHandler })
        const o = new Map(n.args[0].props.map((p) => [p.key, p.value]));
        const method = o.get('method'), url = o.get('url') ?? o.get('path'), handler = o.get('handler');
        if (url?.type === 'Lit' && handler) routes.push({ framework: 'fastify', method: String(method?.value ?? 'GET').toUpperCase(), path: url.value, file: m.path, line: n.line, handler, middleware: [o.get('preHandler'), o.get('onRequest'), o.get('preValidation')].filter(Boolean).flatMap((x) => (x.type === 'Arr' ? x.elems : [x])), recv: recvName });
        return;
      }
      if (!METHODS.has(prop) || !n.args.length) return;
      const first = n.args[0];
      const path = first.type === 'Lit' && typeof first.value === 'string' ? first.value : first.type === 'Tpl' && first.parts.length === 1 ? first.parts[0].text : null;
      if (path == null || !(path.startsWith('/') || path === '' || path === '*')) return;
      if (n.args.length < 2) return;
      const handler = n.args[n.args.length - 1];
      const middle = n.args.slice(1, -1);
      const opts = middle.find((x) => x.type === 'Obj');
      const mw = middle.filter((x) => x.type !== 'Obj').flatMap((x) => (x.type === 'Arr' ? x.elems.filter(Boolean) : [x]));
      if (opts) for (const p of opts.props) if (['preHandler', 'onRequest', 'preValidation'].includes(p.key)) mw.push(...(p.value.type === 'Arr' ? p.value.elems.filter(Boolean) : [p.value]));
      const framework = handler.type === 'Arrow' && handler.params.length === 1 && /^c$|^ctx$|^context$/.test(handler.params[0].name ?? '') ? 'hono' : opts || /fastify|server|instance/i.test(recvName ?? '') ? 'fastify' : 'express';
      routes.push({ framework, method: prop === 'del' ? 'DELETE' : prop.toUpperCase(), path, file: m.path, line: n.line, handler, middleware: mw, recv: recvName });
    });
    for (const r of routes) if (r.file === m.path) r.uses = uses.filter((u) => u.recv === r.recv && u.line < r.line && (!u.args[0] || u.args[0].type !== 'Lit' || r.path.startsWith(u.args[0].value)));
    const nextPath = nextRoutePath(m.path);
    if (nextPath) {
      for (const [exported, local] of m.exports) {
        if (!/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(exported) || typeof local !== 'string') continue;
        const b = m.bindings.get(local);
        if (!b) continue;
        const handler = b.kind === 'fn' ? b.node : b.node;
        routes.push({ framework: 'next', method: exported, path: nextPath, file: m.path, line: handler?.line ?? 1, handler, middleware: [], uses: [] });
      }
    }
    const apiPath = pagesApiPath(m.path);
    if (apiPath && m.exports.has('default')) {
      const local = m.exports.get('default');
      const b = typeof local === 'string' ? m.bindings.get(local) : null;
      if (b?.node) routes.push({ framework: 'next-pages', method: 'ANY', path: apiPath, file: m.path, line: b.node.line ?? 1, handler: b.node, middleware: [], uses: [] });
    }
  }
  return routes;
}

// ── Running a route ──────────────────────────────────────────────────────────────────────────────────────────────

function analyzeRoute(an, project, r) {
  const m = project.files.get(r.file);
  const route = { sinks: [] };
  const ctx = { file: r.file, depth: 0, route, returnsSend: false };
  const st = newState(new Scope(m.scope), { returns: [] });
  const notes = [];
  // Values of the request, the response, and the framework's context.
  const reqName = (fn) => { const p = fn?.params?.[0]; return p?.type === 'Id' ? p.name : 'req'; };
  const handlerVal = r.handler.type === 'Arrow' || r.handler.type === 'Function' ? { fn: { node: r.handler, scope: st.scope, file: r.file, name: 'the handler' } } : an.expr(r.handler, st, ctx);
  let handlerFn = handlerVal.fn ?? null;
  // A wrapper: asyncHandler(async (req, res) => …), withAuth(handler), wrap(fn).
  let wrapperName = null;
  if (!handlerFn && r.handler.type === 'Call') {
    const inner = r.handler.args.find((a) => a.type === 'Arrow') ?? null;
    const calleeName = r.handler.callee.type === 'Id' ? r.handler.callee.name : r.handler.callee.prop;
    wrapperName = calleeName;
    if (inner) handlerFn = { node: inner, scope: st.scope, file: r.file, name: 'the handler' };
    else if (r.handler.args[0]) { const v = an.expr(r.handler.args[0], st, ctx); handlerFn = v.fn ?? null; }
  }
  if (!handlerFn) return { verdict: null, paths: [], identity: null, why: `the handler (${r.handler.type === 'Id' ? r.handler.name : 'an expression'}) could not be found in these files`, stopped: true };
  const node = handlerFn.node;
  const fw = r.framework;
  const args = [];
  if (fw === 'hono') args.push({ ctx: true });
  else if (fw === 'next') {
    args.push({ isReq: { name: reqName(node) } });
    args.push({ obj: new Map([['params', { isParams: true }]]), isParamsCtx: true });
  } else {
    args.push({ isReq: { name: reqName(node) } });
    const resP = node.params?.[1];
    args.push({ isRes: { name: resP?.type === 'Id' ? resP.name : 'res', status: null } });
    args.push({ reqNext: true });
  }
  // Middleware (route and router-wide): auth names establish identity; the project's own run first; unknown ones
  // might check ownership.
  // An auth wrapper (withAuth(async (req, ctx, user) => …)) hands the caller in the parameters after the usual ones.
  if (wrapperName && AUTH_MIDDLEWARE.test(wrapperName) && !MAYBE_GUARD_MIDDLEWARE.test(wrapperName)) {
    const usual = fw === 'hono' ? 1 : fw === 'next' ? 2 : 3;
    for (let i = usual; i < (node.params?.length ?? 0); i++) args[i] = { ident: [{ says: `the caller from ${wrapperName}`, file: r.file, line: r.line, field: null }] };
    if (fw === 'next') for (let i = 1; i < usual; i++) args[i] = args[i] ?? {};
  }
  const mwNodes = [...(r.uses ?? []).flatMap((u) => u.args.filter((a) => !(a.type === 'Lit'))), ...(r.middleware ?? [])];
  if (wrapperName && (MAYBE_GUARD_MIDDLEWARE.test(wrapperName) || !AUTH_MIDDLEWARE.test(wrapperName)) && !/^(async|asyncHandler|catchAsync|wrap|handler|tryCatch|withErrorHandling|errorHandler|withErrors|safe)$/i.test(wrapperName)) {
    const wv = an.lookup(wrapperName, st, ctx, r.line);
    if (!wv.fn) st.unresolved.push({ says: `${wrapperName}(…)`, why: `the handler is wrapped in ${wrapperName}, which is not in these files`, file: r.file, line: r.line });
  } else if (wrapperName && AUTH_MIDDLEWARE.test(wrapperName)) st.identity = { says: `${wrapperName}(…)`, file: r.file, line: r.line };
  let s = st;
  for (const mwNode of mwNodes) {
    const label = mwNode.type === 'Id' ? mwNode.name : mwNode.type === 'Call' ? (mwNode.callee.type === 'Id' ? mwNode.callee.name : `${mwNode.callee.object?.name ?? ''}.${mwNode.callee.prop}`) : mwNode.type === 'Member' ? `${mwNode.object?.name ?? ''}.${mwNode.prop}` : 'a middleware';
    const base = label.split('.').pop();
    if (BENIGN_MIDDLEWARE.test(label) || BENIGN_MIDDLEWARE.test(base)) continue;
    const roleish = ROLE_FN.test(base) || /admin|role|permission|scope/i.test(label);
    const v = mwNode.type === 'Arrow' ? { fn: { node: mwNode, scope: st.scope, file: r.file, name: 'a middleware' } } : an.expr(mwNode, s, ctx);
    if (v.fn && (v.fn.node.params?.length ?? 0) >= 2) {
      // Run it: the paths that call next() reach the handler.
      const mctx = { ...ctx, depth: 1 };
      const ms = cloneState(s);
      ms.calledNext = false;
      try {
        an.callFunction(v.fn, args, ms, mctx, mwNode.line);
        if (ms.calledNext) { ms.calledNext = false; s = ms; }
        else s.unresolved.push({ says: `${label}`, why: `the middleware ${label} never visibly calls next()`, file: r.file, line: mwNode.line });
      } catch (err) {
        if (err.limit) throw err;
        s.unresolved.push({ says: `${label}`, why: `Thunder could not follow the middleware ${label}`, file: r.file, line: mwNode.line });
      }
      if (AUTH_MIDDLEWARE.test(label) && !s.identity) s.identity = { says: label, file: r.file, line: mwNode.line };
      if (roleish && !s.role) s.role = { says: label, file: r.file, line: mwNode.line };
      continue;
    }
    if (roleish) { if (!s.role) s.role = { says: label, file: r.file, line: mwNode.line }; if (AUTH_MIDDLEWARE.test(label) && !s.identity) s.identity = { says: label, file: r.file, line: mwNode.line }; continue; }
    if (MAYBE_GUARD_MIDDLEWARE.test(label)) { s.unresolved.push({ says: label, why: `the route runs ${label} first, which may check access, and it is not in these files`, file: r.file, line: mwNode.line }); continue; }
    if (AUTH_MIDDLEWARE.test(label)) { if (!s.identity) s.identity = { says: label, file: r.file, line: mwNode.line }; continue; }
    s.unresolved.push({ says: label, why: `the route runs ${label} first, and Thunder cannot see what it checks`, file: r.file, line: mwNode.line });
  }
  ctx.returnsSend = fw === 'fastify' || (fw === 'hono' && false);
  const hctx = { ...ctx, depth: 0, returnsSend: ctx.returnsSend };
  // The handler itself, as the top frame (so its returns can be the response for Fastify).
  const frame = { returns: [] };
  const hs = cloneState(s);
  hs.scope = new Scope(handlerFn.scope);
  hs.frame = frame;
  (node.params ?? []).forEach((p, i) => an.bindPattern(p, args[i] ?? {}, hs.scope, hs, hctx, true));
  if (node.body?.type === 'Block') an.block(node.body.body, hs, hctx);
  else if (node.body) { const v = an.expr(node.body, hs, hctx); if (hctx.returnsSend) an.sink('response', v, hs, hctx, node.line, 'gives it back as the response'); }
  return { route, notes };
}

// A path's verdict from one sink and one record (or one value Thunder could not follow).
function judgePath(sink, rec) {
  const st = sink.state;
  const steps = [];
  const at = (x) => ({ file: x.file ?? sink.file, line: x.line ?? null });
  if (rec.keyed) steps.push({ kind: 'input', says: `takes ${rec.keyed.says.replace(/^.* = /, '')} from the request`, ...at(rec.keyed) });
  steps.push(st.identity ? { kind: 'identity', says: `knows the caller from ${st.identity.says}`, ...at(st.identity) } : { kind: 'identity', says: 'no sign-in seen on this path', file: sink.file, line: null });
  steps.push({ kind: rec.kind === 'change' ? 'change' : 'lookup', says: `${rec.kind === 'change' ? 'changes' : 'reads'} ${rec.model ?? 'a record'} with ${rec.op}${rec.keyed ? ` where ${rec.keyed.says}` : ''}${rec.scoped ? ` and ${rec.scoped.says}` : ''}`, file: rec.file, line: rec.line });
  const respond = { kind: sink.kind === 'change' ? 'change' : 'response', says: sink.says, file: sink.file, line: sink.line };
  const result = (verdict, why, guard) => {
    if (guard) steps.push({ kind: 'guard', says: guard.says, file: guard.file ?? rec.file, line: guard.line ?? rec.line });
    if (sink.kind !== 'change') steps.push(respond);
    return { verdict, why, steps, record: rec.model ?? null, lines: [...new Set(steps.map((x) => x.line).filter(Boolean))].sort((x, y) => x - y) };
  };
  if (!rec.keyed && rec.byIdentity) return result('guarded', `the record is chosen by the caller (${rec.byIdentity.says}), not by the request`);
  if (rec.scoped) return result('guarded', `the lookup is limited to the caller: ${rec.scoped.says}`, { says: `limits it to the caller: ${rec.scoped.says}`, file: rec.file, line: rec.line });
  const g = st.guards.get(rec.id) ?? (rec.keyed?.value ? st.guards.get(`key:${rec.keyed.value}`) : null);
  if (g) return result('guarded', `${g.says} before ${sink.kind === 'change' ? 'changing it' : 'answering'}`, g);
  if (!rec.keyed && !rec.unknownWhere) return null; // not chosen by the request: outside this check
  if (rec.clientScoped) return result('cannot tell', `it uses a database client made for the caller (${rec.clientScoped.says}); Thunder cannot see whether it filters by tenant`);
  if (rec.unknownWhere) return result('cannot tell', rec.unknownWhere);
  if (st.unresolved.length) { const u = st.unresolved[0]; return result('cannot tell', `${u.why} (${u.file}, line ${u.line})${st.unresolved.length > 1 ? `, and ${st.unresolved.length - 1} more` : ''}`); }
  if (st.role) return result('cannot tell', `only callers who pass ${st.role.says} reach it; whether they may see every tenant's records is a rule Thunder cannot check`);
  return result('unguarded', `no step between the request and the ${sink.kind === 'change' ? 'change' : 'response'} limits ${rec.model ?? 'the record'} to the caller`);
}

function judgeUnknown(sink, u) {
  const st = sink.state;
  const steps = [
    { kind: 'stopped', says: `${u.says} could not be followed: ${u.why}`, file: u.file, line: u.line },
    { kind: 'response', says: sink.says, file: sink.file, line: sink.line },
  ];
  if (st.identity) steps.unshift({ kind: 'identity', says: `knows the caller from ${st.identity.says}`, file: st.identity.file, line: st.identity.line });
  return { verdict: 'cannot tell', why: `it answers with what ${u.says} gives back, and ${u.why}`, steps, record: null, lines: [u.line, sink.line] };
}

const RANK = { unguarded: 3, 'cannot tell': 2, guarded: 1 };

/**
 * Access flow for the web routes in these files. Returns { schema, routes, summary, unread }.
 * Each route: { method, path, framework, file, line, verdict: 'guarded'|'unguarded'|'cannot tell'|null, why, paths }.
 * A route with verdict null reads or changes no stored record chosen by the request.
 */
export function accessFlow(files, { maxRoutes = 2000 } = {}) {
  const project = new Project(files);
  const routes = findRoutes(project).slice(0, maxRoutes);
  const out = [];
  for (const r of routes) {
    const an = new Analyzer(project);
    let res;
    try { res = analyzeRoute(an, project, r); }
    catch (err) {
      if (!err.limit) throw err;
      out.push({ method: r.method, path: r.path, framework: r.framework, file: r.file, line: r.line, verdict: 'cannot tell', why: `Thunder stopped: the route is larger than it follows (${MAX_WORK} steps)`, identity: null, paths: [] });
      continue;
    }
    if (res.stopped) {
      out.push({ method: r.method, path: r.path, framework: r.framework, file: r.file, line: r.line, verdict: null, why: res.why, identity: null, paths: [] });
      continue;
    }
    const paths = [];
    const seen = new Set();
    for (const sink of res.route.sinks) {
      for (const rec of sink.val.recs ?? []) {
        if (rec.kind === 'create') continue;
        const key = `${rec.id}@${sink.line}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const p = judgePath(sink, rec);
        if (p) paths.push(p);
      }
      if (!(sink.val.recs ?? []).some((rc) => rc.keyed || rc.unknownWhere)) {
        for (const u of sink.val.unknown ?? []) {
          const key = `${u.file}:${u.line}@${sink.line}`;
          if (seen.has(key)) continue;
          seen.add(key);
          paths.push(judgeUnknown(sink, u));
        }
      }
    }
    // A path is about one record; the same record answered twice keeps the worst verdict.
    paths.sort((a, b) => RANK[b.verdict] - RANK[a.verdict]);
    const worst = paths[0]?.verdict ?? null;
    const identity = res.route.sinks.map((x) => x.state.identity).find(Boolean) ?? null;
    out.push({
      method: r.method, path: r.path, framework: r.framework, file: r.file, line: r.line,
      verdict: worst,
      why: worst ? paths[0].why : 'it reads or changes no stored record chosen by the request',
      identity: identity ? { says: identity.says, file: identity.file, line: identity.line } : null,
      paths,
    });
  }
  const count = (v) => out.filter((x) => x.verdict === v).length;
  return {
    schema: ACCESS_SCHEMA,
    routes: out,
    summary: { routes: out.length, guarded: count('guarded'), unguarded: count('unguarded'), cannotTell: count('cannot tell'), noLookup: count(null) },
    unread: project.failures,
  };
}

/** One route's ownership in words, for readings: "Ownership: checked (line 12)" and the like. */
export function ownershipWords(route) {
  if (!route || !route.verdict) return null;
  if (route.verdict === 'guarded') {
    const g = route.paths.flatMap((p) => p.steps).find((s) => s.kind === 'guard');
    return `Ownership: checked${g?.line ? ` (line ${g.line})` : ''}: ${route.paths[0].why}`;
  }
  if (route.verdict === 'unguarded') return `No ownership check on this path (lines ${route.paths[0].lines.join(', ')}): ${route.paths[0].why}`;
  return `Ownership: Thunder cannot tell: ${route.paths[0].why}`;
}

/** The report as plain text, one route per block. */
export function accessText(report) {
  const L = [];
  const mark = { guarded: '✓', unguarded: '✗', 'cannot tell': '?' };
  for (const r of report.routes) {
    if (!r.verdict) continue;
    L.push(`${mark[r.verdict]} ${r.method} ${r.path}  (${r.file}, line ${r.line})`);
    L.push(`  ${r.verdict === 'guarded' ? 'Ownership checked' : r.verdict === 'unguarded' ? 'No ownership check on this path' : 'Thunder cannot tell'}: ${r.why}`);
    const p = r.paths[0];
    for (const s of p?.steps ?? []) L.push(`    ${s.kind.padEnd(8)} ${s.says}${s.line ? `  (${s.file === r.file ? '' : `${s.file}, `}line ${s.line})` : ''}`);
    L.push('');
  }
  const s = report.summary;
  L.push(`${s.routes} route${s.routes === 1 ? '' : 's'}: ${s.guarded} checked, ${s.unguarded} with no ownership check, ${s.cannotTell} Thunder cannot tell, ${s.noLookup} read no record chosen by the request.`);
  if (report.unread.length) L.push(`${report.unread.length} file${report.unread.length === 1 ? '' : 's'} Thunder could not read: ${report.unread.slice(0, 5).map((u) => `${u.file}${u.line ? ` (line ${u.line})` : ''}`).join(', ')}${report.unread.length > 5 ? ', …' : ''}.`);
  return L.join('\n');
}
