# Case study: a feature-flag gate, proven across four languages

Every product has a feature-flag evaluator: a kill switch, an allowlist, a percentage rollout. It is small, it is copied between services, and when it drifts (a refactor that forgets the kill switch, an AI edit that logs the override token) the blast radius is everyone. This is a good first mission to adopt ThunderLang on, because the logic is real, the failure is expensive, and the whole loop fits on one page. The runnable files are in [`examples/adoption/`](https://github.com/SkillsTechTalk/thunderlang/tree/main/examples/adoption).

## 1. Bootstrap intent from the code you already have

Start from an existing evaluator and let `lift` recover a first draft. It is deliberately humble and tells you what a human must still decide:

```text
$ thunder lift flag-eval.before.ts
thunder lift flag-eval.before.ts -> .intent/flagstate.thunder
  [warning] INTENT_LIFT_NEEDS_HUMAN_REVIEW: This intent was inferred from code. A human must review goal, why, never rules, and verification.
  [warning] INTENT_LIFT_NO_TEST_EVIDENCE: No tests found. Guarantees could not be grounded in verification evidence.
  [warning] INTENT_LIFT_SECURITY_REVIEW_NEEDED: Sensitive field names detected. Mark them Secret/Token/PII and add never-log rules.
```

## 2. Author the contract

A human reviews the draft and turns it into intent that states what must hold, not just what the code does today:

```intent
mission FeatureFlagRollout

goal
  Decide whether a feature flag is on for a given user

input
  flagEnabled: Boolean
  userAllowlisted: Boolean
  userInRolloutBucket: Boolean
  overrideToken: Secret

output
  state: FlagState

guarantee a disabled flag is off for everyone
  because a kill switch that leaks is not a kill switch
  verify test FlagDecision

guarantee an allowlisted user on an enabled flag is on
  because the allowlist is how we dogfood before rollout
  verify test FlagDecision

never log the override token
  because the override token lets anyone force a flag state
  verify test raw override token not logged

decision FlagDecision
  inputs
    flagEnabled
    userAllowlisted
    userInRolloutBucket
  rule killSwitch
    when flagEnabled == false
    return Off
  rule allowlist
    when userAllowlisted == true
    return On
  rule rollout
    when userInRolloutBucket == true
    return On
  default
    return Off

test FlagDecision
  case disabled beats allowlist
    given flagEnabled false, userAllowlisted true, userInRolloutBucket true
    expect Off
  case allowlisted user is on
    given flagEnabled true, userAllowlisted true, userInRolloutBucket false
    expect On
  case rollout bucket is on
    given flagEnabled true, userAllowlisted false, userInRolloutBucket true
    expect On
  case default is off
    given flagEnabled true, userAllowlisted false, userInRolloutBucket false
    expect Off
```

## 3. Prove every target agrees

The same test cases run against the decision compiled to each declared language. `--all-targets` executes every toolchain that is installed and grades the real output:

```text
$ thunder conform FeatureFlagRollout.thunder --all-targets
thunder conform FeatureFlagRollout.thunder: 4 case(s) · semantic + 4 target(s)
                                           Semantic  Typescript  Python    Csharp    Java
  FlagDecision / disabled beats allowlist  PASS      PASS        PASS      PASS      PASS
  FlagDecision / allowlisted user is on    PASS      PASS        PASS      PASS      PASS
  FlagDecision / rollout bucket is on      PASS      PASS        PASS      PASS      PASS
  FlagDecision / default is off            PASS      PASS        PASS      PASS      PASS
```

The kill switch is not a comment or a code review convention now. It is a rule that TypeScript, Python, C#, and Java are all held to, from one source of truth.

## 4. Gate the AI's change before it merges

An assistant is asked to add logging. It writes a reasonable-looking line that happens to send the override token to the logs. `verify-diff` refuses it:

```text
$ thunder verify-diff FeatureFlagRollout.thunder \
    --before flag-eval.before.ts --after flag-eval.after.ts
thunder verify-diff FeatureFlagRollout.thunder vs flag-eval.after.ts: BLOCK (1 blocking, 1 regression(s))
  [VIOLATION] Added code may violate never-rule "log the override token": console.log("evaluating flag", { userAllowlisted, overrideToken });  (line 7)
```

Exit code 1. No AI ran in that check; the verdict is deterministic. Drop `verify-diff` into CI or an agent loop (see [Verifying AI code changes](/docs/verifying-ai-changes) and [ThunderLang for AI agents](/docs/mcp)) and the change cannot merge until the token stops leaking.

## The point

The evaluator was never rewritten. ThunderLang wrapped the decision the team already had in a contract, proved four language targets agree on it, and turned "do not log the token" from a hope into a gate. That is adoption without a migration: lift what exists, state what must hold, and let the tooling hold the line.
