// Node-only helper: collect readable source files from a folder on disk for readRepo().
// Kept apart from read-repo.mjs so the reader itself stays browser-safe.
import { readdirSync, readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join, relative } from 'node:path';
import { READ_SKIP_DIRS, readableLanguage, isShellScript } from './read-repo.mjs';

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

/** Returns [{ path, source }] with paths relative to `root`. Stops after `maxFiles` files. */
export function collectReadableFiles(root, { maxFiles = 5000, maxFileBytes = 400000 } = {}) {
  const out = [];
  const walk = (dir) => {
    let names;
    try { names = readdirSync(dir).sort(); } catch { return; }
    for (const name of names) {
      if (out.length > maxFiles) return;
      if (READ_SKIP_DIRS.has(name) || name.startsWith('.')) continue;
      const full = join(dir, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full);
      else if (readableLanguage(name) || (!name.includes('.') && shebangShell(full, st.size))) {
        const path = relative(root, full).split('\\').join('/');
        // Oversized files are not loaded; readRepo lists them as skipped from their size.
        out.push(st.size > maxFileBytes ? { path, source: '', size: st.size } : { path, source: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(root);
  return out;
}
