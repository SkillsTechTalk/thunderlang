// Intent AI Implementations , the shared domain for intentionally deferred,
// AI-assisted implementations. This module is the single source of truth that all
// four SkillsTech products key off (contract intent-ai-v1):
//   - the state model
//   - the managed-region marker parser (multi-language)
//   - the contract hash and implementation hash (with normalization)
//   - the .intent/ai-implementations.json manifest shape
//
// IntentLang OWNS this. OpenThunder verifies against it; Repo Mastery teaches it;
// SkillsTech orchestrates it. Deterministic, no AI required.

import { sha256 } from './emit.mjs';
import { slug } from './parse.mjs';

// ── State model (one shared lifecycle across all products) ───────────────────
export const IMPLEMENTATION_STATES = [
  'PENDING',                    // declared, no implementation exists
  'GENERATED',                  // code exists, not verified
  'VERIFIED',                   // automated verification passed
  'VERIFIED_AWAITING_APPROVAL', // passed, but policy requires human approval
  'APPROVED',                   // required human approval recorded
  'MODIFIED',                   // code or contract changed after verification
  'INVALID',                    // verification failed or proof integrity broken
  'REJECTED',                   // reviewer explicitly rejected
  'ADOPTED',                    // AI region became human-owned code
];

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'];
// Risk categories that force approval even after automated verification passes.
export const HIGH_RISK = new Set(['high', 'critical']);

/** True if a state means the implementation must block a production build. */
export function blocksProduction(status, { approvalRequired = false } = {}) {
  if (['PENDING', 'GENERATED', 'MODIFIED', 'INVALID', 'REJECTED'].includes(status)) return true;
  if (status === 'VERIFIED_AWAITING_APPROVAL') return true;
  if (status === 'VERIFIED' && approvalRequired) return true;
  return false; // APPROVED and ADOPTED ship
}

// ── Managed-region markers (multi-language, one shared parser) ───────────────
// The machine-readable <intent:ai-implementation ...> ... </intent:ai-implementation>
// marker is authoritative. Comment prefix varies by language; the marker token is
// the same everywhere, so we detect it regardless of prefix.
export const COMMENT_PREFIX = {
  typescript: '//', javascript: '//', tsx: '//', jsx: '//',
  csharp: '//', java: '//', go: '//', rust: '//',
  python: '#', ruby: '#', perl: '#', shell: '#',
};

const OPEN_TOKEN = 'intent:ai-implementation';   // AI-managed
const ADOPTED_TOKEN = 'intent:implementation';   // human-owned after adoption
const attrRe = /([a-zA-Z][\w-]*)\s*=\s*"([^"]*)"/g;

function parseAttrs(text) {
  const attrs = {};
  let m;
  attrRe.lastIndex = 0;
  while ((m = attrRe.exec(text))) attrs[m[1]] = m[2];
  return attrs;
}

/**
 * Parse managed regions from target code. Comment-prefix agnostic.
 * Returns { regions: [{ token, id, attrs, startLine, endLine, code }], findings: [] }.
 * findings use INTENT-AI-1xx region-integrity codes.
 */
export function parseMarkers(code) {
  const lines = String(code).split('\n');
  const regions = [];
  const findings = [];
  const stack = [];
  const seenIds = new Set();

  lines.forEach((line, i) => {
    const ln = i + 1;
    const token = line.includes(OPEN_TOKEN) ? OPEN_TOKEN : line.includes(ADOPTED_TOKEN) ? ADOPTED_TOKEN : null;
    const isClose = /<\s*\//.test(line) || line.includes('</');
    if (token && line.includes(`</${token}`)) {
      // closing marker
      const open = stack.pop();
      if (!open) { findings.push({ code: 'INTENT-AI-101', line: ln, message: `Closing marker with no matching open.` }); return; }
      regions.push({ ...open, endLine: ln, code: lines.slice(open.startLine, i).join('\n') });
    } else if (token && line.includes(`<${token}`) && !isCloseOnly(line, token)) {
      const attrs = parseAttrs(line);
      if (!attrs.id) findings.push({ code: 'INTENT-AI-104', line: ln, message: 'Managed region has no id.' });
      if (attrs.id && seenIds.has(attrs.id)) findings.push({ code: 'INTENT-AI-102', line: ln, message: `Duplicate implementation id "${attrs.id}".` });
      if (attrs.id) seenIds.add(attrs.id);
      stack.push({ token, id: attrs.id || null, attrs, startLine: ln });
    }
  });

  for (const open of stack) {
    findings.push({ code: 'INTENT-AI-101', line: open.startLine, message: `Managed region "${open.id}" is missing its closing marker.` });
  }
  return { regions, findings };
}

function isCloseOnly(line, token) {
  return line.includes(`</${token}`) && !new RegExp(`<${token}\\b`).test(line);
}

/** Render open + close marker comment lines for a language. */
export function renderMarker(meta, language = 'typescript', { token = OPEN_TOKEN } = {}) {
  const c = COMMENT_PREFIX[language] || '//';
  const order = ['id', 'mission', 'contract-hash', 'implementation-hash', 'generation-id', 'status', 'editing', 'risk', 'origin', 'ownership'];
  const attrs = order.filter((k) => meta[k] != null && meta[k] !== '').map((k) => `${k}="${meta[k]}"`);
  const open = `${c} <${token} ${attrs.join(' ')}>`;
  const close = `${c} </${token}>`;
  return { open, close };
}

// ── Hashing (contract hash + implementation hash) ────────────────────────────
const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const sortedNorm = (arr) => (arr || []).map(norm).filter(Boolean).sort();

/**
 * Contract hash , normalized representation of the mission's declared contract.
 * Order-insensitive where the language is order-insensitive; formatting-insensitive.
 */
export function contractHash(ast) {
  const canonical = {
    mission: norm(ast.mission),
    inputs: sortedNorm((ast.inputs || []).map((i) => `${i.name}:${i.type}`)),
    outputs: sortedNorm((ast.outputs || []).map((o) => `${o.name}:${o.type}`)),
    requires: sortedNorm(ast.requires),
    guarantees: sortedNorm((ast.guarantees || []).map((g) => g.statement)),
    never: sortedNorm((ast.neverRules || []).map((n) => n.statement)),
    constraints: sortedNorm(ast.constraints),
    errors: sortedNorm((ast.errors || []).map((e) => e.name)),
    verify: sortedNorm(ast.verify),
    architecture: sortedNorm(ast.architecture),
    risk: norm(ast.implementation?.risk),
    approval: norm(ast.implementation?.approval),
  };
  return sha256(JSON.stringify(canonical));
}

/**
 * Implementation hash , covers only the managed region's code after deterministic
 * normalization: strip marker lines, normalize line endings, trim trailing
 * whitespace, drop leading/trailing blank lines. Formatting-only edits inside the
 * body still change indentation/content, so this is intentionally content-sensitive
 * but not byte-sensitive to trailing whitespace or line endings.
 */
export function implementationHash(regionCode) {
  const body = String(regionCode || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !l.includes(OPEN_TOKEN) && !l.includes(ADOPTED_TOKEN))
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
  return sha256(body);
}

// ── Provider-neutral implementation prompt (Path 1: external agent handoff) ──
// Deterministic, no AI required. Produces the structured prompt a developer hands to
// Claude Code / Codex / Cursor, or the package for a BYOK / local provider.
export function buildImplementationPrompt(ast, { language = 'typescript' } = {}) {
  const impl = ast.implementation || {};
  const id = impl.id || slug(ast.mission || 'implementation');
  const { open, close } = renderMarker({ id, mission: ast.mission, status: 'generated' }, language);
  const list = (arr) => (arr && arr.length ? arr.map((x) => `- ${x}`).join('\n') : '- (none)');
  return [
    `# Implement: ${ast.mission} (id: ${id})`,
    '',
    `You are implementing one function/region for the mission "${ast.mission}". Follow the contract EXACTLY.`,
    '',
    '## Goal', ast.goal || '(none)',
    '', '## Inputs', list((ast.inputs || []).map((i) => `${i.name}: ${i.type}`)),
    '', '## Outputs', list((ast.outputs || []).map((o) => `${o.name}: ${o.type}`)),
    '', '## Requires (preconditions)', list(ast.requires),
    '', '## Guarantees (must always hold)', list((ast.guarantees || []).map((g) => g.statement)),
    '', '## Never (prohibited behavior)', list((ast.neverRules || []).map((n) => n.statement)),
    '', '## Constraints', list(ast.constraints),
    '', '## Failure modes', list((ast.errors || []).map((e) => e.name)),
    '', '## Verify (your code must pass)', list(ast.verify),
    '', '## Architecture rules', list(ast.architecture),
    '', '## Scope', `- scope: ${impl.scope || 'function_body'}`,
    `- may modify:\n${list(impl.mayModify || [`${ast.mission}.body`])}`,
    `- must NOT modify:\n${list(impl.mustNotModify || [`${ast.mission}.contract`, 'contract types', 'architecture'])}`,
    '', '## Output requirements',
    `- Return ONLY the ${language} region, wrapped in the exact machine-readable markers below.`,
    '- Do not modify anything outside the region. Do not add prohibited effects (network, fs, clock, randomness).',
    '- The implementation must be deterministic if the contract requires it.',
    '', '## Required marker format', '```', open, '// your implementation here', close, '```',
    '',
  ].join('\n');
}

// ── Manifest (.intent/ai-implementations.json) ───────────────────────────────
export const MANIFEST_SCHEMA_VERSION = '1.0';

/** Default risk-driven approval policy. */
function defaultApproval(impl) {
  if (impl.approval) return impl.approval;
  return HIGH_RISK.has(impl.risk) ? 'required' : 'none';
}

/**
 * Build the AI-implementation manifest from parsed .intent files.
 * @param {{path?: string, source: string, ast: object}[]} files (ast from parseIntent)
 * @param {{projectId?: string}} [opts]
 */
export function buildManifest(files, opts = {}) {
  const implementations = [];
  for (const f of files) {
    const impl = f.ast?.implementation;
    if (!impl) continue;
    const id = impl.id || slug(f.ast.mission || 'unnamed');
    implementations.push({
      id,
      mission: f.ast.mission || null,
      sourceLocation: f.path || null,
      targetLocation: impl.targetLocation || null,
      scope: impl.scope || 'function_body',
      strategy: impl.strategy || 'generate_once',
      editing: impl.editing || 'collaborative',
      risk: impl.risk || 'low',
      approval: defaultApproval(impl),
      status: 'PENDING',
      contractHash: contractHash(f.ast),
      implementationHash: null,
      generationId: null,
      proofLocation: `.intent/proofs/${id}.json`,
      mayModify: impl.mayModify || [`${f.ast.mission}.body`],
      mustNotModify: impl.mustNotModify || [`${f.ast.mission}.contract`],
    });
  }
  implementations.sort((a, b) => a.id.localeCompare(b.id));
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    projectId: opts.projectId || null,
    generatedBy: 'intentlang',
    implementations,
    summary: {
      total: implementations.length,
      byStatus: implementations.reduce((m, i) => ((m[i.status] = (m[i.status] || 0) + 1), m), {}),
      approvalRequired: implementations.filter((i) => i.approval !== 'none').length,
    },
  };
}
