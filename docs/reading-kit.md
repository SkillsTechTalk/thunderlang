# The Thunder drawing kit

`@skillstech/thunderlang/react` draws a Thunder reading. OpenThunder, thunderlang.dev, and the Skills Tech Talk course
all use it, so a reading says the same words in the same order everywhere.

```ts
import { BigPicture, Flow, Details } from "@skillstech/thunderlang/react";
import "@skillstech/thunderlang/react/reading.css";

<BigPicture model={model} focus={selectedId} onOpen={(memberId) => select(memberId)} onThing={select} onLine={openCode} />
<Flow flow={member.flow} onLine={openCode} onUse={select} />
<Details view={readLevel(model, "details", member.id)} onLine={openCode} />
```

**What it shows comes from `readingLayout`.** `readingLayout(model, { focus })` in `@skillstech/thunderlang/core`
gives every label and the order as plain data (`thunder-reading-layout-v1`). The components only draw it, so you can
also draw it yourself, or test it without React. The Big Picture zooms with focus:

| Focus | Shows |
|---|---|
| none, or a file's path | every Thing, then every record, then every set of choices |
| a Thing's id | its card, then the Data in its file |
| an action or rule | "You give it", "You get back", "It can stop with", and "Part of …" back to its Thing |
| an id not in the model | nothing (`focus.kind` is `unknown`) |

The tabs around it stay Big Picture / Flow / Details / Text / Original in every product.

**Styling.** One stylesheet with plain `tl-` classes. Every color is a CSS variable: set `--tl-*` on any ancestor to
fit your app, or add the class `tl-light` for the light set. A Thing's color, `--tl-accent`, follows
`--language-accent` when the page sets it. The "It can" list is one column under 560px, and buttons are at least 44px
tall.

**Interaction.** Callbacks only: `onOpen(memberId)` turns each ability, and "How a new … starts", into a button.
Without it they are plain text.

React is a peer dependency (18 or newer): the app's own copy is used. There is no Tailwind and no build step.

**The three views of one action or rule.**

| Component | Draws | Words from |
|---|---|---|
| `IOBoxes` (inside `BigPicture` for an action or rule) | You give it, You get back, It can stop with (each stop's line), Part of … | `ioBoxes(model, member)` |
| `Flow` | every step at the compiler's lane and row, its edges (Yes, No, For each, Done, If it fails), steps not read yet dashed | `member.flow`, `flowEdgeLabel(edge)` |
| `Details` | counts at a glance, You give it / You get back, When it stops, What it changes, Its answers, Exact limits, Every step, It relies on, Used by, Questions the code cannot answer | `detailsLayout(readLevel(model, "details", id))` |

A Details section appears only when the compiler gives it; nothing is filled in. `Flow` measures its drawn steps to
place the edges, so in server rendering the steps are drawn and the edges join on the first paint. Pass
`marks` and `markAs` ("added" or "removed") to mark steps New or Gone in a diff. `Details` takes `rules` to draw the
app's own rule cards in place of the plain "It relies on" list; `BigPicture` and `IOBoxes` take children to add the
app's own notes under the boxes.
