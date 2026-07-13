# Style Intent

Brand and visual language are intent too. "It should feel premium," "match our design
system," "meet accessibility" , these are commitments a team makes, and left as prose they
drift: every surface reinvents its own colors, every theme forks its own token names, and
"accessible" gets claimed but never checked.

A **style intent** makes the visual commitment explicit and governed. It is a first-class
extension of the [Experience profile](/docs/intent-graph): it names the purpose, the
audience, the surfaces it covers, and , crucially , binds design **tokens against a
canonical, lockable address space** that IL owns. Studio, storefronts, and docs all bind to
the same token names, so a theme is portable instead of a private dialect.

## The shape

```
mission Storefront
use experience
use design

experience CheckoutFlow
  goal "complete a purchase"

style_intent CheckoutLook
  applies_to CheckoutFlow            # the experience this styles
  purpose "premium, trustworthy checkout"
  audience enterprise buyers, procurement
  surface checkout
  surface receipt
  token color.primary #0B5FFF
  token typography.scale 1.25
  token mode both
  accessibility_target WCAG_2_2_AA   # a GOAL, always proposed , never IL-verified
  scope surface:checkout
```

- **applies_to** joins the style to an experience. When it resolves, the graph records
  `ExperienceContract -constrained_by-> StyleIntent`; otherwise the mission requires it.
- **purpose / audience / surfaces / scope** are the design brief , why it looks this way,
  for whom, and where it applies.
- **token** binds one address in the canonical space to a value. Off-namespace paths are
  flagged (`IL-STYLE-001`) so the token vocabulary stays closed.
- **accessibility_target** is the conformance goal. It is **always a proposed claim**, never
  emitted as verified , see below.

## Tokens address a canonical, lockable space

A style intent may only bind addresses IL defines. This is what keeps a design system a
shared vocabulary instead of a pile of forks:

    color.primary  color.accent  color.surface  color.text
    color.feedback.success  color.feedback.warning  color.feedback.error  color.feedback.info
    typography.scale  typography.headingWeight
    typography.families.heading  typography.families.body  typography.families.mono
    shape.radius  shape.borders  shape.elevation
    density  mode
    brand.logo

Binding anything else raises `IL-STYLE-001`. Need a new address? That is a request to extend
the canonical space (IL owns it), not a private addition , the anti-fork rule that lets one
theme render identically in Studio, on a storefront, and in generated docs. The `mode` token
is constrained to `light | dark | auto | both` (`IL-STYLE-004`).

## Accessibility is a proposed claim, never a verdict

IL will **never** let a style intent assert that it *is* accessible. `accessibility_target`
declares the standard the design is aiming for (`WCAG_2_1_AA`, `WCAG_2_2_AA`, or
`WCAG_2_2_AAA`), and it is stamped with classification `proposed` , the same
[classification model](/docs/intent-graph) used everywhere. Whether the target was actually
met is a **verified** verdict that only real accessibility testing (OpenThunder's job) can
produce. A style intent that omits the target gets an informational `IL-STYLE-003`, because
"accessible" left implicit is "accessible" left unchecked.

```
intent style storefront.intent
  intent style storefront.intent: 1 style intent(s)
    CheckoutLook  , a11y WCAG_2_2_AA (proposed, verified=false), 3 token(s), applies_to CheckoutFlow
```

## Diagnostics

| Code | Severity | Means |
| --- | --- | --- |
| `IL-STYLE-001` | warning | Token bound outside the canonical address space. |
| `IL-STYLE-002` | warning | Unrecognized accessibility target. |
| `IL-STYLE-003` | info | No accessibility target declared (state the goal as a proposed claim). |
| `IL-STYLE-004` | warning | Invalid `mode` token value. |
| `IL-STYLE-005` | info | `applies_to` names an experience not declared in this file. |

These compose into `intent check` like every other diagnostic, so a broken theme fails the
same gate as a broken decision.

## Consuming it

The style API is browser-safe (`@skillstech/intentlang/core`), so a design tool can resolve
tokens without a Node build:

```js
import { analyzeStyle, STYLE_ADDRESS_SPACE, ACCESSIBILITY_TARGETS } from '@skillstech/intentlang/core';
import { parseIntent } from '@skillstech/intentlang';

const view = analyzeStyle(parseIntent(source));
// view.styleIntents[0].tokens -> [{ path, value, canonical }]
// view.styleIntents[0].accessibility -> { target, classification: 'proposed', verified: false }
```

## Export to standard design tokens

Tokens are only useful if they flow downstream. `intent export <file> --format tokens`
renders the style intent as a [W3C Design Tokens (DTCG)](/docs/export-adapters) document ,
the shape Style Dictionary, Figma Tokens, and CSS pipelines consume , so the same canonical
addresses become real theme variables with no hand-translation. Or skip the pipeline
entirely: `--format css` emits a ready-to-use `:root` custom-property sheet.

Style intent is `intent-style-v1`. Like the rest of the language it is pre-1.0 and versions
independently.
