import type { ThunderModel } from './model.d.mts';

export const EXECUTED_SCHEMA: 'thunder-executed-v1';
export const PY_TRACER: string;
export const JS_TRACER: string;

/** What a recorder writes: per file, per function (by its first line) and per decision (by its line). */
export interface Trace {
  files: Record<string, {
    functions: Record<string, { runs: number; returns: Record<string, { count: number; values: string[] }>; raises: Record<string, { count: number; types: Record<string, string[]> }>; fellOff: number; fellOffAt?: Record<string, number>; unwound?: number }>;
    /** obs keys are `<where>|<next line>`: where is body, orelse, after, end, or case:<line>. */
    decisions: Record<string, { kind: 'if' | 'while' | 'for' | 'match' | 'handler'; obs: Record<string, number> }>;
    /** Python: each return line -> the line of the innermost if / case holding it. */
    returns?: Record<string, number | null>;
    /** Python: first line of a compound statement -> its last line. */
    spans?: Record<string, number>;
  }>;
  runs?: RunInfo[];
}
export interface RunInfo { how: string; language: 'python' | 'js'; seconds: number; calls?: number; capped?: boolean; errors?: string[]; exit?: number | null; [k: string]: unknown }

export interface Mismatch { line: number; question: string | null; side: string; expected: string; observed: string; times: number }
export interface MemberResult {
  id: string; file: string; name: string; lines: [number, number]; language: string;
  /** executed: ran, and every claim the runs reached matched. not checked: ran, but reached nothing Thunder claims. */
  status: 'executed' | 'contradicted' | 'not checked' | 'not run';
  runs: number;
  questions: { drawn: number; checked: number };
  matched: number; notDrawn: number;
  decisions: { line: number; question: string | null; kind: string; observed: Record<string, number>; result: 'matched' | 'contradicted' | 'not drawn' }[];
  endings: { line: number | null; kind: 'return' | 'raise' | 'end of function'; count: number; values?: string[]; types?: string[]; after?: number[]; result: 'matched' | 'contradicted' | 'not drawn' }[];
  mismatches: Mismatch[];
}
export interface ExecutedResult {
  schema: 'thunder-executed-v1';
  members: MemberResult[];
  summary: { members: number; run: number; executed: number; contradicted: number; notChecked: number; notRun: number; questions: number; questionsChecked: number; claims: { matched: number; mismatched: number; notDrawn: number } };
  language?: 'python' | 'js';
  runs?: RunInfo[];
}
export interface VerifyRunOptions {
  lang?: 'python' | 'js'; tests?: string; pytest?: string | string[]; command?: string; cwd?: string; python?: string;
  trace?: string | Trace; generate?: boolean; maxSeconds?: number; maxCalls?: number;
}

export function compareRun(model: ThunderModel, trace: Trace, options?: { languages?: string[] | null }): ExecutedResult;
export function markExecuted(model: ThunderModel, result: ExecutedResult): ThunderModel;
export function mergeTraces(into: Trace, add: Trace): Trace;
export function runPython(root: string, options?: { mode?: 'generate' | 'discover' | 'pytest'; tests?: string; pytestArgs?: string[]; python?: string; maxSeconds?: number; maxCalls?: number; cwd?: string }): Trace;
export function runJs(root: string, options?: { mode?: 'generate' | 'command'; command?: string; node?: string; maxSeconds?: number; maxCalls?: number; cwd?: string }): Trace;
export function languageOf(root: string): 'python' | 'js';
export function verifyRun(root: string, options?: VerifyRunOptions): { result: ExecutedResult; model: ThunderModel; trace: Trace };
export function executedText(result: ExecutedResult, options?: { all?: boolean }): string;
