# E2E flow: Homepage

**URL:** `http://localhost:5187/`
**Covers:** the marketing homepage, including the recently-shipped "Intent you can run"
executable section, and navigation into the playground.
**Network:** document + static assets only (no API calls expected on the homepage).

## Preconditions
- Dev server running on :5187.
- Browser tools loaded; a fresh tab created.

## Steps
1. Navigate to `/`. Expect the hero: "Intent-Oriented Programming for the AI era.", the
   "Join the Waitlist" / "Read the Vision" CTAs, and a code panel captioned
   "Pre-1.0 syntax , and it compiles with the intent CLI today." (no "illustrative only").
2. Scroll to the **"Intent you can run. No code. No AI."** section (eyebrow: "Beyond prompt
   engineering").
   - Expect a decision + test code block on one side, and a terminal panel on the other
     showing `decision CanEnroll: Eligible [rule: adult]` and two green `PASS` lines +
     `2/2 passed`.
   - Confirm the "playground" link in that section's caption.
3. Click the **playground** link -> lands on `/playground` (hand off to `playground.md`).
4. Back on `/`, scroll the full page: Why / Prompt-vs-durable / philosophy pipeline /
   Example syntax / principles / What it's not / Ecosystem all render without layout break.
5. Check the header nav: four menus, **Try it**, **Learn**, **Why Thunder**, **Community**
   (src/lib/navigation.ts), plus GitHub, the ecosystem menu, OpenThunder, and **Install**.
   - Click each menu: one opens at a time, each link has a one-line description, and
     unfinished pages say Prototype or Preview.
   - Keyboard: Tab to a menu, Down arrow opens it on the first link, Up/Down move,
     Escape closes it and focus returns to the menu button.
   - On a page inside a group (for example `/read`), that menu is underlined and the page's
     link says "You are here".
   - At phone width (390px): no sideways scroll; Menu opens the same four groups as
     sections, with the current group open.
   The footer lists the same four groups, same names, plus Fine print, and reads "The language
   may still change before 2.0 ... see what works today", not "Pre-1.0 syntax".
6. Toggle light/dark if a theme control exists -> both render legibly.

## Assertions
- `read_console_messages` (onlyErrors): empty across the scroll + nav.
- `read_network_requests`: only document/static (font/image) requests, all 2xx; no failed
  or 4xx/5xx calls.
- No hydration warning in the console.

## Result
`E2E homepage: PASS` / `FAIL: <step> , <observed>`
