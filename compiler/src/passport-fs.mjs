// Thunder Software Passport, the Node side: read the parts (folders or repositories), what changed since a base
// commit, run the test commands you name, and hand everything to assemblePassport (passport.mjs, pure).
// Only git and the commands you pass with `run` are executed; nothing else is run, fetched, or sent anywhere.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { basename, join, resolve, relative } from 'node:path';
import { collectReadableFiles } from './read-repo-fs.mjs';
import { assemblePassport, checkPassport } from './passport.mjs';
import { COMPILER_VERSION } from './emit.mjs';
import { byText } from './text-order.mjs';

const git = (dir, args) => {
  try { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 }); } catch { return null; }
};

const SKIP = new Set(['node_modules', '.git', 'bin', 'obj', 'dist', 'build', '__pycache__', '.venv', 'venv', 'target', '.next']);

/** Packages a part declares: package.json dependencies, requirements.txt, and .csproj PackageReference. */
function packagesIn(root) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let names = [];
    try { names = readdirSync(dir).sort(); } catch { return; }
    for (const n of names) {
      if (SKIP.has(n)) continue;
      const full = join(dir, n);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) { walk(full, depth + 1); continue; }
      const rel = relative(root, full).split('\\').join('/');
      try {
        if (n === 'package.json') {
          const j = JSON.parse(readFileSync(full, 'utf8'));
          for (const k of ['dependencies', 'devDependencies']) for (const [name, version] of Object.entries(j[k] ?? {})) out.push({ name, version: String(version), from: rel, ...(k === 'devDependencies' ? { dev: true } : {}) });
        } else if (n === 'requirements.txt') {
          for (const line of readFileSync(full, 'utf8').split('\n')) {
            const m = line.replace(/#.*/, '').trim().match(/^([A-Za-z0-9_.-]+)\s*(.*)$/);
            if (m) out.push({ name: m[1], ...(m[2] ? { version: m[2] } : {}), from: rel });
          }
        } else if (/\.csproj$/.test(n)) {
          for (const m of readFileSync(full, 'utf8').matchAll(/<PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]+)")?/g)) out.push({ name: m[1], ...(m[2] ? { version: m[2] } : {}), from: rel });
        }
      } catch { /* a manifest Thunder cannot parse is not a package list */ }
    }
  };
  walk(root, 0);
  return out;
}

/** What changed in one part since `base` (committed and not), with each changed file's base version. */
function changesSince(root, base) {
  const prefix = git(root, ['rev-parse', '--show-prefix'])?.trim() ?? '';
  const diff = git(root, ['diff', '--unified=0', '--no-color', '--no-renames', base, '--', '.']) ?? '';
  const byFile = new Map();
  let cur = null;
  for (const line of diff.split('\n')) {
    let m;
    if ((m = line.match(/^diff --git a\/(.+) b\/(.+)$/))) { cur = { file: m[2], ranges: [], status: 'changed' }; byFile.set(cur.file, cur); }
    else if (cur && line.startsWith('new file mode')) cur.status = 'added';
    else if (cur && line.startsWith('deleted file mode')) cur.status = 'removed';
    else if (cur && (m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/))) {
      const start = Number(m[1]), n = m[2] === undefined ? 1 : Number(m[2]);
      cur.ranges.push(n === 0 ? [Math.max(1, start), Math.max(1, start)] : [start, start + n - 1]);
    }
  }
  for (const f of (git(root, ['ls-files', '--others', '--exclude-standard', '--', '.']) ?? '').split('\n').filter(Boolean)) {
    const file = prefix + f;
    if (!byFile.has(file)) byFile.set(file, { file, ranges: [], status: 'added' });
  }
  const out = [];
  for (const c of byFile.values()) {
    if (!c.file.startsWith(prefix)) continue;
    const old = c.status === 'added' ? null : git(root, ['show', `${base}:${c.file}`]);
    out.push({ file: c.file.slice(prefix.length), status: c.status, ranges: c.ranges, old: old == null || old.includes('\0') ? null : old });
  }
  return out.sort((a, b) => byText(a.file, b.file));
}

/**
 * Evidence items from a thunder-access-v1 report (the ownership check, src/flow/access.mjs, when present). One item
 * per route that has a verdict. `partOf(file)` names the part a file is in when the report does not say.
 */
export function accessEvidence(report, partOf = () => null) {
  const words = { guarded: 'checks that the record belongs to the caller on every path', unguarded: 'has a path with no ownership check (every step was followed)', 'cannot tell': 'cannot be told: Thunder could not follow every step', 'cannot-tell': 'cannot be told: Thunder could not follow every step' };
  return (report?.routes ?? []).filter((r) => r.verdict).map((r) => {
    const part = r.part ?? partOf(r.file);
    const files = [...new Set([r.file, ...(r.paths ?? []).flatMap((x) => (x.steps ?? []).map((st) => st.file))].filter(Boolean))];
    return {
      kind: 'access-flow', status: 'read',
      claim: `${r.method && r.path ? `${r.method} ${r.path}` : r.route ?? 'A route'}${part ? ` in ${part}` : ''} ${words[r.verdict] ?? `has the verdict "${r.verdict}"`}.`,
      basis: { schema: report.schema ?? 'thunder-access-v1', verdict: r.verdict, at: r.file ? `${part ? `${part}:` : ''}${r.file}${r.line ? `:${r.line}` : ''}` : null, why: r.why ?? null },
      scope: 'Read from code by the ownership check; nothing was run. Only the frameworks and data libraries it supports, and only these files.',
      inputs: part ? files.map((file) => ({ part, file })) : [],
    };
  });
}

/**
 * Build a passport from folders on disk.
 *   parts:    folder paths (each one part, named by its folder, as Thunder Trace takes them)
 *   base:     a commit to compare with (a change); none for a snapshot
 *   head:     must be the checked-out commit when given (the passport reads the files on disk)
 *   run:      commands to run and record; "billing: python3 -m unittest" runs in the part named billing
 *   purpose:  { text, source } (from --purpose or --purpose-file); never invented
 *   evidence: extra evidence (parsed JSON: a thunder-access-v1 result, or a list of evidence items)
 *   relativeTo: where part paths are recorded from (the passport's folder, so `check` finds them later)
 */
export function buildPassport({ parts, base = null, head = null, run = [], purpose = null, evidence = [], access = null, relativeTo = process.cwd(), builtAt, timeoutMs = 20 * 60 * 1000 } = {}) {
  if (!parts?.length) throw new Error('name at least one folder to describe.');
  const names = new Set();
  const read = parts.map((dir) => {
    const root = resolve(dir);
    let ok = false;
    try { ok = statSync(root).isDirectory(); } catch { /* missing */ }
    if (!ok) throw new Error(`${dir} is not a folder.`);
    const name = basename(root);
    if (names.has(name)) throw new Error(`two parts are called "${name}"; give folders with different names.`);
    names.add(name);
    const top = git(root, ['rev-parse', '--show-toplevel'])?.trim() ?? null;
    const sha = top ? git(root, ['rev-parse', 'HEAD'])?.trim() || null : null;
    const dirty = top ? !!git(root, ['status', '--porcelain', '--', '.'])?.trim() : false;
    if (head && top) {
      const want = git(root, ['rev-parse', '--verify', `${head}^{commit}`])?.trim();
      if (!want) throw new Error(`${head} is not a commit in ${dir}.`);
      if (want !== sha) throw new Error(`the passport reads the files on disk, and ${dir} is not at ${head}. Check out ${head} first.`);
    }
    let changes;
    if (base) {
      if (!top) throw new Error(`${dir} is not in a git repository, so there is no ${base} to compare with.`);
      if (!git(root, ['rev-parse', '--verify', `${base}^{commit}`])?.trim()) throw new Error(`${base} is not a commit in ${dir}.`);
      changes = changesSince(root, base);
    }
    const files = collectReadableFiles(root).map((f) => ({ path: f.path, source: f.source }));
    return { name, root, path: relative(relativeTo, root).split('\\').join('/') || '.', sha, dirty, files, packages: packagesIn(root), ...(changes ? { changes } : {}) };
  });

  const runs = run.map((spec) => {
    const m = String(spec).match(/^([A-Za-z0-9_.-]+):\s+(.+)$/);
    const part = m && read.find((p) => p.name === m[1]) ? m[1] : null;
    const command = part ? m[2] : String(spec);
    const cwd = part ? read.find((p) => p.name === part).root : process.cwd();
    const r = spawnSync(`(${command}) 2>&1`, { shell: true, cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
    const exitCode = r.status ?? (r.error || r.signal ? 1 : 0);
    const output = `${r.stdout ?? ''}${r.error ? `\n(${r.error.message})` : ''}${r.signal ? `\n(stopped by ${r.signal})` : ''}`;
    return { command, part, cwd: relative(relativeTo, cwd).split('\\').join('/') || '.', exitCode, output };
  });

  const extra = [];
  // A file path names its part when exactly one part has it.
  const partOf = (file) => { const hits = read.filter((p) => p.files.some((f) => f.path === file)); return hits.length === 1 ? hits[0].name : null; };
  // The ownership check, when given (the CLI passes accessFlow when src/flow/access.mjs is there): run per part.
  if (typeof access === 'function') {
    for (const p of read) {
      try { extra.push(...accessEvidence(access(p.files), () => p.name)); } catch { /* a part the check cannot read adds no evidence */ }
    }
  }
  for (const e of evidence) {
    if (e?.schema === 'thunder-access-v1') extra.push(...accessEvidence(e, partOf));
    else if (Array.isArray(e)) extra.push(...e.filter((x) => x && x.kind && x.claim && x.basis && x.scope).map((x) => ({ status: 'read', ...x })));
  }
  const change = base ? { base: git(read[0].root, ['rev-parse', base])?.trim() ?? base, head: head ? read[0].sha : read[0].sha ? `${read[0].sha}${read.some((p) => p.dirty) ? ' (with uncommitted changes)' : ''}` : null } : null;
  return assemblePassport({ parts: read, change, runs, purpose, extra, builtAt, thunder: COMPILER_VERSION });
}

/**
 * Check a passport against the files on disk: each evidence item current or stale. Part folders are found from
 * the paths the passport recorded, relative to `baseDir` (the passport's folder), unless `dirs` names them.
 */
export function checkPassportOnDisk(passport, { baseDir = process.cwd(), dirs = {} } = {}) {
  const where = new Map(passport.subject.parts.map((p) => [p.name, dirs[p.name] ? resolve(dirs[p.name]) : resolve(baseDir, p.path)]));
  return checkPassport(passport, {
    read: (part, file) => {
      const root = where.get(part);
      if (!root) return null;
      const full = join(root, file);
      try { return existsSync(full) ? readFileSync(full, 'utf8') : null; } catch { return null; }
    },
  });
}

