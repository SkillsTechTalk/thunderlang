// Access flow (src/flow/access.mjs): the labeled benchmark in test/fixtures/access-flow/. Each handler file says
// what it expects in a header comment ("// expect: guarded (…)", "// expect DELETE: …"). The benchmark is synthetic and
// written for this check; the measured numbers are printed and the labels are enforced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accessFlow, accessText, ownershipWords, ACCESS_SCHEMA } from '../src/flow/access.mjs';
import { parseProgram } from '../src/flow/ts-parse.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'access-flow');
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(root).map((p) => ({ path: relative(root, p).replace(/\\/g, '/'), source: readFileSync(p, 'utf8') }));
const report = accessFlow(files);
const labels = [];
for (const f of files) for (const m of f.source.matchAll(/^\/\/ expect(?: (\w+))?: (guarded|unguarded|cannot tell|none)/gm)) labels.push({ file: f.path, method: m[1] ?? null, want: m[2] === 'none' ? null : m[2] });
const routeFor = (l) => report.routes.find((r) => r.file === l.file && (!l.method || r.method === l.method));

test('every labeled handler gets its expected verdict', () => {
  assert.ok(labels.length >= 50, `the benchmark has ${labels.length} labeled routes`);
  const wrong = labels.filter((l) => routeFor(l)?.verdict !== l.want).map((l) => `${l.file}${l.method ? ` ${l.method}` : ''}: expected ${l.want}, got ${routeFor(l)?.verdict ?? 'no route'} (${routeFor(l)?.why ?? ''})`);
  assert.deepEqual(wrong, []);
});

test('precision first: no route is called unguarded unless it is labeled unguarded', () => {
  const said = labels.filter((l) => routeFor(l)?.verdict === 'unguarded');
  const truly = labels.filter((l) => l.want === 'unguarded');
  const falsePositives = said.filter((l) => l.want !== 'unguarded');
  const found = truly.filter((l) => routeFor(l)?.verdict === 'unguarded');
  const precision = said.length ? (said.length - falsePositives.length) / said.length : 1;
  const recall = truly.length ? found.length / truly.length : 1;
  const cannot = labels.filter((l) => routeFor(l)?.verdict === 'cannot tell').length / labels.length;
  console.log(`  access-flow benchmark: ${labels.length} routes; unguarded precision ${(precision * 100).toFixed(0)}%, recall ${(recall * 100).toFixed(0)}%; "cannot tell" ${(cannot * 100).toFixed(0)}%`);
  assert.deepEqual(falsePositives.map((l) => l.file), []);
  assert.equal(precision, 1);
});

test('the report: schema, a summary, paths with source-linked steps, and words for readings', () => {
  assert.equal(report.schema, ACCESS_SCHEMA);
  assert.equal(report.summary.routes, report.routes.length);
  const open = report.routes.find((r) => r.file === 'e01-lookup-by-id.ts');
  assert.equal(open.method, 'GET');
  assert.equal(open.path, '/e01/invoices/:id');
  const kinds = open.paths[0].steps.map((s) => s.kind);
  assert.deepEqual(kinds, ['input', 'identity', 'lookup', 'response']);
  assert.match(open.paths[0].steps[0].says, /req\.params\.id/);
  assert.equal(open.paths[0].steps[2].line, 6);
  assert.match(ownershipWords(open), /^No ownership check on this path \(lines 5, 6, 7\)/);
  const checked = report.routes.find((r) => r.file === 'e03-compare-then-404.ts');
  assert.match(ownershipWords(checked), /^Ownership: checked \(line 7\)/);
  const unknown = report.routes.find((r) => r.file === 'e10-unknown-middleware.ts');
  assert.match(ownershipWords(unknown), /^Ownership: Thunder cannot tell: the route runs loadInvoiceAccess first/);
  const text = accessText(report);
  assert.match(text, /✗ GET \/e01\/invoices\/:id/);
  assert.match(text, /routes: \d+ checked, \d+ with no ownership check/);
});

test('a file Thunder cannot read is listed, never guessed', () => {
  const r = accessFlow([{ path: 'bad.ts', source: 'router.get("/x/:id", async (req, res) => { res.json(@@@) })' }]);
  assert.equal(r.routes.length, 0);
  assert.equal(r.unread.length, 1);
  assert.match(r.unread[0].why, /could not read this file/);
});

test('the TypeScript parser skips types, generics, as, satisfies, and type-only declarations', () => {
  const ast = parseProgram(`
    type Id = string | number;
    interface User { id: Id; tenantId: string }
    enum Kind { A, B }
    declare const x: number;
    export const f = async <T,>(a: T, { b }: { b: Map<string, Array<number>> }): Promise<T> => a as unknown as T;
    const y = (z satisfies Record<string, unknown>)!;
    class C<T> implements I { private readonly db: Db; constructor(private s: S) {} async get(id: string): Promise<T | null> { return null; } }
  `);
  assert.deepEqual(ast.body.map((s) => s.type), ['Empty', 'Empty', 'Empty', 'Empty', 'Export', 'Var', 'Class']);
});
