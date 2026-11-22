import type { ObligationResolution, TestReport } from './index.js';
export function resolveObligations(ast: unknown): {
  obligations: ObligationResolution[];
  tests: TestReport;
  verified: number;
  declared: number;
  unverified: number;
  failed: number;
};
