// Elixir target adapter. Like the Python adapter, this compiles each decision into an executable
// function using the SAME expression translator the codegen uses (exprToElixir), then runs the test
// cases through a real `elixir` child process and returns actual outputs, so a live Elixir run
// grades real executed code. Elixir function names must start lowercase, so each decision `Foo`
// becomes `d_Foo`. Returns null (skip cleanly) when the elixir runtime is unavailable.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exprToElixir } from './expr.mjs';
import { inputNames, inferInputTypes, buildCases, parseLastJsonObject, cachedSmoke, strLit, litFor } from './target-util.mjs';

// Write `source` to a .exs file in `dir` and run it. Returns stdout, or null on any failure.
function elixirRun(dir, source) {
  const f = join(dir, 'main.exs');
  writeFileSync(f, source);
  const env = { ...process.env };
  const r = spawnSync('elixir', [f], { encoding: 'utf8', timeout: 120000, env });
  if (r.status !== 0) return null;
  return r.stdout;
}

// The emitted Elixir source (also usable for display / `gen`-parity).
export function emitElixirModule(ast, cases = buildCases(ast)) {
  const L = ['defmodule ThunderTarget do'];
  const typesByDec = {};
  for (const d of ast.decisions || []) {
    const names = inputNames(d);
    typesByDec[d.name] = inferInputTypes(ast, d);
    L.push(`  def d_${d.name}(${names.join(', ')}) do`);
    L.push('    cond do');
    for (const r of d.rules || []) {
      let cond; try { cond = exprToElixir(r.when, { inputs: names }); } catch { cond = 'false'; }
      L.push(`      ${cond} -> ${strLit(r.result)}`);
    }
    L.push(`      true -> ${d.default == null ? 'nil' : strLit(d.default)}`);
    L.push('    end');
    L.push('  end');
  }
  L.push('end');
  L.push('');
  L.push('pairs = [');
  cases.forEach((c) => {
    const dec = (ast.decisions || []).find((d) => d.name === c.fn);
    if (!dec) return;
    const types = typesByDec[c.fn];
    const argList = inputNames(dec).map((n) => litFor(types[n], c.given[n])).join(', ');
    L.push(`  {${strLit(c.key)}, ThunderTarget.d_${c.fn}(${argList})},`);
  });
  L.push(']');
  // inspect/1 renders a binary as a valid JSON string for ordinary content (quotes/backslashes/
  // newlines escaped); nil becomes JSON null. parseLastJsonObject then reads the printed line.
  L.push('json = "{" <> Enum.map_join(pairs, ",", fn {k, v} -> inspect(k) <> ":" <> (if is_nil(v), do: "null", else: inspect(v)) end) <> "}"');
  L.push('IO.puts(json)');
  return L.join('\n');
}

export function elixirAvailable() {
  return cachedSmoke('elixir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tl-ex-smoke-'));
    try {
      const src = 'IO.puts("{\\"ok\\":\\"1\\"}")';
      const out = elixirRun(dir, src);
      return !!out && /"ok"/.test(out);
    } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
  });
}

// Run every decision test case through generated, executed Elixir. Returns { "Test / case": actual }
// or null when the elixir runtime is not present.
export function runElixirTarget(ast) {
  if (!elixirAvailable()) return null;
  const cases = buildCases(ast);
  const dir = mkdtempSync(join(tmpdir(), 'tl-ex-'));
  try {
    const out = elixirRun(dir, emitElixirModule(ast, cases));
    return out == null ? null : parseLastJsonObject(out);
  } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
}
