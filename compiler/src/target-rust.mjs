// Rust target adapter. Emits a self-contained single-file program that defines each decision as a
// typed fn (using the same exprToRust translator the codegen uses), calls every test case with
// typed literal arguments, and prints the results as one JSON line. It compiles with `rustc` and
// runs the produced binary, so a live Rust run grades real compiled + executed code.
//
// Results are honest (see target-result.mjs): a missing toolchain, a compile failure, a crash, or a
// timeout is a structured error, never a null answer; a decision with a rule Thunder cannot
// translate is refused ('not-translated'). Money inputs are i64 minor units, never floats.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exprToRust } from './expr.mjs';
import { parseLastJsonObject, cachedSmoke, strLit, litFor, prepareRun, plansFor, argLit, finishRun, runFailure, classifySpawn, spawnStep } from './target-util.mjs';

const RUST_TYPE = { number: 'f64', bool: 'bool', string: '&str', money: 'i64' };
const RUST_RUN = { translate: exprToRust, target: 'Rust', dialect: 'rust' };
// f64 params reject bare integer literals, so numeric args carry an explicit f64 suffix.
const rustLit = (type, v) => (type === 'number' ? `${v == null ? 0 : v}f64` : litFor(type, v));

// Compile `source` with rustc and run the binary. Returns { ok, stdout } or { ok: false, failure }.
function rustcRun(dir, source) {
  const src = join(dir, 'main.rs');
  const bin = join(dir, process.platform === 'win32' ? 'main.exe' : 'main_bin');
  writeFileSync(src, source);
  const env = { ...process.env };
  const c = spawnStep('rustc', ['-O', src, '-o', bin], { timeout: 180000, env }, (r) => classifySpawn(r, { tool: 'rustc', phase: 'compile' }));
  if (!c.ok) return c;
  return spawnStep(bin, [], { timeout: 60000, env }, (r) => classifySpawn(r, { tool: 'the compiled Rust program', phase: 'run' }));
}

// The emitted Rust source (also usable for display / `gen`-parity).
export function emitRustModule(ast, cases = prepareRun(ast, RUST_RUN).cases, plans = plansFor(ast, exprToRust, 'Rust')) {
  const L = [
    '#![allow(non_snake_case, unused_parens, dead_code, unused_variables)]',
    '',
  ];
  if ([...plans.values()].some((p) => p.refused)) {
    L.push('// IL-GEN-001: a rule Thunder could not translate panics instead of guessing.');
    L.push('fn thunder_untranslated(message: &str) -> bool {', '    panic!("{}", message)', '}', '');
  }
  for (const p of plans.values()) {
    const params = p.names.map((n) => `${n}: ${RUST_TYPE[p.types[n]] || '&str'}`).join(', ');
    L.push(`fn ${p.decision.name}(${params}) -> &'static str {`);
    for (const { rule: r, code, message } of p.rules) {
      L.push(`    if ${code ?? `thunder_untranslated(${strLit(message)})`} { return ${strLit(r.result)}; }`);
    }
    L.push(`    return ${p.decision.default == null ? '""' : strLit(p.decision.default)};`, '}', '');
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
  let first = true;
  for (const c of cases) {
    const p = plans.get(c.fn);
    if (!p) continue;
    const argList = p.names.map((n) => argLit(c, p, n, rustLit)).join(', ');
    L.push(`    sb.push_str(&format!("{}{}:{}", ${JSON.stringify(first ? '' : ',')}, j(${strLit(c.key)}), j(${c.fn}(${argList}))));`);
    first = false;
  }
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
      return out.ok && /"ok"/.test(out.stdout);
    } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
  });
}

// Run every decision test case through generated, compiled Rust. Returns { status: 'ok', results }
// or a whole-run { status: 'error', kind, message }.
export function runRustTarget(ast) {
  if (!rustAvailable()) return runFailure('missing-toolchain', 'No usable Rust toolchain (rustc) on this machine.');
  const { plans, cases, refused } = prepareRun(ast, RUST_RUN);
  if (!cases.length) return { status: 'ok', results: { ...refused } };
  const dir = mkdtempSync(join(tmpdir(), 'tl-rust-'));
  try {
    const out = rustcRun(dir, emitRustModule(ast, cases, plans));
    if (!out.ok) return out.failure;
    const parsed = parseLastJsonObject(out.stdout);
    if (!parsed) return runFailure('runtime-error', 'The compiled Rust program printed no results.');
    return finishRun({ cases, parsed, refused, target: 'Rust' });
  } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
}
