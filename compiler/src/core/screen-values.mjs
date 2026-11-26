// What a Thunder screen means, shared by the Thunder engine (engine-core.mjs) and compiled React (the runtime
// target-react writes is engine-values.mjs, then this file, then a small browser part). One meaning of a screen:
// how a value is shown, what typing into a box does, what a press copies, and what a failed press says.
//
// Browser-safe: no Node APIs. The import line below is dropped when this file is copied into thunder_runtime.mjs,
// where these names are already defined above it.
import { PyDict, RecordVal, show, pyStr, explain, asPyErr, toNumber, toWhole, ConversionFailed } from './engine-values.mjs';

/** A value as a screen shows it: text and whole numbers as they are, anything else the Thunder way (as in "{…}"). */
export function shownText(v, kind) { return kind === 'text' || kind === 'whole' ? pyStr(v) : show(v); }

/**
 * A copy for a press to change: lists, maps, and records are copied all the way down, so a press that fails part
 * way leaves the screen exactly as it was (a press changes everything it changes, or nothing).
 */
export function copyValue(v) {
  if (Array.isArray(v)) return v.map(copyValue);
  if (v instanceof PyDict) { const d = new PyDict(); for (const [id, [k, x]] of v.m) d.m.set(id, [k, copyValue(x)]); return d; }
  if (v instanceof RecordVal) { const r = new RecordVal(v.cls); for (const [k, x] of v.f) r.f.set(k, copyValue(x)); return r; }
  return v;
}

/** The value a number box holds after typing `text` into it (a whole number box keeps whole numbers). */
export function typedNumber(text, kind) {
  if (String(text).trim() === '') throw ConversionFailed('The box is empty, and it needs a number.');
  return kind === 'whole' ? toWhole(String(text)) : toNumber(String(text));
}

/** What the screen says when a press (or typing) fails: the words "If this fails" gives as "error", as a sentence. */
export function problemText(e) { const t = explain(asPyErr(e)); return t.charAt(0).toUpperCase() + t.slice(1); }
