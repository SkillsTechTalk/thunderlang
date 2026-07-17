// Round-trip IMPORT adapters , the inverse of exporters.mjs. Lift an external DMN decision
// table or BPMN process back into ThunderLang source, so intent can come FROM the tools teams
// already use, not only go to them. Deterministic and pure. The design contract is
// round-trip fidelity: fromDMN(toDMN(ast)) and fromBPMN(toBPMN(ast)) reconstruct source that
// BEHAVES identically (same decisions, same lifecycle walks), even if cosmetic names differ.

import { parseXml, findAll, find, childrenNamed, localName } from './xml.mjs';

export const IMPORT_FORMATS = ['dmn', 'bpmn'];
export const IMPORT_SCHEMA = 'intent-import-v1';

// A no-op warning collector, so the source-only public functions carry no cost.
const NOOP_WARN = () => {};

const textOf = (node) => (node ? (find(node, 'text')?.text ?? node.text ?? '').trim() : '');
const stripQuotes = (s) => String(s ?? '').trim().replace(/^["'](.*)["']$/s, '$1');
// A safe ThunderLang identifier from arbitrary text.
const idish = (s, fb = 'x') => {
  const v = String(s ?? '').trim();
  return v || fb;
};

/** Detect the format of an XML document ('dmn' | 'bpmn' | null). */
export function detectFormat(xml) {
  const s = String(xml ?? '');
  if (/<(\w+:)?definitions[^>]*DMN/i.test(s) || /<(\w+:)?decision\b/i.test(s)) return 'dmn';
  if (/<(\w+:)?definitions[^>]*BPMN/i.test(s) || /<(\w+:)?process\b/i.test(s)) return 'bpmn';
  return null;
}

// Reconstruct a `when` expression from a DMN rule's input entries. Handles BOTH the way we
// export (the whole boolean expression dumped in one cell) and proper DMN unary tests
// (an operator or bare value relative to the input expression).
function ruleWhen(inputExprs, entries) {
  const parts = [];
  for (let i = 0; i < entries.length; i++) {
    const t = (entries[i] || '').trim();
    if (t === '' || t === '-') continue;
    const expr = (inputExprs[i] || '').trim();
    if (/[A-Za-z_][\w.]*\s*(>=|<=|==|!=|>|<|=|\band\b|\bor\b|\bin\b)/.test(t)) {
      parts.push(t); // already a full boolean expression (our export, or a rich cell)
    } else if (/^(>=|<=|==|!=|>|<)/.test(t)) {
      parts.push(`${expr} ${t}`.trim()); // unary test: "age" + ">= 18"
    } else {
      parts.push(`${expr} == ${stripQuotes(t)}`.trim()); // bare value: "region" == "US"
    }
  }
  return parts.join(' and ');
}

// DMN -> intent source. `warn(code, message, subject)` collects what could not be faithfully
// represented, so callers can surface the fidelity loss (via importReport).
function dmnToIntent(xml, warn = NOOP_WARN) {
  const doc = parseXml(xml);
  const defs = find(doc, 'definitions') || doc;
  const mission = idish(defs.attrs.name, 'ImportedDecision');
  const lines = [`mission ${mission.replace(/\s+/g, '')}`, ''];
  let decisions = 0;
  let rules = 0;

  for (const dec of findAll(doc, 'decision')) {
    const dname = idish(dec.attrs.name || dec.attrs.id, 'Decision').replace(/\s+/g, '');
    const table = find(dec, 'decisionTable');
    if (!table) { warn('IL-IMP-DMN-001', `Decision "${dname}" has no decisionTable and was skipped.`, dname); continue; }
    decisions += 1;

    const hitPolicy = (table.attrs.hitPolicy || 'UNIQUE').toUpperCase();
    if (!['FIRST', 'UNIQUE', 'ANY', ''].includes(hitPolicy)) {
      warn('IL-IMP-DMN-002', `Decision "${dname}" uses hit policy ${hitPolicy}; ThunderLang evaluates first-match, so semantics may differ.`, dname);
    }

    const inputEls = childrenNamed(table, 'input');
    const inputExprs = inputEls.map((inp) => textOf(find(inp, 'inputExpression')) || inp.attrs.label || '');
    const inputNames = inputExprs.map((e, i) => (e || `in${i + 1}`).replace(/\s+/g, ''));
    if (childrenNamed(table, 'output').length > 1) warn('IL-IMP-DMN-004', `Decision "${dname}" has multiple output columns; only the first is imported.`, dname);

    lines.push(`decision ${dname}`);
    if (inputNames.length) {
      lines.push('  inputs');
      for (const n of inputNames) lines.push(`    ${n}`);
    }

    let defaultReturn = null;
    let ruleN = 0;
    for (const rule of childrenNamed(table, 'rule')) {
      const entries = childrenNamed(rule, 'inputEntry').map((e) => textOf(e));
      const out = stripQuotes(textOf(childrenNamed(rule, 'outputEntry')[0]));
      const when = ruleWhen(inputExprs, entries);
      if (!when) { defaultReturn = out || defaultReturn; continue; } // all-dash rule = default
      if (!out) warn('IL-IMP-DMN-003', `A rule in "${dname}" has a condition but no result; imported with an empty return.`, dname);
      ruleN += 1; rules += 1;
      lines.push(`  rule r${ruleN}`);
      lines.push(`    when ${when}`);
      lines.push(`    return ${out}`);
    }
    if (defaultReturn != null) {
      lines.push('  default');
      lines.push(`    return ${defaultReturn}`);
    }
    lines.push('');
  }
  return { source: lines.join('\n'), stats: { decisions, rules } };
}

// BPMN -> intent source, with warnings for constructs a lifecycle cannot model.
function bpmnToIntent(xml, warn = NOOP_WARN) {
  const doc = parseXml(xml);
  const defs = find(doc, 'definitions') || doc;
  const mission = idish(defs.attrs.name || 'ImportedProcess', 'ImportedProcess');
  const lines = [`mission ${mission.replace(/\s+/g, '')}`, ''];
  let processes = 0;
  let statesTotal = 0;
  let transitionsTotal = 0;

  for (const proc of findAll(doc, 'process')) {
    processes += 1;
    const pname = idish(proc.attrs.name || proc.attrs.id, 'Process').replace(/\s+/g, '');
    const taskEls = (proc.children || []).filter((c) => /task$/i.test(localName(c.name)) || localName(c.name) === 'subProcess');
    const startIds = new Set(findAll(proc, 'startEvent').map((e) => e.attrs.id));
    const endIds = new Set(findAll(proc, 'endEvent').map((e) => e.attrs.id));
    const nameById = {};
    for (const t of taskEls) nameById[t.attrs.id] = idish(t.attrs.name || t.attrs.id, 'State').replace(/\s+/g, '');

    // Constructs a state machine cannot represent.
    const gateways = (proc.children || []).filter((c) => /gateway$/i.test(localName(c.name)));
    if (gateways.length) warn('IL-IMP-BPMN-001', `Process "${pname}" has ${gateways.length} gateway(s); branching is flattened into direct transitions.`, pname);
    const intermediates = (proc.children || []).filter((c) => /^intermediate/i.test(localName(c.name)));
    if (intermediates.length) warn('IL-IMP-BPMN-004', `Process "${pname}" has ${intermediates.length} intermediate event(s); not modeled as lifecycle states.`, pname);
    if (taskEls.length === 0) warn('IL-IMP-BPMN-005', `Process "${pname}" has no tasks; the lifecycle has no states.`, pname);

    const states = taskEls.map((t) => nameById[t.attrs.id]);
    const transitions = [];
    const terminals = new Set();
    for (const flow of childrenNamed(proc, 'sequenceFlow')) {
      const src = flow.attrs.sourceRef;
      const tgt = flow.attrs.targetRef;
      if (find(flow, 'conditionExpression')) warn('IL-IMP-BPMN-002', `A sequence flow in "${pname}" carries a condition; ThunderLang transitions have no guards, so the condition is dropped.`, pname);
      if (startIds.has(src)) continue; // start -> initial (IL infers initial from no inbound)
      if (endIds.has(tgt)) { if (nameById[src]) terminals.add(nameById[src]); continue; }
      if (nameById[src] && nameById[tgt]) {
        transitions.push({ name: idish(flow.attrs.name, `t${transitions.length + 1}`).replace(/\s+/g, ''), from: nameById[src], to: nameById[tgt] });
      } else {
        warn('IL-IMP-BPMN-003', `A sequence flow in "${pname}" references a non-task node (a gateway or event) and was dropped.`, pname);
      }
    }

    statesTotal += states.length; transitionsTotal += transitions.length;
    lines.push(`lifecycle ${pname}`);
    for (const s of states) lines.push(`  state ${s}`);
    for (const tr of transitions) {
      lines.push(`  transition ${tr.name}`);
      lines.push(`    from ${tr.from}`);
      lines.push(`    to ${tr.to}`);
    }
    if (terminals.size) lines.push(`  terminal ${[...terminals].join(', ')}`);
    lines.push('');
  }
  return { source: lines.join('\n'), stats: { processes, states: statesTotal, transitions: transitionsTotal } };
}

/** Import a DMN 1.3 document into ThunderLang source (one `decision` block per DMN decision). */
export function fromDMN(xml) {
  return dmnToIntent(xml).source;
}

/** Import a BPMN 2.0 document into ThunderLang source (one `lifecycle` block per process). */
export function fromBPMN(xml) {
  return bpmnToIntent(xml).source;
}

/** Dispatch by format (or auto-detect when format is omitted). Returns ThunderLang source, or null. */
export function importIntent(xml, format) {
  const fmt = format || detectFormat(xml);
  if (fmt === 'dmn') return fromDMN(xml);
  if (fmt === 'bpmn') return fromBPMN(xml);
  return null;
}

/**
 * Import WITH a fidelity report , the same source, plus the warnings for everything the
 * source format expressed that ThunderLang could not faithfully represent, plus stats.
 * This is what Studio surfaces so a user knows exactly what an import dropped.
 * @returns {{schema, format, source, warnings, stats, ok} | null}
 */
export function importReport(xml, format) {
  const fmt = format || detectFormat(xml);
  const warnings = [];
  const warn = (code, message, subject) => warnings.push({ code, message, ...(subject ? { subject } : {}) });
  let result;
  if (fmt === 'dmn') result = dmnToIntent(xml, warn);
  else if (fmt === 'bpmn') result = bpmnToIntent(xml, warn);
  else return null;
  return { schema: IMPORT_SCHEMA, format: fmt, source: result.source, warnings, stats: result.stats, ok: warnings.length === 0 };
}
