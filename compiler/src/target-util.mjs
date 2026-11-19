// Shared helpers for the compiled target adapters (Python/C#/Java). The statically typed targets
// (C#, Java) need a declared type for every decision parameter, which ThunderLang source leaves
// implicit, so we infer each input's type from the test-case values that will actually be passed.
import { spawnSync } from 'node:child_process';
export { inputNames, coerceVal, buildCases, inferInputTypes, strLit, litFor } from './target-types.mjs';

// Pick the last line of stdout that parses as a JSON object , build/tool chatter may precede it.
export function parseLastJsonObject(stdout) {
  if (!stdout) return null;
  const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].startsWith('{')) continue;
    try { return JSON.parse(lines[i]); } catch { /* keep scanning upward */ }
  }
  return null;
}

// Cached toolchain-availability smoke tests. Each actually exercises the exact invocation the
// adapter uses (single-file `java`, or scaffold + `dotnet run`) so a target is only reported
// runnable when it can genuinely compile and run, not merely because a binary is on PATH.
const _cache = {};
export function cachedSmoke(key, fn) {
  if (key in _cache) return _cache[key];
  let ok = false;
  try { ok = !!fn(); } catch { ok = false; }
  _cache[key] = ok;
  return ok;
}

export function toolOnPath(cmd, args = ['--version']) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15000 });
    return r.status === 0;
  } catch {
    return false;
  }
}
