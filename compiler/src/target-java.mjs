// Java target adapter. Emits a self-contained ThunderTarget.java that defines each decision as a
// typed static method (using the same exprToJava translator the codegen uses), calls every test
// case with typed literal arguments, and prints the results as one JSON line. It runs through the
// JDK 11+ single-file source launcher (`java ThunderTarget.java`) , no separate javac step , so a
// live Java run grades real executed code.
//
// Results are honest (see target-result.mjs): a missing toolchain, a compile failure, a crash, or a
// timeout is a structured error, never a null answer; a decision with a rule Thunder cannot
// translate is refused ('not-translated'). Money inputs are java.math.BigDecimal, never double.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exprToJava } from './expr.mjs';
import { parseLastJsonObject, cachedSmoke, strLit, litFor, prepareRun, plansFor, argLit, finishRun, runFailure, classifySpawn, spawnStep } from './target-util.mjs';

const JAVA_TYPE = { number: 'double', bool: 'boolean', string: 'String', money: 'java.math.BigDecimal' };
const JAVA_RUN = { translate: exprToJava, target: 'Java', dialect: 'java' };
const JAVA_RUNTIME = /Exception in thread|\n\s+at ThunderTarget\./;

// The emitted Java source (also usable for display / `gen`-parity).
export function emitJavaModule(ast, cases = prepareRun(ast, JAVA_RUN).cases, plans = plansFor(ast, exprToJava, 'Java')) {
  const L = [
    'import java.util.LinkedHashMap;',
    'import java.util.Map;',
    '',
    'public class ThunderTarget {',
  ];
  if ([...plans.values()].some((p) => p.refused)) {
    L.push('  // IL-GEN-001: a rule Thunder could not translate throws instead of guessing.');
    L.push('  static boolean thunderUntranslated(String message) { throw new UnsupportedOperationException(message); }');
  }
  for (const p of plans.values()) {
    const params = p.names.map((n) => `${JAVA_TYPE[p.types[n]] || 'String'} ${n}`).join(', ');
    L.push(`  static String ${p.decision.name}(${params}) {`);
    for (const { rule: r, code, message } of p.rules) {
      L.push(`    if (${code ?? `thunderUntranslated(${strLit(message)})`}) return ${strLit(r.result)};`);
    }
    L.push(`    return ${p.decision.default == null ? 'null' : strLit(p.decision.default)};`, '  }');
  }
  L.push('  static String j(String s) {');
  L.push('    if (s == null) return "null";');
  L.push('    StringBuilder b = new StringBuilder("\\"");');
  L.push('    for (int i = 0; i < s.length(); i++) { char c = s.charAt(i);');
  L.push('      if (c == \'\\\\\' || c == \'"\') b.append(\'\\\\\').append(c);');
  L.push('      else if (c == \'\\n\') b.append("\\\\n"); else b.append(c); }');
  L.push('    return b.append(\'"\').toString(); }');
  L.push('  public static void main(String[] args) {');
  L.push('    Map<String,String> out = new LinkedHashMap<>();');
  for (const c of cases) {
    const p = plans.get(c.fn);
    if (!p) continue;
    const argList = p.names.map((n) => argLit(c, p, n, litFor)).join(', ');
    L.push(`    out.put(${strLit(c.key)}, ${c.fn}(${argList}));`);
  }
  L.push('    StringBuilder sb = new StringBuilder("{"); boolean first = true;');
  L.push('    for (Map.Entry<String,String> e : out.entrySet()) {');
  L.push('      if (!first) sb.append(","); first = false;');
  L.push('      sb.append(j(e.getKey())).append(":").append(j(e.getValue())); }');
  L.push('    System.out.println(sb.append("}").toString());');
  L.push('  }');
  L.push('}');
  return L.join('\n');
}

export function javaAvailable() {
  return cachedSmoke('java', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tl-java-smoke-'));
    try {
      const f = join(dir, 'Hi.java');
      writeFileSync(f, 'public class Hi { public static void main(String[] a){ System.out.println("{\\"ok\\":\\"1\\"}"); } }');
      const r = spawnSync('java', [f], { encoding: 'utf8', timeout: 60000 });
      return r.status === 0 && /"ok"/.test(r.stdout || '');
    } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
  });
}

// Run every decision test case through generated, compiled Java. Returns { status: 'ok', results }
// or a whole-run { status: 'error', kind, message }.
export function runJavaTarget(ast) {
  if (!javaAvailable()) return runFailure('missing-toolchain', 'No usable JDK (java single-file launcher) on this machine.');
  const { plans, cases, refused } = prepareRun(ast, JAVA_RUN);
  if (!cases.length) return { status: 'ok', results: { ...refused } };
  const dir = mkdtempSync(join(tmpdir(), 'tl-java-'));
  try {
    const f = join(dir, 'ThunderTarget.java');
    writeFileSync(f, emitJavaModule(ast, cases, plans));
    const out = spawnStep('java', [f], { timeout: 120000 }, (r) => classifySpawn(r, { tool: 'java', phase: 'build+run', runtimePattern: JAVA_RUNTIME }));
    if (!out.ok) return out.failure;
    const parsed = parseLastJsonObject(out.stdout);
    if (!parsed) return runFailure('runtime-error', 'java ran but printed no results.');
    return finishRun({ cases, parsed, refused, target: 'Java' });
  } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
}
