# IntentLang Syntax Overview

> Status: draft (v0). Syntax is illustrative and will change. There is no
> released compiler yet.

IntentLang files use the `.intent` extension. `.il` is reserved for a possible
internal compiler intermediate language and is not used publicly.

## Style

Canonical keywords are **lowercase**. Blocks are introduced by a keyword on its
own line; their contents are indented. Title-case aliases (for example `Mission`
instead of `mission`) may be accepted later for readability, but docs teach the
lowercase canonical form, and the compiler normalizes to lowercase internally.

- Comments start with `#`.
- Identifiers are `PascalCase` for entities and types (for example `Customer`,
  `Invoice`, `Email`).
- Lists are written one item per line, indented under a block.
- `key: Type` declares a typed field.

## Core constructs

`mission`, `goal`, `why`, `requires`, `input`, `output`, `guarantees`, `never`,
`constraints`, `assumptions`, `risks`, `target`, `style`, `implementation`,
`verify`, `test`, `observe`, `secure`, `explain`, `ownership`, `architecture`,
`dependencies`, `service`, `api`, `event`, `database`, `owner`, `proof`.

## A mission

```intent
mission CreateInvoice

goal
  Generate an invoice from approved orders

why
  Customers need accurate invoices that are auditable and never duplicated.

requires
  Customer
  ApprovedOrders

input
  customer: Customer
  orders: List<Order>

output
  invoice: Invoice

guarantees
  invoice.total is never negative
  duplicate invoices are not created
  every invoice is auditable

never
  create invoice for unapproved order
  expose payment token in logs

target
  TypeScript
  DotNet
  OpenAPI
  Tests

verify
  unit tests
  duplicate prevention test
  audit trail test
  security scan
```

## Rationale: `why` / `because`

Rationale captures engineering judgment, not just technical shape. Attach it to
a guarantee or a `never` rule:

```intent
guarantee duplicate invoices are not created
  because duplicate billing damages customer trust
  verify duplicate prevention test

never expose payment token in logs
  because logs may be visible to support and observability tools
  verify security scan
```

## Three layers

The same mission can be written at three levels of precision.

**Layer 1 - Human Intent** (readable, beginner-friendly):

```intent
mission ResetPassword

goal
  Let a user securely reset their password

requires
  verified email
  reset token

guarantees
  token expires after 15 minutes
  token can only be used once
  password is never logged
```

**Layer 2 - Typed Intent** (precise, semantic types, constraints):

```intent
mission ResetPassword

input
  email: Email
  token: ResetToken
  newPassword: Secret

output
  result: PasswordResetResult

constraints
  token.ttl <= 15 minutes
  password.minLength >= 12

never
  log(newPassword)
  return token
```

**Layer 3 - Executable Intent** (compiler-ready, target + style):

```intent
mission ResetPassword

target
  DotNet

style
  ASP.NET Core
  EntityFramework
  BCrypt

verify
  test token expiration
  test one time use
  test password hash stored
  test raw password not logged
```

## Targets, style, and adapters

`target` names what to produce. `style` gives paradigm and stack hints so an
adapter can generate idiomatic output instead of forcing one paradigm:

```intent
target
  DotNet
style
  CleanArchitecture
  CQRS
  EntityFramework
```

```intent
target
  TypeScript
style
  Functional
  Zod
  Fastify
```

Generation is adapter-driven (`intent-dotnet-adapter`,
`intent-typescript-adapter`, `intent-openapi-adapter`, and so on). Each adapter
declares what source blocks it needs, what artifacts it produces, what
verification it can run, and what proof it can emit.

## Semantic types

Prefer semantic types over primitives. `email: Email` lets tools reason about
meaning, not just shape. Planned built-in types include:

`Email`, `Money`, `Currency`, `Url`, `UserId`, `AccountId`, `Secret`, `Token`,
`Jwt`, `Date`, `DateTime`, `Duration`, `Percentage`, `FilePath`, `Repository`,
`ServiceName`, `ApiEndpoint`, `EventName`, `DatabaseTable`, `TraceId`,
`CorrelationId`, `IdempotencyKey`, `Version`, `EnvironmentName`.

## Security modifiers

Security is first-class. Fields can be marked so the compiler and verifier can
enforce handling:

```intent
field paymentToken: Secret
  never log
  never return to client
  store encrypted
```

Modifiers: `Sensitive`, `Secret`, `Encrypted`, `Internal`, `Public`, `PII`,
`AuditRequired`, `RequiresPermission`, `NeverLog`, `NeverReturn`, `Redacted`.

## Architecture, API, and event blocks

```intent
service BillingService
owns
  Invoice
  PaymentAttempt
consumes
  OrderApproved
publishes
  InvoiceCreated
database
  Postgres
owner
  Finance Platform Team
```

```intent
api CreateInvoice
method
  POST
path
  /invoices
requires
  authenticated user
  permission invoice:create
input
  CreateInvoiceRequest
output
  InvoiceResponse
errors
  400 InvalidOrder
  401 Unauthorized
  409 DuplicateInvoice
```

```intent
event InvoiceCreated
publishedBy
  BillingService
consumedBy
  NotificationService
  ReportingService
payload
  invoiceId: InvoiceId
  customerId: CustomerId
  total: Money
guarantees
  event is idempotent
  event contains no payment secrets
```

## Behavior-first tests

```intent
test DuplicateInvoicePrevention
given
  approved order already invoiced
when
  CreateInvoice runs again
then
  no duplicate invoice is created
  existing invoice is returned
```

## Verification

```intent
verify
  typecheck
  unit tests
  integration tests
  security scan
  architecture boundary check
  performance threshold
  accessibility check
```
