// Round-trip IMPORT adapters , the inverse of exporters.mjs. Lift an external DMN decision
// table or BPMN process back into IntentLang source, so intent can come FROM the tools teams
// already use, not only go to them. Deterministic and pure. The design contract is
// round-trip fidelity: fromDMN(toDMN(ast)) and fromBPMN(toBPMN(ast)) reconstruct source that
// BEHAVES identically (same decisions, same lifecycle walks), even if cosmetic names differ.

import { parseXml, findAll, find, childrenNamed, localName } from './xml.mjs';

export const IMPORT_FORMATS = ['dmn', 'bpmn'];

const textOf = (node) => (node ? (find(node, 'text')?.text ?? node.text ?? '').trim() : '');
const stripQuotes = (s) => String(s ?? '').trim().replace(/^["'](.*)["']$/s, '$1');
// A safe IntentLang identifier from arbitrary text.
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

/** Import a DMN 1.3 document into IntentLang source (one `decision` block per DMN decision). */
export function fromDMN(xml) {
  const doc = parseXml(xml);
  const defs = find(doc, 'definitions') || doc;
  const mission = idish(defs.attrs.name, 'ImportedDecision');
  const lines = [`mission ${mission.replace(/\s+/g, '')}`, ''];

  for (const dec of findAll(doc, 'decision')) {
    const dname = idish(dec.attrs.name || dec.attrs.id, 'Decision').replace(/\s+/g, '');
    const table = find(dec, 'decisionTable');
    if (!table) continue;
    const inputEls = childrenNamed(table, 'input');
    const inputExprs = inputEls.map((inp) => textOf(find(inp, 'inputExpression')) || inp.attrs.label || '');
    const inputNames = inputExprs.map((e, i) => (e || `in${i + 1}`).replace(/\s+/g, ''));

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
      ruleN += 1;
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
  return lines.join('\n');
}

/** Import a BPMN 2.0 document into IntentLang source (one `lifecycle` block per process). */
export function fromBPMN(xml) {
  const doc = parseXml(xml);
  const defs = find(doc, 'definitions') || doc;
  const mission = idish(defs.attrs.name || 'ImportedProcess', 'ImportedProcess');
  const lines = [`mission ${mission.replace(/\s+/g, '')}`, ''];

  for (const proc of findAll(doc, 'process')) {
    const pname = idish(proc.attrs.name || proc.attrs.id, 'Process').replace(/\s+/g, '');
    // A "state" is any task-like activity. Map id -> display name.
    const taskEls = (proc.children || []).filter((c) => /task$/i.test(localName(c.name)) || localName(c.name) === 'subProcess');
    const startIds = new Set(findAll(proc, 'startEvent').map((e) => e.attrs.id));
    const endIds = new Set(findAll(proc, 'endEvent').map((e) => e.attrs.id));
    const nameById = {};
    for (const t of taskEls) nameById[t.attrs.id] = idish(t.attrs.name || t.attrs.id, 'State').replace(/\s+/g, '');

    const states = taskEls.map((t) => nameById[t.attrs.id]);
    const transitions = [];
    const terminals = new Set();
    for (const flow of childrenNamed(proc, 'sequenceFlow')) {
      const src = flow.attrs.sourceRef;
      const tgt = flow.attrs.targetRef;
      if (startIds.has(src)) continue; // start -> initial (IL infers initial from no inbound)
      if (endIds.has(tgt)) { if (nameById[src]) terminals.add(nameById[src]); continue; } // -> end = terminal
      if (nameById[src] && nameById[tgt]) {
        transitions.push({ name: idish(flow.attrs.name, `t${transitions.length + 1}`).replace(/\s+/g, ''), from: nameById[src], to: nameById[tgt] });
      }
    }

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
  return lines.join('\n');
}

/** Dispatch by format (or auto-detect when format is omitted). Returns IntentLang source, or null. */
export function importIntent(xml, format) {
  const fmt = format || detectFormat(xml);
  if (fmt === 'dmn') return fromDMN(xml);
  if (fmt === 'bpmn') return fromBPMN(xml);
  return null;
}
