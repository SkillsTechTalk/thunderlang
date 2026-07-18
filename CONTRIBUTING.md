# Contributing to ThunderLang

Thanks for your interest in ThunderLang, an intent-oriented programming language
for the age of AI. This project is founder-led while it is pre-1.0.

## License of contributions

ThunderLang is licensed under the **Apache License, Version 2.0** (see LICENSE).
By submitting a contribution, you agree that your contribution is licensed under
Apache-2.0, including its express patent grant (Section 3). Please only submit
work you have the right to license under these terms.

Add or keep this header on source files you create or substantially change:

```
Copyright 2026 Skills Tech Talk, LLC

Licensed under the Apache License, Version 2.0.
You may not use this file except in compliance with the License.
```

## Project layout

- `compiler/` , the deterministic ThunderLang compiler, CLI, and language server
  (no AI required). Source in `compiler/src`, tests in `compiler/test`.
- `src/` , the thunderlang.dev website (Next.js App Router).
- `docs/` , the language documentation (Markdown).
- `examples/` , worked `.thunder` examples.

## Developing

Compiler:

```bash
cd compiler
node --test            # run the full suite (must stay green)
node src/cli.mjs check ../examples/CreateInvoice.thunder
```

### Native target toolchains (optional)

The live target adapters (`thunder test --target <t>`, `thunder conform --run <t>`,
`--all-targets`) compile and execute the generated code for real. TypeScript/JS runs
in-process and needs nothing extra. Python needs `python3`. C# and Java need their SDKs,
which are keg-only under Homebrew (not added to your PATH automatically):

```bash
brew install openjdk       # Java (JDK 11+; single-file `java X.java` launcher)
brew install dotnet        # C# (.NET SDK; scaffolds a throwaway console project)
```

The compiler's smoke checks skip any target whose toolchain it cannot find or run, so a
missing SDK never fails a build. To exercise the C#/Java adapters locally, put the SDKs on
PATH (and set `DOTNET_ROOT`) for the run:

```bash
export PATH="/opt/homebrew/opt/dotnet/bin:$(brew --prefix openjdk)/bin:$PATH"
export DOTNET_ROOT="/opt/homebrew/opt/dotnet/libexec"

# The live compile+execute tests are opt-in (they need the SDKs and are not run in CI):
cd compiler
TL_NATIVE_TARGETS=1 node --test test/cli-target-native.test.mjs
```

With both SDKs present, `thunder test <file> --all-targets` executes all four targets
(TypeScript, Python, C#, Java) and reports them side by side.

Website:

```bash
npm install
npm run dev            # http://localhost:5187
npm run build          # production build + type check
```

## Ground rules

- **Keep the compiler test suite green.** Add tests for new behavior.
- **Grammar is stable pre-1.0.** Do not rename the `mission` keyword or break
  files that already parse without a versioned migration.
- **Vocabulary.** Only the product name is ThunderLang. Keep the concept terms:
  Intent-Oriented Programming, Intent Graph, Intent Atlas, Intent Contracts,
  Intent Map, Intent IR, Intent Verification, Intent Diff, Intent Proof.
- **File extensions.** `.thunder` is canonical; `.tl` is an accepted shorthand;
  `.intent` still parses for legacy sources.
- Prose style: no em dashes.

## Reporting issues

Open an issue on the repository, or email **support@skillstechtalk.com**. For
security issues, follow SECURITY.md instead of filing a public issue.
