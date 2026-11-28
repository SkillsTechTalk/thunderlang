// The values of the Thunder engine (src/core/engine.mjs) and the rules they follow.
//
// The Thunder engine runs Thunder Core without Python. Its behavior is defined by the Python target: the code
// target-python.mjs writes and thunder_runtime.py (runtime-python.mjs). Every value here behaves the way the
// generated Python behaves, including what an error says, so the two engines give the same output for the same
// program (compiler/test/core-engine.test.mjs runs every Core test program on both and compares).
//
// Values:   whole number -> BigInt          decimal number -> Dec (exact, like Python's Decimal)
//           money -> Money                  text -> string      yes/no -> boolean      nothing -> null
//           list -> Array (a pair from a map is a Tuple)          map -> PyDict
//           record -> RecordVal             date -> PyDate

// ── Errors ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** An error the Python runtime raises as a ThunderError subclass (code TC5xx, message in words). */
export class ThunderErr extends Error {
  constructor(code, message, pyType = 'ThunderError') { super(message); this.code = code; this.pyType = pyType; this.thunder = true; }
}
export const Stop = (m) => new ThunderErr('TC507', m, 'Stop');
export const RuleBroken = (m) => new ThunderErr('TC504', m, 'RuleBroken');
export const ExpectationFailed = (m) => new ThunderErr('TC505', m, 'ExpectationFailed');
export const KindMismatch = (m) => new ThunderErr('TC506', m, 'TypeError'); // also a TypeError
export const ConversionFailed = (m) => new ThunderErr('TC509', m, 'ValueError');
export const MissingValue = (m) => new ThunderErr('TC503', m, 'LookupError');
export const DividedByZero = (m) => new ThunderErr('TC501', m, 'ZeroDivisionError');
export const CallFailed = (m) => new ThunderErr('TC510', m, 'CallFailed'); // a call to another service (HTTP)

/** An error Python itself raises (TypeError, KeyError, ...), with Python's own message. */
export class PyErr extends Error {
  constructor(pyType, message, args) { super(message); this.pyType = pyType; this.args = args ?? [message]; }
}
export const TypeErr = (m) => new PyErr('TypeError', m);

/** explain(error) in thunder_runtime.py: the error as a sentence. */
export function explain(e) {
  if (e.thunder) return e.message;
  const t = e.pyType;
  if (t === 'ZeroDivisionError' || t === 'DivisionByZero') return 'You divided by zero.';
  if (t === 'InvalidOperation') return 'This calculation has no answer (for example, zero divided by zero).';
  if (t === 'KeyError') return `There is no entry for ${show(e.args[0] ?? null)}.`;
  if ((t === 'TypeError' || t === 'AttributeError') && e.message.includes('NoneType')) return 'A value was nothing where a value was needed.';
  if (t === 'TypeError') return `Values of different kinds were mixed (${e.message}).`;
  if (t === 'RecursionError') return 'A function called itself too many times.';
  return `${t}: ${e.message}`;
}

/** _code(error) in thunder_runtime.py. */
export function codeOf(e) {
  if (e.thunder) return e.code;
  const t = e.pyType;
  if (t === 'ZeroDivisionError' || t === 'DivisionByZero') return 'TC501';
  if ((t === 'TypeError' || t === 'AttributeError') && e.message.includes('NoneType')) return 'TC502';
  if (t === 'KeyError') return 'TC503';
  if (t === 'TypeError') return 'TC506';
  return 'TC508';
}

/** A JS error that is not a Thunder or Python error (a bug in the engine, or the JS stack running out). */
export function asPyErr(e) {
  if (e instanceof ThunderErr || e instanceof PyErr) return e;
  if (e instanceof RangeError && /call stack/i.test(e.message)) return new PyErr('RecursionError', 'maximum recursion depth exceeded');
  throw e;
}

// ── Exact decimals: Python's Decimal with its default context (28 digits, half-even when a result is too long) ──

const PREC = 28;
const TEN = 10n;
const pow10 = (n) => TEN ** BigInt(n);
const ndigits = (c) => (c === 0n ? 1 : c.toString().length);

export class Dec {
  constructor(s, c, e) { this.s = s; this.c = c; this.e = e; } // sign (0 or 1), coefficient >= 0, exponent
  static of(x) { return x instanceof Dec ? x : typeof x === 'bigint' ? Dec.int(x) : typeof x === 'boolean' ? Dec.int(x ? 1n : 0n) : x; }
  static int(n) { return new Dec(n < 0n ? 1 : 0, n < 0n ? -n : n, 0); }
  /** Decimal("text"): exact. Returns null when the text is not a number. */
  static parse(text) {
    const m = String(text).trim().replace(/_/g, '').match(/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
    if (!m || (!m[2] && !m[3])) return null;
    const frac = m[3] ?? '';
    return new Dec(m[1] === '-' ? 1 : 0, BigInt((m[2] || '') + frac || '0'), (m[4] ? Number(m[4]) : 0) - frac.length);
  }
  isZero() { return this.c === 0n; }
  /** _fix: round to 28 significant digits, half to even. */
  fix() {
    const d = ndigits(this.c) - PREC;
    if (d <= 0) return this;
    const p = pow10(d);
    let q = this.c / p;
    const r = this.c % p, half = 5n * pow10(d - 1);
    if (r > half || (r === half && q % 2n === 1n)) q += 1n;
    let e = this.e + d;
    if (ndigits(q) > PREC) { q /= TEN; e += 1; }
    return new Dec(this.s, q, e);
  }
  signed() { return this.s ? -this.c : this.c; }
  static add(a, b) {
    const e = Math.min(a.e, b.e);
    const x = a.signed() * pow10(a.e - e), y = b.signed() * pow10(b.e - e);
    const sum = x + y;
    let s;
    if (sum === 0n) s = a.s === 1 && b.s === 1 && a.c === 0n && b.c === 0n ? 1 : (a.c === 0n && b.c === 0n ? Math.min(a.s, b.s) : 0);
    else s = sum < 0n ? 1 : 0;
    return new Dec(s, sum < 0n ? -sum : sum, e).fix();
  }
  negated() { return new Dec(this.s ? 0 : 1, this.c, this.e); }
  static sub(a, b) { return Dec.add(a, b.negated()); }
  static mul(a, b) { return new Dec(a.s ^ b.s, a.c * b.c, a.e + b.e).fix(); }
  /** Python's Decimal division: exact when it can be, else 28 digits. */
  static div(a, b) {
    const s = a.s ^ b.s;
    if (a.c === 0n) return new Dec(s, 0n, a.e - b.e).fix();
    const shift = ndigits(b.c) - ndigits(a.c) + PREC + 1;
    let exp = a.e - b.e - shift;
    let coeff, rem;
    if (shift >= 0) { const n = a.c * pow10(shift); coeff = n / b.c; rem = n % b.c; }
    else { const d = b.c * pow10(-shift); coeff = a.c / d; rem = a.c % d; }
    if (rem !== 0n) { if (coeff % 5n === 0n) coeff += 1n; }
    else { const ideal = a.e - b.e; while (exp < ideal && coeff % TEN === 0n) { coeff /= TEN; exp += 1; } }
    return new Dec(s, coeff, exp).fix();
  }
  /** Decimal % Decimal: the remainder with the sign of the dividend. */
  static rem(a, b) {
    const e = Math.min(a.e, b.e);
    const x = a.c * pow10(a.e - e), y = b.c * pow10(b.e - e);
    return new Dec(a.s, x % y, e).fix();
  }
  neg() { return (this.c === 0n ? new Dec(0, 0n, this.e) : this.negated()).fix(); }
  abs() { return new Dec(0, this.c, this.e).fix(); }
  static cmp(a, b) {
    const e = Math.min(a.e, b.e);
    const x = a.signed() * pow10(a.e - e), y = b.signed() * pow10(b.e - e);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  /** quantize to exponent `e` rounding half away from zero. */
  quantizeHalfUp(e) {
    if (e <= this.e) return new Dec(this.s, this.c * pow10(this.e - e), e);
    const p = pow10(e - this.e);
    let q = this.c / p;
    if ((this.c % p) * 2n >= p) q += 1n;
    return new Dec(this.s, q, e);
  }
  isIntegral() { if (this.e >= 0) return true; return this.c % pow10(-this.e) === 0n; }
  /** int(d): toward zero. */
  toBigInt() { const v = this.e >= 0 ? this.c * pow10(this.e) : this.c / pow10(-this.e); return this.s ? -v : v; }
  /** str(Decimal): Python's to-scientific-string. */
  toString() {
    const digits = this.c.toString();
    const left = this.e + digits.length;
    const dot = this.e <= 0 && left > -6 ? left : 1;
    let ip, fp;
    if (dot <= 0) { ip = '0'; fp = `.${'0'.repeat(-dot)}${digits}`; }
    else if (dot >= digits.length) { ip = digits + '0'.repeat(dot - digits.length); fp = ''; }
    else { ip = digits.slice(0, dot); fp = `.${digits.slice(dot)}`; }
    const ex = left === dot ? '' : `E${left - dot >= 0 ? '+' : ''}${left - dot}`;
    return `${this.s ? '-' : ''}${ip}${fp}${ex}`;
  }
  /** format(d, "f") or format(d, ",.Nf"). */
  toFixed(places = null, group = false) {
    let d = this;
    if (places != null) d = d.roundHalfEven(-places);
    const digits = d.c.toString();
    const dot = d.e + digits.length;
    let ip, fp;
    if (dot < 0) { ip = '0'; fp = '0'.repeat(-dot) + digits; }
    else if (dot > digits.length) { ip = digits + '0'.repeat(dot - digits.length); fp = ''; }
    else { ip = digits.slice(0, dot) || '0'; fp = digits.slice(dot); }
    if (group) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${d.s ? '-' : ''}${ip}${fp ? `.${fp}` : ''}`;
  }
  roundHalfEven(e) {
    if (e <= this.e) return new Dec(this.s, this.c * pow10(this.e - e), e);
    const p = pow10(e - this.e);
    let q = this.c / p;
    const r = this.c % p;
    if (r * 2n > p || (r * 2n === p && q % 2n === 1n)) q += 1n;
    return new Dec(this.s, q, e);
  }
  /** A key equal for equal numbers (1 and 1.0 and 1.00 are the same map key, as in Python). */
  key() {
    if (this.c === 0n) return '0';
    let c = this.c, e = this.e;
    while (c % TEN === 0n) { c /= TEN; e += 1; }
    return `${this.s ? '-' : ''}${c}e${e}`;
  }
}

// ── Money ──────────────────────────────────────────────────────────────────────────────────────────────────────

export class Money {
  constructor(amount) { this.amount = amount; }
  static of(x) {
    if (x instanceof Money) return x;
    if (typeof x === 'string') {
      const d = Dec.parse(x.replace(/,/g, '').replace(/\$/g, '').trim());
      if (!d) throw new PyErr('InvalidOperation', "[<class 'decimal.ConversionSyntax'>]");
      return new Money(d);
    }
    return new Money(toDec(x));
  }
  toString() {
    const a = this.amount;
    const places = a.e < 0 ? Math.max(2, -a.e) : 2;
    return `${a.s && a.c !== 0n ? '-$' : '$'}${a.abs().toFixed(places, true)}`;
  }
}

/** Money._other: the amount of the other side, or a clear error. */
function moneyOther(other, verb) {
  if (other instanceof Money) return other.amount;
  if (isNumber(other) && numCmp(other, 0n) === 0) return Dec.int(0n);
  throw KindMismatch(`I can't ${verb} money and ${describe(other)}. Write the number as money, for example $5.`);
}

// ── Other kinds ────────────────────────────────────────────────────────────────────────────────────────────────

export class PyDate {
  constructor(y, m, d) { this.y = y; this.m = m; this.d = d; }
  iso() { return `${String(this.y).padStart(4, '0')}-${String(this.m).padStart(2, '0')}-${String(this.d).padStart(2, '0')}`; }
  num() { return this.y * 10000 + this.m * 100 + this.d; }
  static today() { const t = new Date(); return new PyDate(t.getFullYear(), t.getMonth() + 1, t.getDate()); }
  /** date.fromisoformat for YYYY-MM-DD (and YYYYMMDD); null when it is not a date. */
  static parse(text) {
    const m = String(text).match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const days = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > days[mo - 1]) return null;
    return new PyDate(y, mo, d);
  }
}

export class Tuple { constructor(items) { this.items = items; } }

export const NOT_GIVEN = Object.freeze({ notGiven: true });

/** A Python dict: insertion order kept; keys equal the way Python compares them (1 == 1.0 == True). */
export class PyDict {
  constructor() { this.m = new Map(); }
  static keyOf(k) {
    if (k === null) return 'N';
    if (typeof k === 'string') return `s${k}`;
    if (typeof k === 'boolean' || typeof k === 'bigint' || k instanceof Dec) return `n${Dec.of(k).key()}`;
    if (k instanceof Money) return `m${k.amount.key()}`;
    if (k instanceof PyDate) return `d${k.iso()}`;
    if (k instanceof Tuple) return `t(${k.items.map(PyDict.keyOf).join(',')})`;
    if (k === NOT_GIVEN) return 'G';
    throw TypeErr(`unhashable type: '${typeName(k)}'`);
  }
  has(k) { return this.m.has(PyDict.keyOf(k)); }
  get(k) { const e = this.m.get(PyDict.keyOf(k)); return e ? e[1] : undefined; }
  set(k, v) { const id = PyDict.keyOf(k); const e = this.m.get(id); if (e) e[1] = v; else this.m.set(id, [k, v]); }
  delete(k) { this.m.delete(PyDict.keyOf(k)); }
  get size() { return this.m.size; }
  keys() { return [...this.m.values()].map((e) => e[0]); }
  values() { return [...this.m.values()].map((e) => e[1]); }
  items() { return [...this.m.values()].map((e) => new Tuple([e[0], e[1]])); }
}

/** A record (a Python dataclass): its kind, and its field values in declaration order. */
export class RecordVal {
  constructor(cls) { this.cls = cls; this.f = new Map(); }
}

// ── Kinds ──────────────────────────────────────────────────────────────────────────────────────────────────────

export const isInt = (x) => typeof x === 'bigint';
export const isNumber = (x) => typeof x === 'bigint' || x instanceof Dec; // _is_number: never yes/no
const isIntLike = (x) => typeof x === 'bigint' || typeof x === 'boolean';
const isNumLike = (x) => isIntLike(x) || x instanceof Dec; // what Python arithmetic accepts as a number (bool is an int)
const asBig = (x) => (typeof x === 'boolean' ? (x ? 1n : 0n) : x);
const numCmp = (a, b) => (isIntLike(a) && isIntLike(b) ? (asBig(a) < asBig(b) ? -1 : asBig(a) > asBig(b) ? 1 : 0) : Dec.cmp(Dec.of(a), Dec.of(b)));

/** Python's type name, as its error messages print it. */
export function typeName(v) {
  if (v === null || v === undefined) return 'NoneType';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'bigint') return 'int';
  if (typeof v === 'string') return 'str';
  if (v instanceof Dec) return 'decimal.Decimal';
  if (v instanceof Money) return 'Money';
  if (Array.isArray(v)) return 'list';
  if (v instanceof Tuple) return 'tuple';
  if (v instanceof PyDict) return 'dict';
  if (v instanceof PyDate) return 'datetime.date';
  if (v instanceof RecordVal) return v.cls.py;
  if (v === NOT_GIVEN) return '_NotGiven';
  if (v && v.isFunc) return 'function';
  return 'object';
}
const shortName = (v) => (v instanceof Dec ? 'Decimal' : v instanceof PyDate ? 'date' : typeName(v));

/** _describe(v) in thunder_runtime.py. */
export function describe(v) {
  if (v === null) return 'nothing';
  if (typeof v === 'boolean') return 'a yes/no value';
  if (typeof v === 'string') return `the text "${v}"`;
  if (isNumber(v)) return `the number ${show(v)}`;
  if (v instanceof Money) return v.toString();
  return `a value (${shortName(v)})`;
}

/** show(v): a value the way Thunder says it. */
export function show(v) {
  if (v === null || v === undefined) return 'nothing';
  if (v === true) return 'yes';
  if (v === false) return 'no';
  if (v instanceof Dec) { const t = v.toFixed(); return t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t; }
  if (Array.isArray(v)) return `[${v.map(show).join(', ')}]`;
  if (v instanceof Tuple) return `[${v.items.map(show).join(', ')}]`;
  if (v instanceof PyDict) return `{${[...v.m.values()].map(([k, x]) => `${show(k)}: ${show(x)}`).join(', ')}}`;
  if (v instanceof RecordVal) return `${v.cls.py}(${v.cls.fields.map((f) => `${f.py.replace(/_/g, ' ')}: ${show(v.f.get(f.py))}`).join(', ')})`;
  if (v instanceof PyDate) return v.iso();
  return pyStr(v);
}

/** Python's repr(v). */
export function pyRepr(v) {
  if (typeof v === 'string') {
    const q = v.includes("'") && !v.includes('"') ? '"' : "'";
    let out = '';
    for (const ch of v) {
      const cp = ch.codePointAt(0);
      if (ch === '\\') out += '\\\\';
      else if (ch === q) out += `\\${q}`;
      else if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else if (ch === '\t') out += '\\t';
      else if (cp < 0x20 || cp === 0x7f) out += `\\x${cp.toString(16).padStart(2, '0')}`;
      else out += ch;
    }
    return q + out + q;
  }
  if (v === null) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Dec) return `Decimal('${v.toString()}')`;
  if (v instanceof Money) return `Money('${v.amount.toFixed()}')`;
  if (Array.isArray(v)) return `[${v.map(pyRepr).join(', ')}]`;
  if (v instanceof Tuple) return v.items.length === 1 ? `(${pyRepr(v.items[0])},)` : `(${v.items.map(pyRepr).join(', ')})`;
  if (v instanceof PyDict) return `{${[...v.m.values()].map(([k, x]) => `${pyRepr(k)}: ${pyRepr(x)}`).join(', ')}}`;
  if (v instanceof PyDate) return `datetime.date(${v.y}, ${v.m}, ${v.d})`;
  if (v instanceof RecordVal) return `${v.cls.py}(${v.cls.fields.map((f) => `${f.py}=${pyRepr(v.f.get(f.py))}`).join(', ')})`;
  if (v === NOT_GIVEN) return 'not given';
  return String(v);
}

/** Python's str(v). */
export function pyStr(v) {
  if (typeof v === 'string') return v;
  if (v instanceof Money) return v.toString();
  if (v instanceof PyDate) return v.iso();
  if (v instanceof Dec) return v.toString();
  return pyRepr(v);
}

/** Python's truth value (used only where the generated Python uses it: "where" conditions and Never rules). */
export function truthy(v) {
  if (v === null || v === false) return false;
  if (v === true) return true;
  if (typeof v === 'bigint') return v !== 0n;
  if (v instanceof Dec) return !v.isZero();
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Tuple) return v.items.length > 0;
  if (v instanceof PyDict) return v.size > 0;
  return true;
}

/** yes_no(v): a condition needs a real yes/no value. */
export function yesNo(v) {
  if (typeof v === 'boolean') return v;
  throw KindMismatch(`This needs a yes/no value, but it is ${describe(v)}. Compare it instead, for example: is 0, is empty, is nothing.`);
}

/** _decimal(x) in thunder_runtime.py. */
export function toDec(x) {
  if (x instanceof Dec) return x;
  if (typeof x === 'boolean') throw KindMismatch('A yes/no value was used where a number was needed.');
  if (typeof x === 'bigint') return Dec.int(x);
  if (x === null) throw KindMismatch('A value was nothing where a number was needed.');
  throw KindMismatch(`${describe(x)} was used where a number was needed.`);
}

// ── Python operators ───────────────────────────────────────────────────────────────────────────────────────────

const strLen = (s) => { let n = 0; for (const _ of s) n++; return n; };

export function pyLen(v) {
  if (typeof v === 'string') return BigInt(strLen(v));
  if (Array.isArray(v)) return BigInt(v.length);
  if (v instanceof Tuple) return BigInt(v.items.length);
  if (v instanceof PyDict) return BigInt(v.size);
  throw TypeErr(`object of type '${typeName(v)}' has no len()`);
}

/** Iterate a value the way Python's for loop does. */
export function pyIter(v) {
  if (Array.isArray(v)) return v;
  if (v instanceof Tuple) return v.items;
  if (typeof v === 'string') return Array.from(v);
  if (v instanceof PyDict) return v.keys();
  throw TypeErr(`'${typeName(v)}' object is not iterable`);
}
export const pyList = (v) => [...pyIter(v)];

export function add(a, b) {
  if (a instanceof Money) return new Money(Dec.add(a.amount, moneyOther(b, 'add')));
  if (b instanceof Money) return new Money(Dec.add(b.amount, moneyOther(a, 'add')));
  if (isIntLike(a) && isIntLike(b)) return asBig(a) + asBig(b);
  if (isNumLike(a) && isNumLike(b)) return Dec.add(Dec.of(a), Dec.of(b));
  if (typeof a === 'string') { if (typeof b === 'string') return a + b; throw TypeErr(`can only concatenate str (not "${typeName(b)}") to str`); }
  if (Array.isArray(a)) { if (Array.isArray(b)) return [...a, ...b]; throw TypeErr(`can only concatenate list (not "${typeName(b)}") to list`); }
  if (a instanceof Tuple) { if (b instanceof Tuple) return new Tuple([...a.items, ...b.items]); throw TypeErr(`can only concatenate tuple (not "${typeName(b)}") to tuple`); }
  throw TypeErr(`unsupported operand type(s) for +: '${typeName(a)}' and '${typeName(b)}'`);
}

export function sub(a, b) {
  if (a instanceof Money) return new Money(Dec.sub(a.amount, moneyOther(b, 'subtract')));
  if (b instanceof Money) return new Money(Dec.sub(moneyOther(a, 'subtract'), b.amount));
  if (isIntLike(a) && isIntLike(b)) return asBig(a) - asBig(b);
  if (isNumLike(a) && isNumLike(b)) return Dec.sub(Dec.of(a), Dec.of(b));
  throw TypeErr(`unsupported operand type(s) for -: '${typeName(a)}' and '${typeName(b)}'`);
}

const repeat = (seq, n) => { const k = Number(asBig(n)); if (typeof seq === 'string') return k > 0 ? seq.repeat(k) : ''; const out = []; for (let i = 0; i < k; i++) out.push(...seq); return out; };

export function mul(a, b) {
  if (a instanceof Money) { if (b instanceof Money) throw KindMismatch("Money can't be multiplied by money."); return new Money(Dec.mul(a.amount, toDec(b))); }
  if (b instanceof Money) return new Money(Dec.mul(b.amount, toDec(a)));
  if (isIntLike(a) && isIntLike(b)) return asBig(a) * asBig(b);
  if (isNumLike(a) && isNumLike(b)) return Dec.mul(Dec.of(a), Dec.of(b));
  const seq = (x) => typeof x === 'string' || Array.isArray(x);
  if (seq(a)) { if (isIntLike(b)) return repeat(a, b); throw TypeErr(`can't multiply sequence by non-int of type '${typeName(b)}'`); }
  if (seq(b)) { if (isIntLike(a)) return repeat(b, a); throw TypeErr(`can't multiply sequence by non-int of type '${typeName(a)}'`); }
  throw TypeErr(`unsupported operand type(s) for *: '${typeName(a)}' and '${typeName(b)}'`);
}

export function neg(a) {
  if (a instanceof Money) return new Money(a.amount.neg());
  if (isIntLike(a)) return -asBig(a);
  if (a instanceof Dec) return a.neg();
  throw TypeErr(`bad operand type for unary -: '${typeName(a)}'`);
}

/** Python's % on two whole numbers: the sign of the divisor. */
export function intMod(a, b) {
  const x = asBig(a), y = asBig(b);
  if (!isIntLike(a) || !isIntLike(b)) return pyModGeneric(a, b);
  if (y === 0n) throw new PyErr('ZeroDivisionError', 'integer modulo by zero');
  let r = x % y;
  if (r !== 0n && (r < 0n) !== (y < 0n)) r += y;
  return r;
}
function pyModGeneric(a, b) {
  if (isNumLike(a) && isNumLike(b)) return modulo(a, b);
  throw TypeErr(`unsupported operand type(s) for %: '${typeName(a)}' and '${typeName(b)}'`);
}

/** divide(a, b) in thunder_runtime.py: always exact. */
export function divide(a, b) {
  if (a instanceof Money) {
    if (b instanceof Money) { if (b.amount.isZero()) throw DividedByZero('You divided by zero.'); return Dec.div(a.amount, b.amount); }
    const d = toDec(b);
    if (d.isZero()) throw DividedByZero('You divided by zero.');
    return new Money(Dec.div(a.amount, d));
  }
  if (b instanceof Money) throw KindMismatch("A plain number can't be divided by money.");
  const x = toDec(a), y = toDec(b);
  if (y.isZero()) throw DividedByZero('You divided by zero.');
  return Dec.div(x, y);
}

/** modulo(a, b) in thunder_runtime.py. */
export function modulo(a, b) {
  const money = a instanceof Money;
  const x = money ? a.amount : toDec(a);
  const y = b instanceof Money ? b.amount : toDec(b);
  if (y.isZero()) throw DividedByZero('You divided by zero.');
  let r = Dec.rem(x, y);
  if (!r.isZero() && (r.s === 1) !== (y.s === 1 && !y.isZero())) r = Dec.add(r, y);
  if (money) return new Money(r);
  return typeof a === 'bigint' && typeof b === 'bigint' ? r.toBigInt() : r;
}

/** round_to(x, places). */
export function roundTo(x, places = 0n) {
  const p = Number(asBig(places instanceof Dec ? places.toBigInt() : places));
  if (x instanceof Money) return new Money(x.amount.quantizeHalfUp(-p));
  if (typeof x === 'bigint') return x;
  const d = toDec(x).quantizeHalfUp(-p);
  return p === 0 ? d.toBigInt() : d;
}

/** Python ==. */
export function eq(a, b) {
  if (a === b && !(a instanceof Dec)) return true;
  if (a instanceof Money || b instanceof Money) {
    const [m, o] = a instanceof Money ? [a, b] : [b, a];
    if (o === null || typeof o === 'string' || typeof o === 'boolean') return false;
    return Dec.cmp(m.amount, moneyOther(o, 'compare')) === 0;
  }
  if (a === null || b === null) return false;
  if (isNumLike(a) && isNumLike(b)) return numCmp(a, b) === 0;
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i] || eq(x, b[i]));
  if (a instanceof Tuple && b instanceof Tuple) return a.items.length === b.items.length && a.items.every((x, i) => eq(x, b.items[i]));
  if (a instanceof PyDict && b instanceof PyDict) return a.size === b.size && [...a.m.entries()].every(([k, [, v]]) => b.m.has(k) && eq(v, b.m.get(k)[1]));
  if (a instanceof RecordVal && b instanceof RecordVal) return a.cls === b.cls && a.cls.fields.every((f) => eq(a.f.get(f.py), b.f.get(f.py)));
  if (a instanceof PyDate && b instanceof PyDate) return a.num() === b.num();
  return false;
}

const FLIP = { '<': '>', '>': '<', '<=': '>=', '>=': '<=' };
const holds = (op, c) => (op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0);

/** Python <, >, <=, >= (and == / != through eq). */
export function compare(op, a, b) {
  if (op === '==') return eq(a, b);
  if (op === '!=') return !eq(a, b);
  if (a instanceof Money || b instanceof Money) {
    const [m, o, o2] = a instanceof Money ? [a, b, op] : [b, a, FLIP[op]];
    if (o === null) throw TypeErr(`'${o2}' not supported between instances of 'decimal.Decimal' and 'NoneType'`);
    return holds(o2, Dec.cmp(m.amount, moneyOther(o, 'compare')));
  }
  const c = order(a, b);
  if (c === null) throw TypeErr(`'${op}' not supported between instances of '${typeName(a)}' and '${typeName(b)}'`);
  return holds(op, c);
}

/** -1, 0, 1, or null when Python cannot order the two. */
function order(a, b) {
  if (isNumLike(a) && isNumLike(b)) return numCmp(a, b);
  if (typeof a === 'string' && typeof b === 'string') return cmpStr(a, b);
  if (a instanceof PyDate && b instanceof PyDate) return Math.sign(a.num() - b.num());
  const seqA = Array.isArray(a) ? a : a instanceof Tuple ? a.items : null;
  const seqB = Array.isArray(b) ? b : b instanceof Tuple ? b.items : null;
  if (seqA && seqB && Array.isArray(a) === Array.isArray(b)) {
    for (let i = 0; i < Math.min(seqA.length, seqB.length); i++) {
      if (eq(seqA[i], seqB[i])) continue;
      return compare('<', seqA[i], seqB[i]) ? -1 : 1;
    }
    return Math.sign(seqA.length - seqB.length);
  }
  return null;
}
function cmpStr(a, b) {
  const x = Array.from(a), y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) { const d = x[i].codePointAt(0) - y[i].codePointAt(0); if (d) return Math.sign(d); }
  return Math.sign(x.length - y.length);
}

/** Python's `item in container`. */
export function contains(container, item) {
  if (typeof container === 'string') {
    if (typeof item !== 'string') throw TypeErr(`'in <string>' requires string as left operand, not ${typeName(item)}`);
    return container.includes(item);
  }
  if (container instanceof PyDict) return container.has(item);
  if (Array.isArray(container)) return container.some((x) => x === item || eq(x, item));
  if (container instanceof Tuple) return container.items.some((x) => eq(x, item));
  throw TypeErr(`argument of type '${typeName(container)}' is not iterable`);
}

/** Python's list.sort / sorted: stable, using < only. */
export function pySort(items, key, reverse) {
  const keyed = items.map((v, i) => ({ v, k: key ? key(v) : v, i }));
  keyed.sort((x, y) => {
    if (compare('<', reverse ? y.k : x.k, reverse ? x.k : y.k)) return -1;
    if (compare('<', reverse ? x.k : y.k, reverse ? y.k : x.k)) return 1;
    return x.i - y.i;
  });
  return keyed.map((x) => x.v);
}

// ── Attribute-style Python calls the generated code makes on values ────────────────────────────────────────────

export function attrErr(v, name) { return new PyErr('AttributeError', `'${typeName(v)}' object has no attribute '${name}'`); }
export function strMethod(v, name) { if (typeof v !== 'string') throw attrErr(v, name); return v; }

const SPLITLINES = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/;
export function splitLines(s) {
  const out = [];
  let rest = s;
  while (rest.length) {
    const m = rest.match(SPLITLINES);
    if (!m) { out.push(rest); break; }
    out.push(rest.slice(0, m.index));
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}
const PY_SPACE = /[\s\x1c-\x1f\x85]+/u;
export const pySplit = (s) => s.split(PY_SPACE).filter((x) => x !== '');
export const pyStrip = (s) => s.replace(/^[\s\x1c-\x1f\x85]+|[\s\x1c-\x1f\x85]+$/gu, '');

// ── JSON, the way Python's json module reads and writes it ─────────────────────────────────────────────────────

class JsonError extends Error { constructor(msg, pos) { super(msg); this.pos = pos; } }

export function jsonParse(text) {
  const s = text, n = s.length;
  const ws = (i) => { while (i < n && ' \t\n\r'.includes(s[i])) i++; return i; };
  const NUM = /-?(?:0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?/y;
  function str(begin) {
    let i = begin + 1, out = '';
    for (;;) {
      if (i >= n) throw new JsonError('Unterminated string starting at', begin);
      const ch = s[i];
      if (ch === '"') return [out, i + 1];
      if (ch.charCodeAt(0) < 0x20) throw new JsonError('Invalid control character at', i);
      if (ch !== '\\') { out += ch; i++; continue; }
      if (i + 1 >= n) throw new JsonError('Unterminated string starting at', begin);
      const esc = s[i + 1];
      const simple = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }[esc];
      if (simple !== undefined) { out += simple; i += 2; continue; }
      if (esc !== 'u') throw new JsonError('Invalid \\escape', i);
      const hex = s.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new JsonError('Invalid \\uXXXX escape', i + 1);
      let cp = parseInt(hex, 16);
      i += 6;
      if (cp >= 0xd800 && cp <= 0xdbff && s[i] === '\\' && s[i + 1] === 'u' && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) {
        const lo = parseInt(s.slice(i + 2, i + 6), 16);
        if (lo >= 0xdc00 && lo <= 0xdfff) { cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00); i += 6; }
      }
      out += String.fromCodePoint(cp);
    }
  }
  function value(i) {
    if (i >= n) throw new JsonError('Expecting value', i);
    const ch = s[i];
    if (ch === '"') return str(i);
    if (ch === '{') return obj(i + 1);
    if (ch === '[') return arr(i + 1);
    if (s.startsWith('null', i)) return [null, i + 4];
    if (s.startsWith('true', i)) return [true, i + 4];
    if (s.startsWith('false', i)) return [false, i + 5];
    NUM.lastIndex = i;
    const m = NUM.exec(s);
    if (m) {
      if (m[1] || m[2]) return [Dec.parse(m[0]), i + m[0].length];
      return [BigInt(m[0]), i + m[0].length];
    }
    throw new JsonError('Expecting value', i);
  }
  function obj(i) {
    const d = new PyDict();
    i = ws(i);
    if (s[i] === '}') return [d, i + 1];
    for (;;) {
      if (i >= n || s[i] !== '"') throw new JsonError('Expecting property name enclosed in double quotes', i);
      let k; [k, i] = str(i);
      i = ws(i);
      if (i >= n || s[i] !== ':') throw new JsonError("Expecting ':' delimiter", i);
      i = ws(i + 1);
      let v; [v, i] = value(i);
      d.set(k, v);
      i = ws(i);
      if (i < n && s[i] === '}') return [d, i + 1];
      if (i >= n || s[i] !== ',') throw new JsonError("Expecting ',' delimiter", i);
      const comma = i;
      i = ws(i + 1);
      if (s[i] === '}') throw new JsonError('Illegal trailing comma before end of object', comma);
    }
  }
  function arr(i) {
    const out = [];
    i = ws(i);
    if (s[i] === ']') return [out, i + 1];
    for (;;) {
      let v; [v, i] = value(i);
      out.push(v);
      i = ws(i);
      if (i < n && s[i] === ']') return [out, i + 1];
      if (i >= n || s[i] !== ',') throw new JsonError("Expecting ',' delimiter", i);
      const comma = i;
      i = ws(i + 1);
      if (s[i] === ']') throw new JsonError('Illegal trailing comma before end of array', comma);
    }
  }
  try {
    let [v, end] = value(ws(0));
    end = ws(end);
    if (end !== n) throw new JsonError('Extra data', end);
    return v;
  } catch (e) {
    if (!(e instanceof JsonError)) throw e;
    const before = s.slice(0, e.pos);
    const line = (before.match(/\n/g) || []).length + 1;
    const col = e.pos - before.lastIndexOf('\n');
    throw ConversionFailed(`This is not JSON: ${e.message} (line ${line}, column ${col}).`);
  }
}

function jsonReady(v) {
  if (v === null || typeof v === 'boolean' || typeof v === 'string' || typeof v === 'bigint' || v instanceof Dec) return v;
  if (v instanceof Money) throw KindMismatch("Money has no JSON form of its own: use its amount, for example price's amount.");
  if (Array.isArray(v)) return v.map(jsonReady);
  if (v instanceof Tuple) return v.items.map(jsonReady);
  if (v instanceof PyDict) {
    const out = new PyDict();
    for (const [k, x] of v.m.values()) { if (typeof k !== 'string') throw KindMismatch(`A JSON object's keys are text, but one is ${describe(k)}.`); out.set(k, jsonReady(x)); }
    return out;
  }
  if (v instanceof RecordVal) { const out = new PyDict(); for (const f of v.cls.fields) out.set(f.py, jsonReady(v.f.get(f.py))); return out; }
  throw KindMismatch(`${describe(v)} has no JSON form.`);
}

const jsonStr = (s) => `"${Array.from(s).map((ch) => {
  const cp = ch.codePointAt(0);
  if (ch === '"') return '\\"';
  if (ch === '\\') return '\\\\';
  if (ch === '\n') return '\\n';
  if (ch === '\r') return '\\r';
  if (ch === '\t') return '\\t';
  if (ch === '\b') return '\\b';
  if (ch === '\f') return '\\f';
  if (cp >= 0x20 && cp <= 0x7e) return ch;
  if (cp > 0xffff) { const v = cp - 0x10000; return `\\u${(0xd800 + (v >> 10)).toString(16)}\\u${(0xdc00 + (v & 0x3ff)).toString(16)}`; }
  return `\\u${cp.toString(16).padStart(4, '0')}`;
}).join('')}"`;

export function jsonText(v) {
  const w = (x) => {
    if (x === null) return 'null';
    if (x === true) return 'true';
    if (x === false) return 'false';
    if (typeof x === 'bigint') return x.toString();
    if (x instanceof Dec) { const t = x.toString(); return x.isIntegral() && t.includes('E') ? x.toFixed() : t; }
    if (typeof x === 'string') return jsonStr(x);
    if (Array.isArray(x)) return `[${x.map(w).join(', ')}]`;
    return `{${[...x.m.values()].map(([k, y]) => `${jsonStr(k)}: ${w(y)}`).join(', ')}}`;
  };
  return w(jsonReady(v));
}

// ── Helpers the generated code calls (moved from the engine so the engine and compiled TypeScript share them) ────

export const MAX_FRAMES = 997; // as deep as the generated Python goes (recursion limit 1000, less its own frames)

export function rangeInt(v) {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'boolean') return v ? 1n : 0n;
  throw TypeErr(`'${v instanceof Dec ? 'decimal.Decimal' : v === null ? 'NoneType' : v instanceof Money ? 'Money' : typeof v === 'string' ? 'str' : 'object'}' object cannot be interpreted as an integer`);
}

export function unpack2(el) {
  const items = Array.isArray(el) ? el : el instanceof Tuple ? el.items : typeof el === 'string' ? Array.from(el) : el instanceof PyDict ? el.keys() : null;
  if (!items) throw TypeErr(`cannot unpack non-iterable ${el === null ? 'NoneType' : isInt(el) ? 'int' : el instanceof Dec ? 'decimal.Decimal' : typeof el === 'boolean' ? 'bool' : 'object'} object`);
  if (items.length < 2) throw new PyErr('ValueError', `not enough values to unpack (expected 2, got ${items.length})`);
  if (items.length > 2) throw new PyErr('ValueError', `too many values to unpack (expected 2, got ${items.length})`);
  return items;
}

export function mapItems(m) { if (!(m instanceof PyDict)) throw attrErr(m, 'items'); return m.items(); }
export function pairsOf(c) { return c instanceof PyDict ? c.items() : pyList(c); }

export function itemAt(items, position, dflt) {
  if (typeof position !== 'bigint') throw KindMismatch(`A position in a list is a whole number, not ${describe(position)}.`);
  const list = Array.isArray(items) ? items : items instanceof Tuple ? items.items : null;
  if (!list) throw TypeErr(`object of type '${items === null ? 'NoneType' : 'object'}' has no len()`);
  if (position >= 1n && position <= BigInt(list.length)) return list[Number(position) - 1];
  if (dflt !== undefined) return dflt;
  throw MissingValue(`There is no item ${position}: the list has ${list.length} item${list.length === 1 ? '' : 's'}.`);
}
export function setItem(items, position, value) { itemAt(items, position); items[Number(position) - 1] = value; }
export function mapSet(m, k, v) {
  if (m instanceof PyDict) { m.set(k, v); return; }
  if (m === null) throw TypeErr("'NoneType' object does not support item assignment");
  if (Array.isArray(m)) { setItem(m, k, v); return; }
  throw TypeErr(`'${m instanceof Money ? 'Money' : 'object'}' object does not support item assignment`);
}
export function setEntry(c, k, v) {
  if (Array.isArray(c)) setItem(c, k, v);
  else if (c instanceof PyDict) c.set(k, v);
  else if (c === null) throw MissingValue(`This value is nothing, so it has no entry for ${show(k)}.`);
  else throw KindMismatch(`${describe(c)} has no entries that can be changed.`);
}
export function entry(c, k, dflt) {
  if (Array.isArray(c) || c instanceof Tuple) return itemAt(c, k, dflt);
  if (c instanceof PyDict) { if (c.has(k)) return c.get(k); if (dflt !== undefined) return dflt; throw MissingValue(`There is no entry for ${show(k)}.`); }
  if (c === null) throw MissingValue(`This value is nothing, so it has no entry for ${show(k)}.`);
  throw KindMismatch(`${describe(c)} has no entries.`);
}
export function mapGet(m, k, dflt) {
  if (m instanceof PyDict) { if (m.has(k)) return m.get(k); if (dflt !== undefined) return dflt; throw new PyErr('KeyError', pyStr(k), [k]); }
  if (m === null) throw dflt !== undefined ? attrErr(m, 'get') : TypeErr("'NoneType' object is not subscriptable");
  if (dflt !== undefined) throw attrErr(m, 'get');
  if (Array.isArray(m)) { const i = Number(k); if (typeof k === 'bigint' && i >= -m.length && i < m.length) return m.at(i); throw new PyErr('IndexError', 'list index out of range'); }
  throw TypeErr(`'${m instanceof Money ? 'Money' : 'object'}' object is not subscriptable`);
}

/** obj.name for a record field (a Python attribute), or Money's amount. */
export function getAttr(obj, name) {
  if (obj instanceof RecordVal && obj.f.has(name)) return obj.f.get(name);
  if (obj instanceof Money && name === 'amount') return obj.amount;
  throw attrErr(obj, name);
}

/** obj.name = value. `checkRules(obj, name, value)` runs the record's Never rules first, as its __setattr__ does. */
export function setAttrWith(checkRules, obj, name, value) {
  if (obj instanceof RecordVal) { checkRules(obj, name, value); obj.f.set(name, value); return; }
  if (obj instanceof Money) throw new PyErr('AttributeError', 'Money cannot be changed; make new money instead.');
  throw attrErr(obj, name);
}

export function getField(obj, key) {
  if (obj === null) throw MissingValue(`This value is nothing, so it has no ${key}.`);
  const names = [key, key.replace(/ /g, '_'), key.toLowerCase(), key.toLowerCase().replace(/ /g, '_')];
  if (obj instanceof PyDict) {
    for (const k of names) if (obj.has(k)) return obj.get(k);
    for (const [k, v] of obj.m.values()) if (pyStrip(pyStr(k)).toLowerCase() === key.toLowerCase()) return v;
    throw MissingValue(`There is no field "${key}". Fields here: ${obj.keys().map(pyStr).join(', ')}.`);
  }
  for (const k of names) {
    if (obj instanceof RecordVal && obj.f.has(k)) return obj.f.get(k);
    if (obj instanceof Money && k === 'amount') return obj.amount;
  }
  throw MissingValue(`${describe(obj)} has no field "${key}".`);
}
export function setFieldWith(setAttr, obj, key, value) {
  if (obj instanceof PyDict) { obj.set(key, value); return; }
  const names = [key, key.replace(/ /g, '_'), key.toLowerCase(), key.toLowerCase().replace(/ /g, '_')];
  for (const k of names) if (obj instanceof RecordVal && obj.f.has(k)) { setAttr(obj, k, value); return; }
  throw MissingValue(`${describe(obj)} has no field "${key}".`);
}

export function addTo(target, value) { if (Array.isArray(target)) { target.push(value); return target; } return add(target, value); }
export function appendTo(target, value) { if (!Array.isArray(target)) throw attrErr(target, 'append'); target.push(value); }
export function removeFrom(target, value) {
  if (target instanceof PyDict) { if (!target.has(value)) throw MissingValue(`There is no entry for ${show(value)} to remove.`); target.delete(value); return; }
  if (!contains(target, value)) throw MissingValue(`${show(value)} is not in the list, so it can't be removed.`);
  if (!Array.isArray(target)) throw attrErr(target, 'remove');
  target.splice(target.findIndex((x) => x === value || eq(x, value)), 1);
}
export function sortInPlace(target, key, desc) {
  if (!Array.isArray(target)) throw attrErr(target, 'sort');
  const sorted = pySort(target, key, !!desc);
  target.splice(0, target.length, ...sorted);
}
export function reverseInPlace(target) { if (!Array.isArray(target)) throw attrErr(target, 'reverse'); target.reverse(); }

/** A record: the fields it is given (a Map), the others defaulted; each set through `setAttr` (its Never rules). */
export function newRecordWith(setAttr, cls, given) {
  const rec = new RecordVal(cls);
  const missing = cls.fields.filter((f) => !given.has(f.py) && !['optional', 'list', 'map'].includes(f.type?.k));
  if (missing.length) throw TypeErr(`${cls.py}.__init__() missing ${missing.length} required keyword-only argument${missing.length === 1 ? '' : 's'}: ${missing.map((f) => `'${f.py}'`).join(missing.length === 2 ? ' and ' : ', ')}`);
  for (const f of cls.fields) {
    const v = given.has(f.py) ? given.get(f.py) : f.type.k === 'optional' ? null : f.type.k === 'list' ? [] : new PyDict();
    setAttr(rec, f.py, v);
  }
  return rec;
}

/** never(cond, text, rule, value): a broken Never rule stops the program. */
export function never(cond, text, line, value) {
  if (truthy(cond)) throw RuleBroken(`${text} (the rule on line ${line}), but the value is ${show(value)}.`);
}

/** The operations written as words: the sum of, the first of, the words of, … */
export function applyOp(op, a) {
  switch (op) {
    case 'sum': return totalOf(pyList(a));
    case 'average': { const items = pyList(a); if (!items.length) throw MissingValue("I can't take the average of an empty list."); return divide(totalOf(items), BigInt(items.length)); }
    case 'count': case 'length': return pyLen(a);
    case 'min': { const items = pyList(a); if (!items.length) throw MissingValue('An empty list has no smallest item.'); return items.reduce((best, x) => (compare('<', x, best) ? x : best)); }
    case 'max': { const items = pyList(a); if (!items.length) throw MissingValue('An empty list has no largest item.'); return items.reduce((best, x) => (compare('>', x, best) ? x : best)); }
    case 'first': { const items = pyList(a); if (!items.length) throw MissingValue('An empty list has no first item.'); return items[0]; }
    case 'last': { const items = pyList(a); if (!items.length) throw MissingValue('An empty list has no last item.'); return items[items.length - 1]; }
    case 'words': return pySplit(pyStr(a)).map((p) => stripPunct(p)).filter(Boolean);
    case 'lines': return splitLines(strMethod(a, 'splitlines'));
    case 'lowercase': return strMethod(a, 'lower').toLowerCase();
    case 'uppercase': return strMethod(a, 'upper').toUpperCase();
    case 'trimmed': return pyStrip(strMethod(a, 'strip'));
    case 'parts': return pySplit(textOf(a, '"the parts of"'));
    case 'abs': {
      if (a instanceof Money) return new Money(a.amount.abs());
      if (typeof a === 'boolean' || !(isNumber(a))) throw KindMismatch(`"the absolute value of" needs a number or money, but it is ${describe(a)}.`);
      return typeof a === 'bigint' ? (a < 0n ? -a : a) : a.abs();
    }
    case 'jsonText': return jsonText(a);
    case 'jsonData': return jsonParse(textOf(a, '"the JSON data in"'));
    case 'keys': if (!(a instanceof PyDict)) throw attrErr(a, 'keys'); return a.keys();
    case 'values': if (!(a instanceof PyDict)) throw attrErr(a, 'values'); return a.values();
    default: throw new PyErr('NameError', `name '${op}' is not defined`);
  }
}

/** "starts with" / "ends with": both sides must be text. */
export function affix(t, a, end) {
  const what = end ? '"ends with"' : '"starts with"';
  textOf(t, what); textOf(a, what);
  return end ? t.endsWith(a) : t.startsWith(a);
}

/** a <= v <= hi, the way Python chains it: hi is worked out only when the first part holds. */
export function between(lo, v, hi) { if (!compare('<=', lo, v)) return false; return compare('<=', v, hi()); }
/** `item in container`, with the item worked out first (as Python does). */
export function isIn(item, container) { return contains(container, item); }

/** Read a file the program names. `readText(path, cwd)` gives its text or throws with .code 'ENOENT' / 'EISDIR';
 *  without one (a browser) every file is missing. */
export function readTextVia(readText, cwd, path) {
  if (typeof path !== 'string') throw TypeErr(`expected str, bytes or os.PathLike object, not ${path === null ? 'NoneType' : 'object'}`);
  try {
    if (!readText) throw Object.assign(new Error('no files here'), { code: 'ENOENT' });
    return readText(path, cwd);
  }
  catch (err) {
    if (err.code === 'ENOENT') throw MissingValue(`There is no file "${path}" (looked in the folder the program runs in).`);
    throw new PyErr(err.code === 'EISDIR' ? 'IsADirectoryError' : 'OSError', err.message);
  }
}

/** Expect: the checks, the way thunder_runtime.py's expect_* do them. */
export function expectTrue(v, text) { if (v !== true) throw ExpectationFailed(`${text}, but it was not true.`); }
export function expectFailure(run, text, msg) {
  try { run(); }
  catch (e) {
    const err = asPyErr(e);
    if (err.thunder && msg !== null) {
      if (typeof msg !== 'string') throw TypeErr(`'in <string>' requires string as left operand, not ${typeof msg === 'bigint' ? 'int' : 'object'}`);
      if (!err.message.includes(msg)) throw ExpectationFailed(`${text}, but it failed with "${err.message}".`);
    }
    return;
  }
  throw ExpectationFailed(`${text}, but it did not fail.`);
}
export function expectValue(actual, full, op, want, text) {
  const known = CHECKS[full];
  const ok = known ? known(actual, want) : !CHECKS[op](actual, want);
  if (!ok) throw ExpectationFailed(`${text}, but it was ${show(actual)}.`);
}

/** describe_error(error) in thunder_runtime.py: "main.thunder, line 3 (reached from line 7): … [TC501]". */
export function describeError(e) {
  const where = e.where ?? [];
  const inner = where[where.length - 1];
  let message = explain(e);
  let code = codeOf(e);
  if (code === 'TC508' && !e.thunder) { message = `Python code used by this line failed: ${message}`; code = 'TC508'; }
  let place = inner ? `${inner.file}, line ${inner.line}` : 'In the program';
  const callers = where.slice(0, -1).map((f) => f.line);
  if (callers.length && inner) place += ` (reached from line ${callers.reverse().join(', then line ')})`;
  return `${place}: ${message}  [${code}]`;
}

/** Values the generated code writes literally. */
export const dec = (text) => Dec.parse(text);
export const money = (text) => Money.of(text);
export const today = () => PyDate.today();
export function date(text) { const d = PyDate.parse(text); if (!d) throw new PyErr('ValueError', `Invalid isoformat string: '${text}'`); return d; }
export const newMap = () => new PyDict();

// ── conversions and text helpers (thunder_runtime.py) ──────────────────────────────────────────────────────────

export const CHECKS = {
  is: (a, b) => eq(a, b),
  'is not': (a, b) => !eq(a, b),
  'at least': (a, b) => compare('>=', a, b),
  'at most': (a, b) => compare('<=', a, b),
  'more than': (a, b) => compare('>', a, b),
  'less than': (a, b) => compare('<', a, b),
  nothing: (a) => a === null,
  'not nothing': (a) => a !== null,
  empty: (a) => eq(pyLen(a), 0n),
  positive: (a) => compare('>', a, 0n),
  negative: (a) => compare('<', a, 0n),
  zero: (a) => eq(a, 0n),
  between: (a, b) => compare('<=', b[0], a) && compare('<=', a, b[1]),
  in: (a, b) => contains(b, a),
  contains: (a, b) => contains(a, b),
};


const NUMBER = /^[+-]?(\d[\d_]*)(\.\d+)?$/;

export function toNumber(x) {
  if (isNumber(x)) return x;
  if (x instanceof Money) return x.amount;
  if (typeof x === 'string') {
    const s = pyStrip(x).replace(/,/g, '');
    if (NUMBER.test(s)) return s.includes('.') ? Dec.parse(s) : BigInt(s.replace(/_/g, ''));
  }
  throw ConversionFailed(`${describe(x)} is not a number.`);
}
export function toWhole(x) {
  const n = toNumber(x);
  if (typeof n === 'bigint') return n;
  if (n.isIntegral()) return n.toBigInt();
  throw ConversionFailed(`${show(n)} is not a whole number.`);
}
export function toMoney(x) {
  if (x instanceof Money) return x;
  if (typeof x === 'string') {
    let s = pyStrip(x).replace(/,/g, '');
    const negative = s.startsWith('-');
    s = s.replace(/^-+/, '').replace(/^\$+/, '');
    if (NUMBER.test(s)) return Money.of((negative ? '-' : '') + s);
    throw ConversionFailed(`${describe(x)} is not an amount of money.`);
  }
  return new Money(toDec(toNumber(x)));
}
export function toYesNo(x) {
  if (typeof x === 'boolean') return x;
  if (typeof x === 'string' && ['yes', 'true'].includes(pyStrip(x).toLowerCase())) return true;
  if (typeof x === 'string' && ['no', 'false'].includes(pyStrip(x).toLowerCase())) return false;
  throw ConversionFailed(`${describe(x)} is not yes or no.`);
}
export function toDate(x) {
  if (x instanceof PyDate) return x;
  const d = PyDate.parse(pyStrip(pyStr(x)));
  if (d) return d;
  throw ConversionFailed(`${describe(x)} is not a date (write it as YYYY-MM-DD).`);
}

export function totalOf(items) {
  if (!items.length) return 0n;
  let result = items[0];
  for (const x of items.slice(1)) result = add(result, x);
  return result;
}
export function textOf(v, what) {
  if (typeof v !== 'string') throw KindMismatch(`${what} needs text, but it is ${describe(v)}.`);
  return v;
}
export function joined(items, sep) {
  sep = textOf(sep, '"joined with"');
  const out = [];
  pyIter(items).forEach((x, i) => {
    if (typeof x !== 'string') throw KindMismatch(`"joined with" joins text, but item ${i + 1} is ${describe(x)}. Turn it into text first.`);
    out.push(x);
  });
  return out.join(sep);
}
export function splitAt(text, sep) {
  sep = textOf(sep, '"split at"');
  if (sep === '') throw KindMismatch('"split at" needs something to split at, not empty text.');
  return textOf(text, '"split at"').split(sep);
}
export function replacing(text, old, nw) {
  old = textOf(old, '"replacing"');
  if (old === '') throw KindMismatch('"replacing" needs something to replace, not empty text.');
  const t = textOf(text, '"replacing"');
  return t.split(old).join(textOf(nw, '"replacing … with"'));
}
const PUNCT = new Set(Array.from(".,;:!?\"'()[]{}<>“”‘’…-"));
export function stripPunct(w) {
  const a = Array.from(w);
  let i = 0, j = a.length;
  while (i < j && PUNCT.has(a[i])) i++;
  while (j > i && PUNCT.has(a[j - 1])) j--;
  return a.slice(i, j).join('');
}

