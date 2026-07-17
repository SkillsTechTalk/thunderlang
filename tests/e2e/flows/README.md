# ThunderLang E2E flow scripts

Per Protocol #4 (QUALITY): no user-facing feature is "done" or deployable until it passes
a Claude-Chrome-extension E2E on the **real rendered UI** , driving the actual flow, with
a clean console and confirmed network calls. `tsc` + unit tests prove it compiles; only
driving the UI proves the button works, the page renders, the API fires, and the console
is clean.

These `flows/*.md` are the runnable scripts for ThunderLang's user-facing surfaces. Each
is a checklist an operator (a Claude with the `claude-in-chrome` tools loaded) drives
end to end.

## How to run

1. Start the site: `npm run dev` (serves `http://localhost:5187`). For a production check,
   use the preview/prod URL instead.
2. Load the browser tools: ToolSearch the `mcp__claude-in-chrome__*` set, then
   `tabs_context_mcp` and `tabs_create_mcp`.
3. Work through a flow's steps. After the interactions:
   - `read_network_requests` , the listed API calls fired and returned OK (2xx).
   - `read_console_messages` with `onlyErrors: true` , must be **empty** (a page that
     looks fine with a red console is a FAIL).
4. Emit `E2E <flow>: PASS` or `FAIL: <step> , <observed>`. On failure, screenshot to the
   scratchpad.

## Flows

- `playground.md` , the executable playground (Run it + Compile it + diagram expand).
- `homepage.md` , the marketing homepage, incl. the "Intent you can run" section.
- `docs-and-examples.md` , docs index + a doc page, examples index + an example page.

## Pass bar (all flows)

- Every listed step produces the expected result.
- Zero console errors during the flow.
- Every listed network call returns 2xx.
- No layout break, no infinite spinner, no unhandled rejection.
