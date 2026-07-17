// SkillsTech Mobile , `__tests__/intent.test.ts`
// Proves the shared compiler runs in the mobile (jest-expo) toolchain and that the lens data
// a screen renders is correct. No AI, no network, deterministic.

import { missionLens } from '../src/lib/intent';

const SRC = `mission SuspendAccount
goal
  Suspend an account immediately
guarantee active sessions are revoked
  verify sessions fail immediately test
never allow access after suspension
  verify suspended user cannot authenticate test
`;

describe('missionLens (shared @skillstech/thunderlang/core compiler)', () => {
  it('produces a brief, a focus graph, and coverage from one .thunder source', () => {
    const lens = missionLens(SRC);
    expect(lens.brief.what).toBe('SuspendAccount');
    expect(lens.brief.guarantees.length).toBe(1);
    expect(lens.brief.prohibitions.length).toBe(1);
    expect(lens.focus.overview.nodes).toBeGreaterThan(1);
    expect(lens.coverage).toBe(100); // both claims carry a verify
    expect(lens.needsReview).toBe(false);
  });

  it('is deterministic (same source -> same focus fingerprint)', () => {
    expect(missionLens(SRC).focus.freshness).toBe(missionLens(SRC).focus.freshness);
  });
});
