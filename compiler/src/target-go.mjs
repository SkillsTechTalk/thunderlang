// Go target adapter. Emits a self-contained `package main` that defines each decision as a typed
// func (using the same exprToGo translator the codegen uses), calls every test case with typed
// literal arguments, and prints the results as one JSON line. It runs through `go run`, so a live
// Go run grades real compiled + executed code.
//
// Results are honest (see target-result.mjs): a missing toolchain, a compile failure, a crash, or a
// timeout is a structured error, never a null answer; a decision with a rule Thunder cannot
// translate is refused ('not-translated'). Money inputs are int64 minor units, never floats.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exprToGo } from './expr.mjs';
import { parseLastJsonObject, cachedSmoke, strLit, litFor, prepareRun, plansFor, argLit, finishRun, runFailure, classifySpawn, spawnStep } from './target-util.mjs';

const GO_TYPE = { number: 'float64', bool: 'bool', string: 'string', money: 'int64' };
const GO_RUN = { translate: exprToGo, target: 'Go', dialect: 'go' };
const GO_RUNTIME = /panic:|^exit status/m;

// Write `source` to main.go in `dir` and `go run` it. Returns { ok, stdout } or { ok: false, failure }.
// GO111MODULE=off runs a single stdlib-only file with no go.mod; GOTOOLCHAIN=local avoids network.
function goRun(dir, source) {
  const f = join(dir, 'main.go');
  writeFileSync(f, source);
  const env = { ...process.env, GO111MODULE: 'off', GOTOOLCHAIN: 'local', GOCACHE: join(dir, '.gocache'), GOFLAGS: '' };
  return spawnStep('go', ['run', f], { timeout: 180000, env }, (r) => classifySpawn(r, { tool: 'go', phase: 'build+run', runtimePattern: GO_RUNTIME }));
}

// The emitted Go source (also usable for display / `gen`-parity).
export function emitGoModule(ast, cases = prepareRun(ast, GO_RUN).cases, plans = plansFor(ast, exprToGo, 'Go')) {
  const L = [
    'package main',
    '',
    'import (',
    '\t"encoding/json"',
    '\t"fmt"',
    '\t"strings"',
    ')',
    '',
  ];
  if ([...plans.values()].some((p) => p.refused)) {
    L.push('// IL-GEN-001: a rule Thunder could not translate panics instead of guessing.');
    L.push('func thunderUntranslated(message string) bool {', '\tpanic(message)', '}', '');
  }
  for (const p of plans.values()) {
    const params = p.names.map((n) => `${n} ${GO_TYPE[p.types[n]] || 'string'}`).join(', ');
    L.push(`func ${p.decision.name}(${params}) string {`);
    for (const { rule: r, code, message } of p.rules) {
      L.push(`\tif ${code ?? `thunderUntranslated(${strLit(message)})`} {`, `\t\treturn ${strLit(r.result)}`, '\t}');
    }
    L.push(`\treturn ${p.decision.default == null ? '""' : strLit(p.decision.default)}`, '}', '');
  }
  // JSON-escape a string via the standard library, so the object we build is valid JSON.
  L.push('func j(s string) string {');
  L.push('\tb, _ := json.Marshal(s)');
  L.push('\treturn string(b)');
  L.push('}');
  L.push('');
  L.push('func main() {');
  L.push('\tvar sb strings.Builder');
  L.push('\tsb.WriteString("{")');
  let first = true;
  for (const c of cases) {
    const p = plans.get(c.fn);
    if (!p) continue;
    const argList = p.names.map((n) => argLit(c, p, n, litFor)).join(', ');
    L.push(`\tsb.WriteString(${JSON.stringify(first ? '' : ',')} + j(${strLit(c.key)}) + ":" + j(${c.fn}(${argList})))`);
    first = false;
  }
  L.push('\tsb.WriteString("}")');
  L.push('\tfmt.Println(sb.String())');
  L.push('}');
  return L.join('\n');
}

export function goAvailable() {
  return cachedSmoke('go', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tl-go-smoke-'));
    try {
      const src = 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("{\\"ok\\":\\"1\\"}")\n}';
      const out = goRun(dir, src);
      return out.ok && /"ok"/.test(out.stdout);
    } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
  });
}

// Run every decision test case through generated, compiled Go. Returns { status: 'ok', results }
// or a whole-run { status: 'error', kind, message }.
export function runGoTarget(ast) {
  if (!goAvailable()) return runFailure('missing-toolchain', 'No usable Go toolchain (go run) on this machine.');
  const { plans, cases, refused } = prepareRun(ast, GO_RUN);
  if (!cases.length) return { status: 'ok', results: { ...refused } };
  const dir = mkdtempSync(join(tmpdir(), 'tl-go-'));
  try {
    const out = goRun(dir, emitGoModule(ast, cases, plans));
    if (!out.ok) return out.failure;
    const parsed = parseLastJsonObject(out.stdout);
    if (!parsed) return runFailure('runtime-error', 'go ran but printed no results.');
    return finishRun({ cases, parsed, refused, target: 'Go' });
  } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
}
