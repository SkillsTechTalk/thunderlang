// Writing in Thunder (see src/write-steps.mjs): change software in Thunder; the code is written and proven.
export const WRITE_STEPS_SCHEMA: 'thunder-write-steps-v1';
export const WRITE_STEPS_LANGUAGES: string[];
export const EDIT_OPS: ThunderEdit['op'][];

/** A function: a model member id (path#owner#name#line), "path:name[:line]", a bare name, or { file, name, line }. */
export type MemberRef = string | { file?: string; name: string; line?: number };
/** A step: "line:12" (or 12), a path from 0 such as "1.0" or [1, 'else', 0], or a flow node id such as "n4". */
export type StepRef = string | number | (number | 'else')[];
/** Code a person writes for a value or condition, in Thunder's neutral form or the file's language; or a tree. */
export type CodeText = string;
export type NewStep = CodeText | { if: CodeText; then?: NewStep[]; else?: NewStep[] } | { stop: string; error?: string };
type Where = { before: StepRef } | { after: StepRef } | { into: StepRef | { step: StepRef; side?: 'yes' | 'no'; at?: 'start' | 'end' } };

export type ThunderEdit =
  | { op: 'setValue'; member: MemberRef; step: StepRef; from?: unknown; to: number | string | boolean | null; at?: number }
  | { op: 'setCondition'; member: MemberRef; step: StepRef; clause?: number; when?: CodeText; compare?: '<' | '<=' | '>' | '>=' | '==' | '!='; operand?: { side?: 'left' | 'right'; to: CodeText }; negate?: boolean; addClause?: { join?: 'and' | 'or'; when: CodeText }; removeClause?: number }
  | ({ op: 'addStep'; member: MemberRef; step?: NewStep; steps?: NewStep[] } & Where)
  | { op: 'removeStep'; member: MemberRef; step: StepRef }
  | ({ op: 'moveStep'; member: MemberRef; step: StepRef } & ({ before: StepRef } | { after: StepRef }))
  | ({ op: 'addStop'; member: MemberRef; when: CodeText; message: string; error?: string } & ({ before: StepRef } | { after: StepRef }))
  | { op: 'addStop'; member: MemberRef; step: StepRef; side?: 'yes' | 'no'; message: string; error?: string }
  | { op: 'removeStop'; member: MemberRef; step: StepRef }
  | { op: 'addInput'; member: MemberRef; name: string; type?: string; default?: unknown }
  | { op: 'removeInput'; member: MemberRef; name: string }
  | { op: 'setGivesBack'; member: MemberRef; step?: StepRef; value?: CodeText; type?: string }
  | { op: 'rename'; member: MemberRef; from?: string; to: string }
  | { op: 'addFunction'; file?: string; name: string; inputs?: (string | { name: string; type?: string })[]; returns?: string; steps: NewStep[]; after?: MemberRef; export?: boolean };

export interface ShapeStep { e: unknown; c: ShapeStep[]; o?: ShapeStep[]; h?: { e: unknown; c: ShapeStep[] }[]; a?: ShapeStep[] }
export interface WriteProof {
  edited: { status: 'proven' | 'failed' | 'not-checked'; checks: { member: string; file: string; result: 'exact' | 'different' | 'missing'; steps?: number }[]; note?: string };
  unchanged: { status: 'same' | 'failed'; checked: number; items: { name: string; file: string; line?: number; status: 'same' | 'different' | 'missing' | 'new'; reason?: string; note?: string; same?: string }[] };
  /** Filled by a caller that runs something (the CLI's --test). */
  run?: { command: string; passed: boolean; exit: number | null; seconds: number; output: string };
}
export interface ThunderWriteResult {
  schema: 'thunder-write-steps-v1';
  status: 'written' | 'needs-ai' | 'refused';
  edits: ThunderEdit[];
  /** Who wrote the code: the compiler, or an AI (checked with `options.candidate`; labeled "AI-written"). */
  author?: 'thunder' | 'ai';
  label?: 'AI-written';
  /** A unified diff of every changed file. */
  patch?: string;
  /** The changed files' new text (nothing is written to disk). */
  files?: Record<string, string>;
  /** The edited function in Thunder, before and after. */
  before?: string | null;
  after?: string | null;
  proof?: WriteProof;
  /** In plain words: "Changed 7 to 10 in …; nothing else changed: …". */
  says: string;
  reason?: string;
  /** For 'needs-ai': a self-contained instruction for an AI coding agent. */
  prompt?: string;
  /** For 'needs-ai' when the compiler's own patch failed its proof: that patch and proof, for inspection only. */
  rejected?: { patch: string; proof: unknown };
}
export function thunderWrite(files: { path: string; source: string }[] | Record<string, string>, edits: ThunderEdit | ThunderEdit[], options?: { candidate?: Record<string, string> }): ThunderWriteResult;
export function proveChange(before: Map<string, string>, after: Map<string, string>, plans: unknown[]): { ok: boolean; edited: WriteProof['edited']; unchanged: WriteProof['unchanged']; problems: string[] };
export function stepShape(steps: unknown[]): ShapeStep[];
export function unifiedDiff(path: string, before: string, after: string): string;
export function describeEdit(edit: ThunderEdit): string;
