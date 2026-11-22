# Named examples: implementation and usability review

Date: 2026-11-16. Compiler: 0.5.2. Applies the workspace DESIGN.md.

## User goal and mental model

Write readable rules and named examples without maintaining table alignment.
The compiler checks the rule; OpenThunder checks independent application code.
Examples are finite evidence, not proof of all behavior. Tables are generated
presentation, never another source of truth.

## Primary action and expected result

Edit the refund source and select Run examples. The table shows inputs,
expected/actual outcomes, and a worded result. Break the $100 rule demonstrates
a boundary failure; Reset restores the original source and reruns it.

The seven stages are: check a refund rule; choose edit/run/break/reset; edit a
named case; run; read the counts and row; compare expected with actual; either
repair or continue to the application walkthrough. The browser always labels
application behavior not checked.

## Checklist and recovery

- Primary controls stay visible beside the editor; source export and full
  language links remain under a labeled disclosure. Buttons have focus and
  pressed states; results use text as well as color.
- Named inputs remove positional ambiguity. Duplicate, missing, unknown and
  incorrectly typed literal inputs fail with a source line and recovery hint.
- Source is preserved on failure. The error is associated with the editor;
  stale generated rows are hidden after an invalid run. Editing valid source
  marks old results as needing a rerun. Compiled download explains its disabled
  state; editable source remains downloadable.
- Existing pipe-table examples, canonical syntax, code generation, Playground,
  Atlas and routes remain available. Optional input types only validate example
  literals, not arbitrary application invocations.
- Computation is local and synchronous. No loading/network/offline request is
  introduced by Run examples. Navigation and initial loading still need the web.

## Validation and limits

Compiler suite: 687 passed, 18 toolchain-dependent skips. Intent checks, proof,
schema, formatting, documentation checks, package smoke, site build and lint
passed (lint retains the existing image warning). Cross-product smoke runs the
named source and compiled canonical source through the real refund adapter,
including an application-only boundary failure and restoration.

Browser review exercised named source, Run, Break, Reset, a misspelled input,
keyboard activation and narrow layout (375 CSS pixels, no document overflow).
It exposed misleading old Ready rows after a parse error; fixed before release.
Generated result cards retain labels on narrow screens. No native-mobile UI is
introduced; this is responsive web plus compiler/CLI functionality.

Unaided user observation and a full screen-reader session have not been done.
Owner: product maintainer. Next: have a developer and a product reviewer each
change a boundary case and explain the difference between contract and
application evidence without coaching; record hesitation before expanding the
syntax. These remain untested checks, not claimed usability passes.
