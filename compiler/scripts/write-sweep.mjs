#!/usr/bin/env node
// Writing in Thunder, measured on real code: for every function in the given folders (TypeScript, JavaScript, Python,
// Go), try one edit of each kind that fits it and count how each turned out — written (and proven), needs-ai, or
// refused. A written edit is only counted when its proof passed: the edited steps read exactly as intended and every
// other function in the file means the same. Nothing is written to disk.
//
//   node scripts/write-sweep.mjs <folder> [<folder> ...] [--max-files n] [--json] [--examples] [--verify] [--why]
//
// --verify: also check every written file with the language's own parser (Python's ast, node --check, gofmt -e).
// The proof reads the code back in Thunder; this is the independent check that the written code still parses.
import { readdirSync, readFileSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { readCode } from '../src/read.mjs';
import { readableLanguage } from '../src/read-repo.mjs';
import { thunderWrite } from '../src/write-steps.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const roots = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--max-files'));
const maxFiles = Number(opt('--max-files', 400));
const SKIP = /(^|\/)(node_modules|vendor|dist|build|\.git|test|tests|__tests__|testdata|docs?|examples?)(\/|$)|(_test\.go|\.test\.[jt]sx?|\.spec\.[jt]sx?|\.d\.ts)$/;

function* walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) { if (!SKIP.test(`${p}/`)) yield* walk(p); }
    else if (st.size < 200000 && !SKIP.test(p)) yield p;
  }
}

const flat = (steps, out = []) => { for (const s of steps || []) { out.push(s); flat(s.children, out); flat(s.otherwise, out); } return out; };
const tally = {};
const count = (op, status) => { tally[op] ??= { written: 0, 'needs-ai': 0, refused: 0 }; tally[op][status]++; };
const examples = [];
const toVerify = []; // { id, op, language, rel, member, edit, source }

for (const root of roots) {
  let n = 0;
  for (const path of walk(root)) {
    const language = readableLanguage(path);
    if (!['typescript', 'javascript', 'python', 'go'].includes(language)) continue;
    if (++n > maxFiles) break;
    const source = readFileSync(path, 'utf8');
    let reading;
    try { reading = readCode(source, { language, file: path, allSteps: true }); } catch { continue; }
    const rel = relative(root, path);
    const files = [{ path: rel, source }];
    for (const it of reading.items) {
      if (!it.steps?.length || (it.kind !== 'function' && it.kind !== 'decision')) continue;
      const member = { file: rel, name: it.name, line: it.line };
      const steps = flat(it.steps);
      const edits = [];
      const num = steps.find((s) => s.expr && JSON.stringify(s.expr).includes('"type":"number"'));
      if (num) { const lit = JSON.stringify(num.expr).match(/"type":"number","value":(-?[\d.e+]+)/); if (lit) edits.push({ op: 'setValue', member, step: `line:${num.line}`, from: Number(lit[1]), to: Number(lit[1]) + 1 }); }
      const cmp = steps.find((s) => s.expr?.kind === 'if' && s.expr.test?.kind === 'compare' && /^[<>]=?$/.test(s.expr.test.op));
      if (cmp) edits.push({ op: 'setCondition', member, step: `line:${cmp.line}`, compare: { '<': '<=', '<=': '<', '>': '>=', '>=': '>' }[cmp.expr.test.op] });
      const q = steps.find((s) => s.expr?.kind === 'if');
      if (q) edits.push({ op: 'setCondition', member, step: `line:${q.line}`, negate: true });
      const first = it.steps.find((s) => s.expr && s.expr.kind !== 'code');
      const input = (it.inputs || []).find((p) => /^[A-Za-z_]\w*$/.test(p.name) && !/^(self|cls|this)$/.test(p.name));
      if (first && input) edits.push({ op: 'addStop', member, before: `line:${first.line}`, when: language === 'python' ? `${input.name} is None` : language === 'go' ? `${input.name} == nil` : `${input.name} == null`, message: `${input.name} is required` });
      const removable = [...it.steps].reverse().find((s) => s.kind === 'call' && !s.children?.length);
      if (removable) edits.push({ op: 'removeStep', member, step: `line:${removable.line}` });
      if (it.steps.length >= 2 && it.steps[0].kind === 'set' && !it.steps[0].children?.length && it.steps[1].kind !== 'return') edits.push({ op: 'moveStep', member, step: `line:${it.steps[1].line}`, before: `line:${it.steps[0].line}` });
      if (input) edits.push({ op: 'rename', member, from: input.name, to: `${input.name}${language === 'go' || language === 'python' ? '_' : ''}Renamed` });
      edits.push({ op: 'addInput', member, name: 'thunderExtra', ...(language === 'go' ? { type: 'int' } : { default: 0 }) });
      const ret = steps.find((s) => s.expr?.kind === 'return' && s.expr.value?.kind === 'literal' && s.expr.value.type === 'bool');
      if (ret) edits.push({ op: 'setGivesBack', member, step: `line:${ret.line}`, value: !ret.expr.value.value });
      const after = it.steps.find((s) => s.kind === 'call' && !s.children?.length);
      if (after) edits.push({ op: 'addStep', member, after: `line:${after.line}`, step: 'thunderAudit()' });
      for (const e of edits) {
        let r;
        try { r = thunderWrite(files, e); } catch (err) { r = { status: 'needs-ai', reason: `crash: ${err.message}` }; }
        count(e.op, r.status);
        if (r.status !== 'written' && flag('--why')) console.error(`${r.status.padEnd(8)} ${e.op.padEnd(12)} ${rel}:${it.name}:${it.line}  ${r.reason}`);
        if (r.status === 'written' && flag('--verify')) for (const [p, src] of Object.entries(r.files || {})) toVerify.push({ id: toVerify.length, op: e.op, language, rel: p, member: `${it.name}:${it.line}`, edit: e, source: src, patch: r.patch });
        if (r.status === 'written' && flag('--examples') && examples.filter((x) => x.op === e.op && x.language === language).length < 1) examples.push({ op: e.op, language, file: rel, edit: e, patch: r.patch, says: r.says, proof: r.proof });
      }
    }
  }
}
// Independent check: does each written file still parse in its own language?
const broken = [];
if (flag('--verify') && toVerify.length) {
  const dir = mkdtempSync(join(tmpdir(), 'thunder-write-verify-'));
  try {
    const ext = { python: 'py', javascript: 'mjs', typescript: 'ts', go: 'go' };
    for (const v of toVerify) writeFileSync(join(dir, `${v.id}.${ext[v.language]}`), v.source);
    const py = toVerify.filter((v) => v.language === 'python');
    if (py.length) {
      const code = 'import ast,sys,json\nbad={}\nfor a in sys.argv[1:]:\n  try: ast.parse(open(a,encoding="utf-8").read())\n  except SyntaxError as e: bad[a]=f"line {e.lineno}: {e.msg}"\nprint(json.dumps(bad))';
      const out = spawnSync('python3', ['-I', '-c', code, ...py.map((v) => join(dir, `${v.id}.py`))], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const bad = JSON.parse(out.stdout || '{}');
      for (const v of py) { const why = bad[join(dir, `${v.id}.py`)]; if (why) broken.push({ ...v, why }); }
    }
    for (const v of toVerify.filter((x) => x.language === 'javascript')) {
      const r = spawnSync(process.execPath, ['--check', join(dir, `${v.id}.mjs`)], { encoding: 'utf8' });
      if (r.status !== 0) broken.push({ ...v, why: (r.stderr || '').split('\n').find((l) => /Error/.test(l)) || 'does not parse' });
    }
    const go = toVerify.filter((x) => x.language === 'go');
    if (go.length && spawnSync('gofmt', ['-h']).error == null) for (const v of go) {
      const r = spawnSync('gofmt', ['-e', '-l', join(dir, `${v.id}.go`)], { encoding: 'utf8' });
      if (r.status !== 0) broken.push({ ...v, why: (r.stderr || '').split('\n')[0] });
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const total = Object.values(tally).reduce((a, t) => ({ written: a.written + t.written, 'needs-ai': a['needs-ai'] + t['needs-ai'], refused: a.refused + t.refused }), { written: 0, 'needs-ai': 0, refused: 0 });
const verified = flag('--verify') ? { checked: toVerify.filter((v) => v.language !== 'typescript').length, broken: broken.length, byOp: broken.reduce((m, b) => ({ ...m, [b.op]: (m[b.op] || 0) + 1 }), {}), examples: broken.slice(0, 40).map(({ source, ...b }) => b) } : null;
if (flag('--json')) console.log(JSON.stringify({ tally, total, examples, verified }, null, 2));
else {
  console.log('edit           written  needs-ai  refused');
  for (const [op, t] of Object.entries(tally)) console.log(`${op.padEnd(14)} ${String(t.written).padStart(7)}  ${String(t['needs-ai']).padStart(8)}  ${String(t.refused).padStart(7)}`);
  console.log(`${'all'.padEnd(14)} ${String(total.written).padStart(7)}  ${String(total['needs-ai']).padStart(8)}  ${String(total.refused).padStart(7)}`);
  if (verified) {
    console.log(`\nIndependent parse check: ${verified.checked} written files checked (TypeScript not checked), ${verified.broken} do not parse.`);
    for (const [op, n] of Object.entries(verified.byOp)) console.log(`  ${op}: ${n}`);
    if (flag('--why')) for (const b of broken.slice(0, 40)) console.log(`\n  ${b.op} ${b.rel} ${b.member}: ${b.why}\n  ${JSON.stringify(b.edit)}\n${b.patch.split('\n').map((l) => `    ${l}`).join('\n')}`);
  }
  if (flag('--examples')) for (const x of examples) console.log(`\n## ${x.op} (${x.language}) ${x.file}\n${JSON.stringify(x.edit)}\n${x.patch}${x.says}`);
}
