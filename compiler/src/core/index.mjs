// Thunder Core: the part of Thunder a person can write and the compiler turns into a running program.
// Public API (pure; no file system): parse, check, and generate Python from Thunder Core source.
//
//   compileCore(source, { file }) -> { ok, diagnostics, python, program, info }
//
// The design and the grammar are in docs/core.md.

import { parseCore } from './parser.mjs';
import { checkCore } from './check.mjs';
import { toPython } from './target-python.mjs';
import { formatDiagnostic } from './diagnostics.mjs';

export { parseCore } from './parser.mjs';
export { checkCore } from './check.mjs';
export { toPython } from './target-python.mjs';
export { PYTHON_RUNTIME, RUNTIME_VERSION } from './runtime-python.mjs';
export { CODES, formatDiagnostic } from './diagnostics.mjs';
export { formatCore } from './format.mjs';

export const CORE_VERSION = '0.1.0';

/**
 * Compile one Thunder Core file. `imported` is a list of earlier results whose records, functions, and kept
 * values this file may use (test files see the project's src files); `srcModules` are the Python modules to
 * import them from.
 */
export function compileCore(source, { file = 'main.thunder', imported = [], srcModules = [] } = {}) {
  const seed = imported.length ? { known: imported.flatMap((r) => [...r.program.names.known].filter(([, kind]) => kind !== 'var')), fields: imported.flatMap((r) => [...r.program.names.fields]), records: imported.flatMap((r) => [...r.program.names.records]) } : null;
  const program = parseCore(source, { seed });
  const { diagnostics, info } = checkCore(program, { imported: imported.map((r) => r.info) });
  const ok = diagnostics.length === 0;
  const python = ok ? toPython(program, info, { source: file, imports: srcModules }) : null;
  return { ok, diagnostics, python, program, info, file };
}

export function diagnosticsText(result) {
  return result.diagnostics.map((d) => formatDiagnostic(d, result.file)).join('\n');
}
