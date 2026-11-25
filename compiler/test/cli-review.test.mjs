// thunder review <base> [head]: end to end on two commits of a temporary git repository (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'src', 'cli.mjs');
const ADMIN = readFileSync(join(HERE, 'fixtures', 'handlers', 'admin-cron.ts'), 'utf8');
const ADMIN_OPEN = ADMIN.replace(/  if \(req\.headers[\s\S]*?\n  \}\n/, '');
const FEE = (n) => `def late_fee(days_late: int) -> str:\n    if days_late <= 0:\n        return "NoFee"\n    if days_late <= ${n}:\n        return "SmallFee"\n    return "BigFee"\n`;

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'tl-review-'));
  const git = (...a) => { const r = spawnSync('git', a, { cwd: dir, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  mkdirSync(join(dir, 'app'));
  writeFileSync(join(dir, 'app', 'server.ts'), ADMIN_OPEN);
  writeFileSync(join(dir, 'app', 'fees.py'), FEE(7));
  writeFileSync(join(dir, 'README.md'), 'v1\n');
  git('add', '-A'); git('commit', '-qm', 'one');
  writeFileSync(join(dir, 'app', 'server.ts'), ADMIN);
  writeFileSync(join(dir, 'app', 'fees.py'), FEE(10));
  writeFileSync(join(dir, 'README.md'), 'v2\n');
  git('add', '-A'); git('commit', '-qm', 'two');
  return { dir, git };
}
const run = (dir, ...a) => spawnSync(process.execPath, [CLI, 'review', ...a], { cwd: dir, encoding: 'utf8' });

test('thunder review base head: Markdown for a pull request comment, summary first', () => {
  const { dir } = repo();
  const r = run(dir, 'HEAD~1', 'HEAD');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.startsWith('<!-- thunder-review -->'));
  assert.match(r.stdout, /\*\*3 changes in meaning, 0 risks, 0 form-only\.\*\*/);
  assert.match(r.stdout, /`app\/server\.ts:4`: Now stops with 403 Forbidden \("forbidden"\) when the x-admin-secret header is not the ADMIN_SECRET setting\./);
  assert.match(r.stdout, /Late fee: the limit between Small fee and Big fee moved from 7 to 10 days late/);
  assert.match(r.stdout, /Also changed, not read by Thunder: `README\.md`\./);
});

test('thunder review --json, a moved file, and the working tree as the new side', () => {
  const { dir, git } = repo();
  const j = JSON.parse(run(dir, 'HEAD~1', 'HEAD', '--json').stdout);
  assert.equal(j.schema, 'thunder-review-v1');
  assert.equal(j.base, 'HEAD~1');
  assert.ok(j.items.some((x) => x.kind === 'stop-added' && x.where.file === 'app/server.ts'));
  // Uncommitted: fees.py moved to billing/ (git sees a rename); head omitted reviews the working tree.
  mkdirSync(join(dir, 'billing'));
  git('mv', 'app/fees.py', 'billing/fees.py');
  const w = JSON.parse(run(dir, 'HEAD', '--json').stdout);
  assert.equal(w.head, 'working tree');
  assert.deepEqual(w.items.map((x) => `${x.severity}:${x.kind}`), ['form:moved']);
  assert.match(w.items[0].says, /^Moved from app\/fees\.py to billing\/fees\.py\. Only the form changed/);
  // --out writes the comment to a file.
  const o = run(dir, 'HEAD~1', 'HEAD', '--out', 'review.md');
  assert.equal(o.status, 0, o.stderr);
  assert.match(readFileSync(join(dir, 'review.md'), 'utf8'), /^<!-- thunder-review -->/);
});

test('thunder review explains a missing ref instead of failing quietly', () => {
  const { dir } = repo();
  const r = run(dir, 'no-such-ref');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no-such-ref is not a commit in this repository/);
  assert.equal(run(mkdtempSync(join(tmpdir(), 'tl-review-nogit-')), 'HEAD').status, 2);
});

test('thunder review --base --head --format json|markdown, and --paths keeps only matching files', () => {
  const { dir } = repo();
  const j = JSON.parse(run(dir, '--base', 'HEAD~1', '--head', 'HEAD', '--format', 'json').stdout);
  assert.equal(j.schema, 'thunder-review-v1');
  assert.equal(j.head, 'HEAD');
  const md = run(dir, '--base', 'HEAD~1', '--head', 'HEAD', '--format', 'markdown');
  assert.equal(md.status, 0, md.stderr);
  assert.ok(md.stdout.startsWith('<!-- thunder-review -->'));
  const only = JSON.parse(run(dir, '--base', 'HEAD~1', '--head', 'HEAD', '--format', 'json', '--paths', 'app/*.py').stdout);
  assert.deepEqual([...new Set(only.items.map((x) => x.where.file))], ['app/fees.py']);
  assert.deepEqual(only.notRead, []);
  const bad = run(dir, '--base', 'HEAD~1', '--format', 'html');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--format html is not one of markdown, json/);
});
