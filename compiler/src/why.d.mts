// Thunder Why: an AI agent's run explained in plain words (docs/why.md).
export type EffectKind = 'money' | 'delete' | 'send' | 'create' | 'change' | 'read';
export const EFFECT_KINDS: EffectKind[];
export interface WhyEffect { step: number; kind: EffectKind; basis: 'declared' | 'method' | 'operation' | 'name' | 'kind'; text: string; name: string; worked: boolean; tries: number }
export interface WhyStep {
  n: number; depth: number;
  kind: 'agent' | 'model' | 'tool' | 'http' | 'db' | 'retrieve' | 'other';
  text: string; outcome: string; sentence: string; failed: boolean;
  effect: EffectKind | 'unknown' | 'none';
  tries: number; atMs: number | null; durationMs: number | null; span: string;
  details: Record<string, unknown>;
}
export interface WhyRun {
  ok: true; run: string; otherRuns: string[];
  status: 'finished' | 'finished-with-problems' | 'stopped';
  headline: string; asked: string | null; answered: string | null;
  problem: null | {
    step: number; short: string; inside: { step: number; text: string } | null; what: string; tries: number;
    before: { step: number; text: string } | null; wouldHaveChanged: string; next: string | null;
    details: Record<string, unknown>;
  };
  recovered: Array<{ step: number; text: string; short: string }>;
  warnings: Array<{ step: number; text: string; short: string }>;
  /** Everything the run did to the world (outermost steps only). */
  effects: WhyEffect[];
  /** The effects that are not reads. */
  changes: WhyEffect[];
  allowed?: EffectKind[];
  notAllowed?: WhyEffect[];
  unknown: Array<{ step: number; text: string }>;
  durationMs: number | null; steps: WhyStep[]; spanCount: number;
}
export function explainRun(input: string | object, options?: { run?: string; tools?: Map<string, object | null> | null; allow?: EffectKind[] | null }): WhyRun | { ok: false; why: string };
export function toolAnnotations(input: string | object): Map<string, object | null>;
export function renderWhy(run: WhyRun | { ok: false; why: string }, options?: { file?: string }): string;
export function renderFull(run: WhyRun | { ok: false; why: string }): string;
export function renderStep(run: WhyRun | { ok: false; why: string }, n: number | string): string;
export function plainError(error?: { type?: string | null; message?: string | null; status?: number | string | null; finish?: string | null }): { what: string; next: string | null };
