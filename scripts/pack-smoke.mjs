#!/usr/bin/env node
// Pre-publish tarball smoke test. Packs @skillstech/intentlang, installs the tarball into a
// throwaway temp dir, and exercises the ACTUAL installed package , the main entry, the
// browser-safe /core subpath, and the `intent` CLI bin. This catches the class of bug that
// never shows in-repo: a file missing from the `files` allowlist, a broken `exports` map, an
// unresolvable subpath, or a bin that will not launch. Exits non-zero on any failure.
//
// Usage: node scripts/pack-smoke.mjs   (or: npm run pack:smoke)

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, '..', 'compiler');
const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: 'utf8' });
const die = (msg, extra) => { console.error(`pack:smoke FAILED , ${msg}`); if (extra) console.error(extra); process.exit(1); };

const tmp = mkdtempSync(join(tmpdir(), 'il-packsmoke-'));
let ok = false;
try {
  // 1. pack
  const packed = run('npm', ['pack', '--pack-destination', tmp], COMPILER);
  if (packed.status !== 0) die('npm pack failed', packed.stderr);
  const tgz = readdirSync(tmp).find((f) => f.endsWith('.tgz'));
  if (!tgz) die('no tarball produced');

  // 2. install into a clean project
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'il-packsmoke', version: '1.0.0', private: true, type: 'module' }));
  const inst = run('npm', ['install', `./${tgz}`, '--no-audit', '--no-fund'], tmp);
  if (inst.status !== 0) die('npm install of the tarball failed', inst.stderr);
  if (!existsSync(join(tmp, 'node_modules', '@skillstech', 'intentlang'))) die('package did not install into node_modules');

  // 3. smoke the MAIN entry + the /core subpath from the installed package
  const smoke = `
    import { parseIntent, buildIntentGraph, evaluateDecision, toOpenAPI, migrateGraph, graphToSource, importReport } from '@skillstech/intentlang';
    import { NODE_TYPES, classify, evalExpr, buildAtlas, buildFocusGraph, intentBrief, scanProject, sha256 } from '@skillstech/intentlang/core';
    const ast = parseIntent('mission M\\ndecision D\\n  inputs\\n    age\\n  rule a\\n    when age >= 18\\n    return Y\\n  default\\n    return N\\n');
    const asrt = (c, m) => { if (!c) { console.error('assert failed: ' + m); process.exit(3); } };
    asrt(ast.mission === 'M', 'parseIntent');
    asrt(buildIntentGraph(ast).nodes.length >= 3, 'buildIntentGraph');
    asrt(evaluateDecision(ast.decisions[0], { age: 20 }).result === 'Y', 'evaluateDecision');
    asrt(toOpenAPI(ast).openapi === '3.1.0', 'toOpenAPI');
    asrt(migrateGraph({ nodes: [{ id: 'm', type: 'Mission', title: 'X' }], relationships: [] }).to.startsWith('intent-graph-'), 'migrateGraph');
    asrt(typeof graphToSource === 'function' && typeof importReport === 'function', 'graph/import exports');
    asrt(Array.isArray(NODE_TYPES) && NODE_TYPES.length >= 39, '/core NODE_TYPES');
    asrt(typeof classify === 'function' && evalExpr('age >= 18', { age: 20 }) === true, '/core runtime');
    // the universal compiler surface: parse -> graph -> atlas -> focus, all from /core, no Node APIs
    const atlas = buildAtlas([buildIntentGraph(ast)]);
    const focus = buildFocusGraph(atlas, { seeds: [atlas.missions[0].id], depth: 2 });
    asrt(intentBrief(focus).what === 'M', '/core focus graph');
    asrt(scanProject([{ file: 'M.intent', source: 'mission M\\ngoal\\n  x\\n' }]).schema === 'intent-scan-v1', '/core scanProject');
    asrt(sha256('abc') === 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', '/core sha256');
    console.log('api-ok');
  `;
  const apiRes = run(process.execPath, ['--input-type=module', '-e', smoke], tmp);
  if (apiRes.status !== 0 || !apiRes.stdout.includes('api-ok')) die('installed-package API smoke failed', (apiRes.stdout || '') + (apiRes.stderr || ''));

  // 3b. TYPES: prove a TypeScript consumer resolves types through the exports map for BOTH
  // entries , this is what OpenThunder / Repo Mastery / SkillsTech (all TS) rely on.
  const tsc = join(HERE, '..', 'node_modules', '.bin', 'tsc');
  if (existsSync(tsc)) {
    writeFileSync(join(tmp, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { module: 'esnext', moduleResolution: 'bundler', strict: true, noEmit: true, skipLibCheck: true, types: [] },
      files: ['consumer.ts'],
    }));
    writeFileSync(join(tmp, 'consumer.ts'), `
      import { parseIntent, buildIntentGraph } from '@skillstech/intentlang';
      import { buildAtlas, buildFocusGraph, intentBrief, scanProject, sha256 } from '@skillstech/intentlang/core';
      import type { FocusGraph, IntentBrief, IntentScope, ScanResult, IntentAtlas } from '@skillstech/intentlang/core';
      const ast = parseIntent('mission M\\ngoal\\n  x\\n');
      const atlas: IntentAtlas = buildAtlas([buildIntentGraph(ast)]);
      const focus: FocusGraph = buildFocusGraph(atlas, { seeds: [atlas.missions[0].id], depth: 2 });
      const brief: IntentBrief = intentBrief(focus);
      const scope: IntentScope = focus.scope;
      const scan: ScanResult = scanProject([{ file: 'M.intent', source: 'mission M\\n' }]);
      // exercise typed fields so a wrong type would fail the build
      const summary: string = \`\${brief.what ?? '?'} \${scope.type} \${scan.ok} \${focus.overview.nodes} \${sha256('x')}\`;
      if (!summary) throw new Error('unreachable');
    `);
    const tcheck = run(tsc, ['-p', join(tmp, 'tsconfig.json')], tmp);
    if (tcheck.status !== 0) die('TypeScript consumer failed to resolve /core types', (tcheck.stdout || '') + (tcheck.stderr || ''));
  } else {
    console.warn('pack:smoke , skipped the TS types check (tsc not found; run npm install at the repo root)');
  }

  // 4. smoke the CLI bin from the installed package
  const bin = join(tmp, 'node_modules', '@skillstech', 'intentlang', 'src', 'cli.mjs');
  writeFileSync(join(tmp, 'smoke.intent'), 'mission S\ndecision D\n  inputs\n    age\n  rule ok\n    when age >= 18\n    return Yes\n  default\n    return No\ntest D\n  case adult\n    given age 20\n    expect Yes\n');
  const runRes = run(process.execPath, [bin, 'run', join(tmp, 'smoke.intent'), '--inputs', '{"age":20}'], tmp);
  if (runRes.status !== 0 || !runRes.stdout.includes('Yes')) die('CLI `intent run` failed', (runRes.stdout || '') + (runRes.stderr || ''));
  const testRes = run(process.execPath, [bin, 'test', join(tmp, 'smoke.intent')], tmp);
  if (testRes.status !== 0 || !testRes.stdout.includes('1/1 passed')) die('CLI `intent test` failed', (testRes.stdout || '') + (testRes.stderr || ''));

  ok = true;
  console.log(`pack:smoke OK , tarball ${tgz} installs clean; main API, /core subpath, and the intent CLI all work from the installed package.`);
} finally {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
}
process.exit(ok ? 0 : 1);
