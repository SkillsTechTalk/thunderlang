// Types for the Thunder Software Passport (passport.mjs, passport-fs.mjs). Spec: docs/passport.md.
export const PASSPORT_SCHEMA: 'thunder-passport-v1';
export const ALWAYS_NOT_VERIFIED: string[];
export interface PassportInput { part: string; file: string; sha256: string | null }
export interface PassportEvidence {
  id: string;
  kind: 'test-run' | 'trace-link' | 'review' | 'accuracy-gate' | 'conformance' | 'access-flow' | string;
  /** passed / failed: a command ran; read: read from code, nothing was run. */
  status: 'passed' | 'failed' | 'read';
  claim: string;
  basis: { command?: string; cwd?: string; exitCode?: number; outputDigest?: string; outputTail?: string; from?: string; to?: string; base?: string; head?: string; [k: string]: unknown };
  /** What this evidence does not cover. */
  scope: string;
  /** The files it depended on, by content hash; when one changes, the item is stale. */
  inputs: PassportInput[];
}
export interface Passport {
  schema: 'thunder-passport-v1';
  subject: { kind: 'change' | 'feature'; parts: Array<{ name: string; path: string; sha: string | null; dirty: boolean }> };
  purpose: { stated: boolean; text: string; source: string | null };
  behavior: Array<{ part: string; file: string; lines: [number, number]; name: string; kind: string; change?: 'added' | 'changed' | 'removed'; text: string }>;
  dependencies: { files: PassportInput[]; links: Array<{ kind: string; says: string; from: string; to: string }>; packages: Array<{ name: string; version?: string; from: string; dev?: boolean }>; services: Array<{ part: string; calls: string; at: string }> };
  effects: Array<{ part: string; file: string; line: number; in: string; kind: 'reads' | 'writes' | 'sends' | 'deletes' | 'calls another part' | 'sends the person to'; says: string; how: 'detected' | 'observed' | 'declared'; basis: string }>;
  evidence: PassportEvidence[];
  unknowns: { notRead: Array<{ part: string; file: string; line: number; what: string }>; notLinked: Array<{ kind: string; call: string; at: string; why: string }>; untested: Array<{ part: string; what: string }>; notShown?: string; notVerified: string[] };
  history: { base: string | null; head: string | null; changedFiles: Array<{ part: string; file: string; status: string }>; thunder: string | null; builtAt: string };
  summary: { claims: number; passed: number; failed: number; readFromCode: number; unknowns: number; notVerified: number };
  fingerprint: string;
}
export interface PassportCheck {
  schema: 'thunder-passport-check-v1'; current: number; stale: number;
  items: Array<{ id: string; kind: string; claim: string; freshness: 'current' | 'stale' | 'unknown'; changed: Array<{ part: string; file: string; now: 'changed' | 'missing' }> }>;
  changedFiles: Array<{ part: string; file: string; now: 'changed' | 'missing' }>;
}
export function assemblePassport(input: {
  parts: Array<{ name: string; path?: string; sha?: string | null; dirty?: boolean; files: Array<{ path: string; source: string }>; packages?: Passport['dependencies']['packages']; changes?: Array<{ file: string; status: 'added' | 'changed' | 'removed'; ranges: Array<[number, number]>; old?: string | null }> }>;
  change?: { base: string; head: string | null } | null;
  runs?: Array<{ command: string; part: string | null; cwd: string; exitCode: number; output: string }>;
  purpose?: { text: string; source?: string } | null;
  extra?: Array<Omit<PassportEvidence, 'id'>>;
  builtAt?: string; thunder?: string | null;
}): Passport;
export function summarize(passport: Omit<Passport, 'summary' | 'fingerprint'>): Passport['summary'];
export function checkPassport(passport: Passport, options: { read: (part: string, file: string) => string | null }): PassportCheck;
export function renderPassportSummary(passport: Passport): string;
export function renderPassportMarkdown(passport: Passport): string;
