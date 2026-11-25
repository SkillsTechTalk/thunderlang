// Scala target adapter. Emits a self-contained Scala script that defines each decision as a typed
// def (using the same exprToScala translator the codegen uses), calls every test case with typed
// literal arguments, and prints the results as one JSON line. It runs through `scala` (falling back
// to `scala-cli run`), so a live Scala run grades real compiled + executed code.
//
// Results are honest (see target-result.mjs): a missing toolchain, a compile failure, a crash, or a
// timeout is a structured error, never a null answer; a decision with a rule Thunder cannot
// translate is refused ('not-translated'). Scala has no exact Money wiring yet, so a rule that
// compares Money is refused rather than run as a Double.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exprToScala } from './expr.mjs';
import { parseLastJsonObject, cachedSmoke, strLit, litFor, prepareRun, plansFor, argLit, finishRun, runFailure, classifySpawn, spawnStep } from './target-util.mjs';

const SCALA_TYPE = { number: 'Double', bool: 'Boolean', string: 'String' };
const SCALA_RUN = { translate: exprToScala, target: 'Scala', dialect: 'scala' };
const SCALA_RUNTIME = /Exception in thread|\n\s+at [\w.$]+\(/;
// Which runner worked during the smoke, so run reuses it: [cmd, argsFor(file)].
let SCALA_RUNNER = null;

// Write `source` to a .scala file in `dir` and run it. Prefers `scala` (script mode); falls back to
// `scala-cli run`. Returns { ok, stdout } or { ok: false, failure } (the last runner's failure).
function scalaRun(dir, source) {
  const f = join(dir, 'Main.scala');
  writeFileSync(f, source);
  const env = { ...process.env };
  const runners = SCALA_RUNNER ? [SCALA_RUNNER] : [['scala', (p) => [p]], ['scala-cli', (p) => ['run', p]]];
  let last = { ok: false, failure: runFailure('missing-toolchain', 'Neither scala nor scala-cli is installed or on PATH.') };
  for (const [cmd, argsFor] of runners) {
    const r = spawnStep(cmd, argsFor(f), { timeout: 300000, env }, (x) => classifySpawn(x, { tool: cmd, phase: 'build+run', runtimePattern: SCALA_RUNTIME }));
    if (r.ok && r.stdout) { SCALA_RUNNER = [cmd, argsFor]; return r; }
    if (!r.ok && (r.failure.kind !== 'missing-toolchain' || last.failure.kind === 'missing-toolchain')) last = r;
  }
  return last;
}

// The emitted Scala source (also usable for display / `gen`-parity).
export function emitScalaModule(ast, cases = prepareRun(ast, SCALA_RUN).cases, plans = plansFor(ast, exprToScala, 'Scala')) {
  const L = [];
  if ([...plans.values()].some((p) => p.refused)) {
    L.push('// IL-GEN-001: a rule Thunder could not translate throws instead of guessing.');
    L.push('def thunderUntranslated(message: String): Boolean = throw new UnsupportedOperationException(message)', '');
  }
  for (const p of plans.values()) {
    const params = p.names.map((n) => `${n}: ${SCALA_TYPE[p.types[n]] || 'String'}`).join(', ');
    L.push(`def ${p.decision.name}(${params}): String = {`);
    for (const { rule: r, code, message } of p.rules) {
      L.push(`  if (${code ?? `thunderUntranslated(${strLit(message)})`}) return ${strLit(r.result)}`);
    }
    L.push(`  return ${p.decision.default == null ? 'null' : strLit(p.decision.default)}`, '}', '');
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
  let first = true;
  for (const c of cases) {
    const p = plans.get(c.fn);
    if (!p) continue;
    const argList = p.names.map((n) => argLit(c, p, n, litFor)).join(', ');
    L.push(`sb.append(${JSON.stringify(first ? '' : ',')}).append(j(${strLit(c.key)})).append(":").append(j(${c.fn}(${argList})))`);
    first = false;
  }
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
      return out.ok && /"ok"/.test(out.stdout);
    } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
  });
}

// Run every decision test case through generated, compiled Scala. Returns { status: 'ok', results }
// or a whole-run { status: 'error', kind, message }.
export function runScalaTarget(ast) {
  if (!scalaAvailable()) return runFailure('missing-toolchain', 'No usable Scala toolchain (scala or scala-cli) on this machine.');
  const { plans, cases, refused } = prepareRun(ast, SCALA_RUN);
  if (!cases.length) return { status: 'ok', results: { ...refused } };
  const dir = mkdtempSync(join(tmpdir(), 'tl-scala-'));
  try {
    const out = scalaRun(dir, emitScalaModule(ast, cases, plans));
    if (!out.ok) return out.failure;
    const parsed = parseLastJsonObject(out.stdout);
    if (!parsed) return runFailure('runtime-error', 'scala ran but printed no results.');
    return finishRun({ cases, parsed, refused, target: 'Scala' });
  } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
}
