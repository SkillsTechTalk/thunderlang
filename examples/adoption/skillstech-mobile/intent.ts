// SkillsTech Mobile , `src/lib/intent.ts`
// The thin, deterministic data layer that turns one `.thunder` source into what a mobile
// "Overview + Map" screen renders. It runs the SAME compiler as OpenThunder and the CLI:
// nothing here is re-implemented, and there is no AI. Drop this file into `src/lib/`.
//
// Requires: `@skillstech/thunderlang` installed. React Native 0.81 / Expo 54 resolve the
// `/core` subpath with no metro config change (Metro enables package `exports` by default
// from RN 0.79). See jest note in README-adopt-mobile.md for the one test-config line.

import {
  parseIntent,
  buildIntentGraph,
  buildAtlas,
  buildFocusGraph,
  intentBrief,
  scanProject,
  coverageView,
} from '@skillstech/thunderlang/core';
import type {
  FocusGraph,
  IntentBrief,
  ScanResult,
} from '@skillstech/thunderlang/core';

export interface MissionLens {
  /** Plain-language what/who/guarantees/risks , the Overview screen. */
  brief: IntentBrief;
  /** The focused subgraph , the Map screen (nodes tagged by why they are in focus). */
  focus: FocusGraph;
  /** Verification coverage 0..100 , the Proof badge. */
  coverage: number;
  /** True when the scope includes low-confidence inferred intent (show a review chip). */
  needsReview: boolean;
}

/**
 * Turn one `.thunder` source into the data a mobile lens screen renders. Deterministic:
 * the same source always yields the same lens, so it is safe to memoize by content hash.
 */
export function missionLens(source: string, depth = 2): MissionLens {
  const atlas = buildAtlas([buildIntentGraph(parseIntent(source))]);
  const seedId = atlas.missions[0]?.id;
  const focus = buildFocusGraph(atlas, { seeds: seedId ? [seedId] : [], depth });
  const scan: ScanResult = scanProject([{ file: 'mobile.thunder', source }]);
  const coverage = coverageView(scan).coverage;
  const brief = intentBrief(focus);
  return { brief, focus, coverage, needsReview: brief.needsReview };
}
