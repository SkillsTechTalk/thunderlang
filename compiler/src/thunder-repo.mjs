// Node-only: Thunder a whole repository (a local folder or a public GitHub repo).
// Read-only by design: files are parsed by the Thunder code reader, never executed, imported, or built.
// A GitHub URL is shallow-cloned with `git` (argument list, no shell) into a fresh temp folder.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectReadableFiles } from './read-repo-fs.mjs';
import { readRepo } from './read-repo.mjs';
import { plainFromReading, conditionText } from './plain-contract.mjs';

export const THUNDER_REPO_SCHEMA = 'thunder-repo-v1';
const GITHUB = /^(?:https:\/\/github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/;
const MONEY = /^(amount|price|total|charge|balance|refund|cost|fee|tax|discount)/i;
const spaced = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();

/** Parse "owner/repo" or "https://github.com/owner/repo"; returns null for anything else. */
export function parseGitHub(target) {
  const m = String(target).trim().match(GITHUB);
  if (!m || m[2] === '.' || m[2] === '..') return null;
  return { owner: m[1], repo: m[2], url: `https://github.com/${m[1]}/${m[2]}.git` };
}

function cloneGitHub(gh, { timeoutMs = 120000 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'thunder-repo-'));
  const res = spawnSync('git', ['clone', '--depth', '1', '--quiet', '--no-tags', gh.url, join(dir, 'repo')], {
    timeout: timeoutMs, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (res.status !== 0) { rmSync(dir, { recursive: true, force: true }); throw new Error(`Could not clone ${gh.owner}/${gh.repo}: ${(res.stderr || res.error?.message || 'git failed').trim().split('\n')[0]}`); }
  const head = spawnSync('git', ['-C', join(dir, 'repo'), 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  return { root: join(dir, 'repo'), cleanup: () => rmSync(dir, { recursive: true, force: true }), commit: head.stdout.trim() || null };
}

/** Thunder a repository: every readable file through the code reader, every drawable decision as a Thunder card. */
export function thunderRepo(target, { maxFiles = 3000, keep = false, exampleLimit = 8 } = {}) {
  const gh = parseGitHub(target);
  let isDir = false;
  try { isDir = statSync(target).isDirectory(); } catch { /* not a local path */ }
  if (!isDir && !gh) throw new Error('Give a local folder, owner/repo, or https://github.com/owner/repo.');
  const started = Date.now();
  const src = isDir ? { root: target, cleanup: () => {}, commit: null } : cloneGitHub(gh);
  try {
    const files = collectReadableFiles(src.root, { maxFiles });
    const reading = readRepo(files, { maxFiles });
    const decisions = reading.items.filter((i) => i.kind === 'decision');
    const cards = [], errors = [];
    for (const d of decisions) {
      try { const m = plainFromReading(d); if (m) cards.push({ item: d, model: m }); }
      catch (e) { errors.push({ file: d.file, name: d.name, error: e instanceof Error ? e.message : String(e) }); }
    }
    const functions = reading.items.filter((i) => i.kind === 'function');
    const unread = [...decisions.filter((d) => d.status !== 'read'), ...functions.filter((f) => f.status !== 'read')];
    const money = cards.filter((c) => c.model.inputs.some((i) => MONEY.test(i.id)));
    const examples = [...money, ...cards.filter((c) => !money.includes(c))].slice(0, exampleLimit).map(({ item, model }) => ({
      file: item.file, name: item.name, line: item.line,
      reads: model.rules.map((r) => `${r.outcome} when ${r.conditions.map((c) => conditionText(model, c)).join(r.join === 'all' ? ' and ' : ' or ')}`).concat(`otherwise ${model.otherwise}`),
    }));
    return {
      schema: THUNDER_REPO_SCHEMA,
      source: gh && !isDir ? `github.com/${gh.owner}/${gh.repo}` : target,
      commit: src.commit,
      seconds: Math.round((Date.now() - started) / 100) / 10,
      languages: reading.languages,
      files: reading.files.length,
      skipped: reading.skipped.length,
      counts: { ...reading.counts, cards: cards.length, decisionsNotDrawn: decisions.length - cards.length, unreadFunctions: unread.length, readerErrors: errors.length },
      focus: [
        ...money.slice(0, 5).map(({ item }) => ({ kind: 'money', file: item.file, name: item.name, line: item.line, reason: 'Decides about money; read from code only, so a person should confirm it.' })),
        ...unread.slice(0, 5).map((i) => ({ kind: 'unreadable', file: i.file, name: i.name, line: i.line, reason: 'Thunder cannot fully read this yet: read the code.' })),
      ],
      examples, errors,
      readOnly: true,
      note: 'Read from code by the Thunder code reader: no code was executed. Cards show what the code does today; a person decides whether that is what the team wants.',
      ...(keep ? { localPath: src.root } : {}),
    };
  } finally { if (!keep) src.cleanup(); }
}

/** A short Thunder Brief for the terminal. */
export function renderThunderRepo(r) {
  const langs = Object.entries(r.languages).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ${n}`).join(', ');
  const c = r.counts;
  const out = [
    `Thunder Brief: ${r.source}${r.commit ? ` @ ${r.commit.slice(0, 10)}` : ''}`,
    `${r.files} files read (${langs || 'none'})${r.skipped ? `, ${r.skipped} skipped` : ''}, in ${r.seconds}s. Read-only: nothing was executed.`,
    `${c.decision} decisions found; ${c.cards} drawn as Thunder cards, ${c.decisionsNotDrawn} shown as dashed cards. ${c.function} other functions (${c.unreadFunctions} not fully read). ${c.route ?? 0} routes, ${c.guarded ?? 0} guarded functions.`,
  ];
  if (r.examples.length) {
    out.push('', 'Rules read in Thunder (read from code; confirm with a person):');
    for (const e of r.examples) { out.push(`  ${e.file}:${e.line}  ${spaced(e.name)}`); for (const line of e.reads) out.push(`    ${line}`); }
  }
  if (r.focus.length) { out.push('', 'Thunder Focus (look here first):'); for (const f of r.focus) out.push(`  [${f.kind}] ${f.file}:${f.line} ${spaced(f.name)}: ${f.reason}`); }
  if (r.errors.length) { out.push('', `Reader errors (${r.errors.length}):`); for (const e of r.errors.slice(0, 5)) out.push(`  ${e.file} ${e.name}: ${e.error}`); }
  return out.join('\n');
}
