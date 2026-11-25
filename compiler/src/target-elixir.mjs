// Elixir target adapter. Like the Python adapter, this compiles each decision into an executable
// function using the SAME expression translator the codegen uses (exprToElixir), then runs the test
// cases through a real `elixir` child process and returns actual outputs, so a live Elixir run
// grades real executed code. Elixir function names must start lowercase, so each decision `Foo`
// becomes `d_Foo`.
//
// Results are honest (see target-result.mjs): a missing runtime, a compile failure, a crash, or a
// timeout is a structured error, never a null answer; a decision with a rule Thunder cannot
// translate is refused ('not-translated'). Elixir has no exact Money wiring yet, so a rule that
// compares Money is refused rather than run as a float.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exprToElixir } from './expr.mjs';
import { parseLastJsonObject, cachedSmoke, strLit, litFor, prepareRun, plansFor, argLit, finishRun, runFailure, classifySpawn, spawnStep } from './target-util.mjs';

const ELIXIR_RUN = { translate: exprToElixir, target: 'Elixir', dialect: 'elixir' };
const ELIXIR_RUNTIME = /\*\* \((?!CompileError|SyntaxError|TokenMissingError)\w/;
// Elixir strings interpolate `#{`, so a message literal escapes it.
const exStr = (s) => strLit(s).replace(/#\{/g, '\\#{');

// Write `source` to a .exs file in `dir` and run it. Returns { ok, stdout } or { ok: false, failure }.
function elixirRun(dir, source) {
  const f = join(dir, 'main.exs');
  writeFileSync(f, source);
  const env = { ...process.env };
  return spawnStep('elixir', [f], { timeout: 120000, env }, (r) => classifySpawn(r, { tool: 'elixir', phase: 'build+run', runtimePattern: ELIXIR_RUNTIME }));
}

// The emitted Elixir source (also usable for display / `gen`-parity).
export function emitElixirModule(ast, cases = prepareRun(ast, ELIXIR_RUN).cases, plans = plansFor(ast, exprToElixir, 'Elixir')) {
  const L = ['defmodule ThunderTarget do'];
  if ([...plans.values()].some((p) => p.refused)) {
    L.push('  # IL-GEN-001: a rule Thunder could not translate raises instead of guessing.');
    L.push('  def thunder_untranslated(message), do: raise(message)');
  }
  for (const p of plans.values()) {
    L.push(`  def d_${p.decision.name}(${p.names.join(', ')}) do`);
    L.push('    cond do');
    for (const { rule: r, code, message } of p.rules) {
      L.push(`      ${code ?? `thunder_untranslated(${exStr(message)})`} -> ${strLit(r.result)}`);
    }
    L.push(`      true -> ${p.decision.default == null ? 'nil' : strLit(p.decision.default)}`);
    L.push('    end');
    L.push('  end');
  }
  L.push('end');
  L.push('');
  L.push('pairs = [');
  for (const c of cases) {
    const p = plans.get(c.fn);
    if (!p) continue;
    const argList = p.names.map((n) => argLit(c, p, n, litFor)).join(', ');
    L.push(`  {${strLit(c.key)}, ThunderTarget.d_${c.fn}(${argList})},`);
  }
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
      return out.ok && /"ok"/.test(out.stdout);
    } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
  });
}

// Run every decision test case through generated, executed Elixir. Returns { status: 'ok', results }
// or a whole-run { status: 'error', kind, message }.
export function runElixirTarget(ast) {
  if (!elixirAvailable()) return runFailure('missing-toolchain', 'No usable Elixir runtime on this machine.');
  const { plans, cases, refused } = prepareRun(ast, ELIXIR_RUN);
  if (!cases.length) return { status: 'ok', results: { ...refused } };
  const dir = mkdtempSync(join(tmpdir(), 'tl-ex-'));
  try {
    const out = elixirRun(dir, emitElixirModule(ast, cases, plans));
    if (!out.ok) return out.failure;
    const parsed = parseLastJsonObject(out.stdout);
    if (!parsed) return runFailure('runtime-error', 'elixir ran but printed no results.');
    return finishRun({ cases, parsed, refused, target: 'Elixir' });
  } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
}
