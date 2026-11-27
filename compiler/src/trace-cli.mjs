// thunder trace: the command line for Thunder Trace (src/trace.mjs, docs/trace.md).
//   thunder trace <folder…> [--json] [--out graph.json]       the links between repositories
//   thunder trace impact <thing> <folder…> [--json]           what changing a route, event, table, setting, package, or file can affect
//   thunder trace impact --diff [--base <ref>] <folder…>      what the current changes (branch + uncommitted) can affect
import { writeFileSync } from 'node:fs';
import { buildTrace, renderTrace, traceImpact, traceImpactOf, renderImpact } from './trace.mjs';
import { readRepoDir, gitChanges } from './trace-fs.mjs';

const USAGE = `usage: thunder trace <folder> <folder> … [--json] [--out graph.json]
       thunder trace impact "<POST /api/orders | event name | table:orders | setting:KEY | package:name | repo:file[:line]>" <folder> … [--json]
       thunder trace impact --diff [--base <ref>] <folder> … [--json]
Each folder is one repository. Nothing is run; links are read from code.`;

export function traceMain(argv) {
  const a = { _: [], json: false, diff: false, base: null, out: null, maxFiles: 5000 };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--json') a.json = true;
    else if (x === '--diff') a.diff = true;
    else if (x === '--base') a.base = argv[++i];
    else if (x === '--out') a.out = argv[++i];
    else if (x === '--max-files') a.maxFiles = Number(argv[++i]);
    else if (x === '--help' || x === '-h') { console.log(USAGE); return 0; }
    else if (x.startsWith('--')) { console.error(`thunder trace: unknown option ${x}\n${USAGE}`); return 2; }
    else a._.push(x);
  }
  const impact = a._[0] === 'impact';
  if (impact) a._.shift();
  const term = impact && !a.diff ? a._.shift() : null;
  if (impact && !a.diff && !term) { console.error(`thunder trace impact: name what changes (a route, an event, table:name, setting:KEY, package:name, or repo:file), or use --diff.\n${USAGE}`); return 2; }
  if (!a._.length) { console.error(`thunder trace: give at least one repository folder.\n${USAGE}`); return 2; }
  let repos;
  try { repos = a._.map((d) => readRepoDir(d, { maxFiles: a.maxFiles })); } catch (e) { console.error(`thunder trace: ${e.message}`); return 2; }
  const trace = buildTrace(repos);
  if (!impact) {
    if (a.out) writeFileSync(a.out, `${JSON.stringify(trace, null, 2)}\n`);
    console.log(a.json ? JSON.stringify(trace, null, 2) : renderTrace(trace) + (a.out ? `\nWrote ${a.out}.` : ''));
    return 0;
  }
  if (term) {
    const r = traceImpactOf(trace, term);
    console.log(a.json ? JSON.stringify(r, null, 2) : renderImpact(r));
    return r.matched.length ? 0 : 1;
  }
  const changes = [], notes = [];
  for (const repo of repos) {
    const g = gitChanges(repo, a.base);
    if (!g.base) notes.push(g.why); else changes.push(...g.changes);
  }
  const r = traceImpact(trace, changes);
  if (a.json) console.log(JSON.stringify({ ...r, notes }, null, 2));
  else {
    console.log(`${changes.length ? `${changes.length} changed file${changes.length === 1 ? '' : 's'} across ${new Set(changes.map((c) => c.repo)).size} of ${repos.length} repositories.` : 'No changes found.'}`);
    for (const n of notes) console.log(`Note: ${n}`);
    console.log(renderImpact(r));
  }
  return 0;
}
