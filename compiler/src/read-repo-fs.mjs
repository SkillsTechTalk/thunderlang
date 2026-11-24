// Node-only helper: collect readable source files from a folder on disk for readRepo().
// Kept apart from read-repo.mjs so the reader itself stays browser-safe.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { READ_SKIP_DIRS, READ_DOT_DIRS, readableLanguage } from './read-repo.mjs';

/** Returns [{ path, source }] with paths relative to `root`. Stops after `maxFiles` files. */
export function collectReadableFiles(root, { maxFiles = 5000, maxFileBytes = 400000 } = {}) {
  const out = [];
  const walk = (dir) => {
    let names;
    try { names = readdirSync(dir).sort(); } catch { return; }
    for (const name of names) {
      if (out.length > maxFiles) return;
      if (READ_SKIP_DIRS.has(name) || (name.startsWith('.') && !READ_DOT_DIRS.has(name))) continue;
      const full = join(dir, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      const path = relative(root, full).split('\\').join('/');
      if (st.isDirectory()) walk(full);
      else if (readableLanguage(path)) {
        // Oversized files are not loaded; readRepo lists them as skipped from their size.
        out.push(st.size > maxFileBytes ? { path, source: '', size: st.size } : { path, source: readFileSync(full, 'utf8') });
      } else if (/\.ya?ml$/i.test(name) && st.size <= maxFileBytes) {
        // Kubernetes YAML is known by its first lines (apiVersion: and kind:), not its name.
        const source = readFileSync(full, 'utf8');
        if (readableLanguage(path, source.slice(0, 2048))) out.push({ path, source });
      }
    }
  };
  walk(root);
  return out;
}
