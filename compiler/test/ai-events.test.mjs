import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  emptyEventLog, recordEvent, parseEventLog, serializeEventLog, eventsOfType, timeline,
} from '../src/ai-events.mjs';
import { makeEvent } from '../src/ai.mjs';
import * as barrel from '../src/index.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');

const approved = makeEvent('IntentAiImplementationApproved', {
  implementationId: 'risk-1', missionId: 'CalculateRiskScore', actorType: 'human', actorId: 'sec',
  timestamp: 't2', previousStatus: 'VERIFIED_AWAITING_APPROVAL', newStatus: 'APPROVED',
});
const declared = makeEvent('IntentAiImplementationDeclared', {
  implementationId: 'risk-1', missionId: 'CalculateRiskScore', timestamp: 't0', newStatus: 'PENDING',
});

test('the event log is append-only and round-trips through JSON Lines', () => {
  let log = emptyEventLog();
  log = recordEvent(log, declared);
  log = recordEvent(log, approved);
  assert.equal(log.events.length, 2);
  const jsonl = serializeEventLog(log);
  assert.equal(jsonl.split('\n').filter(Boolean).length, 2);
  const back = parseEventLog(jsonl);
  assert.deepEqual(back.events, log.events);
  assert.equal(eventsOfType(back, 'IntentAiImplementationApproved').length, 1);
});

test('recordEvent rejects an unknown event type and does not mutate', () => {
  const log0 = emptyEventLog();
  assert.throws(() => recordEvent(log0, { type: 'Nope' }), /unknown event type/);
  const log1 = recordEvent(log0, declared);
  assert.equal(log0.events.length, 0);
  assert.equal(log1.events.length, 1);
});

test('timeline summarizes status moves for one implementation', () => {
  const log = recordEvent(recordEvent(emptyEventLog(), declared), approved);
  const t = timeline(log, 'risk-1');
  assert.equal(t.length, 2);
  assert.equal(t[1].type, 'IntentAiImplementationApproved');
  assert.equal(t[1].by, 'sec');
  assert.equal(t[1].from, 'VERIFIED_AWAITING_APPROVAL');
  assert.equal(t[1].to, 'APPROVED');
});

test('parseEventLog ignores blank lines; empty log serializes to empty string', () => {
  assert.equal(serializeEventLog(emptyEventLog()), '');
  assert.equal(parseEventLog('\n\n').events.length, 0);
});

test('intent ai events reads the append-only sink at .intent/ai-events.jsonl', () => {
  const dir = mkdtempSync(join(tmpdir(), 'intent-aievents-'));
  mkdirSync(join(dir, '.intent'), { recursive: true });
  const log = recordEvent(recordEvent(emptyEventLog(), declared), approved);
  writeFileSync(join(dir, '.intent', 'ai-events.jsonl'), serializeEventLog(log));

  const res = spawnSync(process.execPath, [CLI, 'ai', 'events', dir], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /2 events/);
  assert.match(res.stdout, /IntentAiImplementationApproved by sec/);
  assert.match(res.stdout, /VERIFIED_AWAITING_APPROVAL -> APPROVED/);

  const json = JSON.parse(spawnSync(process.execPath, [CLI, 'ai', 'events', dir, '--json'], { encoding: 'utf8' }).stdout);
  assert.equal(json.schema, 'intent-ai-events-v1');
  assert.equal(json.events.length, 2);

  const filtered = spawnSync(process.execPath, [CLI, 'ai', 'events', dir, '--subject', 'nope'], { encoding: 'utf8' });
  assert.match(filtered.stdout, /0 events for nope/);
});

test('the event sink is exported from the barrel', () => {
  assert.equal(typeof barrel.recordEvent, 'function');
  assert.equal(barrel.EVENT_LOG_SCHEMA, 'intent-ai-events-v1');
});
