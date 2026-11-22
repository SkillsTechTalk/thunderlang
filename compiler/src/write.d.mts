export const WRITE_SCHEMA: 'thunder-write-v1';
export interface ChangedCase { inputs: Record<string, string | number | boolean>; before: string; after: string }
export interface ChangedCases { checked: number; changed: ChangedCase[]; note: string }
export interface WriteChange { line: number; column: number; before: string; after: string }
export function writeRule(args: {
  source: string; language?: string; file?: string; decision: string; line?: number | null;
  /** 1-based rule number, or 'otherwise' for the fallback answer. */
  rule: number | 'otherwise';
  /** The rule's new condition in Thunder form (amount < 75). Only numbers, comparisons, and text may change. */
  when?: string | null;
  /** The rule's new answer (Review). */
  answer?: string | null;
}):
  | { schema: 'thunder-write-v1'; ok: true; source: string; problems: []; decision: string; rule: number | 'otherwise'; change: WriteChange[]; before: string; after: string; cases: ChangedCases }
  | { schema: 'thunder-write-v1'; ok: false; source: string; problems: string[] };
export function changedCases(before: unknown, after: unknown): ChangedCases;
export type RulePart =
  | { kind: 'number'; value: number }
  | { kind: 'text'; value: string }
  | { kind: 'comparison'; value: '<' | '<=' | '>' | '>=' | '==' | '!='; words: string }
  | { kind: 'fixed'; value: string; words: string };
export const COMPARISON_CHOICES: Array<{ op: '<' | '<=' | '>' | '>=' | '==' | '!='; words: string }>;
export function ruleParts(when: string): RulePart[];
export function joinRuleParts(parts: RulePart[]): string;
