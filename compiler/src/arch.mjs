// Architecture rules , the language semantics of the `architecture` block.
//
// ThunderLang OWNS parsing architecture constraints into a structured, versioned form.
// OpenThunder's Architecture Lens checks the actual dependency graph against them
// (INTENT-ARCH-307). This module is the shared, deterministic rule model both use.
//
//   architecture
//     domain must not depend on infrastructure
//     application may depend on domain
//     infrastructure may implement application ports

const RELATIONS = [
  { re: /^(.+?)\s+must\s+not\s+depend\s+on\s+(.+)$/i, relation: 'must-not-depend-on' },
  { re: /^(.+?)\s+must\s+depend\s+on\s+(.+)$/i, relation: 'must-depend-on' },
  { re: /^(.+?)\s+may\s+depend\s+on\s+(.+)$/i, relation: 'may-depend-on' },
  { re: /^(.+?)\s+may\s+implement\s+(.+?)(?:\s+ports)?$/i, relation: 'may-implement' },
];

const layer = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Parse architecture-block lines into structured rules.
 * @param {string[]} lines
 * @returns {{ rules: {from, relation, to, raw}[], unparsed: string[] }}
 */
export function parseArchitectureRules(lines) {
  const rules = [];
  const unparsed = [];
  for (const raw of lines || []) {
    const text = String(raw).trim();
    if (!text) continue;
    let matched = false;
    for (const { re, relation } of RELATIONS) {
      const m = text.match(re);
      if (m) { rules.push({ from: layer(m[1]), relation, to: layer(m[2]), raw: text }); matched = true; break; }
    }
    if (!matched) unparsed.push(text);
  }
  return { rules, unparsed };
}

/**
 * Does a dependency `from -> to` violate a `must-not-depend-on` rule? Returns the
 * violated rule or null. Layer names match by substring so "domain.billing" is caught
 * by a rule about "domain". This is the reusable check OpenThunder calls per edge.
 */
export function violatesArchitecture(rules, from, to) {
  const f = layer(from);
  const t = layer(to);
  for (const r of rules || []) {
    if (r.relation !== 'must-not-depend-on') continue;
    if (f.includes(r.from) && t.includes(r.to)) return r;
  }
  return null;
}
