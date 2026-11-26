import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '../src/program.mjs');

test('@skillstech/thunderlang/program is browser-safe: no node: imports anywhere in its import graph', () => {
  const seen = new Set(), bad = [];
  const walk = (f) => {
    if (seen.has(f)) return;
    seen.add(f);
    for (const m of readFileSync(f, 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)[^;'"]*?from\s+['"]([^'"]+)['"]/g)) {
      const t = m[1];
      if (/^node:|^(fs|path|os|child_process|url|module)$/.test(t)) bad.push(`${f.slice(f.indexOf('src/'))} -> ${t}`);
      else if (t.startsWith('.')) walk(resolve(dirname(f), t));
      else bad.push(`${f.slice(f.indexOf('src/'))} -> ${t} (a package)`);
    }
  };
  walk(entry);
  assert.deepEqual(bad, []);
  assert.ok(seen.size > 5);
});

test('the program entry compiles, runs, shows a screen, and writes every target', async () => {
  const P = await import('@skillstech/thunderlang/program');
  const r = P.compileCore('say "hi"\n', { file: 'main.thunder' });
  assert.equal(r.ok, true);
  assert.equal(P.runInProcess({ entry: r, cwd: '.' }).stdout, 'hi\n');
  for (const to of ['toPython', 'toTypeScript', 'toCSharp', 'toJava', 'toRust']) assert.match(P[to](r.program, r.info, { source: 'main.thunder' }), /hi/);
  const go = P.toGo(r.program, r.info, { source: 'main.thunder', module: 'main', ns: P.goNamespaces([{ ...r, module: 'main', kind: 'src' }]).get('main') });
  assert.match(go, /hi/);
  const s = P.compileCore('Screen Home:\n  Show a heading: "Hello"\n', { file: 'main.thunder' });
  assert.equal(s.ok, true, P.diagnosticsText(s));
  assert.equal(P.hasScreens(s.info), true);
  assert.match(P.toReact(s.program, s.info, { source: 'main.thunder' }), /Hello/);
  assert.match(P.screenOutline(P.screenApp({ entry: s }).render()), /Hello/);
});
