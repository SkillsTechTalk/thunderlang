# Design note: Thunder screens

The language for screens is in [Thunder Core: Screens](./core.md#screens-build-an-app). This note says why it has
that shape, how the two implementations stay the same, and what is not built yet.

## The model

A screen is a description, read from top to bottom, of what a person sees. Only the steps under `When pressed:` run,
one press at a time. In one sentence: **a screen shows its values; a press changes them, all or nothing.**

```text
Receive …      inputs, given by the screen that shows it        (React: props)
Remember …     values the screen keeps while it is shown         (React: useState)
Show …         what it shows, top to bottom                      (React: the returned markup)
When pressed:  steps, on copies; kept only if every step works   (React: an event handler)
```

Choices, and why:

- **Every element line starts with `Show`.** A screen reads as a list of things on it, and a step that changes
  something cannot be written there by mistake: it has to go under a button (TC118 says so, with a suggestion).
- **`Remember … starting at …`.** A screen shows its values right away, so each needs a start. The kind is written
  (`as text`) or comes from the start (`starting at 0` is a whole number).
- **A press is all or nothing.** People expect a button either to work or to say why it didn't, never to leave the
  screen half changed. The steps run on deep copies; a failure (including `Stop with "…"`) keeps nothing and shows the
  message under the screen (`role="alert"` in React). The message is the same text `If this fails` gives as `error`.
- **Inputs and list items are read-only** (TC213): the screen that gives them owns them. The fix is in the message:
  remember a copy.
- **State belongs to a place.** Each shown screen keeps its values by its place (as React keeps a component's state
  by its position), so two cards in a list have their own likes, and a screen hidden by a `When` forgets its values.
  Branches are keyed, so moving from one `When` arm to another always starts the screens in it again.
- **Opening a screen replaces the current one** and gives it no inputs, so an opened screen's inputs need defaults
  (TC214). Opening the screen that is already shown changes nothing.
- **Labels are in quotes** (`Show a button "Add"`), so the words people read are visibly the words on the screen.
- **Did you mean.** Unknown screens, inputs, and remembered names are suggested, also when two letters are swapped
  (`cuont` → `count`, `Shwo` → `Show`).

## One meaning, two implementations

The Thunder engine shows a screen as a tree of plain values (`screenApp` and `screenOutline` in
`compiler/src/core/engine-core.mjs`). The React target (`target-react.mjs`) writes function components. They share
the code that decides what a screen means (`screen-values.mjs`: how a value is shown, deep copies for a press, what
typing into a number box does, the problem text) and all value behavior (`engine-values.mjs`); both are copied byte
for byte into the app's `thunder_runtime.mjs`.

`compiler/test/core-react.test.mjs` checks them against each other for every program in
`compiler/test/fixtures/screens/`: react-dom/server's HTML is parsed back into the engine's tree shape and must be
equal; then every `# do:` line in the fixture (press or type) runs on both (React through react-test-renderer), and
the trees must be equal after each one. A screen that can't be shown (a missing item, a kept value that divides by
zero) must give the same message, with the same line, in both. The generated TSX also type-checks under
`tsc --strict`, and the app builds with Vite.

## Not built yet

- Tests for screens in Thunder (`Test` blocks that press and type); today the conformance scripts are test fixtures.
- An interactive `thunder run` (pressing buttons in the terminal); it prints the first screen.
- Inputs for an opened screen (`that opens Detail with item: …`), and going back.
- Never rules on remembered values, and money in a number box.
- Saving data (persistence), server actions, and signed-in users: the full-app work this construct is the base for.
- An Angular target on the same screens.
- An off button says it is off, but not why; a short reason next to it would follow the design standard better.

## Review record

```text
User goal and mental model: describe a screen and its buttons in plain words; "a screen shows its values; a press
  changes them, all or nothing".
Primary action and expected result: write Screen … and run it: thunder run prints the screen; thunder build --target
  react writes an app that behaves the same.
Names or controls that might be misunderstood: "Remember" (a value kept while the screen is shown, not saved data);
  "off when" (disabled); "opens" (replaces the current screen).
Success, failure, and recovery behavior: a press that fails keeps nothing and says why under the screen; typing that
  is not a number keeps the old value and says why; a screen that can't be shown says why with the line.
Why the feedback helps the user understand: every message is the program's own words (Stop with) or a plain sentence
  with a Thunder line; checker messages name the fix.
Surfaces and accessibility paths checked: CLI outline; generated React in Chrome (typing, a failed press, a successful
  press, in the dark color scheme; light was not viewed); labels wrap their inputs, problems use role="alert", buttons are real buttons.
Unaided user observation (or explicitly not yet tested): not yet tested with people.
Remaining issues, owners, and follow-up: see "Not built yet" above.
```
