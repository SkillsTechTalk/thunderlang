// Node-only helper: collect readable source files from a folder on disk for readRepo().
// Kept apart from read-repo.mjs so the reader itself stays browser-safe.
import { readdirSync, readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join, relative } from 'node:path';
import { READ_SKIP_DIRS, READ_DOT_DIRS, readableLanguage, isShellScript } from './read-repo.mjs';

/** A file with no extension is read when its first line is a shell shebang; only its first bytes are looked at. */
function shebangShell(full, size) {
  if (size < 3 || size > 400000) return false;
  let fd;
  try {
    fd = openSync(full, 'r');
    const buf = Buffer.alloc(120);
    const n = readSync(fd, buf, 0, 120, 0);
    return isShellScript(buf.subarray(0, n).toString('utf8'));
  } catch { return false; } finally { if (fd != null) closeSync(fd); }
}

const MANIFEST = /^(go\.mod|package\.json|tsconfig\.json|jsconfig\.json)$/;
/**
 * Returns [{ path, source }] with paths relative to `root`. Stops after `maxFiles` files. `manifests`: also the
 * go.mod, package.json, and tsconfig/jsconfig files that say which imports are this repo's own (for thunderModel's
 * calls across files); they are not code and are not read as code.
 */
// manifestNames: which manifest files `manifests` brings (Thunder Trace also wants requirements.txt and *.csproj).
// templates: also bring Angular component templates (*.component.html), which screens read with their component.
export function collectReadableFiles(root, { maxFiles = 5000, maxFileBytes = 400000, manifests = false, manifestNames = MANIFEST, templates = false } = {}) {
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
      else if (manifests && manifestNames.test(name) && st.size <= maxFileBytes) out.push({ path, source: readFileSync(full, 'utf8'), manifest: true });
      else if (templates && /\.component\.html$/i.test(name) && st.size <= maxFileBytes) out.push({ path, source: readFileSync(full, 'utf8'), template: true });
      else if (readableLanguage(path) || (!name.includes('.') && shebangShell(full, st.size))) {
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
