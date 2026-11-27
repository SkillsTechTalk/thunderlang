// Thunder Trace, the Node side: read repository folders and their git state, and the lines a change touched.
// The linking itself is in trace.mjs (browser-safe).
import { execFileSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { statSync } from 'node:fs';
import { collectReadableFiles } from './read-repo-fs.mjs';
import { thunderModel } from './model.mjs';
import { serviceFacts } from './system.mjs';
import { tablesIn } from './trace-data.mjs';

const TRACE_MANIFESTS = /^(go\.mod|package\.json|tsconfig\.json|jsconfig\.json|requirements\.txt|.+\.csproj)$/i;

const git = (dir, args) => {
  try { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }); } catch { return null; }
};

/** A folder as a repository for buildTrace: { name, files, sha, dirty, root }. */
export function readRepoDir(dir, { maxFiles = 5000 } = {}) {
  const root = resolve(dir);
  let ok = false;
  try { ok = statSync(root).isDirectory(); } catch { /* missing */ }
  if (!ok) throw new Error(`${dir} is not a folder.`);
  const top = git(root, ['rev-parse', '--show-toplevel'])?.trim();
  const sha = top ? git(root, ['rev-parse', 'HEAD'])?.trim() || null : null;
  const dirty = top ? !!git(root, ['status', '--porcelain'])?.trim() : false;
  // Manifests come too: package.json, go.mod, requirements.txt, and *.csproj say which packages a repository
  // publishes and depends on (they are not read as code).
  return { name: basename(root), root, sha, dirty, files: collectReadableFiles(root, { maxFiles, manifests: true, manifestNames: TRACE_MANIFESTS }) };
}

/** The commit a branch started from: --base if given, else where HEAD left main/master (origin first), else HEAD. */
export function baseOf(dir, base) {
  if (base) return git(dir, ['rev-parse', '--verify', `${base}^{commit}`])?.trim() ? base : null;
  for (const b of ['origin/main', 'origin/master', 'main', 'master']) {
    const mb = git(dir, ['merge-base', 'HEAD', b])?.trim();
    if (mb) return mb;
  }
  return git(dir, ['rev-parse', '--verify', 'HEAD'])?.trim() ? 'HEAD' : null;
}

/**
 * What changed in one repository since `base`, including uncommitted and new files, as traceImpact changes.
 * For a changed or removed file, `before` holds what it offered at the base commit (routes, listeners, events).
 */
export function gitChanges(repo, base) {
  const dir = repo.root;
  const b = baseOf(dir, base);
  if (!b) return { base: null, changes: [], why: base ? `${repo.name} has no commit ${base}` : `${repo.name} is not a git repository with commits` };
  const prefix = (git(dir, ['rev-parse', '--show-prefix'])?.trim() ?? '');
  const diff = git(dir, ['diff', '--unified=0', '--no-color', '--no-renames', b, '--', '.']) ?? '';
  const byFile = new Map();
  let cur = null;
  for (const line of diff.split('\n')) {
    let m;
    if ((m = line.match(/^diff --git a\/(.+) b\/(.+)$/))) { cur = { file: m[2], ranges: [], status: 'changed' }; byFile.set(cur.file, cur); }
    else if (cur && line.startsWith('new file mode')) cur.status = 'added';
    else if (cur && line.startsWith('deleted file mode')) cur.status = 'removed';
    else if (cur && (m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/))) {
      const start = Number(m[1]), n = m[2] === undefined ? 1 : Number(m[2]);
      // A pure deletion (+start,0) sits between line `start` and the next one: it touches what spans that gap (a
      // statement or a function it was inside), not the line before it.
      cur.ranges.push(n === 0 ? [start + 0.5, start + 0.5] : [start, start + n - 1]);
    }
  }
  for (const f of (git(dir, ['ls-files', '--others', '--exclude-standard', '--', '.']) ?? '').split('\n').filter(Boolean)) {
    const file = prefix + f;
    if (!byFile.has(file)) byFile.set(file, { file, ranges: [], status: 'added' });
  }
  const changes = [];
  for (const c of byFile.values()) {
    if (!c.file.startsWith(prefix)) continue;
    const file = c.file.slice(prefix.length); // paths relative to the folder that was traced
    let before = null;
    if (c.status !== 'added') {
      const old = git(dir, ['show', `${b}:${c.file}`]);
      if (old != null) {
        try { const files = [{ path: file, source: old }]; const f = serviceFacts(thunderModel(files), files); before = { routes: f.routes, listeners: f.listeners, publishes: f.publishes, tables: tablesIn(files) }; } catch { before = null; }
      }
    }
    changes.push({ repo: repo.name, file, ranges: c.ranges, status: c.status, ...(before ? { before } : {}) });
  }
  return { base: b, changes };
}
