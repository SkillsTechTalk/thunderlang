// The file a stored list is saved in (Store habits as a list of Habit -> data/habits.json): a JSON list of objects,
// one per record, each field written by its kind so the file says exactly what the value is:
//   whole number -> a JSON integer (text when too large for one)   number -> text ("2.5", exact)
//   money -> text ("1.50", the amount, exact)   text -> text   yes/no -> true/false   date -> "2026-11-27"
//   or nothing -> null
// The same format on every target (the Thunder engine here; runtime-python's load/save mirror it), so a program's
// data means the same whichever language runs it. Browser-safe: reading and writing the file is the caller's job.

import { Dec, Money, PyDate, RecordVal, ConversionFailed } from './engine-values.mjs';

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

function decode(x, t, where) {
  if (t.k === 'optional') return x === null ? null : decode(x, t.of, where);
  const bad = () => ConversionFailed(`${where} should be ${kindWords[t.k] ?? 'a value'}, but the file has ${JSON.stringify(x)}.`);
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
  return rows.map((row, i) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw ConversionFailed(`${name}, item ${i + 1}, should be a record, written { … }.`);
    const given = new Map();
    for (const f of cls.fields) {
      const t = f.type ?? { k: 'text' };
      if (!(f.py in row)) { if (t.k === 'optional') { given.set(f.py, null); continue; } throw ConversionFailed(`${name}, item ${i + 1}, has no "${f.py}".`); }
      given.set(f.py, decode(row[f.py], t, `${name}, item ${i + 1}, "${f.py}"`));
    }
    return make(given);
  });
}

export const storeFile = (s) => `data/${s.py.toLowerCase()}.json`;
export { RecordVal };
