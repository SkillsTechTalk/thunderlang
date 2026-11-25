// Thunder Money: an exact decimal amount, never binary floating point. Browser-safe, no deps.
//
// Semantics (see docs/spec.md, "Money"):
// - A Money value is a decimal with a fixed number of minor units: 2 by default (cents), or the
//   currency's own when the type names one (Money(JPY) has 0, Money(KWD) has 3).
// - Parsing is string-exact. An amount with more decimal places than the minor units is an error,
//   never silently rounded. Rounding happens only where a spec explicitly asks for it, and then it
//   is round half up, a half going away from zero (roundHalfUp below), the same rule as Thunder Core's
//   `round`: 2.345 is 2.35, -2.345 is -2.35.
// - Each target uses an exact representation: TypeScript/JavaScript bigint minor units, Python
//   decimal.Decimal, Java java.math.BigDecimal, C# decimal, Go int64 minor units, Rust i64 minor
//   units. A target with no exact representation wired up refuses (IL-GEN-001), it never falls back
//   to a float.

export class MoneyError extends Error {}

export const MONEY_DEFAULT_MINOR_UNITS = 2;

// ISO 4217 currencies whose minor units differ from 2. Everything else uses 2.
const MINOR_UNITS = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0, UGX: 0,
  UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  CLF: 4, UYW: 4,
};

/** Minor units for a currency code (2 when unknown or absent). */
export function minorUnitsFor(currency) {
  if (!currency) return MONEY_DEFAULT_MINOR_UNITS;
  const code = String(currency).trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(MINOR_UNITS, code) ? MINOR_UNITS[code] : MONEY_DEFAULT_MINOR_UNITS;
}

/** If `type` is a Money type (`Money`, `Money(USD)`), its minor units; otherwise null. */
export function moneyTypeMinorUnits(type) {
  const m = String(type ?? '').trim().match(/^Money(?:\s*\(\s*([A-Za-z]{3})\s*\))?$/);
  return m ? minorUnitsFor(m[1]) : null;
}

const DECIMAL = /^([+-])?(\d+)(?:\.(\d+))?$/;

/**
 * Parse a decimal amount ("12.30", "-0.1", "$1,234.5" with allowDollar) into exact minor units.
 * Returns a bigint. Throws MoneyError for anything that is not an exact amount at these minor units.
 */
export function parseMoney(text, { minorUnits = MONEY_DEFAULT_MINOR_UNITS, allowDollar = false } = {}) {
  let t = typeof text === 'number' ? numberToDecimalText(text) : String(text ?? '').trim();
  if (allowDollar) {
    const d = t.replace(/,/g, '').match(/^(-?)\$(-?)(\d+(?:\.\d+)?)$/);
    if (d) t = `${d[1] || d[2] ? '-' : ''}${d[3]}`;
  }
  const m = t.match(DECIMAL);
  if (!m) throw new MoneyError(`"${text}" is not an amount. Write digits with an optional decimal point, such as 12.30.`);
  const frac = m[3] || '';
  const extra = frac.slice(minorUnits);
  if (/[1-9]/.test(extra)) throw new MoneyError(`${t} has more decimal places than Money's ${minorUnits} minor unit${minorUnits === 1 ? '' : 's'}; Thunder will not round it silently.`);
  const minor = BigInt(m[2] + frac.slice(0, minorUnits).padEnd(minorUnits, '0'));
  return m[1] === '-' ? -minor : minor;
}

/** Render exact minor units as a decimal string with exactly `minorUnits` places ("12.30"). */
export function formatMoney(minor, { minorUnits = MONEY_DEFAULT_MINOR_UNITS } = {}) {
  const v = BigInt(minor);
  const neg = v < 0n;
  const digits = (neg ? -v : v).toString().padStart(minorUnits + 1, '0');
  const whole = minorUnits ? digits.slice(0, -minorUnits) : digits;
  const frac = minorUnits ? `.${digits.slice(-minorUnits)}` : '';
  return `${neg ? '-' : ''}${whole}${frac}`;
}

/**
 * Round a decimal string to `minorUnits` places, half up: a half goes away from zero (2.345 is 2.35, -2.345 is
 * -2.35), the rule people learn in school and the one Thunder Core's `round` uses in every target.
 * Use only where a spec explicitly asks for rounding. Returns exact minor units (bigint).
 */
export function roundHalfUp(text, { minorUnits = MONEY_DEFAULT_MINOR_UNITS } = {}) {
  const t = typeof text === 'number' ? numberToDecimalText(text) : String(text).trim();
  const m = t.match(DECIMAL);
  if (!m) throw new MoneyError(`"${text}" is not an amount.`);
  const frac = m[3] || '';
  let minor = BigInt(m[2] + frac.slice(0, minorUnits).padEnd(minorUnits, '0'));
  const rest = frac.slice(minorUnits);
  if (rest && rest[0] >= '5') minor += 1n; // the magnitude rounds up; the sign is put back after
  return m[1] === '-' ? -minor : minor;
}

/** A JS number as plain decimal text, refusing exponent forms that cannot be an exact amount. */
export function numberToDecimalText(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new MoneyError(`${n} is not a finite amount.`);
  const s = String(n);
  if (/e/i.test(s)) throw new MoneyError(`${s} is too large or too small to be an exact amount.`);
  return s;
}

/**
 * The exact Money literal for a target, from decimal text. `dialect` matches expr.mjs dialect names.
 * Returns null when the target has no exact Money representation wired up.
 */
export function moneyLiteral(dialect, text, minorUnits = MONEY_DEFAULT_MINOR_UNITS) {
  const minor = parseMoney(text, { minorUnits });
  const dec = formatMoney(minor, { minorUnits });
  switch (dialect) {
    case 'js': return `${minor}n`;
    case 'python': return `Decimal(${JSON.stringify(dec)})`;
    case 'csharp': return `${dec}m`;
    case 'java': return `new java.math.BigDecimal(${JSON.stringify(dec)})`;
    case 'go': return `int64(${minor})`;
    case 'rust': return `${minor}i64`;
    default: return null;
  }
}

/** Exact Money type per target dialect (null when the target has none wired up). */
export const MONEY_TYPES = {
  js: 'bigint', python: 'Decimal', csharp: 'decimal', java: 'java.math.BigDecimal', go: 'int64', rust: 'i64',
};

/** Render a Money comparison for a dialect from already-rendered operands. */
export function moneyCompare(dialect, op, a, b) {
  if (dialect === 'java') return `(${a}.compareTo(${b}) ${op} 0)`;
  if (dialect === 'js' && op === '==') return `(${a} === ${b})`;
  if (dialect === 'js' && op === '!=') return `(${a} !== ${b})`;
  return `(${a} ${op} ${b})`;
}
