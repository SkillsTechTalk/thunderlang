// Canonical Intent Graph (intent-graph-v1, Section 4). One model all four systems
// consume: nodes (Mission, Evidence, Outcome, Metric, Requirement, Guarantee, Never,
// Unknown, Assumption, Question, Approval, ...) + typed relationships. Deterministic;
// pure (no Node deps): browser-safe. OT/RM/ST read this; they do not re-parse .intent.

import { slug } from './parse.mjs';

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
const rel = (from, type, to) => ({ from, type, to });

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
    // Attach a metric to an outcome by name overlap, else to the mission.
    const o = (ast.outcomes || []).find((x) => slug(x.name).includes(slug(m.name)) || slug(m.name).includes(slug(x.name)));
    relationships.push(rel(o ? `outcome.${slug(o.name)}` : mId, 'measured_by', id));
  }
  (ast.requires || []).forEach((r, i) => {
    const id = `requirement.${slug(ast.mission)}.${i + 1}`;
    nodes.push(node(id, 'Requirement', r, { classification: 'observed' }));
    relationships.push(rel(mId, 'requires', id));
  });
  for (const g of ast.guarantees || []) {
    const id = `guarantee.${g.id || slug(g.statement)}`;
    nodes.push(node(id, 'Guarantee', g.statement, { status: g.verify && g.verify.length ? 'verify-declared' : 'unverified' }));
    relationships.push(rel(mId, 'requires', id));
    for (const v of g.verify || []) relationships.push(rel(id, 'verified_by', `verification.${slug(v)}`));
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
    if (q.blocks) relationships.push(rel(id, 'blocks', `phase.${slug(q.blocks)}`));
  }
  for (const a of ast.assumptionDecls || []) {
    const id = `assumption.${slug(a.name || 'assumption')}`;
    nodes.push(node(id, 'Assumption', a.name, { classification: 'assumed', confidence: a.confidence, status: 'unvalidated' }));
    relationships.push(rel(mId, 'depends_on', id));
  }
  for (const exp of ast.experiences || []) {
    const eId = `experience.${slug(exp.name || 'experience')}`;
    nodes.push(node(eId, 'ExperienceContract', exp.name, { description: exp.goal || null, owner: exp.actor || null }));
    relationships.push(rel(mId, 'represented_by', eId));
    for (const p of exp.follows || []) relationships.push(rel(eId, 'derived_from', `pattern.${slug(p)}`));
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
      approvalsRequired: (ast.approvals || []).length,
    },
  };
}
