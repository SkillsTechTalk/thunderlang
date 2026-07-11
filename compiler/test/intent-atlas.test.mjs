import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { buildAtlas, searchAtlas, expandNode, ATLAS_SCHEMA } from '../src/intent-atlas.mjs';

const g = (src) => buildIntentGraph(parseIntent(src));
const M1 = g('use product\nmission CheckoutFlow\ntitle "Checkout"\nfor Learner\noutcome FastCheckout\n  "quick"\n');
const M2 = g('mission RiskScore\nlifecycle L\n  state A\n  state B\n  transition T\n    from A\n    to B\n  terminal B\n');

test('buildAtlas assembles many mission graphs; missions are the entry points', () => {
  const atlas = buildAtlas([M1, M2], { product: 'Demo' });
  assert.equal(atlas.schema, ATLAS_SCHEMA);
  assert.equal(atlas.overview.missions, 2);
  assert.deepEqual(atlas.missions.map((m) => m.id).sort(), ['mission.checkoutflow', 'mission.riskscore']);
  assert.ok(atlas.overview.nodes >= 6);
  assert.ok(atlas.overview.byType.Mission === 2);
});

test('searchAtlas is deterministic (exact-title first) and type-filterable, no AI', () => {
  const atlas = buildAtlas([M1, M2]);
  const hits = searchAtlas(atlas, 'checkout');
  assert.ok(hits.length >= 1);
  assert.ok(hits.some((n) => n.title === 'Checkout')); // exact title match surfaces
  // type filter
  const outcomes = searchAtlas(atlas, 'checkout', { type: 'Outcome' });
  assert.ok(outcomes.every((n) => n.type === 'Outcome'));
  // deterministic
  assert.deepEqual(searchAtlas(atlas, 'checkout').map((n) => n.id), searchAtlas(atlas, 'checkout').map((n) => n.id));
});

test('expandNode returns a node with its outbound + inbound neighbors (progressive disclosure)', () => {
  const atlas = buildAtlas([M1]);
  const ex = expandNode(atlas, 'mission.checkoutflow');
  assert.ok(ex);
  assert.equal(ex.node.type, 'Mission');
  assert.ok(ex.out.some((e) => e.rel === 'targets')); // -> outcome
  assert.equal(expandNode(atlas, 'nope'), null);
});
