// Data purpose + privacy (founder Gap 6). A `data` element declares what a piece of
// data IS (classification), WHY it is held (purpose), HOW LONG (retention), and on WHAT
// LAWFUL BASIS. The privacy analysis enforces purpose limitation: sensitive data may not
// be held without a stated purpose, retention, and basis, and may not be exposed without a
// guard. Deterministic and pure , the same intent always produces the same findings.

export const PRIVACY_SCHEMA = 'intent-privacy-v1';

// Data classification (least -> most sensitive). pii/sensitive are the governed tiers.
export const DATA_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'pii', 'sensitive'];
const GOVERNED = new Set(['pii', 'sensitive']);

// Lawful basis for holding personal data (GDPR Art. 6, normalized to snake_case tokens).
export const LAWFUL_BASES = ['consent', 'contract', 'legal_obligation', 'vital_interest', 'public_task', 'legitimate_interest'];

/**
 * Static privacy analysis of an AST's declared data elements. Fires only on explicitly
 * declared `data` blocks, so a mission with no data governance produces no findings.
 * @returns {{code, path, message, severity}[]}
 */
export function analyzePrivacy(ast) {
  const out = [];
  const dataEls = ast.dataElements || [];
  // The set of things a mission promises never to expose (e.g. "expose customer.ssn").
  const neverExposed = new Set();
  for (const n of ast.neverRules || []) {
    const t = (n.statement || n.text || n.rule || '').toLowerCase();
    if (/expos|leak|log|reveal|share/.test(t)) neverExposed.add(t);
  }
  const outputNames = new Set((ast.outputs || []).map((f) => (f.name || '').toLowerCase()));

  for (const d of dataEls) {
    const governed = GOVERNED.has((d.classification || '').toLowerCase());

    if (d.classification && !DATA_CLASSIFICATIONS.includes(d.classification.toLowerCase())) {
      out.push({ code: 'IL-DATA-004', path: d.path, severity: 'warning',
        message: `Data "${d.path}" has an unknown classification "${d.classification}".` });
    }

    if (governed) {
      if (!d.purpose) out.push({ code: 'IL-DATA-001', path: d.path, severity: 'blocker',
        message: `Sensitive data "${d.path}" (${d.classification}) is held with no stated purpose.` });
      if (!d.retention) out.push({ code: 'IL-DATA-002', path: d.path, severity: 'warning',
        message: `Sensitive data "${d.path}" (${d.classification}) has no retention rule.` });
      if (!d.basis) out.push({ code: 'IL-DATA-003', path: d.path, severity: 'blocker',
        message: `Sensitive data "${d.path}" (${d.classification}) declares no lawful basis.` });
      else if (!LAWFUL_BASES.includes(d.basis.toLowerCase())) out.push({ code: 'IL-DATA-005', path: d.path, severity: 'warning',
        message: `Sensitive data "${d.path}" declares an unrecognized lawful basis "${d.basis}".` });

      // Purpose limitation: a sensitive element whose leaf name is an output field, with no
      // never-expose guard covering it, is exposed without a governed guard.
      const leaf = (d.path || '').split(/[.\s]/).pop().toLowerCase();
      const isExposed = leaf && outputNames.has(leaf);
      const guarded = [...neverExposed].some((t) => t.includes(leaf) || (d.path && t.includes(d.path.toLowerCase())));
      if (isExposed && !guarded) out.push({ code: 'IL-DATA-006', path: d.path, severity: 'warning',
        message: `Sensitive data "${d.path}" is returned as an output with no "never expose" guard.` });
    }
  }
  out.sort((a, b) => (a.code + a.path).localeCompare(b.code + b.path));
  return out;
}
