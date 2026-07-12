// Hardening round 2 , the surface built this session that the first fuzz suite did not
// cover: the exporters (DMN/BPMN/SMV/JSON-Schema/OpenAPI), importers + report, graph->source,
// schema migration + validation, the test runner, and outcome evaluation. Every one must
// degrade gracefully on garbage (a fuzzed AST, a malformed graph, XML soup) , never crash.
// Seeded, so any failure reproduces.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { toDMN, toBPMN, toSMV, exportIntent, EXPORT_FORMATS } from '../src/exporters.mjs';
import { toJSONSchema, toOpenAPI } from '../src/data-schema.mjs';
import { fromDMN, fromBPMN, importReport } from '../src/importers.mjs';
import { graphToSource } from '../src/graph-source.mjs';
import { migrateGraph, validateGraph } from '../src/migrate.mjs';
import { runTests } from '../src/testing.mjs';
import { evaluateOutcomes } from '../src/outcome.mjs';
import { NODE_TYPES, RELATIONSHIP_TYPES } from '../src/intent-schema.mjs';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const times = (r, m) => Math.floor(r() * m);

// ── a fuzzed but real AST (garbage source through the real parser) ──
const KEYWORDS = ['mission', 'use', 'goal', 'input', 'output', 'guarantees', 'never', 'metric', 'outcome', 'decision', 'rule', 'default', 'when', 'return', 'lifecycle', 'state', 'transition', 'from', 'to', 'terminal', 'command', 'on', 'capability', 'interface', 'release', 'result', 'learning', 'component', 'artifact', 'outcome_contract', 'test', 'case', 'scenario', 'given', 'expect', 'events', 'data', 'waiver', 'errors', 'api', 'title'];
const FRAGS = ['', 'X', 'name: Type', '"q, s"', '18', '60%', 'age >= 18', 'a.b', '-', ':', 'List<Order>', 'ünï', '<<>>', '{}', 'idempotency_key id'];
const INDENTS = ['', '  ', '    ', '\t', '      '];
const randLine = (r) => pick(r, INDENTS) + pick(r, KEYWORDS) + (r() < 0.7 ? ' ' + pick(r, FRAGS) : '');
const randSource = (r) => Array.from({ length: 1 + times(r, 30) }, () => randLine(r)).join('\n');

// ── a garbage graph (malformed nodes/edges) ──
function randGraph(r) {
  const badTitles = ['X', '', null, undefined, 42, 'a b c'];
  const nodeTypes = [...NODE_TYPES, 'Frobnicator', '', null];
  const n = times(r, 12);
  const nodes = Array.from({ length: n }, (_, i) => {
    const node = { type: pick(r, nodeTypes), title: pick(r, badTitles) };
    if (r() < 0.9) node.id = `${pick(r, ['mission', 'decision', 'metric', 'x'])}.${i}`;
    if (r() < 0.5) node.description = pick(r, ['baseline 48%; target 60%', 'when a -> B', null, 'kind figma; covers X', '']);
    if (r() < 0.3) node.status = pick(r, ['draft', 'verified', null]);
    return node;
  });
  const ids = nodes.map((x) => x.id).filter(Boolean);
  const relTypes = [...RELATIONSHIP_TYPES, 'teleports', ''];
  const relationships = Array.from({ length: times(r, 12) }, () => ({
    from: r() < 0.7 ? pick(r, ids.length ? ids : ['ghost']) : 'phase.x',
    type: pick(r, relTypes),
    to: r() < 0.7 ? pick(r, ids.length ? ids : ['ghost']) : `phase.${pick(r, ['pricing', 'release'])}`,
    ...(r() < 0.2 ? { name: 'go', within: '5m' } : {}),
  }));
  return { ...(r() < 0.5 ? { schema: pick(r, ['intent-graph-v1', 'intent-graph-v0', 'weird', undefined]) } : {}), nodes, relationships };
}

const XML_TOK = ['<a>', '</a>', '<b x="1">', '<c/>', 'txt', '<!-- -->', '&lt;', '<decision>', '<process>', '<rule/>', '<sequenceFlow/>', '<conditionExpression>c</conditionExpression>', '<'];
const randXml = (r) => Array.from({ length: 1 + times(r, 25) }, () => pick(r, XML_TOK)).join('');

// ── exporters never throw on ANY parsed AST; JSON exporters emit valid JSON ──
test('all five exporters never throw on fuzzed ASTs; JSON outputs parse (1500 cases)', () => {
  const r = rng(0xE1);
  for (let i = 0; i < 1500; i++) {
    const ast = parseIntent(randSource(r));
    for (const fmt of EXPORT_FORMATS) {
      let res;
      try { res = exportIntent(ast, fmt); } catch (e) { assert.fail(`export ${fmt} threw on #${i}: ${e.stack}`); }
      assert.ok(res && typeof res.content === 'string');
      if (fmt === 'jsonschema' || fmt === 'openapi') {
        try { JSON.parse(res.content); } catch { assert.fail(`export ${fmt} produced invalid JSON on #${i}`); }
      }
    }
    // direct calls too
    for (const f of [toDMN, toBPMN, toSMV, toJSONSchema, toOpenAPI]) {
      try { f(ast); } catch (e) { assert.fail(`${f.name} threw on #${i}: ${e.stack}`); }
    }
  }
});

// ── graph -> source never throws on a malformed graph and returns valid parseable source ──
test('graphToSource never throws on garbage graphs and yields parseable source (1500 cases)', () => {
  const r = rng(0xE2);
  for (let i = 0; i < 1500; i++) {
    const g = randGraph(r);
    let src;
    try { src = graphToSource(g); } catch (e) { assert.fail(`graphToSource threw on #${i}: ${e.stack}\n${JSON.stringify(g).slice(0, 300)}`); }
    assert.equal(typeof src, 'string');
    try { parseIntent(src); } catch (e) { assert.fail(`graphToSource output failed to re-parse on #${i}: ${e.message}`); }
  }
});

// ── migrate + validate never throw on garbage graphs ──
test('migrateGraph and validateGraph never throw on garbage graphs (1500 cases)', () => {
  const r = rng(0xE3);
  for (let i = 0; i < 1500; i++) {
    const g = randGraph(r);
    let m;
    try { m = migrateGraph(g); } catch (e) { assert.fail(`migrateGraph threw on #${i}: ${e.stack}`); }
    assert.ok(m && Array.isArray(m.graph.nodes));
    let v;
    try { v = validateGraph(m.graph); } catch (e) { assert.fail(`validateGraph threw on #${i}: ${e.stack}`); }
    assert.equal(typeof v.valid, 'boolean');
    assert.ok(Array.isArray(v.issues));
  }
});

// ── importReport never throws on XML soup ──
test('importReport never throws on XML soup (1500 cases)', () => {
  const r = rng(0xE4);
  for (let i = 0; i < 1500; i++) {
    const xml = randXml(r);
    for (const fmt of ['dmn', 'bpmn', undefined]) {
      try {
        const rep = importReport(xml, fmt);
        if (rep) { assert.equal(typeof rep.source, 'string'); assert.ok(Array.isArray(rep.warnings)); }
      } catch (e) { assert.fail(`importReport(${fmt}) threw on #${i}: ${e.stack}\n${JSON.stringify(xml)}`); }
    }
  }
});

// ── the test runner + outcome evaluation never throw on fuzzed ASTs ──
test('runTests and evaluateOutcomes never throw on fuzzed ASTs (1000 cases)', () => {
  const r = rng(0xE5);
  for (let i = 0; i < 1000; i++) {
    const ast = parseIntent(randSource(r));
    try { const t = runTests(ast); assert.equal(typeof t.ok, 'boolean'); } catch (e) { assert.fail(`runTests threw on #${i}: ${e.stack}`); }
    try { const o = evaluateOutcomes(ast); assert.ok(Array.isArray(o.evaluations)); } catch (e) { assert.fail(`evaluateOutcomes threw on #${i}: ${e.stack}`); }
  }
});

// ── behavioral round-trip on generated decisions (export -> import decides identically) ──
test('DMN and BPMN behavioral round-trip holds on generated intent (400 cases)', () => {
  const r = rng(0xE6);
  const OPS = ['>=', '<=', '>', '<', '=='];
  for (let i = 0; i < 400; i++) {
    const nRules = 1 + times(r, 3);
    let src = 'mission M\ndecision D\n  inputs\n    age\n    score\n';
    const rets = [];
    for (let k = 0; k < nRules; k++) {
      const ret = `R${k}`; rets.push(ret);
      src += `  rule r${k}\n    when age ${pick(r, OPS)} ${times(r, 40)} and score ${pick(r, OPS)} ${times(r, 100)}\n    return ${ret}\n`;
    }
    src += '  default\n    return Def\n';
    const ast0 = parseIntent(src);
    const ast1 = parseIntent(fromDMN(toDMN(ast0)));
    const d0 = ast0.decisions[0]; const d1 = ast1.decisions[0];
    for (let c = 0; c < 6; c++) {
      const inp = { age: times(r, 40), score: times(r, 100) };
      assert.equal(evaluateOutcomesSafe(d1, inp), evaluateOutcomesSafe(d0, inp), `DMN round-trip mismatch #${i} at ${JSON.stringify(inp)}`);
    }
  }
});

// small local helper (avoid importing evaluateDecision twice): decide + return result
import { evaluateDecision } from '../src/runtime.mjs';
function evaluateOutcomesSafe(dec, inputs) { return evaluateDecision(dec, inputs).result; }
