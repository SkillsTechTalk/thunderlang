// Types for core-changes.mjs: behaviour changes in Thunder Core programs, and what to look at again.

export const CORE_CHANGES_SCHEMA: 'thunder-core-changes-v1';
export const AFFECTED_SCHEMA: 'thunder-affected-v1';

export interface CoreFile { path: string; source: string }

/** A rule another one reaches: where it is, and the rules in between (via). */
export interface CoreRef { id: string; subject: string; kind: string; file: string; line: number; via?: string[]; test?: 'passes' | 'fails' }

export interface CoreBehaviourGroup {
  /** "now a review Refund instead of an approved Refund", or "still a review Refund, but its reason is now …" */
  says: string;
  /** The input that decides it, as the values tried: "amount is from $50.00 to $99.99". Null when no one input does. */
  where: string | null;
  count: number;
  example: string;
}

/** Both versions run on the same inputs: tested evidence on those inputs, not a proof. */
export type CoreBehaviour = { why: string } | { tried: number; unknown: number; stopped: boolean; changed: number; groups: CoreBehaviourGroup[] };

export interface CoreChange {
  /** A stable name from what the rule is: "function:decide refund", "keep:review limit", "endpoint:POST /orders". */
  id: string;
  kind: 'function' | 'endpoint' | 'keep' | 'record' | 'never' | 'store' | 'test' | 'main' | 'file';
  subject: string;
  change: 'added' | 'removed' | 'renamed' | 'changed' | 'affected' | 'not-compiled';
  severity: 'risk' | 'meaning';
  file: string;
  line: number;
  says: string;
  before: string[] | null;
  after: string[] | null;
  behaviour?: CoreBehaviour;
  /** For an affected function: the changed rule it reaches, and the rules in between. */
  through?: string[];
  affects: CoreRef[];
}

export interface CoreChanges {
  schema: 'thunder-core-changes-v1';
  files: string[];
  changes: CoreChange[];
  unchanged: number;
  problems: Array<{ file: string; diagnostics: Array<{ line: number; code: string; message: string }> }>;
}

export interface Affected {
  schema: 'thunder-affected-v1';
  of: CoreRef[];
  unknown: string[];
  functions: CoreRef[];
  endpoints: CoreRef[];
  tests: CoreRef[];
  examples: Array<{ file: string; line: number; test: string; says: string | null; reaches: string }>;
  rules: Array<CoreRef & { usedBy: string }>;
  stored: Array<CoreRef & { usedBy: string }>;
}

export function isCoreProgram(path: string, source: string): boolean;
export function coreChanges(oldFiles: CoreFile[], newFiles: CoreFile[]): CoreChanges;
export function affectedBy(files: CoreFile[], change: string | string[]): Affected;
export function renderAffected(r: Affected): string;
