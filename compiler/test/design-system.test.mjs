import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { NODE_TYPES, RELATIONSHIP_TYPES } from '../src/intent-schema.mjs';

const src = `mission Checkout
use experience
use design
experience CheckoutFlow
  state AddressEntry
  state Review
pattern FormValidation
  requires inline errors
component AddressForm
  description "collects and validates a shipping address"
  variant default
  variant error
  token color.error
  token spacing.md
  implements AddressEntry
  implements FormValidation
component ReviewCard
  implements Review
artifact CheckoutMockups
  kind figma
  ref "figma.com/file/abc"
  covers AddressForm
  covers ReviewCard
`;
const ast = parseIntent(src);
const g = buildIntentGraph(ast);
const nodeById = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
const hasEdge = (from, type, to) => g.relationships.some((r) => r.from === from && r.type === type && r.to === to);

test('design profile parses components (variants/tokens/implements) and artifacts', () => {
  assert.equal(ast.components.length, 2);
  assert.deepEqual(ast.components[0].variants, ['default', 'error']);
  assert.deepEqual(ast.components[0].tokens, ['color.error', 'spacing.md']);
  assert.deepEqual(ast.components[0].implements, ['AddressEntry', 'FormValidation']);
  assert.equal(ast.artifacts[0].kind, 'figma');
  assert.equal(ast.artifacts[0].ref, 'figma.com/file/abc');
  assert.deepEqual(ast.artifacts[0].covers, ['AddressForm', 'ReviewCard']);
});

test('DesignComponent node carries variants + tokens in its description', () => {
  const c = nodeById['design-component.addressform'];
  assert.equal(c.type, 'DesignComponent');
  assert.match(c.description, /variants: default, error/);
  assert.match(c.description, /tokens: color.error/);
  assert.ok(hasEdge('mission.checkout', 'requires', 'design-component.addressform'));
});

test('a component implements resolve to BOTH an experience state and a pattern', () => {
  assert.ok(hasEdge('experience-state.checkoutflow.addressentry', 'implemented_by', 'design-component.addressform'));
  assert.ok(hasEdge('pattern.formvalidation', 'implemented_by', 'design-component.addressform'));
  assert.ok(hasEdge('experience-state.checkoutflow.review', 'implemented_by', 'design-component.reviewcard'));
});

test('DesignArtifact node carries the ref as source + covers the components', () => {
  const a = nodeById['design-artifact.checkoutmockups'];
  assert.equal(a.type, 'DesignArtifact');
  assert.equal(a.source, 'figma.com/file/abc');
  assert.ok(hasEdge('mission.checkout', 'represented_by', 'design-artifact.checkoutmockups'));
  assert.ok(hasEdge('design-component.addressform', 'represented_by', 'design-artifact.checkoutmockups'));
  assert.ok(hasEdge('design-component.reviewcard', 'represented_by', 'design-artifact.checkoutmockups'));
});

test('an unresolved implements/covers reference never creates a dangling edge', () => {
  const g2 = buildIntentGraph(parseIntent('mission M\ncomponent C\n  implements NoSuchState\nartifact A\n  covers NoSuchComponent\n'));
  const ids = new Set(g2.nodes.map((n) => n.id));
  for (const r of g2.relationships) {
    assert.ok(ids.has(r.from) || r.from.startsWith('phase.'), `dangling from ${r.from}`);
    assert.ok(ids.has(r.to) || r.to.startsWith('phase.'), `dangling to ${r.to}`);
  }
  // C requires edge still present, just no implemented_by
  assert.ok(g2.relationships.some((r) => r.to === 'design-component.c' && r.type === 'requires'));
});

test('all emitted design nodes + edges are canonical (anti-fork)', () => {
  for (const n of g.nodes) assert.ok(NODE_TYPES.includes(n.type), `noncanonical node ${n.type}`);
  for (const r of g.relationships) assert.ok(RELATIONSHIP_TYPES.includes(r.type), `noncanonical rel ${r.type}`);
});
