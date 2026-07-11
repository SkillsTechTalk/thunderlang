// Hardening: deterministic fuzz + property tests. The compiler must be ROBUST , on any
// input (garbage, truncated, deeply nested, unicode, huge), the parser, expression engine,
// XML reader, runtime, and graph builder must degrade gracefully (diagnostics / ExprError),
// never crash with an unexpected throw. Failures are reproducible: every case is generated
// from a fixed seed, printed on failure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { evalExpr, compileExpr, ExprError } from '../src/expr.mjs';
import { evaluateDecision, simulateLifecycle } from '../src/runtime.mjs';
import { parseXml } from '../src/xml.mjs';
import { semanticDiagnostics } from '../src/emit.mjs';
import { NODE_TYPES, RELATIONSHIP_TYPES } from '../src/intent-schema.mjs';

// ── deterministic PRNG (mulberry32) , reproducible fuzzing ──
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const times = (r, max) => Math.floor(r() * max);

const NODE_SET = new Set(NODE_TYPES);
const REL_SET = new Set(RELATIONSHIP_TYPES);

// Assert a parsed AST has the shape the rest of the compiler relies on.
function assertAstShape(ast, ctx) {
  assert.ok(ast && typeof ast === 'object', `${ctx}: ast is not an object`);
  assert.ok('mission' in ast, `${ctx}: no mission field`);
  assert.ok(Array.isArray(ast.diagnostics), `${ctx}: diagnostics not an array`);
  for (const key of ['guarantees', 'neverRules', 'decisions', 'lifecycles', 'outcomeContracts', 'tests', 'components', 'capabilities', 'releases']) {
    assert.ok(Array.isArray(ast[key]), `${ctx}: ${key} not an array`);
  }
}

// Assert a built graph is well-formed: canonical types only, no dangling edges.
function assertGraphSound(g, ctx) {
  assert.ok(Array.isArray(g.nodes) && Array.isArray(g.relationships), `${ctx}: bad graph shape`);
  const ids = new Set(g.nodes.map((n) => n.id));
  for (const n of g.nodes) assert.ok(NODE_SET.has(n.type), `${ctx}: noncanonical node type ${n.type}`);
  for (const r of g.relationships) {
    assert.ok(REL_SET.has(r.type), `${ctx}: noncanonical rel type ${r.type}`);
    assert.ok(ids.has(r.from) || r.from.startsWith('phase.'), `${ctx}: dangling from ${r.from}`);
    assert.ok(ids.has(r.to) || r.to.startsWith('phase.'), `${ctx}: dangling to ${r.to}`);
  }
}

// ── generators ──
const KEYWORDS = ['mission', 'goal', 'why', 'requires', 'input', 'output', 'guarantees', 'never', 'metric', 'outcome', 'decision', 'rule', 'default', 'lifecycle', 'state', 'transition', 'from', 'to', 'terminal', 'command', 'on', 'compensate', 'capability', 'interface', 'release', 'result', 'learning', 'component', 'artifact', 'outcome_contract', 'test', 'case', 'scenario', 'given', 'expect', 'events', 'waiver', 'data', 'classification', 'when', 'return', 'target', 'baseline', 'window', 'evidence', 'experience', 'pattern', 'conflict', 'always', 'eventually', 'security requires'];
const FRAGS = ['', 'X', 'Foo', 'name value', '"quoted, text"', '18', '60%', 'a >= 18', 'a.b.c', '-', ':', '::', 'a: Type', 'age >= 18 and score < 3', '   ', '\t', 'ünïçödé', '<<>>', 'a,b,c', '{}', 'null'];
const INDENTS = ['', '  ', '    ', '      ', ' ', '\t', '        '];

function randLine(r) {
  return pick(r, INDENTS) + pick(r, KEYWORDS) + (r() < 0.7 ? ' ' + pick(r, FRAGS) : '');
}
function randSource(r) {
  const n = 1 + times(r, 40);
  const lines = [];
  for (let i = 0; i < n; i++) lines.push(r() < 0.08 ? pick(r, ['', '# comment', '   ', pick(r, FRAGS)]) : randLine(r));
  return lines.join(r() < 0.9 ? '\n' : '\r\n');
}

const EXPR_TOK = ['a', 'b', 'age', 'x.y', '18', '3.5', '"s"', 'true', 'false', '>=', '<=', '==', '!=', '>', '<', '=', '+', '-', '*', '/', '%', 'and', 'or', 'not', '&&', '||', '!', '(', ')', '[', ']', ',', 'in', ' '];
function randExpr(r) {
  const n = 1 + times(r, 14);
  let s = '';
  for (let i = 0; i < n; i++) s += pick(r, EXPR_TOK) + (r() < 0.5 ? ' ' : '');
  return s;
}

const XML_TOK = ['<a>', '</a>', '<b attr="v">', '<c/>', 'text', '<!-- x -->', '<?xml?>', '&lt;', '&amp;', '<', '>', '"', "'", '/>', '<d e=', '<![CDATA[x]]>', 'ü', '\n'];
function randXml(r) {
  const n = 1 + times(r, 30);
  let s = '';
  for (let i = 0; i < n; i++) s += pick(r, XML_TOK);
  return s;
}

// ── the fuzz tests ──

test('parseIntent never throws and always returns a well-formed AST (2000 cases)', () => {
  const r = rng(0xC0FFEE);
  for (let i = 0; i < 2000; i++) {
    const src = randSource(r);
    let ast;
    try { ast = parseIntent(src); }
    catch (e) { assert.fail(`parseIntent threw on case #${i}: ${e.stack}\n--- source ---\n${src}`); }
    assertAstShape(ast, `case #${i}`);
  }
});

test('buildIntentGraph never throws and stays sound on fuzzed ASTs (2000 cases)', () => {
  const r = rng(0x1337);
  for (let i = 0; i < 2000; i++) {
    const src = randSource(r);
    const ast = parseIntent(src);
    let g;
    try { g = buildIntentGraph(ast); }
    catch (e) { assert.fail(`buildIntentGraph threw on case #${i}: ${e.stack}\n--- source ---\n${src}`); }
    assertGraphSound(g, `case #${i}\n${src}`);
  }
});

test('semanticDiagnostics never throws on fuzzed ASTs (1000 cases)', () => {
  const r = rng(0xBEEF);
  for (let i = 0; i < 1000; i++) {
    const src = randSource(r);
    const ast = parseIntent(src);
    try { const d = semanticDiagnostics(ast); assert.ok(Array.isArray(d)); }
    catch (e) { assert.fail(`semanticDiagnostics threw on case #${i}: ${e.stack}\n${src}`); }
  }
});

test('the expression engine only ever returns a value or throws ExprError (3000 cases)', () => {
  const r = rng(0xE5219);
  for (let i = 0; i < 3000; i++) {
    const src = randExpr(r);
    try {
      evalExpr(src, { a: 1, b: 2, age: 20, x: { y: 3 } });
    } catch (e) {
      assert.ok(e instanceof ExprError, `case #${i} threw a non-ExprError (${e.constructor.name}: ${e.message}) on: ${JSON.stringify(src)}`);
    }
  }
});

test('parseXml never throws on angle-bracket soup (2000 cases)', () => {
  const r = rng(0x5AA5);
  for (let i = 0; i < 2000; i++) {
    const src = randXml(r);
    try { const doc = parseXml(src); assert.ok(doc && Array.isArray(doc.children)); }
    catch (e) { assert.fail(`parseXml threw on case #${i}: ${e.stack}\n${JSON.stringify(src)}`); }
  }
});

test('runtime never throws on fuzzed decisions/lifecycles + random inputs (1000 cases)', () => {
  const r = rng(0x9E3779B9);
  for (let i = 0; i < 1000; i++) {
    const ast = parseIntent(randSource(r));
    const inputs = { a: pick(r, [1, 'x', true, null, 20]), age: times(r, 100) };
    for (const dec of ast.decisions) {
      try { evaluateDecision(dec, inputs); }
      catch (e) { assert.fail(`evaluateDecision threw on case #${i}: ${e.stack}`); }
    }
    for (const lc of ast.lifecycles) {
      try { simulateLifecycle(lc, [pick(r, ['a', 'b', 'x']), pick(r, ['go', 'stop'])]); }
      catch (e) { assert.fail(`simulateLifecycle threw on case #${i}: ${e.stack}`); }
    }
  }
});

// ── determinism ──
test('parsing + building is deterministic under fuzz (500 cases)', () => {
  const r = rng(0xD37);
  for (let i = 0; i < 500; i++) {
    const src = randSource(r);
    assert.equal(JSON.stringify(parseIntent(src)), JSON.stringify(parseIntent(src)), `parse nondeterministic on #${i}`);
    assert.equal(JSON.stringify(buildIntentGraph(parseIntent(src))), JSON.stringify(buildIntentGraph(parseIntent(src))), `build nondeterministic on #${i}`);
  }
});

// ── mutation fuzz over the real example corpus ──
test('mutating real example missions never crashes the compiler', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'examples');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.intent')) : [];
  assert.ok(files.length > 0, 'expected example .intent files');
  const r = rng(0xEEEE);
  for (const f of files) {
    const base = fs.readFileSync(path.join(dir, f), 'utf8');
    for (let i = 0; i < 40; i++) {
      const lines = base.split('\n');
      const op = times(r, 5);
      if (op === 0) lines.splice(times(r, lines.length), 1); // delete a line
      else if (op === 1) lines.splice(times(r, lines.length), 0, randLine(r)); // insert
      else if (op === 2) lines.length = times(r, lines.length); // truncate
      else if (op === 3) { const j = times(r, lines.length); lines[j] = (lines[j] || '') + pick(r, FRAGS); } // corrupt a line
      else { const j = times(r, lines.length); lines[j] = pick(r, INDENTS) + (lines[j] || '').trim(); } // reindent
      const mutated = lines.join('\n');
      try {
        const ast = parseIntent(mutated);
        assertAstShape(ast, `${f} mutation #${i}`);
        assertGraphSound(buildIntentGraph(ast), `${f} mutation #${i}`);
        semanticDiagnostics(ast);
      } catch (e) {
        assert.fail(`compiler threw on mutated ${f} #${i}: ${e.stack}\n--- source ---\n${mutated}`);
      }
    }
  }
});

// ── pathological single-shot cases ──
test('pathological inputs are handled without throwing', () => {
  const cases = [
    '', ' ', '\n\n\n', '\t\t', '# only a comment', '\r\n\r\n',
    '﻿mission BOM', 'mission ' + 'x'.repeat(10000),
    'mission M\n' + '  '.repeat(500) + 'goal deep',
    'decision D\n' + 'rule r\n'.repeat(1000),
    'mission\nmission\nmission', ':\n::\n:::', '"""""', '((((((((((',
    'outcome_contract C\n  target\n  baseline\n', 'data\n  classification\n',
    'lifecycle L\n  transition t\n    from\n    to\n',
  ];
  for (const src of cases) {
    let ast;
    try { ast = parseIntent(src); assertGraphSound(buildIntentGraph(ast), JSON.stringify(src).slice(0, 60)); semanticDiagnostics(ast); }
    catch (e) { assert.fail(`threw on pathological input ${JSON.stringify(src).slice(0, 60)}: ${e.stack}`); }
  }
  // expression pathologies
  for (const ex of ['', '   ', '(((', ')))', 'a >=', 'in [', '1 2 3', '.', '&&&&', 'not not not', 'a.'.repeat(200)]) {
    try { evalExpr(ex, {}); } catch (e) { assert.ok(e instanceof ExprError, `non-ExprError on ${JSON.stringify(ex)}: ${e.message}`); }
  }
});
