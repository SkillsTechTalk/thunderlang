// Distributed + failure semantics (Gap 3). IL owns the failure-policy types and the
// STATIC declaration checks (a retry needs idempotency, at-least-once needs dedup, a
// permanent-failure handler needs compensation). OpenThunder verifies these hold in the
// IMPLEMENTATION (retry safety, duplicate handling, failure simulation). Pure; deterministic.

const has = (arr, re) => (arr || []).some((x) => re.test(String(x)));

/**
 * Static analysis of distributed/failure declarations. Returns findings (deterministic).
 * These are declaration-level guarantees; OT proves the implementation honors them.
 */
export function analyzeDistributed(ast) {
  const findings = [];
  const handlers = ast.handlers || [];

  for (const c of ast.commands || []) {
    // Retry without idempotency: a retried command that is not idempotent can duplicate work.
    if (c.retry && !c.idempotencyKey) {
      findings.push({ code: 'IL-DIST-001', target: c.name, message: `Command "${c.name}" declares retry but no idempotency_key.` });
    }
    // A retried / remote command with no timeout can hang forever.
    if (c.retry && !c.timeout) {
      findings.push({ code: 'IL-DIST-002', target: c.name, message: `Command "${c.name}" declares retry but no timeout.` });
    }
  }

  for (const e of ast.events || []) {
    // At-least-once delivery duplicates; there must be a duplicate handler for the event.
    if (e.delivery && /at_least_once/i.test(e.delivery)) {
      const dedup = handlers.some((h) => /duplicate/i.test(h.trigger || '') && new RegExp(e.name, 'i').test(h.trigger || ''));
      if (!dedup) findings.push({ code: 'IL-DIST-003', target: e.name, message: `Event "${e.name}" is at_least_once but has no "on duplicate ${e.name}" handler.` });
    }
  }

  for (const h of handlers) {
    // A permanent-failure handler that does not compensate leaves partial state behind.
    if (/permanent_failure|permanent failure/i.test(h.trigger || '') && (h.compensate || []).length === 0) {
      findings.push({ code: 'IL-DIST-004', target: h.trigger, message: 'A permanent_failure handler declares no compensation.' });
    }
    // A duplicate handler that references an event that is not declared.
    const m = /duplicate\s+(\w+)/i.exec(h.trigger || '');
    if (m && !(ast.events || []).some((e) => e.name === m[1])) {
      findings.push({ code: 'IL-DIST-005', target: h.trigger, message: `Duplicate handler references undeclared event "${m[1]}".` });
    }
  }

  return findings.sort((a, b) => `${a.code} ${a.target}`.localeCompare(`${b.code} ${b.target}`));
}
