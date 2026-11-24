// thunder-review-v1: what a change did to the meaning of the code (see src/review.mjs).
export const REVIEW_SCHEMA: 'thunder-review-v1';
export const REVIEW_MARKER: '<!-- thunder-review -->';
export type ReviewSeverity = 'risk' | 'meaning' | 'form';
export type ReviewKind =
  | 'unreadable' | 'not-read' | 'infrastructure' | 'address' | 'outside' | 'hidden' | 'steps'
  | 'stop-added' | 'stop-removed' | 'stop-changed' | 'effect-added' | 'effect-removed' | 'effect-changed'
  | 'input-added' | 'input-removed' | 'gives-back-added' | 'gives-back-removed' | 'gives-back-changed' | 'relies-on'
  | 'rule-limit' | 'rule-answer' | 'rule-new-answer' | 'rule-removed-answer' | 'rule-facts'
  | 'added' | 'removed' | 'renamed' | 'moved' | 'thing' | 'form';
export interface ReviewEvidence {
  /** Before and after Thunder lines (or code lines, for code Thunder does not explain); "> " marks a changed line. */
  before?: string[] | null; after?: string[] | null;
  /** For a rule: one case that was run on both versions and gave different answers. */
  counterexample?: { facts: string; before: string; after: string; values: Record<string, unknown> };
}
export interface ReviewItem { kind: ReviewKind; severity: ReviewSeverity; subject: string; where: { file: string; line: number }; says: string; evidence?: ReviewEvidence;
  /** The same sentence about other actions or functions, said once. */
  also?: { subject: string; where: { file: string; line: number }; evidence?: ReviewEvidence }[] }
export interface Review {
  schema: 'thunder-review-v1';
  summary: { meaning: number; risk: number; form: number; unchanged: number; files: number };
  /** "3 changes in meaning, 1 risk, 12 form-only." */
  says: string;
  /** Ordered by importance: risk, then meaning, then form. */
  items: ReviewItem[];
  /** Changed files Thunder does not read (infrastructure and pipelines are items instead). */
  notRead: { path: string; status: 'added' | 'removed' | 'changed' }[];
}
export function thunderReview(oldFiles: { path: string; source: string }[], newFiles: { path: string; source: string }[]): Review;
export function renderReview(review: Review, options?: { title?: string; maxChars?: number; footer?: string }): string;
export type CodeToken = { t: string; k: 'id' | 'str' | 'num' | 'op' | 'nl' | 'indent' | 'dedent' };
export function codeTokens(source: string, language: string | null): CodeToken[];
export function localRenames(a: CodeToken[], b: CodeToken[], language: string, allowed?: string[]): [string, string][] | null;
export function lineChanges(oldLines: string[], newLines: string[], max?: number): { before: string[]; after: string[] };
