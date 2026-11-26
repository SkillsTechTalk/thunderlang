// Part 2 of the tutorial, write and run: every answer comes from running the lesson's program on the Thunder engine,
// and the lessons stay browser-safe (STT and the site render them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { learnThunder, WRITE_LESSONS } from '../src/learn.mjs';
import { STARTER_PROGRAM } from '../src/learn-lessons.mjs';
import { newProject } from '../src/core/project.mjs';

test('write lessons name their concept, say what to type, and show what the program prints', () => {
  const write = learnThunder().lessons.filter((l) => l.part === 'write');
  assert.deepEqual(write.map((l) => l.slug), ['first-program', 'choose', 'repeat', 'records', 'python-as-thunder', 'check-test-verify', 'agent-why']);
  for (const l of write) {
    assert.ok(l.concept && l.commands?.length && l.questions.length && l.reflect.length, l.slug);
    for (const c of l.commands) assert.match(c, /^thunder /, `${l.slug}: ${c}`);
  }
  const first = write[0];
  assert.deepEqual(first.commands, ['thunder new hello', 'thunder run hello']);
  assert.equal(first.output, 'Hello, world!\n');
  assert.match(first.idea, /does not move you into the folder/);
  assert.deepEqual(write.find((l) => l.slug === 'repeat').questions.map((q) => q.answer), ['Total: 265', 'First: 90']);
});

test('the first lesson teaches the exact program thunder new writes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'thunder-learn-'));
  try { newProject(join(dir, 'hello')); assert.equal(readFileSync(join(dir, 'hello', 'src', 'main.thunder'), 'utf8'), STARTER_PROGRAM); }
  finally { rmSync(dir, { recursive: true }); }
});

test('an answer is what running the program gives: a lesson that disagrees cannot be built', () => {
  const q = WRITE_LESSONS.find((l) => l.slug === 'choose').quiz[1];
  const saved = q.expect;
  q.expect = 'Delivery costs $3.99';
  try { assert.throws(() => learnThunder(), /lesson expects "Delivery costs \$3\.99", but the compiler says "Delivery is free"/); }
  finally { q.expect = saved; }
});

test('the tutorial loads no Node-only module, so it runs in a browser', () => {
  const seen = new Set(), bad = [];
  const walk = (f) => {
    if (seen.has(f)) return; seen.add(f);
    for (const m of readFileSync(f, 'utf8').matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gm)) {
      if (m[1].startsWith('node:')) bad.push(`${f} -> ${m[1]}`);
      else if (m[1].startsWith('.')) walk(resolve(dirname(f), m[1]));
    }
  };
  walk(resolve(dirname(new URL(import.meta.url).pathname), '..', 'src', 'learn.mjs'));
  assert.deepEqual(bad, []);
  assert.ok(seen.size > 20);
});
