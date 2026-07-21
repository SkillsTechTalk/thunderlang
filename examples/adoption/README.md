# Adoption case study: a feature-flag gate

A worked example of adopting ThunderLang on decision logic you already have,
without a rewrite. Full narrative: [docs/case-study-feature-flags](../../docs/case-study-feature-flags.md).

Files:
- `FeatureFlagRollout.thunder` , the intent (the contract): kill switch, allowlist, rollout, and a never-log rule on the override token, with in-file tests and four declared targets.
- `flag-eval.before.ts` , the original evaluator.
- `flag-eval.after.ts` , an AI-proposed change that logs the override token.

Run it (from the repo root, with `@skillstech/thunderlang` installed or via `npx`):

```bash
# Prove every declared language target agrees on the decision.
# --all-targets runs whichever toolchains are installed (Node always; python3, .NET, a JDK if present).
thunder conform examples/adoption/FeatureFlagRollout.thunder --all-targets

# Gate the AI's proposed change. Exit code 1 on BLOCK.
thunder verify-diff examples/adoption/FeatureFlagRollout.thunder \
  --before examples/adoption/flag-eval.before.ts \
  --after examples/adoption/flag-eval.after.ts
```

Expected: `conform` shows PASS for the semantic engine and every available target; `verify-diff` returns BLOCK, naming the `log the override token` never-rule and the offending line.
