import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatSource, isFormatted } from '../src/format.mjs';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';

const graphKey = (g) => JSON.stringify(g.nodes.map((n) => `${n.type}|${n.title ?? ''}`).sort()) + JSON.stringify(g.relationships.map((r) => r.type).sort());

test('formatSource normalizes indentation, trailing space, and blank runs', () => {
  // guarantees/never are top-level; their items are (messily) indented.
  const out = formatSource('mission M\n\n\nguarantees\n\t\titem   \nnever\n      leak\n\n\n');
  assert.equal(out, 'mission M\n\nguarantees\n  item\nnever\n  leak\n');
  assert.ok(out.endsWith('\n') && !out.endsWith('\n\n'));
});

test('formatSource is idempotent', () => {
  const messy = 'mission M\noutcome O\n  "a\n   b"\ndecision D\n  rule r\n    when a\n    return X\n';
  assert.equal(formatSource(formatSource(messy)), formatSource(messy));
});

test('multi-line string interiors are preserved byte-for-byte', () => {
  const src = 'mission M\noutcome O\n  "first line\n     indented second line\n  third"\n';
  const out = formatSource(src);
  assert.match(out, /first line\n {5}indented second line\n {2}third"/); // interior untouched
});

test('formatting preserves the graph (semantic no-op) across the corpus', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'examples');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.thunder'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const formatted = formatSource(src);
    assert.equal(graphKey(buildIntentGraph(parseIntent(formatted))), graphKey(buildIntentGraph(parseIntent(src))), `${f} graph changed`);
    assert.ok(isFormatted(formatted), `${f} not idempotent`);
  }
});

test('the example corpus is already canonically formatted', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'examples');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.thunder'))) {
    assert.ok(isFormatted(fs.readFileSync(path.join(dir, f), 'utf8')), `${f} is not formatted , run: intent fmt examples --write`);
  }
});
