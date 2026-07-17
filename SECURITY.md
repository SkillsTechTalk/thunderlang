# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities privately. Do **not** open a public issue.

Email **support@skillstechtalk.com** with:

- a description of the issue and its impact,
- steps to reproduce (a minimal `.thunder` file or command if relevant),
- the ThunderLang version (`thunder --version` or the `@skillstechtalk/thunderlang`
  package version), and
- any suggested remediation.

We will acknowledge receipt, investigate, and keep you informed of progress. We
ask that you give us reasonable time to release a fix before public disclosure.

## Scope

In scope: the `@skillstechtalk/thunderlang` package (compiler, CLI, language
server) and the thunderlang.dev website.

Note the deterministic core runs offline and requires no AI and no account. The
compiler executes intent (decisions, lifecycles) deterministically; report any
case where it reads or writes outside its inputs, or where untrusted `.thunder`
input can cause unexpected code execution.

## Supported versions

ThunderLang is pre-1.0. Security fixes land on the latest published version.
