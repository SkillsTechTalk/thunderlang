#!/usr/bin/env node
// How accurate is Thunder? Three measurements on real code, so a wrong picture shows up as a number, not a surprise.
//
//   1. Round trip (exact): code → Thunder → code in every language Thunder writes → read back → run both on every
//      edge case. Same answers everywhere = no loss. Applies to rules (decisions), because Thunder can run them.
//   2. What a step keeps: steps cannot be run, so check what the Thunder wording keeps from the code line: every
//      number and text value must appear in the code (anything else is invented), and how many of the code's names
//      the wording mentions. Steps shown as code are counted apart: honest, but not explained.
//   3. Big Picture against an independent count: classes, routes, and methods counted by a separate, deliberately
//      simple scan, compared with what Thunder's model draws: missing, misplaced (a method owned by the wrong Thing),
//      or invented.
//
// Usage: node scripts/accuracy.mjs <folder>... [--json] [--samples out.md --per-language 30]
import { writeFileSync } from 'node:fs';
import { collectReadableFiles } from '../src/read-repo-fs.mjs';
import { readableLanguage, readFiles } from '../src/read-repo.mjs';
import { readCode } from '../src/read.mjs';
import { parseIntent } from '../src/parse.mjs';
import { translateDecisions, TRANSLATE_LANGUAGES } from '../src/translate.mjs';
import { compareRules } from '../src/same.mjs';
import { thunderModel, modelText, readLevel } from '../src/model.mjs';

const args = process.argv.slice(2);
const dirs = args.filter((a, i) => !a.startsWith('--') && !['--samples', '--per-language'].includes(args[i - 1]));
const flag = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
if (!dirs.length) { console.error('Use: node scripts/accuracy.mjs <folder>... [--json] [--samples out.md --per-language 30]'); process.exit(2); }

const words = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-.$]+/g, ' ').toLowerCase().trim();
const flat = (steps) => (steps || []).flatMap((s) => [s, ...flat(s.children), ...flat(s.otherwise), ...(s.handlers || []).flatMap((h) => flat(h.steps)), ...flat(s.always?.steps)]);
const TARGETS = TRANSLATE_LANGUAGES.map((l) => l.key);
const KEYWORDS = new Set('if else elif for while do return const let var new await async function def fn func public private protected static final void int string bool boolean true false null nil none undefined this self try catch finally throw raise import from as in of is not and or the let mut pub use val fun class struct enum interface type when match switch case break continue yield lambda end then begin elsif unless puts echo print println printf console log'.split(' '));

// ── 1. Round trip for rules ──────────────────────────────────────────────────────────────────────────────

function roundTrip(item, fromLang) {
  const out = [];
  let ast;
  try { ast = parseIntent(item.thunder); } catch (e) { return TARGETS.map((to) => ({ to, result: 'not-written', why: `Thunder could not parse its own card: ${e.message}` })); }
  for (const to of TARGETS) {
    let code, back;
    try { code = translateDecisions(ast, to); } catch (e) { out.push({ to, result: 'not-written', why: e.message }); continue; }
    try { back = readCode(code, { language: to }).items.find((i) => i.kind === 'decision'); } catch (e) { out.push({ to, result: 'not-read-back', why: e.message, code }); continue; }
    if (!back) { out.push({ to, result: 'not-read-back', why: 'the written code did not read back as a rule', code }); continue; }
    const r = compareRules(item, back);
    if (!r) out.push({ to, result: 'cannot-run', why: 'one side could not be run as a card', code });
    else out.push({ to, result: r.same ? 'same' : 'different', tried: r.tried, ...(r.same ? {} : { why: r.reason ?? `different for ${r.counterexample?.facts}: ${r.counterexample?.old} before, ${r.counterexample?.new} after`, code }) });
  }
  return out;
}

// ── 2. What a step keeps ─────────────────────────────────────────────────────────────────────────────────

function stepFidelity(step, lines = []) {
  if (step.restates || step.kind === 'other') return { asCode: true };
  // Compare with the step's full source lines (a step's `code` may be shortened for display).
  const span = step.span ? lines.slice(step.span.startLine - 1, step.span.endLine).join('\n') : lines[step.line - 1] ?? '';
  const code = `${String(step.code || '').replace(/…$/, '')}\n${span}`;
  const firstLine = lines[step.line - 1] ?? String(step.code || '');
  // Thunder's own counts ("or 28 other values", "(3 steps inside)") are not values from the code.
  const says = String(step.says || '').replace(/\bor \d+ other values?\b/g, '').replace(/\(\d+ steps? inside\)/g, '');
  // Invented: a number or a quoted text in the wording that the code does not contain.
  const invented = [];
  for (const n of says.match(/(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g) || []) if (!code.includes(n) && !/^(1|0)$/.test(n)) invented.push(n);
  for (const q of says.match(/"[^"]{1,80}"/g) || []) { const inner = q.slice(1, -1).replace(/…$/, ''); const parts = inner.split('…').map((x) => x.trim()).filter((x) => x.length > 2); if (parts.some((p) => !code.includes(p) && !code.includes(p.replace(/\\"/g, '"')))) invented.push(q); }
  // Kept: how many of the code's names the wording mentions (as words).
  const names = [...new Set((firstLine.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, ' ').match(/[A-Za-z_][\w]*/g) || []).filter((t) => !KEYWORDS.has(t.toLowerCase()) && t.length > 1))];
  const sw = ` ${words(says)} `;
  const kept = names.filter((n) => sw.includes(` ${words(n)} `) || words(n).split(' ').every((w) => sw.includes(` ${w}`)));
  return { names: names.length, kept: kept.length, invented };
}

// ── 3. Big Picture against an independent count ──────────────────────────────────────────────────────────

const DECL = {
  python: /^\s*class\s+(\w+)/gm, typescript: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:class|enum)\s+(\w+)/gm, javascript: /^\s*(?:export\s+)?(?:default\s+)?class\s+(\w+)/gm,
  java: /^\s*(?:@\w+\s+)*(?:(?:public|private|protected|static|final|abstract|sealed)\s+)*(?:class|record|enum)\s+(\w+)/gm, csharp: /^\s*(?:\[[^\]]*\]\s*)*(?:(?:public|private|protected|internal|static|sealed|abstract|partial|readonly)\s+)*(?:class|struct|record|enum)\s+(\w+)/gm,
  kotlin: /^\s*(?:(?:public|private|internal|open|abstract|sealed|data|enum|inner)\s+)*(?:class|object)\s+(\w+)/gm, php: /^\s*(?:(?:final|abstract|readonly)\s+)*(?:class|enum)\s+(\w+)/gm,
  go: /^type\s+(\w+)\s+struct\b/gm, rust: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum)\s+(\w+)/gm, ruby: /^\s*class\s+(\w+)/gm,
};
const ROUTE = /\b(?:app|router|api|server|fastify|r|e|g|mux)\s*\.\s*(?:get|post|put|patch|delete)\s*\(\s*["'`]|@(?:app|router|bp|blueprint)\s*\.\s*(?:get|post|put|patch|delete|route)\s*\(|@(?:Get|Post|Put|Patch|Delete|Request)Mapping\b|\[Http(?:Get|Post|Put|Patch|Delete)\b|^\s*(?:get|post|put|patch|delete)\s+['"]\//gm;

function bigPictureCheck(model, files) {
  const byFile = new Map();
  for (const f of files) {
    const lang = readableLanguage(f.path);
    const re = DECL[lang];
    if (!re || !f.source) continue;
    const declared = [...f.source.matchAll(re)].map((m) => m[1]).filter((n) => !/(Exception|Error)$/.test(n));
    byFile.set(f.path, { lang, declared, routes: (f.source.match(ROUTE) || []).length });
  }
  let declared = 0, drawn = 0, missing = [], routesFound = 0, routesDrawn = 0, misplaced = 0;
  for (const [path, info] of byFile) {
    const things = model.things.filter((t) => t.file === path);
    const names = new Set(things.map((t) => t.name));
    declared += info.declared.length;
    for (const d of info.declared) { if (names.has(d)) drawn++; else if (missing.length < 40) missing.push(`${path}: ${d}`); }
    routesFound += info.routes;
    routesDrawn += model.members.filter((m) => m.file === path && m.route).length;
  }
  // Misplaced: a member whose lines sit inside a Thing's own lines (in a brace or indent language) but which is owned
  // by another Thing or by none. Go/Rust methods live outside their type by design and are not counted here.
  for (const m of model.members) {
    const inside = model.things.filter((t) => t.file === m.file && m.lines[0] > t.lines[0] && m.lines[0] <= t.lines[1]).sort((a, b) => b.lines[0] - a.lines[0])[0];
    if (inside && m.owner !== inside.id && !/\.(go|rs)$/.test(m.file)) misplaced++;
  }
  return { declared, drawn, missing, routesFound, routesDrawn, misplaced, members: model.members.length };
}

// ── 4. Inputs and outputs against the code ───────────────────────────────────────────────────────────────

const PLUMB = /^(self|this|cls|req|request|res|response|reply|ctx|context|c|w|r|next|db|session|logger|_req|_res|_)$/;
function inputsOutputs(model, files, details) {
  const src = new Map(files.map((f) => [f.path, f.source?.split('\n') ?? []]));
  const io = { members: 0, inputsInCode: 0, inputsShown: 0, missingInputs: [], outputsInCode: 0, outputsShown: 0, membersWithOutputs: 0, membersShowingNone: [] };
  for (const m of model.members) {
    if (m.kind === 'setup' || m.kind === 'not-read') continue;
    io.members++;
    const body = (src.get(m.file) ?? []).slice(m.lines[0] - 1, m.lines[1]).join('\n');
    // The signature: from the function's own name to the end of its parameter list (a route registration's path and a
    // Go receiver are not inputs).
    const at = body.search(new RegExp(`\\b${m.name.replace(/[^\w]/g, '')}\\s*\\(`));
    const sig = at >= 0 ? body.slice(at) : body.replace(/^[^(]*\(\s*["'`][^"'`]*["'`]\s*,\s*/, '').replace(/^(?:async\s+)?(?:function\s*\w*\s*)?/, '');
    const open = sig.indexOf('(');
    let close = -1;
    for (let i = open, d = 0; open >= 0 && i < sig.length; i++) { if (sig[i] === '(') d++; else if (sig[i] === ')' && --d === 0) { close = i; break; } }
    const head = open >= 0 && close > open ? sig.slice(open, close + 1) : '';
    // Inputs in the code: the parameter names in the signature (not plumbing), and values read from the request.
    // Each parameter's NAME: before the colon (TS, Python, Kotlin, Swift, Rust, Go-style "name type" uses the first word),
    // or the last word (Java, C#, C, C++: "Type name"); PHP's $ dropped; defaults dropped.
    const lang = m.language;
    const nameFirst = /^(typescript|javascript|python|kotlin|rust|go|ruby|swift|r|shell|powershell)$/.test(lang);
    const params = head.slice(1, -1).split(/,(?![^<(\[{]*[>)\]}])/).map((p) => p.replace(/=.*$/s, '').replace(/@\w+(\([^)]*\))?/g, '').trim()).filter(Boolean)
      .map((p) => { const t = p.replace(/^(?:\.\.\.|\*{1,2}|&|mut\s+|final\s+|const\s+|ref\s+|out\s+|in\s+|params\s+|this\s+)/, '').split(/[:\s]+/).filter(Boolean); const n = nameFirst ? t[0] : t[t.length - 1]; return String(n || '').replace(/^\$/, '').replace(/[?*&]/g, ''); })
      .filter((n) => n && /^[A-Za-z_][\w]*$/.test(n) && !PLUMB.test(n));
    const requestReads = new Set([...body.matchAll(/\b(?:req|request|ctx\.request|c\.req)\s*\.\s*(?:headers\s*\[\s*['"`]([^'"`]+)|(?:query|params|body)\s*\.\s*(\w+))/g)].map((x) => x[1] || x[2]));
    const destructured = (head.match(/^\(\s*\{([^}]*)\}/) || [])[1]?.split(',').map((x) => x.split(/[:=]/)[0].trim()).filter(Boolean) ?? [];
    const inCode = new Set([...params.filter((p) => !destructured.length), ...destructured, ...requestReads].filter(Boolean));
    io.inputsInCode += inCode.size;
    const shown = m.youGive.join(' | ').toLowerCase();
    const w = (x) => String(x).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
    const found = [...inCode].filter((x) => shown.includes(w(x)) || shown.includes(String(x).toLowerCase()));
    io.inputsShown += found.length;
    if (found.length < inCode.size && io.missingInputs.length < 30) io.missingInputs.push(`${m.file}:${m.lines[0]} ${m.name}: code has ${[...inCode].join(', ')}; Thunder shows ${m.youGive.join(', ') || 'nothing'}`);
    // Outputs in the code: return statements with a value, responses sent, and throws.
    const outs = (body.match(/\breturn\s+[^;\s}]|\b(?:res|reply|response)\s*\.\s*(?:status\([^)]*\)\s*\.\s*)?(?:json|send|sendStatus|render|redirect|end)\s*\(|\b(?:throw|raise)\b|\bjsonify\(|\bc\.JSON\(/g) || []).length;
    const d = details(m);
    const shownOut = d.givesBack.length + d.stops.length;
    io.outputsInCode += outs ? 1 : 0;
    if (outs) { io.membersWithOutputs++; if (shownOut) io.outputsShown++; else if (io.membersShowingNone.length < 30) io.membersShowingNone.push(`${m.file}:${m.lines[0]} ${m.name}: code has ${outs} return/response/throw; Thunder shows no ending`); }
  }
  return io;
}

// ── Run ─────────────────────────────────────────────────────────────────────────────────────────────────

const report = { repos: [], totals: { rules: 0, trips: 0, same: 0, different: 0, notReadBack: 0, cannotRun: 0, notWritten: 0, steps: 0, asCode: 0, names: 0, kept: 0, invented: 0 }, failures: [], inventedExamples: [] };
const samples = [];
for (const dir of dirs) {
  const files = readFiles(collectReadableFiles(dir, { maxFiles: 3000 }).filter((f) => f.source && !/(^|\/)(test|tests|spec|__tests__|testdata|fixtures?)\//i.test(f.path)));
  const repo = { repo: dir.split('/').pop(), files: files.length, languages: {}, rules: 0, trips: 0, same: 0, steps: 0, asCode: 0, names: 0, kept: 0, invented: 0 };
  for (const f of files) {
    if (!f.reading) continue;
    const lang = f.reading.language;
    repo.languages[lang] = (repo.languages[lang] || 0) + 1;
    for (const it of f.reading.items) {
      if (it.kind === 'decision' && it.thunder) {
        repo.rules++;
        for (const t of roundTrip(it, lang)) {
          repo.trips++;
          const k = { same: 'same', different: 'different', 'not-read-back': 'notReadBack', 'cannot-run': 'cannotRun', 'not-written': 'notWritten' }[t.result];
          report.totals[k]++;
          if (t.result === 'same') repo.same++;
          else if (report.failures.length < 200) report.failures.push({ file: `${repo.repo}/${f.path}:${it.line}`, rule: it.name, from: lang, to: t.to, result: t.result, why: t.why });
        }
      }
      if (it.kind === 'function' && it.steps) {
        const lines = f.source.split('\n');
        for (const s of flat(it.steps)) {
          const r = stepFidelity(s, lines);
          repo.steps++;
          if (r.asCode) { repo.asCode++; continue; }
          repo.names += r.names; repo.kept += r.kept;
          if (r.invented.length) { repo.invented++; if (report.inventedExamples.length < 60) report.inventedExamples.push({ file: `${repo.repo}/${f.path}:${s.line}`, code: String(s.code).slice(0, 160), says: s.says, invented: r.invented }); }
        }
      }
    }
  }
  const model = thunderModel(files, { name: repo.repo });
  repo.bigPicture = bigPictureCheck(model, files);
  repo.io = inputsOutputs(model, files, (m) => readLevel(model, 'details', m.id));
  for (const k of ['rules', 'trips', 'steps', 'asCode', 'names', 'kept', 'invented']) report.totals[k] += repo[k];
  report.repos.push(repo);
  // Samples for a person to grade: functions and rules, spread across files.
  const per = Number(flag('--per-language', 0));
  if (per) {
    const members = model.members.filter((m) => m.kind !== 'setup' && m.flow.nodes.length > 2);
    const step = Math.max(1, Math.floor(members.length / per));
    for (let i = 0; i < members.length && samples.filter((x) => x.repo === repo.repo).length < per; i += step) {
      const m = members[i];
      const src = files.find((f) => f.path === m.file)?.source.split('\n').slice(m.lines[0] - 1, m.lines[1]).join('\n') ?? '';
      if (src.length > 2500) continue;
      samples.push({ repo: repo.repo, file: m.file, lines: m.lines, language: m.language, code: src, thunder: modelText(model, m.id) });
    }
  }
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : 'n/a');
if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log('Repo | rules | round trips same | steps explained | names kept | steps with an invented value | classes drawn | routes drawn | methods misplaced | inputs shown | endings shown');
  for (const r of report.repos) {
    const b = r.bigPicture;
    console.log(`${r.repo} | ${r.rules} | ${pct(r.same, r.trips)} (${r.same}/${r.trips}) | ${pct(r.steps - r.asCode, r.steps)} | ${pct(r.kept, r.names)} | ${r.invented} of ${r.steps - r.asCode} | ${pct(b.drawn, b.declared)} (${b.drawn}/${b.declared}) | ${b.routesDrawn}/${b.routesFound} | ${b.misplaced} of ${b.members} | ${pct(r.io.inputsShown, r.io.inputsInCode)} (${r.io.inputsShown}/${r.io.inputsInCode}) | ${pct(r.io.outputsShown, r.io.membersWithOutputs)}`);
  }
  const t = report.totals;
  console.log(`\nAll: round trips same ${pct(t.same, t.trips)} (${t.same}/${t.trips}; different ${t.different}, not read back ${t.notReadBack}, cannot run ${t.cannotRun}, not written ${t.notWritten}); steps explained ${pct(t.steps - t.asCode, t.steps)}; names kept ${pct(t.kept, t.names)}; steps with an invented value ${t.invented}`);
}
const out = flag('--samples');
if (out) {
  writeFileSync(out, samples.map((s, i) => `## ${i + 1}. ${s.repo}/${s.file} lines ${s.lines.join('–')} (${s.language})\n\n\`\`\`${s.language}\n${s.code}\n\`\`\`\n\n\`\`\`thunder\n${s.thunder}\n\`\`\`\n`).join('\n'));
  console.error(`wrote ${samples.length} samples to ${out}`);
}
if (args.includes('--io')) for (const r of report.repos) { console.log(`\n${r.repo}: missing inputs`); r.io.missingInputs.slice(0, 8).forEach((x) => console.log('  ' + x)); console.log(`${r.repo}: no endings shown`); r.io.membersShowingNone.slice(0, 6).forEach((x) => console.log('  ' + x)); }
if (args.includes('--failures')) { console.log(JSON.stringify(report.failures.slice(0, 40), null, 1)); console.log(JSON.stringify(report.inventedExamples.slice(0, 30), null, 1)); }
