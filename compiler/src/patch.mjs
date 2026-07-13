// Structural source editing (intent-patch-v1) , apply field-level edits to EXISTING IntentLang
// source, touching only the target lines so comments, formatting, ids, and untouched blocks stay
// byte-identical. This is the comment-preserving half of the Human <-> Structured sync: a PM
// changes a field and IL patches the source in place rather than regenerating it from the graph
// (which would drop `#` comments). Pure ESM, zero Node deps , browser-safe for Studio.
//
//   applyEdits(source, edits) -> { schema, source, applied, skipped }
//   edits: [{ op, ... }]
//     { op: 'setField', field: 'goal'|'why'|'problem', value }
//     { op: 'addGuarantee', statement, because?, verify? }
//     { op: 'removeGuarantee', match }        // substring match on the statement
//     { op: 'addNever', statement }
//     { op: 'removeNever', match }
//     { op: 'addField', section: 'input'|'output', name, type }
//     { op: 'removeField', section: 'input'|'output', name }
//     { op: 'setFieldType', section: 'input'|'output', name, type }
//     { op: 'addMetric', name, baseline?, target?, window? }
//     { op: 'removeMetric', name }
//     { op: 'setMetricField', name, field: 'baseline'|'target'|'window', value }
//     { op: 'addOutcome', name, description? }   { op: 'removeOutcome', name }
//     { op: 'addRule', decision, name, when?, return? }   { op: 'removeRule', decision, name }
//     { op: 'setRule', decision, name, when?, return? }   { op: 'setDefault', decision, return }
// Unsupported / not-found edits are returned in `skipped` with a reason , never applied blindly.

import { formatSource } from './format.mjs';

export const PATCH_SCHEMA = 'intent-patch-v1';

const isTopLevel = (line) => line.length > 0 && line[0] !== ' ' && line[0] !== '\t' && line.trim() !== '' && !line.trim().startsWith('#');
const firstWord = (line) => line.trim().split(/\s+/)[0];
const restOf = (line) => line.trim().slice(firstWord(line).length).trim();

// Top-level blocks with raw line ranges [start, end] (0-based, inclusive of body + trailing
// blank/comment lines up to the next top-level block).
function blocks(lines) {
  const out = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    if (isTopLevel(lines[i])) {
      if (cur) { cur.end = i - 1; out.push(cur); }
      cur = { keyword: firstWord(lines[i]), header: lines[i].trim(), start: i, end: i };
    }
  }
  if (cur) { cur.end = lines.length - 1; out.push(cur); }
  return out;
}

// Trim trailing blank lines off a block's range so inserts land tightly (keeps them as spacing).
function bodyEnd(lines, block) {
  let e = block.end;
  while (e > block.start && lines[e].trim() === '') e -= 1;
  return e;
}

function setField(lines, field, value) {
  const bs = blocks(lines);
  const block = bs.find((b) => b.keyword === field);
  const newBody = [`${field}`, `  ${value}`];
  if (!block) {
    // Insert after the mission header (and its title/for/persona lines if present), else at top.
    const mission = bs.find((b) => b.keyword === 'mission');
    const at = mission ? bodyEnd(lines, mission) + 1 : 0;
    return { ok: true, lines: [...lines.slice(0, at), '', ...newBody, ...lines.slice(at)] };
  }
  const e = bodyEnd(lines, block);
  return { ok: true, lines: [...lines.slice(0, block.start), ...newBody, ...lines.slice(e + 1)] };
}

// Insert a block after an anchor block (or at end), separated by one blank line.
function insertAfterAnchor(lines, body, anchorKeywords) {
  const bs = blocks(lines);
  let anchor = null;
  for (const kw of anchorKeywords) { const found = bs.filter((b) => b.keyword === kw).slice(-1)[0]; if (found) { anchor = found; break; } }
  const at = anchor ? bodyEnd(lines, anchor) + 1 : lines.length;
  return { ok: true, lines: [...lines.slice(0, at), '', ...body, ...lines.slice(at)] };
}

function addGuarantee(lines, { statement, because, verify }) {
  const body = [`guarantee ${statement}`];
  if (because) body.push(`  because ${because}`);
  if (verify) body.push(`  verify ${verify}`);
  return insertAfterAnchor(lines, body, ['guarantee', 'why', 'goal', 'mission']);
}

function addNever(lines, statement) {
  return insertAfterAnchor(lines, [`never ${statement}`], ['never', 'guarantee', 'goal', 'mission']);
}

// Remove a `guarantee <match>` / `never <match>` single block, or a matching line inside a
// plural `guarantees` / `never` block.
function removeRule(lines, keyword, pluralKeyword, match) {
  const bs = blocks(lines);
  const needle = String(match).toLowerCase();
  // 1) single form: `guarantee <statement ...>`
  const single = bs.find((b) => b.keyword === keyword && restOf(b.header).toLowerCase().includes(needle));
  if (single) {
    let s = single.start; let e = single.end;
    // don't swallow a trailing blank that separates from the next block; trim trailing blanks
    while (e > s && lines[e].trim() === '') e -= 1;
    // also drop one leading blank line if present (keeps spacing tidy)
    const out = [...lines.slice(0, s), ...lines.slice(e + 1)];
    if (s > 0 && out[s - 1] !== undefined && out[s - 1].trim() === '' && (out[s] === undefined || out[s].trim() === '')) out.splice(s - 1, 1);
    return { ok: true, lines: out };
  }
  // 2) plural block: `guarantees` with indented statement lines
  const plural = bs.find((b) => b.keyword === pluralKeyword);
  if (plural) {
    for (let i = plural.start + 1; i <= plural.end; i++) {
      if (lines[i].trim() && !lines[i].trim().startsWith('#') && lines[i].toLowerCase().includes(needle)) {
        return { ok: true, lines: [...lines.slice(0, i), ...lines.slice(i + 1)] };
      }
    }
  }
  return { ok: false, reason: `no ${keyword} matching "${match}" found` };
}

const indentOf = (line) => line.length - line.trimStart().length;
const fieldMatches = (line, name) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`).test(line.trim());

// Add a typed field to an `input`/`output` block (creating the block if absent).
function addField(lines, section, name, type) {
  const block = blocks(lines).find((b) => b.keyword === section);
  const fieldLine = `  ${name}: ${type}`;
  if (!block) return insertAfterAnchor(lines, [section, fieldLine], ['output', 'input', 'why', 'goal', 'mission']);
  for (let i = block.start + 1; i <= block.end; i++) {
    if (lines[i].trim() && !lines[i].trim().startsWith('#') && fieldMatches(lines[i], name)) return { ok: false, reason: `field "${name}" already exists in ${section}` };
  }
  const e = bodyEnd(lines, block);
  return { ok: true, lines: [...lines.slice(0, e + 1), fieldLine, ...lines.slice(e + 1)] };
}

// Locate a field line + any deeper-indented child lines (modifiers/notes) that belong to it.
function fieldRange(lines, block, name) {
  for (let i = block.start + 1; i <= block.end; i++) {
    if (!lines[i].trim() || lines[i].trim().startsWith('#')) continue;
    if (fieldMatches(lines[i], name)) {
      const ind = indentOf(lines[i]);
      let j = i + 1;
      while (j <= block.end && lines[j].trim() !== '' && indentOf(lines[j]) > ind) j += 1;
      return { start: i, end: j - 1 };
    }
  }
  return null;
}

function removeField(lines, section, name) {
  const block = blocks(lines).find((b) => b.keyword === section);
  if (!block) return { ok: false, reason: `no ${section} block` };
  const range = fieldRange(lines, block, name);
  if (!range) return { ok: false, reason: `field "${name}" not found in ${section}` };
  return { ok: true, lines: [...lines.slice(0, range.start), ...lines.slice(range.end + 1)] };
}

function setFieldType(lines, section, name, type) {
  const block = blocks(lines).find((b) => b.keyword === section);
  if (!block) return { ok: false, reason: `no ${section} block` };
  const range = fieldRange(lines, block, name);
  if (!range) return { ok: false, reason: `field "${name}" not found in ${section}` };
  const ind = lines[range.start].slice(0, indentOf(lines[range.start]));
  const rebuilt = `${ind}${name}: ${type}`;
  return { ok: true, lines: [...lines.slice(0, range.start), rebuilt, ...lines.slice(range.start + 1)] };
}

const findNamedBlock = (lines, keyword, name) => blocks(lines).find((b) => b.keyword === keyword && restOf(b.header) === name) || null;

function removeNamedBlock(lines, keyword, name) {
  const b = findNamedBlock(lines, keyword, name);
  if (!b) return { ok: false, reason: `no ${keyword} "${name}" found` };
  let s = b.start; let e = b.end;
  while (e > s && lines[e].trim() === '') e -= 1;
  const out = [...lines.slice(0, s), ...lines.slice(e + 1)];
  if (s > 0 && out[s - 1] !== undefined && out[s - 1].trim() === '' && (out[s] === undefined || out[s].trim() === '')) out.splice(s - 1, 1);
  return { ok: true, lines: out };
}

function addMetric(lines, { name, baseline, target, window: win }) {
  if (findNamedBlock(lines, 'metric', name)) return { ok: false, reason: `metric "${name}" already exists` };
  const body = [`metric ${name}`];
  if (baseline) body.push(`  baseline ${baseline}`);
  if (target) body.push(`  target ${target}`);
  if (win) body.push(`  window ${win}`);
  return insertAfterAnchor(lines, body, ['metric', 'outcome', 'why', 'goal', 'mission']);
}

// Set baseline/target/window inside a `metric <name>` block (insert the line if absent).
function setMetricField(lines, name, field, value) {
  const b = findNamedBlock(lines, 'metric', name);
  if (!b) return { ok: false, reason: `no metric "${name}" found` };
  for (let i = b.start + 1; i <= b.end; i++) {
    if (lines[i].trim() && firstWord(lines[i]) === field) {
      const ind = lines[i].slice(0, indentOf(lines[i]));
      return { ok: true, lines: [...lines.slice(0, i), `${ind}${field} ${value}`, ...lines.slice(i + 1)] };
    }
  }
  return { ok: true, lines: [...lines.slice(0, b.start + 1), `  ${field} ${value}`, ...lines.slice(b.start + 1)] };
}

function addOutcome(lines, { name, description }) {
  if (findNamedBlock(lines, 'outcome', name)) return { ok: false, reason: `outcome "${name}" already exists` };
  const body = [`outcome ${name}`];
  if (description) body.push(`  "${description}"`);
  return insertAfterAnchor(lines, body, ['outcome', 'why', 'goal', 'mission']);
}

// The indent of a block's direct children (or a default when the block is empty).
function childIndentOf(lines, block, fallback = 2) {
  for (let i = block.start + 1; i <= block.end; i++) {
    if (lines[i].trim() && !lines[i].trim().startsWith('#')) return indentOf(lines[i]);
  }
  return fallback;
}

// A sub-block inside a parent block: its header line (at the parent's child indent) matches
// `matchHeader`, and it owns every following deeper-indented line. Returns { start, end, indent }.
function childSubBlock(lines, block, matchHeader) {
  const indent = childIndentOf(lines, block);
  for (let i = block.start + 1; i <= block.end; i++) {
    if (lines[i].trim() && !lines[i].trim().startsWith('#') && indentOf(lines[i]) === indent && matchHeader(lines[i].trim())) {
      let j = i + 1;
      while (j <= block.end && (lines[j].trim() === '' || indentOf(lines[j]) > indent)) j += 1;
      let e = j - 1;
      while (e > i && lines[e].trim() === '') e -= 1;
      return { start: i, end: e, indent };
    }
  }
  return null;
}

const isRule = (name) => (h) => firstWord(h) === 'rule' && restOf(h) === name;

function addRule(lines, decision, name, when, ret) {
  const d = findNamedBlock(lines, 'decision', decision);
  if (!d) return { ok: false, reason: `no decision "${decision}" found` };
  if (childSubBlock(lines, d, isRule(name))) return { ok: false, reason: `rule "${name}" already exists in ${decision}` };
  const ci = childIndentOf(lines, d);
  const body = [`${' '.repeat(ci)}rule ${name}`];
  if (when) body.push(`${' '.repeat(ci + 2)}when ${when}`);
  if (ret) body.push(`${' '.repeat(ci + 2)}return ${ret}`);
  const def = childSubBlock(lines, d, (h) => firstWord(h) === 'default'); // keep default last
  const at = def ? def.start : bodyEnd(lines, d) + 1;
  return { ok: true, lines: [...lines.slice(0, at), ...body, ...lines.slice(at)] };
}

function removeDecisionRule(lines, decision, name) {
  const d = findNamedBlock(lines, 'decision', decision);
  if (!d) return { ok: false, reason: `no decision "${decision}" found` };
  const sub = childSubBlock(lines, d, isRule(name));
  if (!sub) return { ok: false, reason: `no rule "${name}" in ${decision}` };
  return { ok: true, lines: [...lines.slice(0, sub.start), ...lines.slice(sub.end + 1)] };
}

// Set a `keyword <value>` line inside a rule (or default) sub-block, inserting if absent.
function setSubLine(lines, decision, matchHeader, keyword, value, missingMsg) {
  const d = findNamedBlock(lines, 'decision', decision);
  if (!d) return { ok: false, reason: `no decision "${decision}" found` };
  const sub = childSubBlock(lines, d, matchHeader);
  if (!sub) return { ok: false, reason: missingMsg };
  for (let i = sub.start + 1; i <= sub.end; i++) {
    if (lines[i].trim() && firstWord(lines[i]) === keyword) {
      const ind = lines[i].slice(0, indentOf(lines[i]));
      return { ok: true, lines: [...lines.slice(0, i), `${ind}${keyword} ${value}`, ...lines.slice(i + 1)] };
    }
  }
  return { ok: true, lines: [...lines.slice(0, sub.start + 1), `${' '.repeat(sub.indent + 2)}${keyword} ${value}`, ...lines.slice(sub.start + 1)] };
}

function setDefault(lines, decision, ret) {
  const d = findNamedBlock(lines, 'decision', decision);
  if (!d) return { ok: false, reason: `no decision "${decision}" found` };
  const def = childSubBlock(lines, d, (h) => firstWord(h) === 'default');
  if (def) return setSubLine(lines, decision, (h) => firstWord(h) === 'default', 'return', ret, 'no default');
  const ci = childIndentOf(lines, d);
  const at = bodyEnd(lines, d) + 1;
  return { ok: true, lines: [...lines.slice(0, at), `${' '.repeat(ci)}default`, `${' '.repeat(ci + 2)}return ${ret}`, ...lines.slice(at)] };
}

function applyOne(lines, edit) {
  switch (edit && edit.op) {
    case 'setField':
      if (!['goal', 'why', 'problem'].includes(edit.field)) return { ok: false, reason: `setField only supports goal/why/problem, not "${edit.field}"` };
      if (typeof edit.value !== 'string' || !edit.value.trim()) return { ok: false, reason: 'setField needs a non-empty value' };
      return setField(lines, edit.field, edit.value.trim());
    case 'addGuarantee':
      if (!edit.statement) return { ok: false, reason: 'addGuarantee needs a statement' };
      return addGuarantee(lines, edit);
    case 'removeGuarantee':
      if (!edit.match) return { ok: false, reason: 'removeGuarantee needs a match' };
      return removeRule(lines, 'guarantee', 'guarantees', edit.match);
    case 'addNever':
      if (!edit.statement) return { ok: false, reason: 'addNever needs a statement' };
      return addNever(lines, edit.statement);
    case 'removeNever':
      if (!edit.match) return { ok: false, reason: 'removeNever needs a match' };
      return removeRule(lines, 'never', 'never', edit.match);
    case 'addField':
      if (!['input', 'output'].includes(edit.section)) return { ok: false, reason: `addField section must be input/output, not "${edit.section}"` };
      if (!edit.name || !edit.type) return { ok: false, reason: 'addField needs name and type' };
      return addField(lines, edit.section, edit.name, edit.type);
    case 'removeField':
      if (!['input', 'output'].includes(edit.section)) return { ok: false, reason: `removeField section must be input/output, not "${edit.section}"` };
      if (!edit.name) return { ok: false, reason: 'removeField needs a name' };
      return removeField(lines, edit.section, edit.name);
    case 'setFieldType':
      if (!['input', 'output'].includes(edit.section)) return { ok: false, reason: `setFieldType section must be input/output, not "${edit.section}"` };
      if (!edit.name || !edit.type) return { ok: false, reason: 'setFieldType needs name and type' };
      return setFieldType(lines, edit.section, edit.name, edit.type);
    case 'addMetric':
      if (!edit.name) return { ok: false, reason: 'addMetric needs a name' };
      return addMetric(lines, edit);
    case 'removeMetric':
      if (!edit.name) return { ok: false, reason: 'removeMetric needs a name' };
      return removeNamedBlock(lines, 'metric', edit.name);
    case 'setMetricField':
      if (!edit.name || !['baseline', 'target', 'window'].includes(edit.field)) return { ok: false, reason: 'setMetricField needs a name and field baseline/target/window' };
      if (edit.value == null || edit.value === '') return { ok: false, reason: 'setMetricField needs a value' };
      return setMetricField(lines, edit.name, edit.field, String(edit.value));
    case 'addOutcome':
      if (!edit.name) return { ok: false, reason: 'addOutcome needs a name' };
      return addOutcome(lines, edit);
    case 'removeOutcome':
      if (!edit.name) return { ok: false, reason: 'removeOutcome needs a name' };
      return removeNamedBlock(lines, 'outcome', edit.name);
    case 'addRule':
      if (!edit.decision || !edit.name) return { ok: false, reason: 'addRule needs decision and name' };
      return addRule(lines, edit.decision, edit.name, edit.when, edit.return);
    case 'removeRule':
      if (!edit.decision || !edit.name) return { ok: false, reason: 'removeRule needs decision and name' };
      return removeDecisionRule(lines, edit.decision, edit.name);
    case 'setRule': {
      if (!edit.decision || !edit.name) return { ok: false, reason: 'setRule needs decision and name' };
      if (edit.when == null && edit.return == null) return { ok: false, reason: 'setRule needs when and/or return' };
      let cur = lines; let any = false; let reason = '';
      if (edit.when != null) { const r = setSubLine(cur, edit.decision, isRule(edit.name), 'when', edit.when, `no rule "${edit.name}" in ${edit.decision}`); if (r.ok) { cur = r.lines; any = true; } else reason = r.reason; }
      if (edit.return != null) { const r = setSubLine(cur, edit.decision, isRule(edit.name), 'return', edit.return, `no rule "${edit.name}" in ${edit.decision}`); if (r.ok) { cur = r.lines; any = true; } else reason = r.reason; }
      return any ? { ok: true, lines: cur } : { ok: false, reason: reason || 'setRule failed' };
    }
    case 'setDefault':
      if (!edit.decision || edit.return == null) return { ok: false, reason: 'setDefault needs decision and return' };
      return setDefault(lines, edit.decision, edit.return);
    default:
      return { ok: false, reason: `unknown op "${edit && edit.op}"` };
  }
}

/**
 * Apply structural edits to IntentLang source, preserving comments and untouched blocks.
 * When any edit applies, the result is normalized through the formatter , comments and content
 * are preserved (whitespace-only), so block insertions never leave a stray blank line and the
 * output is always canonically formatted. An empty/all-skipped edit list returns the input
 * unchanged (byte-for-byte, apart from line-ending normalization).
 */
export function applyEdits(source, edits) {
  const input = String(source ?? '');
  let lines = input.split('\n');
  const applied = []; const skipped = [];
  for (const edit of edits || []) {
    const r = applyOne(lines, edit);
    if (r && r.ok) { lines = r.lines; applied.push(edit); }
    else skipped.push({ edit, reason: (r && r.reason) || 'not applied' });
  }
  const joined = lines.join('\n');
  const out = applied.length ? formatSource(joined) : joined;
  return { schema: PATCH_SCHEMA, source: out, applied, skipped };
}
