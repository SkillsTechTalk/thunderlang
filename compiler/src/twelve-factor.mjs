// 12-Factor Agents conformance lens (twelve-factor-v1). Deterministic, browser-safe.
//
// Scores an intent against the 13 principles from humanlayer/12-factor-agents
// (https://github.com/humanlayer/12-factor-agents). Their thesis , "production agents are
// mostly deterministic code with LLM steps sprinkled in" , is IntentLang's thesis, so most
// factors map to structure IL already models (decisions, lifecycles, typed I/O, approvals,
// errors/handlers, events, a pure runtime). This turns "12-factor compliant" into a
// human-owned, verifiable claim instead of a marketing checkbox.
//
// Verdicts: 'satisfied' | 'partial' | 'absent'. Score = (satisfied + 0.5*partial) / 13.
// Each factor cites the IL signal it inspects, the evidence found, and a concrete fix. The
// finding ids (IL-12F-01..13) are in the canonical rule catalog for `intent explain`.

export const TWELVE_FACTOR_SCHEMA = 'twelve-factor-v1';

const VERDICTS = ['satisfied', 'partial', 'absent'];
const WEIGHT = { satisfied: 1, partial: 0.5, absent: 0 };

const len = (x) => (Array.isArray(x) ? x.length : 0);
const typedFields = (fields) => (fields || []).filter((f) => f.type && f.type !== 'Unknown');

// Each factor: id, number, name, and a check(ast) -> { verdict, evidence, fix }.
const FACTORS = [
  {
    id: 'IL-12F-01', num: 1, name: 'Natural language to tool calls',
    check(ast) {
      const ops = len(ast.decisions) + len(ast.commands);
      if (ops) return { verdict: 'satisfied', evidence: `${ops} structured operation(s): ${[...ast.decisions.map((d) => d.name), ...ast.commands.map((c) => c.name)].filter(Boolean).join(', ')}` };
      return { verdict: 'absent', evidence: 'no decisions or commands', fix: 'Model the tool dispatch as a `decision` (rules -> result) or a `command`, so intent becomes a structured, whitelisted call.' };
    },
  },
  {
    id: 'IL-12F-02', num: 2, name: 'Own your prompts',
    check(ast) {
      const g = len(ast.guarantees);
      if (g) return { verdict: 'satisfied', evidence: `behavior is an owned, specified contract (${g} guarantee(s))` };
      if (ast.goal) return { verdict: 'partial', evidence: 'a goal is stated but no guarantees pin the behavior', fix: 'Add `guarantee` statements so the behavior is owned + testable, not a black box.' };
      return { verdict: 'absent', evidence: 'no goal or guarantees', fix: 'Author the intent explicitly (goal + guarantees) rather than delegating behavior to a framework.' };
    },
  },
  {
    id: 'IL-12F-03', num: 3, name: 'Own your context window',
    check(ast) {
      const scoped = len(ast.scope?.include) + len(ast.scope?.exclude);
      if (scoped) return { verdict: 'satisfied', evidence: `context boundary declared (scope: ${len(ast.scope.include)} include / ${len(ast.scope.exclude)} exclude)` };
      if (len(ast.requires)) return { verdict: 'partial', evidence: 'dependencies declared but no explicit scope boundary', fix: 'Declare `scope include/exclude` so the context window is curated, not unbounded.' };
      return { verdict: 'absent', evidence: 'no scope declared', fix: 'Add a `scope` block to bound what belongs in context (IntentLens/Focus narrows it further).' };
    },
  },
  {
    id: 'IL-12F-04', num: 4, name: 'Tools are structured outputs',
    check(ast) {
      const inT = typedFields(ast.inputs).length, outT = typedFields(ast.outputs).length;
      const discriminated = (ast.decisions || []).some((d) => (d.rules || []).some((r) => r.result));
      if ((inT || outT) && (discriminated || len(ast.outputs))) return { verdict: 'satisfied', evidence: `typed I/O (${inT} in / ${outT} out)${discriminated ? ' + discriminated decision results' : ''}` };
      if (len(ast.inputs) || len(ast.outputs)) return { verdict: 'partial', evidence: 'inputs/outputs present but under-typed or no discriminated result', fix: 'Type the inputs/outputs (semantic types) and give decision rules explicit `result`s so outputs are a structured, parseable contract (export via JSON Schema/OpenAPI).' };
      return { verdict: 'absent', evidence: 'no typed inputs/outputs', fix: 'Declare typed `input`/`output` fields; tools are structured outputs, not prose.' };
    },
  },
  {
    id: 'IL-12F-05', num: 5, name: 'Unify execution and business state',
    check(ast) {
      if (len(ast.lifecycles)) return { verdict: 'satisfied', evidence: `single state model (${ast.lifecycles.map((l) => l.name).join(', ')})` };
      if (len(ast.decisions) || len(ast.commands)) return { verdict: 'partial', evidence: 'operations exist but no lifecycle unifies their state', fix: 'Model a `lifecycle` so execution state is inferable from one thread instead of tracked in parallel.' };
      return { verdict: 'absent', evidence: 'no lifecycle / state model', fix: 'Add a `lifecycle` (states + transitions) so execution and business state live in one serializable model.' };
    },
  },
  {
    id: 'IL-12F-06', num: 6, name: 'Launch / pause / resume',
    check(ast) {
      const lc = (ast.lifecycles || [])[0];
      if (lc && len(lc.states) && len(lc.terminals) && len(lc.states) > len(lc.terminals)) return { verdict: 'satisfied', evidence: `resumable lifecycle: ${len(lc.states)} states, ${len(lc.terminals)} terminal , non-terminal (pausable) states exist` };
      if (lc) return { verdict: 'partial', evidence: 'lifecycle present but no clear pausable/terminal structure', fix: 'Give the lifecycle explicit non-terminal (waiting) states + terminals so it can pause and resume.' };
      return { verdict: 'absent', evidence: 'no lifecycle to pause/resume', fix: 'Model a `lifecycle` with waiting states so the agent can pause on long ops and resume from a saved thread.' };
    },
  },
  {
    id: 'IL-12F-07', num: 7, name: 'Contact humans with tool calls',
    check(ast) {
      if (len(ast.approvals) || ast.approval?.reviewed != null) return { verdict: 'satisfied', evidence: `human gate declared (${len(ast.approvals) ? ast.approvals.join(', ') : 'approval block'})` };
      if (ast.owner) return { verdict: 'partial', evidence: `an owner is named (${ast.owner}) but no structured approval/human-input step`, fix: 'Declare an `approval required from <role>` gate so contacting a human is a structured, resumable step.' };
      return { verdict: 'absent', evidence: 'no human-in-the-loop gate', fix: 'Add an `approval required from <role>` (or a human-input decision result) so high-stakes steps pause for a human.' };
    },
  },
  {
    id: 'IL-12F-08', num: 8, name: 'Own your control flow',
    check(ast) {
      const decs = ast.decisions || [];
      if (decs.length && decs.every((d) => d.default != null)) return { verdict: 'satisfied', evidence: `${decs.length} decision(s), all with an explicit default (total, deterministic control flow)` };
      if (decs.length) return { verdict: 'partial', evidence: `${decs.length} decision(s) but some have no default (undefined when no rule matches)`, fix: 'Give every `decision` a `default` so control flow is total , no undefined branch between selection and execution.' };
      return { verdict: 'absent', evidence: 'no decision-based control flow', fix: 'Model branching as a `decision` (FIRST-hit rules + default) so you own the loop, not a framework.' };
    },
  },
  {
    id: 'IL-12F-09', num: 9, name: 'Compact errors into context',
    check(ast) {
      const e = len(ast.errors), h = len(ast.handlers);
      if (e && h) return { verdict: 'satisfied', evidence: `${e} named error(s) + ${h} handler(s) (compensate/notify)` };
      if (e || h) return { verdict: 'partial', evidence: e ? 'errors named but no handlers' : 'handlers exist but no named errors', fix: 'Declare named `error`s AND `handler`s (compensate/notify) so failures are structured + recoverable, with bounded retries.' };
      return { verdict: 'absent', evidence: 'no error model', fix: 'Name the failure modes as `error`s and add `handler`s so errors compact into a recoverable, bounded-retry path.' };
    },
  },
  {
    id: 'IL-12F-10', num: 10, name: 'Small, focused agents',
    check(ast) {
      const steps = len(ast.decisions) + len(ast.commands) + len(ast.handlers) + (ast.lifecycles || []).reduce((n, l) => n + len(l.states), 0);
      if (steps === 0) return { verdict: 'partial', evidence: 'no executable steps to size', fix: 'Once operations exist, keep them within ~10 steps (20 max) so the agent stays focused.' };
      if (steps <= 10) return { verdict: 'satisfied', evidence: `${steps} step(s) (target <= 10)` };
      if (steps <= 20) return { verdict: 'partial', evidence: `${steps} step(s) (over the ~10 target, under the 20 cap)`, fix: 'Split into smaller missions; agents lose focus as step count grows.' };
      return { verdict: 'absent', evidence: `${steps} step(s) (exceeds the ~20 hard cap)`, fix: 'Decompose this mission , at >20 steps the model loses coherence. One responsibility per mission.' };
    },
  },
  {
    id: 'IL-12F-11', num: 11, name: 'Trigger from anywhere',
    check(ast) {
      if (len(ast.events)) return { verdict: 'satisfied', evidence: `${len(ast.events)} event trigger(s) declared` };
      if (len(ast.commands) || len(ast.apis)) return { verdict: 'partial', evidence: 'commands/APIs exist but no declared event triggers', fix: 'Declare `event`s so the mission can be triggered by webhooks/crons/other agents, not one entry point.' };
      return { verdict: 'absent', evidence: 'no trigger surface declared', fix: 'Declare the `event`s/triggers that launch this mission (outer-loop + multi-channel).' };
    },
  },
  {
    id: 'IL-12F-12', num: 12, name: 'Stateless reducer',
    check(ast) {
      if (len(ast.decisions) || len(ast.lifecycles)) return { verdict: 'satisfied', evidence: 'behavior is a pure, replayable function (decisions/lifecycle run on IL’s deterministic runtime)' };
      if (len(ast.guarantees)) return { verdict: 'partial', evidence: 'specified but nothing executable/pure to replay', fix: 'Express the logic as `decision`/`lifecycle` so it is a pure f(state)->next you can replay + test.' };
      return { verdict: 'absent', evidence: 'nothing executable', fix: 'Model the step as a deterministic `decision`/`lifecycle` (pure reducer over the event thread).' };
    },
  },
  {
    id: 'IL-12F-13', num: 13, name: 'Pre-fetch context (appendix)',
    check(ast) {
      if (len(ast.inputs)) return { verdict: 'satisfied', evidence: `${len(ast.inputs)} input(s) declared up front` };
      if (len(ast.decisions)) return { verdict: 'partial', evidence: 'decisions exist but no declared inputs to pre-fetch', fix: 'Declare the `input`s the decision needs so known data is fetched deterministically up front, not via an extra model turn.' };
      return { verdict: 'absent', evidence: 'no declared inputs', fix: 'Declare `input`s so predictable data is present up front (pre-fetch), saving a round trip.' };
    },
  },
];

/**
 * Score an intent AST against the 13 factors. Deterministic; returns a stable report.
 * Pass a parsed AST (from parseIntent). Accepts a mission or any profile intent.
 */
export function twelveFactorReport(ast) {
  const a = ast || {};
  const factors = FACTORS.map((f) => {
    const r = f.check(a) || { verdict: 'absent', evidence: '' };
    const verdict = VERDICTS.includes(r.verdict) ? r.verdict : 'absent';
    return { id: f.id, factor: f.num, name: f.name, verdict, evidence: r.evidence || '', ...(r.fix ? { fix: r.fix } : {}) };
  });
  const raw = factors.reduce((s, f) => s + WEIGHT[f.verdict], 0);
  const score = Math.round((raw / FACTORS.length) * 100);
  const counts = { satisfied: 0, partial: 0, absent: 0 };
  for (const f of factors) counts[f.verdict]++;
  // Advisory diagnostics for anything not fully satisfied (surface in scan / explain).
  const diagnostics = factors
    .filter((f) => f.verdict !== 'satisfied')
    .map((f) => ({ level: f.verdict === 'absent' ? 'warning' : 'info', code: f.id, message: `Factor ${f.factor} (${f.name}): ${f.evidence}.${f.fix ? ' ' + f.fix : ''}` }));
  return {
    schemaVersion: TWELVE_FACTOR_SCHEMA,
    subject: a.mission || a.title || null,
    score,                       // 0..100
    grade: score >= 85 ? 'strong' : score >= 60 ? 'partial' : 'weak',
    counts,
    factors,
    diagnostics,
  };
}

// Compact summary for the proof envelope / compileSource (no per-factor prose).
export function twelveFactorSummary(ast) {
  const r = twelveFactorReport(ast);
  return { schemaVersion: r.schemaVersion, score: r.score, grade: r.grade, counts: r.counts };
}
