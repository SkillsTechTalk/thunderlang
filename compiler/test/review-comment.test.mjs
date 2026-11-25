// renderReviewComment: the sticky pull request comment the GitHub Action posts (src/review-comment.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { thunderReview } from '../src/review.mjs';
import { renderReviewComment, reviewCounts, itemHow, REVIEW_MARKER, COMMENT_TITLE, GITHUB_COMMENT_LIMIT } from '../src/review-comment.mjs';
import { renderReviewComment as fromCore } from '../src/core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN = readFileSync(join(HERE, 'fixtures', 'handlers', 'admin-cron.ts'), 'utf8');
const ADMIN_OPEN = ADMIN.replace(/  if \(req\.headers[\s\S]*?\n  \}\n/, '');
const FEE = (n) => `def late_fee(days_late: int) -> str:\n    if days_late <= 0:\n        return "NoFee"\n    if days_late <= ${n}:\n        return "SmallFee"\n    return "BigFee"\n`;

const realReview = () => thunderReview(
  [{ path: 'app/server.ts', source: ADMIN_OPEN }, { path: 'app/fees.py', source: FEE(7) }, { path: 'README.md', source: 'v1\n' }, { path: 'main.tf', source: 'resource "x" "y" {}\n' }],
  [{ path: 'app/server.ts', source: ADMIN }, { path: 'app/fees.py', source: FEE(10) }, { path: 'README.md', source: 'v2\n' }, { path: 'main.tf', source: 'resource "x" "z" {}\n' }],
);

const balanced = (md) => {
  assert.equal((md.match(/<details>/g) || []).length, (md.match(/<\/details>/g) || []).length, 'every <details> is closed');
  assert.equal((md.match(/^\s*```/gm) || []).length % 2, 0, 'every code block is closed');
};

test('the comment: marker, plain-sentence header, the review\'s own summary, and honest counts', () => {
  const r = realReview();
  const md = renderReviewComment(r);
  assert.ok(md.startsWith(`${REVIEW_MARKER}\n### ${COMMENT_TITLE}`));
  assert.equal(COMMENT_TITLE, 'Thunder review: what this change does, in plain sentences');
  assert.ok(md.includes(`**${r.says}**`));
  const c = reviewCounts(r);
  assert.equal(c.explained + c.code + c.person, r.items.length);
  assert.equal(c.person, 1, 'the Terraform file is for a person to check');
  assert.match(md, /explained in sentences · 0 shown as code \(Thunder did not put them into words\) · 1 Thunder cannot check \(check it yourself\) · 1 file Thunder does not read\./);
  assert.match(md, /infrastructure or pipeline file\. Thunder does not read these in this version, so check it yourself\./);
  assert.match(md, /Also changed, not read by Thunder .*`README\.md`/);
  assert.match(md, /\[thunderlang\.dev\]\(https:\/\/thunderlang\.dev\)/);
  // Risks come first, then meaning; the Stop and the rule limit are each under their function.
  assert.ok(md.indexOf('#### Needs a careful look') < md.indexOf('#### Changes in meaning'));
  assert.match(md, /Now stops with 403 Forbidden \("forbidden"\) when the x-admin-secret header is not the ADMIN_SECRET setting\./);
  assert.match(md, /the limit between Small fee and Big fee moved from 7 to 10 days late/);
  assert.match(md, /Tried on both versions: when/);
  // The comment never claims more than the review showed.
  assert.doesNotMatch(md, /\bsafe\b/i);
  assert.doesNotMatch(md, /\bno risks?\b/i);
  balanced(md);
  assert.equal(fromCore, renderReviewComment, 'exported from the browser-safe core');
});

test('one block per changed member: several changes to one function are listed under it once', () => {
  const r = { says: '2 changes in meaning, 0 risks, 0 form-only.', notRead: [], summary: {}, items: [
    { kind: 'stop-added', severity: 'meaning', subject: 'Pay', where: { file: 'a.py', line: 3 }, says: 'Now stops with E.' },
    { kind: 'input-added', severity: 'meaning', subject: 'Pay', where: { file: 'a.py', line: 1 }, says: 'Now also takes amount.' },
    { kind: 'hidden', severity: 'meaning', subject: 'Ship', where: { file: 'b.py', line: 9 }, says: 'Changed, check: Thunder reads the same, but the code differs.', evidence: { before: ['> a = 1'], after: ['> a = 2'] } },
  ] };
  const md = renderReviewComment(r, { fileUrl: (f, l) => `https://github.com/o/r/blob/abc/${f}#L${l}` });
  assert.equal((md.match(/- \*\*Pay\*\*/g) || []).length, 1);
  assert.match(md, /- \*\*Pay\*\* · \[`a\.py:3`\]\(https:\/\/github\.com\/o\/r\/blob\/abc\/a\.py#L3\)\n  - Now stops with E\.\n  - Now also takes amount\. \(\[`a\.py:1`\]/);
  assert.equal(itemHow(r.items[2]), 'code');
  assert.match(md, /2 changes explained in sentences · 1 shown as code \(Thunder did not put it into words\) · 0 Thunder cannot check/);
  assert.match(md, /<details><summary>Before and after<\/summary>/);
  balanced(md);
});

test('form-only changes are collapsed; notes are shown under the counts', () => {
  const r = { says: '0 changes in meaning, 0 risks, 1 form-only.', notRead: [], summary: {}, items: [
    { kind: 'form', severity: 'form', subject: 'Total', where: { file: 'a.py', line: 1 }, says: 'Only the form changed: spacing, line breaks, or comments; the code is otherwise identical.' },
  ] };
  const md = renderReviewComment(r, { notes: ['This pull request comes from a fork.'] });
  assert.match(md, /<details><summary>Only the form changed \(1\)<\/summary>/);
  assert.match(md, /> This pull request comes from a fork\./);
  balanced(md);
});

test('size cap: whole members are left out and counted, never cut in half, under GitHub\'s limit', () => {
  const big = Array.from({ length: 60 }, (_, i) => `> line ${i} ${'x'.repeat(120)}`);
  const items = Array.from({ length: 400 }, (_, i) => ({ kind: 'steps', severity: i % 7 ? 'meaning' : 'risk', subject: `fn${i}`, where: { file: `src/f${i}.ts`, line: i + 1 }, says: 'Steps changed, check the before and after.', evidence: { before: big, after: big } }));
  const r = { says: 'many', notRead: [], summary: {}, items };
  const md = renderReviewComment(r, { evidenceLines: 25 });
  assert.ok(md.length <= 60000, `length ${md.length}`);
  assert.ok(md.length < GITHUB_COMMENT_LIMIT);
  const m = md.match(/\*\*(\d+) more not shown\*\* to stay under GitHub's comment size limit/);
  assert.ok(m, 'says how many were left out');
  const shown = (md.match(/^- \*\*fn\d+\*\*/gm) || []).length;
  assert.equal(shown + Number(m[1]), 400);
  assert.match(md, /… 35 more lines/, 'each before and after is cut to 25 lines when asked');
  balanced(md);
  assert.ok(md.trimEnd().endsWith('</sub>'), 'the footer is always kept');
  // A bigger budget (the job summary) shows everything.
  const all = renderReviewComment(r, { maxChars: 10_000_000 });
  assert.doesNotMatch(all, /more not shown/);
  assert.throws(() => renderReviewComment(r, { maxChars: 100 }), /too small/);
});

test('size cap: a member too big in full is shown compact (its first sentences), and the count stays exact', () => {
  const big = Array.from({ length: 25 }, (_, i) => `> ${i} ${'y'.repeat(200)}`);
  const one = Array.from({ length: 10 }, (_, i) => ({ kind: 'steps', severity: 'meaning', subject: 'Huge', where: { file: 'h.py', line: i + 1 }, says: `Change ${i}.`, evidence: { before: big, after: big } }));
  const small = { kind: 'input-added', severity: 'meaning', subject: 'Small', where: { file: 's.py', line: 1 }, says: 'Now also takes x.' };
  const md = renderReviewComment({ says: 's', notRead: [], summary: {}, items: [...one, small] }, { maxChars: 20000 });
  assert.ok(md.length <= 20000);
  assert.match(md, /  - Change 0\. _\(Before and after, and other places: in the job summary\.\)_/);
  assert.match(md, /  - _…and 7 more changes to it, in the job summary\._/);
  assert.match(md, /Now also takes x\./, 'later members still fit');
  assert.match(md, /\*\*7 more not shown\*\*/);
  balanced(md);
});
