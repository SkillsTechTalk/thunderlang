// Decisions, rules, process semantics (Gap 4). IL owns rule semantics + DETERMINISTIC
// conflict/coverage detection on the DECLARED decision. OpenThunder verifies the
// decision's IMPLEMENTATION (rule coverage, decision impl verification, explanation
// verification). Pure (no Node deps): browser-safe.

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Static analysis of a decision table. Returns findings (deterministic).
 * - missing default (what happens when no rule matches?)
 * - conflicting rules (same condition, different result)
 * - redundant rules (same condition, same result)
 * - no rules
 */
export function analyzeDecision(dec) {
  const findings = [];
  const rules = dec.rules || [];

  if (rules.length === 0) {
    findings.push({ code: 'IL-DEC-004', message: `Decision "${dec.name}" declares no rules.` });
  } else if (dec.default == null) {
    findings.push({ code: 'IL-DEC-001', message: `Decision "${dec.name}" has rules but no default (undefined when no rule matches).` });
  }

  // Pairwise: same normalized condition -> conflict (different result) or redundant (same).
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      if (rules[i].when && rules[j].when && norm(rules[i].when) === norm(rules[j].when)) {
        if (norm(rules[i].result) !== norm(rules[j].result)) {
          findings.push({ code: 'IL-DEC-002', message: `Decision "${dec.name}": rules "${rules[i].name}" and "${rules[j].name}" have the same condition but different results.` });
        } else {
          findings.push({ code: 'IL-DEC-003', message: `Decision "${dec.name}": rules "${rules[i].name}" and "${rules[j].name}" are redundant (same condition and result).` });
        }
      }
    }
  }
  return findings.sort((a, b) => `${a.code} ${a.message}`.localeCompare(`${b.code} ${b.message}`));
}
