// IntentLift: Code-to-Intent (deterministic, no AI). Lifts source code into an
// INFERRED IntentLang draft. Generated intent is useful but humble: it carries
// evidence, confidence, unknowns, and needs_review, and is never marked verified.
//
// Pipeline: source -> Language Adapter -> CodeFactsIR -> Inference -> LiftedIntent -> .intent text
// P0 ships a TypeScript adapter. Other languages (Rust, Perl, ...) plug in as
// adapters that emit the same CodeFactsIR, so they share this inference engine.

import { slug } from './parse.mjs';
import { COMPILER_VERSION } from './emit.mjs';

const IR_SCHEMA_VERSION = '0.1.0';
const SEMANTIC_TYPES = new Set([
  'Email', 'Money', 'Currency', 'Url', 'UserId', 'AccountId', 'OrderId', 'InvoiceId',
  'PaymentId', 'Secret', 'Token', 'Jwt', 'IdempotencyKey', 'Date', 'DateTime',
  'Duration', 'Percentage', 'TraceId', 'CorrelationId',
]);
const SENSITIVE = /password|token|jwt|secret|payment|credential|ssn|pii|email/i;

const lineOf = (source, index) => source.slice(0, index).split('\n').length;

// Turn create_invoice / createInvoice -> "create invoice"; -> PascalCase for a mission name.
function words(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase().trim();
}
function pascal(name) {
  return words(name).split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

function parseParams(raw) {
  if (!raw.trim()) return [];
  return raw.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
    const m = p.match(/^([A-Za-z_$][\w$]*)\s*:?\s*([^=]+)?/);
    const name = m ? m[1] : p;
    let type = m && m[2] ? m[2].trim() : null;
    return { name, type };
  });
}

// ── TypeScript / JavaScript adapter -> CodeFactsIR ───────────────────────────
export function extractFactsTypeScript(source, file = 'input.ts') {
  const functions = [];
  const seen = new Set();
  const addFn = (name, paramsRaw, ret, idx) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    functions.push({
      name, file, line: lineOf(source, idx),
      parameters: parseParams(paramsRaw || ''),
      returnType: ret ? ret.trim().replace(/[{=].*$/, '').trim() : null,
      evidence: [{ kind: 'function_signature', file, line: lineOf(source, idx) }],
    });
  };

  let m;
  const named = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?::\s*([^{]+))?/g;
  while ((m = named.exec(source))) addFn(m[1], m[2], m[3], m.index);
  const arrow = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*([^=]+?))?\s*=>/g;
  while ((m = arrow.exec(source))) addFn(m[1], m[2], m[3], m.index);

  const tests = [];
  const testRe = /\b(?:test|it)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  while ((m = testRe.exec(source))) tests.push({ name: m[1], file, line: lineOf(source, m.index) });

  const errors = [];
  const errSeen = new Set();
  const addErr = (name, idx) => { if (name && !errSeen.has(name)) { errSeen.add(name); errors.push({ name, file, line: lineOf(source, idx) }); } };
  const classErr = /class\s+([A-Za-z_$][\w$]*(?:Error|Exception))\b/g;
  while ((m = classErr.exec(source))) addErr(m[1], m.index);
  const thrown = /throw\s+new\s+([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = thrown.exec(source))) addErr(m[1], m.index);

  return {
    schemaVersion: IR_SCHEMA_VERSION, sourceLanguage: 'typescript', sourceRoot: file,
    functions, tests, errors,
  };
}

// Split on a top-level delimiter, ignoring ones inside <>, (), [], {}.
function splitTopLevel(str, delim) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of str) {
    if ('<([{'.includes(ch)) depth++;
    else if ('>)]}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === delim && depth === 0) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function parseRustParams(raw) {
  return splitTopLevel(raw, ',').map((p) => p.trim()).filter(Boolean)
    .filter((p) => !/^&?\s*(mut\s+)?self$/.test(p))
    .map((p) => {
      const m = p.replace(/^mut\s+/, '').match(/^([A-Za-z_]\w*)\s*:\s*(.+)$/);
      if (!m) return { name: p, type: null };
      return { name: m[1], type: m[2].trim().replace(/^&(mut\s+)?/, '') };
    });
}

// ── Rust adapter -> CodeFactsIR (strong types, Result<T,E>, error enums) ─────
export function extractFactsRust(source, file = 'input.rs') {
  let m;
  // tests first: #[test] / #[tokio::test] fn <name>
  const tests = [];
  const testNames = new Set();
  const testRe = /#\[\s*(?:tokio::)?test\s*\][\s\S]*?fn\s+(\w+)/g;
  while ((m = testRe.exec(source))) { tests.push({ name: m[1], file, line: lineOf(source, m.index) }); testNames.add(m[1]); }

  const functions = [];
  const seen = new Set();
  const fnRe = /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)\s*(?:->\s*([^{;]+))?/g;
  while ((m = fnRe.exec(source))) {
    const name = m[1];
    if (seen.has(name) || testNames.has(name)) continue;
    seen.add(name);
    functions.push({
      name, file, line: lineOf(source, m.index),
      parameters: parseRustParams(m[2] || ''),
      returnType: m[3] ? m[3].trim() : null,
      evidence: [{ kind: 'function_signature', file, line: lineOf(source, m.index) }],
    });
  }

  // error enum variants: `enum <Name>Error { DuplicateInvoice, Unauthorized(..) }`
  const errors = [];
  const seenErr = new Set();
  const enumRe = /enum\s+(\w*Error)\s*\{([^}]*)\}/g;
  while ((m = enumRe.exec(source))) {
    for (const raw of splitTopLevel(m[2], ',')) {
      const v = raw.trim().replace(/[({].*$/s, '').trim();
      if (v && /^[A-Z]/.test(v) && !seenErr.has(v)) { seenErr.add(v); errors.push({ name: v, source: m[1], file, line: lineOf(source, m.index) }); }
    }
  }

  return { schemaVersion: IR_SCHEMA_VERSION, sourceLanguage: 'rust', sourceRoot: file, functions, tests, errors };
}

const ADAPTERS = {
  typescript: extractFactsTypeScript, ts: extractFactsTypeScript,
  javascript: extractFactsTypeScript, js: extractFactsTypeScript,
  rust: extractFactsRust, rs: extractFactsRust,
};
export const SUPPORTED_LANGUAGES = ['typescript', 'rust'];

const LANG_DISPLAY = { typescript: 'TypeScript', rust: 'Rust', javascript: 'JavaScript' };

// Unwrap Result<T, E> / Promise<T> / T -> { output, error }
function unwrapReturn(ret) {
  if (!ret) return { output: null, error: null };
  let r = ret.trim();
  const promise = r.match(/^Promise<(.+)>$/);
  if (promise) r = promise[1].trim();
  const result = r.match(/^(?:Result|Either)<\s*([^,]+?)\s*,\s*([^>]+?)\s*>$/);
  if (result) return { output: result[1].trim(), error: result[2].trim() };
  return { output: r, error: null };
}

// ── Inference: CodeFactsIR -> LiftedIntent ──────────────────────────────────
export function inferIntent(facts) {
  const primary = facts.functions.find((f) => f.parameters.length && f.returnType) || facts.functions[0];
  if (!primary) return null;

  const missionName = pascal(primary.name);
  const { output, error } = unwrapReturn(primary.returnType);

  const inputs = primary.parameters.map((p) => ({
    name: p.name,
    type: p.type && SEMANTIC_TYPES.has(p.type.replace(/<.*/, '')) ? p.type : (p.type || 'Unknown'),
    evidence: 'function parameter',
    sensitive: SENSITIVE.test(`${p.name} ${p.type || ''}`),
  }));

  const guarantees = facts.tests.map((t) => ({
    statement: words(t.name), evidence: `test ${t.name}`, confidence: 'high',
    sourceSpan: { file: t.file, line: t.line },
  }));

  // Prefer specific error-enum variants; fall back to the Result error type.
  const variantErrors = facts.errors.map((e) => e.name);
  const errorNames = [...new Set(variantErrors.length ? variantErrors : (error ? [error] : []))]
    .filter((n) => n && !/^(string|number|boolean|void|Error)$/i.test(n));
  const neverRules = errorNames.map((n) => ({
    statement: `cause ${words(n)}`, evidence: `${n} error`, confidence: 'medium',
  }));

  const hasSensitive = inputs.some((i) => i.sensitive);
  const unknown = ['why', 'owner', 'customer impact', 'PM notes', ...(hasSensitive ? [] : ['security never rules'])];
  const needsReview = ['goal wording', 'why', 'never rules', ...(hasSensitive ? ['security rules'] : []), 'verification evidence'];

  // Overall confidence: high if tests + typed signature; low if only a signature.
  const overall = guarantees.length && inputs.every((i) => i.type !== 'Unknown') ? 'high'
    : guarantees.length || inputs.some((i) => i.type !== 'Unknown') ? 'medium' : 'low';

  return {
    mission: missionName,
    from: LANG_DISPLAY[facts.sourceLanguage] || facts.sourceLanguage,
    confidence: overall,
    reviewed: false,
    mapsTo: [
      `function ${primary.file}:${primary.name}`,
      ...facts.tests.map((t) => `test ${t.file}:${t.name}`),
    ],
    evidence: [
      `function signature ${primary.name}`,
      ...facts.tests.slice(0, 5).map((t) => `test ${t.name}`),
      ...errorNames.slice(0, 5).map((n) => `error ${n}`),
    ],
    goal: `${words(primary.name)} (inferred from the ${primary.name} signature)`,
    inputs,
    output: output && !/^(void|undefined|null)$/i.test(output) ? { name: 'result', type: output, evidence: 'return type' } : null,
    guarantees,
    neverRules,
    unknown,
    needsReview,
    hasSensitive,
  };
}

// ── LiftedIntent -> humble, source-mapped .intent draft ─────────────────────
export function renderLiftedIntent(lift) {
  const L = [];
  L.push(`# Inferred by IntentLift from ${lift.from}. Draft, unverified, needs human review.`);
  L.push(`mission ${lift.mission}`, '');
  L.push('inferred', `  from ${lift.from}`, `  confidence ${lift.confidence}`, `  reviewed false`, `  generated_by SkillsTech Compiler ${COMPILER_VERSION}`, '');
  L.push('maps_to', ...lift.mapsTo.map((m) => `  ${m}`), '');
  L.push('evidence', ...lift.evidence.map((e) => `  ${e}`), '');
  L.push('goal', `  ${lift.goal}`, '');
  if (lift.inputs.length) {
    L.push('input');
    for (const i of lift.inputs) L.push(`  ${i.name}: ${i.type}`);
    L.push('');
  }
  if (lift.output) L.push('output', `  ${lift.output.name}: ${lift.output.type}`, '');
  if (lift.guarantees.length) {
    L.push('guarantees');
    for (const g of lift.guarantees) L.push(`  ${g.statement}`);
    L.push('');
  }
  if (lift.neverRules.length) {
    L.push('never');
    for (const n of lift.neverRules) L.push(`  ${n.statement}`);
    L.push('');
  }
  L.push('unknown', ...lift.unknown.map((u) => `  ${u}`), '');
  L.push('needs_review', ...lift.needsReview.map((r) => `  ${r}`), '');
  return L.join('\n') + '\n';
}

// ── Diagnostics specific to lifted drafts (all advisory) ────────────────────
function liftDiagnostics(lift, facts) {
  const d = [];
  const warn = (code, message) => d.push({ level: 'warning', code, message });
  warn('INTENT_LIFT_NEEDS_HUMAN_REVIEW', 'This intent was inferred from code. A human must review goal, why, never rules, and verification.');
  if (lift.confidence === 'low') warn('INTENT_LIFT_LOW_CONFIDENCE', 'Low confidence: inferred mostly from names, with little test or type evidence.');
  if (!facts.tests.length) warn('INTENT_LIFT_NO_TEST_EVIDENCE', 'No tests found. Guarantees could not be grounded in verification evidence.');
  if (lift.inputs.some((i) => i.type === 'Unknown')) warn('INTENT_LIFT_UNKNOWN_SEMANTIC_TYPE', 'Some fields could not be resolved to a semantic type. Review and annotate them.');
  if (lift.hasSensitive) warn('INTENT_LIFT_SECURITY_REVIEW_NEEDED', 'Sensitive field names detected. Mark them Secret/Token/PII and add never-log rules.');
  return d;
}

/**
 * Lift a set of source files (a repo) into inferred IntentLang drafts, one per
 * file that yields a mission. `files` is [{ file, source }] (the CLI reads the
 * filesystem; this core function stays pure). Returns per-mission drafts + a
 * repo-level summary matching the `intent lift --from repo --json` contract.
 */
export function languageForFile(file) {
  if (/\.rs$/i.test(file)) return 'rust';
  return 'typescript';
}

export function liftRepo(files, { language } = {}) {
  const missions = [];
  const confidenceSummary = { high: 0, medium: 0, low: 0 };
  const detected = new Set();
  const usedNames = new Map();
  let unknowns = 0;

  for (const { file, source } of files) {
    const lang = language || languageForFile(file);
    const r = liftSource(source, { language: lang, file });
    if (!r.ok) continue;
    detected.add(lang);
    const conf = r.lifted.confidence;
    confidenceSummary[conf] = (confidenceSummary[conf] || 0) + 1;
    unknowns += r.lifted.unknown.length;
    const base = slug(r.lifted.mission);
    const n = (usedNames.get(base) || 0) + 1;
    usedNames.set(base, n);
    const outName = n === 1 ? `${base}.intent` : `${base}-${n}.intent`;
    missions.push({
      mission: r.lifted.mission, sourceFile: file, outName,
      intentText: r.intentText, summary: r.summary, diagnostics: r.diagnostics,
    });
  }

  return {
    ok: missions.length > 0,
    schemaVersion: IR_SCHEMA_VERSION,
    languagesDetected: [...detected].sort(),
    missionsGenerated: missions.length,
    confidenceSummary,
    unknowns,
    missions,
  };
}

/** Lift source into an inferred IntentLang draft. Deterministic, no AI. */
export function liftSource(source, { language = 'typescript', file = 'input.ts' } = {}) {
  const adapter = ADAPTERS[String(language).toLowerCase()];
  if (!adapter) {
    return { ok: false, error: `Unsupported language "${language}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}.` };
  }
  const codeFacts = adapter(source, file);
  const lifted = inferIntent(codeFacts);
  if (!lifted) {
    return { ok: false, error: 'No functions found to infer intent from.', codeFacts };
  }
  const intentText = renderLiftedIntent(lifted);
  const diagnostics = liftDiagnostics(lifted, codeFacts);
  const summary = {
    schemaVersion: IR_SCHEMA_VERSION,
    sourceLanguage: codeFacts.sourceLanguage,
    mission: lifted.mission,
    confidence: lifted.confidence,
    reviewed: false,
    evidenceCount: lifted.evidence.length,
    unknowns: lifted.unknown,
    functions: codeFacts.functions.length,
    tests: codeFacts.tests.length,
  };
  return { ok: true, codeFacts, lifted, intentText, diagnostics, summary };
}
