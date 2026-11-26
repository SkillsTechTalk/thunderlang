// thunder passport: the command line for the Thunder Software Passport (passport.mjs, passport-fs.mjs, docs/passport.md).
//   thunder passport <folder…> [--base REV] [--head REV] [--run "cmd" | --run "part: cmd" …] [--purpose "…" | --purpose-file f]
//                    [--evidence f.json …] [--json | --md] [--out file] [--md-out file.md]
//   thunder passport check <passport.json> [--part name=folder …] [--json]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildPassport, checkPassportOnDisk } from './passport-fs.mjs';
import { renderPassportSummary, renderPassportMarkdown } from './passport.mjs';
import { paint, useColor } from './term.mjs';

const USAGE = `usage: thunder passport <folder…> [--base REV] [--run "cmd" | --run "part: cmd" …] [--purpose "…" | --purpose-file f]
                        [--evidence result.json …] [--no-access] [--json | --md] [--out passport.json] [--md-out passport.md]
       thunder passport check <passport.json> [--part name=folder …] [--json]
A passport records what is known about a feature or a change: its behavior, what it depends on and changes, the
evidence for each claim (with what it does not cover), and what is not verified. When this build has the ownership
check (thunder read --access), its verdicts join as evidence (--no-access leaves them out). Only git and the commands you pass
with --run are executed. Exit codes: 0 built, 1 a --run command failed (still recorded), 2 usage.`;

const say = (s) => console.log(paint(s, useColor()));

/** The ownership check (src/flow/access.mjs), when this build has it; null otherwise. */
async function loadAccess() {
  try { const m = await import('./flow/access.mjs'); return typeof m.accessFlow === 'function' ? m.accessFlow : null; } catch { return null; }
}

export async function passportMain(argv) {
  if (argv[0] === 'check') return checkMain(argv.slice(1));
  const a = { _: [], base: null, head: null, run: [], purpose: null, purposeFile: null, evidence: [], json: false, md: false, out: null, mdOut: null, access: true };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    const need = () => { const v = argv[++i]; if (v == null) throw new Error(`${x} needs a value.`); return v; };
    try {
      if (x === '--base') a.base = need();
      else if (x === '--head') a.head = need();
      else if (x === '--run') a.run.push(need());
      else if (x === '--purpose') a.purpose = need();
      else if (x === '--purpose-file') a.purposeFile = need();
      else if (x === '--evidence') a.evidence.push(need());
      else if (x === '--json') a.json = true;
      else if (x === '--no-access') a.access = false;
      else if (x === '--md') a.md = true;
      else if (x === '--out') a.out = need();
      else if (x === '--md-out') a.mdOut = need();
      else if (x === '--help' || x === '-h') { console.log(USAGE); return 0; }
      else if (x.startsWith('--')) { console.error(`thunder passport: there is no option ${x}.\n${USAGE}`); return 2; }
      else a._.push(x);
    } catch (e) { console.error(`thunder passport: ${e.message}\n${USAGE}`); return 2; }
  }
  if (!a._.length) { console.error(`thunder passport: name the folders it describes (each one part, as for thunder trace).\n${USAGE}`); return 2; }
  if (a.json && a.md) { console.error('thunder passport: choose --json or --md, not both.'); return 2; }
  let purpose = null;
  if (a.purposeFile) {
    try { purpose = { text: readFileSync(a.purposeFile, 'utf8').trim().slice(0, 4000), source: a.purposeFile }; } catch { console.error(`thunder passport: couldn't read ${a.purposeFile}.`); return 2; }
  } else if (a.purpose) purpose = { text: a.purpose, source: 'given with --purpose' };
  const evidence = [];
  for (const f of a.evidence) {
    try { evidence.push(JSON.parse(readFileSync(f, 'utf8'))); } catch { console.error(`thunder passport: ${f} is not a JSON file Thunder can read.`); return 2; }
  }
  const relativeTo = a.out ? dirname(resolve(a.out)) : process.cwd();
  let p;
  const access = a.access ? await loadAccess() : null;
  try { p = buildPassport({ parts: a._, base: a.base, head: a.head, run: a.run, purpose, evidence, access, relativeTo }); }
  catch (e) { console.error(`thunder passport: ${e.message}`); return 2; }
  if (a.mdOut) writeFileSync(a.mdOut, renderPassportMarkdown(p));
  const failed = p.evidence.some((e) => e.kind === 'test-run' && e.status === 'failed');
  const text = a.md ? renderPassportMarkdown(p) : `${JSON.stringify(p, null, 2)}\n`;
  if (a.out) {
    writeFileSync(a.out, a.md ? text : `${JSON.stringify(p, null, 2)}\n`);
    if (!a.json) { say(renderPassportSummary(p)); say(`\nWrote ${a.out}. Check it later with: thunder passport check ${a.out}`); }
  } else if (a.json) process.stdout.write(text);
  else if (a.md) process.stdout.write(text);
  else say(renderPassportSummary(p));
  return failed ? 1 : 0;
}

function checkMain(argv) {
  const a = { _: [], json: false, dirs: {} };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--json') a.json = true;
    else if (x === '--part') { const m = String(argv[++i] ?? '').match(/^([^=]+)=(.+)$/); if (!m) { console.error('thunder passport check: --part needs name=folder.'); return 2; } a.dirs[m[1]] = m[2]; }
    else if (x === '--help' || x === '-h') { console.log(USAGE); return 0; }
    else if (x.startsWith('--')) { console.error(`thunder passport check: there is no option ${x}.\n${USAGE}`); return 2; }
    else a._.push(x);
  }
  if (a._.length !== 1) { console.error(`thunder passport check: name one passport file.\n${USAGE}`); return 2; }
  let p;
  try { p = JSON.parse(readFileSync(a._[0], 'utf8')); } catch { console.error(`thunder passport check: couldn't read ${a._[0]} as a passport.`); return 2; }
  let r;
  try { r = checkPassportOnDisk(p, { baseDir: dirname(resolve(a._[0])), dirs: a.dirs }); } catch (e) { console.error(`thunder passport check: ${e.message}`); return 2; }
  if (a.json) { console.log(JSON.stringify(r, null, 2)); return 0; }
  const L = [`Thunder passport check: ${r.current} current, ${r.stale} stale (nothing was re-run)`, ''];
  for (const x of r.items) {
    L.push(`  ${x.freshness === 'current' ? '✓ current' : x.freshness === 'stale' ? '! stale' : '○ unknown'}: ${x.claim}`);
    for (const c of x.changed) L.push(`      ${c.part}/${c.file} ${c.now === 'missing' ? 'is gone' : 'changed since the passport was built'}`);
  }
  if (r.changedFiles.length) L.push('', `Files that changed since the passport was built: ${r.changedFiles.map((c) => `${c.part}/${c.file}${c.now === 'missing' ? ' (gone)' : ''}`).join(', ')}`);
  if (r.stale) L.push('', 'Stale claims are not evidence about the code as it is now. Build a new passport to re-run them.');
  say(L.join('\n'));
  return 0;
}
