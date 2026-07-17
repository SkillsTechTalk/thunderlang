# ThunderLang Tutorial

> By the end you will have written a complete mission for a secure password reset, run a
> decision from it with no code, and tested it, all with the deterministic `intent`
> compiler (no AI required).

## 1. What is ThunderLang?

ThunderLang is the intent language for AI-era software. You describe what software should
do, why it matters, what must never happen, and how it will be verified, before
implementation begins. A deterministic compiler turns that into diagnostics, docs,
graphs, a test plan, and a proof artifact, and, for decisions and lifecycles, it *runs*
the intent directly.

## 2. Prompt vs intent

A prompt is a throwaway conversation ("build a password reset flow"). ThunderLang makes it
durable by turning it into a reviewed, versioned `.thunder` file:

    prompt → intent → review → plan → implementation → verification → proof

The AI never jumps straight from prompt to code. And as you will see, some intent does not
need code generated at all, it executes as written.

## 3. Your first mission

Start with the smallest complete mission: a name and a goal. Save this as
`ResetPassword.thunder`.

```
mission ResetPassword

goal
  Let a user securely reset their password
```

## 4. Add typed input and output

Use semantic types, so tools reason about meaning, not just shape.

```
input
  email: Email
  token: ResetToken
  newPassword: Secret

output
  result: PasswordResetResult
```

## 5. Add guarantees

Guarantees are properties that must always hold. They are contracts, not tests bolted on
later.

```
guarantees
  token expires after 15 minutes
  token can only be used once
  password is never logged
```

## 6. Add never rules

`never` lists forbidden behavior. This is where security intent lives.

```
never
  log the new password
  return the token to the client
```

## 7. Add rationale

Rationale captures judgment and makes review and generation better. The attached form
carries `because` and `verify`:

```
guarantee token can only be used once
  because a reusable reset token is an account-takeover risk
  verify test one time use
```

## 8. Check it

Now run the compiler. This is real, not conceptual:

```
intent check ResetPassword.thunder
```

At this point only "token can only be used once" carries a `verify`, so the compiler
warns that the other guarantees and both `never` rules are unverified
(`guarantee-without-verification`, `never-without-verification`), because an unproven
guarantee is exactly where drift hides. Attach a `verify` to each, the same attached
form from step 7, and the warnings clear. `thunder check` exits non-zero on errors, so it
drops straight into CI. (The finished mission in
[examples/ResetPassword.thunder](/examples/resetpassword) verifies every guarantee and
`never`, and checks clean.)

## 9. Make part of the intent executable

Security rules like "the token expires and can only be tried a few times" are a
**decision**, and a decision is not a wish, it runs. Add this to the file:

```
decision CanReset
  inputs
    tokenAgeMinutes
    attempts
  rule expired
    when tokenAgeMinutes > 15
    return Denied
  rule tooManyAttempts
    when attempts >= 5
    return Denied
  rule allowed
    when attempts < 5
    return Allowed
  default
    return Denied
```

Now execute it, with no AI and no generated code:

```
intent run ResetPassword.thunder --inputs '{"tokenAgeMinutes":3,"attempts":1}'
  decision CanReset: Allowed  [rule: allowed]
      expired: when tokenAgeMinutes > 15
      tooManyAttempts: when attempts >= 5
    > allowed: when attempts < 5  (matched)
```

The `>` marks every rule whose condition was true; the first one wins (FIRST-hit).

```
intent run ResetPassword.thunder --inputs '{"tokenAgeMinutes":20,"attempts":1}'
  decision CanReset: Denied  [rule: expired]
    > expired: when tokenAgeMinutes > 15  (matched)
      tooManyAttempts: when attempts >= 5
    > allowed: when attempts < 5  (matched)
```

The trace shows every rule that was tried and why the winner won. For the stale token,
both `expired` and `allowed` have true conditions, but `expired` comes first, so it wins
and the token is denied. Too many attempts is denied; a fresh token within the attempt
limit is allowed. That is the security policy, running as written.

## 10. Test it, in the same file

Because the decision executes, you can assert its behavior right next to it. Add:

```
test CanReset
  case fresh token
    given tokenAgeMinutes 3, attempts 1
    expect Allowed
  case expired token
    given tokenAgeMinutes 20, attempts 1
    expect Denied
  case locked out
    given tokenAgeMinutes 3, attempts 5
    expect Denied
```

```
intent test ResetPassword.thunder
  intent test ResetPassword.thunder: 3/3 passed
    PASS  CanReset / fresh token
    PASS  CanReset / expired token
    PASS  CanReset / locked out
```

The `.thunder` file is now **self-verifying**: no code, no test framework, no AI. Run
`thunder test` in CI next to `thunder check`, and the intent proves itself on every commit.

## 11. Build the artifacts

When you want the full output:

```
intent build ResetPassword.thunder
```

produces the generated docs, a contract graph, a test plan, and `.thunder-proof.json`, a
hash of the source with the status of every guarantee and `never` rule. Proof is how
trust is earned. `thunder graph` emits the Intent Graph; `thunder source` regenerates
`.thunder` back from a graph.

## 12. How the ecosystem uses your intent

- **OpenThunder** compares your `.thunder` files to the real repo and flags intent drift:
  guarantees without tests, violated `never` rules, undeclared events.
- **Repo Mastery** turns missions into learning paths and quizzes.
- **SkillsTech Studio** provides visual authoring over the same Intent Graph.

## Where to go next

- The [syntax overview](/docs/syntax-overview) for the full construct tour.
- The [language specification](/docs/spec) for the exhaustive grammar.
- The [Intent Runtime](/docs/intent-runtime) and [first-class tests](/docs/intent-tests)
  for executable intent in depth.
- The [examples](/examples) directory for complete missions.
