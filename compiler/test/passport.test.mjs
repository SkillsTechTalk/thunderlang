// The Thunder Software Passport (src/passport.mjs, src/passport-fs.mjs, docs/passport.md), on a small two-part
// project written here: a shop (TypeScript) that calls a payments service (TypeScript, Express).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPassport, checkPassportOnDisk } from '../src/passport-fs.mjs';
import { PASSPORT_SCHEMA, renderPassportMarkdown, renderPassportSummary, checkPassport } from '../src/passport.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.mjs');
const BUILT = '2026-11-26T12:00:00.000Z';

const SHOP = `export async function checkout(cart: { total: number }) {
  if (cart.total <= 0) {
    throw new Error("The cart is empty");
  }
  const answer = await fetch("http://payments.internal/api/pay", { method: "POST", body: JSON.stringify(cart) });
  return answer.ok ? "Paid" : "Try again";
}
`;
const PAY = `import express from "express";
const app = express();
const paid: string[] = [];

app.post("/api/pay", (req, res) => {
  if (!req.body.total) {
    res.status(400).send("No total");
    return;
  }
  paid.push(req.body.id);
  res.send("Paid");
});
`;

function project() {
  const root = mkdtempSync(join(tmpdir(), 'thunder-passport-'));
  mkdirSync(join(root, 'shop')); mkdirSync(join(root, 'payments'));
  writeFileSync(join(root, 'shop', 'checkout.ts'), SHOP);
  writeFileSync(join(root, 'payments', 'server.ts'), PAY);
  writeFileSync(join(root, 'payments', 'package.json'), JSON.stringify({ name: 'payments', dependencies: { express: '^4.19.2' } }));
  const g = (...a) => execFileSync('git', ['-C', root, ...a], { stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_DATE: '2026-11-26T12:00:00Z', GIT_COMMITTER_DATE: '2026-11-26T12:00:00Z' } });
  g('init', '-q'); g('add', '-A'); g('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'base');
  return { root, g, parts: [join(root, 'shop'), join(root, 'payments')] };
}

test('a snapshot passport has every section, says the purpose is not stated, and verifies nothing it did not run', () => {
  const { root, parts } = project();
  const p = buildPassport({ parts, builtAt: BUILT, relativeTo: root });
  assert.equal(p.schema, PASSPORT_SCHEMA);
  for (const k of ['subject', 'purpose', 'behavior', 'dependencies', 'effects', 'evidence', 'unknowns', 'history', 'summary', 'fingerprint']) assert.ok(k in p, k);
  assert.deepEqual(p.purpose, { stated: false, text: 'not stated', source: null });
  assert.equal(p.subject.kind, 'feature');
  assert.deepEqual(p.subject.parts.map((x) => [x.name, x.path]), [['shop', 'shop'], ['payments', 'payments']]);
  // Behavior: each action with its Thunder Text and lines.
  const checkout = p.behavior.find((b) => b.part === 'shop' && /checkout/i.test(b.name));
  assert.ok(checkout && checkout.lines[0] === 1 && checkout.text.length > 0, JSON.stringify(p.behavior));
  // Dependencies: hashes for every file, the link, and the package.
  assert.ok(p.dependencies.files.every((f) => /^sha256:[0-9a-f]{64}$/.test(f.sha256)));
  assert.equal(p.dependencies.links.length, 1);
  assert.match(p.dependencies.links[0].says, /shop calls payments: POST \/api\/pay/);
  assert.deepEqual(p.dependencies.packages, [{ name: 'express', version: '^4.19.2', from: 'package.json' }]);
  // Effects are detected, never observed or declared here.
  assert.ok(p.effects.length > 0 && p.effects.every((e) => e.how === 'detected'));
  // Evidence: only the link, read from code. Nothing passed.
  assert.deepEqual(p.evidence.map((e) => [e.kind, e.status]), [['trace-link', 'read']]);
  assert.equal(p.summary.passed, 0);
  assert.deepEqual(p.unknowns.untested.map((x) => x.part), ['shop', 'payments']);
  assert.ok(p.unknowns.notVerified.length >= 4);
  assert.match(renderPassportMarkdown(p), /Nothing was run, so nothing here is verified by running\./);
  assert.match(renderPassportSummary(p), /○ read from code, not run: shop calls payments/);
});

test('a change passport: what changed, its behavior, a review of both versions, and the history', () => {
  const { root, parts, g } = project();
  writeFileSync(join(root, 'payments', 'server.ts'), PAY.replace('  paid.push(req.body.id);', '  if (paid.includes(req.body.id)) {\n    res.send("Paid already");\n    return;\n  }\n  paid.push(req.body.id);'));
  g('add', '-A'); g('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'change');
  const p = buildPassport({ parts, base: 'HEAD~1', builtAt: BUILT, relativeTo: root, purpose: { text: 'Pay once per id.' } });
  assert.equal(p.subject.kind, 'change');
  assert.deepEqual(p.purpose, { stated: true, text: 'Pay once per id.', source: 'given when the passport was built' });
  assert.deepEqual(p.history.changedFiles, [{ part: 'payments', file: 'server.ts', status: 'changed' }]);
  assert.ok(p.behavior.length >= 1 && p.behavior.every((b) => b.part === 'payments' && b.change === 'changed'), JSON.stringify(p.behavior));
  const review = p.evidence.find((e) => e.kind === 'review');
  assert.ok(review && review.status === 'read' && review.inputs.length === 1 && review.inputs[0].file === 'server.ts');
  assert.match(p.history.base, /^[0-9a-f]{40}$/);
});

test('a failing --run is recorded as failed (exit 1), never as passed, and is listed as not verified', () => {
  const { root } = project();
  const out = join(root, 'passport.json');
  const r = spawnSync(process.execPath, [CLI, 'passport', 'shop', 'payments', '--run', 'shop: echo checking && exit 3', '--run', 'payments: echo fine', '--out', out], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 1, r.stderr);
  const p = JSON.parse(readFileSync(out, 'utf8'));
  const runs = p.evidence.filter((e) => e.kind === 'test-run');
  assert.deepEqual(runs.map((e) => [e.basis.command, e.status, e.basis.exitCode]), [['echo checking && exit 3', 'failed', 3], ['echo fine', 'passed', 0]]);
  assert.match(runs[0].basis.outputTail, /checking/);
  assert.ok(p.unknowns.notVerified.some((x) => /echo checking && exit 3.*failed/.test(x)));
  assert.match(r.stdout, /✗ ran and failed: `echo checking && exit 3` in shop exited with 3/);
  assert.equal(p.summary.passed, 1);
  assert.equal(p.summary.failed, 1);
});

test('editing a file it depended on makes evidence stale, naming the file; the rest stays current; nothing is re-run', () => {
  const { root, parts } = project();
  const p = buildPassport({ parts, run: ['payments: echo ok'], builtAt: BUILT, relativeTo: root });
  assert.deepEqual(checkPassportOnDisk(p, { baseDir: root }).items.map((x) => x.freshness), ['current', 'current']);
  appendFileSync(join(root, 'payments', 'server.ts'), '\n// edited later\n');
  const c = checkPassportOnDisk(p, { baseDir: root });
  const byKind = Object.fromEntries(c.items.map((x) => [x.kind, x]));
  assert.equal(byKind['test-run'].freshness, 'stale');
  assert.deepEqual(byKind['test-run'].changed, [{ part: 'payments', file: 'server.ts', now: 'changed' }]);
  assert.equal(byKind['trace-link'].freshness, 'stale'); // the link's other end is that file too
  assert.deepEqual(c.changedFiles, [{ part: 'payments', file: 'server.ts', now: 'changed' }]);
  // A file that only the shop depends on stays current for a shop-only claim.
  const link = p.evidence.find((e) => e.kind === 'trace-link');
  const shopOnly = { ...p, evidence: [{ ...link, inputs: link.inputs.filter((i) => i.part === 'shop') }] };
  assert.equal(checkPassport(shopOnly, { read: (part, file) => readFileSync(join(root, part, file), 'utf8') }).items[0].freshness, 'current');
});

test('the CLI check: stale claims are named, with the file; usage mistakes exit 2', () => {
  const { root } = project();
  const out = join(root, 'p.json');
  assert.equal(spawnSync(process.execPath, [CLI, 'passport', 'shop', 'payments', '--run', 'payments: echo ok', '--out', out], { cwd: root, encoding: 'utf8' }).status, 0);
  appendFileSync(join(root, 'payments', 'server.ts'), '\n// edited later\n');
  const r = spawnSync(process.execPath, [CLI, 'passport', 'check', out], { cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /0 current, 2 stale \(nothing was re-run\)/);
  assert.match(r.stdout, /payments\/server\.ts changed since the passport was built/);
  assert.equal(spawnSync(process.execPath, [CLI, 'passport'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [CLI, 'passport', 'shop', '--nope'], { cwd: root, encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [CLI, 'passport', 'no-such-folder'], { cwd: root, encoding: 'utf8' }).status, 2);
});

test('the same inputs give the same passport (built-at pinned), and nothing counts as verified without an evidence item', () => {
  const { root, parts } = project();
  const a = buildPassport({ parts, run: ['shop: echo same'], builtAt: BUILT, relativeTo: root });
  const b = buildPassport({ parts, run: ['shop: echo same'], builtAt: BUILT, relativeTo: root });
  assert.deepEqual(a, b);
  assert.equal(a.summary.claims, a.evidence.length);
  assert.equal(a.summary.passed, a.evidence.filter((e) => e.status === 'passed').length);
  assert.ok(a.evidence.every((e) => e.claim && e.basis && e.scope && Array.isArray(e.inputs) && e.inputs.length));
});

test('an ownership-check result (thunder-access-v1) joins as access-flow evidence, read from code', () => {
  const { root, parts } = project();
  const access = { schema: 'thunder-access-v1', routes: [{ method: 'POST', path: '/api/pay', framework: 'express', verdict: 'cannot tell', file: 'server.ts', line: 5, why: 'no identity is read', identity: null, paths: [] }, { method: 'GET', path: '/health', verdict: null, file: 'server.ts', line: 1, why: '', paths: [] }] };
  const p = buildPassport({ parts, evidence: [access], builtAt: BUILT, relativeTo: root });
  const e = p.evidence.find((x) => x.kind === 'access-flow');
  assert.ok(e && e.status === 'read');
  assert.equal(p.evidence.filter((x) => x.kind === 'access-flow').length, 1); // a route with no verdict adds nothing
  assert.match(e.claim, /POST \/api\/pay in payments cannot be told/);
  assert.equal(e.inputs[0].file, 'server.ts');
  assert.match(e.inputs[0].sha256, /^sha256:/);
});

test('the ownership check, when given as a function, runs per part and joins as evidence', () => {
  const { root, parts } = project();
  const seen = [];
  const access = (files) => { seen.push(files.map((f) => f.path).sort().join(',')); return { schema: 'thunder-access-v1', routes: files.some((f) => f.path === 'server.ts') ? [{ method: 'POST', path: '/api/pay', verdict: 'guarded', file: 'server.ts', line: 5, why: 'limited to the caller', paths: [] }] : [] }; };
  const p = buildPassport({ parts, access, builtAt: BUILT, relativeTo: root });
  assert.deepEqual(seen, ['checkout.ts', 'server.ts']);
  const e = p.evidence.find((x) => x.kind === 'access-flow');
  assert.match(e.claim, /POST \/api\/pay in payments checks that the record belongs to the caller/);
  assert.deepEqual(e.inputs.map((i) => [i.part, i.file]), [['payments', 'server.ts']]);
});
