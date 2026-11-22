import type { Diagnostic, ObligationResolution, TestReport } from './index.js';
export const REVIEW_ATLAS_SCHEMA: 'intent-review-atlas-v1';
export type ReviewFile = { path: string; source: string };
export type ReviewStatus = 'invalid' | 'failed' | 'needs-evidence' | 'checked';
export interface ReviewAtlasRow {
  file: string; sourceHash: string; missionId: string | null; mission: string; goal: string;
  risk: 'high' | 'medium' | 'low'; riskFactors: string[];
  claims: ObligationResolution[]; diagnostics: Diagnostic[]; tests: TestReport;
  issues: string[]; status: ReviewStatus; nextActions: string[];
  snapshot: { status: 'not-imported' | 'ambiguous' | 'missing' | 'unavailable' | 'stale' | 'reported-failure' | 'matched'; reason: string; file?: string; sourceHash?: string | null; compilerVersion?: string | null };
}
export interface ReviewAtlas {
  schema: typeof REVIEW_ATLAS_SCHEMA; compilerVersion: string; product: string | null; scope: string;
  files: ReviewAtlasRow[];
  summary: { files: number; checked: number; failed: number; invalid: number; needsEvidence: number; tests: number; testsPassed: number; testsFailed: number; claims: number; verifiedClaims: number; staleSnapshots: number };
}
export function buildReviewAtlas(files: ReviewFile[], opts?: { product?: string; evidence?: unknown }): ReviewAtlas;
export function renderReviewBrief(atlas: ReviewAtlas, opts?: { limit?: number }): string;
export function reviewAtlasExitCode(atlas: ReviewAtlas, opts?: { strict?: boolean }): number;
