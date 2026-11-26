import type { Passport, PassportCheck, PassportEvidence } from './passport.mjs';
export function buildPassport(options: {
  parts: string[]; base?: string | null; head?: string | null; run?: string[];
  purpose?: { text: string; source?: string } | null; evidence?: unknown[];
  /** The ownership check (accessFlow from src/flow/access.mjs), run per part when given. */
  access?: ((files: Array<{ path: string; source: string }>) => unknown) | null; relativeTo?: string; builtAt?: string; timeoutMs?: number;
}): Passport;
export function checkPassportOnDisk(passport: Passport, options?: { baseDir?: string; dirs?: Record<string, string> }): PassportCheck;
export function accessEvidence(report: unknown, partOf?: (file: string) => string | null): Array<Omit<PassportEvidence, 'id'>>;
