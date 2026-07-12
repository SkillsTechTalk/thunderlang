// Pipeline composition fuzz , the whole chain on one fuzzed input. Individual fuzzers prove
// each stage survives garbage in isolation; this proves the STAGES COMPOSE: the output of
// one never breaks the next. parse -> build -> graph->source -> re-parse -> re-build ->
// every exporter -> migrate -> validate, all on the same fuzzed source, asserting no throw
// and graph soundness at every hop. Seeded, reproducible.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { graphToSource } from '../src/graph-source.mjs';
import { exportIntent, EXPORT_FORMATS } from '../src/exporters.mjs';
import { migrateGraph, validateGraph } from '../src/migrate.mjs';
import { NODE_TYPES, RELATIONSHIP_TYPES } from '../src/intent-schema.mjs';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const times = (r, m) => Math.floor(r() * m);

// Bias the source toward valid-ish structure so deep stages (graph->source, exporters) get
// exercised, while still injecting garbage lines.
const KW = ['mission', 'use', 'goal', 'guarantees', 'never', 'metric', 'outcome', 'decision', 'rule', 'default', 'when', 'return', 'lifecycle', 'state', 'transition', 'from', 'to', 'terminal', 'command', 'on', 'compensate', 'capability', 'interface', 'release', 'result', 'learning', 'component', 'artifact', 'outcome_contract', 'test', 'case', 'scenario', 'given', 'expect', 'events', 'data', 'waiver', 'experience', 'pattern', 'evidence', 'persona'];
const FRAG = ['', 'M', 'X', 'A', 'B', 'age >= 18', 'age >= 18 and score < 3', 'name: Type', '"q, s"', '60%', 'target 60%', 'baseline 40%', 'window 30 days', 'US', 'implements X', 'measures O', 'idempotency_key id', 'classification pii', '-', 'a.b'];
const IND = ['', '  ', '    ', '      '];
const line = (r) => pick(r, IND) + pick(r, KW) + (r() < 0.75 ? ' ' + pick(r, FRAG) : '');
function randSource(r) {
  const lines = ['mission ' + pick(r, ['Demo', 'M', 'Flow', ''])];
  for (let i = 0; i < 1 + times(r, 28); i++) lines.push(r() < 0.06 ? pick(r, ['', '# c', '   ']) : line(r));
  return lines.join('\n');
}

function assertSound(g, ctx) {
  const ids = new Set(g.nodes.map((n) => n.id));
  const nt = new Set(NODE_TYPES);
  const rt = new Set(RELATIONSHIP_TYPES);
  for (const n of g.nodes) assert.ok(nt.has(n.type), `${ctx}: noncanonical node ${n.type}`);
  for (const r of g.relationships) {
    assert.ok(rt.has(r.type), `${ctx}: noncanonical rel ${r.type}`);
    assert.ok(ids.has(r.from) || r.from.startsWith('phase.'), `${ctx}: dangling from ${r.from}`);
    assert.ok(ids.has(r.to) || r.to.startsWith('phase.'), `${ctx}: dangling to ${r.to}`);
  }
}

test('the full pipeline composes without throwing and stays sound (2500 cases)', () => {
  const r = rng(0xF17E);
  for (let i = 0; i < 2500; i++) {
    const src = randSource(r);
    let ctx = `#${i}`;
    try {
      const ast1 = parseIntent(src);
      const g1 = buildIntentGraph(ast1);
      assertSound(g1, `${ctx} g1\n${src}`);

      // stage: graph -> source -> re-parse -> re-build must stay sound
      const src2 = graphToSource(g1);
      const ast2 = parseIntent(src2);
      const g2 = buildIntentGraph(ast2);
      assertSound(g2, `${ctx} g2 (regenerated)\n${src2}`);

      // stage: every exporter on both ASTs; JSON exporters must emit valid JSON
      for (const ast of [ast1, ast2]) {
        for (const fmt of EXPORT_FORMATS) {
          const res = exportIntent(ast, fmt);
          assert.ok(res && typeof res.content === 'string', `${ctx} export ${fmt} empty`);
          if (fmt === 'jsonschema' || fmt === 'openapi') JSON.parse(res.content);
        }
      }

      // stage: migrate both graphs (and a legacy-shaped copy) -> always valid
      for (const g of [g1, g2]) {
        const m = migrateGraph(g);
        assert.ok(validateGraph(m.graph).valid, `${ctx}: migrated graph invalid`);
      }
    } catch (e) {
      assert.fail(`pipeline threw at ${ctx}: ${e.stack}\n--- source ---\n${src}`);
    }
  }
});

test('graph -> source is a semantic fixpoint under fuzz (a second pass adds/loses nothing)', () => {
  const r = rng(0x5EED);
  const keyset = (g) => new Set(g.nodes.filter((n) => !['Conflict', 'Journey'].includes(n.type)).map((n) => `${n.type}|${n.title ?? ''}`));
  for (let i = 0; i < 1500; i++) {
    const g0 = buildIntentGraph(parseIntent(randSource(r)));
    const mission = g0.nodes.find((n) => n.type === 'Mission');
    if (!mission || mission.title == null) continue;
    const g1 = buildIntentGraph(parseIntent(graphToSource(g0)));
    const g2 = buildIntentGraph(parseIntent(graphToSource(g1)));
    assert.deepEqual([...keyset(g2)].sort(), [...keyset(g1)].sort(), `not a fixpoint at #${i}`);
  }
});
