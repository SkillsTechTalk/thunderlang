# SkillsTech Mobile , adopt the shared compiler

A verified, turnkey adoption of `@skillstech/thunderlang` in SkillsTech Mobile. Mobile becomes
a *consumer* of the one compiler , it renders intent, it does not re-implement any of it.

**Verified compatibility** (inspected 2026-07-13): React Native 0.81.5, Expo ~54, TypeScript
5.6, jest-expo. RN ≥ 0.79 resolves the package `exports` map by default, so **no
`metro.config.js` change is needed**. The `/core` surface is engine-safe (no `TextEncoder`,
`Buffer`, or `node:` builtins). The `intent.ts` module below **typechecks against the packed
tarball** with `strict` + `moduleResolution: bundler`.

## Steps

1. Install (after `@skillstech/thunderlang@0.1.1` is published):

   ```bash
   npx expo install @skillstech/thunderlang
   ```

2. Copy `intent.ts` into `src/lib/intent.ts` and `intent.test.ts` into `__tests__/`.

3. Let jest-expo transform the ESM package , add it to the `transformIgnorePatterns`
   allowlist in `package.json` (jest-expo ignores `node_modules` by default):

   ```json
   {
     "jest": {
       "preset": "jest-expo",
       "transformIgnorePatterns": [
         "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@skillstech/thunderlang))"
       ]
     }
   }
   ```

   (The package is pure ESM; this lets babel-jest transform it. Not needed for the app bundle,
   only for jest.)

4. `npm test` , the `missionLens` test passes.

## Use it in a screen

```tsx
import { missionLens } from '../lib/intent';

const lens = missionLens(intentSource);           // deterministic; memoize by source hash
// Overview:  lens.brief.what, lens.brief.who, lens.brief.guarantees, lens.brief.risks
// Map:       lens.focus.nodes (each with .focusReason + .depth), lens.focus.relationships
// Proof:     lens.coverage (0..100)
// Review:    lens.needsReview  -> show a "low-confidence" chip
```

## Why this is safe

- Same functions, same graph shape, same `intentProofHash` as OpenThunder and the CLI.
- Deterministic and offline: no AI, no network. AI-driven practice belongs to Skills Tech Talk
  (via SkillsTech Runtime); deterministic mastery belongs to Repo Mastery. Mobile just renders.
- The compiler's universal boundary is enforced by a conformance test upstream, so a future
  release cannot silently break the mobile build.
