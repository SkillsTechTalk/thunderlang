#!/usr/bin/env node
// How pretty (and how readable) Thunder's readings are on real code: counts the patterns that make a reading ugly.
//
//   node compiler/scripts/reading-quality.mjs <folder> [<folder> …] [--half dev|held|all] [--max-files n] [--samples n] [--json]
//
// Every file is read on its own (thunderModel + modelText) and each step line is checked for:
//   code          a step shown as code ("code, not explained"), as a share of all steps
//   dangling      a sentence ending on a preposition or an article ("… from change approval for")
//   theseSteps    "Calls X with these steps"
//   vague         "Works out X" with nothing after it
//   article       "a" before a vowel sound, "an" before a consonant sound ("a AgentCheckResult")
//   duplicate     the same step twice in a row
//   label         a member labeled with words that are not its own name ("Change approval" for `approve`)
//   typeLeak      type syntax inside a sentence (`as {`, `!.`, `=>`, `<T>`)
//
// The folders' files are split in two by a hash of their path: --half dev (look at these while fixing), --half held
// (measure only). Sample ids are a hash of the path plus a line number, so nothing from the code is printed.
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { collectReadableFiles } from '../src/read-repo-fs.mjs';
import { readableLanguage } from '../src/read-repo.mjs';
import { thunderModel, modelText } from '../src/model.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const half = opt('--half', 'all');
const maxFiles = Number(opt('--max-files', 300));
const samplesWanted = Number(opt('--samples', 3));
const json = args.includes('--json');
const shapesWanted = Number(opt('--shapes', 0));
const folders = args.filter((a, i) => !a.startsWith('--') && !['--half', '--max-files', '--samples', '--shapes'].includes(args[i - 1]));
if (!folders.length) { console.error('usage: reading-quality.mjs <folder> … [--half dev|held|all] [--max-files n] [--samples n] [--json]'); process.exit(2); }

const SKIP = /(^|\/)(node_modules|dist|build|out|vendor|generated|coverage|\.next|__pycache__|site-packages|venv|\.venv|target|bin|obj)(\/|$)|\.min\.|\.d\.ts$|\.generated\.|_pb2\.py$|\.test\.|\.spec\.|(^|\/)(tests?|__tests__|__mocks__|fixtures?|e2e|migrations)\//;
// A built or minified file (very long lines) is not code a person wrote.
const minified = (src) => { const ls = src.split('\n'); return ls.some((l) => l.length > 1000) || src.length / Math.max(1, ls.length) > 200; };
const hash = (s) => createHash('sha1').update(s).digest('hex');
const inHalf = (key) => half === 'all' || (half === 'dev') === (parseInt(hash(key)[0], 16) < 8);

const PATTERNS = ['code', 'dangling', 'theseSteps', 'vague', 'article', 'duplicate', 'label', 'typeLeak'];
const DANGLING = /\s(?:for|to|of|with|from|by|in|on|at|into|about|as|via|a|an|the)$/i;
const VOWEL_SOUND = (w) => /^(?:[AEIOaeio]|U(?:n|m|nd|tt|pp)|u(?:n|m)|[FHLMNRSX][A-Z0-9]|[fhlmnrsx](?=[A-Z0-9]))/.test(w) && !/^(?:Eu|eu|Uni|uni|Use|use|Usu|One|one|Ur)/.test(w);
const words = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();

const stats = new Map(); // language -> { files, members, steps, counts, samples }
const of = (lang) => stats.get(lang) ?? stats.set(lang, { files: 0, members: 0, steps: 0, counts: Object.fromEntries(PATTERNS.map((p) => [p, 0])), samples: Object.fromEntries(PATTERNS.map((p) => [p, []])) }).get(lang);

// The SHAPE of a step shown as code: names become x, text "s", numbers 0; keywords and punctuation stay. Shapes are
// printed instead of code, so nothing from a private file is shown, and the most frequent shapes say what to teach next.
const KEYWORDS = new Set('if else elif for while return const let var function async await new this self def class import from export default try catch finally throw raise in of is not and or None null undefined true false True False with as lambda yield match case break continue pass del global nonlocal assert fn let mut impl pub use mod struct enum where loop move ref Some None Ok Err typeof instanceof void delete switch static public private protected readonly interface type extends implements super get set'.split(' '));
const shapeOf = (code) => String(code).replace(/…$/, '')
  .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1?/g, '"s"')
  .replace(/\b\d+(?:\.\d+)?\b/g, '0')
  .replace(/[A-Za-z_$][\w$]*/g, (w) => (KEYWORDS.has(w) ? w : 'x'))
  .replace(/x(?:\s*\.\s*x)+/g, 'x.x').replace(/\s+/g, ' ').trim();

function check(lang, id, line, text, member) {
  const s = of(lang);
  const hit = (p) => { s.counts[p]++; if (s.samples[p].length < samplesWanted) s.samples[p].push(`${id}:${line ?? '?'}`); };
  if (/\(code, not explained\)/.test(text)) {
    hit('code');
    const code = (text.match(/`(.*)` \(code, not explained\)/) || [])[1];
    if (code != null) { s.shapes ??= new Map(); const k = shapeOf(code); s.shapes.set(k, (s.shapes.get(k) ?? 0) + 1); }
    return;
  }
  const said = text.replace(/\s+\(line \d+\)$/, '').trim();
  if (DANGLING.test(said)) hit('dangling');
  if (/^Calls [\w ]+ with these steps$/.test(said)) hit('theseSteps');
  if (/^Works out [^:]+$/.test(said) && !/ from | remembers it/.test(said)) hit('vague');
  for (const m of said.matchAll(/\b(a|an) ([A-Za-z][\w]*)/g)) if ((m[1] === 'a') === VOWEL_SOUND(m[2]) && /^[A-Z]/.test(m[2])) { hit('article'); break; }
  if (/\bas \{|!\.|=>|\b[A-Za-z]+<[A-Za-z]/.test(said)) hit('typeLeak');
  void member;
}

let seen = 0;
for (const folder of folders) {
  const root = resolve(folder);
  const files = collectReadableFiles(root, { maxFiles: 20000 }).filter((f) => f.source && !SKIP.test(f.path) && !minified(f.source));
  let perFolder = 0;
  for (const f of files) {
    if (perFolder >= maxFiles) break;
    const key = `${root}/${f.path}`;
    if (!inHalf(key)) continue;
    const lang = readableLanguage(f.path);
    if (!lang || ['json', 'yaml', 'markdown', 'toml', 'sql', 'shell', 'dockerfile', 'hcl', 'bicep'].includes(lang)) continue;
    let model;
    try { model = thunderModel([{ path: f.path, source: f.source }]); } catch { continue; }
    seen++; perFolder++;
    const s = of(lang);
    s.files++;
    const id = hash(key).slice(0, 10);
    for (const m of model.members) {
      if (m.kind === 'setup') continue;
      s.members++;
      if (m.name && !m.route && m.label) {
        const own = words(String(m.name).split(/[.#]/).pop());
        const lab = m.label.toLowerCase().replace(/\?$/, '');
        if (own && lab !== own && !lab.includes(own) && !own.includes(lab)) { s.counts.label++; if (s.samples.label.length < samplesWanted) s.samples.label.push(`${id}:${m.lines?.[0] ?? '?'}`); }
      }
      let text;
      // (What a person sees: the plain reading, without the "— means: …" detail a view folds away.)
      try { text = modelText(model, m.id); } catch { continue; }
      let prev = null;
      for (const raw of text.split('\n')) {
        const mm = /^(\s*)- (.*?)(?:\s+\(line (\d+)\))?$/.exec(raw);
        if (!mm) { prev = null; continue; }
        s.steps++;
        const key2 = `${mm[1].length}|${mm[2]}`;
        if (prev === key2 && !/\(code, not explained\)/.test(mm[2])) { s.counts.duplicate++; if (s.samples.duplicate.length < samplesWanted) s.samples.duplicate.push(`${id}:${mm[3] ?? '?'}`); }
        prev = key2;
        check(lang, id, mm[3], `${mm[2]}${mm[3] ? `  (line ${mm[3]})` : ''}`, m);
      }
    }
  }
}

const rows = [...stats.entries()].sort((a, b) => b[1].steps - a[1].steps);
if (json) {
  console.log(JSON.stringify(Object.fromEntries(rows.map(([l, s]) => [l, { files: s.files, members: s.members, steps: s.steps, codeShare: s.steps ? +(s.counts.code / s.steps).toFixed(4) : 0, counts: s.counts, samples: s.samples }])), null, 2));
} else {
  console.log(`half: ${half}, files read: ${seen}`);
  for (const [lang, s] of rows) {
    console.log(`\n${lang}: ${s.files} files, ${s.members} members, ${s.steps} steps, code ${(100 * s.counts.code / Math.max(1, s.steps)).toFixed(1)}%`);
    console.log(`  ${PATTERNS.filter((p) => p !== 'code').map((p) => `${p} ${s.counts[p]}`).join(' · ')}`);
    for (const p of PATTERNS) if (s.samples[p].length) console.log(`    ${p}: ${s.samples[p].join(' ')}`);
    if (shapesWanted && s.shapes) {
      console.log(`  top shapes shown as code:`);
      for (const [k, n] of [...s.shapes.entries()].sort((a, b) => b[1] - a[1]).slice(0, shapesWanted)) console.log(`    ${String(n).padStart(4)}  ${k.slice(0, 110)}`);
    }
  }
}
