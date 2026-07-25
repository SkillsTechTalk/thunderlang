// Rust target adapter. Emits a self-contained single-file program that defines each decision as a
// typed fn (using the same exprToRust translator the codegen uses), calls every test case with
// typed literal arguments, and prints the results as one JSON line. It compiles with `rustc` and
// runs the produced binary, so a live Rust run grades real compiled + executed code. Returns null
// (skip cleanly) when no usable Rust toolchain exists.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exprToRust } from './expr.mjs';
import { inputNames, inferInputTypes, buildCases, parseLastJsonObject, cachedSmoke, strLit, litFor } from './target-util.mjs';

const RUST_TYPE = { number: 'f64', bool: 'bool', string: '&str' };
// f64 params reject bare integer literals, so numeric args carry an explicit f64 suffix.
const rustLit = (type, v) => (type === 'number' ? `${v == null ? 0 : v}f64` : litFor(type, v));

// Compile `source` with rustc and run the binary. Returns stdout, or null on any failure.
function rustcRun(dir, source) {
  const src = join(dir, 'main.rs');
  const bin = join(dir, process.platform === 'win32' ? 'main.exe' : 'main_bin');
  writeFileSync(src, source);
  const env = { ...process.env };
  const c = spawnSync('rustc', ['-O', src, '-o', bin], { encoding: 'utf8', timeout: 180000, env });
  if (c.status !== 0) return null;
  const r = spawnSync(bin, [], { encoding: 'utf8', timeout: 60000, env });
  if (r.status !== 0) return null;
  return r.stdout;
}

// The emitted Rust source (also usable for display / `gen`-parity).
export function emitRustModule(ast, cases = buildCases(ast)) {
  const L = [
    '#![allow(non_snake_case, unused_parens, dead_code, unused_variables)]',
    '',
  ];
  const typesByDec = {};
  for (const d of ast.decisions || []) {
    const names = inputNames(d);
    const types = inferInputTypes(ast, d);
    typesByDec[d.name] = types;
    const params = names.map((n) => `${n}: ${RUST_TYPE[types[n]] || '&str'}`).join(', ');
    L.push(`fn ${d.name}(${params}) -> &'static str {`);
    for (const r of d.rules || []) {
      let cond; try { cond = exprToRust(r.when, { inputs: names }); } catch { cond = 'false'; }
      L.push(`    if ${cond} { return ${strLit(r.result)}; }`);
    }
    L.push(`    return ${d.default == null ? '""' : strLit(d.default)};`, '}', '');
  }
  L.push('fn j(s: &str) -> String {');
  L.push('    let mut out = String::from("\\"");');
  L.push('    for c in s.chars() {');
  L.push('        match c {');
  L.push('            \'"\' | \'\\\\\' => { out.push(\'\\\\\'); out.push(c); }');
  L.push('            \'\\n\' => out.push_str("\\\\n"),');
  L.push('            _ => out.push(c),');
  L.push('        }');
  L.push('    }');
  L.push('    out.push(\'"\');');
  L.push('    out');
  L.push('}');
  L.push('');
  L.push('fn main() {');
  L.push('    let mut sb = String::from("{");');
  cases.forEach((c, idx) => {
    const dec = (ast.decisions || []).find((d) => d.name === c.fn);
    if (!dec) return;
    const types = typesByDec[c.fn];
    const argList = inputNames(dec).map((n) => rustLit(types[n], c.given[n])).join(', ');
    const sep = idx === 0 ? '' : ',';
    L.push(`    sb.push_str(&format!("{}{}:{}", ${JSON.stringify(sep)}, j(${strLit(c.key)}), j(${c.fn}(${argList}))));`);
  });
  L.push('    sb.push_str("}");');
  L.push('    println!("{}", sb);');
  L.push('}');
  return L.join('\n');
}

export function rustAvailable() {
  return cachedSmoke('rust', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tl-rust-smoke-'));
    try {
      const src = 'fn main() {\n    println!("{}", "{\\"ok\\":\\"1\\"}");\n}';
      const out = rustcRun(dir, src);
      return !!out && /"ok"/.test(out);
    } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
  });
}

// Run every decision test case through generated, compiled Rust. Returns { "Test / case": actual }
// or null when no usable Rust toolchain is present.
export function runRustTarget(ast) {
  if (!rustAvailable()) return null;
  const cases = buildCases(ast);
  const dir = mkdtempSync(join(tmpdir(), 'tl-rust-'));
  try {
    const out = rustcRun(dir, emitRustModule(ast, cases));
    return out == null ? null : parseLastJsonObject(out);
  } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
}
