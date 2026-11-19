export type ReadKind = 'decision' | 'function' | 'error' | 'test';
export interface ReadInput { name: string; type: string | null }
export interface ReadRule { when: string; result: string; line: number; says: string }
export interface ReadUnread { line: number; text: string; reason: string }
export interface ReadGuard {
  when: string | null; code: string; line: number; readable: boolean; says: string;
  effect: { kind: 'fails' | 'responds' | 'nothing' | 'stops' | 'returns' | 'returns-computed'; name?: string; detail?: string | null };
}
export interface ReadItem {
  id: string; kind: ReadKind; name: string; line: number; status: 'read' | 'partial' | 'signature-only';
  says: string; provenance: 'inferred-from-code';
  inputs?: ReadInput[]; returns?: string | null;
  rules?: ReadRule[]; otherwise?: { result: string; line: number } | null;
  thunder?: string; unread?: ReadUnread[]; guards?: ReadGuard[];
  route?: { method: string; path: string };
}
export interface Reading {
  schema: 'thunder-reading-v1'; language: string; detected: boolean; items: ReadItem[];
  counts: Record<ReadKind | 'partial' | 'guarded' | 'route', number>; limitations: string[];
}
export const READ_SCHEMA: 'thunder-reading-v1';
export const READ_LANGUAGES: string[];
export function detectLanguage(source: string, file?: string): string;
export function readCode(source: string, options?: { language?: string; file?: string }): Reading;
export function searchReading(reading: Reading, filter?: { query?: string; kinds?: Array<ReadKind | 'route' | 'guard'>; status?: string[] }): ReadItem[];
export function terminatorEffect(stmt: string, language: string): ReadGuard['effect'] | { kind: 'passes-error' } | null;
export function toThunderCondition(text: string, inputs?: string[]): string | null;
export function toThunderOutcome(text: string): string | null;
export function sayCondition(cond: string): string;
