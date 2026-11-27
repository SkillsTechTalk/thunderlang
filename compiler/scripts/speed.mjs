#!/usr/bin/env node
// How fast is Thunder? Times everyday commands and prints a table. Part of the 2.0 gate (ROADMAP-2.0.md).
//
//   node compiler/scripts/speed.mjs              every command, 7 runs each
//   node compiler/scripts/speed.mjs --runs 15    more runs
//   node compiler/scripts/speed.mjs --json       machine-readable
//
// (scripts/perf.mjs measures something else: reading a whole repository, stage by stage.)
//
// For each command: the best and the median wall time, and the best CPU time (user + system, from the operating
// system's own count, via /usr/bin/time where it exists). CPU time is the number to compare between changes: a busy
// machine makes wall time noisy, but it hardly changes how much work a command does. Node's own start (node -e 0)
// is measured too, so Thunder's share is plain.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const CLI = join(HERE, '..', 'src', 'cli.mjs');
const args = process.argv.slice(2);
const RUNS = Number(args[args.indexOf('--runs') + 1]) || 7;
const JSON_OUT = args.includes('--json');
const TIME = existsSync('/usr/bin/time') ? '/usr/bin/time' : null;

const dir = mkdtempSync(join(tmpdir(), 'thunder-perf-'));
copyFileSync(join(ROOT, 'examples', 'BillingService.thunder'), join(dir, 'BillingService.thunder'));
copyFileSync(join(ROOT, 'examples', 'core', 'hello.thunder'), join(dir, 'hello.thunder'));
copyFileSync(join(ROOT, 'examples', 'core', 'trading-journal.thunder'), join(dir, 'trading-journal.thunder'));
writeFileSync(join(dir, 'discount.py'), 'def calculate_discount(total, member):\n    if member and total >= 100:\n        return total * 0.2\n    return 0\n');
// A large file, to see how reading grows: 600 route groups of Go (about 4,300 lines).
writeFileSync(join(dir, 'web.go'), `package web\n\nfunc registerRoutes(m *web.Router) {\n${Array.from({ length: 600 }, (_, g) => `\tm.Group("/g${g}", func() {\n${Array.from({ length: 6 }, (_, k) => `\t\tm.Get("/r${k}", reqSignIn, repo.H${k})`).join('\n')}\n\t})`).join('\n')}\n}\n`);

const node = process.execPath;
const COMMANDS = [
  ['Node itself (node -e 0)', [node, '-e', '0']],
  ['thunder --version', [node, CLI, '--version']],
  ['thunder check (a mission)', [node, CLI, 'check', 'BillingService.thunder']],
  ['thunder run (Core, Thunder engine)', [node, CLI, 'run', 'hello.thunder', '--core', '--engine', 'thunder']],
  ['thunder test (Core, Thunder engine)', [node, CLI, 'test', 'trading-journal.thunder', '--core', '--engine', 'thunder']],
  ['thunder read (Python, 4 lines)', [node, CLI, 'read', 'discount.py']],
  ['thunder read (Go, 4,300 lines)', [node, CLI, 'read', 'web.go']],
];

function once(cmd) {
  const t0 = performance.now();
  const r = TIME ? spawnSync(TIME, ['-p', ...cmd], { cwd: dir, encoding: 'utf8' }) : spawnSync(cmd[0], cmd.slice(1), { cwd: dir, encoding: 'utf8' });
  const wall = performance.now() - t0;
  let cpu = null;
  if (TIME) {
    const m = (k) => Number((new RegExp(`^${k}\\s+([\\d.]+)`, 'm').exec(r.stderr) ?? [])[1] ?? NaN);
    cpu = (m('user') + m('sys')) * 1000;
  }
  return { wall, cpu, ok: r.status === 0 };
}

const results = [];
for (const [label, cmd] of COMMANDS) {
  once(cmd); // warm up (and fill Node's compile cache where it exists)
  const runs = Array.from({ length: RUNS }, () => once(cmd));
  const walls = runs.map((r) => r.wall).sort((a, b) => a - b);
  const cpus = runs.map((r) => r.cpu).filter((x) => x != null && !Number.isNaN(x)).sort((a, b) => a - b);
  results.push({ label, ok: runs.every((r) => r.ok), bestMs: Math.round(walls[0]), medianMs: Math.round(walls[Math.floor(walls.length / 2)]), cpuMs: cpus.length ? Math.round(cpus[0]) : null });
}
rmSync(dir, { recursive: true, force: true });

if (JSON_OUT) console.log(JSON.stringify({ node: process.versions.node, runs: RUNS, results }, null, 2));
else {
  console.log(`Thunder speed on Node ${process.versions.node} (${RUNS} runs each; CPU time is the number to compare)\n`);
  console.log(`${'command'.padEnd(38)} ${'best'.padStart(7)} ${'median'.padStart(7)} ${'CPU'.padStart(7)}`);
  for (const r of results) console.log(`${r.label.padEnd(38)} ${`${r.bestMs} ms`.padStart(7)} ${`${r.medianMs} ms`.padStart(7)} ${(r.cpuMs == null ? 'n/a' : `${r.cpuMs} ms`).padStart(7)}${r.ok ? '' : '  (failed)'}`);
}
