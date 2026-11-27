# The Thunder drawing kit

`@skillstech/thunderlang/react` draws a Thunder reading. OpenThunder, thunderlang.dev, and the Skills Tech Talk course
all use it, so a reading says the same words in the same order everywhere.

```ts
import { BigPicture, ThingCard, DataCard } from "@skillstech/thunderlang/react";
import "@skillstech/thunderlang/react/reading.css";

<BigPicture model={model} focus={selectedId} onOpen={(memberId) => openFlow(memberId)} />
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

Coming next: the drawn IO boxes, and the Flow and Details views.
