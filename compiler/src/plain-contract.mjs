// Experimental plain-English notation (`.thunder-plain`). A deliberately small,
// strict subset that reads like a policy. It lowers to ordinary ThunderLang, so
// the existing parser, runtime, tests and code generators do all the real work.
// Nothing is guessed: a line that does not match the grammar is an error with
// its line number and an example of what to write instead.
import { parseIntent } from './parse.mjs';
import { compileExpr } from './expr.mjs';
import { runTests } from './testing.mjs';
import { evaluateDecision } from './runtime.mjs';
import { parseMoney, formatMoney, MoneyError } from './money.mjs';

export const PLAIN_SCHEMA = 'thunder-plain-v1';

/** Comparison phrases. The first spelling is the canonical one used when rendering. */
export const COMPARISONS = [
  { op: '>=', words: ['at least'] },
  { op: '<=', words: ['at most'] },
  { op: '<', words: ['under', 'less than', 'below'] },
  { op: '>', words: ['over', 'more than', 'above'] },
  { op: '==', words: ['exactly'] },
];
const opWord = op => COMPARISONS.find(c => c.op === op)?.words[0] ?? op;

const fail = (line, text) => { throw new Error(`Line ${line}: ${text}`); };
const OUTCOME = /^[A-Z][A-Za-z]*$/;
const NAME_TEXT = /^[A-Za-z0-9 $.,'_-]+$/;
const lowerFirst = s => s.charAt(0).toLowerCase() + s.slice(1);
const pascal = s => s.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean)
  .map(w => w[0].toUpperCase() + w.slice(1)).join('');
const camel = s => lowerFirst(pascal(s));
const RESERVED = new Set(['and', 'or', 'not', 'in', 'true', 'false', 'case', 'expect']);

/** Format a number for a reader: dollar inputs get a $ sign, negatives read -$1. */
export function formatValue(input, value) {
  if (input.kind === 'yesno') return value ? input.yes : input.no;
  if (input.kind === 'text') return value === '' ? 'empty' : JSON.stringify(String(value));
  if (input.kind === 'dollars') return `${value < 0 ? '-' : ''}$${dollarText(Math.abs(value))}`;
  return String(value);
}

// Dollars read exactly from cents: $12.30 (not $12.3), whole dollars stay $100.
function dollarText(value) {
  try {
    const minor = parseMoney(value);
    return minor % 100n === 0n ? String(minor / 100n) : formatMoney(minor);
  } catch { return String(value); }
}

function parseNumber(text, input, line) {
  const t = text.trim().replace(/,/g, '');
  const dollars = t.match(/^(-?)\$(-?)(\d+(?:\.\d+)?)$/);
  if (input.kind === 'dollars') {
    if (!dollars) fail(line, `${input.label} is in dollars. Write an amount such as $100.`);
    // Thunder Money: the amount is read as exact cents from its text (never through a float), and an
    // amount finer than a cent is an error instead of being rounded. The decision engine then
    // compares the amount at cent precision, where every comparison is exact.
    let minor;
    try { minor = parseMoney(t, { allowDollar: true }); }
    catch (e) { if (e instanceof MoneyError) fail(line, `${input.label} is in dollars and cents. ${t} is finer than a cent; write at most two decimal places, such as $12.30.`); throw e; }
    if (minor > BigInt(Number.MAX_SAFE_INTEGER) || -minor > BigInt(Number.MAX_SAFE_INTEGER)) fail(line, `${t} is too large to compare exactly.`);
    return Number(formatMoney(minor));
  }
  if (dollars) fail(line, `${input.label} is a plain number, not dollars. Write it without $.`);
  if (!/^-?\d+(?:\.\d+)?$/.test(t)) fail(line, `Write a number for ${input.label}, such as 18.`);
  return Number(t);
}

function parseInputLine(text, line) {
  let m;
  if ((m = text.match(/^whether it is (.+?) or (.+?)\.?$/))) {
    const [yes, no] = [m[1].trim(), m[2].trim()];
    if (yes === no) fail(line, 'Use two different words, such as "whether it is on time or late".');
    return { id: camel(yes), kind: 'yesno', label: `it is ${yes}`, yes, no };
  }
  if ((m = text.match(/^(the .+?), (in dollars|a number)\.?$/))) {
    const label = m[1].trim();
    return { id: camel(label.replace(/^the /, '')), kind: m[2] === 'in dollars' ? 'dollars' : 'number', label };
  }
  fail(line, 'Describe each input as "the amount, in dollars", "the age, a number", or "whether it is on time or late".');
}

function parseCondition(text, inputs, line) {
  const t = text.replace(/^[-•]\s*/, '').replace(/\.$/, '').trim();
  let m;
  if ((m = t.match(/^it is (.+)$/))) {
    const word = m[1].trim();
    const input = inputs.find(i => i.kind === 'yesno' && (i.yes === word || i.no === word));
    if (input) return { input: input.id, op: 'is', value: input.yes === word };
  }
  for (const input of inputs.filter(i => i.kind !== 'yesno')) {
    if (!t.startsWith(`${input.label} is `)) continue;
    const rest = t.slice(input.label.length + 4);
    for (const c of COMPARISONS) for (const w of c.words) {
      if (rest.startsWith(`${w} `)) return { input: input.id, op: c.op, value: parseNumber(rest.slice(w.length + 1), input, line) };
    }
    fail(line, `Compare ${input.label} with at least, at most, under, over, or exactly. For example: "${input.label} is at most ${formatValue(input, 100)}".`);
  }
  const known = inputs.map(i => (i.kind === 'yesno' ? `"it is ${i.yes}"` : `"${i.label} is …"`)).join(', ');
  fail(line, `This condition does not name an input. Start with one of: ${known}.`);
}

/** Parse plain text into the structured model the visual card edits. */
export function parsePlainContract(source) {
  if (typeof source !== 'string' || source.length > 100000) throw new Error('A plain contract must be text of at most 100 KB.');
  const rows = source.split(/\r?\n/).map((raw, i) => ({ text: raw.trim(), depth: raw.match(/^\s*/)[0].replace(/\t/g, '  ').length, line: i + 1 }))
    .filter(r => r.text && !r.text.startsWith('#'));
  if (!rows.length) throw new Error('Start with a title, such as "Refund approval".');
  const model = { schema: PLAIN_SCHEMA, title: '', why: '', question: '', inputs: [], rules: [], otherwise: '', examples: [] };
  let section = null, rule = null;
  for (const row of rows) {
    const { text, depth, line } = row;
    if (depth === 0) {
      rule = null;
      if (!model.title) { model.title = text.replace(/\.$/, ''); if (!pascal(model.title)) fail(line, 'Give the contract a title with letters, such as "Refund approval".'); continue; }
      if (/^why:/i.test(text)) { model.why = text.replace(/^why:\s*/i, ''); section = null; continue; }
      if (text === 'We need') { section = 'inputs'; continue; }
      if (text === 'Examples') { section = 'examples'; continue; }
      if (text.endsWith('?')) {
        if (model.question) fail(line, 'This notation holds one decision per contract. Put another decision in its own file.');
        if (!model.inputs.length) fail(line, 'List the inputs under "We need" before the decision.');
        model.question = text; section = 'decision'; continue;
      }
      fail(line, 'Expected "Why: …", "We need", a decision question ending in ?, or "Examples".');
    }
    if (section === 'inputs') {
      const input = parseInputLine(text, line);
      if (RESERVED.has(input.id) || !input.id) fail(line, 'Choose a different name for this input.');
      if (model.inputs.some(i => i.id === input.id)) fail(line, `${input.label} is listed twice.`);
      const words = model.inputs.flatMap(i => (i.kind === 'yesno' ? [i.yes, i.no] : []));
      if (input.kind === 'yesno' && (words.includes(input.yes) || words.includes(input.no))) fail(line, 'Each yes/no word must be unique across inputs.');
      model.inputs.push(input);
    } else if (section === 'decision') {
      let m;
      if (rule && depth > rule.depth) { rule.conditions.push(parseCondition(text, model.inputs, line)); continue; }
      if ((m = text.match(/^Otherwise,?\s+([A-Za-z]+)\.?$/))) {
        if (model.otherwise) fail(line, 'Use one "Otherwise" result.');
        if (!OUTCOME.test(m[1])) fail(line, 'Name the outcome with one capitalized word, such as Review.');
        model.otherwise = m[1]; rule = null; continue;
      }
      if (model.otherwise) fail(line, 'Put every rule before "Otherwise".');
      if ((m = text.match(/^([A-Za-z]+) when (all|any) of these (?:are|is) true:?$/))) {
        if (!OUTCOME.test(m[1])) fail(line, 'Name the outcome with one capitalized word, such as Approve.');
        rule = { outcome: m[1], join: m[2], conditions: [], depth, line };
        model.rules.push(rule); continue;
      }
      if ((m = text.match(/^([A-Za-z]+) when (.+)$/))) {
        if (!OUTCOME.test(m[1])) fail(line, 'Name the outcome with one capitalized word, such as Approve.');
        model.rules.push({ outcome: m[1], join: 'all', conditions: [parseCondition(m[2], model.inputs, line)], depth, line });
        rule = null; continue;
      }
      fail(line, 'Write a rule as "Approve when all of these are true:" with conditions indented below, then "Otherwise, Review."');
    } else if (section === 'examples') {
      const m = text.match(/^(.+?)\s+gives\s+([A-Za-z]+)\s*(?:\((.+)\))?\.?$/);
      if (!m) fail(line, `Write an example as "${model.inputs.map(i => formatValue(i, i.kind === 'yesno' ? true : 100)).join(', ')} gives Approve (a short name)".`);
      const parts = m[1].split(/,\s+/);
      if (parts.length !== model.inputs.length) fail(line, `Give ${model.inputs.length} values in this order: ${model.inputs.map(i => (i.kind === 'yesno' ? `${i.yes} or ${i.no}` : i.label)).join(', ')}. A missing value is not the same as no.`);
      const values = {};
      model.inputs.forEach((input, i) => {
        const part = parts[i].trim();
        if (input.kind === 'yesno') {
          if (part !== input.yes && part !== input.no) fail(line, `Write "${input.yes}" or "${input.no}" for value ${i + 1}.`);
          values[input.id] = part === input.yes;
        } else values[input.id] = parseNumber(part, input, line);
      });
      const name = (m[3] ?? `example ${model.examples.length + 1}`).trim();
      if (!NAME_TEXT.test(name)) fail(line, 'Use letters, numbers, spaces, $ and simple punctuation in the example name.');
      if (model.examples.some(e => e.name === name)) fail(line, `Two examples are named "${name}". Give each a different name.`);
      model.examples.push({ name, values, expected: m[2], line });
    } else fail(line, 'This indented line does not belong to "We need", a decision, or "Examples".');
  }
  if (!model.question) throw new Error('Add a decision question ending in ?, such as "When do we approve a refund?"');
  for (const r of model.rules) if (!r.conditions.length) fail(r.line, 'List at least one condition under this rule, indented.');
  if (!model.rules.length) throw new Error('Add at least one rule, such as "Approve when all of these are true:".');
  if (!model.otherwise) throw new Error('Finish the decision with "Otherwise, <Outcome>." so every request gets an answer.');
  if (!model.examples.length) throw new Error('Add at least one example under "Examples".');
  const outcomes = outcomesOf(model);
  for (const e of model.examples) if (!outcomes.includes(e.expected)) fail(e.line, `Unknown outcome ${e.expected}. Use one of: ${outcomes.join(', ')}.`);
  // Positions are parse metadata; keep the model a pure description.
  model.rules = model.rules.map(({ outcome, join, conditions }) => ({ outcome, join, conditions }));
  model.examples = model.examples.map(({ name, values, expected }) => ({ name, values, expected }));
  return model;
}

export function outcomesOf(model) {
  return [...new Set([...model.rules.map(r => r.outcome), model.otherwise])];
}

/** Read one condition as English, e.g. "the amount is at most $100". */
export function conditionText(model, c) {
  const input = model.inputs.find(i => i.id === c.input);
  if (!input) return '(unknown input)';
  if (input.kind === 'yesno') return `it is ${c.value ? input.yes : input.no}`;
  if (input.kind === 'text') return `${input.label} is ${c.op === '!=' ? 'not ' : ''}${formatValue(input, c.value)}`;
  return `${input.label} is ${opWord(c.op)} ${formatValue(input, c.value)}`;
}

/** Render the model as plain text. parsePlainContract(renderPlainContract(m)) round-trips. */
export function renderPlainContract(model) {
  const out = [model.title];
  if (model.why) out.push(`Why: ${model.why}`);
  out.push('', 'We need');
  for (const i of model.inputs) out.push(`  ${i.kind === 'yesno' ? `whether it is ${i.yes} or ${i.no}` : `${i.label}, ${i.kind === 'dollars' ? 'in dollars' : 'a number'}`}`);
  out.push('', model.question);
  for (const r of model.rules) {
    if (r.conditions.length === 1) out.push(`  ${r.outcome} when ${conditionText(model, r.conditions[0])}.`);
    else {
      out.push(`  ${r.outcome} when ${r.join} of these ${r.join === 'all' ? 'are' : 'is'} true:`);
      for (const c of r.conditions) out.push(`    ${conditionText(model, c)}`);
    }
  }
  out.push(`  Otherwise, ${model.otherwise}.`, '', 'Examples');
  const cells = model.examples.map(e => [model.inputs.map(i => formatValue(i, e.values[i.id])).join(', '), `gives ${e.expected}`, `(${e.name})`]);
  const w0 = Math.max(...cells.map(c => c[0].length)), w1 = Math.max(...cells.map(c => c[1].length));
  for (const c of cells) out.push(`  ${c[0].padEnd(w0)}   ${c[1].padEnd(w1)}   ${c[2]}`);
  return out.join('\n') + '\n';
}

function conditionExpr(model, c) {
  const input = model.inputs.find(i => i.id === c.input);
  if (input.kind === 'yesno') return `${input.id} == ${c.value}`;
  if (input.kind === 'text') return `${input.id} ${c.op === '!=' ? '!=' : '=='} ${JSON.stringify(String(c.value))}`;
  return `${input.id} ${c.op} ${c.value}`;
}

/** Lower the model to ordinary ThunderLang source. */
export function plainToThunder(model) {
  const name = pascal(model.title);
  const lit = v => (typeof v === 'boolean' ? String(v) : String(v));
  const out = [`# Compiled from plain ThunderLang (${PLAIN_SCHEMA}). Edit the plain file, not this one.`,
    `mission ${name}`, '', `title ${JSON.stringify(model.title)}`, '', 'goal', `  ${model.why || model.title}`,
    '', `# ${model.question}`, `decision ${name}`, '  inputs', ...model.inputs.map(i => `    ${i.id}${i.kind === 'yesno' ? ': boolean' : i.kind === 'number' || i.kind === 'dollars' ? ': number' : i.kind === 'text' ? ': string' : ''}`)];
  const used = new Map();
  for (const r of model.rules) {
    const base = lowerFirst(r.outcome); const n = (used.get(base) ?? 0) + 1; used.set(base, n);
    out.push(`  rule ${n === 1 ? base : `${base}_${n}`}`, `    when ${r.conditions.map(c => conditionExpr(model, c)).join(r.join === 'all' ? ' and ' : ' or ')}`, `    return ${r.outcome}`);
  }
  out.push('  default', `    return ${model.otherwise}`, '', `test ${name}`);
  for (const e of model.examples) {
    out.push(`  case ${e.name}`, `    given ${model.inputs.map(i => `${i.id} ${lit(e.values[i.id])}`).join(', ')}`, `    expect ${e.expected}`);
  }
  return out.join('\n') + '\n';
}

export function compilePlainContract(source) {
  return plainToThunder(parsePlainContract(source));
}

/**
 * Decide one request with the real runtime and explain it in the reader's words.
 * The outcome comes from evaluateDecision on the compiled contract; the per-condition
 * check marks come from the same expression engine, condition by condition.
 */
export function explainPlain(model, values, ast = parseIntent(plainToThunder(model))) {
  const run = evaluateDecision(ast.decisions[0], values);
  const rules = model.rules.map(r => ({
    outcome: r.outcome, join: r.join,
    checks: r.conditions.map(c => ({ text: conditionText(model, c), ok: !!compileExpr(conditionExpr(model, c))(values), actual: formatValue(model.inputs.find(i => i.id === c.input), values[c.input]), input: c.input })),
  }));
  const index = run.matched === 'default' ? -1 : (ast.decisions[0].rules.findIndex(r => r.name === run.matched));
  return { outcome: run.result, ruleIndex: index, rules, ok: run.ok };
}

/** Everything the reading surface needs: model, compiled source, and executed examples. */
export function previewPlainContract(sourceOrModel) {
  const model = typeof sourceOrModel === 'string' ? parsePlainContract(sourceOrModel) : sourceOrModel;
  const canonicalSource = plainToThunder(model);
  const ast = parseIntent(canonicalSource);
  const results = runTests(ast).results.map((r, i) => ({
    name: model.examples[i].name, values: model.examples[i].values, expected: r.expected, actual: r.actual, pass: !!r.pass && !r.error,
  }));
  return {
    schema: PLAIN_SCHEMA, experimental: true, model, canonicalSource, plainSource: renderPlainContract(model),
    tests: { total: results.length, passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, results },
    application: 'not_checked',
  };
}

const spaced = s => s.replace(/([a-z0-9])([A-Z])/g, (_m, a, b) => `${a} ${b.toLowerCase()}`).replace(/_/g, ' ').toLowerCase();

/**
 * "Thunder" a decision the code reader lifted from any supported language into the visual
 * model. Only simple shapes are accepted (comparisons with numbers, yes/no flags, joined by
 * all-and or all-or); anything else returns null so the caller shows the reader's own sentence
 * instead of an invented picture. Names come from the code, so the result needs human review:
 * the code cannot say that a number is money or what a flag means in business words.
 */
export function plainFromReading(item) {
  if (!item || item.kind !== 'decision' || !item.rules?.length || !item.otherwise) return null;
  // Untyped languages (JavaScript, Ruby, untyped Python): infer a type only from how the rule uses the input,
  // and say so in needsReview. Compared with a number -> number; used alone as a condition -> yes/no.
  const inferred = [];
  const whens = (item.rules ?? []).map(r => r.when ?? '').join(' and ');
  const typed = (item.inputs ?? []).map(i => {
    if (i.type) return i;
    const esc = i.name.replace(/[$]/g, '\\$');
    if (new RegExp(`\\b${esc}\\s*(>=|<=|<|>|==)\\s*-?\\d`).test(whens)) { inferred.push(i.name); return { ...i, type: 'number' }; }
    if (new RegExp(`(^|\\s|not\\s+|!)${esc}(\\s|$)`).test(whens)) { inferred.push(i.name); return { ...i, type: 'boolean' }; }
    return i;
  });
  const inputs = typed.map(i => (i.type === 'boolean'
    ? { id: i.name, kind: 'yesno', label: `it is ${spaced(i.name)}`, yes: spaced(i.name), no: `not ${spaced(i.name)}` }
    : i.type === 'number' ? { id: i.name, kind: 'number', label: `the ${spaced(i.name)}` }
    : { id: i.name, kind: 'other', label: `the ${spaced(i.name)}` }));
  const model = { schema: PLAIN_SCHEMA, title: spaced(item.name).replace(/^./, c => c.toUpperCase()), why: '',
    question: `How is ${spaced(item.name)} decided?`, inputs, rules: [], otherwise: '', examples: [],
    provenance: 'inferred-from-code', needsReview: [] };
  const outcome = t => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t) || /^-?\d+(\.\d+)?$/.test(t) ? t : null);
  const stateFacts = [];
  const input = id => inputs.find(i => i.id === id);
  // A bare name or path the function reads that is not a parameter (a field, a method with no
  // arguments): shown as a yes/no fact and flagged, because it comes from the code's state.
  const factFor = path => {
    const id = path.replace(/[^A-Za-z0-9_]/g, '_');
    let f = input(id);
    if (!f) {
      const word = spaced(path.split('.').pop());
      f = { id, kind: 'yesno', label: `it is ${word}`, yes: word, no: `not ${word}`, fromState: true };
      if (inputs.some(i => i.kind === 'yesno' && (i.yes === f.yes || i.no === f.yes))) return null;
      inputs.push(f); stateFacts.push(path);
    }
    return f;
  };
  for (const r of item.rules) {
    const when = r.when.trim();
    const join = / or /.test(when) ? 'any' : 'all';
    if (/ or /.test(when) && / and /.test(when)) return null;
    const conditions = [];
    for (const part of when.split(join === 'all' ? ' and ' : ' or ')) {
      const t = part.trim(); let m;
      const input = id => inputs.find(i => i.id === id);
      if ((m = t.match(/^(not\s+|!)?([A-Za-z_]\w*)$/)) && input(m[2])?.kind === 'yesno') conditions.push({ input: m[2], op: 'is', value: !m[1] });
      else if ((m = t.match(/^([A-Za-z_]\w*)\s*(>=|<=|<|>|==)\s*(-?\d+(?:\.\d+)?)$/)) && input(m[1])?.kind === 'number') conditions.push({ input: m[1], op: m[2], value: Number(m[3]) });
      else if ((m = t.match(/^([A-Za-z_][\w.]*)\s*(==|!=)\s*"([^"]*)"$/))) {
        let f = input(m[1]);
        if (!f) { const id = m[1].replace(/[^A-Za-z0-9_]/g, '_'); f = { id, kind: 'text', label: `the ${spaced(m[1].split('.').pop())}` }; if (m[1].includes('.')) stateFacts.push(m[1]); inputs.push(f); }
        if (f.kind === 'yesno' || f.kind === 'number') return null;
        f.kind = 'text'; conditions.push({ input: f.id, op: m[2], value: m[3] });
      }
      else if ((m = t.match(/^(not\s+|!)?([A-Za-z_][\w.]*)$/)) && !input(m[2])) { const f = factFor(m[2]); if (!f) return null; conditions.push({ input: f.id, op: 'is', value: !m[1] }); }
      else return null;
    }
    if (!outcome(r.result)) return null;
    model.rules.push({ outcome: r.result, join, conditions });
  }
  if (!outcome(item.otherwise.result)) return null;
  model.otherwise = item.otherwise.result;
  for (const i of inputs) {
    model.needsReview.push(i.kind === 'yesno' ? `What does "${i.yes}" mean in business words?` : `Is ${i.label} money, a count, or something else?`);
  }
  for (const path of stateFacts) model.needsReview.push(`${spaced(path.split('.').pop())} comes from the code's own state, not from an input.`);
  if (item.status === 'partial') { model.partial = true; model.needsReview.unshift(`Thunder could not read ${item.unread?.length || 'some'} line(s) of this function, so the picture may be incomplete.`); }
  for (const name of inferred) model.needsReview.push(`The code does not declare a type for ${spaced(name)}; Thunder inferred it from how the rule uses it.`);
  model.needsReview.push('Why does this rule exist? Code shows what happens, not why.', 'No examples yet: add cases before relying on it.');
  return model;
}
