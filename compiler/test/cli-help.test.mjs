import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const help = () => spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });

// Every command the CLI supported before the grouped-help refactor. The help text
// must keep listing all of them: grouping is a presentation change, never a removal.
const COMMANDS = [
  // Author
  'new', 'init', 'mission', 'draft', 'edit', 'fmt', 'source',
  // Inspect
  'check', 'report', 'risks', 'gaps', 'unverified', 'coverage', 'unknowns', 'contradictions',
  'focus', 'comprehension', 'twelve-factor', 'explain', 'rules', 'notes', 'docs', 'index', 'atlas',
  // Run & test
  'run', 'test', 'simulate', 'outcomes', 'style', 'gen', 'build',
  // Prove & verify intent
  'prove', 'proof', 'verify', 'conform',
  // Real code vs intent (drift)
  'lift', 'drift', 'approve', 'verify-diff', 'changes', 'guardian', 'impact',
  'diff', 'merge', 'handoff', 'ledger', 'guard',
  // Graph & IR
  'graph', 'migrate', 'validate', 'schema',
  // Interop
  'export', 'import',
  // Fix
  'scan', 'code-actions', 'apply-fix',
  // Servers
  'lsp', 'mcp',
];

test('thunder --help exits 0 and lists every pre-existing command', () => {
  const res = help();
  assert.equal(res.status, 0, res.stderr);
  for (const cmd of COMMANDS) {
    // A command counts as listed when it starts a help line (two-space indent),
    // follows a "|" in a compound listing (risks | gaps | ...), or is named as an alias.
    const esc = cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const listed = new RegExp(`(^  |\\| |\\[alias: )${esc}\\b`, 'm');
    assert.match(res.stdout, listed, `help must list the "${cmd}" command`);
  }
});

test('thunder --help lists the documented aliases next to their canonical commands', () => {
  const { stdout } = help();
  assert.match(stdout, /^  new \[Name\].*\[alias: init\]$/m);
  assert.match(stdout, /^  twelve-factor .*\[alias: 12factor\]$/m);
});

test('thunder --help opens with the mental-model line and stays grouped', () => {
  const { stdout } = help();
  assert.match(stdout, /The flow: author intent, inspect it, run and prove it/);
  for (const heading of [
    'Author', 'Inspect', 'Run & test', 'Prove & verify intent',
    'Real code vs intent (drift)', 'Graph & IR', 'Interop', 'Fix', 'Servers',
  ]) {
    assert.ok(stdout.includes(`\n${heading}\n`), `help must keep the "${heading}" group`);
  }
});
