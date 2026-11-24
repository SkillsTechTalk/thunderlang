// Code → Thunder → code for steps (see src/round-trip.mjs). Node only (runs Python for Python behavior).
import type { Expr } from './meaning.mjs';
export const ROUND_TRIP_LANGUAGES: string[];
export type StepTripResult = 'exact' | 'different' | 'code' | 'not-written' | 'not-read-back';
/** Read code as Thunder reads a file, and give back its first step's tree. */
export function rereadStatement(code: string, language: string): Expr | null;
/** Write a step's tree back as code, read it again, and compare the trees. */
export function stepRoundTrip(step: { expr?: Expr }, language: string): { result: StepTripResult; code?: string; back?: Expr; why?: string | null };
/** A condition or value of a step that can be run alone: its names, the original code, and the code written back. */
export function behaviorCase(step: { expr?: Expr }, sourceText: string, language: string): { names: string[]; original: string; written: string } | null;
/** Run original and written-back code on the same generated inputs. Go is not run (it says so). */
export function runBehavior(cases: { names: string[]; original: string; written: string }[], language: string): { result: 'same' | 'different' | 'not-run'; why?: string; tried?: number }[];
