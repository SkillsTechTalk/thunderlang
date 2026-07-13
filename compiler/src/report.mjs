// Repo-wide intent health report (intent-report-v1). `intent check` gates a build pass/fail;
// this AGGREGATES across every .intent file into a triage view a team adopting IntentLang can
// act on: how many missions, diagnostics by severity + area, the most common codes, and
// coverage signals (are guarantees verified? do missions have tests? are outcomes contracted?).
// Pure ESM, zero Node deps , the CLI reads the filesystem and passes sources in.

import { parseIntent } from './parse.mjs';
import { semanticDiagnostics } from './emit.mjs';
import { ALL_DIAGNOSTICS } from './intent-schema.mjs';

export const REPORT_SCHEMA = 'intent-report-v1';

const AREA_OF = new Map(ALL_DIAGNOSTICS.map((r) => [r.ruleId, r.area]));
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);

/**
 * Build an intent health report from source files.
 * @param {Array<{file: string, source: string}>} files
 */
export function buildReport(files) {
  const bySeverity = { blocker: 0, error: 0, warning: 0, info: 0 };
  const byArea = {};
  const byCode = {};
  const perFile = [];
  let missions = 0;
  let guarantees = 0; let guaranteesVerified = 0;
  let neverRules = 0; let neverVerified = 0;
  let missionsWithTests = 0;
  let outcomes = 0; let outcomeContracts = 0;

  for (const { file, source } of files || []) {
    const ast = parseIntent(String(source ?? ''));
    const diags = semanticDiagnostics(ast);
    if (ast.mission) missions += 1;
    guarantees += (ast.guarantees || []).length;
    guaranteesVerified += (ast.guarantees || []).filter((g) => g.verify && g.verify.length).length;
    neverRules += (ast.neverRules || []).length;
    neverVerified += (ast.neverRules || []).filter((n) => n.verify && n.verify.length).length;
    if ((ast.tests || []).length) missionsWithTests += 1;
    outcomes += (ast.outcomes || []).length;
    outcomeContracts += (ast.outcomeContracts || []).length;

    const counts = { blocker: 0, error: 0, warning: 0, info: 0 };
    for (const d of diags) {
      const sev = d.severity === 'blocker' ? 'blocker' : (d.level || 'info');
      if (bySeverity[sev] === undefined) bySeverity[sev] = 0;
      bySeverity[sev] += 1;
      counts[sev] = (counts[sev] || 0) + 1;
      if (d.code) {
        byCode[d.code] = (byCode[d.code] || 0) + 1;
        const area = AREA_OF.get(d.code) || 'other';
        byArea[area] = (byArea[area] || 0) + 1;
      }
    }
    perFile.push({ file, mission: ast.mission || null, ...counts, ok: counts.error === 0 });
  }

  const topCodes = Object.entries(byCode).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10).map(([code, count]) => ({ code, count, area: AREA_OF.get(code) || 'other' }));

  const totalDiagnostics = Object.values(bySeverity).reduce((a, b) => a + b, 0);
  return {
    schema: REPORT_SCHEMA,
    ok: bySeverity.error === 0,
    totals: { files: (files || []).length, missions, diagnostics: totalDiagnostics },
    bySeverity,
    byArea,
    topCodes,
    coverage: {
      guarantees,
      guaranteesVerified,
      guaranteeVerifyRate: pct(guaranteesVerified, guarantees),
      neverRules,
      neverVerified,
      neverVerifyRate: pct(neverVerified, neverRules),
      missionsWithTests,
      testCoverageRate: pct(missionsWithTests, missions),
      outcomes,
      outcomeContracts,
      outcomeContractRate: pct(outcomeContracts, outcomes),
    },
    files: perFile.sort((a, b) => (b.error - a.error) || (b.warning - a.warning) || a.file.localeCompare(b.file)),
  };
}
