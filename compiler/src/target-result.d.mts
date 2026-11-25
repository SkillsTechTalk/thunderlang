/** The stable diagnostic code for a rule condition a target could not translate. */
export const GEN_UNTRANSLATED: 'IL-GEN-001';

/** Why a generated or executed case did not produce an answer. */
export type TargetErrorKind =
  | 'missing-toolchain'
  | 'compile-failed'
  | 'runtime-error'
  | 'timeout'
  | 'assertion-failed'
  | 'not-translated'
  | 'missing-input';
export const ERROR_KINDS: TargetErrorKind[];

/**
 * One case's result. A real null answer is `{ status: 'ok', value: null }`; a failure is always
 * `{ status: 'error', kind, message }`, never a null value.
 */
export type CaseResult =
  | { status: 'ok'; value: unknown }
  | { status: 'error'; kind: TargetErrorKind; message: string };

/** A live target run: per-case results, or a whole-run failure (toolchain missing, compile failure, crash, timeout). */
export type TargetRun =
  | { status: 'ok'; results: Record<string, CaseResult> }
  | { status: 'error'; kind: TargetErrorKind; message: string };

/** An IL-GEN-001 generation diagnostic. */
export interface GenerationDiagnostic {
  code: 'IL-GEN-001';
  severity: 'error';
  message: string;
  target: string;
  decision: string | null;
  rule: string | null;
  condition: string | null;
  reason: string;
}

export function okResult(value: unknown): CaseResult;
export function errorResult(kind: TargetErrorKind, message: string): CaseResult;
export function isCaseResult(v: unknown): v is CaseResult;
export function untranslatedMessage(when: string, target: string, reason: string): string;
export function runFailure(kind: TargetErrorKind, message: string): TargetRun;
export function finishRun(args: { cases: Array<{ key: string }>; parsed: Record<string, unknown> | null; refused?: Record<string, CaseResult>; target: string }): TargetRun;
export function classifySpawn(r: unknown, opts?: { tool?: string; phase?: 'compile' | 'run' | 'build+run'; runtimePattern?: RegExp | null }): TargetRun;
/** Plain values of a run's ok cases (errors dropped); null for a whole-run failure. */
export function runValues(run: TargetRun | null): Record<string, unknown> | null;
