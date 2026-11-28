// Reading Thunder Core files from disk for core-changes.mjs (which is browser-safe and reads nothing itself).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isCoreProgram } from './core-changes.mjs';

const SKIP = new Set(['node_modules', '.git', 'generated', 'data', 'dist', 'build', '.thunder']);

/** The Thunder Core programs in a file or folder (recursive), as [{ path, source }] with paths relative to `base`. */
export function coreFilesIn(target, base = target) {
  const out = [];
  const add = (full) => {
    if (!full.endsWith('.thunder')) return;
    const source = readFileSync(full, 'utf8');
    const path = relative(base, full).split(sep).join('/') || full.split(sep).pop();
    if (isCoreProgram(path, source)) out.push({ path, source });
  };
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (SKIP.has(name)) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full); else add(full);
      if (out.length >= 500) return;
    }
  };
  if (statSync(target).isDirectory()) walk(target); else add(target);
  return out;
}
