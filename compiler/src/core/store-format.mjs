// The file a stored list is saved in (Store habits as a list of Habit -> data/habits.json): a JSON list of objects,
// one per record, each field written by its kind so the file says exactly what the value is:
//   whole number -> a JSON integer (text when too large for one)   number -> text ("2.5", exact)
//   money -> text ("1.50", the amount, exact)   text -> text   yes/no -> true/false   date -> "2026-11-27"
//   or nothing -> null
// The same format on every target (the Thunder engine here; runtime-python's load/save mirror it), so a program's
// data means the same whichever language runs it. Browser-safe: reading and writing the file is the caller's job.

import { Dec, Money, PyDate, RecordVal, PyDict, Tuple, ConversionFailed, KindMismatch, show } from './engine-values.mjs';

const kindWords = { whole: 'a whole number', number: 'a number', money: 'money', text: 'text', bool: 'yes or no', date: 'a date' };

function encode(v, t) {
  if (t.k === 'optional') return v === null || v === undefined ? null : encode(v, t.of);
  if (v === null || v === undefined) return null;
  switch (t.k) {
    case 'whole': return typeof v === 'bigint' && v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= -BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : String(v);
    case 'number': return String(v);
    case 'money': return v instanceof Money ? v.toString().replace('$', '') : String(v);
    case 'date': return v instanceof PyDate ? v.iso() : String(v);
    default: return v;
  }
}

function decode(x, t, where, has = 'the file has') {
  if (t.k === 'optional') return x === null ? null : decode(x, t.of, where, has);
  const bad = () => ConversionFailed(`${where} should be ${kindWords[t.k] ?? 'a value'}, but ${has} ${JSON.stringify(x)}.`);
  switch (t.k) {
    case 'whole': if (typeof x === 'number' && Number.isInteger(x)) return BigInt(x); if (typeof x === 'string' && /^-?\d+$/.test(x)) return BigInt(x); throw bad();
    case 'number': { if (typeof x === 'number' && Number.isInteger(x)) return BigInt(x); const d = typeof x === 'string' ? Dec.parse(x) : null; if (!d) throw bad(); return /^-?\d+$/.test(x) ? BigInt(x) : d; }
    case 'money': { const d = typeof x === 'string' ? Dec.parse(x) : typeof x === 'number' ? Dec.parse(String(x)) : null; if (!d) throw bad(); return new Money(d); }
    case 'text': if (typeof x === 'string') return x; throw bad();
    case 'bool': if (typeof x === 'boolean') return x; throw bad();
    case 'date': { const d = typeof x === 'string' ? PyDate.parse(x) : null; if (!d) throw bad(); return d; }
    default: return x;
  }
}

/** A stored list as the text of its file. `cls` is the record kind (its fields carry their kinds). */
export function storeToText(list, cls) {
  const rows = list.map((rec) => Object.fromEntries(cls.fields.map((f) => [f.py, encode(rec.f.get(f.py), f.type ?? { k: 'text' })])));
  return `${JSON.stringify(rows, null, 2)}\n`;
}

/**
 * The records in a store's file. `name` is the file's name as a person sees it (data/habits.json); `make(given)`
 * builds a record from a Map of field values (so the record's Never rules are checked, as in the program).
 */
export function storeFromText(text, cls, name, make) {
  let rows;
  try { rows = JSON.parse(text); } catch (e) { throw ConversionFailed(`${name} is not a list Thunder can read (${e.message}).`); }
  if (!Array.isArray(rows)) throw ConversionFailed(`${name} should hold a list, written [ … ].`);
  return rows.map((row, i) => recordFrom(row, cls, `${name}, item ${i + 1}`, make));
}

/** A record from a JSON object, each field read by its kind; a problem says where it is and which field. */
export function recordFrom(row, cls, where, make, has = 'the file has') {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw ConversionFailed(`${where} should be a record, written { … }.`);
  const given = new Map();
  for (const f of cls.fields) {
    const t = f.type ?? { k: 'text' };
    if (!(f.py in row)) { if (t.k === 'optional') { given.set(f.py, null); continue; } throw ConversionFailed(`${where} has no "${f.py}".`); }
    given.set(f.py, decode(row[f.py], t, `${where}, "${f.py}"`, has));
  }
  return make(given);
}

/** A request's input read by its kind. Path and query parts are text, so yes/no is written yes, no, true, or false. */
export function inputValue(raw, t, where, fromText) {
  const plain = t.k === 'optional' ? t.of : t;
  if (fromText && plain.k === 'bool' && typeof raw === 'string' && /^(yes|no|true|false)$/i.test(raw)) raw = /^(yes|true)$/i.test(raw);
  return decode(raw, t, where, 'the request has');
}

/**
 * A value as JSON data (HTTP answers and requests), written by its kind as in a stored list: whole numbers as
 * numbers (text when too large), numbers and money as exact text, dates as "2026-11-28", records as objects.
 */
export function dataReady(v) {
  if (v === null || v === undefined || typeof v === 'boolean' || typeof v === 'string') return v ?? null;
  if (typeof v === 'bigint') return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= -BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : String(v);
  if (v instanceof Dec) return String(v);
  if (v instanceof Money) return v.toString().replace('$', '');
  if (v instanceof PyDate) return v.iso();
  if (Array.isArray(v)) return v.map(dataReady);
  if (v instanceof Tuple) return v.items.map(dataReady);
  if (v instanceof PyDict) {
    const out = {};
    for (const [k, x] of v.m.values()) { if (typeof k !== 'string') throw KindMismatch(`A JSON object's keys are text, but one is ${show(k)}.`); out[k] = dataReady(x); }
    return out;
  }
  if (v instanceof RecordVal) return Object.fromEntries(v.cls.fields.map((f) => [f.py, dataReady(v.f.get(f.py))]));
  throw KindMismatch(`${show(v)} can't be sent as JSON.`);
}
export const dataJson = (v) => JSON.stringify(dataReady(v));

/** Why a service could not be reached, in words that are the same on every target ({ error: code, name } from fetch). */
export function unreachableReason(out) {
  if (out.name === 'TimeoutError' || out.name === 'AbortError') return 'no answer within 30 seconds';
  if (out.error === 'ECONNREFUSED') return 'nothing is answering there';
  if (out.error === 'ENOTFOUND' || out.error === 'EAI_AGAIN') return 'the address could not be found';
  return out.error;
}

export const storeFile = (s) => `data/${s.py.toLowerCase()}.json`;
export { RecordVal };
