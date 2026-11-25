// The pull request comment for a Thunder review (see src/review-comment.mjs).
import type { Review, ReviewItem } from './review.mjs';
export const REVIEW_MARKER: '<!-- thunder-review -->';
export const GITHUB_COMMENT_LIMIT: 65536;
export const COMMENT_TITLE: string;
/** explained: put into sentences; code: shown as the code before and after; person: Thunder cannot check it. */
export function itemHow(item: ReviewItem): 'explained' | 'code' | 'person';
export function reviewCounts(review: Review): { explained: number; code: number; person: number; notRead: number };
export function countsLine(counts: { explained: number; code: number; person: number; notRead: number }): string;
export function renderReviewComment(review: Review, options?: {
  maxChars?: number;
  fileUrl?: ((file: string, line: number) => string | null) | null;
  notes?: string[];
  footer?: string;
  evidenceLines?: number;
}): string;
