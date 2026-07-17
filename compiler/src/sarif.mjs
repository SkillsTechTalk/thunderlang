// SARIF 2.1.0 output for `thunder check` , so ThunderLang diagnostics show up natively in the
// surfaces teams already use: GitHub / GitLab code scanning (inline PR annotations + the
// Security tab) and any SARIF-aware IDE. Pure: reports in, one SARIF log object out.
//
// Feed it per-file reports: [{ file, diagnostics: [{ code, level, severity, message, line? }] }].
// `level`/`severity` map to SARIF levels (blocker/error -> error, warning -> warning,
// info -> note). A diagnostic with a `line` gets a precise region; otherwise it lands at the
// file level (valid SARIF; the surface shows it at the top of the file).

import { ALL_DIAGNOSTICS } from './intent-schema.mjs';

export const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';

const META = new Map(ALL_DIAGNOSTICS.map((r) => [r.ruleId, r]));

// SARIF result level for one diagnostic.
export function sarifLevel(diag) {
  if (diag.severity === 'blocker' || diag.level === 'error') return 'error';
  if (diag.level === 'warning') return 'warning';
  return 'note';
}

/**
 * Build a SARIF 2.1.0 log from per-file diagnostic reports.
 * @param {Array<{file: string, diagnostics: Array}>} reports
 * @param {{version?: string, toolName?: string}} [opts]
 */
export function toSarif(reports, opts = {}) {
  const version = opts.version || '0.0.0';
  const toolName = opts.toolName || 'ThunderLang';

  // Rules referenced by results, in first-seen order, with catalog metadata when available.
  const ruleIndex = new Map();
  const rules = [];
  const ruleIndexOf = (code) => {
    if (ruleIndex.has(code)) return ruleIndex.get(code);
    const meta = META.get(code);
    const idx = rules.length;
    rules.push({
      id: code,
      name: code,
      shortDescription: { text: meta ? meta.summary : code },
      defaultConfiguration: { level: meta ? (meta.severity === 'blocker' ? 'error' : meta.severity === 'error' ? 'error' : meta.severity === 'warning' ? 'warning' : 'note') : 'warning' },
      properties: meta ? { area: meta.area, severity: meta.severity, blocks: meta.blocks } : {},
      ...(code.startsWith('IL-') || META.has(code)
        ? { helpUri: `https://thunderlang.dev/docs/diagnostics#${code.toLowerCase()}` }
        : {}),
    });
    ruleIndex.set(code, idx);
    return idx;
  };

  const results = [];
  for (const rep of reports) {
    for (const d of rep.diagnostics || []) {
      if (!d.code) continue;
      const region = Number.isInteger(d.line) && d.line > 0 ? { region: { startLine: d.line } } : {};
      results.push({
        ruleId: d.code,
        ruleIndex: ruleIndexOf(d.code),
        level: sarifLevel(d),
        message: { text: d.message || d.code },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: rep.file },
            ...region,
          },
        }],
      });
    }
  }

  return {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: toolName,
          informationUri: 'https://thunderlang.dev',
          version,
          rules,
        },
      },
      results,
    }],
  };
}
