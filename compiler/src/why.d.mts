// Thunder Why: an AI agent's run explained in plain words (docs/why.md).
export interface WhyStep {
  n: number; depth: number;
  kind: 'agent' | 'model' | 'tool' | 'http' | 'db' | 'retrieve' | 'other';
  text: string; outcome: string; sentence: string; failed: boolean;
  effect: 'read' | 'change' | 'unknown' | 'none';
  tries: number; atMs: number | null; durationMs: number | null; span: string;
  details: Record<string, unknown>;
}
export interface WhyRun {
  ok: true; run: string; otherRuns: string[];
  status: 'finished' | 'finished-with-problems' | 'stopped';
  headline: string; asked: string | null; answered: string | null;
  problem: null | {
    step: number; inside: { step: number; text: string } | null; what: string; tries: number;
    before: { step: number; text: string } | null; wouldHaveChanged: string; next: string | null;
    details: Record<string, unknown>;
  };
  recovered: Array<{ step: number; text: string }>;
  warnings: Array<{ step: number; text: string }>;
  changes: Array<{ step: number; text: string; worked: boolean; basis: string; tries: number }>;
  unknown: Array<{ step: number; text: string }>;
  durationMs: number | null; steps: WhyStep[]; spanCount: number;
}
export function explainRun(input: string | object, options?: { run?: string }): WhyRun | { ok: false; why: string };
export function renderWhy(run: WhyRun | { ok: false; why: string }): string;
export function renderStep(run: WhyRun | { ok: false; why: string }, n: number | string): string;
export function plainError(error?: { type?: string | null; message?: string | null; status?: number | string | null; finish?: string | null }): { what: string; next: string | null };
