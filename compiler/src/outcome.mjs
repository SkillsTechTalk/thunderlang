// Outcome contracts , an executable commitment about a result. An `outcome_contract` binds
// an outcome to a metric, a baseline, and a target, with a direction (higher/lower is
// better) and a measurement window. Unlike a wish, a contract can be EVALUATED: given the
// actual measured value (from a delivery `result`, or supplied directly), the runtime says
// whether the commitment was met. Deterministic and pure , no AI.

export const OUTCOME_SCHEMA = 'intent-outcome-v1';

// Parse a target/baseline/actual value into a comparable number, keeping the unit for
// display. Handles "60%", "48 percent", "$1,000", "2.5s", plain numbers.
export function parseValue(raw) {
  if (raw == null) return { value: null, unit: null, raw };
  const s = String(raw).trim();
  const m = s.match(/-?\d[\d,]*\.?\d*/);
  if (!m) return { value: null, unit: null, raw: s };
  const value = Number(m[0].replace(/,/g, ''));
  const unit = s.includes('%') || /\bpercent\b/i.test(s) ? '%' : (s.replace(m[0], '').trim() || null);
  return { value, unit, raw: s };
}

/**
 * Evaluate an outcome contract against an actual measured value. Deterministic.
 * "Better" is set by direction: higher (default) means met when actual >= target; lower
 * means met when actual <= target. Returns null-ish `met` when the contract or actual is
 * not numerically comparable (so the caller can flag "cannot evaluate").
 * @returns {{schema, contract, target, actual, baseline, direction, met, improvement, comparable}}
 */
export function evaluateOutcomeContract(contract, actual) {
  const t = parseValue(contract.target);
  const a = parseValue(actual);
  const b = parseValue(contract.baseline);
  const dir = contract.direction === 'lower' ? 'lower' : 'higher';
  const comparable = t.value != null && a.value != null;
  const met = comparable ? (dir === 'lower' ? a.value <= t.value : a.value >= t.value) : null;
  const improvement = (b.value != null && a.value != null) ? Number((a.value - b.value).toFixed(6)) : null;
  return {
    schema: OUTCOME_SCHEMA,
    contract: contract.name,
    target: t.raw, actual: a.raw ?? null, baseline: b.raw ?? null,
    direction: dir, met, improvement, comparable,
  };
}

/**
 * Evaluate every outcome contract in an AST against the delivery `result` that measures the
 * same outcome (or shares the metric). Contracts with no matching result are reported
 * `pending` (comparable=false). This turns "did we achieve the outcome?" into a check.
 */
export function evaluateOutcomes(ast) {
  const results = ast.results || [];
  const evaluations = (ast.outcomeContracts || []).map((c) => {
    // Match a delivery result by the outcome it measures, else by metric name.
    const r = results.find((x) => x.measures && c.outcome && x.measures === c.outcome)
      || results.find((x) => x.metric && c.metric && x.metric === c.metric);
    const evalResult = evaluateOutcomeContract(c, r ? r.value : null);
    return { ...evalResult, matchedResult: r ? r.name : null, status: !evalResult.comparable ? 'pending' : (evalResult.met ? 'met' : 'missed') };
  });
  return {
    schema: OUTCOME_SCHEMA,
    total: evaluations.length,
    met: evaluations.filter((e) => e.status === 'met').length,
    missed: evaluations.filter((e) => e.status === 'missed').length,
    pending: evaluations.filter((e) => e.status === 'pending').length,
    evaluations,
  };
}

/** Authoring-time checks on declared outcome contracts (IL-OC-001..004). */
export function outcomeDiagnostics(ast) {
  const out = [];
  for (const c of ast.outcomeContracts || []) {
    const t = parseValue(c.target);
    const b = parseValue(c.baseline);
    if (!c.target) out.push({ code: 'IL-OC-001', contract: c.name, severity: 'blocker',
      message: `Outcome contract "${c.name}" has no target, so it cannot be evaluated.` });
    if (!c.metric) out.push({ code: 'IL-OC-002', contract: c.name, severity: 'warning',
      message: `Outcome contract "${c.name}" names no metric.` });
    if (!c.window) out.push({ code: 'IL-OC-003', contract: c.name, severity: 'blocker',
      message: `Outcome contract "${c.name}" has no measurement window.` });
    if (t.value != null && b.value != null) {
      const better = c.direction === 'lower' ? t.value < b.value : t.value > b.value;
      if (!better) out.push({ code: 'IL-OC-004', contract: c.name, severity: 'warning',
        message: `Outcome contract "${c.name}" target (${t.raw}) is not better than its baseline (${b.raw}) for a "${c.direction}" goal.` });
    }
    // A target with no guardrail can be "achieved" by regressing something else (Goodhart's law).
    if (c.target && !(c.guardrails || []).length) out.push({ code: 'IL-OC-005', contract: c.name, severity: 'warning',
      message: `Outcome contract "${c.name}" has a target but no guardrails, so the target could be met by regressing something else.` });
    // Never let a metric move read as causation , the attribution must be stated honestly.
    if (c.target && (!c.attribution || c.attribution === 'unknown')) out.push({ code: 'IL-OC-006', contract: c.name, severity: 'info',
      message: `Outcome contract "${c.name}" has no attribution , a metric moving after release is correlation, not proof this feature caused it.` });
  }
  return out;
}
