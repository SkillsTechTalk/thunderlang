// Scala target adapter. Emits a self-contained Scala script that defines each decision as a typed
// def (using the same exprToScala translator the codegen uses), calls every test case with typed
// literal arguments, and prints the results as one JSON line. It runs through `scala` (falling back
// to `scala-cli run`), so a live Scala run grades real compiled + executed code. Returns null (skip
// cleanly) when no usable Scala toolchain exists.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exprToScala } from './expr.mjs';
import { inputNames, inferInputTypes, buildCases, parseLastJsonObject, cachedSmoke, strLit, litFor } from './target-util.mjs';

const SCALA_TYPE = { number: 'Double', bool: 'Boolean', string: 'String' };
// Which runner worked during the smoke, so run reuses it: [cmd, argsFor(file)].
let SCALA_RUNNER = null;

// Write `source` to a .scala file in `dir` and run it. Prefers `scala` (script mode); falls back to
// `scala-cli run`. Returns stdout, or null on any failure.
function scalaRun(dir, source) {
  const f = join(dir, 'Main.scala');
  writeFileSync(f, source);
  const env = { ...process.env };
  const runners = SCALA_RUNNER ? [SCALA_RUNNER] : [['scala', (p) => [p]], ['scala-cli', (p) => ['run', p]]];
  for (const [cmd, argsFor] of runners) {
    const r = spawnSync(cmd, argsFor(f), { encoding: 'utf8', timeout: 300000, env });
    if (r.status === 0 && r.stdout) { SCALA_RUNNER = [cmd, argsFor]; return r.stdout; }
  }
  return null;
}

// The emitted Scala source (also usable for display / `gen`-parity).
export function emitScalaModule(ast, cases = buildCases(ast)) {
  const L = [];
  const typesByDec = {};
  for (const d of ast.decisions || []) {
    const names = inputNames(d);
    const types = inferInputTypes(ast, d);
    typesByDec[d.name] = types;
    const params = names.map((n) => `${n}: ${SCALA_TYPE[types[n]] || 'String'}`).join(', ');
    L.push(`def ${d.name}(${params}): String = {`);
    for (const r of d.rules || []) {
      let cond; try { cond = exprToScala(r.when, { inputs: names }); } catch { cond = 'false'; }
      L.push(`  if (${cond}) return ${strLit(r.result)}`);
    }
    L.push(`  return ${d.default == null ? 'null' : strLit(d.default)}`, '}', '');
  }
  L.push('def j(s: String): String = {');
  L.push('  if (s == null) return "null"');
  L.push('  val b = new StringBuilder("\\"")');
  L.push('  for (c <- s) {');
  L.push('    if (c == \'"\' || c == \'\\\\\') { b.append(\'\\\\\'); b.append(c) }');
  L.push('    else if (c == \'\\n\') b.append("\\\\n")');
  L.push('    else b.append(c)');
  L.push('  }');
  L.push('  b.append(\'"\').toString');
  L.push('}');
  L.push('');
  L.push('val sb = new StringBuilder("{")');
  cases.forEach((c, idx) => {
    const dec = (ast.decisions || []).find((d) => d.name === c.fn);
    if (!dec) return;
    const types = typesByDec[c.fn];
    const argList = inputNames(dec).map((n) => litFor(types[n], c.given[n])).join(', ');
    const sep = idx === 0 ? '' : ',';
    L.push(`sb.append(${JSON.stringify(sep)}).append(j(${strLit(c.key)})).append(":").append(j(${c.fn}(${argList})))`);
  });
  L.push('sb.append("}")');
  L.push('println(sb.toString)');
  return L.join('\n');
}

export function scalaAvailable() {
  return cachedSmoke('scala', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tl-scala-smoke-'));
    try {
      const src = 'println("{\\"ok\\":\\"1\\"}")';
      const out = scalaRun(dir, src);
      return !!out && /"ok"/.test(out);
    } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
  });
}

// Run every decision test case through generated, compiled Scala. Returns { "Test / case": actual }
// or null when no usable Scala toolchain is present.
export function runScalaTarget(ast) {
  if (!scalaAvailable()) return null;
  const cases = buildCases(ast);
  const dir = mkdtempSync(join(tmpdir(), 'tl-scala-'));
  try {
    const out = scalaRun(dir, emitScalaModule(ast, cases));
    return out == null ? null : parseLastJsonObject(out);
  } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
}
