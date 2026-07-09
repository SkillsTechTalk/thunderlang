# IntentLang Tutorial

> Status: draft. There is no compiler to run yet. This tutorial teaches the
> mental model and syntax so the intent is ready the day the tooling lands.

By the end you will have written a complete mission for a secure password reset
flow, and you will understand how it becomes docs, diagrams, a test plan, and a
proof artifact.

## 1. What is IntentLang?

IntentLang is the intent language for AI-era software. You describe what software
should do, why it matters, what must never happen, and how it will be verified,
before implementation begins. A deterministic compiler turns that into artifacts;
optional AI can assist, but the compiler works without it.

## 2. Prompt vs Intent

A prompt is a conversation:

> Build a password reset flow.

It is useful but throwaway. IntentLang makes it durable by turning it into a
reviewed, versioned `.intent` file. The rule to remember:

    prompt → intent → review → plan → implementation → verification → proof

The AI never jumps straight from prompt to code.

## 3. Your first mission

Start with the smallest complete mission: a name and a goal.

```intent
mission ResetPassword

goal
  Let a user securely reset their password
```

## 4. Add input and output

Describe what the mission consumes and produces, using semantic types.

```intent
input
  email: Email
  token: ResetToken
  newPassword: Secret

output
  result: PasswordResetResult
```

## 5. Add guarantees

Guarantees are properties that must always hold. They are contracts, not tests
bolted on later.

```intent
guarantees
  token expires after 15 minutes
  token can only be used once
  password is never logged
```

## 6. Add never rules

`never` lists forbidden behavior. This is where security intent lives.

```intent
never
  log(newPassword)
  return token
```

## 7. Add why / because rationale

Rationale captures judgment and makes review and generation better.

```intent
guarantee token can only be used once
  because a reusable reset token is an account-takeover risk
  verify test one time use
```

## 8. Add verification

State how the guarantees will be proven.

```intent
verify
  test token expiration
  test one time use
  test password hash stored
  test raw password not logged
```

## 9. Add a target (and style)

Name what to generate and, optionally, the paradigm and stack.

```intent
target
  DotNet

style
  ASP.NET Core
  EntityFramework
  BCrypt
```

## 10. Generate docs

Conceptually, `intent docs ResetPassword.intent --no-ai` produces a Markdown
summary of the goal, guarantees, never rules, and verification, suitable for a
pull request or a design review.

## 11. Generate graphs

`intent graph ResetPassword.intent --no-ai` produces a Mermaid diagram of the
mission, its inputs, outputs, and any services or events it touches.

## 12. Generate a proof artifact

`intent proof ResetPassword.intent` emits `.intent-proof.json`: the mission, a
hash of the source, the targets produced, the status of each guarantee and
`never` rule (verified, needs_review, or failed) with evidence, and any AI usage
metadata. Proof is how trust is earned.

## 13. How the ecosystem uses your intent (later)

- **OpenThunder** compares your `.intent` files to the real repo and flags intent
  drift: guarantees without tests, violated `never` rules, undeclared events.
- **Repo Mastery** turns missions into learning paths and quizzes.
- **SkillsTech Talk** turns missions into explanation and defense drills.

## Where to go next

- Read the [manifesto](./manifesto.md) for the why.
- Read the [syntax overview](./syntax-overview.md) for the full construct list.
- Read the [compiler contract](./compiler-contract.md) for how source becomes
  artifacts.
- Browse the [examples](../examples) directory for complete missions.
