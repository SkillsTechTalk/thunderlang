// IntentLift: Code-to-Intent (deterministic, no AI). Lifts source code into an
// INFERRED ThunderLang draft. Generated intent is useful but humble: it carries
// evidence, confidence, unknowns, and needs_review, and is never marked verified.
//
// Pipeline: source -> Language Adapter -> CodeFactsIR -> Inference -> LiftedIntent -> .intent text
// P0 ships a TypeScript adapter. Other languages (Rust, Perl, ...) plug in as
// adapters that emit the same CodeFactsIR, so they share this inference engine.

import { slug } from './parse.mjs';
import { COMPILER_VERSION } from './emit.mjs';

const IR_SCHEMA_VERSION = '0.1.0';
const SEMANTIC_TYPES = new Set([
  'Email', 'Money', 'Currency', 'Url', 'UserId', 'AccountId', 'OrderId', 'InvoiceId',
  'PaymentId', 'Secret', 'Token', 'Jwt', 'IdempotencyKey', 'Date', 'DateTime',
  'Duration', 'Percentage', 'TraceId', 'CorrelationId',
]);
const SENSITIVE = /password|token|jwt|secret|payment|credential|ssn|pii|email/i;

const lineOf = (source, index) => source.slice(0, index).split('\n').length;

// ── Seeded lift (OT's intent-ir-v1 grounding) ────────────────────────────────
// OT passes { seeds } so the lifted .intent references OT's EXACT node ids instead
// of lift's own function refs , no divergent second reading of the repo. The
// load-bearing pair is { nodeId, evidenceRef.sourceLocations }; the rest is
// enrichment. Additive: with no seeds, liftSource output is byte-identical to before.
// The machine-readable contract OT keys on.
export const SEED_SCHEMA = {
  $id: 'intent-seed-v1',
  title: 'IntentSeed',
  description: 'An OT intent-ir-v1 node handed to liftSource so the lifted draft references it.',
  type: 'object',
  required: ['nodeId', 'evidenceRef'],
  properties: {
    nodeId: { type: 'string', description: 'OT stable intent-ir-v1 node id, e.g. "cap:auth"' },
    nodeType: { type: 'string', description: 'intent-ir-v1 node type (Capability | SystemContract | ...)' },
    title: { type: 'string', description: "OT's deterministic title (ground truth)" },
    confidence: { type: 'string', description: 'observed|derived|inferred|speculative|conflicted|confirmed' },
    evidenceRef: {
      type: 'object',
      required: ['signals'],
      properties: {
        signals: { type: 'array', items: { type: 'string' } },
        sourceLocations: {
          type: 'array',
          items: { type: 'object', required: ['file'], properties: { file: { type: 'string' }, line: { type: 'integer' } } },
        },
        ledgerRef: { type: 'object', required: ['seq', 'hash'], properties: { seq: { type: 'integer' }, hash: { type: 'string' } } },
      },
    },
  },
};

// Defensively normalize OT's seeds: drop malformed entries, keep input order (deterministic),
// and coerce evidenceRef to a stable shape. A seed with no string nodeId is dropped (it is
// the one load-bearing field). Never throws , a bad seed is skipped, not fatal.
export function normalizeSeeds(seeds) {
  if (!Array.isArray(seeds)) return [];
  const out = [];
  for (const s of seeds) {
    if (!s || typeof s !== 'object') continue;
    const nodeId = typeof s.nodeId === 'string' ? s.nodeId.trim() : '';
    if (!nodeId) continue;
    const ev = s.evidenceRef && typeof s.evidenceRef === 'object' ? s.evidenceRef : {};
    const signals = Array.isArray(ev.signals)
      ? ev.signals.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : [];
    const sourceLocations = Array.isArray(ev.sourceLocations)
      ? ev.sourceLocations
          .filter((l) => l && typeof l === 'object' && typeof l.file === 'string' && l.file.trim())
          .map((l) => ({ file: l.file.trim(), ...(Number.isInteger(l.line) ? { line: l.line } : {}) }))
      : [];
    let ledgerRef;
    if (ev.ledgerRef && typeof ev.ledgerRef === 'object'
        && Number.isInteger(ev.ledgerRef.seq) && typeof ev.ledgerRef.hash === 'string') {
      ledgerRef = { seq: ev.ledgerRef.seq, hash: ev.ledgerRef.hash };
    }
    out.push({
      nodeId,
      nodeType: typeof s.nodeType === 'string' ? s.nodeType : null,
      title: typeof s.title === 'string' ? s.title : null,
      confidence: typeof s.confidence === 'string' ? s.confidence : null,
      evidenceRef: { signals, sourceLocations, ...(ledgerRef ? { ledgerRef } : {}) },
    });
  }
  return out;
}

// Turn create_invoice / createInvoice -> "create invoice"; -> PascalCase for a mission name.
function words(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase().trim();
}
function pascal(name) {
  return words(name).split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

function parseParams(raw) {
  if (!raw.trim()) return [];
  return raw.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
    const m = p.match(/^([A-Za-z_$][\w$]*)\s*:?\s*([^=]+)?/);
    const name = m ? m[1] : p;
    let type = m && m[2] ? m[2].trim() : null;
    return { name, type };
  });
}

// ── TypeScript / JavaScript adapter -> CodeFactsIR ───────────────────────────
export function extractFactsTypeScript(source, file = 'input.ts') {
  const functions = [];
  const seen = new Set();
  const addFn = (name, paramsRaw, ret, idx) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    functions.push({
      name, file, line: lineOf(source, idx),
      parameters: parseParams(paramsRaw || ''),
      returnType: ret ? ret.trim().replace(/[{=].*$/, '').trim() : null,
      evidence: [{ kind: 'function_signature', file, line: lineOf(source, idx) }],
    });
  };

  let m;
  const named = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?::\s*([^{]+))?/g;
  while ((m = named.exec(source))) addFn(m[1], m[2], m[3], m.index);
  const arrow = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*([^=]+?))?\s*=>/g;
  while ((m = arrow.exec(source))) addFn(m[1], m[2], m[3], m.index);

  const tests = [];
  const testRe = /\b(?:test|it)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  while ((m = testRe.exec(source))) tests.push({ name: m[1], file, line: lineOf(source, m.index) });

  const errors = [];
  const errSeen = new Set();
  const addErr = (name, idx) => { if (name && !errSeen.has(name)) { errSeen.add(name); errors.push({ name, file, line: lineOf(source, idx) }); } };
  const classErr = /class\s+([A-Za-z_$][\w$]*(?:Error|Exception))\b/g;
  while ((m = classErr.exec(source))) addErr(m[1], m.index);
  const thrown = /throw\s+new\s+([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = thrown.exec(source))) addErr(m[1], m.index);

  return {
    schemaVersion: IR_SCHEMA_VERSION, sourceLanguage: 'typescript', sourceRoot: file,
    functions, tests, errors,
  };
}

// Split on a top-level delimiter, ignoring ones inside <>, (), [], {}.
function splitTopLevel(str, delim) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of str) {
    if ('<([{'.includes(ch)) depth++;
    else if ('>)]}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === delim && depth === 0) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function parseRustParams(raw) {
  return splitTopLevel(raw, ',').map((p) => p.trim()).filter(Boolean)
    .filter((p) => !/^&?\s*(mut\s+)?self$/.test(p))
    .map((p) => {
      const m = p.replace(/^mut\s+/, '').match(/^([A-Za-z_]\w*)\s*:\s*(.+)$/);
      if (!m) return { name: p, type: null };
      return { name: m[1], type: m[2].trim().replace(/^&(mut\s+)?/, '') };
    });
}

// ── Rust adapter -> CodeFactsIR (strong types, Result<T,E>, error enums) ─────
export function extractFactsRust(source, file = 'input.rs') {
  let m;
  // tests first: #[test] / #[tokio::test] fn <name>
  const tests = [];
  const testNames = new Set();
  const testRe = /#\[\s*(?:tokio::)?test\s*\][\s\S]*?fn\s+(\w+)/g;
  while ((m = testRe.exec(source))) { tests.push({ name: m[1], file, line: lineOf(source, m.index) }); testNames.add(m[1]); }

  const functions = [];
  const seen = new Set();
  const fnRe = /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)\s*(?:->\s*([^{;]+))?/g;
  while ((m = fnRe.exec(source))) {
    const name = m[1];
    if (seen.has(name) || testNames.has(name)) continue;
    seen.add(name);
    functions.push({
      name, file, line: lineOf(source, m.index),
      parameters: parseRustParams(m[2] || ''),
      returnType: m[3] ? m[3].trim() : null,
      evidence: [{ kind: 'function_signature', file, line: lineOf(source, m.index) }],
    });
  }

  // error enum variants: `enum <Name>Error { DuplicateInvoice, Unauthorized(..) }`
  const errors = [];
  const seenErr = new Set();
  const enumRe = /enum\s+(\w*Error)\s*\{([^}]*)\}/g;
  while ((m = enumRe.exec(source))) {
    for (const raw of splitTopLevel(m[2], ',')) {
      const v = raw.trim().replace(/[({].*$/s, '').trim();
      if (v && /^[A-Z]/.test(v) && !seenErr.has(v)) { seenErr.add(v); errors.push({ name: v, source: m[1], file, line: lineOf(source, m.index) }); }
    }
  }

  return { schemaVersion: IR_SCHEMA_VERSION, sourceLanguage: 'rust', sourceRoot: file, functions, tests, errors };
}

// ── Perl adapter -> CodeFactsIR (dynamic: conservative, Unknown types) ───────
export function extractFactsPerl(source, file = 'input.pl') {
  let m;
  const functions = [];
  const seen = new Set();
  const subRe = /sub\s+(\w+)\s*(?:\(([^)]*)\))?\s*\{/g;
  while ((m = subRe.exec(source))) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    let params = [];
    if (m[2] && m[2].trim()) {
      params = m[2].split(',').map((s) => s.trim().replace(/^[$@%]/, '')).filter(Boolean).map((n) => ({ name: n, type: 'Unknown' }));
    } else {
      const after = source.slice(m.index, m.index + 300);
      const mm = after.match(/my\s*\(([^)]*)\)\s*=\s*@_/);
      if (mm) params = mm[1].split(',').map((s) => s.trim().replace(/^\$/, '')).filter(Boolean).map((n) => ({ name: n, type: 'Unknown' }));
    }
    functions.push({ name, file, line: lineOf(source, m.index), parameters: params, returnType: null, evidence: [{ kind: 'sub', file, line: lineOf(source, m.index) }] });
  }

  const errors = [];
  const seenErr = new Set();
  const dieRe = /\b(?:die|croak|confess)\s+["']([^"']+)["']/g;
  while ((m = dieRe.exec(source))) {
    const s = m[1].replace(/\\n$/, '').trim().slice(0, 60);
    const key = s.toLowerCase();
    if (s && !seenErr.has(key)) { seenErr.add(key); errors.push({ name: s, file, line: lineOf(source, m.index) }); }
  }

  const tests = [];
  const seenT = new Set();
  const addTest = (name, idx) => { const k = name.toLowerCase(); if (name && !seenT.has(k)) { seenT.add(k); tests.push({ name, file, line: lineOf(source, idx) }); } };
  const subtestRe = /subtest\s+["']([^"']+)["']/g;
  while ((m = subtestRe.exec(source))) addTest(m[1], m.index);
  const okRe = /\b(?:ok|is|isnt|like)\s*\([^;]*?,\s*["']([^"']+)["']\s*\)/g;
  while ((m = okRe.exec(source))) addTest(m[1], m.index);

  return { schemaVersion: IR_SCHEMA_VERSION, sourceLanguage: 'perl', sourceRoot: file, functions, tests, errors };
}

// Params written "Type name" (Java, C#, Go, C++). Strips annotations/qualifiers; the last
// token is the name, the rest is the type. Handles varargs and array brackets best-effort.
function parseTypeFirstParams(raw) {
  return splitTopLevel(raw, ',').map((p) => p.trim()).filter(Boolean).map((p) => {
    const cleaned = p.replace(/@\w+(\([^)]*\))?/g, '').replace(/\b(final|const|readonly|in|out|ref|params)\b/g, '').replace(/=.*$/, '').trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const name = parts[parts.length - 1].replace(/[[\]]/g, '').replace(/^[*&]+/, '');
      const type = parts.slice(0, -1).join(' ').replace(/^[*&]+/, '');
      return { name, type };
    }
    return { name: cleaned.replace(/[[\]*&]/g, ''), type: null };
  });
}
const addErrOf = (errors, seen, source) => (name, idx) => {
  if (name && !seen.has(name)) { seen.add(name); errors.push({ name, file: source._file, line: lineOf(source._src, idx) }); }
};

// ── Python adapter (dynamic: types when annotated, else Unknown) ─────────────
export function extractFactsPython(source, file = 'input.py') {
  let m; const functions = []; const tests = []; const seen = new Set();
  const fnRe = /^[ \t]*(?:async\s+)?def\s+(\w+)\s*\(([\s\S]*?)\)\s*(?:->\s*([^:]+))?:/gm;
  while ((m = fnRe.exec(source))) {
    const name = m[1];
    if (/^test_/.test(name)) { tests.push({ name, file, line: lineOf(source, m.index) }); continue; }
    if (seen.has(name)) continue; seen.add(name);
    const params = splitTopLevel(m[2] || '', ',').map((p) => p.trim()).filter((p) => p && !/^(self|cls)$/.test(p) && !p.startsWith('*'))
      .map((p) => { const nd = p.split('=')[0].trim(); const mm = nd.match(/^(\w+)\s*:\s*(.+)$/); return mm ? { name: mm[1], type: mm[2].trim() } : { name: nd, type: null }; });
    functions.push({ name, file, line: lineOf(source, m.index), indent: (m[0].match(/^[ \t]*/) || [''])[0].length, parameters: params, returnType: m[3] ? m[3].trim() : null, evidence: [{ kind: 'def', file, line: lineOf(source, m.index) }] });
  }
  const errors = []; const addErr = addErrOf(errors, new Set(), { _src: source, _file: file });
  const classErr = /class\s+(\w*(?:Error|Exception))\s*[(:]/g; while ((m = classErr.exec(source))) addErr(m[1], m.index);
  const raiseRe = /raise\s+(\w+)\s*\(/g; while ((m = raiseRe.exec(source))) addErr(m[1], m.index);
  return { schemaVersion: IR_SCHEMA_VERSION, sourceLanguage: 'python', sourceRoot: file, functions, tests, errors };
}

// ── Java adapter (Type-first params, @Test methods, *Exception) ──────────────
export function extractFactsJava(source, file = 'input.java') {
  let m; const functions = []; const tests = []; const seen = new Set();
  const testMethods = new Set(); const ta = /@Test\b[\s\S]{0,120}?\b(\w+)\s*\(/g; while ((m = ta.exec(source))) testMethods.add(m[1]);
  const methodRe = /(?:public|private|protected|static|final|abstract|synchronized|default)\s+(?:[\w$.<>,\[\]\s]*?\s+)?([A-Za-z_$][\w$.<>,\[\]]*?)\s+([A-Za-z_$]\w*)\s*\(([^)]*)\)\s*(?:throws[\w\s,.]+)?\{/g;
  while ((m = methodRe.exec(source))) {
    const ret = m[1].trim(); const name = m[2];
    if (['if', 'for', 'while', 'switch', 'catch', 'return'].includes(name)) continue;
    if (['class', 'interface', 'enum', 'new', 'return'].includes(ret)) continue;
    if (testMethods.has(name)) { if (!tests.some((t) => t.name === name)) tests.push({ name, file, line: lineOf(source, m.index) }); continue; }
    if (seen.has(name)) continue; seen.add(name);
    functions.push({ name, file, line: lineOf(source, m.index), parameters: parseTypeFirstParams(m[3] || ''), returnType: ret, evidence: [{ kind: 'method', file, line: lineOf(source, m.index) }] });
  }
  const errors = []; const addErr = addErrOf(errors, new Set(), { _src: source, _file: file });
  let mm; const ce = /class\s+(\w*(?:Exception|Error))\b/g; while ((mm = ce.exec(source))) addErr(mm[1], mm.index);
  const th = /throw\s+new\s+(\w+)\s*\(/g; while ((mm = th.exec(source))) addErr(mm[1], mm.index);
  return { schemaVersion: IR_SCHEMA_VERSION, sourceLanguage: 'java', sourceRoot: file, functions, tests, errors };
}

// ── C# adapter (Type-first, [Fact]/[Test], *Exception) ───────────────────────
export function extractFactsCSharp(source, file = 'input.cs') {
  let m; const functions = []; const tests = []; const seen = new Set();
  const testMethods = new Set(); const ta = /\[(?:Fact|Test|TestMethod|Theory)\][\s\S]{0,160}?\b(\w+)\s*\(/g; while ((m = ta.exec(source))) testMethods.add(m[1]);
  const methodRe = /(?:public|private|protected|internal|static|async|virtual|override|sealed)\s+(?:[\w.<>,\[\]\s]*?\s+)?([A-Za-z_][\w.<>,\[\]]*?)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{/g;
  while ((m = methodRe.exec(source))) {
    const ret = m[1].trim(); const name = m[2];
    if (['if', 'for', 'while', 'switch', 'catch', 'return', 'using', 'lock'].includes(name)) continue;
    if (testMethods.has(name)) { if (!tests.some((t) => t.name === name)) tests.push({ name, file, line: lineOf(source, m.index) }); continue; }
    if (seen.has(name)) continue; seen.add(name);
    functions.push({ name, file, line: lineOf(source, m.index), parameters: parseTypeFirstParams(m[3] || ''), returnType: ret, evidence: [{ kind: 'method', file, line: lineOf(source, m.index) }] });
  }
  const errors = []; const addErr = addErrOf(errors, new Set(), { _src: source, _file: file });
  let mm; const ce = /class\s+(\w*(?:Exception|Error))\b/g; while ((mm = ce.exec(source))) addErr(mm[1], mm.index);
  const th = /throw\s+new\s+(\w+)\s*\(/g; while ((mm = th.exec(source))) addErr(mm[1], mm.index);
  return { schemaVersion: IR_SCHEMA_VERSION, sourceLanguage: 'csharp', sourceRoot: file, functions, tests, errors };
}

// ── Go adapter (name-Type params, TestXxx, error values) ─────────────────────
export function extractFactsGo(source, file = 'input.go') {
  let m; const functions = []; const tests = []; const seen = new Set();
  const fnRe = /func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\(([^)]*)\)\s*([^{]*?)\{/g;
  while ((m = fnRe.exec(source))) {
    const name = m[1]; const params = m[2] || '';
    if (/^Test/.test(name) && /testing\.[TBM]/.test(params)) { tests.push({ name, file, line: lineOf(source, m.index) }); continue; }
    if (seen.has(name)) continue; seen.add(name);
    const parameters = splitTopLevel(params, ',').map((p) => p.trim()).filter(Boolean).map((p) => { const parts = p.split(/\s+/); return parts.length >= 2 ? { name: parts[0], type: parts.slice(1).join(' ').replace(/^[*&]+/, '') } : { name: p, type: null }; });
    functions.push({ name, file, line: lineOf(source, m.index), parameters, returnType: (m[3] || '').trim() || null, evidence: [{ kind: 'func', file, line: lineOf(source, m.index) }] });
  }
  const errors = []; const seenErr = new Set();
  const addErr = (n, idx) => { const k = String(n).toLowerCase(); if (n && !seenErr.has(k)) { seenErr.add(k); errors.push({ name: n, file, line: lineOf(source, idx) }); } };
  let mm; const es = /(?:errors\.New|fmt\.Errorf)\(\s*"([^"]+)"/g; while ((mm = es.exec(source))) addErr(mm[1].slice(0, 60), mm.index);
  const et = /type\s+(\w*Error)\s+struct/g; while ((mm = et.exec(source))) addErr(mm[1], mm.index);
  return { schemaVersion: IR_SCHEMA_VERSION, sourceLanguage: 'go', sourceRoot: file, functions, tests, errors };
}

// ── C / C++ adapter (Type-first, gtest TEST, throw/exception) ────────────────
export function extractFactsCpp(source, file = 'input.cpp') {
  let m; const functions = []; const tests = []; const seen = new Set();
  const tr = /\bTEST(?:_F|_P)?\s*\(\s*\w+\s*,\s*(\w+)\s*\)/g; while ((m = tr.exec(source))) tests.push({ name: m[1], file, line: lineOf(source, m.index) });
  const CTRL = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'sizeof', 'else', 'do']);
  const fnRe = /(?:^|\n)[ \t]*((?:[A-Za-z_][\w:]*(?:\s*<[^;{>]*>)?[\s*&]+)+)([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:const|noexcept|override)?\s*\{/g;
  while ((m = fnRe.exec(source))) {
    const ret = m[1].trim(); const name = m[2];
    if (CTRL.has(name)) continue;
    if (seen.has(name)) continue; seen.add(name);
    functions.push({ name, file, line: lineOf(source, m.index), parameters: parseTypeFirstParams(m[3] || ''), returnType: ret, evidence: [{ kind: 'function', file, line: lineOf(source, m.index) }] });
  }
  const errors = []; const addErr = addErrOf(errors, new Set(), { _src: source, _file: file });
  let mm; const ce = /(?:class|struct)\s+(\w*(?:Exception|Error))\b/g; while ((mm = ce.exec(source))) addErr(mm[1], mm.index);
  const th = /throw\s+(?:std::)?(\w+)\s*[({]/g; while ((mm = th.exec(source))) addErr(mm[1], mm.index);
  return { schemaVersion: IR_SCHEMA_VERSION, sourceLanguage: 'cpp', sourceRoot: file, functions, tests, errors };
}

// ── PHP adapter (Type $name params, test* methods, *Exception) ───────────────
export function extractFactsPhp(source, file = 'input.php') {
  let m; const functions = []; const tests = []; const seen = new Set();
  const fnRe = /(?:public|private|protected|static|final|abstract)?\s*function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*\??([\w\\]+))?/g;
  while ((m = fnRe.exec(source))) {
    const name = m[1];
    if (/^test/i.test(name)) { tests.push({ name, file, line: lineOf(source, m.index) }); continue; }
    if (seen.has(name)) continue; seen.add(name);
    const parameters = splitTopLevel(m[2] || '', ',').map((p) => p.trim()).filter(Boolean).map((p) => { const mm = p.match(/^(?:\??([\w\\|]+)\s+)?[&.]*\$(\w+)/); return mm ? { name: mm[2], type: mm[1] || null } : { name: p.replace(/[^\w]/g, ''), type: null }; });
    functions.push({ name, file, line: lineOf(source, m.index), parameters, returnType: m[3] ? m[3].trim() : null, evidence: [{ kind: 'function', file, line: lineOf(source, m.index) }] });
  }
  const errors = []; const addErr = addErrOf(errors, new Set(), { _src: source, _file: file });
  let mm; const ce = /class\s+(\w*(?:Exception|Error))\b/g; while ((mm = ce.exec(source))) addErr(mm[1], mm.index);
  const th = /throw\s+new\s+(\w+)\s*\(/g; while ((mm = th.exec(source))) addErr(mm[1], mm.index);
  return { schemaVersion: IR_SCHEMA_VERSION, sourceLanguage: 'php', sourceRoot: file, functions, tests, errors };
}

// ── Ruby adapter (dynamic, def methods, it/test blocks, *Error) ──────────────
export function extractFactsRuby(source, file = 'input.rb') {
  let m; const functions = []; const tests = []; const seen = new Set();
  const fnRe = /^[ \t]*def\s+(?:self\.)?([a-z_]\w*[!?=]?)\s*(?:\(([^)]*)\))?/gm;
  while ((m = fnRe.exec(source))) {
    const name = m[1];
    if (/^test_/.test(name)) { tests.push({ name, file, line: lineOf(source, m.index) }); continue; }
    if (seen.has(name)) continue; seen.add(name);
    const parameters = splitTopLevel(m[2] || '', ',').map((p) => p.trim()).filter(Boolean).map((p) => ({ name: p.split(/[:=]/)[0].trim().replace(/^[*&]+/, ''), type: null }));
    functions.push({ name, file, line: lineOf(source, m.index), indent: (m[0].match(/^[ \t]*/) || [''])[0].length, parameters, returnType: null, evidence: [{ kind: 'def', file, line: lineOf(source, m.index) }] });
  }
  const seenT = new Set(); const addTest = (n, idx) => { const k = String(n).toLowerCase(); if (n && !seenT.has(k)) { seenT.add(k); tests.push({ name: n, file, line: lineOf(source, idx) }); } };
  const itRe = /\b(?:it|test|describe|context|specify)\s+["']([^"']+)["']/g; while ((m = itRe.exec(source))) addTest(m[1], m.index);
  const errors = []; const seenErr = new Set(); const addErr = (n, idx) => { if (n && !seenErr.has(n)) { seenErr.add(n); errors.push({ name: n, file, line: lineOf(source, idx) }); } };
  const ce = /class\s+(\w*(?:Error|Exception))\s*</g; while ((m = ce.exec(source))) addErr(m[1], m.index);
  const raiseRe = /raise\s+(\w+)/g; while ((m = raiseRe.exec(source))) { if (/^[A-Z]/.test(m[1])) addErr(m[1], m.index); }
  return { schemaVersion: IR_SCHEMA_VERSION, sourceLanguage: 'ruby', sourceRoot: file, functions, tests, errors };
}

// Params written "name: Type" (Kotlin, Scala). Top-level comma split so generics/tuples
// like Map<String, Int> or (A, B) don't split mid-type. Strips val/var/vararg/implicit and defaults.
function parseNameColonTypeParams(raw) {
  return splitTopLevel(raw, ',').map((p) => p.trim()).filter(Boolean).map((p) => {
    const cleaned = p.replace(/@\w+(\([^)]*\))?/g, '').replace(/^(?:val|var|vararg|implicit|final|lazy)\s+/, '').replace(/=.*$/, '').trim();
    const mm = cleaned.match(/^([A-Za-z_]\w*)\s*:\s*(.+)$/);
    if (mm) return { name: mm[1], type: mm[2].trim() };
    return { name: cleaned.replace(/[^\w].*$/, '') || cleaned, type: null };
  });
}

// ── Kotlin adapter (JVM: fun name(p: Type): Ret, @Test, *Exception) ──────────
export function extractFactsKotlin(source, file = 'input.kt') {
  let m; const functions = []; const tests = []; const seen = new Set();
  const testMethods = new Set(); const ta = /@Test\b[\s\S]{0,120}?\bfun\s+(?:`([^`]+)`|(\w+))\s*\(/g;
  while ((m = ta.exec(source))) testMethods.add(m[1] || m[2]);
  const fnRe = /\bfun\s+(?:<[^>]*>\s*)?(?:[A-Za-z_][\w.]*\.)?(?:`([^`]+)`|([A-Za-z_]\w*))\s*\(([^)]*)\)\s*(?::\s*([^{=\n]+))?/g;
  while ((m = fnRe.exec(source))) {
    const name = m[1] || m[2];
    if (testMethods.has(name)) { if (!tests.some((t) => t.name === name)) tests.push({ name, file, line: lineOf(source, m.index) }); continue; }
    if (seen.has(name)) continue; seen.add(name);
    functions.push({ name, file, line: lineOf(source, m.index), parameters: parseNameColonTypeParams(m[3] || ''), returnType: m[4] ? m[4].trim() : null, evidence: [{ kind: 'fun', file, line: lineOf(source, m.index) }] });
  }
  const errors = []; const addErr = addErrOf(errors, new Set(), { _src: source, _file: file });
  let mm; const ce = /class\s+(\w*(?:Exception|Error))\b/g; while ((mm = ce.exec(source))) addErr(mm[1], mm.index);
  const th = /throw\s+(\w+)\s*\(/g; while ((mm = th.exec(source))) addErr(mm[1], mm.index); // Kotlin: no `new`
  return { schemaVersion: IR_SCHEMA_VERSION, sourceLanguage: 'kotlin', sourceRoot: file, functions, tests, errors };
}

// ── Scala adapter (def name(p: Type): Ret, ScalaTest, *Exception) ─────────────
export function extractFactsScala(source, file = 'input.scala') {
  let m; const functions = []; const tests = []; const seen = new Set();
  const fnRe = /\bdef\s+([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*\(([^)]*)\)\s*(?::\s*([^={\n]+))?/g;
  while ((m = fnRe.exec(source))) {
    const name = m[1];
    if (seen.has(name)) continue; seen.add(name);
    functions.push({ name, file, line: lineOf(source, m.index), parameters: parseNameColonTypeParams(m[2] || ''), returnType: m[3] ? m[3].trim() : null, evidence: [{ kind: 'def', file, line: lineOf(source, m.index) }] });
  }
  // ScalaTest: `test("desc")` (FunSuite) and `"desc" in { }` / `"desc" should`/`must` (WordSpec/FlatSpec).
  const seenT = new Set(); const addTest = (n, idx) => { const k = String(n).toLowerCase(); if (n && !seenT.has(k)) { seenT.add(k); tests.push({ name: n, file, line: lineOf(source, idx) }); } };
  const tr = /\btest\s*\(\s*"([^"]+)"/g; while ((m = tr.exec(source))) addTest(m[1], m.index);
  const inRe = /"([^"]+)"\s+(?:in|should|must)\b/g; while ((m = inRe.exec(source))) addTest(m[1], m.index);
  const errors = []; const addErr = addErrOf(errors, new Set(), { _src: source, _file: file });
  let mm; const ce = /class\s+(\w*(?:Exception|Error))\b/g; while ((mm = ce.exec(source))) addErr(mm[1], mm.index);
  const th = /throw\s+new\s+(\w+)\s*\(/g; while ((mm = th.exec(source))) addErr(mm[1], mm.index);
  return { schemaVersion: IR_SCHEMA_VERSION, sourceLanguage: 'scala', sourceRoot: file, functions, tests, errors };
}

// ── Elixir adapter (dynamic: def/defp name(args), ExUnit test, raise/defexception)
export function extractFactsElixir(source, file = 'input.ex') {
  let m; const functions = []; const tests = []; const seen = new Set();
  const seenT = new Set(); const addTest = (n, idx) => { const k = String(n).toLowerCase(); if (n && !seenT.has(k)) { seenT.add(k); tests.push({ name: n, file, line: lineOf(source, idx) }); } };
  const tr = /\btest\s+"([^"]+)"/g; while ((m = tr.exec(source))) addTest(m[1], m.index); // ExUnit: test "desc" do
  const fnRe = /^[ \t]*defp?\s+([a-z_]\w*[!?]?)\s*(?:\(([^)]*)\))?/gm;
  while ((m = fnRe.exec(source))) {
    const name = m[1];
    if (seen.has(name)) continue; seen.add(name);
    // Elixir params are pattern matches (conn, %{id: id}, x \\ default); take the leading binding name.
    const parameters = splitTopLevel(m[2] || '', ',').map((p) => p.trim()).filter(Boolean)
      .map((p) => ({ name: p.split(/\\\\/)[0].trim().replace(/^%\{?/, '').replace(/[^\w].*$/, '') || p, type: null }));
    functions.push({ name, file, line: lineOf(source, m.index), indent: (m[0].match(/^[ \t]*/) || [''])[0].length, parameters, returnType: null, evidence: [{ kind: 'def', file, line: lineOf(source, m.index) }] });
  }
  const errors = []; const seenErr = new Set(); const addErr = (n, idx) => { if (n && !seenErr.has(n)) { seenErr.add(n); errors.push({ name: n, file, line: lineOf(source, idx) }); } };
  const modErr = /defmodule\s+([\w.]*(?:Error|Exception))\b/g; while ((m = modErr.exec(source))) addErr(m[1].split('.').pop(), m.index);
  const raiseRe = /raise\s+([A-Z][\w.]*)/g; while ((m = raiseRe.exec(source))) addErr(m[1].split('.').pop(), m.index);
  return { schemaVersion: IR_SCHEMA_VERSION, sourceLanguage: 'elixir', sourceRoot: file, functions, tests, errors };
}

const ADAPTERS = {
  typescript: extractFactsTypeScript, ts: extractFactsTypeScript,
  javascript: extractFactsTypeScript, js: extractFactsTypeScript,
  rust: extractFactsRust, rs: extractFactsRust,
  perl: extractFactsPerl, pl: extractFactsPerl,
  python: extractFactsPython, py: extractFactsPython,
  java: extractFactsJava,
  csharp: extractFactsCSharp, cs: extractFactsCSharp, 'c#': extractFactsCSharp,
  go: extractFactsGo, golang: extractFactsGo,
  cpp: extractFactsCpp, 'c++': extractFactsCpp, c: extractFactsCpp, cc: extractFactsCpp,
  php: extractFactsPhp,
  ruby: extractFactsRuby, rb: extractFactsRuby,
  kotlin: extractFactsKotlin, kt: extractFactsKotlin, kts: extractFactsKotlin,
  scala: extractFactsScala, sc: extractFactsScala,
  elixir: extractFactsElixir, ex: extractFactsElixir, exs: extractFactsElixir,
};
export const SUPPORTED_LANGUAGES = ['typescript', 'javascript', 'python', 'java', 'csharp', 'go', 'rust', 'cpp', 'php', 'ruby', 'perl', 'kotlin', 'scala', 'elixir'];
const DYNAMIC_LANGUAGES = new Set(['perl', 'javascript', 'python', 'ruby', 'php', 'elixir']);

const LANG_DISPLAY = {
  typescript: 'TypeScript', javascript: 'JavaScript', python: 'Python', java: 'Java',
  csharp: 'C#', go: 'Go', rust: 'Rust', cpp: 'C++', php: 'PHP', ruby: 'Ruby', perl: 'Perl',
  kotlin: 'Kotlin', scala: 'Scala', elixir: 'Elixir',
};

// Unwrap Result<T, E> / Promise<T> / T -> { output, error }
function unwrapReturn(ret) {
  if (!ret) return { output: null, error: null };
  let r = ret.trim();
  const promise = r.match(/^Promise<(.+)>$/);
  if (promise) r = promise[1].trim();
  const result = r.match(/^(?:Result|Either)<\s*([^,]+?)\s*,\s*([^>]+?)\s*>$/);
  if (result) return { output: result[1].trim(), error: result[2].trim() };
  return { output: r, error: null };
}

// ── Inference: CodeFactsIR -> LiftedIntent ──────────────────────────────────
export function inferIntent(facts) {
  const primary = facts.functions.find((f) => f.parameters.length && f.returnType) || facts.functions[0];
  if (!primary) return null;

  const missionName = pascal(primary.name);
  const { output, error } = unwrapReturn(primary.returnType);

  const inputs = primary.parameters.map((p) => ({
    name: p.name,
    type: p.type && SEMANTIC_TYPES.has(p.type.replace(/<.*/, '')) ? p.type : (p.type || 'Unknown'),
    evidence: 'function parameter',
    sensitive: SENSITIVE.test(`${p.name} ${p.type || ''}`),
  }));

  const guarantees = facts.tests.map((t) => ({
    statement: words(t.name), evidence: `test ${t.name}`, confidence: 'high',
    sourceSpan: { file: t.file, line: t.line },
  }));

  // Prefer specific error-enum variants; fall back to the Result error type.
  const variantErrors = facts.errors.map((e) => e.name);
  const errorNames = [...new Set(variantErrors.length ? variantErrors : (error ? [error] : []))]
    .filter((n) => n && !/^(string|number|boolean|void|Error)$/i.test(n));
  const neverRules = errorNames.map((n) => ({
    statement: `cause ${words(n)}`, evidence: `${n} error`, confidence: 'medium',
  }));

  const hasSensitive = inputs.some((i) => i.sensitive);
  const unknown = ['why', 'owner', 'customer impact', 'PM notes', ...(hasSensitive ? [] : ['security never rules'])];
  const needsReview = ['goal wording', 'why', 'never rules', ...(hasSensitive ? ['security rules'] : []), 'verification evidence'];

  // Overall confidence: high if tests + typed signature; low if only a signature.
  const overall = guarantees.length && inputs.every((i) => i.type !== 'Unknown') ? 'high'
    : guarantees.length || inputs.some((i) => i.type !== 'Unknown') ? 'medium' : 'low';

  return {
    mission: missionName,
    from: LANG_DISPLAY[facts.sourceLanguage] || facts.sourceLanguage,
    confidence: overall,
    reviewed: false,
    mapsTo: [
      `function ${primary.file}:${primary.name}`,
      ...facts.tests.map((t) => `test ${t.file}:${t.name}`),
    ],
    evidence: [
      `function signature ${primary.name}`,
      ...facts.tests.slice(0, 5).map((t) => `test ${t.name}`),
      ...errorNames.slice(0, 5).map((n) => `error ${n}`),
    ],
    goal: `${words(primary.name)} (inferred from the ${primary.name} signature)`,
    inputs,
    output: output && !/^(void|undefined|null)$/i.test(output) ? { name: 'result', type: output, evidence: 'return type' } : null,
    guarantees,
    neverRules,
    unknown,
    needsReview,
    hasSensitive,
  };
}

// ── LiftedIntent -> humble, source-mapped .intent draft ─────────────────────
export function renderLiftedIntent(lift) {
  const L = [];
  L.push(`# Inferred by IntentLift from ${lift.from}. Draft, unverified, needs human review.`);
  L.push(`mission ${lift.mission}`, '');
  L.push('inferred', `  from ${lift.from}`, `  confidence ${lift.confidence}`, `  reviewed false`, `  generated_by SkillsTech Compiler ${COMPILER_VERSION}`, '');
  L.push('maps_to', ...lift.mapsTo.map((m) => `  ${m}`), '');
  if (lift.seeds && lift.seeds.length) {
    // OT intent-ir-v1 grounding. Comments (never verification), so the draft still parses.
    L.push('# Seeded by OT intent-ir-v1 nodes , grounding, not verification:');
    for (const s of lift.seeds) {
      const t = s.nodeType ? ` ${s.nodeType}` : '';
      const c = s.confidence ? ` confidence:${s.confidence}` : '';
      L.push(`#   ${s.nodeId}${t}${c}${s.title ? ` , ${s.title}` : ''}`);
      for (const loc of s.evidenceRef.sourceLocations) L.push(`#     at ${loc.file}${loc.line ? `:${loc.line}` : ''}`);
      for (const sig of s.evidenceRef.signals.slice(0, 5)) L.push(`#     signal: ${sig}`);
      if (s.evidenceRef.ledgerRef) L.push(`#     ledger: seq ${s.evidenceRef.ledgerRef.seq} ${s.evidenceRef.ledgerRef.hash}`);
    }
    L.push('');
  }
  L.push('evidence', ...lift.evidence.map((e) => `  ${e}`), '');
  L.push('goal', `  ${lift.goal}`, '');
  if (lift.inputs.length) {
    L.push('input');
    for (const i of lift.inputs) L.push(`  ${i.name}: ${i.type}`);
    L.push('');
  }
  if (lift.output) L.push('output', `  ${lift.output.name}: ${lift.output.type}`, '');
  if (lift.guarantees.length) {
    L.push('guarantees');
    for (const g of lift.guarantees) L.push(`  ${g.statement}`);
    L.push('');
  }
  if (lift.neverRules.length) {
    L.push('never');
    for (const n of lift.neverRules) L.push(`  ${n.statement}`);
    L.push('');
  }
  L.push('unknown', ...lift.unknown.map((u) => `  ${u}`), '');
  L.push('needs_review', ...lift.needsReview.map((r) => `  ${r}`), '');
  return L.join('\n') + '\n';
}

// ── Diagnostics specific to lifted drafts (all advisory) ────────────────────
function liftDiagnostics(lift, facts) {
  const d = [];
  const warn = (code, message) => d.push({ level: 'warning', code, message });
  warn('INTENT_LIFT_NEEDS_HUMAN_REVIEW', 'This intent was inferred from code. A human must review goal, why, never rules, and verification.');
  if (DYNAMIC_LANGUAGES.has(facts.sourceLanguage)) warn('INTENT_LIFT_DYNAMIC_LANGUAGE_LIMITATION', `${facts.sourceLanguage} is dynamically typed, so types and outputs are often Unknown and confidence is lower. Review carefully.`);
  if (lift.confidence === 'low') warn('INTENT_LIFT_LOW_CONFIDENCE', 'Low confidence: inferred mostly from names, with little test or type evidence.');
  if (!facts.tests.length) warn('INTENT_LIFT_NO_TEST_EVIDENCE', 'No tests found. Guarantees could not be grounded in verification evidence.');
  if (lift.inputs.some((i) => i.type === 'Unknown')) warn('INTENT_LIFT_UNKNOWN_SEMANTIC_TYPE', 'Some fields could not be resolved to a semantic type. Review and annotate them.');
  if (lift.hasSensitive) warn('INTENT_LIFT_SECURITY_REVIEW_NEEDED', 'Sensitive field names detected. Mark them Secret/Token/PII and add never-log rules.');
  return d;
}

/**
 * Lift a set of source files (a repo) into inferred ThunderLang drafts, one per
 * file that yields a mission. `files` is [{ file, source }] (the CLI reads the
 * filesystem; this core function stays pure). Returns per-mission drafts + a
 * repo-level summary matching the `thunder lift --from repo --json` contract.
 */
export function languageForFile(file) {
  if (/\.rs$/i.test(file)) return 'rust';
  if (/\.(pl|pm|t)$/i.test(file)) return 'perl';
  if (/\.pyi?$/i.test(file)) return 'python';
  if (/\.java$/i.test(file)) return 'java';
  if (/\.cs$/i.test(file)) return 'csharp';
  if (/\.go$/i.test(file)) return 'go';
  if (/\.(cpp|cc|cxx|hpp|hh|c|h)$/i.test(file)) return 'cpp';
  if (/\.php$/i.test(file)) return 'php';
  if (/\.rb$/i.test(file)) return 'ruby';
  if (/\.kts?$/i.test(file)) return 'kotlin';
  if (/\.(scala|sc)$/i.test(file)) return 'scala';
  if (/\.exs?$/i.test(file)) return 'elixir';
  if (/\.(mjs|cjs|jsx?)$/i.test(file)) return 'javascript';
  return 'typescript';
}

/**
 * Lift EVERY function in a source file into its own inferred mission (not just the primary).
 * This is the Intent Atlas view of a file , each operation becomes an intent you can read, so a
 * whole module's behavior is legible as intent. Deterministic, humble (each draft is unverified).
 */
// Is a function part of a project's PUBLIC surface? Cuts internal-helper noise from the Atlas.
//  - Go: exported names are Capitalized; `main`/`init` are not public API.
//  - Python/Ruby: top-level (or one-level) names that are not underscore-private, and not deep
//    nested closures (indent > 4).
//  - Otherwise keep everything but drop underscore-private names.
function isPublicFn(fn, language) {
  const name = fn.name || '';
  // Common private-helper naming conventions, across languages.
  if (/(?:Internal|Impl|_impl|_helper|_test|Helper)$/.test(name)) return false;
  if (language === 'go' || language === 'golang') return /^[A-Z]/.test(name) && name !== 'Test';
  if (language === 'python' || language === 'ruby' || language === 'elixir') return !name.startsWith('_') && (fn.indent == null || fn.indent <= 4);
  return !name.startsWith('_') && name !== 'init' && name !== 'constructor';
}

export function liftAll(source, { language = 'typescript', file = '', publicOnly = true } = {}) {
  const key = String(language).toLowerCase();
  const adapter = ADAPTERS[key];
  if (!adapter) return { ok: false, error: `Unsupported language "${language}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}.` };
  const resolvedFile = file || `input.${LANG_EXT[key] || 'txt'}`;
  const codeFacts = adapter(source, resolvedFile);
  let fns = codeFacts.functions;
  if (publicOnly) { const pub = fns.filter((f) => isPublicFn(f, key)); if (pub.length) fns = pub; }
  if (!fns.length) return { ok: false, error: 'No functions found to infer intent from.', codeFacts };
  const missions = [];
  const seen = new Map();
  for (const fn of fns) {
    const lifted = inferIntent({ ...codeFacts, functions: [fn] });
    if (!lifted) continue;
    const base = slug(lifted.mission);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    missions.push({ mission: lifted.mission, fn: fn.name, line: fn.line, confidence: lifted.confidence, intentText: renderLiftedIntent(lifted) });
  }
  return { ok: true, schemaVersion: IR_SCHEMA_VERSION, sourceLanguage: codeFacts.sourceLanguage, count: missions.length, missions };
}

export function liftRepo(files, { language } = {}) {
  const missions = [];
  const confidenceSummary = { high: 0, medium: 0, low: 0 };
  const detected = new Set();
  const usedNames = new Map();
  let unknowns = 0;

  for (const { file, source } of files) {
    const lang = language || languageForFile(file);
    const r = liftSource(source, { language: lang, file });
    if (!r.ok) continue;
    detected.add(lang);
    const conf = r.lifted.confidence;
    confidenceSummary[conf] = (confidenceSummary[conf] || 0) + 1;
    unknowns += r.lifted.unknown.length;
    const base = slug(r.lifted.mission);
    const n = (usedNames.get(base) || 0) + 1;
    usedNames.set(base, n);
    const outName = n === 1 ? `${base}.intent` : `${base}-${n}.intent`;
    missions.push({
      mission: r.lifted.mission, sourceFile: file, outName,
      intentText: r.intentText, summary: r.summary, diagnostics: r.diagnostics,
    });
  }

  return {
    ok: missions.length > 0,
    schemaVersion: IR_SCHEMA_VERSION,
    languagesDetected: [...detected].sort(),
    missionsGenerated: missions.length,
    confidenceSummary,
    unknowns,
    missions,
  };
}

// Default source file extension per language (for accurate source-map evidence in the draft).
const LANG_EXT = {
  typescript: 'ts', javascript: 'js', python: 'py', java: 'java', csharp: 'cs',
  go: 'go', rust: 'rs', cpp: 'cpp', php: 'php', ruby: 'rb', perl: 'pl',
  kotlin: 'kt', scala: 'scala', elixir: 'ex',
};

/**
 * Lift source into an inferred ThunderLang draft. Deterministic, no AI.
 * `seeds` (optional, OT's intent-ir-v1 nodes , see SEED_SCHEMA) make the draft reference OT's
 * EXACT node ids instead of lift's own function refs, so there is no divergent second reading.
 * Additive: with no seeds the output is byte-identical to before.
 */
export function liftSource(source, { language = 'typescript', file = '', seeds = undefined } = {}) {
  const key = String(language).toLowerCase();
  const adapter = ADAPTERS[key];
  if (!adapter) {
    return { ok: false, error: `Unsupported language "${language}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}.` };
  }
  const resolvedFile = file || `input.${LANG_EXT[key] || 'txt'}`;
  const codeFacts = adapter(source, resolvedFile);
  const lifted = inferIntent(codeFacts);
  if (!lifted) {
    return { ok: false, error: 'No functions found to infer intent from.', codeFacts };
  }
  const normSeeds = normalizeSeeds(seeds);
  if (normSeeds.length) {
    lifted.seeds = normSeeds;
    // Reference OT's exact node ids in maps_to (parseable), so downstream reads OT's ids, not a fork.
    lifted.mapsTo = [
      ...normSeeds.map((s) => `node ${s.nodeId}${s.nodeType ? ` (${s.nodeType})` : ''}`),
      ...lifted.mapsTo,
    ];
    // Fold OT's evidence signals into the draft's evidence (bounded, deterministic order).
    const seedSignals = normSeeds.flatMap((s) => s.evidenceRef.signals.map((sig) => `seed ${s.nodeId}: ${sig}`));
    lifted.evidence = [...lifted.evidence, ...seedSignals.slice(0, 8)];
  }
  const intentText = renderLiftedIntent(lifted);
  const diagnostics = liftDiagnostics(lifted, codeFacts);
  const summary = {
    schemaVersion: IR_SCHEMA_VERSION,
    sourceLanguage: codeFacts.sourceLanguage,
    mission: lifted.mission,
    confidence: lifted.confidence,
    reviewed: false,
    evidenceCount: lifted.evidence.length,
    unknowns: lifted.unknown,
    functions: codeFacts.functions.length,
    tests: codeFacts.tests.length,
    seeds: normSeeds.map((s) => s.nodeId),
  };
  return { ok: true, codeFacts, lifted, intentText, diagnostics, summary, seeds: normSeeds };
}
