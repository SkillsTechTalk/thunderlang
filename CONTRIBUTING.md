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
