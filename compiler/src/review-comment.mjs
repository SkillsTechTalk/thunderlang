// The pull request comment for a Thunder review (thunder-review-v1, see review.mjs): what the change does, in plain
// sentences, grouped by the action, rule, or function it changed, with the risks first and honest counts of what was
// explained in sentences, what is only shown as code, and what a person has to check because Thunder cannot.
//
// Pure and browser-safe, with no imports, so the GitHub Action (action/thunder-review.mjs) can render a review made by
// any published compiler version. The wording comes from the review itself: this file never says "safe" or "same";
// it only repeats what the review showed and counts it.

export const REVIEW_MARKER = '<!-- thunder-review -->';
/** GitHub rejects comment bodies over 65,536 characters; stay under it with room for the marker and footer. */
export const GITHUB_COMMENT_LIMIT = 65536;
export const COMMENT_TITLE = 'Thunder review: what this change does, in plain sentences';
/** When a member no longer fits in full, at most this many of its sentences are shown. */
const COMPACT_SENTENCES = 3;
const DOCS_URL = 'https://thunderlang.dev/docs/github-action';
const SITE_URL = 'https://thunderlang.dev';

// What a person has to check because Thunder could not read or does not read it.
const CANNOT_CHECK = new Set(['unreadable', 'infrastructure', 'not-read']);
// Changes Thunder shows as the code before and after, rather than explaining in sentences.
const SHOWN_AS_CODE = new Set(['hidden', 'outside']);

/** How an item reached the reviewer: 'explained' (in sentences), 'code' (shown as code), or 'person' (cannot check). */
export function itemHow(x) {
  if (CANNOT_CHECK.has(x.kind) || (x.kind === 'added' && x.severity === 'risk')) return 'person';
  if (SHOWN_AS_CODE.has(x.kind)) return 'code';
  return 'explained';
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Honest counts for the comment's second line. Each item counts once, as in the review's own summary. */
export function reviewCounts(r) {
  const c = { explained: 0, code: 0, person: 0, notRead: r.notRead?.length ?? 0 };
  for (const x of r.items) c[itemHow(x)]++;
  return c;
}

export function countsLine(c) {
  const parts = [`${plural(c.explained, 'change')} explained in sentences`, `${c.code} shown as code (Thunder did not put ${c.code === 1 ? 'it' : 'them'} into words)`];
  parts.push(`${c.person} Thunder cannot check (check ${c.person === 1 ? 'it' : 'them'} yourself)`);
  if (c.notRead) parts.push(`${plural(c.notRead, 'file')} Thunder does not read`);
  return `${parts.join(' · ')}.`;
}

const esc = (s) => String(s).replace(/[<>]/g, (ch) => (ch === '<' ? '&lt;' : '&gt;'));
const fence = (lines) => ['```', ...lines.map((l) => l.replace(/```/g, "'''")), '```'];
const cutLines = (lines, max) => (lines.length > max ? [...lines.slice(0, max), `… ${lines.length - max} more lines`] : lines);

function evidence(ev, maxLines) {
  if (!ev) return [];
  const out = [];
  if (ev.counterexample) out.push(`Tried on both versions: when ${ev.counterexample.facts}, before: **${ev.counterexample.before}**, after: **${ev.counterexample.after}**.`, '');
  if (ev.before?.length) out.push('Before:', ...fence(cutLines(ev.before, maxLines)));
  if (ev.after?.length) out.push('After:', ...fence(cutLines(ev.after, maxLines)));
  return out;
}

const HEADINGS = {
  risk: ['Needs a careful look', 'A Stop removed or under new conditions, a new address, something that now reaches outside the program, or code Thunder cannot check.'],
  meaning: ['Changes in meaning', 'Anything else that changes what the code does.'],
  form: ['Only the form changed', 'Shown, not guessed: the same code apart from spacing, comments, or names it declares itself, or a rule with the same answer on every edge case.'],
};

/**
 * Render a thunder-review-v1 review as one sticky pull request comment.
 * options: { maxChars (default 60000, under GITHUB_COMMENT_LIMIT; pass more for a job summary), fileUrl(file, line) => url|null,
 *   notes: string[] (shown as quotes under the counts), footer, evidenceLines (per before or after block) }
 * Returns the Markdown; it always starts with REVIEW_MARKER and is never longer than maxChars: members that do not fit
 * are left out whole and counted ("N more not shown"), so no code block or <details> is cut in half.
 */
export function renderReviewComment(r, { maxChars = 60000, fileUrl = null, notes = [], footer = '', evidenceLines = 40 } = {}) {
  const where = (w) => {
    const label = `\`${esc(w.file)}:${w.line}\``;
    const url = fileUrl?.(w.file, w.line);
    return url ? `[${label}](${url})` : label;
  };
  const head = [REVIEW_MARKER, `### ${COMMENT_TITLE}`, '', `**${r.says}**`, '', countsLine(reviewCounts(r)), ''];
  for (const n of notes.filter(Boolean)) head.push(`> ${n}`, '');

  // One block per changed action, rule, or function (a "member"), in the review's order of importance.
  const blocks = [];
  for (const sev of ['risk', 'meaning', 'form']) {
    const list = r.items.filter((x) => x.severity === sev);
    if (!list.length) continue;
    const members = new Map();
    for (const x of list) {
      const k = `${x.where.file}\u0000${x.subject}`;
      if (!members.has(k)) members.set(k, []);
      members.get(k).push(x);
    }
    const [title, why] = HEADINGS[sev];
    const open = sev === 'form' ? [`<details><summary>${title} (${list.length})</summary>`, '', `_${why}_`, ''] : [`#### ${title} (${list.length})`, '', `_${why}_`, ''];
    const close = sev === 'form' ? ['</details>', ''] : [];
    // Each member twice: in full, and compact (its first sentences, without the code) for when the full one no longer fits.
    const memberBlocks = [...members.values()].map((xs) => {
      const render = (compact) => {
        const lines = [`- **${esc(xs[0].subject)}** · ${where(xs[0].where)}`];
        const list = compact ? xs.slice(0, COMPACT_SENTENCES) : xs;
        for (const x of list) {
          const ev = sev === 'form' ? [] : evidence(x.evidence, evidenceLines);
          const at = x.where.line !== xs[0].where.line || x.where.file !== xs[0].where.file ? ` (${where(x.where)})` : '';
          lines.push(`  - ${esc(x.says)}${at}${compact && (ev.length || x.also?.length) ? ' _(Before and after, and other places: in the job summary.)_' : ''}`);
          if (compact) continue;
          if (ev.length) lines.push('', `    <details><summary>Before and after</summary>`, '', ...ev.map((l) => (l ? `    ${l}` : '')), '', '    </details>', '');
          if (x.also?.length) {
            lines.push('', `    <details><summary>The same in ${x.also.length} more</summary>`, '', ...x.also.slice(0, 50).map((a) => `    - **${esc(a.subject)}** · ${where(a.where)}`),
              ...(x.also.length > 50 ? [`    - and ${x.also.length - 50} more`] : []), '', '    </details>', '');
          }
        }
        if (list.length < xs.length) lines.push(`  - _…and ${xs.length - list.length} more changes to it, in the job summary._`);
        return { lines, items: list.length };
      };
      return { full: render(false), compact: render(true) };
    });
    blocks.push({ open, close, members: memberBlocks });
  }
  const tail = [];
  if (r.notRead?.length) tail.push(`Also changed, not read by Thunder (check ${r.notRead.length === 1 ? 'it' : 'them'} yourself if ${r.notRead.length === 1 ? 'it matters' : 'they matter'}): ${r.notRead.slice(0, 20).map((f) => `\`${esc(f.path)}\``).join(', ')}${r.notRead.length > 20 ? `, and ${r.notRead.length - 20} more` : ''}.`, '');
  const foot = ['---', `<sub>Read from the code by the Thunder compiler, with no AI and without running the code. "Only the form changed" is said only when it is shown. Thunder describes the change; a person still decides whether it is right. [How this works](${DOCS_URL}) · [thunderlang.dev](${SITE_URL})${footer ? ` · ${footer}` : ''}</sub>`, ''];

  // Fill blocks in order of importance. A member that does not fit in full is shown compact (its sentences); when
  // even that does not fit, stop there and say how many were left out.
  const size = (lines) => lines.join('\n').length + 1;
  const total = r.items.length;
  const moreLine = (n) => [`**${n} more not shown** to stay under GitHub's comment size limit. The job summary and \`thunder review\` on your computer have all of them.`, ''];
  const reserve = size(head) + size(tail) + size(foot) + size(moreLine(total)) + 64;
  if (reserve > maxChars) throw new Error(`maxChars ${maxChars} is too small for the comment header and footer.`);
  let used = reserve, shown = 0, full = true;
  const body = [];
  for (const b of blocks) {
    if (!full) break;
    const opened = size(b.open) + size(b.close);
    if (used + opened + (b.members[0] ? size(b.members[0].compact.lines) : 0) > maxChars) { full = false; break; }
    body.push(...b.open); used += opened;
    for (const m of b.members) {
      const pick = used + size(m.full.lines) <= maxChars ? m.full : used + size(m.compact.lines) <= maxChars ? m.compact : null;
      if (!pick) { full = false; break; }
      body.push(...pick.lines); used += size(pick.lines); shown += pick.items;
    }
    body.push('', ...b.close);
  }
  const out = [...head, ...body, ...(shown < total ? moreLine(total - shown) : []), ...tail, ...foot];
  return out.join('\n');
}
