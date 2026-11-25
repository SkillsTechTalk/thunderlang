#!/usr/bin/env node
// The Thunder review GitHub Action (../action.yml), in one Node script with no dependencies:
//   1. make sure the base and head commits are present (shallow fetch of a missing one),
//   2. run `thunder review <base> <head> --json` from the published compiler (npx) or a given command,
//   3. keep only the files that match `paths`, render the comment (compiler/src/review-comment.mjs),
//   4. write it to the job summary, and, when allowed, create or update ONE pull request comment found by
//      the hidden marker <!-- thunder-review -->, with the workflow's GITHUB_TOKEN and the REST API,
//   5. fail the job only when fail-on: risk and something needs a careful look.
// Nothing from the pull request is run: Thunder only reads the files. No AI is called. Pull requests from forks get a
// read-only token, so there the review goes to the job summary only, and the summary says so.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderReviewComment, REVIEW_MARKER, reviewCounts } from '../compiler/src/review-comment.mjs';

// ── Inputs ────────────────────────────────────────────────────────────────────────────────────────────────────

export function readInputs(env = process.env) {
  // INPUT_FAIL_ON (set by action.yml) or INPUT_FAIL-ON (as GitHub names inputs for JavaScript actions).
  const get = (name, fallback = '') => (env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] ?? env[`INPUT_${name.toUpperCase()}`] ?? fallback).trim();
  const bool = (name, fallback) => {
    const v = get(name, String(fallback)).toLowerCase();
    if (['true', 'yes', '1'].includes(v)) return true;
    if (['false', 'no', '0', ''].includes(v)) return false;
    throw new Error(`The ${name.toLowerCase()} input must be true or false (it is "${v}").`);
  };
  const failOn = get('FAIL-ON', 'none').toLowerCase() || 'none';
  if (!['none', 'risk'].includes(failOn)) throw new Error(`The fail-on input must be none or risk (it is "${failOn}").`);
  return {
    base: get('BASE'), head: get('HEAD'),
    comment: bool('COMMENT', true),
    failOn,
    paths: get('PATHS').split(/[\n,]/).map((p) => p.trim()).filter(Boolean),
    version: get('VERSION', 'latest') || 'latest',
    thunder: get('THUNDER'),
    token: get('GITHUB-TOKEN'),
  };
}

// ── paths: a small glob (**, *, ?, {a,b}) ─────────────────────────────────────────────────────────────────────

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') { const end = glob.indexOf('}', i); if (end < 0) { re += '\\{'; continue; } re += `(?:${glob.slice(i + 1, end).split(',').map((p) => p.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('|')})`; i = end; }
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  // A pattern without a slash matches the name in any folder (like .gitignore); `dir/` matches everything under it.
  if (glob.endsWith('/')) re += '.*';
  return new RegExp(glob.includes('/') ? `^${re}$` : `(^|/)${re}$`);
}

export function matchesPaths(file, patterns) {
  if (!patterns?.length) return true;
  const f = String(file).replace(/\\/g, '/').replace(/^\.\//, '');
  return patterns.some((p) => globToRegExp(p.replace(/^\.\//, '')).test(f));
}

/** GitHub allows 1 MiB of job summary per step; stay well under it. */
export const SUMMARY_LIMIT = 900000;
/** GitHub allows 65,536 characters per comment; leave room. */
export const COMMENT_LIMIT = 60000;

const summaryOf = (items) => {
  const count = (s) => items.filter((x) => x.severity === s).length;
  return { meaning: count('meaning'), risk: count('risk'), form: count('form') };
};
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Keep only the items and unread files under `paths`; the counts and the summary line are worked out again. */
export function filterReview(review, patterns) {
  if (!patterns?.length) return review;
  const items = [];
  // The review names an item that covers other places "<subject> and N more": say N again for what is kept.
  const named = (subject, also) => (also.length ? `${subject} and ${also.length} more` : subject);
  for (const x of review.items) {
    if (!x.also) { if (matchesPaths(x.where.file, patterns)) items.push(x); continue; }
    const also = x.also.filter((a) => matchesPaths(a.where.file, patterns));
    const own = x.subject.replace(new RegExp(` and ${x.also.length} more$`), '');
    if (matchesPaths(x.where.file, patterns)) items.push({ ...x, subject: named(own, also), also: also.length ? also : undefined });
    else if (also.length) { const [first, ...rest] = also; items.push({ ...x, subject: named(first.subject, rest), where: first.where, evidence: first.evidence, also: rest.length ? rest : undefined }); }
  }
  const notRead = (review.notRead ?? []).filter((f) => matchesPaths(f.path, patterns));
  const s = summaryOf(items);
  const says = !items.length && !notRead.length ? `Nothing Thunder reads changed in ${patterns.join(', ')}.`
    : `${plural(s.meaning, 'change', 'changes')} in meaning, ${plural(s.risk, 'risk', 'risks')}, ${s.form} form-only.`;
  return { ...review, items, notRead, summary: { ...review.summary, ...s }, says };
}

// ── The pull request ──────────────────────────────────────────────────────────────────────────────────────────

/** The pull request number and whether it comes from a fork (whose GITHUB_TOKEN is read-only). */
export function pullRequestOf(event, repository) {
  const pr = event?.pull_request;
  if (!pr?.number) return null;
  const headRepo = pr.head?.repo?.full_name ?? null;
  return { number: pr.number, isFork: !headRepo || headRepo.toLowerCase() !== String(pr.base?.repo?.full_name ?? repository).toLowerCase() };
}

/**
 * Create or update the one Thunder review comment on a pull request. Finds the comment by REVIEW_MARKER among the
 * pull request's comments (every page), updates the first one, and creates one when there is none.
 * Returns { action: 'created' | 'updated', id, url }. Throws an Error with .status when GitHub refuses.
 */
export async function upsertStickyComment({ repo, pr, body, token, api = 'https://api.github.com', fetch: fetchImpl = globalThis.fetch }) {
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'thunder-review-action' };
  const call = async (method, path, payload) => {
    const res = await fetchImpl(`${api}${path}`, { method, headers: { ...headers, ...(payload ? { 'Content-Type': 'application/json' } : {}) }, body: payload ? JSON.stringify(payload) : undefined });
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).message ?? ''; } catch { /* no body */ }
      const e = new Error(`GitHub said ${res.status}${msg ? `: ${msg}` : ''} (${method} ${path}).`);
      e.status = res.status;
      throw e;
    }
    return res.status === 204 ? null : res.json();
  };
  let existing = null;
  for (let page = 1; page <= 50 && !existing; page++) {
    const list = await call('GET', `/repos/${repo}/issues/${pr}/comments?per_page=100&page=${page}`);
    existing = list.find((c) => typeof c.body === 'string' && c.body.startsWith(REVIEW_MARKER)) ?? null;
    if (list.length < 100) break;
  }
  if (existing) {
    const c = await call('PATCH', `/repos/${repo}/issues/comments/${existing.id}`, { body });
    return { action: 'updated', id: existing.id, url: c?.html_url ?? existing.html_url };
  }
  const c = await call('POST', `/repos/${repo}/issues/${pr}/comments`, { body });
  return { action: 'created', id: c.id, url: c.html_url };
}

// ── Running the compiler ──────────────────────────────────────────────────────────────────────────────────────

export function thunderCommand({ thunder, version }) {
  if (thunder) return thunder.split(/\s+/).filter(Boolean);
  return ['npx', '--yes', `@skillstech/thunderlang@${version}`];
}

function ensureCommit(ref, run) {
  try { run('git', ['cat-file', '-e', `${ref}^{commit}`]); return; } catch { /* fetch it */ }
  run('git', ['fetch', '--no-tags', '--quiet', '--depth=1', 'origin', ref]);
}

/** Run `thunder review <base> <head> --json` (the form every published version with review understands). */
export function runReview({ base, head, thunder, version }, run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })) {
  for (const ref of [base, head]) ensureCommit(ref, run);
  const [cmd, ...pre] = thunderCommand({ thunder, version });
  let out;
  try { out = run(cmd, [...pre, 'review', base, head, '--json']); } catch (e) {
    throw new Error(`thunder review did not finish: ${String(e.stderr || e.message).trim().split('\n').slice(-3).join(' ')}`);
  }
  const review = JSON.parse(out);
  if (review.schema !== 'thunder-review-v1') throw new Error(`thunder review gave an unknown result (${review.schema ?? 'no schema'}).`);
  return review;
}

// Workflow commands (::warning::, ::error::) go to standard output, where the runner reads them.
const STDOUT = { warn: (m) => console.log(m), error: (m) => console.log(m) };

// ── The whole action ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Everything after the review: render, summary, comment, outputs, exit code. Separate from main() so tests can run it
 * with a mock fetch and no git. Returns { exitCode, body, summary, comment, outputs }.
 */
export async function publish({ review, inputs, env = process.env, event = null, fetch: fetchImpl = globalThis.fetch, log = STDOUT }) {
  const repo = env.GITHUB_REPOSITORY;
  const server = env.GITHUB_SERVER_URL || 'https://github.com';
  const r = filterReview(review, inputs.paths);
  const pr = pullRequestOf(event, repo);
  const fileUrl = repo && inputs.head ? (file, line) => `${server}/${repo}/blob/${inputs.head}/${file.split('/').map(encodeURIComponent).join('/')}#L${line}` : null;
  const notes = [];
  if (inputs.paths.length) notes.push(`Only files matching ${inputs.paths.map((p) => `\`${p}\``).join(', ')} are reviewed here.`);
  const short = (ref) => (/^[0-9a-f]{40}$/i.test(ref) ? ref.slice(0, 7) : ref);
  const footer = `compared \`${short(inputs.base)}\` with \`${short(inputs.head)}\``;

  let comment = { action: 'skipped', reason: '' };
  if (!inputs.comment) comment.reason = 'comment: false, so the review is only in this job summary.';
  else if (!pr) comment.reason = 'This run is not for a pull request, so the review is only in this job summary.';
  else if (pr.isFork) comment.reason = 'This pull request comes from a fork, and GitHub gives workflows on forks a read-only token, so no comment was posted. The review is only in this job summary.';
  else if (!inputs.token) comment.reason = 'No token was given, so no comment was posted. The review is only in this job summary.';
  else {
    const body = renderReviewComment(r, { maxChars: COMMENT_LIMIT, fileUrl, notes, footer, evidenceLines: 25 });
    try {
      comment = await upsertStickyComment({ repo, pr: pr.number, body, token: inputs.token, api: env.GITHUB_API_URL || 'https://api.github.com', fetch: fetchImpl });
    } catch (e) {
      const why = e.status === 403 || e.status === 404
        ? 'The token cannot write pull request comments here. Give the workflow `permissions: pull-requests: write` (pull requests from forks and Dependabot always get a read-only token).'
        : 'GitHub did not accept the comment.';
      comment = { action: 'failed', reason: `${why} ${e.message}` };
      log.warn?.(`::warning::Thunder review: could not post the pull request comment. ${comment.reason} The review is in the job summary.`);
    }
  }
  // The job summary has room for the whole review (GitHub allows 1 MiB per step).
  const summaryNotes = [...notes];
  if (comment.action === 'skipped' || comment.action === 'failed') summaryNotes.unshift(comment.reason + (comment.action === 'failed' ? ' The review is only in this job summary.' : ''));
  else summaryNotes.unshift(`The pull request comment was ${comment.action}: ${comment.url}`);
  const summary = renderReviewComment(r, { maxChars: SUMMARY_LIMIT, fileUrl, notes: summaryNotes, footer }).replace(`${REVIEW_MARKER}\n`, '');

  const counts = reviewCounts(r);
  const outputs = { says: r.says, risks: String(r.summary.risk), meaning: String(r.summary.meaning), form: String(r.summary.form),
    explained: String(counts.explained), 'shown-as-code': String(counts.code), 'cannot-check': String(counts.person), comment: comment.action, 'comment-url': comment.url ?? '' };
  const failed = inputs.failOn === 'risk' && r.summary.risk > 0;
  if (failed) log.error?.(`::error::Thunder review: ${r.says} fail-on: risk, and ${plural(r.summary.risk, 'item needs', 'items need')} a careful look.`);
  return { exitCode: failed ? 1 : 0, review: r, summary, comment, outputs };
}

export async function main(env = process.env) {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) throw new Error(`The Thunder review action needs Node.js 20 or newer (this runner has ${process.versions.node}). Add actions/setup-node with node-version: 20 before it.`);
  const inputs = readInputs(env);
  if (!inputs.base || !inputs.head) throw new Error('Thunder review needs a base and a head commit. Run it on pull_request, or set the base and head inputs.');
  const event = env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) : null;
  const review = runReview(inputs);
  const result = await publish({ review, inputs, env, event });
  const file = join(env.RUNNER_TEMP || '.', 'thunder-review.md');
  writeFileSync(file, result.summary);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${result.summary}\n`);
  else process.stdout.write(`${result.summary}\n`);
  if (env.GITHUB_OUTPUT) {
    const out = { ...result.outputs, 'markdown-file': file };
    appendFileSync(env.GITHUB_OUTPUT, Object.entries(out).map(([k, v]) => `${k}<<THUNDER_EOF\n${v}\nTHUNDER_EOF\n`).join(''));
  }
  console.log(`Thunder review: ${result.review.says} Pull request comment: ${result.comment.action}.${result.comment.url ? ` ${result.comment.url}` : result.comment.reason ? ` ${result.comment.reason}` : ''}`);
  return result.exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => { process.exitCode = code; }, (e) => {
    console.log(`::error::Thunder review: ${e.message}`);
    // Say it where the review would have been, too.
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Thunder review could not run\n\n${e.message}\n`);
    process.exitCode = 1;
  });
}
