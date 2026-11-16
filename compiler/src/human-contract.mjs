// Experimental authoring shorthand and a deterministic reading view. Both lower
// to the existing parser/runtime. This is not a second execution language.
import { parseIntent } from './parse.mjs';
import { compileExpr, tokenize } from './expr.mjs';
import { runTests } from './testing.mjs';

const ID = '[A-Za-z_][A-Za-z0-9_]*';
const id = new RegExp(`^${ID}$`);
const literal = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?|true|false|"[A-Za-z0-9 _-]*")$/;
const fail = (line, text) => { throw new Error(`Line ${line}: ${text}`); };

/** Compile the small, explicit human-v1 subset into ordinary .thunder source. */
export function compileHumanContract(source) {
  if (typeof source !== 'string' || source.length > 200000) throw new Error('A human contract must be text of at most 200 KB.');
  const rows = source.split(/\r?\n/).map((text, i) => ({ text: text.trim(), indented: /^\s/.test(text), line: i + 1 }))
    .filter(r => r.text && !r.text.startsWith('#'));
  let mission = null, purpose = null, active = null;
  const decisions = [], tables = new Map();
  for (const row of rows) {
    const { text, line } = row;
    if (!row.indented) {
      active = null;
      let match;
      if ((match = text.match(new RegExp(`^contract (${ID})$`)))) {
        if (mission || decisions.length) fail(line, 'Declare one contract before its decisions.');
        mission = match[1];
      } else if (text.startsWith('purpose ')) {
        if (!mission || purpose) fail(line, 'Declare one purpose after the contract name.');
        purpose = text.slice(8).trim();
      } else if ((match = text.match(new RegExp(`^decision (${ID})\\(([^)]*)\\)$`)))) {
        const inputs = match[2].split(',').map(x => x.trim());
        if (!mission || !purpose) fail(line, 'Start with contract and purpose before a decision.');
        if (!inputs.length || inputs.some(x => !id.test(x) || ['case', 'expect', 'true', 'false', 'and', 'or', 'not', 'in'].includes(x)) || new Set(inputs).size !== inputs.length) fail(line, 'Use unique input names, such as decision RefundPolicy(amount, withinWindow).');
        if (decisions.some(d => d.name === match[1])) fail(line, 'Decision names must be unique.');
        active = { kind: 'decision', name: match[1], inputs, rules: [], otherwise: null, line };
        decisions.push(active);
      } else if ((match = text.match(new RegExp(`^examples (${ID})$`)))) {
        if (tables.has(match[1]) || !decisions.some(d => d.name === match[1])) fail(line, 'Examples must name one preceding decision exactly, with one table per decision.');
        active = { kind: 'examples', name: match[1], rows: [], line };
        tables.set(match[1], active);
      } else fail(line, 'Expected contract, purpose, decision Name(inputs), or examples Name. This preview does not guess unknown syntax.');
    } else if (active?.kind === 'decision') {
      let match;
      if ((match = text.match(new RegExp(`^when (.+) -> (${ID})$`)))) {
        if (active.otherwise) fail(line, 'Put conditional rules before otherwise.');
        try {
          compileExpr(match[1]);
          for (const token of tokenize(match[1])) {
            if (token.t === 'id' && !active.inputs.includes(token.v)) fail(line, `Unknown input ${token.v}. Declare it, or quote it if it is a text value.`);
            if (token.t === 'num' && !Number.isFinite(token.v)) fail(line, 'Use a finite number in the condition.');
          }
        } catch (e) { fail(line, e.message); }
        active.rules.push({ condition: match[1], result: match[2], line });
      } else if ((match = text.match(new RegExp(`^otherwise -> (${ID})$`)))) {
        if (active.otherwise) fail(line, 'Use one otherwise result.');
        active.otherwise = match[1];
      } else fail(line, 'Use when <condition> -> Outcome or otherwise -> Outcome.');
    } else if (active?.kind === 'examples') {
      if (!text.startsWith('|') || !text.endsWith('|')) fail(line, 'Write an examples table row with | around every cell.');
      active.rows.push({ cells: text.slice(1, -1).split('|').map(s => s.trim()), line });
    } else fail(line, 'This indented line has no decision or examples block.');
  }
  if (!mission || !purpose || !decisions.length) throw new Error('Include a contract, purpose, and at least one decision with examples.');
  const out = [`mission ${mission}`, '', 'goal', `  ${purpose}`];
  for (const d of decisions) {
    if (!d.rules.length || !d.otherwise) fail(d.line, 'Each decision needs at least one when rule and an otherwise result.');
    out.push('', `decision ${d.name}`, '  inputs', ...d.inputs.map(i => `    ${i}`));
    d.rules.forEach((r, i) => out.push(`  rule condition_${i + 1}`, `    when ${r.condition}`, `    return ${r.result}`));
    out.push('  default', `    return ${d.otherwise}`);
    const table = tables.get(d.name);
    if (!table || table.rows.length < 2) fail(d.line, `Add examples ${d.name} with a header and at least one case.`);
    const header = table.rows[0].cells;
    const expectedHeader = ['case', ...d.inputs, 'expect'];
    if (JSON.stringify(header) !== JSON.stringify(expectedHeader)) fail(table.rows[0].line, `Use this header: | ${expectedHeader.join(' | ')} |`);
    const names = new Set();
    out.push('', `test ${d.name}`);
    for (const row of table.rows.slice(1)) {
      if (row.cells.every(c => /^:?-+:?$/.test(c))) continue; // optional Markdown separator
      const [name, ...values] = row.cells;
      if (row.cells.length !== header.length || !name || names.has(name)) fail(row.line, 'Use a unique case name and fill every column.');
      names.add(name);
      const expected = values.pop();
      if (!id.test(expected)) fail(row.line, 'The expected outcome must be a named result, such as Approve or Review.');
      const outcomes = [...d.rules.map(r => r.result), d.otherwise];
      if (!outcomes.includes(expected)) fail(row.line, `Unknown outcome ${expected}. Use one of: ${[...new Set(outcomes)].join(', ')}.`);
      values.forEach(v => { if (!literal.test(v) || (!v.startsWith('"') && !['true', 'false'].includes(v) && !Number.isFinite(Number(v)))) fail(row.line, 'Inputs must be finite numbers, true/false, or quoted simple text. Complex values need ordinary ThunderLang.'); });
      out.push(`  case ${name}`, `    given ${d.inputs.map((input, i) => `${input} ${values[i]}`).join(', ')}`, `    expect ${expected}`);
    }
    if (!names.size) fail(table.line, 'The table has no examples; add a row with inputs and an expected outcome.');
  }
  return out.join('\n') + '\n';
}

const words = s => s.replace(/([a-z0-9])([A-Z])/g, (_m, a, b) => `${a} ${b.toLowerCase()}`).replace(/_/g, ' ');
const operators = { '>=': 'is at least', '<=': 'is at most', '>': 'is greater than', '<': 'is less than', '==': 'equals', '=': 'equals', '!=': 'does not equal', '&&': 'and', '||': 'or', '!': 'not' };
function readCondition(expression) {
  try { return tokenize(expression).map(t => t.t === 'str' ? JSON.stringify(t.v) : t.t === 'id' ? words(t.v) : operators[t.v] ?? String(t.v)).join(' '); }
  catch { return expression; } // keep unsupported text visible, never fabricate a translation
}

// Older lifted drafts have a free-text `unknown` block; their AST only retains
// named unknowns. Preserve the source's words in this view instead of dropping
// them or rendering an empty internal record to a reader.
function readUnknowns(ast, source) {
  const notes = (ast.unknowns ?? []).filter(u => u.name).map(u => u.name);
  let block = false;
  for (const line of source.split(/\r?\n/)) {
    if (/^unknown\s*$/.test(line)) { block = true; continue; }
    if (/^\S/.test(line)) block = false;
    if (block && /^\s+\S/.test(line)) notes.push(line.trim());
  }
  return notes;
}

/** Read authored decisions. Existing files retain all content in canonicalSource;
 * this view deliberately makes no claim to summarize other language constructs. */
export function previewHumanContract(source) {
  const first = source.split(/\r?\n/).find(l => l.trim() && !l.trim().startsWith('#'))?.trim() ?? '';
  const compact = first.startsWith('contract ');
  const canonicalSource = compact ? compileHumanContract(source) : source;
  const ast = parseIntent(canonicalSource);
  const tests = runTests(ast);
  const declared = (ast.tests ?? []).flatMap(t => t.cases);
  const results = tests.results.map((r, i) => ({ ...r, pass: !!r.pass && !r.error && !r.note && declared[i]?.expect != null }));
  const passed = results.filter(r => r.pass).length;
  const report = {
    schema: 'thunder-human-preview-v1', experimental: true, origin: ast.lift?.inferred ? 'inferred-code' : compact ? 'human-v1' : 'thunderlang',
    mission: ast.mission, purpose: ast.goal, canonicalSource,
    signatureInputs: ast.inputs ?? [], sourceReferences: ast.lift?.maps_to ?? [],
    needsReview: ast.lift?.needs_review ?? [], unknowns: readUnknowns(ast, canonicalSource),
    decisions: (ast.decisions ?? []).map(d => ({ name: d.name, inputs: d.inputs, order: 'first matching rule wins',
      rules: d.rules.map(r => ({ condition: r.when, readAs: readCondition(r.when ?? ''), outcome: r.result })), otherwise: d.default })),
    tests: { total: results.length, passed, failed: results.length - passed, results },
    application: 'not_checked',
    limitations: ['This reading view covers authored decisions and examples. Other constructs remain in the full source.',
      'Purpose is author-stated intent, not inferred from code or established by tests.',
      'Passing examples check those contract inputs only. Use OpenThunder intent test-app to exercise the application.'],
  };
  return report;
}

export function renderHumanContract(report) {
  const inferred = report.origin === 'inferred-code';
  const out = [`${report.mission || 'Untitled contract'} (experimental reading view)`, '',
    inferred ? 'Recovered from code: inferred draft, needs human review. Business purpose is not established.' : `Purpose: ${report.purpose || 'Not stated'}`];
  if (inferred) {
    out.push(`Candidate description: ${report.purpose || 'Not inferred'}`);
    for (const ref of report.sourceReferences) out.push(`Source: ${ref}`);
    if (report.signatureInputs.length) out.push(`Signature inputs: ${report.signatureInputs.map(i => `${i.name}${i.type ? ` (${i.type})` : ''}`).join(', ')}`);
    if (!report.decisions.length) out.push('Behavior rules: not recovered. Inspect the original code before approving a contract.');
    for (const note of report.needsReview) out.push(`Needs review: ${note}`);
    for (const note of report.unknowns) out.push(`Unknown: ${note}`);
  }
  for (const d of report.decisions) {
    out.push('', `Decision: ${words(d.name)}`, `Inputs: ${d.inputs.map(words).join(', ')}`, 'Read rules in order; the first match wins.');
    d.rules.forEach((r, i) => out.push(`${i + 1}. If ${r.readAs}, choose ${r.outcome}.`));
    out.push(`Otherwise choose ${d.otherwise ?? '(not stated)'}.`);
  }
  out.push('', `Contract examples: ${report.tests.passed}/${report.tests.total} passed. Application: not checked.`);
  for (const r of report.tests.results) out.push(`  ${r.pass ? 'Passed' : 'Failed'}: ${r.case}; expected ${r.expected ?? '(missing)'}, got ${r.actual ?? '(unavailable)'}.`);
  out.push('', ...report.limitations);
  return out.join('\n');
}
