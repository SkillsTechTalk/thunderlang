// Thunder Trace, the data side: packages, settings, and tables across repositories (src/trace-data.mjs, docs/trace.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildTrace, traceImpact, traceImpactOf, renderTrace, renderImpact } from '../src/trace.mjs';
import { packagesIn, settingsIn, tablesIn } from '../src/trace-data.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const mem = (name, files, sha = null) => ({ name, sha, files: Object.entries(files).map(([path, source]) => ({ path, source })) });
const json = (o) => `${JSON.stringify(o, null, 2)}\n`;

// The estate the tests trace: orders owns the database and publishes a client package; billing reads orders' tables
// and uses the client; web uses the client at an older version.
const ORDERS = {
  'db/migrations/001_orders.sql': '-- the orders schema\nCREATE TABLE orders (\n  id serial PRIMARY KEY,\n  total numeric NOT NULL\n);\n\nCREATE TABLE IF NOT EXISTS order_lines (\n  order_id int REFERENCES orders(id),\n  sku text\n);\n',
  'client/package.json': json({ name: '@acme/orders-client', version: '2.0.0', dependencies: { zod: '^3.22.0' } }),
  'client/index.ts': "export async function getOrder(id: string) {\n  return fetch(`${process.env.ORDERS_URL}/api/orders/${id}`);\n}\n",
  'src/db.ts': "export async function save(db, total) {\n  return db.query('INSERT INTO orders (total) VALUES ($1)', [total]);\n}\n",
};
const BILLING = {
  'package.json': json({ name: 'billing', dependencies: { '@acme/orders-client': '^2.0.0', zod: '^3.23.0' } }),
  'app/report.py': 'import os\n\ndef unpaid(cur):\n    url = os.environ["ORDERS_URL"]\n    cur.execute("SELECT o.id, o.total FROM orders o JOIN order_lines l ON l.order_id = o.id")\n    return cur.fetchall()\n',
  'app/settings.py': 'import os\nPORT = os.getenv("PORT", "8000")\n',
};
const WEB = {
  'package.json': json({ name: 'web', dependencies: { '@acme/orders-client': '^1.4.0', zod: '^3.22.0' }, devDependencies: { '@acme/shared': 'workspace:*' } }),
  'src/config.ts': 'export const ordersUrl = process.env.ORDERS_URL;\nexport const port = process.env.PORT;\n',
};
const estate = () => buildTrace([mem('orders', ORDERS, 'a1b2c3d4e5'), mem('billing', BILLING), mem('web', WEB)]);

test('a package one repository publishes and another depends on is a link, cited at both manifests', () => {
  const t = estate();
  const pk = t.links.filter((l) => l.kind === 'package').map((l) => `${l.from.repo} -> ${l.to.repo} ${l.package} ${l.version} (${l.from.cite} -> ${l.to.cite})`);
  assert.deepEqual(pk, [
    'billing -> orders @acme/orders-client ^2.0.0 (billing@working-tree:package.json:4 -> orders@a1b2c3d:client/package.json:2)',
    'web -> orders @acme/orders-client ^1.4.0 (web@working-tree:package.json:4 -> orders@a1b2c3d:client/package.json:2)',
  ]);
});

test('different versions of the same package are listed as drift; workspace: and file: versions are left out', () => {
  const t = estate();
  assert.deepEqual(t.shared.drift.map((d) => [d.package, d.versions.map((v) => `${v.version}: ${v.at.map((e) => e.repo).join(',')}`)]), [
    ['@acme/orders-client', ['^1.4.0: web', '^2.0.0: billing']],
    ['zod', ['^3.22.0: orders,web', '^3.23.0: billing']],
  ]);
  assert.ok(!t.shared.drift.some((d) => d.package === '@acme/shared'));
});

test('code that reads a table another repository creates is a data link; REFERENCES inside a table definition is not a use', () => {
  const t = estate();
  const data = t.links.filter((l) => l.kind === 'data').map((l) => `${l.from.repo}:${l.from.label} ${l.access} ${l.table} -> ${l.to.cite}`);
  assert.deepEqual(data, [
    'billing:Unpaid reads orders -> orders@a1b2c3d:db/migrations/001_orders.sql:2',
    'billing:Unpaid reads order_lines -> orders@a1b2c3d:db/migrations/001_orders.sql:7',
  ]);
  // orders' own INSERT is its own table, not a link; order_lines' REFERENCES orders(id) is not a read.
  const ordersTables = t.repos.find((r) => r.name === 'orders').tables.map((x) => `${x.access} ${x.table} ${x.file}:${x.line}`);
  assert.deepEqual(ordersTables, ['creates orders db/migrations/001_orders.sql:2', 'creates order_lines db/migrations/001_orders.sql:7', 'writes orders src/db.ts:2']);
});

test('a setting read in more than one repository is listed; settings every service reads (PORT) are not', () => {
  const t = estate();
  assert.deepEqual(t.shared.settings.map((s) => [s.key, s.readers.map((r) => r.cite)]), [
    ['ORDERS_URL', ['orders@a1b2c3d:client/index.ts:2', 'billing@working-tree:app/report.py:4', 'web@working-tree:src/config.ts:1']],
  ]);
  assert.deepEqual(t.shared.tables.map((x) => [x.table, [...new Set(x.users.map((u) => u.repo))]]), [['order_lines', ['orders', 'billing']], ['orders', ['orders', 'billing']]]);
});

test('the text names the package, table, and setting links, the shared tables and settings, and the drift', () => {
  const text = renderTrace(estate());
  assert.match(text, /billing → orders: depends on the package @acme\/orders-client \^2\.0\.0, published by orders/);
  assert.match(text, /billing → orders: Unpaid reads the orders table, created by orders/);
  assert.match(text, /creates 2 tables and uses 1 table; reads 1 setting; publishes 1 package and depends on 1 package/);
  assert.match(text, /Tables used by more than one repository: 2/);
  assert.match(text, /Settings read by more than one repository: 1 \(a new name or value has to reach each one\)\n {2}ORDERS_URL: orders, billing, web/);
  assert.match(text, /Packages at different versions: 2\n {2}@acme\/orders-client: \^1\.4\.0 in web; \^2\.0\.0 in billing/);
});

test('asking about a table lists the code in other repositories that uses it; a setting and a package too', () => {
  const t = estate();
  const table = traceImpactOf(t, 'table:orders');
  assert.deepEqual(table.matched, ['orders: creates table orders']);
  assert.deepEqual(table.findings.map((f) => [f.risk, f.kind, f.says, f.dependents.map((d) => d.cite)]), [
    ['high', 'table-changed', "the orders table's definition changed, and 1 place in other repositories uses the table", ['billing@working-tree:app/report.py:5']],
  ]);
  // A plain name works when it is no route, event, or file.
  assert.deepEqual(traceImpactOf(t, 'order_lines').findings.map((f) => f.kind), ['table-changed']);
  const setting = traceImpactOf(t, 'setting:ORDERS_URL');
  assert.equal(setting.findings.length, 3);
  assert.ok(setting.findings.every((f) => f.kind === 'setting-changed' && f.risk === 'low'));
  assert.equal(setting.findings.find((f) => f.at.repo === 'orders').says, 'code that reads the setting ORDERS_URL changed; 2 other repositories read it too');
  const pkg = traceImpactOf(t, 'package:@acme/orders-client');
  assert.deepEqual(pkg.findings.map((f) => [f.risk, f.kind, f.says, f.dependents.map((d) => d.how)]), [
    ['medium', 'package-changed', '@acme/orders-client is published from here, and 2 other repositories depend on it; the change reaches them when they take the new version', ['depends on @acme/orders-client ^2.0.0', 'depends on @acme/orders-client ^1.4.0']],
  ]);
  assert.match(renderImpact(traceImpactOf(t, 'setting:NOPE')), /matched nothing: no route, event, file, table, setting, or package/);
});

test('a change inside a published package reaches its dependents once; a change outside its folder does not', () => {
  const t = estate();
  const inside = traceImpact(t, [{ repo: 'orders', file: 'client/index.ts', ranges: [[1, 1]], status: 'changed' }, { repo: 'orders', file: 'client/package.json', ranges: [[3, 3]], status: 'changed' }]);
  assert.deepEqual(inside.findings.map((f) => f.kind), ['package-changed']);
  const outside = traceImpact(t, [{ repo: 'orders', file: 'src/db.ts', ranges: [[1, 1]], status: 'changed' }]);
  assert.ok(!outside.findings.some((f) => f.kind === 'package-changed'));
});

test('a table two repositories both create is not linked to either: both are named', () => {
  const t = buildTrace([
    mem('a', { 'schema.sql': 'CREATE TABLE users (id int);\n' }),
    mem('b', { 'schema.sql': 'CREATE TABLE users (id int);\n' }),
    mem('c', { 'src/q.ts': "export const all = (db) => db.query('SELECT * FROM users');\n" }),
  ]);
  assert.equal(t.links.length, 0);
  assert.match(t.notLinked.find((n) => n.kind === 'data').why, /2 repositories create a table named users \(a, b\), so none is chosen/);
});

test('tables, settings, and packages in test and fixture files are left out', () => {
  const t = buildTrace([
    mem('a', { 'db/schema.sql': 'CREATE TABLE users (id int);\n' }),
    mem('b', { 'test/users.test.ts': "export const q = (db) => db.query(`SELECT * FROM users WHERE id = ${process.env.TEST_ID}`);\n", 'test/fixtures/package.json': json({ name: 'fixture', dependencies: { a: '1.0.0' } }) }),
  ]);
  assert.equal(t.links.length, 0);
  assert.equal(t.repos[1].testItems, 4); // the read, the setting, the fixture's name, and its dependency
});

// ── what is read, and what is not ──

test('SQL in code is read only from strings that start with a SQL verb; a table name built when it runs is not read', () => {
  const files = [{ path: 'src/q.ts', source: [
    "const a = 'SELECT id FROM accounts WHERE id = $1';",
    'const b = `SELECT * FROM ${table}`;',
    "const c = 'Select from the list below';",
    "const d = \"INSERT INTO audit_log (msg) VALUES ($1) ON CONFLICT (id) DO UPDATE SET msg = $1\";",
    "const e = 'SELECT * FROM generate_series(1, 3)';",
    "const f = 'SELECT * FROM jobs FOR UPDATE SKIP LOCKED';",
  ].join('\n') }];
  assert.deepEqual(tablesIn(files).map((x) => `${x.access} ${x.table}:${x.line}`), ['reads accounts:1', 'writes audit_log:4', 'reads jobs:6']);
});

test('SQL files: CREATE, ALTER, and DROP define a table; temporary tables, comments, and REFERENCES do not count', () => {
  const sql = '-- DROP TABLE nothing;\nCREATE TABLE "public"."Orders" (id int, c int REFERENCES customers(id));\n/* CREATE TABLE ghosts (x int); */\nCREATE TEMP TABLE scratch (x int);\nALTER TABLE orders ADD COLUMN paid bool;\nDROP TABLE IF EXISTS old_orders;\nCREATE VIEW open_orders AS SELECT * FROM orders WHERE NOT paid;\n';
  assert.deepEqual(tablesIn([{ path: 'm.sql', source: sql }]).map((x) => `${x.access} ${x.table} (${x.name}):${x.line}`), [
    'creates orders (public.Orders):2', 'alters orders (orders):5', 'drops old_orders (old_orders):6', 'reads orders (orders):7',
  ]);
});

test('settings are read from each language’s own way of reading the environment, by a written key only', () => {
  const files = [
    { path: 'a.js', source: "const a = process.env.A_KEY, b = process.env['B_KEY'], k = process.env[name];" },
    { path: 'b.py', source: "import os\nc = os.environ['C_KEY']\nd = os.environ.get('D_KEY')\ne = os.getenv(\"E_KEY\")" },
    { path: 'c.go', source: 'v := os.Getenv("F_KEY")' },
    { path: 'd.java', source: 'String g = System.getenv("G_KEY");' },
    { path: 'e.cs', source: 'var h = Environment.GetEnvironmentVariable("H_KEY");' },
    { path: 'f.rb', source: "i = ENV['I_KEY']\nj = ENV.fetch('J_KEY')" },
    { path: 'g.rs', source: 'let k = std::env::var("K_KEY");' },
  ];
  assert.deepEqual(settingsIn(files).map((s) => s.key), ['A_KEY', 'B_KEY', 'C_KEY', 'D_KEY', 'E_KEY', 'F_KEY', 'G_KEY', 'H_KEY', 'I_KEY', 'J_KEY', 'K_KEY']);
});

test('packages: go.mod module and require, requirements.txt, and .csproj PackageId and PackageReference', () => {
  const p = packagesIn([
    { path: 'go.mod', source: 'module github.com/acme/billing\n\nrequire (\n\tgithub.com/acme/orders v1.2.0 // indirect\n)\nrequire github.com/lib/pq v1.10.9\n' },
    { path: 'svc/requirements.txt', source: 'Flask==3.0.0\n-r base.txt\nrequests[socks]>=2.31 ; python_version > "3"\n' },
    { path: 'Lib/Lib.csproj', source: '<Project>\n<PropertyGroup><PackageId>Acme.Orders</PackageId></PropertyGroup>\n<PackageReference Include="Dapper" Version="2.1.0" />\n</Project>' },
  ]);
  assert.deepEqual(p.publishes.map((x) => `${x.package} ${x.file}:${x.line} root=${x.root}`), ['github.com/acme/billing go.mod:1 root=', 'Acme.Orders Lib/Lib.csproj:2 root=Lib']);
  assert.deepEqual(p.depends.map((x) => `${x.package} ${x.version} ${x.file}:${x.line}`), ['github.com/acme/orders v1.2.0 go.mod:4', 'github.com/lib/pq v1.10.9 go.mod:6', 'flask ==3.0.0 svc/requirements.txt:1', 'requests >=2.31 svc/requirements.txt:3', 'Dapper 2.1.0 Lib/Lib.csproj:3']);
});

test('sentences that start with a SQL word are not SQL; REVOKE … FROM names a role, not a table', () => {
  const code = [{ path: 'src/legal.ts', source: [
    'const a = "Delete: delete your workouts from Profile. This also removes them from TuneHabit.";',
    "const b = 'Update TuneHabit to continue';",
    "const c = 'UPDATE accounts SET active = false WHERE id = $1';",
    "const d = 'update accounts a set active = true';",
  ].join('\n') }];
  assert.deepEqual(tablesIn(code).map((x) => `${x.access} ${x.table}:${x.line}`), ['writes accounts:3', 'writes accounts:4']);
  const sql = [{ path: 'm.sql', source: 'revoke all on public.workouts from public, anon;\ngrant select on public.workouts to authenticated;\nselect id from public.workouts;\n' }];
  assert.deepEqual(tablesIn(sql).map((x) => `${x.access} ${x.table}:${x.line}`), ['reads workouts:3']);
});

test('drift is between repositories: the same versions in every repository, peer ranges, and platform settings are not listed', () => {
  const pkg = (deps, extra = {}) => json({ name: extra.name ?? 'x', dependencies: deps, ...(extra.peer ? { peerDependencies: extra.peer } : {}) });
  const t = buildTrace([
    mem('a', { 'package.json': pkg({ eslint: '^9' }, { name: 'a' }), 'tools/package.json': pkg({ eslint: '^9.39.5' }, { name: 'a-tools', peer: { react: '>=19' } }), 'src/x.ts': 'export const e = process.env.VERCEL_ENV;\n' }),
    mem('b', { 'package.json': pkg({ eslint: '^9', react: '19.3.0' }, { name: 'b' }), 'tools/package.json': pkg({ eslint: '^9.39.5' }, { name: 'b-tools' }), 'src/x.ts': 'export const e = process.env.VERCEL_ENV;\n' }),
  ]);
  assert.deepEqual(t.shared.drift, []);
  assert.deepEqual(t.shared.settings, []);
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

test('impact --diff: a new migration that drops a table, and a table no longer created, list who still uses them', { skip: !gitOk && 'git is not installed' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'thunder-trace-data-'));
  try {
    const orders = gitRepo(root, 'orders', { 'db/001.sql': 'CREATE TABLE orders (id int);\n\nCREATE TABLE order_lines (order_id int);\n' });
    const billing = gitRepo(root, 'billing', { 'app/report.py': 'def unpaid(cur):\n    cur.execute("SELECT id FROM orders")\n    cur.execute("SELECT order_id FROM order_lines")\n' });
    // Uncommitted: order_lines is no longer created, and a new migration drops orders.
    writeFileSync(join(orders, 'db/001.sql'), 'CREATE TABLE orders (id int);\n');
    writeFileSync(join(orders, 'db/002.sql'), 'DROP TABLE orders;\n');
    const r = spawnSync(process.execPath, [CLI, 'trace', 'impact', '--diff', orders, billing, '--json'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const got = JSON.parse(r.stdout).findings.map((f) => [f.risk, f.kind, f.says, f.dependents.map((d) => d.cite.replace(/@[0-9a-f]{7}/, '@sha'))]);
    assert.deepEqual(got, [
      ['high', 'table-removed', 'the order_lines table is no longer created here, but 1 place in other repositories still uses it', ['billing@sha:app/report.py:3']],
      ['high', 'table-dropped', 'DROP TABLE orders, but 1 place in other repositories still uses it', ['billing@sha:app/report.py:2']],
    ]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('thunder trace reads package manifests from the folders, so packages link on the command line too', { skip: !gitOk && 'git is not installed' }, () => {
  const root = mkdtempSync(join(tmpdir(), 'thunder-trace-data-'));
  try {
    const lib = gitRepo(root, 'lib', { 'package.json': json({ name: '@acme/lib', version: '1.0.0' }), 'index.js': 'export const x = 1;\n' });
    const app = gitRepo(root, 'app', { 'package.json': json({ name: 'app', dependencies: { '@acme/lib': '^1.0.0' } }), 'index.js': "import { x } from '@acme/lib';\n" });
    const r = spawnSync(process.execPath, [CLI, 'trace', lib, app], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /app → lib: depends on the package @acme\/lib \^1\.0\.0, published by lib/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
