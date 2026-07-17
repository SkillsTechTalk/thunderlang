#!/usr/bin/env node
// Batch `thunder check` for CI and local use.
//
// Finds every .thunder file under the given paths (default: the whole repo) and
// runs the real `thunder check` CLI on each, so CI validates exactly what a
// developer sees locally. Exits 1 if any file has errors, 0 otherwise.
//
// Usage:
//   node scripts/intent-check.mjs                 # check every .thunder in the repo
//   node scripts/intent-check.mjs examples docs   # check only these paths
//
// No dependencies beyond Node (>=18). This file is also a copy-paste reference
// for gating .thunder files in any repo's CI.

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const CLI = join(REPO, 'compiler', 'src', 'cli.mjs');
// '.thunder' is the compiler's default output directory (generated drafts/artifacts),
// not authored source, so it is skipped. Authored intents (Foo.thunder) live elsewhere.
const SKIP = new Set(['node_modules', '.git', '.next', '.vercel', 'dist', 'build', 'coverage', '.thunder']);

function findIntents(root, acc = []) {
  let entries;
  try { entries = readdirSync(root); } catch { return acc; }
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    const full = join(root, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) findIntents(full, acc);
    else if (/\.(thunder|tl|intent)$/.test(name)) acc.push(full);
  }
  return acc;
}

const roots = (process.argv.slice(2).length ? process.argv.slice(2) : [REPO]).map((p) => resolve(process.cwd(), p));

if (!existsSync(CLI)) {
  console.error(`intent-check: compiler CLI not found at ${relative(process.cwd(), CLI)}`);
  process.exit(2);
}

const files = [...new Set(roots.flatMap((r) => (statSync(r).isDirectory() ? findIntents(r) : [r])))].sort();

if (files.length === 0) {
  console.log('intent-check: no .thunder files found. Nothing to check.');
  process.exit(0);
}

console.log(`intent-check: checking ${files.length} .thunder file(s)\n`);

let failed = 0;
for (const file of files) {
  const res = spawnSync('node', [CLI, 'check', file], { encoding: 'utf8' });
  const rel = relative(process.cwd(), file);
  process.stdout.write(res.stdout || '');
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.status !== 0) {
    failed++;
    console.log(`  FAIL ${rel}\n`);
  } else {
    console.log(`  ok   ${rel}\n`);
  }
}

console.log(`intent-check: ${files.length - failed}/${files.length} passed`);
process.exit(failed > 0 ? 1 : 0);
