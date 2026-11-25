# Thunder Trace: how your repositories depend on each other

Point Thunder Trace at several repositories. It answers two questions, with no AI and nothing run:

1. **What talks to what?** HTTP requests are matched to the routes that handle them, and events are matched to
   the code that listens for them, across repositories.
2. **What can this change affect?** It lists the callers of a changed or removed route and the listeners of a
   published event, ranked by risk. Every item cites `repo@sha:file:line`.

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
thunder trace impact orders:src/server.ts:6 ../web ../orders         # a file, or one line in it

thunder trace impact --diff ../web ../orders ../billing   # the current changes: branch + uncommitted + new files
thunder trace impact --diff --base v2.3.0 ../orders ../web
```

Each folder is one repository, named after the folder. Add `--json` to any command for the full result.

With `--diff`, each repository is compared with the commit where its branch left `main` (or `master`, `origin`
first), or with `--base`. Thunder Trace also reads each changed file as it was **before** the change. So a route or
an event that was **removed** is caught: its callers in other repositories now reach nothing, and that is the
highest-risk finding there is.

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
| Impact **stops at the first hop**: the callers of a changed route are listed, but their callers are not. | Otherwise one shared service lists the whole estate, and the answer becomes noise. |
| Every finding cites `repo@sha:file:line`. `+changes` marks a repository with uncommitted work, and `(before the change)` marks a removed item. | No citation, no finding. |
| The graph has a fingerprint (SHA-256 of its content, with the rules version). The same commits give the same fingerprint. | You can tell whether two answers came from the same code. |

Fixed path parts match regardless of case across repositories (ASP.NET routes ignore case). Inside one repository,
`thunder read` and `thunder atlas` keep linking calls as before.

## Risk

| Risk | Finding |
| --- | --- |
| high | A route that other repositories call changed or was removed. An event other repositories listen for changed or is no longer published. |
| medium | A request into another repository changed. It depends on that route. |
| low | A listener changed, or a route or event that nothing traced uses changed. |

## What is read today

| | Read |
| --- | --- |
| **Routes** | Express and Fastify `app.get/post(…)` and routers; Next.js `app/**/route.ts` and `pages/api`; NestJS `@Get()`; FastAPI and Flask decorators; Spring `@GetMapping` with a class `@RequestMapping` prefix; ASP.NET `[HttpGet]` with a class `[Route("api/[controller]")]` prefix; Go chi `r.Get(…)`; PHP, Ruby and Swift Vapor routes that the reader knows |
| **Requests** | `fetch`, Python `requests`, and the other HTTP calls the reader's library catalog (`compiler/src/libraries.mjs`) recognizes, the steps it reads as `Sends a POST request to …` |
| **Events** | `publish`/`emit`/`produce`/`sendToQueue`/`basic_publish` with a written name, BullMQ queues; listeners through `.on/.subscribe/.consume(…)` and `@KafkaListener`, `@RabbitListener`, `@SqsListener`, `@EventPattern`, `@MessagePattern`, `@OnEvent` and similar |

Not read yet, so these are not linked: Go `http.HandleFunc` routes, ASP.NET minimal APIs (`app.MapGet`), gRPC,
GraphQL, routes registered from configuration, and event names held in constants. Shared databases, configuration
keys, packages, and infrastructure links are next (see "Next" below).

## The graph file (`thunder-trace-v1`)

```text
{ schema, rulesVersion, fingerprint,
  repos:     [{ name, sha, dirty, files, languages, routes, listeners, requests, publishes, unknown }],
  links:     [{ kind: "http" | "event", method?, path?, route?, base?, event?, from: End, to: End }],
  notLinked: [{ kind, call, from: End, why }] }
End = { repo, member, label, file, line, cite }
```

`trace impact` gives `thunder-trace-impact-v1`:
`{ findings: [{ risk, kind, says, at: End, dependents: [End + how] }], changed, stopsAt: 1, traceFingerprint }`.
The `kind` of a finding is `route-changed`, `route-removed`, `event-published`, `event-removed`,
`request-changed`, or `listener-changed`.

The engine (`compiler/src/trace.mjs`) is browser-safe. Folders and git are read by `compiler/src/trace-fs.mjs`.

## Next

- Data, configuration, and package maps: which code reads each table, where each setting key is read, and package
  drift between repositories.
- Infrastructure links, from the Terraform, Bicep, Kubernetes, and Compose readers Thunder already has.
- A Thunder Trace section in the Thunder review GitHub Action comment (`impact --diff` on every pull request).
- Rules written in Thunder (`Never allow a service to read another service's database`) and checked against the
  graph.
