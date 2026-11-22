export const PLAIN_SCHEMA: 'thunder-plain-v1';
export const COMPARISONS: ReadonlyArray<{ op: '>=' | '<=' | '<' | '>' | '=='; words: string[] }>;
export type PlainInput =
  | { id: string; kind: 'dollars' | 'number'; label: string }
  | { id: string; kind: 'yesno'; label: string; yes: string; no: string };
export type PlainCondition = { input: string; op: '>=' | '<=' | '<' | '>' | '==' | 'is'; value: number | boolean };
export type PlainRule = { outcome: string; join: 'all' | 'any'; conditions: PlainCondition[] };
export type PlainExample = { name: string; values: Record<string, number | boolean>; expected: string };
export interface PlainModel {
  schema: 'thunder-plain-v1';
  title: string; why: string; question: string;
  inputs: PlainInput[]; rules: PlainRule[]; otherwise: string; examples: PlainExample[];
}
export interface PlainCheck { text: string; ok: boolean; actual: string; input: string }
export interface PlainExplanation { outcome: string | null; ruleIndex: number; rules: Array<{ outcome: string; join: 'all' | 'any'; checks: PlainCheck[] }>; ok: boolean }
export interface PlainPreview {
  schema: 'thunder-plain-v1'; experimental: true; model: PlainModel; canonicalSource: string; plainSource: string;
  tests: { total: number; passed: number; failed: number; results: Array<{ name: string; values: Record<string, number | boolean>; expected: unknown; actual: unknown; pass: boolean }> };
  application: 'not_checked';
}
export function parsePlainContract(source: string): PlainModel;
export function renderPlainContract(model: PlainModel): string;
export function plainToThunder(model: PlainModel): string;
export function compilePlainContract(source: string): string;
export function conditionText(model: PlainModel, condition: PlainCondition): string;
export function formatValue(input: PlainInput, value: number | boolean): string;
export function outcomesOf(model: PlainModel): string[];
export function explainPlain(model: PlainModel, values: Record<string, number | boolean>): PlainExplanation;
export function previewPlainContract(sourceOrModel: string | PlainModel): PlainPreview;
export function plainFromReading(item: unknown): (PlainModel & { provenance: 'inferred-from-code'; needsReview: string[] }) | null;
