// thunder-same-v1: does new code mean the same as old code? (see src/same.mjs)
export const SAME_SCHEMA: 'thunder-same-v1';
export type SameStatus = 'same' | 'different' | 'only-old' | 'only-new' | 'cannot-check';
type Where = { file: string; line: number; language: string };
export interface SameItem { name: string; status: SameStatus; reason: string; old?: Where; new?: Where; counterexample?: { values: Record<string, unknown>; facts: string; old: string; new: string } }
export interface SameReport { schema: 'thunder-same-v1'; verdict: 'same' | 'different' | 'partly-checked'; counts: Record<SameStatus, number>; items: SameItem[]; unreadable: { path: string; reason: string }[] }
export function nameKey(name: string): string;
export function compareRules(oldItem: unknown, newItem: unknown): { same: boolean; tried: number; reason?: string; counterexample?: SameItem['counterexample'] } | null;
export function comparePlainRules(a: unknown, b: unknown): { same: boolean; tried: number; reason?: string; counterexample?: SameItem['counterexample'] };
export function sameMeaning(oldFiles: { path: string; source: string }[], newFiles: { path: string; source: string }[]): SameReport;
export function renderSame(report: SameReport): string;
