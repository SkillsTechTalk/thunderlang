# E2E flow: Playground

**URL:** `http://localhost:5187/playground`
**Covers:** the executable "Run it" panel (decision run + lifecycle simulate), the
"Compile it" panel (compile -> diagnostics/graph/proof), and the expandable diagram.
**Network:** `POST /api/run`, `POST /api/compile` (and `/api/assist` from the editor).

## Preconditions
- Dev server running on :5187.
- Browser tools loaded; a fresh tab created.

## Steps

### A. Run it (executable intent)
1. Navigate to `/playground`. Expect the hero "Write intent. Run it. Read the proof."
   and a "Run it" section with an intent textarea prefilled with a `decision` + `lifecycle`.
2. Confirm the decision-input fields render (e.g. `age`, `score`) and the events box shows
   `submit, approve`.
3. Click **Run intent**.
   - Expect `POST /api/run` -> 200.
   - Expect a decision result card showing a green result (e.g. `Eligible`) with a
     per-rule trace, and a lifecycle card showing a path (`Draft -> Submitted -> ...`)
     marked **valid**.
4. Change an input (e.g. set `score` to `50`) and Run again.
   - Expect the decision result to change accordingly (e.g. `Provisional`), deterministically.
5. Edit the events box to an illegal sequence (e.g. `approve`) and Run.
   - Expect the lifecycle card to show **invalid** with a rejection reason.

### B. Compile it
6. Scroll to the "Compile it" panel. Click a preset example (e.g. **CreateInvoice**), then
   click **Run Compiler**.
   - Expect `POST /api/compile` -> 200.
   - Expect the status chips (Syntax passed / semantic warnings / Docs generated / ...)
     and the Semantic Beauty + Trust Readiness cards.
7. Click the **Diagnostics** tab -> expect the diagnostic list. Click **Docs**, **Test
   Plan**, **Proof** tabs -> each renders its artifact.

### C. Diagram expand (the recently-shipped UI)
8. Click the **Graph** tab -> expect the contract-map diagram (Diagram/Source toggle,
   Copy source, Download .mmd).
9. Click anywhere on the diagram area.
   - Expect a fullscreen modal to open, the diagram **fitted to the viewport** (readable,
     not tiny), with zoom controls (- % +), Reset, Close, and a footer hint.
10. Click **+** a few times -> the diagram scales up. Click **Reset** -> returns to 100%.
11. Press **Esc** (and separately, click the backdrop) -> the modal closes both ways.
12. Back inline: click the **Source** toggle -> the Mermaid source shows. Click **Copy
    source** -> "Copied". Click **Download .mmd** -> a file downloads.

## Assertions
- `read_network_requests`: `/api/run` and `/api/compile` present and 2xx.
- `read_console_messages` (onlyErrors): empty.
- No infinite "Running..." / "Drawing diagram…" spinner.

## Result
`E2E playground: PASS` / `FAIL: <step> , <observed>`
