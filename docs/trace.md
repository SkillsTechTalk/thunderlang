# Thunder Trace: how your repositories depend on each other

Point Thunder Trace at several repositories. It answers two questions, with no AI and nothing run:

1. **What talks to what?** HTTP requests are matched to the routes that handle them, events to the code that
   listens for them, SQL to the repository that creates the table, and dependencies to the repository that
   publishes the package, across repositories.
2. **What do they share?** Setting keys more than one repository reads, tables more than one repository uses, and
   packages the repositories ask for at different versions.
3. **What can this change affect?** It lists the callers of a changed or removed route, the listeners of a
   published event, the code that uses a changed, dropped, or removed table, the other readers of a setting, and the
   dependents of a published package, ranked by risk. Every item cites `repo@sha:file:line`.

```text
  web ──POST /api/orders──▶ orders ──event order.placed──▶ billing
  (src/api.ts:4)            (src/server.ts:6, :8)          (app/worker.ts:3)

  change POST /api/orders in orders
    HIGH  1 caller in web depends on it             web@1a2b3c4:src/api.ts:4
    HIGH  it publishes order.placed; billing handles it   billing@5d6e7f8:app/worker.ts:3
```

## Commands

```sh
thunder trace ../web ../orders ../billing                 # the links between them
thunder trace ../web ../orders ../billing --out graph.json   # save the graph (thunder-trace-v1) to commit or diff

thunder trace impact "POST /api/orders" ../web ../orders ../billing   # a route
thunder trace impact order.placed ../web ../orders ../billing        # an event
thunder trace impact table:orders ../web ../orders ../billing        # a table
thunder trace impact setting:ORDERS_URL ../web ../orders             # a setting key
thunder trace impact package:@acme/orders-client ../web ../orders    # a package a traced repository publishes
thunder trace impact orders:src/server.ts:6 ../web ../orders         # a file, or one line in it

thunder trace impact --diff ../web ../orders ../billing   # the current changes: branch + uncommitted + new files
thunder trace impact --diff --base v2.3.0 ../orders ../web
```

Each folder is one repository, named after the folder. Add `--json` to any command for the full result. A plain
name that is no route, event, or file is looked up as a table, then a setting, then a package.

With `--diff`, each repository is compared with the commit where its branch left `main` (or `master`, `origin`
first), or with `--base`. Thunder Trace also reads each changed file as it was **before** the change. So a route or
an event that was **removed** is caught: its callers in other repositories now reach nothing, and that is the
highest-risk finding there is. The same goes for a table: one no longer created, or a new `DROP TABLE`, is
listed with every place in another repository that still uses it.

For coding agents, the MCP server (`thunder mcp`) offers the same answers as the `intent_trace` tool: "ask Thunder
Trace before changing code other repositories use". It reads local folders only and is never offered to remote
clients.

## The rules (why you can trust an answer)

| Rule | Why |
| --- | --- |
| A link is made only on a fact. An HTTP request links when its method and path match exactly one route in another repository. An event links when it is published under the same name another repository listens for. | An answer you have to double-check saves no time. |
| Two routes that match equally are both named, and **neither is chosen**. | Picking one would be a guess. |
| Routes, requests, and events in test and fixture files (`test/`, `*.test.ts`, `test_*.py`, `*_test.go`, `*Tests.cs`, …) are left out and counted. | A test's pretend route is not how services talk. |
| Paths every service has (`/health`, `/metrics`, `/status`, `/`, …) and paths with no fixed part (`/:id`) are never linked across repositories. | Linking them would connect everything to everything. |
| A request whose path is worked out when it runs is listed as **not linked**, with the reason. | Unknown stays unknown. |
| `${ORDERS_URL}/api/orders` links by its path, and the link says *matched by path; the base address is set when it runs*. | The path is in the code; the host is configuration. |
| A table links when code or SQL reads or writes it and **exactly one other** repository creates it (`CREATE TABLE` in its SQL). A repository that creates the table itself is using its own. A table two repositories both create is named, and neither is chosen. | The repository that creates a table is the one whose migrations change it. |
| A package links when exactly one other repository publishes it (`package.json` `name`, `go.mod` `module`, `.csproj` `PackageId`). | A version range in a manifest is a stated dependency, not a guess. |
| SQL in code is read only from strings shaped like a statement (`SELECT … FROM`, `INSERT INTO`, `UPDATE … SET`, `DELETE FROM`, `WITH … AS (`). A table name inserted when it runs is not read. | "Delete your data from Profile" is a sentence, not SQL. |
| A setting is read only by a written key (`process.env.ORDERS_URL`, `os.getenv("ORDERS_URL")`). Keys every service reads for itself or the platform sets (`PORT`, `NODE_ENV`, `VERCEL_ENV`, …) are never shared. | Two services reading `PORT` share nothing. |
| Versions differ only **between repositories**: a repository's set of versions for a package differs from another's. Peer ranges (`>=19`) and versions that name a place (`workspace:*`, `file:`) are left out. | `^9` and `^9.39.5` in every repository is not drift. |
| Impact **stops at the first hop**: the callers of a changed route are listed, but their callers are not. | Otherwise one shared service lists the whole estate, and the answer becomes noise. |
| Every finding cites `repo@sha:file:line`. `+changes` marks a repository with uncommitted work, and `(before the change)` marks a removed item. | No citation, no finding. |
| The graph has a fingerprint (SHA-256 of its content, with the rules version). The same commits give the same fingerprint. | You can tell whether two answers came from the same code. |

Fixed path parts match regardless of case across repositories (ASP.NET routes ignore case). Inside one repository,
`thunder read` and `thunder atlas` keep linking calls as before.

## Risk

| Risk | Finding |
| --- | --- |
| high | A route that other repositories call changed or was removed. An event other repositories listen for changed or is no longer published. A table other repositories use was changed, dropped, or is no longer created. |
| medium | A request into another repository changed: it depends on that route. SQL on a table another repository creates changed. Code inside a package other repositories depend on changed: they get it when they take the new version. |
| low | A listener changed. Code that reads a setting other repositories read too changed. A route, event, or table that nothing traced uses changed. |

## What is read today

| | Read |
| --- | --- |
| **Routes** | Express and Fastify `app.get/post(…)` and routers; Next.js `app/**/route.ts` and `pages/api`; NestJS `@Get()`; FastAPI and Flask decorators; Spring `@GetMapping` with a class `@RequestMapping` prefix; ASP.NET `[HttpGet]` with a class `[Route("api/[controller]")]` prefix; Go chi `r.Get(…)`; PHP, Ruby and Swift Vapor routes that the reader knows |
| **Requests** | `fetch`, Python `requests`, and the other HTTP calls the reader's library catalog (`compiler/src/libraries.mjs`) recognizes, the steps it reads as `Sends a POST request to …` |
| **Tables** | SQL files: `CREATE TABLE` (not temporary tables), `ALTER TABLE`, `DROP TABLE`, and the tables views and statements read and write. Code: SQL in strings and multi-line strings (template literals, `"""…"""`) shaped like a statement. `REFERENCES` and `GRANT`/`REVOKE` are not uses. |
| **Settings** | `process.env`, `import.meta.env`, `Deno.env.get`, Python `os.environ`/`os.getenv`, Go `os.Getenv`, Java `System.getenv`, C# `Environment.GetEnvironmentVariable`, Ruby `ENV`, Rust `env::var`, PHP `getenv`/`$_ENV`, by a written key |
| **Packages** | `package.json` (name, dependencies, dev, peer, optional), `go.mod` (module, require), `requirements.txt`, `.csproj` (`PackageId`, `PackageReference`) |
| **Events** | `publish`/`emit`/`produce`/`sendToQueue`/`basic_publish` with a written name, BullMQ queues; listeners through `.on/.subscribe/.consume(…)` and `@KafkaListener`, `@RabbitListener`, `@SqsListener`, `@EventPattern`, `@MessagePattern`, `@OnEvent` and similar |

Not read yet, so these are not linked: Go `http.HandleFunc` routes, ASP.NET minimal APIs (`app.MapGet`), gRPC,
GraphQL, routes registered from configuration, event names held in constants, tables defined by an ORM (Prisma
models, Django or Entity Framework migrations), `pyproject.toml`, `pom.xml` and Gradle builds, and settings read
through a config library instead of the environment. Infrastructure links are next (see "Next" below).

## The graph file (`thunder-trace-v1`)

```text
{ schema, rulesVersion, fingerprint,
  repos:     [{ name, sha, dirty, files, languages, routes, listeners, requests, publishes, unknown,
                packages: { publishes, depends }, settings, tables }],
  links:     [{ kind: "http" | "event" | "data" | "package", method?, path?, route?, base?, event?,
                table?, access?, package?, version?, from: End, to: End }],
  notLinked: [{ kind, call, from: End, why }],
  shared:    { settings: [{ key, readers: [End] }], tables: [{ table, users: [End + access] }],
               drift: [{ package, versions: [{ version, at: [End] }] }] } }
End = { repo, member, label, file, line, cite }
```

`trace impact` gives `thunder-trace-impact-v1`:
`{ findings: [{ risk, kind, says, at: End, dependents: [End + how] }], changed, stopsAt: 1, traceFingerprint }`.
The `kind` of a finding is `route-changed`, `route-removed`, `event-published`, `event-removed`,
`request-changed`, `listener-changed`, `table-changed`, `table-dropped`, `table-removed`, `query-changed`,
`setting-changed`, or `package-changed`. A table's `access` is `creates`, `alters`, `drops`, `reads`, or `writes`.
Rules v2 (this version) added tables, settings, and packages; graphs from v1 have none of them.

The engine (`compiler/src/trace.mjs`, with `compiler/src/trace-data.mjs` for tables, settings, and packages) is browser-safe. Folders and git are read by `compiler/src/trace-fs.mjs`.

## Next

- Infrastructure links, from the Terraform, Bicep, Kubernetes, and Compose readers Thunder already has.
- A Thunder Trace section in the Thunder review GitHub Action comment (`impact --diff` on every pull request).
- Rules written in Thunder (`Never allow a service to read another service's database`) and checked against the
  graph.
