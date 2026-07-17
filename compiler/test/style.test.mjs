import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { buildIntentGraph } from '../src/intent-graph.mjs';
import { semanticDiagnostics } from '../src/emit.mjs';
import {
  analyzeStyle, styleDiagnostics, toDesignTokens, toCss, STYLE_SCHEMA, DESIGN_TOKENS_SCHEMA,
  TOKEN_PATHS, STYLE_ADDRESS_SPACE, ACCESSIBILITY_TARGETS, ACCESSIBILITY_CLASSIFICATION,
} from '../src/style.mjs';
import { exportIntent, EXPORT_FORMATS } from '../src/exporters.mjs';
import { NODE_TYPES, DIAGNOSTIC_RULES } from '../src/intent-schema.mjs';

const src = `mission Storefront
use experience
use design

experience CheckoutFlow
  goal "complete a purchase"
  state Reviewing
  state Paid

style_intent CheckoutLook
  applies_to CheckoutFlow
  purpose "premium, trustworthy checkout"
  audience enterprise buyers, procurement
  surface checkout
  surface receipt
  token color.primary #0B5FFF
  token typography.scale 1.25
  token mode both
  accessibility_target WCAG_2_2_AA
  scope surface:checkout
`;
const ast = parseIntent(src);

test('style_intent parses into ast.styleIntents', () => {
  assert.equal(ast.styleIntents.length, 1);
  const si = ast.styleIntents[0];
  assert.equal(si.name, 'CheckoutLook');
  assert.equal(si.appliesTo, 'CheckoutFlow');
  assert.equal(si.purpose, 'premium, trustworthy checkout');
  assert.deepEqual(si.audience, ['enterprise buyers', 'procurement']);
  assert.deepEqual(si.surfaces, ['checkout', 'receipt']);
  assert.equal(si.accessibilityTarget, 'WCAG_2_2_AA');
  assert.equal(si.scope, 'surface:checkout');
  assert.equal(si.tokens.length, 3);
  assert.deepEqual(si.tokens[0], { path: 'color.primary', value: '#0B5FFF', line: si.tokens[0].line });
});

test('analyzeStyle returns a structured, canonical view', () => {
  const a = analyzeStyle(ast);
  assert.equal(a.schema, STYLE_SCHEMA);
  assert.equal(a.styleIntents.length, 1);
  const v = a.styleIntents[0];
  assert.equal(v.id, 'style.checkoutlook');
  assert.equal(v.accessibility.target, 'WCAG_2_2_AA');
  assert.equal(v.accessibility.classification, ACCESSIBILITY_CLASSIFICATION);
  assert.equal(v.accessibility.classification, 'proposed');
  assert.equal(v.accessibility.verified, false, 'IL never marks an accessibility target verified');
  assert.ok(v.tokens.every((t) => t.canonical), 'all tokens are on the canonical address space');
});

test('clean style intent produces no style warnings', () => {
  const diags = styleDiagnostics(ast);
  assert.deepEqual(diags.filter((d) => d.severity !== 'info'), []);
});

test('IL-STYLE-001 flags an off-namespace token path', () => {
  const bad = parseIntent(`mission M
use design
style_intent Look
  token color.tertiary #fff
  accessibility_target WCAG_2_2_AA
`);
  const diags = styleDiagnostics(bad);
  const d = diags.find((x) => x.ruleId === 'IL-STYLE-001');
  assert.ok(d, 'off-namespace token flagged');
  assert.match(d.message, /color\.tertiary/);
});

test('IL-STYLE-002 flags an unrecognized accessibility target', () => {
  const bad = parseIntent(`mission M
use design
style_intent Look
  accessibility_target WCAG_3
`);
  const d = styleDiagnostics(bad).find((x) => x.ruleId === 'IL-STYLE-002');
  assert.ok(d);
});

test('IL-STYLE-003 (info) fires when no accessibility target is declared', () => {
  const bare = parseIntent(`mission M
use design
style_intent Look
  token color.primary #000
`);
  const d = styleDiagnostics(bare).find((x) => x.ruleId === 'IL-STYLE-003');
  assert.ok(d);
  assert.equal(d.severity, 'info');
});

test('IL-STYLE-004 flags an invalid mode value', () => {
  const bad = parseIntent(`mission M
use design
style_intent Look
  token mode neon
  accessibility_target WCAG_2_2_AA
`);
  const d = styleDiagnostics(bad).find((x) => x.ruleId === 'IL-STYLE-004');
  assert.ok(d);
});

test('IL-STYLE-005 flags applies_to an undeclared experience', () => {
  const bad = parseIntent(`mission M
use experience
use design
experience Onboarding
  goal "x"
style_intent Look
  applies_to Checkout
  accessibility_target WCAG_2_2_AA
`);
  const d = styleDiagnostics(bad).find((x) => x.ruleId === 'IL-STYLE-005');
  assert.ok(d);
});

test('style diagnostics compose into semanticDiagnostics', () => {
  const d = semanticDiagnostics(ast).map((x) => x.code);
  // clean sample: only the info-level "no accessibility target" would appear if missing;
  // here a target is declared, so no IL-STYLE-* codes should surface.
  assert.ok(!d.some((c) => c && c.startsWith('IL-STYLE-')), 'clean sample has no style diagnostics');
  const bad = parseIntent(`mission M
use design
style_intent Look
  token color.tertiary #fff
`);
  const bc = semanticDiagnostics(bad).map((x) => x.code);
  assert.ok(bc.includes('IL-STYLE-001'));
  assert.ok(bc.includes('IL-STYLE-003'));
});

test('graph emits a StyleIntent node, always classified proposed', () => {
  const graph = buildIntentGraph(ast);
  const n = graph.nodes.find((x) => x.type === 'StyleIntent');
  assert.ok(n, 'StyleIntent node emitted');
  assert.equal(n.id, 'style.checkoutlook');
  assert.equal(n.classification, 'proposed');
  // applies_to resolves to the experience, so the experience is constrained_by the style.
  const eId = 'experience.checkoutflow';
  const edge = graph.relationships.find((r) => r.from === eId && r.to === n.id && r.type === 'constrained_by');
  assert.ok(edge, 'experience constrained_by style intent');
});

test('StyleIntent with no experience falls back to Mission requires', () => {
  const solo = parseIntent(`mission M
use design
style_intent Look
  accessibility_target WCAG_2_2_AA
`);
  const graph = buildIntentGraph(solo);
  const n = graph.nodes.find((x) => x.type === 'StyleIntent');
  const edge = graph.relationships.find((r) => r.to === n.id && r.type === 'requires');
  assert.ok(edge, 'mission requires the style intent');
});

test('StyleIntent is a canonical node type and IL-STYLE rules are catalogued', () => {
  assert.ok(NODE_TYPES.includes('StyleIntent'));
  const styleRules = DIAGNOSTIC_RULES.filter((r) => r.ruleId.startsWith('IL-STYLE-'));
  assert.equal(styleRules.length, 5);
  for (const r of styleRules) assert.equal(r.area, 'style');
});

test('toDesignTokens renders canonical W3C (DTCG) tokens', () => {
  const dt = toDesignTokens(ast);
  // nested groups from dotted paths
  assert.equal(dt.color.primary.$value, '#0B5FFF');
  assert.equal(dt.color.primary.$type, 'color');
  // numeric coercion
  assert.equal(dt.typography.scale.$value, 1.25);
  assert.equal(dt.typography.scale.$type, 'number');
  // fontFamily + mode type inference
  // (sample has color.primary, typography.scale, mode)
  assert.equal(dt.mode.$type, 'other');
  // provenance rides in $extensions, accessibility as a proposed claim never verified
  const meta = dt.$extensions['dev.thunderlang'];
  assert.equal(meta.schema, DESIGN_TOKENS_SCHEMA);
  assert.equal(meta.styleIntents[0].accessibility.classification, 'proposed');
  assert.equal(meta.styleIntents[0].accessibility.verified, false);
});

test('off-namespace tokens still export, flagged non-canonical', () => {
  const bad = parseIntent(`mission M
use design
style_intent Look
  token color.tertiary #999
  accessibility_target WCAG_2_2_AA
`);
  const dt = toDesignTokens(bad);
  assert.equal(dt.color.tertiary.$value, '#999');
  assert.equal(dt.color.tertiary.$extensions['dev.thunderlang'].canonical, false);
});

test('a file with no style intents yields an empty-but-valid tokens doc', () => {
  const none = parseIntent('mission M\nuse product\n');
  const dt = toDesignTokens(none);
  assert.ok(dt.$description);
  assert.deepEqual(dt.$extensions['dev.thunderlang'].styleIntents, []);
});

test('tokens is a registered export format wired through exportIntent', () => {
  assert.ok(EXPORT_FORMATS.includes('tokens'));
  const r = exportIntent(ast, 'tokens');
  assert.equal(r.ext, 'tokens.json');
  const parsed = JSON.parse(r.content);
  assert.equal(parsed.color.primary.$value, '#0B5FFF');
});

test('toCss renders :root custom properties with kebab-case names', () => {
  const css = toCss(ast);
  assert.match(css, /:root \{/);
  assert.match(css, /--color-primary: #0B5FFF;/);
  assert.match(css, /--typography-scale: 1\.25;/);
  // mode both -> color-scheme
  assert.match(css, /color-scheme: light dark;/);
  // kebab-casing of camelCase segments is exercised by a nested-family token
  const nested = parseIntent(`mission M
use design
style_intent Look
  token typography.families.body Inter
  token typography.headingWeight 700
  accessibility_target WCAG_2_2_AA
`);
  const c2 = toCss(nested);
  assert.match(c2, /--typography-families-body: Inter;/);
  assert.match(c2, /--typography-heading-weight: 700;/);
});

test('toCss wraps brand.logo in url() and is a registered export format', () => {
  const withLogo = parseIntent(`mission M
use design
style_intent Look
  token brand.logo /brand/mark.svg
  accessibility_target WCAG_2_2_AA
`);
  assert.match(toCss(withLogo), /--brand-logo: url\(\/brand\/mark\.svg\);/);
  // accessibility appears only as a comment (proposed), never a declaration
  assert.match(toCss(withLogo), /proposed, not verified/);
  assert.ok(EXPORT_FORMATS.includes('css'));
  assert.equal(exportIntent(withLogo, 'css').ext, 'css');
});

test('toCss on a file with no style intents is a valid empty :root', () => {
  const css = toCss(parseIntent('mission M\nuse product\n'));
  assert.match(css, /:root \{\s*\}/);
});

test('canonical token space is stable and non-empty', () => {
  assert.ok(TOKEN_PATHS.includes('color.primary'));
  assert.ok(TOKEN_PATHS.includes('color.feedback.error'));
  assert.ok(STYLE_ADDRESS_SPACE.includes('brand.logo'));
  assert.deepEqual(ACCESSIBILITY_TARGETS, ['WCAG_2_1_AA', 'WCAG_2_2_AA', 'WCAG_2_2_AAA']);
});
