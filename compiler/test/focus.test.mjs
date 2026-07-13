import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { buildAtlas } from '../src/intent-atlas.mjs';
import { makeScope, buildFocusGraph, intentBrief, FOCUS_SCHEMA } from '../src/focus.mjs';
import * as barrel from '../src/index.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');

const SRC = `mission SuspendAccount
goal
  Suspend an account immediately
guarantee active sessions are revoked
  verify sessions fail immediately test
never allow access after suspension
  verify suspended user cannot authenticate test
`;

function atlasOf(src) {
  return buildAtlas([buildIntentGraph(parseIntent(src))]);
}

test('makeScope builds a typed, deterministic scope and rejects unknown types', () => {
  const s1 = makeScope({ type: 'branch', seeds: ['a', 'b'] });
  const s2 = makeScope({ type: 'branch', seeds: ['a', 'b'] });
  assert.equal(s1.schema, FOCUS_SCHEMA);
  assert.equal(s1.scopeId, s2.scopeId, 'same inputs -> same scopeId');
  assert.equal(s1.provenance, 'compiler-derived');
  assert.throws(() => makeScope({ type: 'nope' }), /unknown scope type/);
});

test('buildFocusGraph seeds are selected; guarantees are governing; verifications tagged', () => {
  const atlas = atlasOf(SRC);
  const missionId = atlas.missions[0].id;
  const focus = buildFocusGraph(atlas, { seeds: [missionId], depth: 2 });
  assert.equal(focus.schema, FOCUS_SCHEMA);
  const seed = focus.nodes.find((n) => n.id === missionId);
  assert.equal(seed.focusReason, 'selected');
  assert.ok(focus.nodes.some((n) => n.type === 'Guarantee' && n.focusReason === 'governing'));
  assert.ok(focus.nodes.some((n) => n.focusReason === 'verification'));
  // every edge is within the included node set
  const ids = new Set(focus.nodes.map((n) => n.id));
  assert.ok(focus.relationships.every((r) => ids.has(r.from) && ids.has(r.to)));
});

test('depth bounds the graph; freshness is stable for the same atlas', () => {
  const atlas = atlasOf(SRC);
  const seed = atlas.missions[0].id;
  const d0 = buildFocusGraph(atlas, { seeds: [seed], depth: 0 });
  assert.equal(d0.nodes.length, 1, 'depth 0 is just the seed');
  const a = buildFocusGraph(atlas, { seeds: [seed], depth: 2 });
  const b = buildFocusGraph(atlas, { seeds: [seed], depth: 2 });
  assert.equal(a.freshness, b.freshness);
  assert.ok(a.nodes.length > 1);
});

test('intentBrief derives what/guarantees/prohibitions from the focused mission', () => {
  const atlas = atlasOf(SRC);
  const focus = buildFocusGraph(atlas, { seeds: [atlas.missions[0].id], depth: 2 });
  const brief = intentBrief(focus);
  assert.equal(brief.what, 'SuspendAccount');
  assert.equal(brief.guarantees.length, 1);
  assert.equal(brief.prohibitions.length, 1);
  assert.equal(brief.verification, 2);
});

test('barrel exports the Intent Lens surface', () => {
  assert.equal(typeof barrel.buildFocusGraph, 'function');
  assert.equal(barrel.FOCUS_SCHEMA, 'intent-focus-v1');
});

test('intent focus CLI emits a brief and --json carries scope + focus', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intent-focus-'));
  writeFileSync(join(dir, 'SuspendAccount.intent'), SRC);
  const text = spawnSync(process.execPath, [CLI, 'focus', 'SuspendAccount', '--dir', dir], { encoding: 'utf8' });
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /\[mission\]/);
  assert.match(text.stdout, /focus graph: \d+ node/);
  const json = JSON.parse(spawnSync(process.execPath, [CLI, 'focus', 'SuspendAccount', '--dir', dir, '--json'], { encoding: 'utf8' }).stdout);
  assert.equal(json.focus.schema, 'intent-focus-v1');
  assert.equal(json.scope.type, 'mission');
  assert.equal(json.brief.what, 'SuspendAccount');
});
