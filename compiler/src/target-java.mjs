// Java target adapter. Emits a self-contained ThunderTarget.java that defines each decision as a
// typed static method (using the same exprToJava translator the codegen uses), calls every test
// case with typed literal arguments, and prints the results as one JSON line. It runs through the
// JDK 11+ single-file source launcher (`java ThunderTarget.java`) , no separate javac step , so a
// live Java run grades real executed code. Returns null (skip cleanly) when no usable JDK exists.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exprToJava } from './expr.mjs';
import { inputNames, inferInputTypes, buildCases, parseLastJsonObject, cachedSmoke, strLit, litFor } from './target-util.mjs';

const JAVA_TYPE = { number: 'double', bool: 'boolean', string: 'String' };

// The emitted Java source (also usable for display / `gen`-parity).
export function emitJavaModule(ast, cases = buildCases(ast)) {
  const L = [
    'import java.util.LinkedHashMap;',
    'import java.util.Map;',
    '',
    'public class ThunderTarget {',
  ];
  const typesByDec = {};
  for (const d of ast.decisions || []) {
    const names = inputNames(d);
    const types = inferInputTypes(ast, d);
    typesByDec[d.name] = types;
    const params = names.map((n) => `${JAVA_TYPE[types[n]] || 'String'} ${n}`).join(', ');
    L.push(`  static String ${d.name}(${params}) {`);
    for (const r of d.rules || []) {
      let cond; try { cond = exprToJava(r.when, { inputs: names }); } catch { cond = 'false'; }
      L.push(`    if (${cond}) return ${strLit(r.result)};`);
    }
    L.push(`    return ${d.default == null ? 'null' : strLit(d.default)};`, '  }');
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
    const dec = (ast.decisions || []).find((d) => d.name === c.fn);
    if (!dec) continue;
    const types = typesByDec[c.fn];
    const argList = inputNames(dec).map((n) => litFor(types[n], c.given[n])).join(', ');
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

// Run every decision test case through generated, compiled Java. Returns { "Test / case": actual }
// or null when no usable JDK is present.
export function runJavaTarget(ast) {
  if (!javaAvailable()) return null;
  const cases = buildCases(ast);
  const dir = mkdtempSync(join(tmpdir(), 'tl-java-'));
  try {
    const f = join(dir, 'ThunderTarget.java');
    writeFileSync(f, emitJavaModule(ast, cases));
    const r = spawnSync('java', [f], { encoding: 'utf8', timeout: 120000 });
    if (r.status !== 0) return null;
    return parseLastJsonObject(r.stdout);
  } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
}
