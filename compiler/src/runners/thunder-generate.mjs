// Proof by running, JavaScript inputs: when code has no tests Thunder can run, call each exported function that looks
// free of side effects with inputs made from the values its own body mentions (each number, one either side, 0, empty
// text, null, undefined, true/false). Run under thunder-trace.cjs, which records what happened.
//   node --require thunder-trace.cjs thunder-generate.mjs <root> [maxCalls]
import { readdirSync, statSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = realpathSync(process.argv[2]);
const cap = Number(process.argv[3] || 200);
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
const TEST = /(^|\/)(test|tests|__tests__|spec|specs|fixtures?)\/|\.(test|spec)\.[cm]?js$/;
// A function is called only when its text names nothing that reaches outside: no modules, files, network, processes,
// timers, randomness, or evaluation of text as code.
const UNSAFE = /\b(require|import|fetch|process|globalThis|window|document|fs|child_process|setTimeout|setInterval|setImmediate|Promise|XMLHttpRequest|WebSocket|eval|Function|Math\.random|Date|crypto|console|this|async|await|yield|while)\b/;

function files(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (SKIP.has(name) || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.(m?js|cjs)$/.test(name) && !TEST.test(relative(root, full).split(sep).join('/'))) out.push(full);
  }
  return out;
}

function valuesFor(text) {
  const nums = new Set([0, 1, -1]);
  for (const m of text.matchAll(/(?<![\w.$])(-?\d+(?:\.\d+)?)(?![\w.])/g)) { const n = Number(m[1]); if (Number.isFinite(n) && nums.size < 14) { nums.add(n - 1); nums.add(n); nums.add(n + 1); } }
  const strs = new Set(['', 'x']);
  for (const m of text.matchAll(/(["'])((?:\\.|(?!\1).){0,40})\1/g)) if (strs.size < 10) strs.add(m[2]);
  return [...nums, ...strs, null, undefined, true, false, [], [1, 20, 3]];
}

let calls = 0;
for (const file of files(root)) {
  let mod;
  try { mod = await import(pathToFileURL(file).href); } catch { continue; }
  const source = readFileSync(file, 'utf8');
  for (const [name, f] of Object.entries(mod)) {
    if (typeof f !== 'function' || /^class\b/.test(Function.prototype.toString.call(f))) continue;
    const text = Function.prototype.toString.call(f);
    if (UNSAFE.test(text.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""')) || !source.includes(text.slice(0, 40))) continue;
    const values = valuesFor(text);
    const arity = Math.max(f.length, 1);
    const total = values.length ** arity;
    let seed = 7;
    const pick = () => { seed = (seed * 48271) % 2147483647; return values[seed % values.length]; };
    const combos = total <= cap ? [...Array(total).keys()].map((i) => Array.from({ length: arity }, (_, k) => values[Math.floor(i / values.length ** k) % values.length])) : Array.from({ length: cap }, () => Array.from({ length: arity }, pick));
    for (const args of combos) {
      calls++;
      try { f(...args.map((a) => (Array.isArray(a) ? [...a] : a))); } catch { /* a Stop is a behavior too */ }
    }
  }
}
process.stdout.write(JSON.stringify({ calls }));
