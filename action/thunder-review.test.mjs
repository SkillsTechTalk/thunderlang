// The Thunder review GitHub Action (action.yml + action/thunder-review.mjs): inputs, paths, the sticky comment with a
// mock fetch, the summary-only path for forks, failing on risk, and one run on a real temporary git repository.
// Nothing here talks to GitHub or npm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  readInputs, matchesPaths, filterReview, pullRequestOf, upsertStickyComment, publish, runReview, thunderCommand, main, COMMENT_LIMIT,
} from './thunder-review.mjs';
import { REVIEW_MARKER } from '../compiler/src/review-comment.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CLI = join(ROOT, 'compiler', 'src', 'cli.mjs');
const FEE = (n) => `def late_fee(days_late: int) -> str:\n    if days_late <= 0:\n        return "NoFee"\n    if days_late <= ${n}:\n        return "SmallFee"\n    return "BigFee"\n`;

const REVIEW = {
  schema: 'thunder-review-v1', says: '1 change in meaning, 1 risk, 0 form-only.',
  summary: { meaning: 1, risk: 1, form: 0, unchanged: 0, files: 3 },
  items: [
    { kind: 'infrastructure', severity: 'risk', subject: 'infra/main.tf', where: { file: 'infra/main.tf', line: 1 }, says: 'Changed infrastructure or pipeline file. Thunder does not read these in this version, so check it yourself.' },
    { kind: 'rule-limit', severity: 'meaning', subject: 'Late fee', where: { file: 'app/fees.py', line: 1 }, says: 'Late fee: the limit between Small fee and Big fee moved from 7 to 10 days late.' },
  ],
  notRead: [{ path: 'README.md', status: 'changed' }],
};
const SHA_A = 'a'.repeat(40), SHA_B = 'b'.repeat(40);
const inputs = (over = {}) => ({ base: SHA_A, head: SHA_B, comment: true, failOn: 'none', paths: [], version: '1.0.4', thunder: '', token: 't0k', ...over });
const event = (headRepo = 'o/r') => ({ pull_request: { number: 7, base: { repo: { full_name: 'o/r' } }, head: { repo: headRepo ? { full_name: headRepo } : null } } });
const ENV = { GITHUB_REPOSITORY: 'o/r', GITHUB_SERVER_URL: 'https://github.com', GITHUB_API_URL: 'https://api.github.com' };
const quiet = { warn() {}, error() {} };

/** A fake GitHub: comments per page, and a log of every request. */
function fakeGitHub({ pages = [[]], fail = null } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null, auth: init.headers.Authorization });
    if (fail && fail.method === init.method) return { ok: false, status: fail.status, json: async () => ({ message: fail.message }) };
    if (init.method === 'GET') { const page = Number(new URL(url).searchParams.get('page')); return { ok: true, status: 200, json: async () => pages[page - 1] ?? [] }; }
    if (init.method === 'POST') return { ok: true, status: 201, json: async () => ({ id: 99, html_url: 'https://github.com/o/r/pull/7#issuecomment-99' }) };
    return { ok: true, status: 200, json: async () => ({ id: Number(url.split('/').pop()), html_url: `https://github.com/o/r/pull/7#issuecomment-${url.split('/').pop()}` }) };
  };
  return { fetch, calls };
}

test('inputs: defaults, true/false, fail-on, and paths separated by commas or new lines', () => {
  const i = readInputs({ INPUT_BASE: ' x ', INPUT_HEAD: 'y', INPUT_PATHS: 'src/**, api/*.py\nlib/' });
  assert.deepEqual(i, { base: 'x', head: 'y', comment: true, failOn: 'none', paths: ['src/**', 'api/*.py', 'lib/'], version: 'latest', thunder: '', token: '' });
  assert.equal(readInputs({ INPUT_COMMENT: 'false', INPUT_FAIL_ON: 'risk' }).failOn, 'risk');
  assert.equal(readInputs({ 'INPUT_FAIL-ON': 'RISK' }).failOn, 'risk', 'the JavaScript-action spelling works too');
  assert.equal(readInputs({ INPUT_COMMENT: 'false' }).comment, false);
  assert.throws(() => readInputs({ INPUT_FAIL_ON: 'meaning' }), /fail-on input must be none or risk/);
  assert.throws(() => readInputs({ INPUT_COMMENT: 'maybe' }), /comment input must be true or false/);
  assert.deepEqual(thunderCommand({ version: '1.0.4' }), ['npx', '--yes', '@skillstech/thunderlang@1.0.4']);
  assert.deepEqual(thunderCommand({ thunder: 'node  cli.mjs' }), ['node', 'cli.mjs']);
});

test('paths: globs as people write them', () => {
  assert.ok(matchesPaths('src/a/b.ts', ['src/**']));
  assert.ok(!matchesPaths('lib/a.ts', ['src/**']));
  assert.ok(matchesPaths('deep/down/x.py', ['*.py']), 'a pattern without a slash matches in any folder');
  assert.ok(matchesPaths('api/x.py', ['api/*.py']) && !matchesPaths('api/v1/x.py', ['api/*.py']));
  assert.ok(matchesPaths('api/v1/x.py', ['api/**/*.py']) && matchesPaths('api/x.py', ['api/**/*.py']));
  assert.ok(matchesPaths('web/a.tsx', ['web/*.{ts,tsx}']));
  assert.ok(matchesPaths('docs/x/y.md', ['docs/']));
  assert.ok(matchesPaths('anything', []));
});

test('filterReview: only matching files, and the counts and summary line are worked out again', () => {
  const r = filterReview(REVIEW, ['app/**']);
  assert.deepEqual(r.items.map((x) => x.where.file), ['app/fees.py']);
  assert.deepEqual(r.notRead, []);
  assert.equal(r.says, '1 change in meaning, 0 risks, 0 form-only.');
  assert.equal(filterReview(REVIEW, ['nothing/**']).says, 'Nothing Thunder reads changed in nothing/**.');
  assert.equal(filterReview(REVIEW, []), REVIEW);
  // An item that names other places keeps the ones that match.
  const many = { ...REVIEW, items: [{ ...REVIEW.items[1], subject: 'A and 2 more', where: { file: 'x/a.py', line: 1 }, also: [{ subject: 'B', where: { file: 'app/b.py', line: 2 } }, { subject: 'C', where: { file: 'lib/c.py', line: 3 } }] }] };
  assert.deepEqual(filterReview(many, ['app/**']).items.map((x) => [x.subject, x.where.file, x.also]), [['B', 'app/b.py', undefined]]);
  assert.deepEqual(filterReview(many, ['x/**', 'lib/**']).items.map((x) => [x.subject, x.also.length]), [['A and 1 more', 1]], 'the "and N more" count follows what is kept');
  assert.deepEqual(filterReview(many, ['x/**']).items.map((x) => [x.subject, x.also]), [['A', undefined]]);
});

test('pull request: forks (and deleted forks) are told apart from branches of the same repository', () => {
  assert.deepEqual(pullRequestOf(event('o/r'), 'o/r'), { number: 7, isFork: false });
  assert.deepEqual(pullRequestOf(event('someone/r'), 'o/r'), { number: 7, isFork: true });
  assert.deepEqual(pullRequestOf(event(null), 'o/r'), { number: 7, isFork: true });
  assert.equal(pullRequestOf({ push: {} }, 'o/r'), null);
});

test('sticky comment: created when there is none, updated in place when there is one (on any page)', async () => {
  const none = fakeGitHub({ pages: [[{ id: 1, body: 'LGTM' }, { id: 2, body: `quoted: ${REVIEW_MARKER}` }]] });
  const made = await upsertStickyComment({ repo: 'o/r', pr: 7, body: `${REVIEW_MARKER}\nhi`, token: 't0k', fetch: none.fetch });
  assert.deepEqual(made, { action: 'created', id: 99, url: 'https://github.com/o/r/pull/7#issuecomment-99' });
  assert.deepEqual(none.calls.map((c) => `${c.method} ${c.url.replace('https://api.github.com', '')}`), [
    'GET /repos/o/r/issues/7/comments?per_page=100&page=1', 'POST /repos/o/r/issues/7/comments']);
  assert.equal(none.calls[1].body.body, `${REVIEW_MARKER}\nhi`);
  assert.equal(none.calls[0].auth, 'Bearer t0k');

  const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, body: 'chat' }));
  const two = fakeGitHub({ pages: [page1, [{ id: 555, body: `${REVIEW_MARKER}\nold` }, { id: 556, body: `${REVIEW_MARKER}\nolder` }]] });
  const upd = await upsertStickyComment({ repo: 'o/r', pr: 7, body: `${REVIEW_MARKER}\nnew`, token: 't0k', fetch: two.fetch });
  assert.equal(upd.action, 'updated');
  assert.equal(upd.id, 555);
  assert.deepEqual(two.calls.map((c) => c.method), ['GET', 'GET', 'PATCH']);
  assert.match(two.calls[2].url, /\/repos\/o\/r\/issues\/comments\/555$/);

  const denied = fakeGitHub({ fail: { method: 'POST', status: 403, message: 'Resource not accessible by integration' } });
  await assert.rejects(upsertStickyComment({ repo: 'o/r', pr: 7, body: 'x', token: 't', fetch: denied.fetch }), (e) => e.status === 403 && /Resource not accessible/.test(e.message));
});

test('publish on a branch of the same repository: one comment under GitHub\'s limit, and the summary links to it', async () => {
  const gh = fakeGitHub();
  const res = await publish({ review: REVIEW, inputs: inputs(), env: ENV, event: event(), fetch: gh.fetch, log: quiet });
  assert.equal(res.exitCode, 0);
  assert.equal(res.comment.action, 'created');
  const body = gh.calls.find((c) => c.method === 'POST').body.body;
  assert.ok(body.startsWith(REVIEW_MARKER));
  assert.ok(body.length <= COMMENT_LIMIT);
  assert.match(body, /\[`app\/fees\.py:1`\]\(https:\/\/github\.com\/o\/r\/blob\/b{40}\/app\/fees\.py#L1\)/);
  assert.match(body, /compared `aaaaaaa` with `bbbbbbb`/);
  assert.match(res.summary, /The pull request comment was created: https:\/\/github\.com\/o\/r\/pull\/7#issuecomment-99/);
  assert.ok(!res.summary.startsWith(REVIEW_MARKER), 'the marker is only in the comment');
  assert.deepEqual({ says: res.outputs.says, risks: res.outputs.risks, comment: res.outputs.comment, cannot: res.outputs['cannot-check'] },
    { says: REVIEW.says, risks: '1', comment: 'created', cannot: '1' });
});

test('publish on a fork: no GitHub call at all, the summary has the review and says why there is no comment', async () => {
  const gh = fakeGitHub();
  const res = await publish({ review: REVIEW, inputs: inputs(), env: ENV, event: event('someone/r'), fetch: gh.fetch, log: quiet });
  assert.equal(gh.calls.length, 0);
  assert.equal(res.comment.action, 'skipped');
  assert.equal(res.exitCode, 0);
  assert.match(res.summary, /> This pull request comes from a fork, and GitHub gives workflows on forks a read-only token, so no comment was posted\. The review is only in this job summary\./);
  assert.match(res.summary, /Late fee: the limit between Small fee and Big fee moved from 7 to 10 days late\./);
});

test('publish: comment false, not a pull request, and a token that cannot write each keep the summary', async () => {
  const gh = fakeGitHub();
  const off = await publish({ review: REVIEW, inputs: inputs({ comment: false }), env: ENV, event: event(), fetch: gh.fetch, log: quiet });
  assert.match(off.summary, /> comment: false, so the review is only in this job summary\./);
  const push = await publish({ review: REVIEW, inputs: inputs(), env: ENV, event: { ref: 'main' }, fetch: gh.fetch, log: quiet });
  assert.match(push.summary, /not for a pull request/);
  assert.equal(gh.calls.length, 0);
  const warnings = [];
  const denied = fakeGitHub({ fail: { method: 'GET', status: 403, message: 'Resource not accessible by integration' } });
  const res = await publish({ review: REVIEW, inputs: inputs(), env: ENV, event: event(), fetch: denied.fetch, log: { warn: (m) => warnings.push(m), error() {} } });
  assert.equal(res.comment.action, 'failed');
  assert.equal(res.exitCode, 0, 'a comment that cannot be posted does not fail the job');
  assert.match(res.summary, /permissions: pull-requests: write/);
  assert.match(warnings[0], /^::warning::Thunder review: could not post the pull request comment/);
});

test('fail-on: risk fails the job only when something needs a careful look; paths narrow what counts', async () => {
  const errors = [];
  const log = { warn() {}, error: (m) => errors.push(m) };
  const gh = fakeGitHub();
  assert.equal((await publish({ review: REVIEW, inputs: inputs({ failOn: 'risk', comment: false }), env: ENV, event: event(), fetch: gh.fetch, log })).exitCode, 1);
  assert.match(errors[0], /^::error::Thunder review: 1 change in meaning, 1 risk, 0 form-only\. fail-on: risk, and 1 item needs a careful look\./);
  assert.equal((await publish({ review: REVIEW, inputs: inputs({ failOn: 'none', comment: false }), env: ENV, event: event(), fetch: gh.fetch, log })).exitCode, 0);
  const narrowed = await publish({ review: REVIEW, inputs: inputs({ failOn: 'risk', comment: false, paths: ['app/**'] }), env: ENV, event: event(), fetch: gh.fetch, log });
  assert.equal(narrowed.exitCode, 0);
  assert.match(narrowed.summary, /> Only files matching `app\/\*\*` are reviewed here\./);
});

test('runReview: fetches a missing commit, then runs the published compiler with the form every version understands', () => {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    if (args[0] === 'cat-file' && args[2].startsWith(SHA_B)) throw new Error('missing');
    if (args.includes('review')) return JSON.stringify(REVIEW);
    return '';
  };
  const r = runReview({ base: SHA_A, head: SHA_B, version: '1.0.4', thunder: '' }, run);
  assert.equal(r.says, REVIEW.says);
  assert.deepEqual(calls, [
    `git cat-file -e ${SHA_A}^{commit}`, `git cat-file -e ${SHA_B}^{commit}`, `git fetch --no-tags --quiet --depth=1 origin ${SHA_B}`,
    `npx --yes @skillstech/thunderlang@1.0.4 review ${SHA_A} ${SHA_B} --json`]);
  assert.throws(() => runReview({ base: 'a', head: 'b', version: 'x' }, (c, a) => (a.includes('review') ? '{"schema":"other"}' : '')), /unknown result/);
});

test('action.yml: the default compiler version is the published one, and the inputs match the script', () => {
  const yml = readFileSync(join(ROOT, 'action.yml'), 'utf8');
  const facts = readFileSync(join(ROOT, 'src', 'lib', 'facts.ts'), 'utf8');
  const published = facts.match(/PUBLISHED_VERSION = "([^"]+)"/)[1];
  const def = (file, input) => readFileSync(join(ROOT, file), 'utf8').match(new RegExp(`\\n  ${input}:\\n(?:    .*\\n)*?    default: '([^']*)'`))[1];
  assert.equal(def('action.yml', 'version'), published, 'bump action.yml with each release');
  assert.equal(def('.github/actions/thunder-review/action.yml', 'version'), published);
  for (const input of ['base', 'head', 'comment', 'fail-on', 'paths', 'version', 'github-token']) assert.match(yml, new RegExp(`\\n  ${input}:\\n`));
  assert.match(yml, /using: 'composite'/);
  assert.match(yml, /run: node "\$GITHUB_ACTION_PATH\/action\/thunder-review\.mjs"/);
  assert.doesNotMatch(yml, /pull_request_target/);
});

test('end to end on two real commits: comment false writes the summary and the outputs', { skip: Number(process.versions.node.split('.')[0]) < 20 && 'needs Node 20' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tl-action-'));
  const git = (...a) => { const r = spawnSync('git', a, { cwd: dir, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  git('init', '-q'); git('config', 'user.email', 't@example.com'); git('config', 'user.name', 'T'); git('config', 'commit.gpgsign', 'false');
  mkdirSync(join(dir, 'app'));
  writeFileSync(join(dir, 'app', 'fees.py'), FEE(7)); git('add', '-A'); git('commit', '-qm', 'one');
  const base = git('rev-parse', 'HEAD');
  writeFileSync(join(dir, 'app', 'fees.py'), FEE(10)); git('add', '-A'); git('commit', '-qm', 'two');
  const head = git('rev-parse', 'HEAD');
  const summary = join(dir, 'summary.md'), output = join(dir, 'output.txt');
  writeFileSync(summary, ''); writeFileSync(output, '');
  const cwd = process.cwd();
  process.chdir(dir);
  const log = console.log; console.log = () => {};
  let code;
  try {
    code = await main({ INPUT_BASE: base, INPUT_HEAD: head, INPUT_COMMENT: 'false', INPUT_THUNDER: `${process.execPath} ${CLI}`, GITHUB_REPOSITORY: 'o/r', GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: output, RUNNER_TEMP: dir });
  } finally { process.chdir(cwd); console.log = log; }
  assert.equal(code, 0);
  const md = readFileSync(summary, 'utf8');
  assert.match(md, /^### Thunder review: what this change does, in plain sentences/);
  assert.match(md, /Late fee: the limit between Small fee and Big fee moved from 7 to 10 days late/);
  assert.match(md, /> comment: false/);
  const out = readFileSync(output, 'utf8');
  assert.match(out, /says<<THUNDER_EOF\n1 change in meaning, 0 risks, 0 form-only\.\nTHUNDER_EOF/);
  assert.match(out, /comment<<THUNDER_EOF\nskipped\n/);
});
