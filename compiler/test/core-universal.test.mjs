import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { sha256hex } from '../src/hash.mjs';
import * as core from '../src/core.mjs';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');

// Walk the transitive import graph starting from an entry module, collecting every local file.
function reachableFiles(entry) {
  const seen = new Set();
  const stack = [resolve(SRC, entry)];
  const importRe = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/g;
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    let m;
    while ((m = importRe.exec(text))) {
      const spec = m[1];
      if (spec.startsWith('.')) stack.push(resolve(dirname(file), spec));
    }
  }
  return [...seen];
}

test('the /core entry and its whole transitive graph are Node-free (bundles for browser + React Native)', () => {
  const files = reachableFiles('core.mjs');
  assert.ok(files.length > 10, `expected a real graph, got ${files.length} files`);
  const offenders = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    if (/from\s*['"]node:/.test(text) || /require\(\s*['"]node:/.test(text)) offenders.push(f.replace(SRC + '/', ''));
  }
  assert.deepEqual(offenders, [], `these modules reachable from /core import a node: builtin: ${offenders.join(', ')}`);
});

test('the pure SHA-256 is byte-identical to node:crypto (locks the shared join-key hash)', () => {
  for (const s of ['', 'a', 'abc', 'mission X\n  goal do', 'café ☕ 日本語', 'x'.repeat(64), 'x'.repeat(120)]) {
    assert.equal(sha256hex(s), createHash('sha256').update(s).digest('hex'));
  }
  // a fixed known-answer test so the hash can never silently drift
  assert.equal(sha256hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('/core exposes the full shared compiler surface every consumer needs', () => {
  for (const fn of ['parseIntent', 'buildIntentGraph', 'buildAtlas', 'searchAtlas', 'expandNode',
    'buildFocusGraph', 'intentBrief', 'makeScope', 'scanProject', 'scanIntent', 'diffGraphs',
    'compileSource', 'graphToSource', 'semanticDiagnostics', 'coverageView', 'sha256']) {
    assert.equal(typeof core[fn], 'function', `/core is missing ${fn}`);
  }
});

test('/core parse -> graph -> atlas -> focus works end to end with no Node APIs', () => {
  const src = 'mission M\ngoal\n  do it\nguarantee it holds\n  verify t\n';
  const graph = core.buildIntentGraph(core.parseIntent(src));
  const atlas = core.buildAtlas([graph]);
  const focus = core.buildFocusGraph(atlas, { seeds: [atlas.missions[0].id], depth: 2 });
  const brief = core.intentBrief(focus);
  assert.equal(brief.what, 'M');
  assert.ok(focus.nodes.length >= 2);
});
