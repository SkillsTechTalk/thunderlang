#!/usr/bin/env node
// ThunderBench: measure Thunder honestly, the same way every time, and write the results.
//
//   node thunderbench/run.mjs                    every track that can run here
//   node thunderbench/run.mjs --corpus <dir>     also the write track (clones a pinned public repository into <dir>)
//   node thunderbench/run.mjs --json             the results as JSON on stdout (nothing written)
//
// Tracks (each says "not run" with the reason when it cannot run here; nothing is ever estimated):
//   pairs       the same programs in Thunder and Python give the same answer to every question; their size
//   honesty     Python that Thunder cannot say exactly is marked "not translated", never guessed
//   round trip  Python read as Thunder Core, compiled back, and run next to the original (hand-picked and made inputs)
//   targets     the Core example programs give the same output on the Thunder engine, Python, and TypeScript
//   write       Thunder write on real change requests, judged by hidden tests (needs --corpus)
//   speed       how long everyday commands take (CPU time)
// The people track (how fast and how well people read and change each program) uses the sheets this writes to
// people/; see people/README.md. Its results are recorded there by hand, and none are claimed here until it is run.

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROGRAMS, HONESTY } from './questions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CLI = join(ROOT, 'compiler', 'src', 'cli.mjs');
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const JSON_OUT = args.includes('--json');
const { findPython } = await import('../compiler/src/core/project.mjs');
const PY = findPython();

const thunder = (argv, cwd = HERE) => spawnSync(process.execPath, [CLI, ...argv], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });

// ── pairs ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/** An answer as a person would say it, so Thunder's and Python's can be compared: approve, 30, 211.86, yes. */
function plain(s) {
  let t = String(s).trim();
  const dec = /^Decimal\('([^']*)'\)$/.exec(t);
  if (dec) t = dec[1];
  if (/^'.*'$|^".*"$/.test(t)) t = t.slice(1, -1);
  if (t === 'True') t = 'yes';
  if (t === 'False') t = 'no';
  if (/^-?\d+\.\d+$/.test(t)) t = t.replace(/0+$/, '').replace(/\.$/, '');
  return t;
}

/** Lines that are code (not blank, not a comment), characters in them, and words and symbols. */
function size(text, comment) {
  const lines = text.split('\n').filter((l) => l.trim() && !l.trim().startsWith(comment));
  const code = lines.join('\n');
  return { lines: lines.length, characters: code.replace(/\s+/g, ' ').trim().length, tokens: (code.match(/[A-Za-z_]\w*|\d+(?:\.\d+)?|"[^"]*"|\S/g) ?? []).length };
}

/** The line that holds `find` as a whole token, in the code of a program (1-based), or an error. */
function lineOf(text, find) {
  const re = new RegExp(`(^|[^\\w.])${find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w.])`);
  const hits = text.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => !l.trim().startsWith('#') && re.test(l));
  return hits.length === 1 ? { line: hits[0][0], text: hits[0][1].trim() } : { error: `"${find}" is on ${hits.length} lines` };
}

function runPairs() {
  if (PY.error) return { ran: false, reason: PY.error };
  const out = [];
  for (const p of PROGRAMS) {
    const tSrc = readFileSync(join(HERE, 'programs', p.thunder.file), 'utf8');
    const pSrc = readFileSync(join(HERE, 'programs', p.python.file), 'utf8');
    const predicts = p.questions.filter((q) => q.kind === 'predict');
    const dir = mkdtempSync(join(tmpdir(), 'thunderbench-'));
    try {
      writeFileSync(join(dir, 'driver.thunder'), `${tSrc}\n${predicts.map((q) => `say ${p.thunder.call} with ${q.thunder}`).join('\n')}\n`);
      writeFileSync(join(dir, `${p.id}.py`), pSrc);
      const tr = thunder(['run', '--core', '--engine', 'thunder', 'driver.thunder'], dir);
      const pr = spawnSync(PY.cmd, ['-c', `from decimal import Decimal\nimport ${p.id} as m\n${predicts.map((q) => `print(repr(m.${p.python.call}(${q.python})))`).join('\n')}`], { cwd: dir, encoding: 'utf8' });
      const tOut = tr.stdout.trimEnd().split('\n'), pOut = pr.stdout.trimEnd().split('\n');
      const questions = p.questions.map((q) => {
        if (q.kind === 'change') {
          const t = lineOf(tSrc, q.find), py = lineOf(pSrc, q.find);
          return { ...q, ok: !t.error && !py.error, answer: { thunder: t, python: py } };
        }
        const i = predicts.indexOf(q);
        const a = plain(tOut[i] ?? ''), b = plain(pOut[i] ?? '');
        return { ...q, ok: tr.status === 0 && pr.status === 0 && a === b, answer: a, thunderSaid: tOut[i] ?? tr.stderr.trim(), pythonSaid: pOut[i] ?? pr.stderr.trim() };
      });
      out.push({ id: p.id, questions, size: { thunder: size(tSrc, '#'), python: size(pSrc, '#') } });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  return { ran: true, programs: out };
}

// ── honesty ─────────────────────────────────────────────────────────────────────────────────────────────────────────
async function runHonesty() {
  const { pythonToCore } = await import('../compiler/src/core/from-python.mjs');
  const cases = HONESTY.map((h) => {
    const r = pythonToCore(h.python);
    const fn = r.functions.find((f) => f.name === h.name);
    const marked = !!fn && !fn.exact;
    return { name: h.name, why: h.why, marked, core: r.core.trim() };
  });
  return { ran: true, cases };
}

// ── round trip ──────────────────────────────────────────────────────────────────────────────────────────────────────
async function runRoundTrip() {
  if (PY.error) return { ran: false, reason: PY.error };
  const { measure } = await import('../compiler/scripts/core-read-write.mjs');
  const { rows } = measure();
  const sum = (key) => {
    const ran = rows.filter((r) => r[key]?.ran);
    return { functions: ran.length, same: ran.filter((r) => r[key].cases.every((c) => c.same)).length, inputs: ran.reduce((n, r) => n + r[key].cases.length, 0), inputsSame: ran.reduce((n, r) => n + r[key].cases.filter((c) => c.same).length, 0) };
  };
  const hasMade = rows.some((r) => 'roundTripGenerated' in r);
  return { ran: true, total: rows.length, exact: rows.filter((r) => r.exact).length, picked: sum('roundTrip'), made: hasMade ? sum('roundTripGenerated') : null };
}

// ── targets ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function runTargets() {
  const dir = join(ROOT, 'examples', 'core');
  const files = readdirSync(dir).filter((f) => f.endsWith('.thunder') && !/csv/.test(f));
  const engines = [['Thunder engine', ['--engine', 'thunder']], ...(PY.error ? [] : [['Python', []]]), ['TypeScript', ['--target', 'typescript']]];
  // Each program on its own, outside the examples project, so one program's Python module (csv-summary) does not
  // stop the others from building for TypeScript.
  const results = files.map((f) => {
    const solo = mkdtempSync(join(tmpdir(), 'thunderbench-target-'));
    try {
      writeFileSync(join(solo, f), readFileSync(join(dir, f), 'utf8'));
      const outs = engines.map(([name, flags]) => { const r = thunder(['run', '--core', f, ...flags], solo); return { name, ok: r.status === 0, out: r.stdout, err: r.stderr.trim().split('\n').pop() }; });
      return { file: f, same: outs.every((o) => o.ok && o.out === outs[0].out), outs: outs.map((o) => ({ name: o.name, ok: o.ok, err: o.ok ? null : o.err })) };
    } finally { rmSync(solo, { recursive: true, force: true }); }
  });
  return { ran: true, engines: engines.map(([n]) => n), results };
}

// ── write ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function runWrite() {
  const corpus = opt('--corpus');
  if (!corpus) return { ran: false, reason: 'needs --corpus <dir> (it clones a pinned public repository there)' };
  const r = spawnSync(process.execPath, [join(ROOT, 'compiler', 'scripts', 'write-bench.mjs'), '--corpus', corpus, '--json'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0 && !r.stdout.trim().startsWith('{')) return { ran: false, reason: `write-bench failed: ${r.stderr.trim().split('\n').pop()}` };
  return { ran: true, ...JSON.parse(r.stdout) };
}

// ── speed ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function runSpeed() {
  const script = join(ROOT, 'compiler', 'scripts', 'speed.mjs');
  if (!existsSync(script)) return { ran: false, reason: 'compiler/scripts/speed.mjs is not in this checkout' };
  const r = spawnSync(process.execPath, [script, '--json', '--runs', '5'], { encoding: 'utf8' });
  return r.status === 0 ? { ran: true, ...JSON.parse(r.stdout) } : { ran: false, reason: r.stderr.trim().split('\n').pop() };
}

// ── report ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const results = { date: new Date().toISOString().slice(0, 10), node: process.versions.node, python: PY.version ?? null, compiler: JSON.parse(readFileSync(join(ROOT, 'compiler', 'package.json'), 'utf8')).version };
results.pairs = runPairs();
results.honesty = await runHonesty();
results.roundTrip = await runRoundTrip();
results.targets = runTargets();
results.write = runWrite();
results.speed = runSpeed();

if (JSON_OUT) { console.log(JSON.stringify(results, null, 2)); process.exit(0); }

const notRun = (t) => `Not run here: ${t.reason}.`;
const md = [
  '# ThunderBench results',
  '',
  `> Generated by \`node thunderbench/run.mjs\` on ${results.date}: compiler ${results.compiler}, Node ${results.node}, Python ${results.python ?? 'not found'}. Do not edit by hand.`,
  '',
  '## The same programs in Thunder and Python',
  '',
];
if (results.pairs.ran) {
  const qs = results.pairs.programs.flatMap((p) => p.questions);
  md.push(`Both versions give the same answer to **${qs.filter((q) => q.ok).length} of ${qs.length}** questions (${qs.filter((q) => q.kind === 'predict').length} "what does it give", run in both languages; ${qs.filter((q) => q.kind === 'change').length} "which line changes", found in both files).`, '');
  md.push('Size, counting code only (no blank lines or comments). Smaller is not the same as easier to read: this is reported because it is where Python often does better.', '');
  md.push('| Program | Thunder lines | Python lines | Thunder characters | Python characters | Thunder tokens | Python tokens |', '| --- | --- | --- | --- | --- | --- | --- |');
  let tl = 0, pl = 0, tc = 0, pc = 0, tt = 0, pt = 0;
  for (const p of results.pairs.programs) {
    const t = p.size.thunder, py = p.size.python;
    tl += t.lines; pl += py.lines; tc += t.characters; pc += py.characters; tt += t.tokens; pt += py.tokens;
    md.push(`| ${p.id} | ${t.lines} | ${py.lines} | ${t.characters} | ${py.characters} | ${t.tokens} | ${py.tokens} |`);
  }
  md.push(`| **all** | **${tl}** | **${pl}** | **${tc}** | **${pc}** | **${tt}** | **${pt}** |`, '');
  const bad = qs.filter((q) => !q.ok);
  if (bad.length) md.push('Questions where the two versions disagree (a bug in a pair, to fix before using it with people):', '', ...bad.map((q) => `- ${q.ask} Thunder: ${JSON.stringify(q.thunderSaid ?? q.answer?.thunder)}; Python: ${JSON.stringify(q.pythonSaid ?? q.answer?.python)}`), '');
} else md.push(notRun(results.pairs), '');

md.push('## Honesty: what Thunder cannot say, it says it cannot', '');
const hon = results.honesty.cases;
md.push(`Python that Thunder Core cannot say with the same meaning, read with \`thunder read --as-core\`: **${hon.filter((c) => c.marked).length} of ${hon.length}** marked "not translated". Silently printed as something close but different: **${hon.filter((c) => !c.marked).length}**.`, '');
md.push('| Python | Why Thunder cannot say it yet | Marked |', '| --- | --- | --- |', ...hon.map((c) => `| \`${c.name}\` | ${c.why} | ${c.marked ? 'yes' : '**no**'} |`), '');

md.push('## Round trip: read as Thunder, written back, run next to the original', '');
if (results.roundTrip.ran) {
  const rt = results.roundTrip;
  md.push(`Of ${rt.total} small Python functions, ${rt.exact} read exactly as Thunder Core. Compiled back to Python and run next to the original:`, '');
  md.push(`- on hand-picked inputs: **${rt.picked.same} of ${rt.picked.functions}** functions, ${rt.picked.inputsSame} of ${rt.picked.inputs} inputs the same`);
  md.push(rt.made ? `- on inputs made from each function's code: **${rt.made.same} of ${rt.made.functions}** functions, ${rt.made.inputsSame} of ${rt.made.inputs} inputs the same` : '- on inputs made from each function\'s code: not measured by this compiler version', '');
  md.push('Details for every function: [docs/core-read-write.md](../../docs/core-read-write.md).', '');
} else md.push(notRun(results.roundTrip), '');

md.push('## One program, every target', '');
const tg = results.targets;
md.push(`The Core example programs, run on ${tg.engines.join(', ')}: **${tg.results.filter((r) => r.same).length} of ${tg.results.length}** give exactly the same output on all of them. (The full suite also checks C#, Java, Go, and Rust where their toolchains are installed.)`, '');
md.push('| Program | Same output everywhere |', '| --- | --- |', ...tg.results.map((r) => `| ${r.file} | ${r.same ? 'yes' : `**no** (${r.outs.filter((o) => !o.ok).map((o) => `${o.name} failed: ${o.err}`).join('; ') || 'outputs differ'})`} |`), '');

md.push('## Thunder write on real change requests', '');
if (results.write.ran) md.push('```json', JSON.stringify(results.write, null, 2).slice(0, 4000), '```', '');
else md.push(notRun(results.write), 'The last published run: [docs/thunder-write.md](../../docs/thunder-write.md).', '');

md.push('## Speed', '');
if (results.speed.ran) {
  md.push(`Node ${results.speed.node}, best of ${results.speed.runs}. CPU time is the number to compare: a busy machine changes wall time much more than the work done.`, '');
  md.push('| Command | Best | Median | CPU |', '| --- | --- | --- | --- |', ...results.speed.results.map((r) => `| ${r.label} | ${r.bestMs} ms | ${r.medianMs} ms | ${r.cpuMs ?? 'n/a'} ms |`), '');
} else md.push(notRun(results.speed), '');

md.push('## People', '', 'Not run yet. The sheets and the protocol are in [people/](../people/README.md); no result about how people read Thunder is claimed until a round is run and recorded there.', '');

mkdirSync(join(HERE, 'results'), { recursive: true });
writeFileSync(join(HERE, 'results', 'latest.md'), `${md.join('\n')}\n`);
writeFileSync(join(HERE, 'results', 'latest.json'), `${JSON.stringify(results, null, 2)}\n`);

// The people sheets: one per language, the same questions, and the answer key (computed above).
if (results.pairs.ran) {
  mkdirSync(join(HERE, 'people'), { recursive: true });
  for (const lang of ['thunder', 'python']) {
    const sheet = [`# ThunderBench reading sheet (${lang === 'thunder' ? 'Thunder' : 'Python'})`, '', 'Read each program, then answer its questions without running anything. Note the time you start and finish each program.', ''];
    PROGRAMS.forEach((p, i) => {
      const src = readFileSync(join(HERE, 'programs', p[lang].file), 'utf8');
      sheet.push(`## ${i + 1}. ${p.id}`, '', `\`\`\`${lang === 'thunder' ? 'thunder' : 'python'}`, src.trimEnd(), '```', '', 'Started: ____  Finished: ____', '');
      p.questions.forEach((q, j) => sheet.push(`${j + 1}. ${q.ask}`, '', '   Answer: ______________________', ''));
    });
    writeFileSync(join(HERE, 'people', `sheet-${lang}.md`), `${sheet.join('\n')}\n`);
  }
  const key = ['# ThunderBench answer key', '', 'Computed by running both versions of each program (thunderbench/run.mjs). Line numbers count every line of the file shown on the sheet.', ''];
  for (const p of results.pairs.programs) {
    key.push(`## ${p.id}`, '');
    p.questions.forEach((q, j) => key.push(q.kind === 'change' ? `${j + 1}. Thunder line ${q.answer.thunder.line} (\`${q.answer.thunder.text}\`); Python line ${q.answer.python.line} (\`${q.answer.python.text}\`)` : `${j + 1}. ${q.answer}`));
    key.push('');
  }
  writeFileSync(join(HERE, 'people', 'answers.md'), `${key.join('\n')}\n`);
}
console.log('wrote thunderbench/results/latest.md, latest.json, and the people sheets');
