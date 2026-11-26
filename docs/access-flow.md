# Access flow: who may see the record?

An endpoint that hands back a record chosen by the request (`/api/invoices/123`) has to make sure the record
belongs to the caller. Being signed in is not enough: the hard question is whether **every path** from the request
to the response limits the record to the caller's tenant or owner. Thunder answers that for TypeScript and
JavaScript web routes, with every step linked to its line, and says plainly when it cannot tell.

```text
Illustrative (not from a real repository):

  GET /api/invoices/123
    │  the invoice id comes from the request (untrusted)
    ▼
  sign-in: the caller is known (getServerSession())
    │
    ▼
  ownership check?  ← nothing on this path compares the invoice with the caller
    │
    ▼
  database lookup: invoice where id = params.id
    │
    ▼
  the invoice is sent back
```

```sh
thunder read src --access          # one block per route; exit status 1 when a route has no ownership check
thunder read src --access --json   # thunder-access-v1
```

```text
✗ GET /api/invoices/:id  (app/api/invoices/[id]/route.ts, line 6)
  No ownership check on this path: no step between the request and the response limits invoice to the caller
    input    takes params.id from the request  (line 9)
    identity knows the caller from getServerSession()  (line 7)
    lookup   reads invoice with findUnique where id = params.id  (line 9)
    response answers with NextResponse.json(…)  (line 10)
```

The same verdict appears in readings (`thunder read --level text`, Details, OpenThunder) as one line on the route:
`Ownership: checked (line 7)`, `No ownership check on this path (lines 5, 6, 7)`, or `Ownership: Thunder cannot tell: …`.
From code, `accessFlow(files)` in `@skillstech/thunderlang/core` returns the report.

## The three verdicts

Each path is about one record: from where the request picks it, to the response that sends it (or the change that
updates or deletes it).

| Verdict | When | What Thunder says |
|---|---|---|
| **guarded** | the lookup is limited to the caller, a comparison with the caller stops the path first, or the record is chosen by the caller's identity rather than the request | which line does it, and how |
| **unguarded** | every step between the request and the response was followed, and none limits the record to the caller | the lines of the path |
| **cannot tell** | something on the path could not be followed | exactly what stopped it, with its file and line |

**"Unguarded" is said only when nothing on the path was left unresolved.** A call outside these files that sees the
record or the caller, a middleware Thunder cannot see, a query built at run time, a database client made for the caller,
or a route only admins reach: each makes the path "cannot tell", never "unguarded". A wrong "unguarded" sends someone
chasing a bug that is not there; a "cannot tell" points at the exact line a person has to read.

## What counts as limiting the record to the caller

A value counts as **the caller** when it comes from sign-in: `req.user`, `request.user`, `res.locals.user`,
`c.get('user')` (Hono), a sign-in middleware (`requireAuth`, `passport.authenticate`, Fastify `preHandler`), or a call
such as `getServerSession()`, `auth()`, `getUser(req)`, `currentUser()`, `jwt.verify(…)`. A value from the request
(`params`, `query`, `body`, headers, `c.req.param(…)`, `searchParams`) never counts, even if it is named `tenantId`.

These limit the record to the caller:

- **A where clause** with an owner field set from the caller: `tenantId`, `orgId`, `organizationId`, `ownerId`,
  `userId`, `accountId`, `workspaceId`, `teamId`, `customerId`, `createdBy`, … (Prisma objects, nested relation filters
  such as `members: { some: { userId } }`, Drizzle `and(eq(…), eq(…))`, Knex `where({ … })`, raw SQL
  `WHERE id = $1 AND tenant_id = $2`, postgres.js `sql\`…\``, Mongoose `findOne({ _id, owner })`). In an `OR`, every
  branch has to be limited; a branch that is not (`OR: [{ tenantId }, { public: true }]`) makes the path "cannot tell".
- **A comparison** of the record's owner field with the caller that stops the path when they differ, before the
  response: `if (!invoice || invoice.tenantId !== user.tenantId) return 404`, a `throw`, Next.js `notFound()`, a 4xx
  response, or only answering inside `if (invoice.tenantId === user.tenantId) { … }`. `String(…)` on either side,
  `.equals(…)`, a comparison kept in a name (`const allowed = …; if (!allowed) …`), and a membership check
  (`user.teamIds.includes(invoice.teamId)`, `user.teams.some((t) => t.id === invoice.teamId)`) count too.
- **A helper in the project** that does one of these: `assertSameTenant(invoice, user)` that throws, a predicate
  `canView(user, invoice)` that returns the comparison, a repository function whose where clause uses the tenant it is
  given, a class method, or a middleware that loads the record for the caller and calls `next()`.
- **A second lookup limited to the caller**, keyed by the first record and checked: the invoice's project must be one
  the caller belongs to, or the route stops.
- **The caller's own record**: `where: { id: req.user.id }`, or a list where `userId` is the caller.

Once a record chosen by a request value has been checked, a later update or delete by the same value is covered too
(`findFirst({ where: { id, tenantId } })`, a 404 when missing, then `update({ where: { id } })`).

These do **not** count, and the path stays "unguarded" when nothing else does: a check on another field
(`invoice.status`), a comparison with a tenant the request names, a check after the response was sent, a check on only
one branch, and being signed in.

## Frameworks and databases it follows

- **Routes:** Express and routers (`app.get('/x/:id', …middleware, handler)`, `router.use(…)` before them, wrappers
  such as `asyncHandler`), Fastify (`fastify.get` with `preHandler`, `fastify.route({ … })`, returning the value),
  Hono (`app.get(path, (c) => …)`), Next.js App Router `route.ts` (`GET`, `POST`, …, `params` and `await params`), and
  Next.js `pages/api`.
- **Databases:** Prisma (`findUnique`, `findFirst`, `findMany`, `update`, `delete`, `…Many`, `upsert`, `$transaction`),
  Drizzle (`select().from().where()`, `update`, `delete`, `db.query.<table>.findFirst`), Knex, raw SQL through
  `pool.query` / `client.query` / `execute` with `$1`, `?`, or named parameters, postgres.js and `$queryRaw` tagged
  templates, and Mongoose models.
- **Across files:** imports (relative paths, `@/` and `~/` aliases, re-exports), helpers, repository objects and
  classes (with `this.db`), middleware, and callbacks, up to 5 calls deep and 40,000 steps per route.

## Measured

- **The benchmark** (`compiler/test/fixtures/access-flow/`, 55 labeled routes written for this check, across every
  framework and database above, with tricky cases on purpose): every route gets its labeled verdict; "unguarded" has
  100% precision and 100% recall there, and 15% of routes are "cannot tell" by design. The test fails if a route not
  labeled unguarded is ever called unguarded.
- **Real code** (three private TypeScript repositories, about 14,500 files, read without changing them): 504 routes
  found; 0 called unguarded; 166 "cannot tell" (almost all a data store passed in at run time, such as
  `store.getOrgBySlug(slug)`); the rest read no record chosen by the request. These repositories rarely call a database
  directly, so this shows the absence of false alarms more than coverage. About 6% of their files could not be read
  (mostly JSX), and are listed rather than guessed.

## Limits

- TypeScript and JavaScript only. C#, Python, and Java come next (the model is the same; the parsers are not).
- `.tsx`/`.jsx` files with JSX are not read yet (listed under "could not read"). Route handlers rarely contain JSX.
- NestJS decorators (`@Get(':id')`), `router.route(path).get(…)`, tRPC, and GraphQL resolvers are not found as routes
  yet.
- A list that is not limited to the caller (`findMany()` with no where) is outside this check: whether that is a leak
  depends on whether the app has more than one tenant.
- Role checks make a path "cannot tell": whether admins may see every tenant's records is a policy, not code.
- Row-level security in the database, ORM extensions that add a tenant filter, and clients made per tenant cannot be
  seen from the query; such paths are "cannot tell" when they are visible, and missed when they are not.
- A verdict is about the code it was given. A guard in a file that was not included is not seen.
