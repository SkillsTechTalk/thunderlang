// Governance: waivers (founder Gap 5). A waiver is a GOVERNED EXCEPTION to a blocking
// diagnostic , a named authority signs off, with a reason and (optionally) an expiry and
// a scope, allowing a normally-blocking condition to ship WITH a full audit trail. This is
// how intent stays honest under real deadlines: you never silently drop a blocker, you
// waive it on the record. Deterministic and pure , expiry is evaluated only against a
// caller-supplied `now` (an ISO date string); with no `now`, expiry is not enforced so the
// analysis stays reproducible.

export const GOVERNANCE_SCHEMA = 'intent-governance-v1';

// ISO-date compare without Date (keeps the module pure/deterministic). Both are 'YYYY-MM-DD'
// (or ISO datetime); lexical compare is correct for that format. Returns true if a < b.
const isoBefore = (a, b) => String(a) < String(b);

/**
 * Validate a set of waivers and (optionally) evaluate expiry against `now`.
 * A waiver is well-formed only with a `code`, a `reason`, and an `approvedBy`.
 * @returns {{level,code,message,why,waiver}[]} governance diagnostics (IL-GOV-*)
 */
export function governanceDiagnostics(waivers = [], diagnostics = [], { now = null } = {}) {
  const out = [];
  const codesPresent = new Set(diagnostics.map((d) => d.code).filter(Boolean));
  for (const w of waivers) {
    if (!w.code) out.push({
      level: 'error', code: 'IL-GOV-001', role: 'governance',
      message: `A waiver names no diagnostic code.`,
      why: 'A waiver must say exactly which diagnostic it excuses; a blanket waiver excuses nothing accountably.',
      waiver: w.id,
    });
    if (!w.reason) out.push({
      level: 'error', code: 'IL-GOV-002', role: 'governance',
      message: `Waiver for ${w.code || '(no code)'} has no reason.`,
      why: 'An exception without a stated reason is not governance, it is silence. Record why shipping is acceptable.',
      waiver: w.id,
    });
    if (!w.approvedBy) out.push({
      level: 'error', code: 'IL-GOV-003', role: 'governance',
      message: `Waiver for ${w.code || '(no code)'} names no approver.`,
      why: 'A waiver is an authority accepting risk; without a named approver there is no accountable owner.',
      waiver: w.id,
    });
    if (w.code && !codesPresent.has(w.code)) out.push({
      level: 'warning', code: 'IL-GOV-004', role: 'governance',
      message: `Waiver for ${w.code} does not match any current diagnostic , it may be stale.`,
      why: 'A dangling waiver hides that the condition it excused is already gone; remove it or it silently pre-approves a future regression.',
      waiver: w.id,
    });
    if (now && w.expires && !isoBefore(now, w.expires)) out.push({
      level: 'error', code: 'IL-GOV-005', role: 'governance',
      message: `Waiver for ${w.code} expired on ${w.expires}.`,
      why: 'An expired waiver no longer excuses anything; the diagnostic it covered is blocking again.',
      waiver: w.id,
    });
  }
  return out;
}

/**
 * Apply waivers to a diagnostic set: each blocking diagnostic that matches a VALID, ACTIVE
 * waiver is annotated `waived:true` (with the audit record) and no longer counts as blocking.
 * Non-matching / invalid / expired waivers leave the diagnostic blocking. Deterministic.
 *
 * A waiver matches a diagnostic when codes are equal AND (the waiver has no scope, or the
 * diagnostic's scope/target/mission/waiver field equals the waiver scope).
 *
 * @returns {{diagnostics, waived, blockingAfter, report}}
 */
export function applyWaivers(diagnostics = [], waivers = [], { now = null } = {}) {
  const valid = waivers.filter((w) => w.code && w.reason && w.approvedBy
    && !(now && w.expires && !isoBefore(now, w.expires)));

  const scopeOf = (d) => d.scope || d.target || d.targetPath || d.mission || null;
  const matches = (w, d) => w.code === d.code && (!w.scope || w.scope === scopeOf(d));

  const waived = [];
  const applied = diagnostics.map((d) => {
    const w = valid.find((x) => matches(x, d));
    if (!w) return d;
    const record = { ...d, waived: true, waiver: { id: w.id, approvedBy: w.approvedBy, reason: w.reason, expires: w.expires || null } };
    waived.push(record);
    return record;
  });

  const isBlocking = (d) => !d.waived && (d.severity === 'blocker' || (Array.isArray(d.blocks) && d.blocks.length > 0) || d.level === 'error');
  const blockingAfter = applied.filter(isBlocking);

  return {
    schema: GOVERNANCE_SCHEMA,
    diagnostics: applied,
    waived,
    blockingAfter,
    report: {
      total: diagnostics.length,
      waived: waived.length,
      blockingAfter: blockingAfter.length,
      waivers: waivers.length,
      activeWaivers: valid.length,
    },
  };
}
