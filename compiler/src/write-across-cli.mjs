// thunder write across folders: one rule change written into every service that implements it (write-across.mjs).
//   thunder write <folder…> --decision <name> --rule <n> --when "<condition>" [--write] [--run "part: cmd" …]
//                [--passport passport.json] [--purpose "…"] [--json]
// Without --write it shows the plan and changes nothing. With --write it changes every implementation or none, then
// runs the --run commands and, with --passport, records the change and the runs as a Software Passport.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { behaviourCheck } from './behaviour.mjs';
import { collectReadableFiles } from './read-repo-fs.mjs';
import { writeRuleAcross, writeAcrossEvidence } from './write-across.mjs';
import { buildPassport } from './passport-fs.mjs';
import { renderPassportSummary, renderPassportMarkdown } from './passport.mjs';
import { paint, useColor } from './term.mjs';

const USAGE = `usage: thunder write <folder…> --decision <name> --rule <n> --when "<condition>" [--write]
                     [--run "part: cmd" …] [--passport passport.json] [--purpose "…"] [--behaviour] [--json]
Finds every implementation of the rule across the folders (each one part, in any language Thunder reads) and
changes its number, comparison, or text value in each of them. Without --write: the plan only. With --write: every
implementation changes, or none does. Test files are never edited; those that mention the old value are listed.
--behaviour runs each Python implementation before and after on inputs made from its code and lists the answers
that change (it runs that code). Exit codes: 0 done (or planned), 1 refused or a --run command failed, 2 usage.`;

/** Is this `thunder write` call about several folders (rather than one file)? */
export function isWriteAcross(argv) {
  const paths = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { if (!['--write', '--json', '-w', '--behaviour', '--behavior'].includes(argv[i])) i++; continue; }
    paths.push(argv[i]);
  }
  if (argv.includes('--edit')) return false;
  return paths.length > 1 || paths.some((p) => { try { return statSync(p).isDirectory(); } catch { return false; } });
}

export async function writeAcrossMain(argv) {
  const a = { _: [], decision: null, rule: null, when: null, write: false, run: [], passport: null, mdOut: null, purpose: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    const need = () => { const v = argv[++i]; if (v == null) throw new Error(`${x} needs a value.`); return v; };
    try {
      if (x === '--decision') a.decision = need();
      else if (x === '--rule') a.rule = need();
      else if (x === '--when') a.when = need();
      else if (x === '--write' || x === '-w') a.write = true;
      else if (x === '--run') a.run.push(need());
      else if (x === '--passport') a.passport = need();
      else if (x === '--md-out') a.mdOut = need();
      else if (x === '--purpose') a.purpose = need();
      else if (x === '--json') a.json = true;
      else if (x === '--behaviour' || x === '--behavior') a.behaviour = true;
      else if (x === '--help' || x === '-h') { console.log(USAGE); return 0; }
      else if (x === '--answer') { console.error('thunder write: across folders, only a rule\'s condition can change (--when). Each service may answer in its own way (a label on the page, an amount in billing), so one new answer would not fit them all.'); return 2; }
      else if (x.startsWith('--')) { console.error(`thunder write: there is no option ${x} for a change across folders.\n${USAGE}`); return 2; }
      else a._.push(x);
    } catch (e) { console.error(`thunder write: ${e.message}\n${USAGE}`); return 2; }
  }
  if (!a.decision || !a.rule || a.when == null) { console.error(`thunder write: say which rule and its new condition.\n${USAGE}`); return 2; }
  if (a.run.length && !a.write) { console.error('thunder write: --run runs your tests on the changed code, so it needs --write.'); return 2; }
  if (a.passport && !a.write) { console.error('thunder write: --passport records a written change, so it needs --write.'); return 2; }

  const parts = [];
  for (const p of a._) {
    let dir = false;
    try { dir = statSync(p).isDirectory(); } catch { console.error(`thunder write: there is no folder called ${p} here.`); return 2; }
    if (!dir) { console.error(`thunder write: ${p} is a file. Across services, name the folders (each one part); for one file use thunder write <file> --decision …`); return 2; }
    parts.push({ name: basename(resolve(p)), dir: p });
  }
  if (new Set(parts.map((p) => p.name)).size !== parts.length) { console.error('thunder write: two folders have the same name; give folders with different names.'); return 2; }
  const files = parts.flatMap((p) => collectReadableFiles(p.dir).map((f) => ({ part: p.name, path: f.path, source: f.source })));
  const r = writeRuleAcross(files, { decision: a.decision, rule: a.rule, when: a.when });
  const dirOf = (k) => { const [part, ...rest] = k.split('/'); return join(parts.find((p) => p.name === part).dir, rest.join('/')); };

  // Write every file, or none (a failed write puts back the ones already written).
  let written = false;
  if (r.ok && a.write) {
    const done = [];
    try {
      for (const [k, src] of Object.entries(r.files)) { const path = dirOf(k); const old = readFileSync(path, 'utf8'); writeFileSync(path, src); done.push([path, old]); }
      for (const [k, src] of Object.entries(r.files)) if (readFileSync(dirOf(k), 'utf8') !== src) throw new Error(`${k} does not hold what was written`);
      written = true;
    } catch (e) {
      for (const [path, old] of done) writeFileSync(path, old);
      console.error(`thunder write: could not write every file (${e.message}); the ones already written were put back.`);
      return 1;
    }
  }

  // Proof: the tests, and the passport (which runs them itself, so they run once).
  let runs = [], passport = null;
  if (written && a.passport) {
    passport = buildPassport({ parts: parts.map((p) => p.dir), base: 'HEAD', run: a.run, purpose: a.purpose ? { text: a.purpose, source: 'given with --purpose' } : null, evidence: [writeAcrossEvidence(r)], relativeTo: dirname(resolve(a.passport)) });
    writeFileSync(a.passport, `${JSON.stringify(passport, null, 2)}\n`);
    if (a.mdOut) writeFileSync(a.mdOut, renderPassportMarkdown(passport));
    runs = passport.evidence.filter((e) => e.kind === 'test-run').map((e) => ({ command: e.basis.command, exitCode: e.basis.exitCode, part: e.claim.match(/ in ([^ ]+) exited/)?.[1] ?? null, tail: e.basis.outputTail }));
  } else if (written) {
    for (const spec of a.run) {
      const m = String(spec).match(/^([A-Za-z0-9_.-]+):\s+(.+)$/);
      const part = m && parts.find((p) => p.name === m[1]);
      const command = part ? m[2] : spec;
      const x = spawnSync(`(${command}) 2>&1`, { shell: true, cwd: part ? part.dir : process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      runs.push({ command, part: part?.name ?? null, exitCode: x.status ?? 1, tail: String(x.stdout ?? '').trimEnd().split('\n').slice(-12).join('\n') });
    }
  }
  const failed = runs.filter((x) => x.exitCode !== 0);

  // --behaviour: run each Python implementation before and after the change, on inputs made from its code.
  const behaviour = r.ok && a.behaviour ? r.plan.map((p) => {
    const key = `${p.part}/${p.file}`;
    const before = files.find((f) => f.part === p.part && f.path === p.file)?.source ?? '';
    const after = r.files[key] ?? before;
    return { part: p.part, file: p.file, ...behaviourCheck({ path: dirOf(key), name: p.decision, before, after }) };
  }) : [];

  if (a.json) {
    const { files: _f, ...rest } = r;
    console.log(JSON.stringify({ ...rest, written, runs, ...(a.behaviour ? { behaviour } : {}), ...(a.passport ? { passport: a.passport } : {}) }, null, 2));
    return !r.ok || failed.length ? 1 : 0;
  }
  const say = (s = '') => console.log(paint(s, useColor()));
  if (!r.ok) {
    console.error(paint('✗ Not changed. No file was touched.', useColor(process.stderr)));
    for (const p of r.problems) console.error(`  ${p}`);
    if (r.notIncluded?.length) { console.error('\nAlso similar, never changed by Thunder:'); for (const n of r.notIncluded) console.error(`  ${n.part}/${n.file}:${n.line}  ${n.why}`); }
    return 1;
  }
  say(`One rule, ${r.plan.length} implementation${r.plan.length === 1 ? '' : 's'}: ${r.rule.before}  →  ${r.rule.after}`);
  say('');
  for (const p of r.plan) {
    say(`${p.part}/${p.file}  (${p.language}, ${p.decision}, rule ${p.rule})`);
    say(`  why it is the same rule: ${p.why}`);
    say(`  was: ${p.before}`);
    say(`  now: ${p.after}`);
    for (const c of p.change) say(`  line ${c.line}, column ${c.column}: ${c.before}  ->  ${c.after}`);
  }
  say('\nChecked by reading each file again: the rule reads as intended, and every other rule and function in each file reads exactly as before.');
  if (behaviour.length) {
    say('\nWhat the change does, run before and after on inputs made from the code (tested on these inputs only; not a proof):');
    for (const b of behaviour) {
      say(`  ${b.part}/${b.file}  ${b.status === 'changed' ? `${b.changes.length} of ${b.inputs} inputs give a different answer` : b.status === 'same' ? `all ${b.inputs} inputs give the same answer` : b.status === 'broken' ? `the changed file does not load (${b.reason})` : `not run (${b.reason})`}`);
      for (const ex of (b.examples ?? []).slice(0, 3)) say(`    ${ex}`);
    }
  }
  if (r.notIncluded.length) {
    say('\nNot included (similar, but Thunder cannot tell it is the same rule; check by hand):');
    for (const n of r.notIncluded) say(`  ${n.part}/${n.file}:${n.line}  ${n.why}`);
  }
  if (r.tests.length) {
    say('\nTests that mention the old value (Thunder never edits tests; they may pin the old rule):');
    for (const t of r.tests) say(`  ${t.part}/${t.file}:${t.line}  ${t.text}`);
  }
  if (!written) { say('\nPlan only; nothing was saved. Add --write to change every implementation (all or none).'); return 0; }
  say(`\nSaved ${Object.keys(r.files).length} file${Object.keys(r.files).length === 1 ? '' : 's'}: ${Object.keys(r.files).join(', ')}.`);
  if (runs.length) {
    say('\nTests on the changed code:');
    for (const x of runs) say(`  ${x.exitCode === 0 ? '✓ passed' : `✗ failed (exit ${x.exitCode})`}  ${x.part ? `${x.part}: ` : ''}${x.command}`);
    for (const x of failed) { say(`\n  ${x.part ? `${x.part}: ` : ''}${x.command} said:`); for (const l of String(x.tail).split('\n')) say(`    ${l}`); }
    if (failed.length) say('\nThe change is saved, and these tests fail on it. A test that pins the old rule fails until it is updated; any other failure needs a look.');
  }
  if (passport) { say(`\nPassport: ${a.passport}`); say(renderPassportSummary(passport)); }
  return failed.length ? 1 : 0;
}
