// Graph -> source: regenerate editable ThunderLang from an Intent Graph , the inverse of
// buildIntentGraph. This closes the native round-trip: a tool (SkillsTech Studio, or
// OpenThunder's discovery) can hold a graph, edit it, and emit `.intent` source that
// re-parses to an equivalent graph. Deterministic and pure.
//
// Round-trip contract: node TYPES + TITLES and the typed RELATIONSHIPS between them are
// preserved through graph -> source -> graph, and decisions round-trip by EXECUTION. A few
// compound/derived nodes are best-effort (see docs): Conflict (regenerated from role
// constraints), Journey steps, and Pattern requirement bodies.

export const GRAPH_SOURCE_SCHEMA = 'intent-graph-source-v1';

// Parse a "key value; key value" description back into an object (inverse of the joins
// buildIntentGraph uses for scalar fields packed into a node description).
function parseSegments(desc) {
  const o = {};
  for (const seg of String(desc || '').split(';')) {
    const s = seg.trim();
    if (!s) continue;
    const m = s.match(/^(\w+)\s+(.+)$/);
    if (m) o[m[1]] = m[2].trim();
    else o[s] = true; // a bare flag like "idempotent"
  }
  return o;
}

export function graphToSource(graph) {
  const nodes = graph?.nodes || [];
  const rels = graph?.relationships || [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const byType = (t) => nodes.filter((n) => n.type === t);
  const first = (t) => byType(t)[0] || null;
  const title = (n) => (n && n.title != null ? String(n.title) : '');
  // nodes reached FROM id by relType; nodes pointing TO id by relType.
  const out = (id, type) => rels.filter((r) => r.from === id && r.type === type).map((r) => byId.get(r.to)).filter(Boolean);
  const inTo = (id, type) => rels.filter((r) => r.to === id && r.type === type).map((r) => byId.get(r.from)).filter(Boolean);
  const phaseOut = (id) => rels.filter((r) => r.from === id && r.type === 'blocks' && String(r.to).startsWith('phase.')).map((r) => String(r.to).slice('phase.'.length));

  const L = [];
  const push = (s = '') => L.push(s);

  const mission = first('Mission');
  const mName = title(mission) || 'Unnamed';
  push(`mission ${mName}`);

  // Infer the profiles in play from the node types present (advisory, aids readability).
  const present = new Set(nodes.map((n) => n.type));
  const uses = [];
  if (['Outcome', 'Metric', 'Evidence', 'Persona'].some((t) => present.has(t))) uses.push('product');
  if (['ExperienceContract', 'ExperienceState', 'Pattern'].some((t) => present.has(t))) uses.push('experience');
  if (['Capability', 'SystemContract'].some((t) => present.has(t))) uses.push('system');
  if (['Release', 'OutcomeResult', 'LearningArtifact', 'OutcomeContract'].some((t) => present.has(t))) uses.push('delivery');
  if (['DesignComponent', 'DesignArtifact'].some((t) => present.has(t))) uses.push('design');
  for (const u of uses) push(`use ${u}`);
  push();

  if (mission?.description) { push('goal'); push(`  ${mission.description}`); push(); }

  // Persona / customer.
  for (const p of byType('Persona')) push(`${p.description === 'customer' ? 'customer' : 'persona'} ${title(p)}`);

  for (const e of byType('Evidence')) {
    push(`evidence ${title(e)}`);
    if (e.classification) push(`  classification ${e.classification}`);
    if (e.confidence) push(`  confidence ${e.confidence}`);
    if (e.source) push(`  source ${e.source}`);
  }

  for (const o of byType('Outcome')) {
    push(`outcome ${title(o)}`);
    if (o.description) push(`  "${o.description}"`);
  }

  for (const m of byType('Metric')) {
    push(`metric ${title(m)}`);
    const kv = parseSegments(m.description);
    if (kv.baseline) push(`  baseline ${kv.baseline}`);
    if (kv.target) push(`  target ${kv.target}`);
    if (kv.window) push(`  window ${kv.window}`);
  }

  const reqs = byType('Requirement');
  if (reqs.length) { push('requires'); for (const r of reqs) push(`  ${title(r)}`); }

  // Guarantees (attached form so `verify` round-trips to VerificationRule nodes).
  for (const g of byType('Guarantee')) {
    push(`guarantee ${title(g)}`);
    for (const v of out(g.id, 'verified_by')) push(`  verify ${title(v)}`);
  }

  // Never-rules: attached form when a `verify` exists (so it round-trips to VerificationRule
  // nodes), plain `never` block otherwise.
  const nevers = byType('Never');
  const neverBare = nevers.filter((n) => out(n.id, 'verified_by').length === 0);
  if (neverBare.length) { push('never'); for (const n of neverBare) push(`  ${title(n)}`); }
  for (const n of nevers) {
    const vs = out(n.id, 'verified_by');
    if (!vs.length) continue;
    push(`never ${title(n)}`);
    for (const v of vs) push(`  verify ${title(v)}`);
  }

  // Global invariants , regenerate name + statement + verify so they round-trip to Invariant nodes.
  for (const iv of byType('Invariant')) {
    const nm = (iv.id || '').replace(/^invariant\./, '')
      || String(title(iv)).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'invariant';
    push(`invariant ${nm}`);
    push(`  statement ${title(iv)}`);
    for (const v of out(iv.id, 'verified_by')) push(`  verify ${title(v)}`);
  }

  // Skills the mission requires , regenerate a `requires_skill` block so they round-trip to Skill
  // nodes. (Required-understanding `demonstrates` is prose in the proof/AST, not a structural graph
  // node, so it is intentionally not regenerated here.)
  const skillNodes = byType('Skill');
  if (skillNodes.length) { push('requires_skill'); for (const s of skillNodes) push(`  ${title(s)}`); }

  for (const u of byType('Unknown')) {
    push(`unknown ${title(u)}`);
    if (u.owner) push(`  owner ${u.owner}`);
    // The Unknown -blocks-> phase edge is emitted from `resolve before`, not `blocks`.
    for (const ph of phaseOut(u.id)) push(`  resolve before ${ph}`);
  }
  for (const q of byType('Question')) {
    push(`question ${title(q)}`);
    if (q.owner) push(`  asked_of ${q.owner}`);
    for (const ph of phaseOut(q.id)) push(`  blocks ${ph}`);
  }
  for (const a of byType('Assumption')) {
    push(`assumption ${title(a)}`);
    if (a.confidence) push(`  confidence ${a.confidence}`);
  }

  const approvals = byType('Approval');
  if (approvals.length) { push('approval required from'); for (const a of approvals) push(`  ${title(a)}`); }

  // Role-scoped constraints (`<role> requires`), grouped by role.
  const constraintsByRole = {};
  for (const c of byType('Constraint')) (constraintsByRole[c.owner || 'product'] ||= []).push(title(c));
  for (const [role, stmts] of Object.entries(constraintsByRole)) {
    push(`${role} requires`);
    for (const s of stmts) push(`  ${s}`);
  }

  // Experience contracts + their states.
  for (const exp of byType('ExperienceContract')) {
    push(`experience ${title(exp)}`);
    if (exp.owner) push(`  actor ${exp.owner}`);
    if (exp.description) push(`  goal "${exp.description}"`);
    for (const p of out(exp.id, 'derived_from')) if (p.type === 'Pattern') push(`  follows ${title(p)}`);
    for (const st of out(exp.id, 'requires')) if (st.type === 'ExperienceState') {
      push(`  state ${title(st)}`);
      if (st.status === 'recoverable') push('    recover available');
    }
  }
  for (const p of byType('Pattern')) push(`pattern ${title(p)}`);

  // Style intents , re-emit the block (name, the experience it constrains, a11y target).
  for (const si of byType('StyleIntent')) {
    push(`style_intent ${title(si)}`);
    const edge = rels.find((r) => r.to === si.id && r.type === 'constrained_by');
    const exp = edge ? byId.get(edge.from) : null;
    if (exp && exp.type === 'ExperienceContract') push(`  applies_to ${title(exp)}`);
    const am = String(si.description || '').match(/a11y target (\S+)/);
    if (am) push(`  accessibility_target ${am[1]}`);
  }

  // Lifecycles.
  for (const lc of byType('Lifecycle')) {
    push(`lifecycle ${title(lc)}`);
    const states = out(lc.id, 'requires').filter((s) => s.type === 'LifecycleState');
    for (const s of states) push(`  state ${title(s)}`);
    let ti = 0;
    for (const s of states) {
      for (const r of rels.filter((r) => r.from === s.id && r.type === 'transitions_to')) {
        const to = byId.get(r.to);
        if (!to) continue;
        ti += 1;
        push(`  transition ${r.name || `t${ti}`}`);
        push(`    from ${title(s)}`);
        push(`    to ${title(to)}`);
        if (r.within) push(`    within ${r.within}`);
      }
    }
    const terminals = states.filter((s) => s.status === 'verified').map(title);
    if (terminals.length) push(`  terminal ${terminals.join(', ')}`);
  }

  // Decisions + rules (round-trip by execution).
  for (const d of byType('Decision')) {
    push(`decision ${title(d)}`);
    for (const r of out(d.id, 'requires').filter((n) => n.type === 'Rule')) {
      const m = String(r.description || '').match(/^when (.+?) -> (.*)$/);
      push(`  rule ${title(r)}`);
      if (m) { push(`    when ${m[1]}`); push(`    return ${m[2]}`); }
    }
    const dm = String(d.description || '').match(/default (.+)$/);
    if (dm) { push('  default'); push(`    return ${dm[1]}`); }
    if (d.owner) push(`  owner ${d.owner}`);
  }

  // Commands + failure handlers.
  for (const c of byType('Command')) {
    push(`command ${title(c)}`);
    const kv = parseSegments(c.description);
    if (kv.idempotent) push('  idempotency_key id');
    if (kv.timeout) push(`  timeout ${kv.timeout}`);
    if (kv.retry) push(`  retry ${kv.retry}`);
  }
  for (const h of byType('FailureHandler')) {
    push(`on ${title(h)}`);
    const m = String(h.description || '').match(/compensate (.+)$/);
    if (m) for (const step of m[1].split(',')) push(`  compensate ${step.trim()}`);
  }

  // System profile.
  for (const cap of byType('Capability')) {
    push(`capability ${title(cap)}`);
    if (cap.description) push(`  description "${cap.description}"`);
    // Capability -implemented_by-> member (members are OUT edges, unlike design components).
    for (const m of out(cap.id, 'implemented_by')) push(`  implements ${title(m)}`);
  }
  for (const iface of byType('SystemContract')) {
    push(`interface ${title(iface)}`);
    const kv = parseSegments(iface.description);
    if (kv.provides) push(`  provides ${kv.provides}`);
    if (kv.requires) push(`  requires ${kv.requires}`);
    if (kv.slo) push(`  slo "${kv.slo}"`);
  }

  // Delivery profile.
  for (const r of byType('Release')) {
    push(`release ${title(r)}`);
    const kv = parseSegments(r.description);
    if (kv.v) push(`  version "${kv.v.replace(/^v/, '')}"`);
    if (r.status) push(`  status ${r.status}`);
    if (kv.date) push(`  date ${kv.date}`);
    if (kv.includes) for (const i of kv.includes.split(',')) push(`  includes ${i.trim()}`);
  }
  for (const res of byType('OutcomeResult')) {
    push(`result ${title(res)}`);
    const measured = inTo(res.id, 'resulted_in').find((n) => n.type === 'Outcome');
    if (measured) push(`  measures ${title(measured)}`);
    const kv = parseSegments(res.description);
    if (kv.metric) push(`  metric ${kv.metric}`);
    if (kv.value) push(`  value ${kv.value}`);
    if (kv.baseline) push(`  baseline ${kv.baseline}`);
  }
  for (const l of byType('LearningArtifact')) {
    push(`learning ${title(l)}`);
    if (l.description) push(`  description "${l.description}"`);
    const from = out(l.id, 'derived_from').find((n) => n.type === 'Release');
    if (from) push(`  from ${title(from)}`);
  }

  // Outcome contracts.
  for (const c of byType('OutcomeContract')) {
    push(`outcome_contract ${title(c)}`);
    const o = out(c.id, 'targets').find((n) => n.type === 'Outcome');
    if (o) push(`  outcome ${title(o)}`);
    const met = out(c.id, 'measured_by').find((n) => n.type === 'Metric');
    if (met) push(`  metric ${title(met)}`);
    const kv = parseSegments(c.description);
    if (kv.baseline) push(`  baseline ${kv.baseline}`);
    if (kv.target) push(`  target ${kv.target}`);
    if (/lower is better/.test(c.description || '')) push('  direction lower');
    if (kv.window) push(`  window ${kv.window}`);
    if (c.owner) push(`  owner ${c.owner}`);
  }

  // Design profile.
  for (const comp of byType('DesignComponent')) {
    push(`component ${title(comp)}`);
    const desc = String(comp.description || '');
    const lead = desc.split(';')[0].trim();
    if (lead && !/^(variants|tokens):/.test(lead)) push(`  description "${lead}"`);
    const vm = desc.match(/variants:\s*([^;]+)/);
    if (vm) for (const v of vm[1].split(',')) push(`  variant ${v.trim()}`);
    const tm = desc.match(/tokens:\s*([^;]+)/);
    if (tm) for (const t of tm[1].split(',')) push(`  token ${t.trim()}`);
    for (const impl of inTo(comp.id, 'implemented_by')) push(`  implements ${title(impl)}`);
  }
  for (const art of byType('DesignArtifact')) {
    push(`artifact ${title(art)}`);
    const kv = parseSegments(art.description);
    if (kv.kind) push(`  kind ${kv.kind}`);
    if (art.source) push(`  ref "${art.source}"`);
    for (const c of inTo(art.id, 'represented_by')) if (c.type === 'DesignComponent') push(`  covers ${title(c)}`);
  }

  return L.join('\n') + '\n';
}
