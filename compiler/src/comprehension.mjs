// Comprehension Contracts + the C0..C6 level (intent-comprehension-v1). The measurable backbone
// of the Software Understanding System: given a mission's Intended Truth (its intent), compute
// how well-understood it is, from C0 (Unknown) to C6 (Teachable). Deterministic, no AI, pure
// (browser-safe), so IL is the single evaluator and every product , Atlas overlays it, Fable
// reports it, Skills Tech Talk targets it, OpenThunder lifts it to C5 with runtime evidence ,
// reads ONE number, never a fork.
//
// Honesty boundary: IL computes the intent-side levels (C1..C4) deterministically. C5 (Observed)
// needs runtime evidence (OpenThunder / runtime) and C6 (Teachable) needs a learning path
// (Skills Tech Talk); IL reports what it can determine and names the sibling that owns each gap,
// never inflating a level on evidence it does not have.

export const COMPREHENSION_SCHEMA = 'intent-comprehension-v1';

export const LEVELS = [
  { level: 'C0', name: 'Unknown', means: 'Intent exists with no stated purpose.' },
  { level: 'C1', name: 'Described', means: 'Purpose and a summary exist.' },
  { level: 'C2', name: 'Structured', means: 'Guarantees, rules, states, failures, or constraints exist.' },
  { level: 'C3', name: 'Mapped', means: 'Intent links to implementation (targets, components, APIs, architecture).' },
  { level: 'C4', name: 'Verified', means: 'Every guarantee and never-rule carries a verification.' },
  { level: 'C5', name: 'Observed', means: 'Runtime evidence is connected and discrepancies are monitored.' },
  { level: 'C6', name: 'Teachable', means: 'A source-grounded explanation and learning path exist.' },
  { level: 'C7', name: 'Governed', means: 'Drift is monitored, ownership and risk are on the record, and the understanding stays true as the software evolves.' },
];

const nonEmpty = (a) => Array.isArray(a) && a.length > 0;

/**
 * Evaluate a mission's comprehension level from its AST (its Intended Truth). Optional external
 * signals let a sibling lift the joint level: `observed` (OpenThunder/runtime evidence present)
 * for C5, `learningPath` (Skills Tech Talk) for C6. Pure and deterministic.
 */
export function comprehensionLevel(ast, { observed = false, learningPath = false, governed = false } = {}) {
  const guarantees = ast?.guarantees || [];
  const nevers = ast?.neverRules || [];
  const claims = [...guarantees, ...nevers];
  const allVerified = claims.length > 0 && claims.every((c) => nonEmpty(c.verify));

  // Each signal: is it met, from what evidence, and (if not IL-determinable) who owns it.
  const signals = {
    purpose: {
      // A purpose/summary in any form: a goal, a why, a product title, or the problem statement.
      // (goal/why/title/problem are strings on the AST, not lists.)
      met: Boolean(ast?.goal) || Boolean(ast?.why) || Boolean(ast?.title) || Boolean(ast?.problem),
      evidence: [ast?.goal && 'goal', ast?.why && 'why', ast?.title && 'title', ast?.problem && 'problem'].filter(Boolean),
      owner: 'ThunderLang',
    },
    structure: {
      met: nonEmpty(guarantees) || nonEmpty(nevers) || nonEmpty(ast?.decisions)
        || nonEmpty(ast?.lifecycles) || nonEmpty(ast?.errors) || nonEmpty(ast?.constraints) || nonEmpty(ast?.invariants),
      evidence: [
        nonEmpty(guarantees) && 'guarantees', nonEmpty(nevers) && 'never', nonEmpty(ast?.decisions) && 'decisions',
        nonEmpty(ast?.lifecycles) && 'lifecycles', nonEmpty(ast?.errors) && 'errors', nonEmpty(ast?.constraints) && 'constraints',
        nonEmpty(ast?.invariants) && 'invariants',
      ].filter(Boolean),
      owner: 'ThunderLang',
    },
    mapping: {
      met: nonEmpty(ast?.targets) || nonEmpty(ast?.components) || nonEmpty(ast?.apis)
        || nonEmpty(ast?.services) || Boolean(ast?.implementation) || nonEmpty(ast?.architecture),
      evidence: [
        nonEmpty(ast?.targets) && 'target', nonEmpty(ast?.components) && 'components', nonEmpty(ast?.apis) && 'apis',
        nonEmpty(ast?.services) && 'services', ast?.implementation && 'implementation', nonEmpty(ast?.architecture) && 'architecture',
      ].filter(Boolean),
      owner: 'ThunderLang',
    },
    verification: {
      met: allVerified,
      evidence: allVerified ? [`${claims.length}/${claims.length} claims verified`] : (claims.length ? [`${claims.filter((c) => nonEmpty(c.verify)).length}/${claims.length} claims verified`] : []),
      owner: 'ThunderLang + OpenThunder',
    },
    observation: {
      met: Boolean(observed),
      evidence: observed ? ['runtime evidence provided'] : [],
      owner: 'OpenThunder / runtime', // IL cannot observe production; the level rises when OT attaches evidence
    },
    teachability: {
      met: Boolean(learningPath) || nonEmpty(ast?.notes) || nonEmpty(ast?.examples),
      evidence: [learningPath && 'learning path', nonEmpty(ast?.notes) && 'notes', nonEmpty(ast?.examples) && 'examples'].filter(Boolean),
      owner: 'Skills Tech Talk (learning) + ThunderLang (notes/examples)',
    },
    governance: {
      // Understanding that stays true as the software changes: drift monitored (Guardian) AND
      // ownership + declared risk on the record. IL supplies the record; Guardian supplies drift.
      met: Boolean(governed) && Boolean(ast?.owner) && (nonEmpty(ast?.unknowns) || nonEmpty(ast?.assumptions) || nonEmpty(ast?.conflicts) || nonEmpty(ast?.waivers)),
      evidence: [governed && 'drift-monitored', ast?.owner && 'ownership', (nonEmpty(ast?.unknowns) || nonEmpty(ast?.assumptions) || nonEmpty(ast?.conflicts) || nonEmpty(ast?.waivers)) && 'risk on record'].filter(Boolean),
      owner: 'Intent Guardian (drift) + Workspace/Ledger (risk + approvals)',
    },
  };

  // The ladder is cumulative: the level is the highest Cn where C1..Cn are all met.
  const ladder = ['purpose', 'structure', 'mapping', 'verification', 'observation', 'teachability', 'governance'];
  let n = 0;
  for (const s of ladder) { if (signals[s].met) n += 1; else break; }
  const level = LEVELS[n];

  // The next unmet rungs become explicit gaps with the owner responsible for closing each.
  const missing = [];
  for (let i = n; i < ladder.length; i += 1) {
    const lv = LEVELS[i + 1];
    missing.push({ level: lv.level, name: lv.name, need: lv.means, owner: signals[ladder[i]].owner });
  }

  return {
    schema: COMPREHENSION_SCHEMA,
    mission: ast?.mission || null,
    level: level.level,
    levelName: level.name,
    means: level.means,
    signals,
    missing,
    // The Comprehension Contract checklist , what a critical capability should declare (capability 14).
    contract: {
      why: signals.purpose.met, structure: signals.structure.met, mapping: signals.mapping.met,
      verification: signals.verification.met, observation: signals.observation.met,
      teachability: signals.teachability.met, governance: signals.governance.met,
      ownership: Boolean(ast?.owner), nonGoals: nonEmpty(ast?.nonGoals),
      unknownsDeclared: nonEmpty(ast?.unknowns) || nonEmpty(ast?.assumptions) || nonEmpty(ast?.conflicts),
    },
  };
}

/** Evaluate many missions and summarize the distribution across levels. */
export function comprehensionReport(asts, opts = {}) {
  const missions = (asts || []).map((ast) => comprehensionLevel(ast, opts));
  const byLevel = {};
  for (const lv of LEVELS) byLevel[lv.level] = 0;
  for (const m of missions) byLevel[m.level] += 1;
  return { schema: COMPREHENSION_SCHEMA, count: missions.length, byLevel, missions };
}
