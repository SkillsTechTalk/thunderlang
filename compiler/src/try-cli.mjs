// thunder try: try a rule with your own situations and see the answer and why ("What if?").
//   thunder try <file> [--focus "<rule>"] [--with "days late=10, member=yes"] [--json]
// Only rules: a rule decides and changes nothing, so trying one is safe. The answer comes from the same engine as
// the web editor (plainFromReading + explainPlain): the rule as the reader understood it from the code, run on the
// values you give. Rules too complex for it are refused with the reason, never approximated.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createInterface } from 'node:readline';
import { readCode } from './read.mjs';
import { plainFromReading, explainPlain } from './plain-contract.mjs';
import { parseIntent } from './parse.mjs';
import { evaluateDecision } from './runtime.mjs';

const USAGE = `usage: thunder try <file> [--focus "<rule>"] [--with "name=value, name=value"] [--json]
Try a rule from your code with your own values, and see the answer and why. Without --with, Thunder asks.
Only rules can be tried: they decide and change nothing.`;

const squash = (s) => String(s ?? '').toLowerCase().replace(/^(the|it is|is)\s+/, '').replace(/[^a-z0-9]/g, '');
const human = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
const outcomeText = (o) => { const h = human(o); return h.charAt(0).toUpperCase() + h.slice(1); };
const inputName = (i) => String(i.label).replace(/^(the|it is)\s+/, '');
const kindText = { number: 'a number', yesno: 'yes or no', text: 'some text', any: 'a value' };

/** A typed value from what a person wrote, or { error } saying what to write instead. */
export function parseValue(input, raw) {
  const t = String(raw ?? '').trim();
  if (input.kind === 'number') {
    const n = Number(t.replace(/[$,%\s]/g, ''));
    return t !== '' && Number.isFinite(n) ? { value: n } : { error: `"${t}" isn't a number. Write one like 10 or 2.5.` };
  }
  if (input.kind === 'yesno') {
    if (/^(y|yes|true|1)$/i.test(t)) return { value: true };
    if (/^(n|no|false|0)$/i.test(t)) return { value: false };
    return { error: `"${t}" isn't yes or no. Write yes or no.` };
  }
  if (input.kind === 'any') {
    if (/^-?[$]?[\d,]*\.?\d+%?$/.test(t)) return { value: Number(t.replace(/[$,%]/g, '')) };
    if (/^(yes|true)$/i.test(t)) return { value: true };
    if (/^(no|false)$/i.test(t)) return { value: false };
  }
  return { value: t };
}

// ── Rules in a mission file (ThunderLang™ decisions) ───────────────────────────────────────────────────────────

/** The decisions in a mission file, or null when the file is not one. */
export function missionRules(source) {
  let ast;
  try { ast = parseIntent(source); } catch { return null; }
  if (!ast?.decisions?.length) return null;
  return ast.decisions.map((dec) => ({
    name: outcomeText(dec.name), dec,
    plain: { inputs: (dec.inputs || []).map((x) => {
      const id = String(x?.name ?? x).split(/[\s:]/)[0];
      // The kind, from how the rules use it: compared with a number, or used as a yes/no on its own.
      const whens = (dec.rules || []).map((r) => r.when || '').join(' ; ');
      const num = new RegExp(`\\b${id}\\s*(>=|<=|>|<|==|!=)\\s*-?\\d|-?\\d\\s*(>=|<=|>|<|==|!=)\\s*${id}\\b`).test(whens);
      const yesno = !num && new RegExp(`(^|[!(&|;]\\s*)${id}\\s*($|[)&|;])|\\b${id}\\s*==\\s*(true|false)\\b`).test(whens);
      return { id, label: human(id), kind: num ? 'number' : yesno ? 'yesno' : 'any' };
    }) },
  }));
}

/** A mission condition in words: "age >= 18" -> "age is at least 18". */
export function conditionWords(expr) {
  return String(expr)
    .replace(/\s*>=\s*/g, ' is at least ').replace(/\s*<=\s*/g, ' is at most ')
    .replace(/\s*!=\s*/g, ' is not ').replace(/\s*==\s*/g, ' is ')
    .replace(/\s*>\s*/g, ' is more than ').replace(/\s*<\s*/g, ' is less than ')
    .replace(/\s*&&\s*/g, ' and ').replace(/\s*\|\|\s*/g, ' or ').replace(/!\s*(?=\w)/g, 'not ')
    .replace(/\b([a-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+|[a-z]+[A-Z][A-Za-z0-9]*)\b/g, (w) => human(w))
    .replace(/\s+/g, ' ').trim();
}

/** Try a mission decision: the same answer and reasons shape as tryRule. */
export function tryMission(rule, values) {
  const run = evaluateDecision(rule.dec, values);
  const ids = rule.plain.inputs.map((i) => i.id);
  const seen = (when) => ids.filter((id) => new RegExp(`\\b${id}\\b`).test(when)).map((id) => `${human(id)} is ${typeof values[id] === 'boolean' ? (values[id] ? 'yes' : 'no') : values[id]}`).join(', ');
  const why = [];
  for (const t of run.trace) {
    if (!t.when) continue;
    const result = rule.dec.rules.find((r) => r.name === t.rule)?.result;
    if (t.error) { why.push({ ok: false, text: conditionWords(t.when), actual: `could not be worked out: ${t.error}`, yesno: true }); continue; }
    if (t.matched && t.rule === run.matched) { why.push({ ok: true, text: conditionWords(t.when), actual: seen(t.when), yesno: true }); why.push({ answer: true, text: `so: ${outcomeText(result)}` }); break; }
    why.push({ ok: false, text: conditionWords(t.when), actual: seen(t.when), yesno: true, skipped: outcomeText(result) });
  }
  if (run.matched === 'default') why.push({ answer: true, text: `none of the rules matched, so: ${outcomeText(run.result)} (otherwise)` });
  if (run.undecided) why.push({ answer: true, text: 'no rule matched and there is no "otherwise" answer, so the rule gives no answer' });
  return { answer: run.undecided ? 'No answer' : outcomeText(run.result), outcome: run.result, ruleIndex: run.matched === 'default' ? -1 : rule.dec.rules.findIndex((r) => r.name === run.matched), why, values };
}

/** Parse --with "a=1, b=yes" into { inputId: value }, or { error }. */
export function parseWith(plain, specs) {
  const values = {};
  for (const part of specs.flatMap((s) => s.split(/,(?![^"]*"\s*$)/)).map((x) => x.trim()).filter(Boolean)) {
    const eq = part.indexOf('=');
    if (eq < 0) return { error: `"${part}" needs a value: write it as name=value, like "${inputName(plain.inputs[0])}=10".` };
    const name = part.slice(0, eq), raw = part.slice(eq + 1);
    const input = plain.inputs.find((i) => squash(i.label) === squash(name) || squash(i.id) === squash(name));
    if (!input) return { error: `This rule has no "${name.trim()}". It takes: ${plain.inputs.map(inputName).join(', ')}.` };
    const v = parseValue(input, raw.replace(/^"|"$/g, ''));
    if (v.error) return { error: `${inputName(input)}: ${v.error}` };
    values[input.id] = v.value;
  }
  const missing = plain.inputs.filter((i) => !(i.id in values));
  if (missing.length) return { error: `Give a value for ${missing.map(inputName).join(' and ')}, like --with "${missing.map((i) => `${inputName(i)}=${i.kind === 'yesno' ? 'yes' : i.kind === 'number' ? '10' : 'text'}`).join(', ')}".` };
  return { values };
}

/** The answer and why, from the engine's explanation. */
export function tryRule(plain, values) {
  const ex = explainPlain(plain, values);
  const kindOf = (id) => plain.inputs.find((i) => i.id === id)?.kind;
  const shown = (c) => (kindOf(c.input) === 'yesno' ? (values[c.input] ? 'yes' : 'no') : c.actual);
  const why = [];
  ex.rules.forEach((r, i) => {
    if (i === ex.ruleIndex) {
      for (const c of r.checks) why.push({ ok: true, text: c.text, actual: shown(c), yesno: kindOf(c.input) === 'yesno' });
      why.push({ answer: true, text: `so: ${outcomeText(r.outcome)}` });
    } else if (ex.ruleIndex === -1 || i < ex.ruleIndex) {
      const miss = r.checks.find((c) => !c.ok);
      if (miss) why.push({ ok: false, text: miss.text, actual: shown(miss), yesno: kindOf(miss.input) === 'yesno', skipped: outcomeText(r.outcome) });
    }
  });
  if (ex.ruleIndex === -1) why.push({ answer: true, text: `none of the rules matched, so: ${outcomeText(ex.outcome)} (otherwise)` });
  return { answer: outcomeText(ex.outcome), outcome: ex.outcome, ruleIndex: ex.ruleIndex, why, values };
}

export function renderTry(t) {
  const L = [`Answer: ${t.answer}`, 'Why:'];
  for (const w of t.why) {
    if (w.answer) L.push(`  → ${w.text}`);
    else L.push(`  ${w.ok ? '✓' : '✗'} ${w.text}${w.actual != null && w.actual !== '' ? `  (${w.yesno ? w.actual : `it is ${w.actual}`})` : ''}${w.skipped ? `, so not ${w.skipped}` : ''}`);
  }
  return L.join('\n');
}

/** The rules in a file that Try can run, and the ones it cannot (with why). */
export function rulesIn(source, file) {
  const all = readCode(source, { file: basename(file) }).items;
  const items = all.filter((i) => i.kind === 'decision');
  const rules = items.map((item) => {
    const plain = plainFromReading(item);
    return { name: outcomeText(item.name), item, plain, line: item.line ?? item.lines?.[0] ?? null, why: plain ? null : 'it is more than simple comparisons and yes/no checks, so Thunder cannot try it yet' };
  });
  rules.others = all.filter((i) => i.kind === 'function').map((i) => ({ name: outcomeText(i.name), raw: i.name }));
  return rules;
}

export async function tryMain(argv, { input = process.stdin, output = process.stdout } = {}) {
  const a = { _: [], focus: null, with: [], json: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--focus') a.focus = argv[++i];
    else if (x === '--with') a.with.push(argv[++i] ?? '');
    else if (x === '--json') a.json = true;
    else if (x === '--help' || x === '-h') { console.log(USAGE); return 0; }
    else if (x.startsWith('--')) { console.error(`thunder try: there is no option ${x}.\n${USAGE}`); return 2; }
    else a._.push(x);
  }
  if (a._.length !== 1) { console.error(`thunder try: name one code file.\n${USAGE}`); return 2; }
  const file = a._[0];
  let source;
  try { source = readFileSync(file, 'utf8'); } catch (e) { console.error(`thunder try: couldn't open ${file}${e.code === 'ENOENT' ? ': there is no such file' : `: ${e.message}`}.`); return 2; }
  const mission = /\.(thunder|intent)$/i.test(file) ? missionRules(source) : null;
  const rules = mission ?? rulesIn(source, file);
  if (!rules.length) { console.error(`thunder try: Thunder found no rules in ${file}. A rule decides between answers, like "if days late <= 7: return SmallFee". See what it does find: thunder read ${file}`); return 2; }

  let rule;
  if (a.focus) {
    rule = rules.find((r) => squash(r.name) === squash(a.focus) || squash(r.item.name) === squash(a.focus));
    if (!rule) {
      const other = (rules.others || []).find((o) => squash(o.name) === squash(a.focus) || squash(o.raw) === squash(a.focus));
      if (other) { console.error(`thunder try: "${other.name}" is not a rule: it does things (it may change data or call other code), so Thunder won't run it to try it. Try works on rules: ${rules.map((r) => `"${r.name}"`).join(', ')}. See what "${other.name}" does: thunder read ${file} --level flow --focus "${other.name}"`); return 2; }
      console.error(`thunder try: there is no rule "${a.focus}" in ${file}. The rules: ${rules.map((r) => `"${r.name}"`).join(', ')}.`);
      return 2;
    }
  } else if (rules.length === 1) rule = rules[0];
  else {
    console.error(`thunder try: ${file} has ${rules.length} rules. Pick one:\n${rules.map((r) => `  thunder try ${file} --focus "${r.name}"`).join('\n')}`);
    return 2;
  }
  const run = (values) => (mission ? tryMission(rule, values) : tryRule(rule.plain, values));
  if (!rule.plain) { console.error(`thunder try: "${rule.name}" can't be tried: ${rule.why}. Read it instead: thunder read ${file} --level flow --focus "${rule.name}"`); return 2; }
  const plain = rule.plain;
  const note = plain.needsReview?.some((n) => /inferred/.test(n)) ? 'Note: the code does not say what kind some values are; Thunder worked it out from how the rule uses them.' : null;

  if (a.with.length) {
    const w = parseWith(plain, a.with);
    if (w.error) { console.error(`thunder try: ${w.error}`); return 2; }
    const t = run(w.values);
    console.log(a.json ? JSON.stringify({ rule: rule.name, file, ...t }, null, 2) : renderTry(t));
    return 0;
  }

  // Ask, one value at a time; read answers from the terminal (or from piped lines).
  const rl = createInterface({ input, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (q) => { output.write(q); const r = await lines.next(); if (r.done) return null; if (!input.isTTY) output.write(`${r.value}\n`); return r.value; };
  const say = (s = '') => output.write(`${s}\n`);
  say(`⚡ Let's try "${rule.name}" from ${basename(file)}.`);
  say(`It takes: ${plain.inputs.map((i) => `${inputName(i)} (${kindText[i.kind] ?? i.kind})`).join(', ')}`);
  if (note) say(note);
  for (;;) {
    say('');
    const values = {};
    for (const i of plain.inputs) {
      for (;;) {
        const raw = await ask(`${inputName(i).charAt(0).toUpperCase()}${inputName(i).slice(1)}? > `);
        if (raw == null) { rl.close(); say(''); return 0; }
        const v = parseValue(i, raw);
        if (v.error) { say(v.error); continue; }
        values[i.id] = v.value;
        break;
      }
    }
    say('');
    say(renderTry(run(values)));
    say('');
    const again = await ask('Try another? (y/n) > ');
    if (again == null || !/^y/i.test(again.trim())) { rl.close(); return 0; }
  }
}
