// Kotlin target adapter. Emits a self-contained Kotlin script (.kts) that defines each decision as
// a typed fun (using the same exprToKotlin translator the codegen uses), calls every test case with
// typed literal arguments, and prints the results as one JSON line. It runs through the Kotlin
// script runner (`kotlinc -script`), so a live Kotlin run grades real compiled + executed code.
// Returns null (skip cleanly) when no usable Kotlin toolchain exists.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exprToKotlin } from './expr.mjs';
import { inputNames, inferInputTypes, buildCases, parseLastJsonObject, cachedSmoke, strLit, litFor } from './target-util.mjs';

const KOTLIN_TYPE = { number: 'Double', bool: 'Boolean', string: 'String' };
// Double params reject bare integer literals, so numeric args carry an explicit decimal.
const kotlinLit = (type, v) => (type === 'number' ? `${v == null ? 0 : v}${Number.isInteger(Number(v)) ? '.0' : ''}` : litFor(type, v));

// Write `source` to a .kts file in `dir` and run it with the Kotlin script runner. Returns stdout,
// or null on any failure.
function kotlinRun(dir, source) {
  const f = join(dir, 'main.kts');
  writeFileSync(f, source);
  const env = { ...process.env };
  const r = spawnSync('kotlinc', ['-script', f], { encoding: 'utf8', timeout: 300000, env });
  if (r.status !== 0) return null;
  return r.stdout;
}

// The emitted Kotlin source (also usable for display / `gen`-parity).
export function emitKotlinModule(ast, cases = buildCases(ast)) {
  const L = [];
  const typesByDec = {};
  for (const d of ast.decisions || []) {
    const names = inputNames(d);
    const types = inferInputTypes(ast, d);
    typesByDec[d.name] = types;
    const params = names.map((n) => `${n}: ${KOTLIN_TYPE[types[n]] || 'String'}`).join(', ');
    L.push(`fun ${d.name}(${params}): String {`);
    for (const r of d.rules || []) {
      let cond; try { cond = exprToKotlin(r.when, { inputs: names }); } catch { cond = 'false'; }
      L.push(`    if (${cond}) return ${strLit(r.result)}`);
    }
    L.push(`    return ${d.default == null ? '""' : strLit(d.default)}`, '}', '');
  }
  L.push('fun j(s: String?): String {');
  L.push('    if (s == null) return "null"');
  L.push('    val b = StringBuilder("\\"")');
  L.push('    for (c in s) {');
  L.push('        if (c == \'"\' || c == \'\\\\\') { b.append(\'\\\\\'); b.append(c) }');
  L.push('        else if (c == \'\\n\') { b.append("\\\\n") }');
  L.push('        else { b.append(c) }');
  L.push('    }');
  L.push('    b.append(\'"\')');
  L.push('    return b.toString()');
  L.push('}');
  L.push('');
  L.push('val sb = StringBuilder("{")');
  cases.forEach((c, idx) => {
    const dec = (ast.decisions || []).find((d) => d.name === c.fn);
    if (!dec) return;
    const types = typesByDec[c.fn];
    const argList = inputNames(dec).map((n) => kotlinLit(types[n], c.given[n])).join(', ');
    const sep = idx === 0 ? '' : ',';
    L.push(`sb.append(${JSON.stringify(sep)}).append(j(${strLit(c.key)})).append(":").append(j(${c.fn}(${argList})))`);
  });
  L.push('sb.append("}")');
  L.push('println(sb.toString())');
  return L.join('\n');
}

export function kotlinAvailable() {
  return cachedSmoke('kotlin', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tl-kt-smoke-'));
    try {
      const src = 'println("{\\"ok\\":\\"1\\"}")';
      const out = kotlinRun(dir, src);
      return !!out && /"ok"/.test(out);
    } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
  });
}

// Run every decision test case through generated, compiled Kotlin. Returns { "Test / case": actual }
// or null when no usable Kotlin toolchain is present.
export function runKotlinTarget(ast) {
  if (!kotlinAvailable()) return null;
  const cases = buildCases(ast);
  const dir = mkdtempSync(join(tmpdir(), 'tl-kt-'));
  try {
    const out = kotlinRun(dir, emitKotlinModule(ast, cases));
    return out == null ? null : parseLastJsonObject(out);
  } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
}
