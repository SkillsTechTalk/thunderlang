# E2E flow: Docs and Examples

**URL:** `http://localhost:5187/docs`, `http://localhost:5187/examples`
**Covers:** the docs index + a rendered doc page, and the examples index + a rendered
example page. These are static (SSG) routes; the check is that they render real content
with no missing-page/module errors (the class of failure a stale build cache produced
before).
**Network:** document + static assets only.

## Preconditions
- Dev server running on :5187 (or a preview/prod URL).
- Browser tools loaded; a fresh tab created.

## Steps

### Docs
1. Navigate to `/docs`. Expect the docs index listing the concept docs (Manifesto, Syntax
   overview, Language specification, Intent Runtime, Tests, Outcome contracts, Governance,
   Data privacy, Export/Import adapters, Graph to source, Schema migrations, ...).
2. Open **The Intent Runtime: executable intent** (`/docs/intent-runtime`).
   - Expect the H1 and rendered Markdown (headings, the `intent run` sample, the condition
     grammar), not a raw code dump or an error page.
3. Open **Language specification** (`/docs/spec`) and **Tests as a first-class construct**
   (`/docs/intent-tests`) -> both render full content.
4. Click an internal cross-link within a doc (e.g. a `/docs/...` link) -> it resolves to a
   real page (no 404). (The `docs:check` guard enforces this at build time; verify one live.)

### Examples
5. Navigate to `/examples`. Expect the list including **SubscriptionUpgrade** (the newest
   showcase) alongside CreateInvoice, CalculateRiskScore, etc.
6. Open **SubscriptionUpgrade** -> expect the syntax-highlighted `.intent` source
   (decision, lifecycle, outcome_contract, test blocks) rendered, no error.
7. Open one older example (e.g. **CreateInvoice**) -> renders.

## Assertions
- `read_console_messages` (onlyErrors): empty on every page.
- `read_network_requests`: document + static only, all 2xx; no "Cannot find module" /
  vendor-chunk / 500 responses.
- No broken layout; code blocks are readable.

## Result
`E2E docs-and-examples: PASS` / `FAIL: <page> , <observed>`
