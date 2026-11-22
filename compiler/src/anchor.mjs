// Lossless anchoring: every Thunder step points at its exact place in the original file, so a change made
// in Thunder can be written back to exactly that place and nowhere else. This is the foundation for
// Thunder write. Deterministic and browser-safe; it edits text only and never runs code.
import { readCode } from './read.mjs';

export const ANCHOR_SCHEMA = 'thunder-anchor-v1';

const lineStarts = (source) => { const out = [0]; for (let i = 0; i < source.length; i++) if (source[i] === '\n') out.push(i + 1); return out; };

/** [start, end) character range of a span. Offsets when exact; whole lines otherwise. */
export function spanRange(source, span) {
  if (span.exact === 'offset' && span.start != null && span.end != null) return [span.start, span.end];
  const starts = lineStarts(source);
  const a = starts[span.startLine - 1] ?? source.length;
  const nextLine = starts[span.endLine];
  const b = nextLine != null ? nextLine - 1 : source.length;
  return [a, b];
}

/** The exact original text a span covers. */
export function spanText(source, span) {
  const [a, b] = spanRange(source, span);
  return source.slice(a, b);
}

/** Replace exactly the text a span covers. Everything else is untouched, byte for byte. */
export function replaceSpan(source, span, replacement) {
  const [a, b] = spanRange(source, span);
  // Whole-line spans keep the original indentation (it carries meaning in Python and Ruby).
  if (span.exact !== 'offset') {
    const indent = (source.slice(a, b).match(/^[ \t]*/) || [''])[0];
    const lines = String(replacement).replace(/\s+$/, '').split('\n');
    const base = (lines[0].match(/^[ \t]*/) || [''])[0].length;
    replacement = lines.map((l) => (l.trim() ? indent + l.slice(Math.min(base, (l.match(/^[ \t]*/) || [''])[0].length)) : l)).join('\n');
  }
  // The span ends before a statement's own ";"; don't double it.
  if (source[b] === ';') replacement = String(replacement).replace(/;\s*$/, '');
  return source.slice(0, a) + replacement + source.slice(b);
}

/** Find a step by path: [3] is the 4th top-level step, [1, 0] the first step inside the 2nd. */
function stepAt(steps, path) {
  let list = steps, step = null;
  for (const i of path) { step = list?.[i]; if (!step) return null; list = step.children; }
  return step;
}

function flatten(steps, path = [], out = []) {
  steps.forEach((s, i) => { out.push({ path: [...path, i], step: s }); if (s.children) flatten(s.children, [...path, i], out); });
  return out;
}

// Compare code ignoring indentation and a trailing ";".
const norm = (t) => String(t).split('\n').map((l) => l.trim()).join('\n').replace(/;\s*$/, '').trim();

function findFunction(reading, name, line) {
  const fns = reading.items.filter((i) => i.name === name && i.steps);
  if (!fns.length) return null;
  if (line == null) return fns[0];
  return fns.reduce((best, f) => (Math.abs(f.line - line) < Math.abs(best.line - line) ? f : best));
}

/**
 * Write one step back to the original code and verify the result.
 * Returns { ok, source, change, reread, problems }. On any problem, ok is false and `source` is the original.
 */
export function editStep({ source, language, file = '', functionName, line = null, path, replacement }) {
  const problems = [];
  const before = readCode(source, { language, file });
  const fn = findFunction(before, functionName, line);
  if (!fn) return { ok: false, source, problems: [`No function named ${functionName} with steps was found.`] };
  const step = stepAt(fn.steps, path);
  if (!step?.span) return { ok: false, source, problems: [`Step ${path.join('.')} does not exist in ${functionName}.`] };
  const original = spanText(source, step.span);
  const next = replaceSpan(source, step.span, replacement);

  // Verify: re-read, the function is still there, the edited step reads as the new code, others unchanged.
  let after;
  try { after = readCode(next, { language, file }); } catch (e) { return { ok: false, source, problems: [`The changed file could not be read: ${e.message}`] }; }
  const fn2 = findFunction(after, functionName, fn.line);
  if (!fn2) return { ok: false, source, problems: [`${functionName} is no longer found after the change.`] };
  const key = path.join('.');
  // Ancestors contain the edited step and its descendants are replaced with it; every other step must be unchanged.
  const isAncestor = (p) => key.startsWith(`${p}.`);
  const others = flatten(fn.steps).filter((x) => { const k = x.path.join('.'); return k !== key && !k.startsWith(`${key}.`) && !isAncestor(k); });
  const others2 = new Map(flatten(fn2.steps).map((x) => [x.path.join('.'), x.step]));
  for (const o of others) {
    const twin = others2.get(o.path.join('.'));
    if (!twin) { problems.push(`Step ${o.path.join('.')} disappeared.`); continue; }
    // Steps after the edit may have moved; compare their text, not their position.
    if (norm(spanText(source, o.step.span)) !== norm(spanText(next, twin.span))) problems.push(`Step ${o.path.join('.')} changed unexpectedly.`);
  }
  const edited = stepAt(fn2.steps, path);
  if (!edited) problems.push('The edited step is no longer read as a step.');
  else if (norm(spanText(next, edited.span)) !== norm(replacement)) problems.push('The edited step does not match the new code exactly.');
  if (problems.length) return { ok: false, source, problems };
  const starts = lineStarts(source);
  return {
    ok: true, source: next, problems: [],
    change: { startLine: step.span.startLine, endLine: step.span.endLine, before: original, after: replacement, startOffset: spanRange(source, step.span)[0], linesBefore: starts.length },
    reread: { kind: edited.kind, says: edited.says },
  };
}

/** Anchoring report for every function: coverage and whether each step's span matches its statement. */
export function anchorReport(source, { language, file = '' } = {}) {
  const reading = readCode(source, { language, file });
  const functions = reading.items.filter((i) => i.anchor).map((f) => ({
    name: f.name, line: f.line, coverage: f.anchor.coverage, codeLines: f.anchor.codeLines, missing: f.anchor.missing,
    steps: flatten(f.steps).map(({ path, step }) => ({ path: path.join('.'), kind: step.kind, says: step.says, span: step.span })),
  }));
  const total = functions.reduce((n, f) => n + f.codeLines, 0);
  const covered = functions.reduce((n, f) => n + Math.round(f.coverage * f.codeLines), 0);
  return { schema: ANCHOR_SCHEMA, language: reading.language, functions, coverage: total ? Math.round((covered / total) * 1000) / 1000 : 1 };
}
