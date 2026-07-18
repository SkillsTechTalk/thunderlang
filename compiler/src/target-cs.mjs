// C# target adapter. Emits a self-contained Program.cs that defines each decision as a typed
// static method (using the same exprToCSharp translator the codegen uses), calls every test case
// with typed literal arguments, and prints the results as one JSON line. It runs through a
// throwaway `dotnet` console project (scaffold + `dotnet run`), so a live C# run grades real
// compiled + executed code. Returns null (skip cleanly) when no usable .NET SDK exists.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exprToCSharp } from './expr.mjs';
import { inputNames, inferInputTypes, buildCases, parseLastJsonObject, cachedSmoke, strLit, litFor } from './target-util.mjs';

const CS_TYPE = { number: 'double', bool: 'bool', string: 'string' };

// Scaffold a bare console project in `dir`, overwrite Program.cs with `source`, and run it.
// Returns stdout, or null on any failure. A bare console app has no external packages, so the
// implicit restore is offline.
function dotnetRun(dir, source) {
  const proj = join(dir, 'app');
  const mk = spawnSync('dotnet', ['new', 'console', '-o', proj, '--nologo'], { encoding: 'utf8', timeout: 120000 });
  if (mk.status !== 0) return null;
  writeFileSync(join(proj, 'Program.cs'), source);
  const run = spawnSync('dotnet', ['run', '--project', proj, '-c', 'Release', '--nologo'], { encoding: 'utf8', timeout: 240000 });
  if (run.status !== 0) return null;
  return run.stdout;
}

// The emitted C# source (also usable for display / `gen`-parity).
export function emitCSharpModule(ast, cases = buildCases(ast)) {
  const L = [
    'using System;',
    'using System.Collections.Generic;',
    'using System.Linq;',
    'using System.Text;',
    'class ThunderTarget {',
  ];
  const typesByDec = {};
  for (const d of ast.decisions || []) {
    const names = inputNames(d);
    const types = inferInputTypes(ast, d);
    typesByDec[d.name] = types;
    const params = names.map((n) => `${CS_TYPE[types[n]] || 'string'} ${n}`).join(', ');
    L.push(`  static string ${d.name}(${params}) {`);
    for (const r of d.rules || []) {
      let cond; try { cond = exprToCSharp(r.when, { inputs: names }); } catch { cond = 'false'; }
      L.push(`    if (${cond}) return ${strLit(r.result)};`);
    }
    L.push(`    return ${d.default == null ? 'null' : strLit(d.default)};`, '  }');
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
    const dec = (ast.decisions || []).find((d) => d.name === c.fn);
    if (!dec) continue;
    const types = typesByDec[c.fn];
    const argList = inputNames(dec).map((n) => litFor(types[n], c.given[n])).join(', ');
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
      return !!out && /"ok"/.test(out);
    } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
  });
}

// Run every decision test case through generated, compiled C#. Returns { "Test / case": actual }
// or null when no usable .NET SDK is present.
export function runCSharpTarget(ast) {
  if (!csharpAvailable()) return null;
  const cases = buildCases(ast);
  const dir = mkdtempSync(join(tmpdir(), 'tl-cs-'));
  try {
    const out = dotnetRun(dir, emitCSharpModule(ast, cases));
    return out == null ? null : parseLastJsonObject(out);
  } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
}
