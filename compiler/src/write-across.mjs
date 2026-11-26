// Thunder write across languages: one change to a business rule, written into every service that implements it.
//
// The same rule is often written more than once: the web page says "free shipping from $50", the orders service
// charges by it, and billing checks it again. Change one and forget another, and the services disagree. This finds
// every implementation of a rule across the parts of an application (in any language Thunder reads), changes its
// number, comparison, or text value once, and writes that change into each implementation with Thunder write
// (write.mjs): only those characters change, and each file is read again to check that the rule now reads as
// intended and nothing else in the file reads differently. All or nothing: if any implementation cannot be written
// exactly, no file changes.
//
// Which rules count as the same: decisions whose rule has the same condition, comparing names as words
// (orderTotal, OrderTotal, and order_total are the same name), numbers by value, and comparisons and text exactly.
// A rule with the same shape where only the names or only the values differ is listed as "not included, check by
// hand", never changed. Test files are never edited; those that mention the rule's old values are listed.
//
// Deterministic and browser-safe: it takes file contents and returns new contents. It never runs anything.
import { readCode, sayCondition } from './read.mjs';
import { tokenize } from './expr.mjs';
import { writeRule } from './write.mjs';
import { isTestFile } from './trace.mjs';

export const WRITE_ACROSS_SCHEMA = 'thunder-write-across-v1';

const words = (name) => String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/[_\-.\s]+/g, ' ').trim().toLowerCase();
const editable = (t) => t.t === 'num' || t.t === 'str' || (t.t === 'op' && ['<', '<=', '>', '>=', '==', '!='].includes(t.v));
const keyOf = (t) => (t.t === 'id' ? `id:${words(t.v)}` : t.t === 'str' ? `str:${JSON.stringify(t.v)}` : `${t.t}:${t.v}`);
const shapeOf = (t) => (t.t === 'id' ? 'id' : editable(t) ? (t.t === 'op' ? 'cmp' : t.t) : `${t.t}:${t.v}`);
const join = (toks) => toks.map((t) => (t.t === 'str' ? JSON.stringify(t.v) : String(t.v))).join(' ');
const toks = (when) => { try { return tokenize(when); } catch { return null; } };

/** Every decision rule in the parts' source files (test files left out), read once. */
function rulesIn(files) {
  const out = [];
  for (const f of files) {
    if (isTestFile(f.path)) continue;
    let reading;
    try { reading = readCode(f.source, { file: f.path }); } catch { continue; }
    for (const d of reading.items.filter((i) => i.kind === 'decision')) {
      d.rules.forEach((r, i) => {
        const t = toks(r.when);
        if (t) out.push({ part: f.part, file: f.path, language: reading.language, decision: d.name, decisionLine: d.line, rule: i + 1, line: r.line, when: r.when, result: r.result, toks: t });
      });
    }
  }
  return out;
}

const where = (x) => `${x.part ? `${x.part}/` : ''}${x.file ?? x.path}`;

/**
 * Find a rule and every other implementation of it.
 *   files:    [{ part, path, source }]
 *   decision: the decision's name (as `thunder read` shows it), or "part/file:name" when the name is used twice
 *   rule:     its 1-based rule number
 * Returns { ok, anchor, same: [...], notIncluded: [...], problems }.
 */
export function findSameRule(files, { decision, rule }) {
  const all = rulesIn(files);
  const m = String(decision ?? '').match(/^(.+):([^:]+)$/);
  const name = m ? m[2] : decision;
  let anchors = all.filter((x) => x.decision === name && x.rule === Number(rule));
  if (m) anchors = anchors.filter((x) => where(x) === m[1] || x.file === m[1]);
  if (!anchors.length) {
    const has = all.some((x) => x.decision === name);
    return { ok: false, problems: [has ? `${name} has no rule ${rule}. Find the rule number with: thunder read <folder>` : `No decision named ${name} was found in these parts. Thunder write changes decisions: functions that choose between fixed answers.`] };
  }
  if (anchors.length > 1) return { ok: false, problems: [`${anchors.length} decisions are called ${name}: ${anchors.map(where).join(', ')}. Name one as "part/file:${name}".`] };
  const anchor = anchors[0];
  const key = anchor.toks.map(keyOf).join(' ');
  const shape = anchor.toks.map(shapeOf).join(' ');
  const names = anchor.toks.filter((t) => t.t === 'id').map(keyOf).join(' ');
  const values = anchor.toks.filter((t) => t.t !== 'id').map(keyOf).join(' ');
  const same = [], notIncluded = [];
  for (const x of all) {
    if (x === anchor) continue;
    const k = x.toks.map(keyOf).join(' ');
    const said = sayCondition(x.when);
    if (k === key) { same.push({ ...x, why: `the same condition: ${said} (names compared as words)` }); continue; }
    if (x.toks.map(shapeOf).join(' ') !== shape) continue;
    const xNames = x.toks.filter((t) => t.t === 'id').map(keyOf).join(' ');
    const xValues = x.toks.filter((t) => t.t !== 'id').map(keyOf).join(' ');
    if (xNames === names) notIncluded.push({ ...x, why: `the same names but a different limit (${said}); it may be another rule, or one that has already drifted` });
    else if (xValues === values) notIncluded.push({ ...x, why: `the same limit but different names (${said}); Thunder cannot tell that these are the same values` });
  }
  const strip = ({ toks: _t, ...rest }) => rest;
  return { ok: true, anchor: strip(anchor), same: [anchor, ...same].map(strip), notIncluded: notIncluded.map(strip), problems: [] };
}

/**
 * Lines in test files that mention one of the rule's old values, in test files that call one of the rule's
 * functions (by name, in any language's spelling). A test may pin the old rule; Thunder never edits tests.
 */
function testsMentioning(files, oldToks, newToks, functions) {
  const changed = oldToks.filter((t, i) => editable(t) && t.t !== 'op' && keyOf(t) !== keyOf(newToks[i]));
  if (!changed.length) return [];
  const callsRule = (src) => (src.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).some((w) => functions.has(words(w)));
  const out = [];
  for (const f of files.filter((x) => isTestFile(x.path) && callsRule(x.source))) {
    f.source.split('\n').forEach((line, i) => {
      const hit = changed.some((t) => (t.t === 'num' ? new RegExp(`(^|[^0-9.])${String(t.v).replace('.', '\\.')}(?![0-9])`).test(line) : line.includes(t.v)));
      if (hit) out.push({ part: f.part, file: f.path, line: i + 1, text: line.trim().slice(0, 160) });
    });
  }
  return out;
}

/**
 * Change one rule everywhere it is implemented.
 *   when: the rule's new condition in Thunder form, written with the names of the rule you chose
 *         ("subtotal >= 75"). Only numbers, comparisons, and text values may change.
 * Returns { schema, ok, rule: { before, after }, plan, notIncluded, tests, files, problems }. `files` maps
 * "part/path" to the new contents of each changed file; it is empty unless ok is true.
 */
export function writeRuleAcross(files, { decision, rule, when }) {
  const base = { schema: WRITE_ACROSS_SCHEMA, ok: false, plan: [], notIncluded: [], tests: [], files: {}, problems: [] };
  if (when == null) return { ...base, problems: ['Say the new condition with --when, for example "subtotal >= 75".'] };
  const found = findSameRule(files, { decision, rule });
  if (!found.ok) return { ...base, problems: found.problems };
  const oldT = toks(found.anchor.when), newT = toks(when);
  if (!newT) return { ...base, problems: [`The new condition "${when}" could not be read.`] };
  if (oldT.length !== newT.length || oldT.some((t, i) => (editable(t) ? !(editable(newT[i]) && shapeOf(t) === shapeOf(newT[i])) : keyOf(t) !== keyOf(newT[i])))) {
    return { ...base, problems: [`Thunder write can change a number, a comparison, or a text value in a rule. "${when}" also changes the rule's shape (names, and/or, or parentheses), so it is not one change Thunder can write into every implementation.`] };
  }
  const result = { ...base, plan: [], files: {}, rule: { before: sayCondition(found.anchor.when), after: sayCondition(join(newT)) }, notIncluded: found.notIncluded, tests: testsMentioning(files, oldT, newT, new Set(found.same.map((x) => words(x.decision)))) };

  // Each implementation, with its own spelling of the names and the new values in the same places.
  const byFile = new Map();
  for (const x of found.same) { const k = where(x); if (!byFile.has(k)) byFile.set(k, []); byFile.get(k).push(x); }
  const problems = [];
  for (const [k, list] of byFile) {
    const f = files.find((y) => where(y) === k);
    let source = f.source;
    for (const x of list.sort((a, b) => b.line - a.line)) {
      const own = toks(x.when);
      const next = join(own.map((t, i) => (editable(t) ? newT[i] : t)));
      const r = writeRule({ source, language: x.language, file: x.file, decision: x.decision, line: x.decisionLine, rule: x.rule, when: next });
      if (!r.ok) { problems.push(`${k}, ${x.decision} rule ${x.rule} (line ${x.line}): ${r.problems.join(' ')}`); continue; }
      source = r.source;
      result.plan.push({ part: x.part, file: x.file, language: x.language, decision: x.decision, rule: x.rule, line: x.line, why: x.why ?? 'the rule you chose', before: r.before, after: r.after, change: r.change });
    }
    result.files[k] = source;
  }
  result.plan.sort((a, b) => where(a).localeCompare(where(b)) || a.line - b.line);
  if (problems.length) return { ...base, files: {}, plan: [], rule: result.rule, notIncluded: result.notIncluded, tests: result.tests, problems: ['Nothing was changed: every implementation must be written exactly, or none is.', ...problems] };
  return { ...result, ok: true };
}

/** Passport evidence for a written change: one item per implementation, read again after the change. */
export function writeAcrossEvidence(result) {
  if (!result?.ok) return [];
  const items = result.plan.map((p) => ({
    kind: 'rule-write', status: 'read',
    claim: `${where(p)}: ${p.decision}, rule ${p.rule} now reads "${p.after}" (was "${p.before}").`,
    basis: { schema: result.schema, line: p.line, change: p.change, check: 'read again after the change: this rule reads as intended, and every other rule and function in the file reads exactly as before' },
    scope: 'How the code reads, not whether it runs. Code that computes the same thing in a different shape is not found or changed.',
    inputs: [{ part: p.part, file: p.file }],
  }));
  if (result.notIncluded.length) {
    items.push({
      kind: 'rule-write', status: 'read',
      claim: `${result.notIncluded.length} similar rule${result.notIncluded.length === 1 ? ' was' : 's were'} not changed and need${result.notIncluded.length === 1 ? 's' : ''} a person to check: ${result.notIncluded.map((n) => `${where(n)}:${n.line}`).join(', ')}.`,
      basis: { schema: result.schema, notIncluded: result.notIncluded.map((n) => ({ at: `${where(n)}:${n.line}`, says: sayCondition(n.when), why: n.why })) },
      scope: 'Listed, not changed: Thunder could not tell they are the same rule.',
      inputs: result.notIncluded.map((n) => ({ part: n.part, file: n.file })),
    });
  }
  return items;
}
