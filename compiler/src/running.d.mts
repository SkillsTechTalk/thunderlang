// The running system (see src/running.mjs): evidence of what ran, placed on Thunder's flows.
import type { ThunderModel, FlowNode, When } from './model.d.mts';
import type { Trace } from './executed.d.mts';

export const RUNNING_SCHEMA: 'thunder-running-v1';

/** One piece of evidence. Every adapter (fromTrace, fromStack, fromLogs, fromOtlp) gives these. */
export interface RunEvent {
  source: 'trace' | 'stack' | 'logs' | 'otlp' | string;
  kind: 'decision' | 'return' | 'raise' | 'call' | 'line';
  file: string | null;
  line: number | null;
  /** decision: 'held' | 'not held' (the code's condition), 'yes' | 'no', 'case:<line>', 'each' | 'done', 'handled'. */
  side?: string;
  error?: string;
  message?: string;
  /** return: the values given back (as the recorder wrote them). */
  value?: string[];
  durationMs?: number;
  count?: number;
  function?: string | null;
  /** call: how many of these calls ended with an error. */
  failed?: number;
  /** raise: the stack's frames, innermost first; placed on the first frame in code Thunder read. */
  frames?: { file: string | null; line: number | null; function?: string; internal?: boolean }[];
  /** raise: this error ended the call (an uncaught stack trace), so it counts as a failure of the member. */
  ends?: boolean;
  /** A recorder's event: the first line of the function it was recorded in. */
  fnLine?: number;
  /** Evidence that names no place in the code: why. Listed under notMatched. */
  unplaced?: string;
  [k: string]: unknown;
}

export interface NodeRun {
  id: string; kind: FlowNode['kind']; text: string; line: number | null;
  /** Times seen: a question asked, a Stop or ending reached, a logged step. Absent when no evidence says. */
  ran?: number;
  /** A question: times each side was taken ("Yes", "No", a case's label, "For each", "Done"). */
  sides?: Record<string, number>;
  /** A Stop: the errors seen there. */
  errors?: { error: string; message?: string; count: number }[];
  /** A step: the errors it failed with. */
  failed?: { error: string; message?: string; count: number }[];
  /** A logged step: log lines by level. */
  levels?: Record<string, number>;
  values?: string[];
  /** The evidence named a line inside this step (a statement over several lines). */
  approximate?: true;
}

export interface MemberRun {
  id: string; name: string; label: string; file: string; lines: [number, number];
  calls: number; failures: number;
  timing?: { count: number; avgMs: number; maxMs: number };
  errors?: { error: string; message?: string; count: number }[];
  logged?: number;
  nodes: Record<string, NodeRun>;
  /** The most-taken way through the flow: at each question the side seen most. Empty without questions. */
  hotPath: { id: string; text: string; side?: string; count: number }[];
  /** The Details sentence: "Ran 1,204 times; stopped with NotFound 37 times (3%), when Is user set? was No." */
  says: string;
  sources: string[];
}

export interface RuntimeOverlay {
  schema: 'thunder-running-v1';
  members: Record<string, MemberRun>;
  notMatched: { source: string; kind: string; file: string | null; line: number | null; function?: string; what: string; reason: string; count: number }[];
  sources: Record<string, number>;
  summary: { members: number; events: number; notMatched: number };
}

export interface ParsedStack {
  language: 'python' | 'javascript' | 'java' | 'csharp' | 'go';
  error: string; message: string;
  /** Innermost (where it failed) first. */
  frames: { file: string | null; line: number | null; function?: string; internal?: boolean; className?: string }[];
  causes?: { error: string; message: string }[];
  wrappedIn?: { error: string; message: string }[];
}

export interface ErrorExplanation {
  matched: boolean; text: string; reason?: string;
  error?: string; message?: string; language?: string; file?: string; line?: number;
  member?: { id: string; label: string; name: string };
  step?: { id: string; text: string; kind: string; line: number | null; approximate?: true } | null;
  /** The answers that lead to the step in the flow as drawn; null when the flow does not show them. */
  path?: When[] | null;
  calledFrom?: { member: { id: string; label: string }; step: { id: string; text: string; line?: number } | null; line: number; file: string }[];
  raisedInside?: string[];
}

export function countWords(n: number): string;
export function fromTrace(trace: Trace): RunEvent[];
export function parseStack(text: string): ParsedStack | null;
export function parseStacks(text: string): ParsedStack[];
export function fromStack(text: string, options?: { count?: number }): RunEvent[];
export function fromLogs(text: string): RunEvent[];
export function fromOtlp(input: string | object): RunEvent[];
export function runtimeOverlay(model: ThunderModel, evidence: RunEvent[]): RuntimeOverlay;
export function explainError(model: ThunderModel, stack: string | ParsedStack): ErrorExplanation;
export function nodeNote(run: NodeRun | undefined): string;
export function runtimeText(model: ThunderModel, overlay: RuntimeOverlay, options?: { member?: string | null; top?: number }): string;
