// Thunder Trace: links between repositories, and what a change can affect (src/trace.mjs, docs/trace.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildTrace, traceImpactOf, renderTrace, renderImpact } from '../src/trace.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'src', 'cli.mjs');
const FIX = join(HERE, 'fixtures', 'trace');

/** A fixture folder as an in-memory repository (no git, so the citation says working-tree). */
function repoOf(name, extra = {}) {
  const files = [];
  const walk = (dir, rel = '') => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walk(p, `${rel}${e.name}/`); else files.push({ path: `${rel}${e.name}`, source: readFileSync(p, 'utf8') }); } };
  walk(join(FIX, name));
  return { name, files, sha: extra.sha ?? null, ...extra };
}
const mem = (name, files, sha = null) => ({ name, sha, files: Object.entries(files).map(([path, source]) => ({ path, source })) });

test('a request whose base address is set when it runs is linked by its path; an event is linked by its name', () => {
  const t = buildTrace([repoOf('orders', { sha: 'abc1234def' }), repoOf('web'), repoOf('billing')]);
  const says = t.links.map((l) => l.kind === 'http' ? `${l.from.repo}->${l.to.repo} ${l.method} ${l.path} = ${l.route} (${l.base})` : `${l.from.repo}->${l.to.repo} event ${l.event}`);
  assert.deepEqual(says.sort(), [
    'orders->billing event order.placed',
    'web->orders GET /api/orders/:value = GET /api/orders/:id (computed)',
    'web->orders POST /api/orders = POST /api/orders (computed)',
  ]);
  const post = t.links.find((l) => l.method === 'POST');
  assert.equal(post.from.cite, 'web@working-tree:src/api.ts:4');
  assert.equal(post.to.cite, 'orders@abc1234:src/server.ts:6');
});

test('/health is never linked across repositories: every service has it', () => {
  const t = buildTrace([repoOf('orders'), repoOf('web')]);
  const n = t.notLinked.find((x) => x.call === 'GET /health');
  assert.match(n.why, /every service has \/health/);
  assert.ok(!t.links.some((l) => l.path === '/health'));
});

test('the same repositories give the same trace and fingerprint, in any order', () => {
  const a = buildTrace([repoOf('orders'), repoOf('web'), repoOf('billing')]);
  const b = buildTrace([repoOf('orders'), repoOf('web'), repoOf('billing')]);
  assert.equal(a.fingerprint, b.fingerprint);
  assert.match(a.fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(a.links, buildTrace([repoOf('billing'), repoOf('web'), repoOf('orders')]).links);
});

test('two routes that match equally are both named, and neither is chosen', () => {
  const route = "import express from 'express';\nconst app = express();\napp.post('/api/pay', async (req, res) => {\n  res.json({ ok: true });\n});\n";
  const t = buildTrace([
    mem('shop', { 'src/pay.ts': "export async function pay() {\n  return fetch(`${process.env.PAY}/api/pay`, { method: 'POST' });\n}\n" }),
    mem('payments-v1', { 'src/app.ts': route }),
    mem('payments-v2', { 'src/app.ts': route }),
  ]);
  assert.equal(t.links.length, 0);
  assert.match(t.notLinked[0].why, /2 routes match equally \(payments-v1: POST \/api\/pay; payments-v2: POST \/api\/pay\), so none is chosen/);
});

test('a request the repository answers itself is not a link between repositories', () => {
  const t = buildTrace([
    mem('app', {
      'src/server.ts': "import express from 'express';\nconst app = express();\napp.get('/api/items', async (req, res) => {\n  res.json([]);\n});\n",
      'src/client.ts': "export async function items() {\n  return fetch('/api/items');\n}\n",
    }),
    mem('other', { 'src/server.ts': "import express from 'express';\nconst app = express();\napp.get('/api/items', async (req, res) => {\n  res.json([1]);\n});\n" }),
  ]);
  assert.equal(t.links.length, 0);
  assert.equal(t.notLinked.length, 0);
});

test('impact stops at the first hop: the callers of a changed route, not the callers of those callers', () => {
  const t = buildTrace([
    mem('web', { 'src/api.ts': "export async function checkout() {\n  return fetch(`${process.env.ORDERS}/api/orders`, { method: 'POST' });\n}\n" }),
    mem('orders', { 'src/server.ts': "import express from 'express';\nconst app = express();\napp.post('/api/orders', async (req, res) => {\n  const r = await fetch(`${process.env.PAY}/api/charges`, { method: 'POST' });\n  res.json(await r.json());\n});\n" }),
    mem('payments', { 'src/server.ts': "import express from 'express';\nconst app = express();\napp.post('/api/charges', async (req, res) => {\n  res.json({ charged: true });\n});\n" }),
  ]);
  assert.equal(t.links.length, 2);
  const r = traceImpactOf(t, 'POST /api/charges');
  assert.deepEqual(r.findings.map((f) => [f.risk, f.kind, f.dependents.map((d) => d.repo)]), [['high', 'route-changed', ['orders']]]);
  assert.equal(r.stopsAt, 1);
});

test('asking about an event gives that event only; an unknown name says it matched nothing', () => {
  const t = buildTrace([repoOf('orders'), repoOf('web'), repoOf('billing')]);
  const r = traceImpactOf(t, 'order.placed');
  assert.deepEqual(r.findings.map((f) => [f.risk, f.kind]), [['high', 'event-published'], ['low', 'listener-changed']]);
  const none = traceImpactOf(t, 'no.such.thing');
  assert.deepEqual(none.matched, []);
  assert.match(renderImpact(none), /^"no\.such\.thing" matched nothing/);
  assert.match(renderTrace(t), /3 repositories, 3 links between them/);
});

// ── --diff, with real git repositories ──

const gitOk = spawnSync('git', ['--version']).status === 0;
function gitRepo(root, name, files) {
  const dir = join(root, name);
  for (const [p, src] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), src); }
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  g('init', '-q', '-b', 'main'); g('add', '.'); g('commit', '-q', '-m', 'start');
  return dir;
}

test('impact --diff: a changed route lists its callers, and a removed route lists who still sends it', { skip: !gitOk && 'git is not installed' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'thunder-trace-'));
  try {
    const server = (body) => `import express from 'express';\nconst app = express();\n${body}`;
    const orders = gitRepo(root, 'orders', { 'src/server.ts': server("app.post('/api/orders', async (req, res) => {\n  res.json({ ok: true });\n});\n\napp.get('/api/orders/:id', async (req, res) => {\n  res.json({ id: req.params.id });\n});\n") });
    const web = gitRepo(root, 'web', { 'src/api.ts': "export async function place() {\n  return fetch(`${process.env.API}/api/orders`, { method: 'POST' });\n}\n\nexport async function load(id) {\n  return fetch(`${process.env.API}/api/orders/${id}`);\n}\n" });
    // Change the POST handler and remove the GET route, without committing.
    writeFileSync(join(orders, 'src/server.ts'), server("app.post('/api/orders', async (req, res) => {\n  res.status(201).json({ ok: true, created: true });\n});\n"));
    const r = spawnSync(process.execPath, [CLI, 'trace', 'impact', '--diff', orders, web, '--json'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    const got = out.findings.map((f) => [f.risk, f.kind, f.says, f.dependents.map((d) => d.cite.replace(/@[0-9a-f]{7}/, '@sha'))]);
    assert.deepEqual(got, [
      ['high', 'route-changed', 'POST /api/orders changed, and 1 caller in other repositories depends on it', ['web@sha:src/api.ts:2']],
      ['high', 'route-removed', 'GET /api/orders/:id was removed, but 1 caller in other repositories still sends it', ['web@sha:src/api.ts:6']],
    ]);
    assert.match(out.findings[1].at.cite, /^orders@[0-9a-f]{7}\+changes:src\/server\.ts:7 \(before the change\)$/);
    const text = spawnSync(process.execPath, [CLI, 'trace', 'impact', '--diff', orders, web], { encoding: 'utf8' }).stdout;
    assert.match(text, /^1 changed file across 1 of 2 repositories\./);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('thunder trace explains its usage when no folder is given', () => {
  const r = spawnSync(process.execPath, [CLI, 'trace'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /give at least one repository folder/);
});

test('across languages: a TypeScript client is linked to a C# controller route, whatever the case of the path', () => {
  const t = buildTrace([
    mem('web', { 'src/orders.ts': "export async function cancel(id: string) {\n  return fetch(`${process.env.ORDERS}/api/orders/${id}/cancel`, { method: 'POST' });\n}\n" }),
    mem('orders-api', { 'Controllers/OrdersController.cs': '[ApiController]\n[Route("api/[controller]")]\npublic class OrdersController : ControllerBase {\n  [HttpPost("{id}/cancel")]\n  public IActionResult Cancel(int id) { return Ok(); }\n}\n' }),
  ]);
  assert.deepEqual(t.links.map((l) => `${l.from.repo} ${l.method} ${l.path} -> ${l.to.repo} ${l.route}`), ['web POST /api/orders/:value/cancel -> orders-api POST /api/Orders/{id}/cancel']);
});

test('routes and requests in test files are never links, and are counted as left out', () => {
  const t = buildTrace([
    mem('a', { 'test/api.test.ts': "export async function pay() {\n  return fetch(`${process.env.B}/api/pay`, { method: 'POST' });\n}\n" }),
    mem('b', { 'src/app.ts': "import express from 'express';\nconst app = express();\napp.post('/api/pay', async (req, res) => {\n  res.json({ ok: true });\n});\n" }),
  ]);
  assert.equal(t.links.length, 0);
  assert.equal(t.repos[0].testItems, 1);
  assert.match(renderTrace(t), /Left out: 1 route, request, or event in test and fixture files\./);
});
