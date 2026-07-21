#!/usr/bin/env node
// Dogfood gate: `thunder prove` over every example mission.
//
// Runs the real CLI (`thunder prove --json`) on each top-level examples/*.thunder,
// the same set the /proof page renders, and fails if any mission has a FAILED
// claim (a guarantee/never whose named in-file test fails), a failing in-file
// test, or a semantic error. Declared and needs-verification claims PASS: they
// are honest states the proof matrix reports, not failures.
//
// Exit codes: 0 all missions prove clean; 1 at least one mission failed.
// `--json` mode prints the proof to stdout instead of writing a
// .thunder-proof.json next to the source, so this gate leaves no artifacts.

import { readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const CLI = join(REPO, 'compiler', 'src', 'cli.mjs');
const EXAMPLES = join(REPO, 'examples');

if (!existsSync(CLI)) {
  console.error(`intent-prove: compiler CLI not found at ${relative(process.cwd(), CLI)}`);
  process.exit(2);
}

const files = readdirSync(EXAMPLES)
  .filter((f) => f.endsWith('.thunder'))
  .sort()
  .map((f) => join(EXAMPLES, f));

if (files.length === 0) {
  console.error('intent-prove: no examples/*.thunder files found.');
  process.exit(2);
}

console.log(`intent-prove: proving ${files.length} example mission(s)\n`);

let failed = 0;
const totals = { verified: 0, planned: 0, needsVerification: 0, failedClaims: 0, testsPassed: 0, testsTotal: 0 };

for (const file of files) {
  const rel = relative(REPO, file);
  const res = spawnSync('node', [CLI, 'prove', file, '--json'], { encoding: 'utf8' });
  let summary = '';
  try {
    const proof = JSON.parse(res.stdout);
    const claims = [...(proof.guarantees || []), ...(proof.neverRules || [])];
    const count = (s) => claims.filter((c) => c.status === s).length;
    const v = count('verified');
    const p = count('planned');
    const n = count('needs_verification');
    const f = count('failed');
    totals.verified += v; totals.planned += p; totals.needsVerification += n; totals.failedClaims += f;
    totals.testsPassed += proof.tests?.passed || 0; totals.testsTotal += proof.tests?.total || 0;
    const tests = proof.tests?.total ? `tests ${proof.tests.passed}/${proof.tests.total}` : 'tests none';
    summary = `claims: ${v} verified, ${p} declared, ${n} need verification${f ? `, ${f} FAILED` : ''} · ${tests}`;
  } catch {
    summary = (res.stderr || res.stdout || 'no output').trim().split('\n')[0];
  }
  if (res.status !== 0) {
    failed++;
    console.log(`  FAIL ${rel}`);
    console.log(`       ${summary}`);
  } else {
    console.log(`  ok   ${rel}  (${summary})`);
  }
}

console.log('');
console.log(
  `intent-prove: ${files.length - failed}/${files.length} missions prove clean · ` +
  `${totals.verified} verified, ${totals.planned} declared, ${totals.needsVerification} need verification, ` +
  `${totals.failedClaims} failed claims · tests ${totals.testsPassed}/${totals.testsTotal}`,
);
process.exit(failed > 0 ? 1 : 0);
