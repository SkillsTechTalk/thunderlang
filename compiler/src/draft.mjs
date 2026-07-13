// Prompt -> intent, the deterministic half (intent-draft-v1). Authoring intent by hand is
// friction most developers skip. This removes it: give a STRUCTURED brief (which an AI agent can
// produce from a free-text request, then a human approves) and IL scaffolds a rigorous,
// canonically-formatted intent draft AND a review checklist of exactly what is still missing ,
// an unverified guarantee, an unguarded secret, a goal not stated. No AI here; the draft is a
// proposal, never marked verified. Pure ESM + the formatter, so it is browser-safe.
//
//   draftIntent(brief) -> { schema, source, review, diagnostics }

import { parseIntent } from './parse.mjs';
import { semanticDiagnostics } from './emit.mjs';
import { formatSource } from './format.mjs';

export const DRAFT_SCHEMA = 'intent-draft-v1';

const SECRET_TYPES = new Set(['secret', 'password', 'passwd', 'jwt', 'token', 'apikey', 'api_key', 'privatekey', 'private_key', 'credential', 'cvv']);
const SECRET_NAME = /pass(word|wd)?|secret|token|jwt|ssn|api[-_]?key|apikey|credential|cvv|private[-_]?key|card/i;
const isSecretField = (f) => f && (SECRET_TYPES.has(String(f.type || '').toLowerCase()) || SECRET_NAME.test(f.name || ''));

function pascalish(text) {
  const words = String(text || 'Mission').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/);
  if (words.length === 1) return words[0].charAt(0).toUpperCase() + words[0].slice(1);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

// Accept a list of strings or { statement, because?, verify? } objects.
const normRules = (list) => (Array.isArray(list) ? list : []).map((r) => (typeof r === 'string' ? { statement: r } : { ...r })).filter((r) => r.statement);

/**
 * Scaffold a rigorous intent draft from a structured brief.
 * @param {object} brief { mission|name, goal, actor, problem, title, profiles, guarantees[],
 *   neverRules[], inputs[], outputs[], decisions[] }
 */
export function draftIntent(brief = {}) {
  const b = brief || {};
  const L = [];
  const review = [];
  const flag = (kind, message) => review.push({ kind, message });

  const name = pascalish(b.mission || b.name || 'Mission');
  L.push(`mission ${name}`);
  const profiles = Array.isArray(b.profiles) && b.profiles.length ? b.profiles : ['product'];
  for (const p of profiles) L.push(`use ${p}`);
  L.push('');

  if (b.title) L.push(`title "${String(b.title).replace(/"/g, "'")}"`);
  if (b.actor) L.push(`for ${b.actor}`);
  if (b.problem) L.push(`problem "${String(b.problem).replace(/"/g, "'")}"`);
  if (b.goal) { L.push('goal'); L.push(`  ${b.goal}`); L.push(''); }
  else flag('missing-goal', 'No goal given , state the outcome this mission exists to achieve.');

  const guarantees = normRules(b.guarantees);
  for (const g of guarantees) {
    L.push(`guarantee ${g.statement}`);
    if (g.because) L.push(`  because ${g.because}`);
    if (g.verify) L.push(`  verify ${g.verify}`);
    else flag('guarantee-unverified', `Guarantee "${g.statement}" has no verification , add a test that proves it.`);
  }
  if (guarantees.length) L.push('');
  if (!guarantees.length) flag('no-guarantees', 'No guarantees given , what must always hold?');

  const nevers = normRules(b.neverRules || b.nevers);
  for (const n of nevers) {
    L.push(`never ${n.statement}`);
    if (n.verify) L.push(`  verify ${n.verify}`);
    else flag('never-unverified', `Never-rule "${n.statement}" has no verification.`);
  }
  if (nevers.length) L.push('');

  const inputs = Array.isArray(b.inputs) ? b.inputs : [];
  if (inputs.length) { L.push('input'); for (const f of inputs) L.push(`  ${f.name}: ${f.type || 'string'}`); L.push(''); }
  const outputs = Array.isArray(b.outputs) ? b.outputs : [];
  if (outputs.length) { L.push('output'); for (const f of outputs) L.push(`  ${f.name}: ${f.type || 'string'}`); L.push(''); }

  for (const d of Array.isArray(b.decisions) ? b.decisions : []) {
    if (!d || !d.name) continue;
    L.push(`decision ${d.name}`);
    if (Array.isArray(d.inputs) && d.inputs.length) { L.push('  inputs'); for (const i of d.inputs) L.push(`    ${typeof i === 'string' ? i : i.name}`); }
    for (const r of Array.isArray(d.rules) ? d.rules : []) {
      if (!r || !r.name) continue;
      L.push(`  rule ${r.name}`);
      if (r.when) L.push(`    when ${r.when}`);
      if (r.return) L.push(`    return ${r.return}`);
    }
    if (d.default) { L.push('  default'); L.push(`    return ${d.default}`); }
    else flag('decision-no-default', `Decision "${d.name}" has no default , what happens when no rule matches?`);
    L.push('');
  }

  // Secret inputs with no never-rule covering them , the highest-value gap to surface.
  const neverText = nevers.map((n) => n.statement.toLowerCase()).join(' ');
  for (const f of inputs.filter(isSecretField)) {
    if (!neverText.includes(String(f.name).toLowerCase()) && !/\b(log|expose|leak)\b/.test(neverText)) {
      flag('secret-unguarded', `Input "${f.name}" is a secret , add a "never expose ${f.name} in logs" rule.`);
    }
  }

  const source = formatSource(`${L.join('\n')}\n`);
  const diagnostics = semanticDiagnostics(parseIntent(source));
  return { schema: DRAFT_SCHEMA, source, review, diagnostics };
}
