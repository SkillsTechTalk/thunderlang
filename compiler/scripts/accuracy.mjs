#!/usr/bin/env node
// How accurate is Thunder? Three measurements on real code, so a wrong picture shows up as a number, not a surprise.
//
//   1. Round trip (exact): code → Thunder → code in every language Thunder writes → read back → run both on every
//      edge case. Same answers everywhere = no loss. Applies to rules (decisions), because Thunder can run them.
//   2. What a step keeps: steps cannot be run, so check what the Thunder wording keeps from the code line: every
//      number and text value must appear in the code (anything else is invented), and how many of the code's names
//      the wording mentions. Steps shown as code are counted apart: honest, but not explained.
//      Names are counted twice: in the short words, and in Details (the words plus every detail one level down,
//      from the step's meaning tree), which is what a reader can see at Details or in the full Thunder Text.
//   2b. Polarity: every question in words keeps the code's negations, and its Stop sits on the side the code takes.
//   2c. Steps round trip (TypeScript, JavaScript, Python, Go): each step's meaning tree is written back as code,
//      read again, and compared; conditions and values made of names and operators are also run, before and after,
//      on generated inputs. "exact" = the same tree came back.
//   3. Big Picture against an independent count: classes, routes, and methods counted by a separate, deliberately
//      simple scan, compared with what Thunder's model draws: missing, misplaced (a method owned by the wrong Thing),
//      or invented.
//
// Usage: node scripts/accuracy.mjs <folder>... [--json] [--steps] [--samples out.md --per-language 30 [--seed N] [--only lang]]
//   Samples come from production code only (test files, `*_test.go`, `*.test.ts`, `*Tests.swift`, `*Spec.*`, and Rust
//   `#[cfg(test)]` modules are left out). With --seed, the members are picked in a seeded random order (the same seed
//   picks the same samples), so a grader sees code the reader was not tuned on; without it, evenly spaced.
import { writeFileSync } from 'node:fs';
import { collectReadableFiles } from '../src/read-repo-fs.mjs';
import { readableLanguage, readFiles } from '../src/read-repo.mjs';
import { readCode } from '../src/read.mjs';
import { parseIntent } from '../src/parse.mjs';
import { translateDecisions, TRANSLATE_LANGUAGES } from '../src/translate.mjs';
import { compareRules } from '../src/same.mjs';
import { thunderModel, modelText, readLevel, askAsQuestion } from '../src/model.mjs';
import { codeCounts, wordCounts, balancedText } from '../src/faithful.mjs';
import { detailParts, wordsAgree } from '../src/meaning.mjs';
import { stepRoundTrip, behaviorCase, runBehavior, ROUND_TRIP_LANGUAGES } from '../src/round-trip.mjs';

const args = process.argv.slice(2);
const dirs = args.filter((a, i) => !a.startsWith('--') && !['--samples', '--per-language', '--seed', '--only', '--json-out'].includes(args[i - 1]));
const flag = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
if (!dirs.length) { console.error('Use: node scripts/accuracy.mjs <folder>... [--json] [--samples out.md --per-language 30]'); process.exit(2); }

const words = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-.$]+/g, ' ').toLowerCase().trim();
const flat = (steps) => (steps || []).flatMap((s) => [s, ...flat(s.children), ...flat(s.otherwise), ...(s.handlers || []).flatMap((h) => flat(h.steps)), ...flat(s.always?.steps)]);
const TARGETS = TRANSLATE_LANGUAGES.map((l) => l.key);
const KEYWORDS = new Set('if else elif for while do return const let var new await async function def fn func public private protected static final void int string bool boolean true false null nil none undefined this self try catch finally throw raise import from as in of is not and or the let mut pub use val fun class struct enum interface type when match switch case break continue yield lambda end then begin elsif unless puts echo print println printf console log with assert del pass global nonlocal except go defer range chan select fallthrough typeof instanceof delete void foreach out ref params open override internal sealed abstract virtual readonly extends implements throws'.split(' '));
// A line's comment is not code: `x = f(y)  # noqa: F811` has the names x, f, y.
const withoutComment = (line) => String(line).replace(/\/\*.*?\*\/|\/\/.*$|(?:^|\s)#(?![[!{]).*$/, ' ');

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

function stepFidelity(step, lines = [], yamlFile = false) {
  if (step.restates || step.kind === 'other' || step.explained === false) return { asCode: true };
  // Compare with the step's full source lines (a step's `code` may be shortened for display).
  let span = step.span ? lines.slice(step.span.startLine - 1, step.span.endLine).join('\n') : lines[step.line - 1] ?? '';
  // A workflow or YAML step is its whole block (`uses:` with its `with:` lines under it), not its first line.
  // (The block ends at the next line indented no further than the step's own: the next step, or the next key.)
  if (yamlFile && step.line) { const first = lines[step.line - 1] ?? ''; const ind = first.replace(/^(\s*)-\s+/, '$1  ').search(/\S/); const out = [first]; for (let k = step.line; k < lines.length && k < step.line + 60; k++) { const l = lines[k]; if (l.trim() && (l.search(/\S/) < ind || (l.search(/\S/) <= ind && /^\s*-\s/.test(l)))) break; out.push(l); } span = `${span}\n${out.join('\n')}`; }
  const code = `${String(step.code || '').replace(/…$/, '')}\n${span}`;
  const firstLine = lines[step.line - 1] ?? String(step.code || '');
  // Thunder's own counts ("or 28 other values", "(3 steps inside)") are not values from the code.
  // A «placeholder» stands for a value written in the code (`«secrets.TOKEN»` for `${{ secrets.TOKEN }}`): only the
  // literal text around it can be invented.
  const says = String(step.says || '').replace(/\bor \d+ other values?\b/g, '').replace(/\(\d+ steps? inside\)/g, '').replace(/\ba list of \d+ items\b|\band \d+ more\b|\b\d+ more\b/g, '').replace(/«[^»]*»|‹[^›]*›|\(worked out when it runs\)/g, "…");
  // Invented: a number or a quoted text in the wording that the code does not contain.
  const invented = [];
  for (const n of says.match(/(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g) || []) if (!code.includes(n) && !/^(1|0)$/.test(n)) invented.push(n);
  // A quoted text may hold quotes of its own (`"The "multiplex" option …"`): it is invented only when neither the
  // shortest nor the longest reading of the quote is in the code. A «placeholder» stands for a value the code inserts
  // (spec: text with values inside), so only the literal parts around it must appear in the code.
  const inCode = (q) => { const inner = q.slice(1, -1).replace(/…$/, ''); const parts = inner.split(/…|«[^»]*»/).map((x) => x.trim()).filter((x) => x.length > 2); return parts.every((p) => code.includes(p) || code.includes(p.replace(/\\"/g, '"')) || code.includes(p.replace(/`/g, '\\`'))); };
  const whole = says.match(/"[^]{1,200}"/);
  for (const q of says.match(/"[^"]{0,80}"/g) || []) if (!inCode(q) && !(whole && inCode(whole[0]))) invented.push(q);
  // Kept: how many of the code's names the wording mentions (as words).
  const names = [...new Set((withoutComment(firstLine.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, ' ')).match(/[A-Za-z_][\w]*/g) || []).filter((t) => !KEYWORDS.has(t.toLowerCase()) && t.length > 1))];
  // (Details is code-like text: its brackets and commas are separators, as spaces are in words.)
  const keptIn = (text, code = false) => { const sw = ` ${words(code ? String(text).replace(/[^\w\s$.-]+/g, " ") : text)} `; return names.filter((n) => sw.includes(` ${words(n)} `) || words(n).split(" ").every((w) => sw.includes(` ${w}`))).length; };
  // Details: the words, every detail one level down, and the steps written on the same line (a one-line if's body).
  const sameLine = (st) => [st, ...(st.children || []).filter((c) => c.line === st.line).flatMap(sameLine)];
  const details = sameLine(step).map((st) => [st.says, ...detailParts(st).map((x) => `${x.label} ${x.text.replace(/["'`]/g, ' ')}`)].join(' ')).join(' ');
  return { names: names.length, kept: keptIn(says), keptDetails: keptIn(details, true), invented };
}

// ── 2b. Polarity: the words of each question, and its Yes / No side, against the code's condition ──────────

/**
 * For a question in words (not shown as code): the number of negations in the code's condition (plus `unless`) must
 * have the same parity as the negations in the words plus the flip (a question asked the positive way round, whose
 * No side is where the code's condition holds). A mismatch is a Stop on the wrong side. Returns null when there is
 * nothing to compare.
 */
// Negation words inside names (`notlogged`, `isNotFound`, `NoColor`) are part of the name, on both sides.
const nameNegs = (text) => (String(text).match(/[A-Za-z_][\w]*/g) || []).filter((id) => !/^(?:not|no|and|or|is|in|unless)$/i.test(id)).reduce((n, id) => n + (` ${words(id)} `.match(/ (?:no|not|non|never) /g) || []).length, 0);
/** A condition's own negations, with the empty-pointer and C text checks read the way the reader reads them. */
function codeNegations(cond, said = '') {
  const c = String(cond)
    // `p != nullptr` / `p != NULL` is "p is set" (as `!= null` is); `!strcmp(a, b)` and `strcmp(a, b) == 0` are "a is b".
    .replace(/!=\s*(?:nullptr|NULL)\b/g, '!= null')
    // (Rust macros `matches!(…)` / `cfg!(…)`: that `!` names a macro; it negates nothing.)
    .replace(/\b([a-z_]\w*)!(?=\s*[(\[])/g, '$1')
    // (TypeScript `x!` only says x is there; a regular expression's `(?!…)` is part of the pattern.)
    .replace(/(^|[=(,:!&|?\s])\/(?:\\.|[^/\n])+\/[gimsuy]*/g, '$1R')
    .replace(/(?<=[\w\])])!!?(?!=)/g, '')
    // (`!(a >= 7)` is said "a is less than 7": the negation is in the comparison.)
    // (Only when the words say the turned-round comparison.)
    .replace(/!\s*\(\s*([^()&|!]+?)\s*(>=|<=|>|<)\s*([^()&|]+?)\s*\)/g, (m, a, op, b) => (new RegExp(`\\b${{ '>=': 'less than', '<=': 'more than', '>': 'at most', '<': 'at least' }[op]}\\b`).test(said) ? `${a} ${{ '>=': '<', '<=': '>', '>': '<=', '<': '>=' }[op]} ${b}` : m))
    .replace(/!\s*(?=(?:std::)?\b(?:strcmp|strcasecmp|strncmp|strncasecmp)\s*\([^()]*\))/g, '')
    .replace(/\b((?:strcmp|strcasecmp|strncmp|strncasecmp)\s*\([^()]*\))\s*!=\s*0\b/g, '!$1');
  return codeCounts(c).neg - nameNegs(c.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, ' '));
}
function polarityOf(step) {
  if (step.kind !== 'branch' || (step.children || []).every((c) => c.caseLabel && c.kind === 'check') && step.children?.length) return null;
  const q = askAsQuestion(step);
  const cond = step.cond;
  if (!cond || q.code || /`/.test(q.text) || /none/i.test(cond)) return null;
  // A question with unbalanced brackets was split in the wrong place (`Is ((a 0) and …`): its side cannot be trusted.
  if (!balancedText(q.text.replace(/(?<=\w)'s\b/g, '').replace(/"(?:\\.|[^"\\])*"/g, 'Q'))) return 'flipped';
  // A question turned round at an "is" inside brackets: `(a is not 0) is not (b)` asked as "Is ((a 0) …".
  const words0 = String(step.says).replace(/^If (?:not: )?/, '').replace(/"(?:\\.|[^"\\])*"/g, 'Q');
  if (/^Is /.test(q.text) && / is /.test(words0) && /[()]/.test(words0) && !balancedText(words0.split(/ is | has /)[0])) return 'flipped';
  // Swift `guard`, Ruby `unless`: the steps under the question run when the condition does not hold.
  const unless = /^If not: /.test(step.says) || /^\s*(?:guard|unless)\b/.test(String(step.code || ''));
  const code = (codeNegations(cond, q.text) + (unless ? 1 : 0)) % 2;
  // (A name the words keep as written, `ERROR_NO_MORE_FILES`, holds its own "no"; one put into words, "not found", says it.)
  const keptNames = (String(cond).replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, ' ').match(/[A-Za-z_][\w]*/g) || []).filter((id) => !q.text.includes(id));
  const said = (wordCounts(q.text.replace(/(?<=\w)'s\b/g, '')).neg - nameNegs(keptNames.join(' ')) + (q.flip ? 1 : 0) + 4) % 2;
  if (code !== said) return 'flipped';
  // A question asked by a rule's name (the model does this for a call to a known rule) must flip the same way.
  if (/^(?:!|not\s+)?(?:self\.|this\.)?\w+\s*\(\s*\)$/.test(String(cond).trim())) { const r = askAsQuestion(step, 'Rule?'); if (((r.flip ? 1 : 0) + 2) % 2 !== (codeNegations(cond) + (unless ? 1 : 0)) % 2) return 'flipped'; }
  return 'same';
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

const report = { repos: [], totals: { rules: 0, trips: 0, same: 0, different: 0, notReadBack: 0, cannotRun: 0, notWritten: 0, steps: 0, asCode: 0, names: 0, kept: 0, keptDetails: 0, invented: 0, disagree: 0, questions: 0, polarity: 0, rtSteps: 0, rtExact: 0, rtDifferent: 0, rtCode: 0, rtNotWritten: 0, rtNotReadBack: 0, bhCases: 0, bhSame: 0, bhDifferent: 0, bhNotRun: 0 }, failures: [], inventedExamples: [], disagreeExamples: [], polarityExamples: [], stepTripFailures: [], behaviorFailures: [] };
const RT = { exact: 'rtExact', different: 'rtDifferent', code: 'rtCode', 'not-written': 'rtNotWritten', 'not-read-back': 'rtNotReadBack' };
const sourceOf = (step, f, lines) => (step.span?.exact === 'offset' && step.span.start != null ? f.source.slice(step.span.start, step.span.end) : step.span ? lines.slice(step.span.startLine - 1, step.span.endLine).join('\n') : lines[step.line - 1] ?? '');
const samples = [];
// Test code is left out of the samples (it stays in the automatic counts): folders, and files named as tests.
const TESTFILE = /(^|\/)(tests?|specs?|__tests__|testdata|fixtures?|androidTest|jvmTest|testDemo|testProd|runtime-tests|benchmarks?|\w*Tests)\/|[._-](test|spec)s?\.\w+$|_test\.\w+$|Tests?\.(java|kt|cs|swift)$|Spec\.\w+$|(^|\/)test\.c$/;
/** Rust `#[cfg(test)] mod … { … }` blocks: file -> [[firstLine, lastLine]]. */
function rustTestModules(files) {
  const out = new Map();
  for (const f of files) {
    if (!/\.rs$/.test(f.path) || !f.source?.includes('cfg(test)')) continue;
    const src = f.source;
    for (const m of src.matchAll(/#\[cfg\(test\)\]\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+\w+\s*\{/g)) {
      let d = 0, end = src.length;
      for (let i = m.index + m[0].length - 1; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) { end = i; break; } }
      const lineOf = (i) => src.slice(0, i).split('\n').length;
      (out.get(f.path) || out.set(f.path, []).get(f.path)).push([lineOf(m.index), lineOf(end)]);
    }
  }
  return out;
}
for (const dir of dirs) {
  const only = flag('--only');
  const files = readFiles(collectReadableFiles(dir, { maxFiles: 3000 }).filter((f) => f.source && !/(^|\/)(test|tests|spec|__tests__|testdata|fixtures?)\//i.test(f.path)));
  const repo = { repo: dir.split('/').pop(), files: files.length, languages: {}, rules: 0, trips: 0, same: 0, steps: 0, asCode: 0, names: 0, kept: 0, keptDetails: 0, invented: 0, disagree: 0, questions: 0, polarity: 0, rtSteps: 0, rtExact: 0, rtDifferent: 0, rtCode: 0, rtNotWritten: 0, rtNotReadBack: 0, bhCases: 0, bhSame: 0, bhDifferent: 0, bhNotRun: 0, rtByLanguage: {} };
  const behavior = {};
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
          const pol = polarityOf(s);
          if (pol) { repo.questions++; if (pol === 'flipped') { repo.polarity++; if (report.polarityExamples.length < 40) report.polarityExamples.push({ file: `${repo.repo}/${f.path}:${s.line}`, code: s.cond, ask: askAsQuestion(s).text }); } }
          // 2c. Round trip of the step's meaning (in the languages Thunder writes steps back to).
          if (ROUND_TRIP_LANGUAGES.includes(lang)) {
            const t = stepRoundTrip(s, lang);
            repo.rtSteps++; repo[RT[t.result]]++;
            const bl = (repo.rtByLanguage[lang] ||= { steps: 0, exact: 0 }); bl.steps++; if (t.result === 'exact') bl.exact++;
            if ((t.result === 'different' || t.result === 'not-read-back') && report.stepTripFailures.length < 80) report.stepTripFailures.push({ file: `${repo.repo}/${f.path}:${s.line}`, result: t.result, code: String(s.code).slice(0, 120), written: t.code?.split('\n')[0], why: t.why });
            // (A step the run check cannot build a case for is not run; it never stops the whole measurement.)
            if (t.result === 'exact') { let c = null; try { c = behaviorCase(s, sourceOf(s, f, lines), lang); } catch (e) { report.behaviorFailures.length < 40 && report.behaviorFailures.push({ at: `${repo.repo}/${f.path}:${s.line}`, original: String(s.code).slice(0, 120), why: `could not build a run case: ${e.message}` }); } if (c) (behavior[lang] ||= []).push({ ...c, at: `${repo.repo}/${f.path}:${s.line}` }); }
          }
          const r = stepFidelity(s, lines, /\.ya?ml$/i.test(f.path));
          repo.steps++;
          if (r.asCode) { repo.asCode++; continue; }
          repo.names += r.names; repo.kept += r.kept; repo.keptDetails += r.keptDetails;
          const dis = wordsAgree(s);
          if (dis.length) { repo.disagree++; if (report.disagreeExamples.length < 60) report.disagreeExamples.push({ file: `${repo.repo}/${f.path}:${s.line}`, code: String(s.code).slice(0, 120), says: s.says, why: dis }); }
          if (r.invented.length) { repo.invented++; if (report.inventedExamples.length < 60) report.inventedExamples.push({ file: `${repo.repo}/${f.path}:${s.line}`, code: String(s.code).slice(0, 160), says: s.says, invented: r.invented }); }
        }
      }
    }
  }
  for (const [lang, cases] of Object.entries(behavior)) {
    const results = runBehavior(cases, lang);
    results.forEach((r, i) => {
      repo.bhCases++;
      if (r.result === 'same') repo.bhSame++; else if (r.result === 'different') { repo.bhDifferent++; if (report.behaviorFailures.length < 40) report.behaviorFailures.push({ at: cases[i].at, original: cases[i].original, written: cases[i].written, why: r.why }); } else repo.bhNotRun++;
    });
  }
  const model = thunderModel(files, { name: repo.repo });
  repo.bigPicture = bigPictureCheck(model, files);
  repo.io = inputsOutputs(model, files, (m) => readLevel(model, 'details', m.id));
  for (const k of ['rules', 'trips', 'steps', 'asCode', 'names', 'kept', 'keptDetails', 'invented', 'disagree', 'questions', 'polarity', 'rtSteps', 'rtExact', 'rtDifferent', 'rtCode', 'rtNotWritten', 'rtNotReadBack', 'bhCases', 'bhSame', 'bhDifferent', 'bhNotRun']) report.totals[k] += repo[k];
  report.repos.push(repo);
  // Samples for a person to grade: functions and rules, spread across files.
  const per = Number(flag('--per-language', 0));
  if (per) {
    const testRanges = rustTestModules(files);
    const members = model.members.filter((m) => m.kind !== 'setup' && m.flow.nodes.length > 2 && (!only || m.language === only) && !TESTFILE.test(m.file) && !(testRanges.get(m.file) || []).some(([a, b]) => m.lines[0] >= a && m.lines[0] <= b));
    let step = Math.max(1, Math.floor(members.length / per));
    const seed = flag('--seed');
    if (seed != null) {
      // Seeded shuffle (mulberry32, mixed with the repo's name): the same seed picks the same members.
      let h = Number(seed) >>> 0; for (const ch of repo.repo) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
      const rnd = () => { h = (h + 0x6D2B79F5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      for (let i = members.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [members[i], members[j]] = [members[j], members[i]]; }
      step = 1;
    }
    for (let i = 0; i < members.length && samples.filter((x) => x.repo === repo.repo).length < per; i += step) {
      const m = members[i];
      const src = files.find((f) => f.path === m.file)?.source.split('\n').slice(m.lines[0] - 1, m.lines[1]).join('\n') ?? '';
      if (src.length > 2500) continue;
      samples.push({ repo: repo.repo, file: m.file, lines: m.lines, language: m.language, code: src, thunder: modelText(model, m.id) });
    }
  }
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : 'n/a');
if (flag('--json-out')) writeFileSync(flag('--json-out'), JSON.stringify(report, null, 2));
if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log('Repo | rules | round trips same | steps explained | names kept (short words) | names kept (Details) | steps round-trip exact | steps with an invented value | classes drawn | routes drawn | methods misplaced | inputs shown | endings shown');
  for (const r of report.repos) {
    const b = r.bigPicture;
    const rt = r.rtSteps ? `${pct(r.rtExact, r.rtSteps)} (${r.rtExact}/${r.rtSteps})` : 'n/a';
    console.log(`${r.repo} | ${r.rules} | ${pct(r.same, r.trips)} (${r.same}/${r.trips}) | ${pct(r.steps - r.asCode, r.steps)} | ${pct(r.kept, r.names)} | ${pct(r.keptDetails, r.names)} | ${rt} | ${r.invented} of ${r.steps - r.asCode} | ${pct(b.drawn, b.declared)} (${b.drawn}/${b.declared}) | ${b.routesDrawn}/${b.routesFound} | ${b.misplaced} of ${b.members} | ${pct(r.io.inputsShown, r.io.inputsInCode)} (${r.io.inputsShown}/${r.io.inputsInCode}) | ${pct(r.io.outputsShown, r.io.membersWithOutputs)}`);
  }
  const t = report.totals;
  console.log(`\nAll: round trips same ${pct(t.same, t.trips)} (${t.same}/${t.trips}; different ${t.different}, not read back ${t.notReadBack}, cannot run ${t.cannotRun}, not written ${t.notWritten}); steps explained ${pct(t.steps - t.asCode, t.steps)}; names kept ${pct(t.kept, t.names)} in the short words, ${pct(t.keptDetails, t.names)} in Details; steps with an invented value ${t.invented}; words that disagree with the meaning tree ${t.disagree}; questions whose words or side disagree with the code's polarity ${t.polarity} of ${t.questions}`);
  console.log(`Steps round trip (${ROUND_TRIP_LANGUAGES.join(', ')}): exact ${pct(t.rtExact, t.rtSteps)} (${t.rtExact}/${t.rtSteps}); different ${t.rtDifferent}; kept as code ${t.rtCode}; not written ${t.rtNotWritten}; not read back ${t.rtNotReadBack}. Run before and after: ${t.bhSame} same, ${t.bhDifferent} different, ${t.bhNotRun} not run (of ${t.bhCases}).`);
  for (const r of report.repos) if (r.rtSteps) console.log(`  ${r.repo}: ${Object.entries(r.rtByLanguage).map(([l, x]) => `${l} ${pct(x.exact, x.steps)} (${x.exact}/${x.steps})`).join(', ')}; exact of steps read into a tree ${pct(r.rtExact, r.rtSteps - r.rtCode)}; run ${r.bhSame}/${r.bhCases} same, ${r.bhDifferent} different`);
}
const out = flag('--samples');
if (out) {
  writeFileSync(out, samples.map((s, i) => `## ${i + 1}. ${s.repo}/${s.file} lines ${s.lines.join('–')} (${s.language})\n\n\`\`\`${s.language}\n${s.code}\n\`\`\`\n\n\`\`\`thunder\n${s.thunder}\n\`\`\`\n`).join('\n'));
  console.error(`wrote ${samples.length} samples to ${out}`);
}
if (args.includes('--io')) for (const r of report.repos) { console.log(`\n${r.repo}: missing inputs`); r.io.missingInputs.slice(0, 8).forEach((x) => console.log('  ' + x)); console.log(`${r.repo}: no endings shown`); r.io.membersShowingNone.slice(0, 6).forEach((x) => console.log('  ' + x)); }
if (args.includes('--failures')) { console.log(JSON.stringify(report.failures.slice(0, 40), null, 1)); console.log(JSON.stringify(report.inventedExamples.slice(0, 30), null, 1)); console.log(JSON.stringify(report.polarityExamples.slice(0, 30), null, 1)); }
if (args.includes('--steps')) { console.log(JSON.stringify({ stepTripFailures: report.stepTripFailures, behaviorFailures: report.behaviorFailures, disagree: report.disagreeExamples }, null, 1)); }
