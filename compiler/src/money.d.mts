/** Thunder Money: an exact decimal amount in minor units, never binary floating point. */
export class MoneyError extends Error {}
export const MONEY_DEFAULT_MINOR_UNITS: 2;
/** Minor units for an ISO 4217 code (2 when unknown or absent): JPY 0, USD 2, KWD 3. */
export function minorUnitsFor(currency?: string | null): number;
/** Minor units when `type` is `Money` or `Money(XXX)`, else null. */
export function moneyTypeMinorUnits(type: string): number | null;
/** Parse "12.30" (or "$12.30" with allowDollar) to exact minor units. Extra precision throws; nothing is rounded. */
export function parseMoney(text: string | number, opts?: { minorUnits?: number; allowDollar?: boolean }): bigint;
/** Render minor units as a decimal string with exactly `minorUnits` places. */
export function formatMoney(minor: bigint | number, opts?: { minorUnits?: number }): string;
/** Round half up (a half goes away from zero, as in Thunder Core) to `minorUnits` places. Use only where a spec asks for rounding. */
export function roundHalfUp(text: string | number, opts?: { minorUnits?: number }): bigint;
export function numberToDecimalText(n: number): string;
/** The exact Money literal for a target dialect, or null when the target has none wired up. */
export function moneyLiteral(dialect: string, text: string | number, minorUnits?: number): string | null;
export const MONEY_TYPES: Record<string, string>;
export function moneyCompare(dialect: string, op: string, a: string, b: string): string;
