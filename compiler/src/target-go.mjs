// Go target adapter. Emits a self-contained `package main` that defines each decision as a typed
// func (using the same exprToGo translator the codegen uses), calls every test case with typed
// literal arguments, and prints the results as one JSON line. It runs through `go run`, so a live
// Go run grades real compiled + executed code. Returns null (skip cleanly) when no usable Go
// toolchain exists.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exprToGo } from './expr.mjs';
import { inputNames, inferInputTypes, buildCases, parseLastJsonObject, cachedSmoke, strLit, litFor } from './target-util.mjs';

const GO_TYPE = { number: 'float64', bool: 'bool', string: 'string' };

// Write `source` to main.go in `dir` and `go run` it. Returns stdout, or null on any failure.
// GO111MODULE=off runs a single stdlib-only file with no go.mod; GOTOOLCHAIN=local avoids network.
function goRun(dir, source) {
  const f = join(dir, 'main.go');
  writeFileSync(f, source);
  const env = { ...process.env, GO111MODULE: 'off', GOTOOLCHAIN: 'local', GOCACHE: join(dir, '.gocache'), GOFLAGS: '' };
  const r = spawnSync('go', ['run', f], { encoding: 'utf8', timeout: 180000, env });
  if (r.status !== 0) return null;
  return r.stdout;
}

// The emitted Go source (also usable for display / `gen`-parity).
export function emitGoModule(ast, cases = buildCases(ast)) {
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
  const typesByDec = {};
  for (const d of ast.decisions || []) {
    const names = inputNames(d);
    const types = inferInputTypes(ast, d);
    typesByDec[d.name] = types;
    const params = names.map((n) => `${n} ${GO_TYPE[types[n]] || 'string'}`).join(', ');
    L.push(`func ${d.name}(${params}) string {`);
    for (const r of d.rules || []) {
      let cond; try { cond = exprToGo(r.when, { inputs: names }); } catch { cond = 'false'; }
      L.push(`\tif ${cond} {`, `\t\treturn ${strLit(r.result)}`, '\t}');
    }
    L.push(`\treturn ${d.default == null ? '""' : strLit(d.default)}`, '}', '');
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
  cases.forEach((c, idx) => {
    const dec = (ast.decisions || []).find((d) => d.name === c.fn);
    if (!dec) return;
    const types = typesByDec[c.fn];
    const argList = inputNames(dec).map((n) => litFor(types[n], c.given[n])).join(', ');
    const sep = idx === 0 ? '' : ',';
    L.push(`\tsb.WriteString(${JSON.stringify(sep)} + j(${strLit(c.key)}) + ":" + j(${c.fn}(${argList})))`);
  });
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
      return !!out && /"ok"/.test(out);
    } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
  });
}

// Run every decision test case through generated, compiled Go. Returns { "Test / case": actual }
// or null when no usable Go toolchain is present.
export function runGoTarget(ast) {
  if (!goAvailable()) return null;
  const cases = buildCases(ast);
  const dir = mkdtempSync(join(tmpdir(), 'tl-go-'));
  try {
    const out = goRun(dir, emitGoModule(ast, cases));
    return out == null ? null : parseLastJsonObject(out);
  } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
}
