// Canonical Intent Graph (intent-graph-v1, Section 4). One model all four systems
// consume: nodes (Mission, Evidence, Outcome, Metric, Requirement, Guarantee, Never,
// Unknown, Assumption, Question, Approval, ...) + typed relationships. Deterministic;
// pure (no Node deps): browser-safe. OT/RM/ST read this; they do not re-parse .intent.

import { slug } from './parse.mjs';
import { detectConflicts } from './conflict.mjs';
import { buildLifecycle } from './lifecycle.mjs';
import { analyzeDistributed } from './distributed.mjs';

export const INTENT_GRAPH_SCHEMA = 'intent-graph-v1';

function node(id, type, title, extra = {}) {
  return {
    id, type, title: title || null,
    description: extra.description ?? null,
    status: extra.status ?? 'draft',
    owner: extra.owner ?? null,
    classification: extra.classification ?? null,
    confidence: extra.confidence ?? null,
    source: extra.source ?? null,
    tags: extra.tags ?? [],
    createdTime: null, updatedTime: null, // deterministic; stamped by consumers
  };
}
const rel = (from, type, to, extra) => (extra ? { from, type, to, ...extra } : { from, type, to });

/**
 * Build the canonical Intent Graph from a parsed AST.
 * @param {object} ast (from parseIntent)
 * @returns {{schema, missionId, nodes, relationships, summary}}
 */
export function buildIntentGraph(ast) {
  const nodes = [];
  const relationships = [];
  const mId = `mission.${slug(ast.mission || 'unnamed')}`;
  nodes.push(node(mId, 'Mission', ast.title || ast.mission, {
    description: ast.problem || ast.goal || null,
    owner: ast.owner || null,
    status: ast.approvals && ast.approvals.length ? 'approval-required' : 'draft',
  }));
  // Persona / customer the mission serves (product profile).
  for (const [kind, name] of [['persona', ast.persona], ['customer', ast.customer]]) {
    if (!name) continue;
    const id = `persona.${slug(name)}`;
    nodes.push(node(id, 'Persona', name, { description: kind }));
    relationships.push(rel(mId, 'addresses', id));
  }

  for (const e of ast.evidence || []) {
    const id = `evidence.${slug(e.name || 'evidence')}`;
    nodes.push(node(id, 'Evidence', e.name, { classification: e.classification, confidence: e.confidence, source: e.source }));
    relationships.push(rel(mId, 'supported_by', id));
  }
  for (const o of ast.outcomes || []) {
    const id = `outcome.${slug(o.name || 'outcome')}`;
    nodes.push(node(id, 'Outcome', o.name, { description: o.description }));
    relationships.push(rel(mId, 'targets', id));
  }
  for (const m of ast.metrics || []) {
    const id = `metric.${slug(m.name || 'metric')}`;
    nodes.push(node(id, 'Metric', m.name, { description: [m.baseline && `baseline ${m.baseline}`, m.target && `target ${m.target}`, m.window && `window ${m.window}`].filter(Boolean).join('; ') || null }));
    // Attach a metric to an outcome by name overlap, else to the mission. Use the SAME id
    // computation as the outcome node (with its 'outcome' fallback) so the edge never dangles.
    const ms = slug(m.name || 'metric');
    const o = (ast.outcomes || []).find((x) => { const xs = slug(x.name || 'outcome'); return xs.includes(ms) || ms.includes(xs); });
    relationships.push(rel(o ? `outcome.${slug(o.name || 'outcome')}` : mId, 'measured_by', id));
  }
  (ast.requires || []).forEach((r, i) => {
    const id = `requirement.${slug(ast.mission)}.${i + 1}`;
    nodes.push(node(id, 'Requirement', r, { classification: 'observed' }));
    relationships.push(rel(mId, 'requires', id));
  });
  const emittedVerifs = new Set();
  for (const g of ast.guarantees || []) {
    const id = `guarantee.${g.id || slug(g.statement)}`;
    nodes.push(node(id, 'Guarantee', g.statement, { status: g.verify && g.verify.length ? 'verify-declared' : 'unverified' }));
    relationships.push(rel(mId, 'requires', id));
    for (const v of g.verify || []) {
      const vid = `verification.${slug(v)}`;
      if (!emittedVerifs.has(vid)) { nodes.push(node(vid, 'VerificationRule', v, { status: 'verify-declared' })); emittedVerifs.add(vid); }
      relationships.push(rel(id, 'verified_by', vid));
    }
  }
  for (const n of ast.neverRules || []) {
    const id = `never.${n.id || slug(n.statement)}`;
    nodes.push(node(id, 'Never', n.statement));
    relationships.push(rel(mId, 'constrained_by', id));
  }
  for (const u of ast.unknowns || []) {
    const id = `unknown.${slug(u.name || 'unknown')}`;
    nodes.push(node(id, 'Unknown', u.name, { classification: 'unknown', owner: u.owner, status: 'unresolved' }));
    relationships.push(rel(mId, 'depends_on', id));
    if (u.resolveBefore) relationships.push(rel(id, 'blocks', `phase.${slug(u.resolveBefore)}`));
  }
  for (const q of ast.questions || []) {
    const id = `question.${slug(q.name || 'question')}`;
    nodes.push(node(id, 'Question', q.name, { classification: 'unknown', owner: q.askedOf, status: 'open' }));
    relationships.push(rel(mId, 'depends_on', id)); // container edge (Question -> Mission via depends_on), matching Unknown
    if (q.blocks) relationships.push(rel(id, 'blocks', `phase.${slug(q.blocks)}`));
  }
  for (const a of ast.assumptionDecls || []) {
    const id = `assumption.${slug(a.name || 'assumption')}`;
    nodes.push(node(id, 'Assumption', a.name, { classification: 'assumed', confidence: a.confidence, status: 'unvalidated' }));
    relationships.push(rel(mId, 'depends_on', id));
  }
  const patternIds = new Set((ast.patterns || []).map((p) => `pattern.${slug(p.name || 'pattern')}`));
  for (const exp of ast.experiences || []) {
    const eId = `experience.${slug(exp.name || 'experience')}`;
    nodes.push(node(eId, 'ExperienceContract', exp.name, { description: exp.goal || null, owner: exp.actor || null }));
    relationships.push(rel(mId, 'represented_by', eId));
    // Only link to a pattern the mission actually declares (a `follows` ref may not resolve).
    for (const p of exp.follows || []) { const t = `pattern.${slug(p)}`; if (patternIds.has(t)) relationships.push(rel(eId, 'derived_from', t)); }
    for (const j of exp.journeys || []) {
      const jId = `journey.${slug(exp.name)}.${slug(j.name || 'journey')}`;
      nodes.push(node(jId, 'Journey', j.name, { description: `${(j.steps || []).length} step(s)` }));
      relationships.push(rel(eId, 'represented_by', jId));
    }
    for (const st of exp.states || []) {
      const sId = `experience-state.${slug(exp.name)}.${slug(st.name || 'state')}`;
      nodes.push(node(sId, 'ExperienceState', st.name, { status: st.hasRecovery ? 'recoverable' : 'defined' }));
      relationships.push(rel(eId, 'requires', sId));
    }
  }
  for (const pat of ast.patterns || []) {
    nodes.push(node(`pattern.${slug(pat.name || 'pattern')}`, 'Pattern', pat.name, { description: `${(pat.requires || []).length} requirement(s)` }));
  }
  for (const role of ast.approvals || []) {
    const id = `approval.${slug(ast.mission)}.${slug(role)}`;
    nodes.push(node(id, 'Approval', role, { status: 'required', owner: role }));
    relationships.push(rel(mId, 'approved_by', id));
  }

  (ast.roleConstraints || []).forEach((rc, i) => {
    const id = `constraint.${slug(rc.role)}.${i + 1}`;
    nodes.push(node(id, 'Constraint', rc.statement, { owner: rc.role }));
    relationships.push(rel(mId, 'requires', id));
  });
  // Conflict `between`/`resolveBy` entries are informational references that may or may not
  // name an emitted node; only edge to targets that actually exist so nothing dangles.
  const existingIds = new Set(nodes.map((n) => n.id));
  detectConflicts(ast).forEach((c, i) => {
    const id = `conflict.${slug(c.name || String(i + 1))}`;
    nodes.push(node(id, 'Conflict', c.name, { status: c.status, description: c.type }));
    for (const b of c.between || []) {
      const target = `constraint.${slug(b)}`;
      if (existingIds.has(target)) relationships.push(rel(id, 'contradicts', target));
    }
    if (c.before) relationships.push(rel(id, 'blocks', `phase.${slug(c.before)}`));
    for (const r of c.resolveBy || []) {
      const target = `approval.${slug(ast.mission)}.${slug(r)}`;
      if (existingIds.has(target)) relationships.push(rel(id, 'approved_by', target));
    }
  });

  for (const raw of ast.lifecycles || []) {
    const ir = buildLifecycle(raw);
    const lId = `lifecycle.${slug(ir.name || 'lifecycle')}`;
    nodes.push(node(lId, 'Lifecycle', ir.name, { description: `${ir.states.length} states, ${ir.transitions.length} transitions`, status: ir.initial ? 'defined' : 'draft' }));
    relationships.push(rel(mId, 'represented_by', lId));
    const stateSlugs = new Set();
    for (const s of ir.states) {
      const ss = slug(s);
      stateSlugs.add(ss);
      const sId = `lifecycle-state.${slug(ir.name)}.${ss}`;
      nodes.push(node(sId, 'LifecycleState', s, { status: ir.terminals.includes(s) ? 'verified' : 'defined' }));
      relationships.push(rel(lId, 'requires', sId));
    }
    for (const t of ir.transitions) {
      // Transition metadata (name / within) rides ON the transitions_to edge, not the state node.
      // Only emit for transitions between DECLARED states, so a transition that references an
      // undefined state (flagged separately as IL-LIFE-001) never leaves a dangling edge.
      if (t.from && t.to && stateSlugs.has(slug(t.from)) && stateSlugs.has(slug(t.to))) relationships.push(rel(
        `lifecycle-state.${slug(ir.name)}.${slug(t.from)}`, 'transitions_to', `lifecycle-state.${slug(ir.name)}.${slug(t.to)}`,
        (t.name || t.within) ? { name: t.name || null, within: t.within || null } : undefined,
      ));
    }
  }

  for (const dec of ast.decisions || []) {
    const dId = `decision.${slug(dec.name || 'decision')}`;
    nodes.push(node(dId, 'Decision', dec.name, { owner: dec.owner || null, description: `${(dec.rules || []).length} rules${dec.default ? ', default ' + dec.default : ''}` }));
    relationships.push(rel(mId, 'requires', dId));
    for (const r of dec.rules || []) {
      const rId = `rule.${slug(dec.name)}.${slug(r.name || 'rule')}`;
      nodes.push(node(rId, 'Rule', r.name, { description: r.when ? `when ${r.when} -> ${r.result}` : null }));
      relationships.push(rel(dId, 'requires', rId));
    }
  }
  for (const c of ast.commands || []) {
    const id = `command.${slug(c.name || 'command')}`;
    nodes.push(node(id, 'Command', c.name, { description: [c.idempotencyKey && 'idempotent', c.timeout && `timeout ${c.timeout}`, c.retry && `retry ${c.retry}`].filter(Boolean).join('; ') || null }));
    relationships.push(rel(mId, 'requires', id));
  }
  for (const h of ast.handlers || []) {
    const id = `handler.${slug(h.trigger || 'handler')}`;
    nodes.push(node(id, 'FailureHandler', h.trigger, { description: (h.compensate || []).length ? `compensate ${h.compensate.join(', ')}` : null }));
    relationships.push(rel(mId, 'constrained_by', id));
  }

  // ── System profile: capabilities + system contracts (interfaces) ──
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const cap of ast.capabilities || []) {
    const id = `capability.${slug(cap.name || 'capability')}`;
    nodes.push(node(id, 'Capability', cap.name, { description: cap.description || null }));
    relationships.push(rel(mId, 'requires', id));
    // Link each declared member to the capability if it resolves to an emitted node.
    for (const m of cap.implements || []) {
      const target = [`command.${slug(m)}`, `decision.${slug(m)}`, `mission.${slug(m)}`].find((cand) => nodeIds.has(cand));
      if (target) relationships.push(rel(id, 'implemented_by', target));
    }
  }
  for (const iface of ast.interfaces || []) {
    const id = `system-contract.${slug(iface.name || 'interface')}`;
    const desc = [iface.provides.length && `provides ${iface.provides.join(', ')}`, iface.requires.length && `requires ${iface.requires.join(', ')}`, iface.slo && `slo ${iface.slo}`].filter(Boolean).join('; ') || null;
    nodes.push(node(id, 'SystemContract', iface.name, { description: desc }));
    relationships.push(rel(mId, 'requires', id));
  }

  // ── Design profile: design-system components + artifacts (mockups) ──
  // Resolve a design reference to a Pattern / ExperienceContract / ExperienceState node.
  const allIds = nodes.map((n) => n.id);
  const resolveDesignTarget = (name) => {
    const s = slug(name);
    return [`pattern.${s}`, `experience.${s}`].find((c) => nodeIds.has(c))
      || allIds.find((id) => id.startsWith('experience-state.') && id.endsWith(`.${s}`))
      || null;
  };
  for (const comp of ast.components || []) {
    const id = `design-component.${slug(comp.name || 'component')}`;
    const desc = [comp.description, comp.variants.length && `variants: ${comp.variants.join(', ')}`, comp.tokens.length && `tokens: ${comp.tokens.join(', ')}`].filter(Boolean).join('; ') || null;
    nodes.push(node(id, 'DesignComponent', comp.name, { description: desc }));
    relationships.push(rel(mId, 'requires', id));
    // Each experience state / pattern the component implements: <target> -implemented_by-> component.
    for (const m of comp.implements || []) {
      const target = resolveDesignTarget(m);
      if (target) relationships.push(rel(target, 'implemented_by', id));
    }
  }
  const componentNames = new Set((ast.components || []).map((c) => slug(c.name || '')));
  for (const art of ast.artifacts || []) {
    const id = `design-artifact.${slug(art.name || 'artifact')}`;
    nodes.push(node(id, 'DesignArtifact', art.name, { source: art.ref || null, description: [art.kind && `kind ${art.kind}`, art.covers.length && `covers ${art.covers.join(', ')}`].filter(Boolean).join('; ') || null }));
    relationships.push(rel(mId, 'represented_by', id));
    // A covered component is represented_by this artifact (the mockup depicts it).
    for (const c of art.covers || []) {
      if (componentNames.has(slug(c))) relationships.push(rel(`design-component.${slug(c)}`, 'represented_by', id));
    }
  }

  // ── Delivery profile: releases, outcome results, learnings ──
  for (const r of ast.releases || []) {
    const id = `release.${slug(r.name || 'release')}`;
    nodes.push(node(id, 'Release', r.name, { status: r.status || 'planned', description: [r.version && `v${r.version}`, r.date && `date ${r.date}`, r.includes.length && `includes ${r.includes.join(', ')}`].filter(Boolean).join('; ') || null }));
    relationships.push(rel(mId, 'released_in', id));
  }
  for (const res of ast.results || []) {
    const id = `outcome-result.${slug(res.name || 'result')}`;
    nodes.push(node(id, 'OutcomeResult', res.name, { description: [res.metric && `metric ${res.metric}`, res.value && `value ${res.value}`, res.baseline && `baseline ${res.baseline}`].filter(Boolean).join('; ') || null }));
    // A result resolves the outcome it measures (Outcome -resulted_in-> OutcomeResult).
    const outId = res.measures ? `outcome.${slug(res.measures)}` : null;
    relationships.push(rel(nodeIds.has(outId) ? outId : mId, 'resulted_in', id));
  }
  const releaseNames = new Set((ast.releases || []).map((r) => slug(r.name || '')));
  for (const l of ast.learnings || []) {
    const id = `learning.${slug(l.name || 'learning')}`;
    nodes.push(node(id, 'LearningArtifact', l.name, { description: l.description || null }));
    // A learning is derived from its source release (if resolvable) or the mission.
    const fromRelease = l.from && releaseNames.has(slug(l.from));
    relationships.push(rel(id, 'derived_from', fromRelease ? `release.${slug(l.from)}` : mId));
  }

  // ── Outcome contracts: executable commitments binding an outcome to a target ──
  for (const c of ast.outcomeContracts || []) {
    const id = `outcome-contract.${slug(c.name || 'contract')}`;
    const desc = [c.baseline && `baseline ${c.baseline}`, c.target && `target ${c.target}`, `${c.direction || 'higher'} is better`, c.window && `window ${c.window}`].filter(Boolean).join('; ') || null;
    nodes.push(node(id, 'OutcomeContract', c.name, { owner: c.owner || null, description: desc }));
    relationships.push(rel(mId, 'requires', id));
    // The contract targets the outcome it governs and is measured by its metric (when they resolve).
    const outId = c.outcome ? `outcome.${slug(c.outcome)}` : null;
    if (nodeIds.has(outId)) relationships.push(rel(id, 'targets', outId));
    const metId = c.metric ? `metric.${slug(c.metric)}` : null;
    if (nodeIds.has(metId)) relationships.push(rel(id, 'measured_by', metId));
  }

  const byType = {};
  for (const n of nodes) byType[n.type] = (byType[n.type] || 0) + 1;
  return {
    schema: INTENT_GRAPH_SCHEMA,
    missionId: mId,
    nodes,
    relationships,
    summary: {
      nodes: nodes.length,
      relationships: relationships.length,
      byType,
      unresolved: (ast.unknowns || []).length + (ast.questions || []).length,
      conflicts: detectConflicts(ast).filter((c) => c.status === 'unresolved').length,
      approvalsRequired: (ast.approvals || []).length,
    },
  };
}
