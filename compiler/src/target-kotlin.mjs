// Kotlin target adapter. Emits a self-contained Kotlin script (.kts) that defines each decision as
// a typed fun (using the same exprToKotlin translator the codegen uses), calls every test case with
// typed literal arguments, and prints the results as one JSON line. It runs through the Kotlin
// script runner (`kotlinc -script`), so a live Kotlin run grades real compiled + executed code.
//
// Results are honest (see target-result.mjs): a missing toolchain, a compile failure, a crash, or a
// timeout is a structured error, never a null answer; a decision with a rule Thunder cannot
// translate is refused ('not-translated'). Kotlin has no exact Money wiring yet, so a rule that
// compares Money is refused rather than run as a Double.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exprToKotlin } from './expr.mjs';
import { parseLastJsonObject, cachedSmoke, strLit, litFor, prepareRun, plansFor, argLit, finishRun, runFailure, classifySpawn, spawnStep } from './target-util.mjs';

const KOTLIN_TYPE = { number: 'Double', bool: 'Boolean', string: 'String' };
const KOTLIN_RUN = { translate: exprToKotlin, target: 'Kotlin', dialect: 'kotlin' };
const KOTLIN_RUNTIME = /Exception in thread|\n\s+at [\w.$]+\(/;
// Double params reject bare integer literals, so numeric args carry an explicit decimal.
const kotlinLit = (type, v) => (type === 'number' ? `${v == null ? 0 : v}${Number.isInteger(Number(v)) ? '.0' : ''}` : litFor(type, v));
// Kotlin string templates treat `$` specially, so a message literal escapes it.
const ktStr = (s) => strLit(s).replace(/\$/g, '\\$');

// Write `source` to a .kts file in `dir` and run it with the Kotlin script runner.
// Returns { ok, stdout } or { ok: false, failure }.
function kotlinRun(dir, source) {
  const f = join(dir, 'main.kts');
  writeFileSync(f, source);
  const env = { ...process.env };
  return spawnStep('kotlinc', ['-script', f], { timeout: 300000, env }, (r) => classifySpawn(r, { tool: 'kotlinc', phase: 'build+run', runtimePattern: KOTLIN_RUNTIME }));
}

// The emitted Kotlin source (also usable for display / `gen`-parity).
export function emitKotlinModule(ast, cases = prepareRun(ast, KOTLIN_RUN).cases, plans = plansFor(ast, exprToKotlin, 'Kotlin')) {
  const L = [];
  if ([...plans.values()].some((p) => p.refused)) {
    L.push('// IL-GEN-001: a rule Thunder could not translate throws instead of guessing.');
    L.push('fun thunderUntranslated(message: String): Boolean = throw UnsupportedOperationException(message)', '');
  }
  for (const p of plans.values()) {
    const params = p.names.map((n) => `${n}: ${KOTLIN_TYPE[p.types[n]] || 'String'}`).join(', ');
    L.push(`fun ${p.decision.name}(${params}): String {`);
    for (const { rule: r, code, message } of p.rules) {
      L.push(`    if (${code ?? `thunderUntranslated(${ktStr(message)})`}) return ${strLit(r.result)}`);
    }
    L.push(`    return ${p.decision.default == null ? '""' : strLit(p.decision.default)}`, '}', '');
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
  let first = true;
  for (const c of cases) {
    const p = plans.get(c.fn);
    if (!p) continue;
    const argList = p.names.map((n) => argLit(c, p, n, kotlinLit)).join(', ');
    L.push(`sb.append(${JSON.stringify(first ? '' : ',')}).append(j(${strLit(c.key)})).append(":").append(j(${c.fn}(${argList})))`);
    first = false;
  }
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
      return out.ok && /"ok"/.test(out.stdout);
    } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
  });
}

// Run every decision test case through generated, compiled Kotlin. Returns { status: 'ok', results }
// or a whole-run { status: 'error', kind, message }.
export function runKotlinTarget(ast) {
  if (!kotlinAvailable()) return runFailure('missing-toolchain', 'No usable Kotlin toolchain (kotlinc -script) on this machine.');
  const { plans, cases, refused } = prepareRun(ast, KOTLIN_RUN);
  if (!cases.length) return { status: 'ok', results: { ...refused } };
  const dir = mkdtempSync(join(tmpdir(), 'tl-kt-'));
  try {
    const out = kotlinRun(dir, emitKotlinModule(ast, cases, plans));
    if (!out.ok) return out.failure;
    const parsed = parseLastJsonObject(out.stdout);
    if (!parsed) return runFailure('runtime-error', 'kotlinc ran but printed no results.');
    return finishRun({ cases, parsed, refused, target: 'Kotlin' });
  } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
}
