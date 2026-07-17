// Hardening for the structural patcher: applyEdits manipulates raw source lines across many
// ops (fields, metrics, outcomes, decision rules). It must NEVER throw and must NEVER produce
// broken source , whatever the edit list, whatever the (even garbage) input. Seeded + reproducible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyEdits } from '../src/patch.mjs';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { isFormatted } from '../src/format.mjs';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const times = (r, m) => Math.floor(r() * m);

const EXAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'examples');
const CORPUS = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.intent'))
  .map((f) => readFileSync(join(EXAMPLES_DIR, f), 'utf8'));

const OPS = ['setField', 'addGuarantee', 'removeGuarantee', 'addNever', 'removeNever', 'addField', 'removeField', 'setFieldType', 'addMetric', 'removeMetric', 'setMetricField', 'addOutcome', 'removeOutcome', 'addRule', 'removeRule', 'setRule', 'setDefault', 'bogusOp'];
const FIELDS = ['goal', 'why', 'problem', 'mission', 'nope'];
const MFIELDS = ['baseline', 'target', 'window', 'bad'];
const SECTIONS = ['input', 'output', 'payload', ''];
const NAMES = ['x', 'conversion_rate', 'orderId', 'CanUpgrade', 'AnswerAction', 'Foo', '', 'a b', 'total'];
const VALS = ['v', '', 'a b c', '50%', 'int', 'Email', 'a > 1', 'Y'];

function randEdit(r) {
  return {
    op: pick(r, OPS),
    field: pick(r, [...FIELDS, ...MFIELDS]),
    value: pick(r, VALS),
    statement: pick(r, VALS),
    match: pick(r, NAMES),
    section: pick(r, SECTIONS),
    name: pick(r, NAMES),
    type: pick(r, VALS),
    baseline: pick(r, VALS), target: pick(r, VALS), window: pick(r, VALS),
    description: pick(r, VALS),
    decision: pick(r, NAMES),
    when: pick(r, VALS), return: pick(r, VALS),
  };
}

test('applyEdits never throws and always yields re-parseable source (corpus x fuzzed edits)', () => {
  const r = rng(0xA11CE); // deterministic seed
  let checked = 0;
  for (const base of CORPUS) {
    for (let iter = 0; iter < 40; iter++) {
      const edits = Array.from({ length: 1 + times(r, 6) }, () => randEdit(r));
      let out;
      try { out = applyEdits(base, edits); } catch (e) { assert.fail(`applyEdits threw: ${e.stack}\nedits=${JSON.stringify(edits)}`); }
      assert.equal(typeof out.source, 'string');
      assert.equal(out.applied.length + out.skipped.length, edits.length, 'every edit is either applied or skipped');
      // the result must still be valid ThunderLang, no matter what applied
      let ast;
      try { ast = parseIntent(out.source); } catch (e) { assert.fail(`patched source failed to parse: ${e.message}\nedits=${JSON.stringify(edits)}\n---\n${out.source}`); }
      try { buildIntentGraph(ast); } catch (e) { assert.fail(`patched source failed to build a graph: ${e.message}`); }
      // applying nothing new: re-applying the same edits must also not throw (idempotent-safe)
      try { applyEdits(out.source, edits); } catch (e) { assert.fail(`re-apply threw: ${e.stack}`); }
      checked += 1;
    }
  }
  assert.ok(checked >= CORPUS.length * 40);
});

test('an empty edit list is a no-op; the source is byte-identical', () => {
  for (const base of CORPUS.slice(0, 5)) {
    const out = applyEdits(base, []);
    assert.equal(out.source, base.split('\n').join('\n'));
    assert.equal(out.applied.length, 0);
  }
});

test('a successful applied edit keeps the source canonically formatted', () => {
  // over the corpus, any run whose result differs and re-parses should be fmt-clean
  const r = rng(0xBEEF);
  for (const base of CORPUS) {
    const edits = [{ op: 'addGuarantee', statement: `invariant ${times(r, 999)} holds`, verify: 'a test' }];
    const out = applyEdits(base, edits);
    if (out.applied.length) assert.equal(isFormatted(out.source), true, `not formatted after addGuarantee:\n${out.source.slice(0, 400)}`);
  }
});
