import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { semanticDiagnostics } from '../src/emit.mjs';
import { detectConflicts, composeConstraints } from '../src/conflict.mjs';

const CHECKOUT = [
  'mission CertificationCheckout',
  'product requires', '  purchase_completion at_least 70 percent',
  'experience requires', '  checkout_steps at_most 3', '  guest_checkout available',
  'security requires', '  strong_authentication for HighRiskPurchase',
  'conflict GuestCheckoutAuthentication',
  '  between', '    Experience.GuestCheckout', '    Security.StrongAuthentication',
  '  options', '    authenticate after payment', '    authenticate before payment',
  '  resolve_by Product, UX, Security',
  '  before ExperienceApproval',
].join('\n');

test('role-scoped constraints compose by role', () => {
  const c = composeConstraints(parseIntent(CHECKOUT));
  assert.equal(c.total, 4);
  assert.deepEqual(c.byRole.experience, ['checkout_steps at_most 3', 'guest_checkout available']);
  assert.deepEqual(c.byRole.security, ['strong_authentication for HighRiskPurchase']);
});

test('declared conflict is surfaced as a blocker with owners + phase', () => {
  const ast = parseIntent(CHECKOUT);
  const conflicts = detectConflicts(ast);
  const declared = conflicts.find((c) => c.type === 'declared');
  assert.ok(declared);
  assert.deepEqual(declared.resolveBy, ['Product', 'UX', 'Security']);
  assert.equal(declared.before, 'ExperienceApproval');
  const diag = semanticDiagnostics(ast).find((d) => d.code === 'IL-CONFLICT-001');
  assert.equal(diag.severity, 'blocker');
  assert.deepEqual(diag.blocks, ['experienceapproval']);
  assert.deepEqual(diag.owners, ['Product', 'UX', 'Security']);
  assert.equal(diag.fix.length, 2); // options become suggested resolutions
});

test('detection is ORDER-INDEPENDENT (constraints compose the same regardless of order)', () => {
  const a = parseIntent(CHECKOUT);
  const b = parseIntent(CHECKOUT);
  b.roleConstraints.reverse();
  b.conflicts.reverse();
  assert.deepEqual(detectConflicts(a), detectConflicts(b));
});

test('structural: scope include+exclude of the same item is a contradiction', () => {
  const c = detectConflicts(parseIntent('mission M\nscope\n  include GuestCheckout\n  exclude GuestCheckout\n'));
  assert.ok(c.some((x) => x.type === 'scope-contradiction' && /guestcheckout/i.test(x.name)));
});

test('structural: direct negation between two role constraints', () => {
  const c = detectConflicts(parseIntent('mission M\nexperience requires\n  guest checkout available\nsecurity requires\n  guest checkout not available\n'));
  assert.ok(c.some((x) => x.type === 'negation'));
});

test('structural: redundant constraint contributed by two roles', () => {
  const c = detectConflicts(parseIntent('mission M\nproduct requires\n  audit logging enabled\noperations requires\n  audit logging enabled\n'));
  assert.ok(c.some((x) => x.type === 'redundant'));
});

test('no conflicts -> empty (compatible constraints do not false-positive)', () => {
  const c = detectConflicts(parseIntent('mission M\nproduct requires\n  fast checkout\nsecurity requires\n  strong auth\n'));
  assert.equal(c.length, 0);
});
