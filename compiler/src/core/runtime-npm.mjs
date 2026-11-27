// npm packages from compiled TypeScript (Use "<package>" from npm as <name>): the boundary between Thunder values
// and JavaScript values. Appended to thunder_runtime.mjs (runtime-typescript.mjs drops the import line below), so
// the names it uses are the runtime's own.
//
// Thunder -> JavaScript: whole numbers and decimals become JavaScript numbers (a whole number too large for one
// stays a BigInt), money becomes its amount as a number, text stays text, yes/no stays a boolean, nothing is null,
// lists become arrays, maps with text keys become plain objects (others a Map), records become plain objects keyed
// by their field names, and dates become Date at local midnight. A value that came from the library goes back
// unchanged.
// JavaScript -> Thunder: a number becomes the exact decimal it is written as (0.1 stays 0.1, never
// 0.1000000000000000055…), and a whole number a whole number; text, booleans, null and undefined (nothing), arrays
// (lists), and plain objects (maps with text keys) are turned into Thunder values; anything else (a Date, a class
// instance, a function) stays a library value that can be handed back to the library.
import { ThunderErr, ConversionFailed, Dec, Money, PyDate, Tuple, PyDict, RecordVal, NOT_GIVEN } from './engine-values.mjs';

const isPlainObject = (v) => v !== null && typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/** A Thunder value as a JavaScript value, for a call into an npm package. */
export function toJs(v) {
  if (v === null || v === undefined || v === NOT_GIVEN) return null;
  if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : v;
  if (v instanceof Dec) return Number(v.toString());
  if (v instanceof Money) return Number(v.amount.toString());
  if (v instanceof PyDate) return new Date(v.y, v.m - 1, v.d);
  if (Array.isArray(v)) return v.map(toJs);
  if (v instanceof Tuple) return v.items.map(toJs);
  if (v instanceof PyDict) {
    const keys = v.keys();
    if (keys.every((k) => typeof k === 'string')) return Object.fromEntries(keys.map((k) => [k, toJs(v.get(k))]));
    return new Map(keys.map((k) => [toJs(k), toJs(v.get(k))]));
  }
  if (v instanceof RecordVal) return Object.fromEntries(v.cls.fields.map((f) => [f.py, toJs(v.f.get(f.py))]));
  return v;
}

/** A JavaScript value from an npm package, as a Thunder value. */
export function fromJs(v, what) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw ConversionFailed(`${what} gave back ${v}, which is not a number Thunder can use.`);
    return Number.isInteger(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER ? BigInt(v) : Dec.parse(String(v));
  }
  if (typeof v === 'bigint' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map((x) => fromJs(x, what));
  if (v instanceof Map) { const d = new PyDict(); for (const [k, x] of v) d.set(fromJs(k, what), fromJs(x, what)); return d; }
  if (isPlainObject(v)) { const d = new PyDict(); for (const [k, x] of Object.entries(v)) d.set(k, fromJs(x, what)); return d; }
  if (typeof v.then === 'function') throw new ThunderErr('TC508', `${what} works asynchronously (it gave back a promise), and Thunder Core runs one step after another. Use a function of the package that gives its answer straight away.`, 'LibraryError');
  return v;
}

/** The package as Thunder sees it: its named exports, then its default export's members (CommonJS packages). */
export function library(ns, name) {
  const dflt = ns && ns.default;
  // "default" is the package itself when it exports one thing (module.exports = function …): Use "is-odd" from npm
  // as odd, then odd.default(3).
  return { name, get(attr) { if (attr === 'default') return dflt ?? undefined; if (ns && attr in ns) return ns[attr]; if (dflt != null && attr in Object(dflt)) return dflt[attr]; return undefined; }, bind(attr) { return attr === 'default' || (ns && attr in ns) ? ns : dflt; } };
}

const describeJsError = (e) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

/** <library>.<attr>(<args>): call the package with JavaScript values and take its answer as a Thunder value. */
export function callLibrary(lib, attr, args) {
  const what = `${lib.name}.${attr}`;
  const fn = lib.get(attr);
  if (typeof fn !== 'function') throw new ThunderErr('TC508', fn === undefined ? `The npm package "${lib.name}" has nothing named "${attr}".` : `"${what}" is not something to call.`, 'LibraryError');
  let out;
  try { out = fn.apply(lib.bind(attr), args.map(toJs)); } catch (e) {
    if (e && e.thunder) throw e;
    throw new ThunderErr('TC508', `JavaScript code used by this line failed: ${describeJsError(e)}`, 'LibraryError');
  }
  return fromJs(out, what);
}

/** <library>.<attr> without a call: a value the package exports. */
export function getLibrary(lib, attr) {
  const v = lib.get(attr);
  if (v === undefined) throw new ThunderErr('TC508', `The npm package "${lib.name}" has nothing named "${attr}".`, 'LibraryError');
  return fromJs(v, `${lib.name}.${attr}`);
}
