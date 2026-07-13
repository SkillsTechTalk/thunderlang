import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseIntent } from '../src/parse.mjs';
import { semanticDiagnostics } from '../src/emit.mjs';
import { toSarif, sarifLevel, SARIF_SCHEMA } from '../src/sarif.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'src', 'cli.mjs');

const leaky = `mission RiskyThing
use product
event UserRegistered
  payload
    userId: UserId
    password: Password
input
  age: yaers
`;

function reportFor(src, file = 'x.intent') {
  return [{ file, diagnostics: semanticDiagnostics(parseIntent(src)) }];
}

test('toSarif produces a valid 2.1.0 log shape', () => {
  const log = toSarif(reportFor(leaky), { version: '0.1.1' });
  assert.equal(log.version, '2.1.0');
  assert.equal(log.$schema, SARIF_SCHEMA);
  assert.equal(log.runs.length, 1);
  const driver = log.runs[0].tool.driver;
  assert.equal(driver.name, 'IntentLang');
  assert.equal(driver.version, '0.1.1');
  assert.ok(Array.isArray(driver.rules) && driver.rules.length > 0);
  assert.ok(Array.isArray(log.runs[0].results) && log.runs[0].results.length > 0);
});

test('every result references a declared rule and a physical location', () => {
  const log = toSarif(reportFor(leaky));
  const driver = log.runs[0].tool.driver;
  for (const r of log.runs[0].results) {
    assert.ok(driver.rules[r.ruleIndex], 'ruleIndex resolves');
    assert.equal(driver.rules[r.ruleIndex].id, r.ruleId, 'ruleIndex points at the right rule');
    assert.ok(['error', 'warning', 'note'].includes(r.level));
    const loc = r.locations[0].physicalLocation;
    assert.ok(loc.artifactLocation.uri);
    assert.ok(r.message.text);
  }
});

test('a blocker security diagnostic maps to SARIF error with a precise region', () => {
  const log = toSarif(reportFor(leaky));
  const sec = log.runs[0].results.find((r) => r.ruleId === 'IL-SEC-001');
  assert.ok(sec, 'IL-SEC-001 present');
  assert.equal(sec.level, 'error');
  assert.equal(sec.locations[0].physicalLocation.region.startLine, 6);
});

test('sarifLevel maps severity/level correctly', () => {
  assert.equal(sarifLevel({ severity: 'blocker' }), 'error');
  assert.equal(sarifLevel({ level: 'error' }), 'error');
  assert.equal(sarifLevel({ level: 'warning' }), 'warning');
  assert.equal(sarifLevel({ level: 'info' }), 'note');
  assert.equal(sarifLevel({}), 'note');
});

test('rules carry catalog metadata + a help link for cataloged codes', () => {
  const log = toSarif(reportFor(leaky));
  const rule = log.runs[0].tool.driver.rules.find((r) => r.id === 'IL-SEC-001');
  assert.equal(rule.shortDescription.text.length > 0, true);
  assert.equal(rule.defaultConfiguration.level, 'error');
  assert.match(rule.helpUri, /intentlanguage\.dev\/docs\/diagnostics#il-sec-001/);
});

test('empty input yields a valid, empty-results SARIF log', () => {
  const log = toSarif([{ file: 'clean.intent', diagnostics: [] }]);
  assert.equal(log.version, '2.1.0');
  assert.deepEqual(log.runs[0].results, []);
  assert.deepEqual(log.runs[0].tool.driver.rules, []);
});

test('intent check --format sarif emits a parseable log and exits 0 (report mode)', () => {
  const f = join(tmpdir(), `il-sarif-${process.pid}.intent`);
  writeFileSync(f, leaky);
  const res = spawnSync(process.execPath, [CLI, 'check', f, '--format', 'sarif'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const log = JSON.parse(res.stdout);
  assert.equal(log.version, '2.1.0');
  assert.ok(log.runs[0].results.some((r) => r.ruleId === 'IL-SEC-001'));
});
