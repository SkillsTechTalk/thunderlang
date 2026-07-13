import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIntent } from '../src/parse.mjs';
import { comprehensionLevel, comprehensionReport, LEVELS, COMPREHENSION_SCHEMA } from '../src/comprehension.mjs';
import * as barrel from '../src/index.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const lvl = (src, opts) => comprehensionLevel(parseIntent(src), opts);

test('C0..C7 are defined in order, C7 is Governed', () => {
  assert.deepEqual(LEVELS.map((l) => l.level), ['C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']);
  assert.equal(LEVELS[7].name, 'Governed');
});

test('C0 Unknown: a mission with no purpose', () => {
  assert.equal(lvl('mission M').level, 'C0');
});

test('C1 Described: a purpose in ANY form counts (goal, why, or a product title)', () => {
  assert.equal(lvl('mission M\ngoal\n  do it').level, 'C1');
  assert.equal(lvl('mission M\nwhy\n  because').level, 'C1');
  assert.equal(lvl('mission M\ntitle "take a certification attempt"').level, 'C1'); // was a false C0
});

test('C2 Structured: guarantees/never/decisions/states/failures/constraints', () => {
  assert.equal(lvl('mission M\ngoal\n  g\nnever leak a secret').level, 'C2');
});

test('C3 Mapped: intent links to implementation (a target)', () => {
  assert.equal(lvl('mission M\ngoal\n  g\nguarantee it holds\ntarget\n  TypeScript').level, 'C3');
});

test('C4 Verified: every guarantee AND never carries a verify', () => {
  const r = lvl('mission M\ngoal\n  g\nguarantee it holds\n  verify t\nnever leak\n  verify s\ntarget\n  TypeScript');
  assert.equal(r.level, 'C4');
  assert.equal(r.schema, COMPREHENSION_SCHEMA);
});

test('the ladder is cumulative: a gap caps the level even if a higher signal is met', () => {
  // verified guarantee but NO implementation mapping -> capped at C2, not C4.
  const r = lvl('mission M\ngoal\n  g\nguarantee it holds\n  verify t');
  assert.equal(r.signals.verification.met, true);
  assert.equal(r.signals.mapping.met, false);
  assert.equal(r.level, 'C2', 'the missing C3 mapping caps the level');
});

test('C5/C6/C7 require sibling evidence; each missing rung names its owner', () => {
  const src = 'mission M\nuse product\ntitle "t"\ngoal\n  g\nowner Team\nguarantee it holds\n  verify t\nnever leak\n  verify s\ntarget\n  TypeScript\nunknown U\n  question "?"\nnote pm:\n  teach it\n';
  const il = lvl(src);
  assert.equal(il.level, 'C4', 'IL alone tops out at C4');
  assert.equal(il.missing[0].level, 'C5');
  assert.match(il.missing[0].owner, /OpenThunder|runtime/);
  // siblings attach their evidence -> the joint level rises to C7
  const governed = lvl(src, { observed: true, learningPath: true, governed: true });
  assert.equal(governed.level, 'C7');
  assert.equal(governed.missing.length, 0);
});

test('never presents an unproven level as reached: observation stays false without evidence', () => {
  const r = lvl('mission M\ngoal\n  g\nguarantee it holds\n  verify t\ntarget\n  TypeScript');
  assert.equal(r.signals.observation.met, false);
  assert.equal(r.signals.observation.owner, 'OpenThunder / runtime');
});

test('comprehensionReport summarizes the distribution across missions', () => {
  const asts = ['mission A', 'mission B\ngoal\n  g'].map(parseIntent);
  const rep = comprehensionReport(asts);
  assert.equal(rep.count, 2);
  assert.equal(rep.byLevel.C0, 1);
  assert.equal(rep.byLevel.C1, 1);
});

test('barrel exports the comprehension API', () => {
  assert.equal(typeof barrel.comprehensionLevel, 'function');
  assert.equal(barrel.COMPREHENSION_SCHEMA, 'intent-comprehension-v1');
});

test('CLI: intent comprehension prints levels and --json carries the report', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intent-comp-'));
  writeFileSync(join(dir, 'M.intent'), 'mission M\ngoal\n  do it\nguarantee it holds\n  verify t\ntarget\n  TypeScript\n');
  const text = spawnSync(process.execPath, [CLI, 'comprehension', join(dir, 'M.intent')], { encoding: 'utf8' });
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /C4 Verified/);
  const json = JSON.parse(spawnSync(process.execPath, [CLI, 'comprehension', join(dir, 'M.intent'), '--json'], { encoding: 'utf8' }).stdout);
  assert.equal(json.schema, 'intent-comprehension-v1');
  assert.equal(json.missions[0].level, 'C4');
});
