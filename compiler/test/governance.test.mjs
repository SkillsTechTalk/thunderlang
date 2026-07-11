import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent } from '../src/parse.mjs';
import { applyWaivers, governanceDiagnostics, GOVERNANCE_SCHEMA } from '../src/governance.mjs';

const waiverSrc = `mission Checkout
metric conversion
  target 60%
waiver IL-PM-001
  reason "measurement window deferred to v2, tracked in JIRA-123"
  approved_by Head of Product
  expires 2026-12-31
`;
const diags = () => [
  { code: 'IL-PM-001', severity: 'blocker', blocks: ['release'], message: 'Metric has no window' },
  { code: 'IL-EXP-004', severity: 'blocker', blocks: ['release'], message: 'no recovery path' },
];

test('parseIntent extracts a waiver with reason / approver / expiry', () => {
  const w = parseIntent(waiverSrc).waivers;
  assert.equal(w.length, 1);
  assert.equal(w[0].code, 'IL-PM-001');
  assert.equal(w[0].approvedBy, 'Head of Product');
  assert.equal(w[0].expires, '2026-12-31');
  assert.match(w[0].reason, /JIRA-123/);
});

test('applyWaivers waives the matching blocker but leaves others blocking', () => {
  const waivers = parseIntent(waiverSrc).waivers;
  const r = applyWaivers(diags(), waivers, { now: '2026-07-11' });
  assert.equal(r.schema, GOVERNANCE_SCHEMA);
  assert.equal(r.report.waived, 1);
  assert.equal(r.report.blockingAfter, 1);
  assert.deepEqual(r.blockingAfter.map((d) => d.code), ['IL-EXP-004']);
  const waived = r.diagnostics.find((d) => d.code === 'IL-PM-001');
  assert.equal(waived.waived, true);
  assert.equal(waived.waiver.approvedBy, 'Head of Product');
});

test('an expired waiver does NOT waive (diagnostic stays blocking)', () => {
  const waivers = parseIntent(waiverSrc).waivers;
  const r = applyWaivers(diags(), waivers, { now: '2027-01-01' });
  assert.equal(r.report.waived, 0);
  assert.equal(r.report.blockingAfter, 2);
});

test('with no `now`, expiry is not enforced (deterministic default)', () => {
  const waivers = parseIntent(waiverSrc).waivers;
  const r = applyWaivers(diags(), waivers); // no now
  assert.equal(r.report.waived, 1);
});

test('governanceDiagnostics flags expired waiver (IL-GOV-005)', () => {
  const waivers = parseIntent(waiverSrc).waivers;
  const gd = governanceDiagnostics(waivers, diags(), { now: '2027-01-01' });
  assert.ok(gd.some((d) => d.code === 'IL-GOV-005'));
});

test('governanceDiagnostics flags missing reason (002) and approver (003)', () => {
  const bad = parseIntent('mission M\nwaiver IL-X-001\n  scope mission.m\n').waivers;
  const gd = governanceDiagnostics(bad, [{ code: 'IL-X-001' }]);
  const codes = gd.map((d) => d.code);
  assert.ok(codes.includes('IL-GOV-002'));
  assert.ok(codes.includes('IL-GOV-003'));
});

test('governanceDiagnostics flags a dangling waiver (IL-GOV-004)', () => {
  const waivers = parseIntent(waiverSrc).waivers;
  const gd = governanceDiagnostics(waivers, [{ code: 'IL-SOMETHING-ELSE' }], { now: '2026-07-11' });
  assert.ok(gd.some((d) => d.code === 'IL-GOV-004'));
});

test('scoped waiver only waives the matching scope', () => {
  const waivers = [{ id: 'waiver.a', code: 'IL-PM-001', reason: 'r', approvedBy: 'x', scope: 'mission.checkout', expires: null }];
  const scoped = [
    { code: 'IL-PM-001', severity: 'blocker', scope: 'mission.checkout' },
    { code: 'IL-PM-001', severity: 'blocker', scope: 'mission.other' },
  ];
  const r = applyWaivers(scoped, waivers);
  assert.equal(r.report.waived, 1);
  assert.equal(r.blockingAfter[0].scope, 'mission.other');
});
