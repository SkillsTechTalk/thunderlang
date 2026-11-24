// Regressions from OpenThunder's large-repo and corpus tests (2026-11-24).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCode } from '../src/read.mjs';

test('a large body of statements reads in linear time (was quadratic: Gitea routers/web/web.go took 6 s)', () => {
  const groups = Array.from({ length: 300 }, (_, g) => `\tm.Group("/g${g}", func() {\n${Array.from({ length: 6 }, (_, k) => `\t\tm.Get("/r${k}",  reqSignIn,   repo.H${k})  ;  `).join('\n')}\n\t})`).join('\n');
  const src = `package web\n\nfunc registerRoutes(m *web.Router) {\n${groups}\n}\n`;
  const t0 = performance.now();
  const r = readCode(src, { language: 'go' });
  const ms = performance.now() - t0;
  assert.ok(r.items.some((i) => i.name === 'registerRoutes'));
  assert.ok(ms < 1500, `took ${Math.round(ms)} ms`);
});

test('TypeScript return types with braces are read whole, and the body starts after them', () => {
  const r = readCode('async function timed(url: string): Promise<{ ms: number; status: number }> {\n  const t0 = now();\n  return { ms: 1, status: 2 };\n}\n', { language: 'typescript' });
  const fn = r.items.find((i) => i.name === 'timed');
  assert.equal(fn.returns, 'Promise<{ ms: number; status: number }>');
  assert.ok(!(fn.steps ?? []).some((s) => /ms:\s*number/.test(s.says)), 'type members are not steps');
});

test('a const holding a value in parentheses is not a function; a const arrow function still is', () => {
  const r = readCode('function f() {\n  const d = (await res.json()) as { error?: string };\n  const go = async (id: string): Promise<void> => { await save(id); };\n}\n', { language: 'typescript' });
  const names = r.items.map((i) => i.name);
  assert.ok(!names.includes('d'));
  assert.ok(names.includes('go'));
  assert.equal(r.items.find((i) => i.name === 'go').returns, 'Promise<void>');
});
