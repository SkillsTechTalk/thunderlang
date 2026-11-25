// C# target adapter. Emits a self-contained Program.cs that defines each decision as a typed
// static method (using the same exprToCSharp translator the codegen uses), calls every test case
// with typed literal arguments, and prints the results as one JSON line. It runs through a
// throwaway `dotnet` console project (scaffold + `dotnet run`), so a live C# run grades real
// compiled + executed code.
//
// Results are honest (see target-result.mjs): a missing toolchain, a compile failure, a crash, or a
// timeout is a structured error, never a null answer; a decision with a rule Thunder cannot
// translate is refused ('not-translated'). Money inputs are C# decimal, never double.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exprToCSharp } from './expr.mjs';
import { parseLastJsonObject, cachedSmoke, strLit, litFor, prepareRun, plansFor, argLit, finishRun, runFailure, classifySpawn, spawnStep } from './target-util.mjs';

const CS_TYPE = { number: 'double', bool: 'bool', string: 'string', money: 'decimal' };
const CS_RUN = { translate: exprToCSharp, target: 'C#', dialect: 'csharp' };
const CS_RUNTIME = /Unhandled exception/i;

// Scaffold a bare console project in `dir`, overwrite Program.cs with `source`, and run it.
// Returns { ok, stdout } or { ok: false, failure }. A bare console app has no external packages,
// so the implicit restore is offline.
function dotnetRun(dir, source) {
  const proj = join(dir, 'app');
  const env = { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1' };
  const mk = spawnStep('dotnet', ['new', 'console', '-o', proj], { timeout: 120000, env }, (r) => classifySpawn(r, { tool: 'dotnet new', phase: 'compile' }));
  if (!mk.ok) return mk;
  writeFileSync(join(proj, 'Program.cs'), source);
  return spawnStep('dotnet', ['run', '--project', proj, '-c', 'Release'], { timeout: 240000, env }, (r) => classifySpawn(r, { tool: 'dotnet', phase: 'build+run', runtimePattern: CS_RUNTIME }));
}

// The emitted C# source (also usable for display / `gen`-parity).
export function emitCSharpModule(ast, cases = prepareRun(ast, CS_RUN).cases, plans = plansFor(ast, exprToCSharp, 'C#')) {
  const L = [
    'using System;',
    'using System.Collections.Generic;',
    'using System.Linq;',
    'using System.Text;',
    'class ThunderTarget {',
  ];
  if ([...plans.values()].some((p) => p.refused)) {
    L.push('  // IL-GEN-001: a rule Thunder could not translate throws instead of guessing.');
    L.push('  static bool ThunderUntranslated(string message) => throw new NotImplementedException(message);');
  }
  for (const p of plans.values()) {
    const params = p.names.map((n) => `${CS_TYPE[p.types[n]] || 'string'} ${n}`).join(', ');
    L.push(`  static string ${p.decision.name}(${params}) {`);
    for (const { rule: r, code, message } of p.rules) {
      L.push(`    if (${code ?? `ThunderUntranslated(${strLit(message)})`}) return ${strLit(r.result)};`);
    }
    L.push(`    return ${p.decision.default == null ? 'null' : strLit(p.decision.default)};`, '  }');
  }
  L.push('  static string J(string s) {');
  L.push('    if (s == null) return "null";');
  L.push('    var b = new StringBuilder("\\"");');
  L.push('    foreach (char c in s) {');
  L.push('      if (c == \'\\\\\' || c == \'"\') b.Append(\'\\\\\').Append(c);');
  L.push('      else if (c == \'\\n\') b.Append("\\\\n"); else b.Append(c); }');
  L.push('    return b.Append(\'"\').ToString(); }');
  L.push('  static void Main() {');
  L.push('    var outp = new List<KeyValuePair<string,string>>();');
  for (const c of cases) {
    const p = plans.get(c.fn);
    if (!p) continue;
    const argList = p.names.map((n) => argLit(c, p, n, litFor)).join(', ');
    L.push(`    outp.Add(new KeyValuePair<string,string>(${strLit(c.key)}, ${c.fn}(${argList})));`);
  }
  L.push('    var sb = new StringBuilder("{"); bool first = true;');
  L.push('    foreach (var e in outp) {');
  L.push('      if (!first) sb.Append(","); first = false;');
  L.push('      sb.Append(J(e.Key)).Append(":").Append(J(e.Value)); }');
  L.push('    Console.WriteLine(sb.Append("}").ToString());');
  L.push('  }');
  L.push('}');
  return L.join('\n');
}

export function csharpAvailable() {
  return cachedSmoke('csharp', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tl-cs-smoke-'));
    try {
      const src = 'using System; class ThunderTarget { static void Main(){ Console.WriteLine("{\\"ok\\":\\"1\\"}"); } }';
      const out = dotnetRun(dir, src);
      return out.ok && /"ok"/.test(out.stdout);
    } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
  });
}

// Run every decision test case through generated, compiled C#. Returns { status: 'ok', results }
// or a whole-run { status: 'error', kind, message }.
export function runCSharpTarget(ast) {
  if (!csharpAvailable()) return runFailure('missing-toolchain', 'No usable .NET SDK (dotnet new + dotnet run) on this machine.');
  const { plans, cases, refused } = prepareRun(ast, CS_RUN);
  if (!cases.length) return { status: 'ok', results: { ...refused } };
  const dir = mkdtempSync(join(tmpdir(), 'tl-cs-'));
  try {
    const out = dotnetRun(dir, emitCSharpModule(ast, cases, plans));
    if (!out.ok) return out.failure;
    const parsed = parseLastJsonObject(out.stdout);
    if (!parsed) return runFailure('runtime-error', 'dotnet ran but printed no results.');
    return finishRun({ cases, parsed, refused, target: 'C#' });
  } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
}
