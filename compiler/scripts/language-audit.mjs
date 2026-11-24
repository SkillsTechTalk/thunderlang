#!/usr/bin/env node
// Language audit: read real open-source repositories in every language Thunder reads, and measure what a reader
// would miss. For each repo: functions read, reader errors, how many functions are fully explained, and BRANCH
// COMPLETENESS: every else / elif / except / catch / finally / rescue / ensure in the source must appear in
// Thunder. Usage: node scripts/language-audit.mjs [--json] [--keep <dir>] [owner/repo ...]
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectReadableFiles } from '../src/read-repo-fs.mjs';
import { readableLanguage } from '../src/read-repo.mjs';
import { readCode } from '../src/read.mjs';

export const AUDIT_REPOS = [
  { language: 'Python', repo: 'psf/requests' },
  { language: 'TypeScript', repo: 'sindresorhus/ky' },
  { language: 'TypeScript (React)', repo: 'jaredpalmer/formik' },
  { language: 'JavaScript', repo: 'expressjs/express' },
  { language: 'Go', repo: 'spf13/cobra' },
  { language: 'Rust', repo: 'rust-lang/log' },
  { language: 'C#', repo: 'jbogard/MediatR' },
  { language: 'Java', repo: 'google/gson' },
  { language: 'Kotlin + Java', repo: 'JakeWharton/timber' },
  { language: 'PHP', repo: 'guzzle/guzzle' },
  { language: 'Ruby', repo: 'sinatra/sinatra' },
  { language: 'R', repo: 'tidyverse/dplyr' },
  { language: 'Shell', repo: 'nvm-sh/nvm' },
  { language: 'PowerShell', repo: 'PowerShell/PSScriptAnalyzer' },
];

// A clause keyword at the start of a statement (or right after a closing brace), outside comments.
const CLAUSE_RE = /(?:^|[}\s;])(?:else\s+if|elseif|elsif|elif|else|except|catch|finally|rescue|ensure)\b(?!\s*[:=]\s*[^:\n]*$)/g;
const COMMENT_RE = /^\s*(#|\/\/|\*|\/\*)/;

function clausesInSource(lines, [from, to], language, skip = () => false) {
  let n = 0;
  for (let l = from; l <= to; l++) {
    const t = lines[l - 1] ?? '';
    if (COMMENT_RE.test(t) || skip(l)) continue;
    const code = t.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""').replace(/(\/\/|#).*$/, '');
    // Ruby/Python one-line conditional expressions (x if c else y, cond ? a : b) are not clauses.
    if (language === 'python' && /\bif\b.+\belse\b/.test(code) && !/^\s*(el)?if\b/.test(code)) continue;
    if (/^\s*(else\s+if|elseif|elsif|elif|else|except|catch|finally|rescue|ensure)\b/.test(code) || /}\s*(else\s+if|elseif|else|catch|finally)\b/.test(code)) n += (code.match(CLAUSE_RE) || []).length;
  }
  return n;
}

function clausesInSteps(steps) {
  let n = 0;
  for (const s of steps || []) {
    if (s.otherwise) n += 1 + clausesInSteps(s.otherwise);
    // A Kotlin `else ->` arm of a when is its else branch, shown as "Otherwise".
    if (s.caseLabel && /^else\s*->/.test(s.code || '')) n += 1;
    for (const h of s.handlers || []) n += 1 + clausesInSteps(h.steps);
    if (s.always) n += 1 + clausesInSteps(s.always.steps);
    n += clausesInSteps(s.children);
  }
  return n;
}
const allSteps = (steps) => (steps || []).flatMap((s) => [s, ...allSteps(s.children), ...allSteps(s.otherwise), ...(s.handlers || []).flatMap((h) => allSteps(h.steps)), ...allSteps(s.always?.steps)]);

export function auditFiles(files) {
  const r = { files: 0, functions: 0, errors: 0, explained: 0, sourceClauses: 0, shownClauses: 0, steps: 0, restates: 0, worst: [] };
  for (const f of files) {
    const language = readableLanguage(f.path, f.source);
    if (!language || !f.source || /(^|\/)(test|tests|spec|__tests__|vendor|node_modules)\//.test(f.path)) continue;
    r.files++;
    let reading;
    try { reading = readCode(f.source, { language, file: f.path }); } catch { r.errors++; continue; }
    // Multi-line strings (Go backticks, Python triple quotes, JS templates) are blanked so words inside them, such as
    // a bash script's "else", are not counted as code. Line numbers are kept.
    const lines = f.source.replace(/`[^`]*`|"""[\s\S]*?"""|'''[\s\S]*?'''/g, (m) => m.replace(/[^\n]/g, ' ')).split('\n');
    for (const it of reading.items) {
      if (it.kind !== 'function') continue;
      r.functions++;
      const range = it.anchor?.bodyLines;
      // A script's top-level item (shell, PowerShell, R) leaves out the functions defined inside its lines.
      const others = it.topLevel ? reading.items.filter((x) => x !== it && (x.kind === 'function' || x.kind === 'decision')).map((x) => [x.line, x.anchor?.bodyLines?.[1] ?? Math.max(x.line, ...(x.rules || []).map((q) => q.line), x.otherwise?.line ?? 0)]) : [];
      const src = range ? clausesInSource(lines, range, language, (l) => others.some(([a, b]) => l >= a && l <= b)) : 0;
      const shown = clausesInSteps(it.steps);
      r.sourceClauses += src;
      r.shownClauses += Math.min(shown, src);
      const all = allSteps(it.steps);
      r.steps += all.length;
      r.restates += all.filter((s) => s.restates || s.kind === 'other').length;
      if (src === 0 || shown >= src) { if ((it.stepsReadable ?? 0) >= 0.8) r.explained++; }
      else if (r.worst.length < 3) r.worst.push(`${f.path}:${it.line} ${it.name} (${shown} of ${src} clauses)`);
    }
  }
  return r;
}

function clone(repo, dir) {
  const dest = join(dir, repo.replace('/', '__'));
  if (existsSync(dest)) return dest;
  const res = spawnSync('git', ['clone', '--depth', '1', '--quiet', `https://github.com/${repo}.git`, dest], { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (res.status !== 0) throw new Error(`clone failed: ${(res.stderr || '').trim().split('\n')[0]}`);
  return dest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const keepAt = args.indexOf('--keep');
  const dir = keepAt >= 0 ? args[keepAt + 1] : mkdtempSync(join(tmpdir(), 'thunder-audit-'));
  const only = args.filter((a, i) => !a.startsWith('--') && (keepAt < 0 || i !== keepAt + 1));
  const repos = only.length ? only.map((r) => ({ language: '', repo: r })) : AUDIT_REPOS;
  const rows = [];
  for (const { language, repo } of repos) {
    try {
      const r = auditFiles(collectReadableFiles(clone(repo, dir)));
      rows.push({ language, repo, ...r });
    } catch (e) { rows.push({ language, repo, failed: e.message }); }
  }
  if (keepAt < 0) rmSync(dir, { recursive: true, force: true });
  if (json) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : 'n/a');
  console.log('| Language | Repository | Files | Functions | Reader errors | Branches shown (else/catch/finally) | Steps explained | Fully explained functions |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    if (r.failed) { console.log(`| ${r.language} | ${r.repo} | could not run: ${r.failed} | | | | | |`); continue; }
    console.log(`| ${r.language} | ${r.repo} | ${r.files} | ${r.functions} | ${r.errors} | ${r.shownClauses} of ${r.sourceClauses} (${pct(r.shownClauses, r.sourceClauses)}) | ${pct(r.steps - r.restates, r.steps)} | ${r.explained} (${pct(r.explained, r.functions)}) |`);
  }
  const misses = rows.filter((r) => r.worst?.length);
  if (misses.length) { console.log('\nExamples of branches still missing:'); for (const r of misses) for (const w of r.worst) console.log(`  ${r.repo}: ${w}`); }
}
