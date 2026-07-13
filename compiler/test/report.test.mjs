import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, REPORT_SCHEMA } from '../src/report.mjs';
import * as barrel from '../src/index.mjs';

const CLEAN = `mission Clean
use product
goal
  do the thing
guarantee x holds
  verify a test
test Clean
  case c
    given a 1
    expect Y
`;
const MESSY = `mission Messy
use product
event E
  payload
    pw: Secret
input
  age: yaers
`;

test('buildReport aggregates severity, area, top codes across files', () => {
  const r = buildReport([{ file: 'clean.intent', source: CLEAN }, { file: 'messy.intent', source: MESSY }]);
  assert.equal(r.schema, REPORT_SCHEMA);
  assert.equal(r.totals.files, 2);
  assert.equal(r.totals.missions, 2);
  assert.ok(r.bySeverity.blocker >= 1, 'the secret-on-event-bus blocker is counted');
  assert.ok(r.topCodes.some((c) => c.code === 'IL-SEC-001'));
  // area mapping resolves from the catalog
  assert.ok(r.topCodes.every((c) => typeof c.area === 'string'));
});

test('coverage reflects verified guarantees, tests, and outcome contracts', () => {
  const r = buildReport([{ file: 'clean.intent', source: CLEAN }]);
  assert.equal(r.coverage.guarantees, 1);
  assert.equal(r.coverage.guaranteesVerified, 1);
  assert.equal(r.coverage.guaranteeVerifyRate, 100);
  assert.equal(r.coverage.missionsWithTests, 1);
  assert.equal(r.coverage.testCoverageRate, 100);
});

test('ok is false when any file has an error-level diagnostic', () => {
  // A clean file has no errors -> ok true.
  assert.equal(buildReport([{ file: 'c', source: CLEAN }]).ok, true);
});

test('files are sorted worst-first (most errors, then warnings)', () => {
  const r = buildReport([{ file: 'clean.intent', source: CLEAN }, { file: 'messy.intent', source: MESSY }]);
  // messy has warnings/blockers, clean has none -> messy first
  assert.equal(r.files[0].file, 'messy.intent');
});

test('an empty repo yields a valid, zero report', () => {
  const r = buildReport([]);
  assert.equal(r.totals.files, 0);
  assert.equal(r.ok, true);
  assert.equal(r.coverage.guaranteeVerifyRate, null);
});

test('buildReport is exported from the public barrel', () => {
  assert.equal(typeof barrel.buildReport, 'function');
});
