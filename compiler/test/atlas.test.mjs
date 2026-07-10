import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMissionIndex } from '../src/atlas.mjs';

const REGISTER = `# RegisterUser.intent , Demo / Identity and Access
mission RegisterUser
goal
  Create an account.
input
  email: Email
  password: Secret
guarantees
  password is never logged
never
  log(password)
verify
  test password stored as hash
`;

const HEALTH = `# HealthCheck.intent , Demo / Deployment Readiness
mission HealthCheck
goal
  Report health.
output
  status: HealthStatus
guarantees
  health reflects real dependency status
`;

test('buildMissionIndex aggregates missions with derivable fields', () => {
  const index = buildMissionIndex([
    { path: 'intent/RegisterUser.intent', source: REGISTER },
    { path: 'intent/HealthCheck.intent', source: HEALTH },
  ], { product: 'Demo' });

  assert.equal(index.schema, 'mission-index-v1');
  assert.equal(index.product, 'Demo');
  assert.equal(index.summary.missions, 2);

  const reg = index.missions.find((m) => m.mission === 'RegisterUser');
  const health = index.missions.find((m) => m.mission === 'HealthCheck');

  // Area is parsed from the header convention.
  assert.equal(reg.area, 'Identity and Access');
  assert.equal(health.area, 'Deployment Readiness');

  // Risk is a heuristic: a Secret input + auth signal is high; a read-only health check is low.
  assert.equal(reg.risk, 'high');
  assert.equal(health.risk, 'low');

  // Verification is DECLARED (verify tests present), not proven.
  assert.equal(reg.guarantees, 1);
  assert.equal(reg.neverRules, 1);
  assert.ok(reg.verifyTests >= 1);
  assert.notEqual(reg.verification, 'none');
  assert.equal(health.verification, 'none'); // guarantee with no verify test
});

test('buildMissionIndex sorts missions and groups by area', () => {
  const index = buildMissionIndex([
    { path: 'b.intent', source: HEALTH },
    { path: 'a.intent', source: REGISTER },
  ]);
  assert.deepEqual(index.missions.map((m) => m.mission), ['HealthCheck', 'RegisterUser']);
  assert.equal(index.summary.byArea['Identity and Access'], 1);
  assert.equal(index.summary.byArea['Deployment Readiness'], 1);
});

test('explicit "# area:" comment overrides the header convention', () => {
  const src = `# thing.intent , Demo / Wrong Area
# area: Correct Area
mission Thing
goal
  do a thing
`;
  const index = buildMissionIndex([{ path: 'thing.intent', source: src }]);
  assert.equal(index.missions[0].area, 'Correct Area');
});
