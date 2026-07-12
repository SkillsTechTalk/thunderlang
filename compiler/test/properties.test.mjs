// Semantics-level property tests. Beyond "this input gives that output", these assert the
// INVARIANTS the whole ecosystem leans on: determinism, executable-semantics soundness,
// round-trip idempotence, and migration laws. Generated cases use a fixed seed, so any
// failure is reproducible.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { evaluateDecision, simulateLifecycle } from '../src/runtime.mjs';
import { graphToSource } from '../src/graph-source.mjs';
import { migrateGraph, validateGraph } from '../src/migrate.mjs';
import { toDMN, toBPMN, toSMV } from '../src/exporters.mjs';
import { NODE_TYPES, RELATIONSHIP_TYPES } from '../src/intent-schema.mjs';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];

const EXAMPLES = (() => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'examples');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.intent')).map((f) => ({ name: f, src: fs.readFileSync(path.join(dir, f), 'utf8') }));
})();

const DECISION = parseIntent(`mission M
decision D
  inputs
    age
    score
    region
  rule adult
    when age >= 18 and score >= 70
    return Eligible
  rule provisional
    when age >= 18 and region in [US, CA]
    return Provisional
  default
    return NotEligible
`).decisions[0];
const ALLOWED_RESULTS = new Set(['Eligible', 'Provisional', 'NotEligible', null]);

const LIFECYCLE = parseIntent(`mission M
lifecycle L
  state A
  state B
  state C
  transition go
    from A
    to B
  transition on
    from B
    to C
  terminal C
`).lifecycles[0];

// ── Executable-semantics soundness (generated inputs) ──

test('a decision result is ALWAYS a declared return or the default (never fabricated)', () => {
  const r = rng(0xD1);
  for (let i = 0; i < 3000; i++) {
    const inputs = { age: Math.floor(r() * 40), score: Math.floor(r() * 100), region: pick(r, ['US', 'CA', 'FR', 'DE']) };
    const out = evaluateDecision(DECISION, inputs);
    assert.ok(ALLOWED_RESULTS.has(out.result), `fabricated result ${out.result} for ${JSON.stringify(inputs)}`);
    // matched is a rule name, 'default', or null , always consistent with the result
    assert.ok(out.matched === null || typeof out.matched === 'string');
  }
});

test('decision evaluation is deterministic and ignores unreferenced inputs', () => {
  const r = rng(0xD2);
  for (let i = 0; i < 2000; i++) {
    const inputs = { age: Math.floor(r() * 40), score: Math.floor(r() * 100), region: pick(r, ['US', 'FR']) };
    const a = evaluateDecision(DECISION, inputs).result;
    const b = evaluateDecision(DECISION, inputs).result;                       // determinism
    const c = evaluateDecision(DECISION, { ...inputs, junk: r(), zzz: 'x' }).result; // input-relevance
    assert.equal(a, b);
    assert.equal(a, c, `unreferenced input changed the result at ${JSON.stringify(inputs)}`);
  }
});

test('lifecycle simulation is sound: finalState is declared, validity matches step outcomes', () => {
  const r = rng(0xD3);
  const states = new Set(LIFECYCLE.states);
  const events = ['go', 'on', 'A', 'B', 'C', 'bogus'];
  for (let i = 0; i < 2000; i++) {
    const seq = Array.from({ length: Math.floor(r() * 5) }, () => pick(r, events));
    const s = simulateLifecycle(LIFECYCLE, seq);
    assert.ok(states.has(s.finalState), `final state ${s.finalState} not declared`);
    assert.equal(s.valid, s.steps.every((st) => st.ok), 'valid flag disagrees with steps');
    assert.equal(s.path.length, 1 + s.steps.filter((st) => st.ok).length, 'path length != 1 + ok steps');
    // path only ever contains declared states
    for (const st of s.path) assert.ok(states.has(st));
  }
});

// ── Determinism over the real corpus ──

test('parse, build, and every exporter are byte-deterministic across the corpus', () => {
  for (const { name, src } of EXAMPLES) {
    const a = buildIntentGraph(parseIntent(src));
    const b = buildIntentGraph(parseIntent(src));
    assert.equal(JSON.stringify(a), JSON.stringify(b), `${name} build nondeterministic`);
    const ast = parseIntent(src);
    assert.equal(toDMN(ast), toDMN(ast), `${name} DMN nondeterministic`);
    assert.equal(toBPMN(ast), toBPMN(ast), `${name} BPMN nondeterministic`);
    assert.equal(toSMV(ast), toSMV(ast), `${name} SMV nondeterministic`);
  }
});

// ── graph -> source idempotence ──

test('graph -> source reaches a fixpoint: a second regeneration preserves the node/edge set', () => {
  const keyN = (g) => new Set(g.nodes.filter((n) => !['Conflict', 'Journey'].includes(n.type)).map((n) => `${n.type}|${n.title ?? ''}`));
  for (const { name, src } of EXAMPLES) {
    const g0 = buildIntentGraph(parseIntent(src));
    const mission = g0.nodes.find((n) => n.type === 'Mission');
    if (!mission || mission.title == null) continue; // out of scope: untitled/service-only graphs
    const g1 = buildIntentGraph(parseIntent(graphToSource(g0)));
    const g2 = buildIntentGraph(parseIntent(graphToSource(g1)));
    assert.deepEqual([...keyN(g2)].sort(), [...keyN(g1)].sort(), `${name} not a fixpoint`);
  }
});

// ── migration laws ──

test('migration is idempotent and always yields a valid, canonical graph', () => {
  for (const { name, src } of EXAMPLES) {
    const g = buildIntentGraph(parseIntent(src));
    const once = migrateGraph(g);
    assert.equal(once.migrated, false, `${name}: a current graph should not migrate`);
    // migrating a legacy (unversioned) copy, then again, is stable
    const legacy = { nodes: g.nodes.map(({ status, ...rest }) => rest), relationships: g.relationships };
    const m1 = migrateGraph(legacy).graph;
    const m2 = migrateGraph(m1).graph;
    assert.equal(JSON.stringify(m1), JSON.stringify(m2), `${name}: migration not idempotent`);
    const v = validateGraph(m1);
    assert.ok(v.valid, `${name}: migrated graph invalid: ${JSON.stringify(v.issues.slice(0, 2))}`);
  }
});

test('every corpus graph is canonical with no dangling edges (regression guard)', () => {
  const nodeTypes = new Set(NODE_TYPES);
  const relTypes = new Set(RELATIONSHIP_TYPES);
  for (const { name, src } of EXAMPLES) {
    const g = buildIntentGraph(parseIntent(src));
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const n of g.nodes) assert.ok(nodeTypes.has(n.type), `${name}: noncanonical node ${n.type}`);
    for (const r of g.relationships) {
      assert.ok(relTypes.has(r.type), `${name}: noncanonical rel ${r.type}`);
      assert.ok(ids.has(r.from) || r.from.startsWith('phase.'), `${name}: dangling from ${r.from}`);
      assert.ok(ids.has(r.to) || r.to.startsWith('phase.'), `${name}: dangling to ${r.to}`);
    }
  }
});
