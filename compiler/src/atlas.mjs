// Mission Atlas indexing: aggregate many .intent files into one inventory.
//
// This is the deterministic slice of the Atlas. It reports only what is derivable
// from the .intent files themselves: mission, feature area, a risk heuristic,
// guarantee/never counts, and DECLARED verification (whether verify tests exist).
//
// It deliberately does NOT report test pass counts, proof, or drift. Those need a
// test runner and OpenThunder (repo evidence), which the compiler does not own.
// Those columns of the Proof Matrix stay evidence-dependent. See docs/proof-matrix.

import { parseIntent, slug } from './parse.mjs';
import { sha256 } from './emit.mjs';

// Feature area convention: an explicit `# area: X` comment wins; otherwise the
// header comment `# <Name>.intent , <Product> / <Area>` is used; else uncategorized.
function deriveArea(source) {
  const explicit = source.match(/^#\s*area:\s*(.+)$/im);
  if (explicit) return explicit[1].trim();
  const header = source.match(/^#[^\n]*\.intent[^\n]*?\/\s*(.+?)\s*$/im);
  if (header) return header[1].trim();
  return null;
}

const RISK_PATTERNS = {
  payments: /\b(payment|charge|invoice|checkout|subscription|billing|refund)\b/i,
  auth: /\b(password|login|auth|session|credential|sign[- ]?in)\b/i,
  secret: /\b(secret|token)\b/i,
  pii: /\b(email|pii|personal data|address|phone)\b/i,
  deployment: /\b(rollback|migration|deploy)\b/i,
};

// The risk field is a HEURISTIC. To avoid prose noise it scans only structured
// signal: the mission name, guarantee and never statements, and input names/types.
function deriveRisk(ast) {
  const signal = [
    ast.mission,
    ...ast.guarantees.map((g) => g.statement),
    ...ast.neverRules.map((n) => n.statement),
    ...ast.inputs.map((i) => `${i.name} ${i.type}`),
  ].filter(Boolean).join(' ');

  const factors = [];
  for (const [name, re] of Object.entries(RISK_PATTERNS)) if (re.test(signal)) factors.push(name);
  if (ast.inputs.some((i) => /secret/i.test(i.type)) && !factors.includes('secret')) factors.push('secret');

  const high = factors.includes('payments') || factors.includes('deployment')
    || (factors.includes('secret') && factors.includes('auth'));
  const level = high ? 'high'
    : (factors.includes('secret') || factors.includes('pii') || factors.includes('auth') || factors.length >= 2) ? 'medium'
    : 'low';
  return { level, factors };
}

// DECLARED verification: how many verify tests the mission states, vs how many
// guarantees + never rules it makes. "declared" is not "passing"; proof needs evidence.
function deriveVerification(ast) {
  const rules = ast.guarantees.length + ast.neverRules.length;
  const verifyTests = ast.verify.length
    + ast.guarantees.reduce((n, g) => n + (g.verify ? g.verify.length : 0), 0)
    + ast.neverRules.reduce((n, r) => n + (r.verify ? r.verify.length : 0), 0);
  let verification = 'none';
  if (verifyTests > 0) verification = verifyTests >= rules ? 'declared-full' : 'declared-partial';
  return { verification, verifyTests };
}

/**
 * Build a mission index from parsed .intent files.
 * @param {{path?: string, source: string}[]} files
 * @param {{product?: string}} [opts]
 */
export function buildMissionIndex(files, opts = {}) {
  const missions = files.map(({ path: p, source }) => {
    const ast = parseIntent(source);
    const { verification, verifyTests } = deriveVerification(ast);
    const { level, factors } = deriveRisk(ast);
    return {
      // Stable join keys for downstream consumers (e.g. OpenThunder coverage/drift).
      // missionId is the compiler's deterministic mission slug; intentProofHash is the
      // same sha256 the .intent-proof.json carries as sourceHash, so joins need no remap.
      missionId: ast.mission ? slug(ast.mission) : null,
      mission: ast.mission || null,
      intentProofHash: sha256(source),
      file: p || null,
      area: deriveArea(source),
      risk: level,
      riskFactors: factors,
      guarantees: ast.guarantees.length,
      neverRules: ast.neverRules.length,
      verifyTests,
      verification,
      reviewed: ast.approval?.reviewed === true,
    };
  }).filter((m) => m.mission);

  missions.sort((a, b) => a.mission.localeCompare(b.mission));

  const byArea = {};
  for (const m of missions) {
    const a = m.area || 'uncategorized';
    byArea[a] = (byArea[a] || 0) + 1;
  }

  return {
    schema: 'mission-index-v1',
    generatedBy: 'intent index',
    product: opts.product || null,
    note: 'Verification is DECLARED (verify tests present), not proven. Test pass counts and drift require a test runner and OpenThunder; they are not in this index.',
    missions,
    summary: {
      missions: missions.length,
      byArea,
      declaredFull: missions.filter((m) => m.verification === 'declared-full').length,
      declaredPartial: missions.filter((m) => m.verification === 'declared-partial').length,
      unverified: missions.filter((m) => m.verification === 'none').length,
      highRisk: missions.filter((m) => m.risk === 'high').length,
    },
  };
}
