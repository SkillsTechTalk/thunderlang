# IntentLang Language Specification (draft v0)

> Status: draft. This specifies the intended shape of the language. There is no
> compiler yet, so treat every rule as provisional until the reference
> implementation exists.

## 1. Files

- Source files use the `.intent` extension.
- Files are UTF-8 text.
- `.il` is reserved for a possible internal compiler intermediate language and is
  not used in public source.

## 2. Lexical rules

### 2.1 Comments
A comment starts with `#` and runs to the end of the line. There are no block
comments in v0.

```intent
# this is a comment
mission CreateInvoice   # trailing comment
```

### 2.2 Indentation
IntentLang is indentation-structured. A block keyword sits at one indentation
level; its contents are indented further (two spaces is canonical). Indentation
is significant: it defines block membership. Tabs are discouraged; use spaces.

### 2.3 Identifiers
- Entity and type identifiers are `PascalCase`: `Customer`, `Invoice`, `Email`.
- Field names are `camelCase`: `idempotencyKey`, `newPassword`.
- Keywords are lowercase (see 3). Title-case aliases may be accepted later, but
  are not canonical.

### 2.4 Strings and free text
Most block bodies are free text lines (one statement per line), not quoted
strings. Quotes are only needed when a literal must contain structural
characters. A typed field uses `name: Type`.

### 2.5 Lists
A list is one item per line, indented under a block keyword:

```intent
requires
  Customer
  ApprovedOrders
```

## 3. Keywords

Canonical keywords (lowercase):

`mission`, `goal`, `why`, `because`, `requires`, `input`, `output`,
`guarantees`, `guarantee`, `never`, `constraints`, `assumptions`, `risks`,
`target`, `style`, `implementation`, `verify`, `test`, `observe`, `secure`,
`explain`, `ownership`, `owner`, `architecture`, `dependencies`, `service`,
`api`, `event`, `database`, `field`, `proof`, and the structural words
`method`, `path`, `errors`, `owns`, `consumes`, `publishes`, `publishedBy`,
`consumedBy`, `payload`, `given`, `when`, `then`.

## 4. Top-level declarations

A file contains one or more top-level declarations:

- `mission <Name>`
- `service <Name>`
- `api <Name>`
- `event <Name>`
- `test <Name>`

## 5. Blocks

### 5.1 Mission
A mission is the core unit of intent.

- `goal` (required): one or more lines describing the outcome.
- `why` (optional): rationale for the mission.
- `requires` (optional): preconditions, one per line.
- `input` / `output` (optional): typed fields, `name: Type`.
- `guarantees` (optional): properties that must always hold.
- `never` (optional): forbidden behavior.
- `constraints` (optional): bounds, for example `token.ttl <= 15 minutes`.
- `assumptions`, `risks` (optional): declared context.
- `target` (optional): languages/artifacts to produce.
- `style` (optional): paradigm/stack hints per target.
- `implementation` (optional): concrete implementation hints.
- `verify` (optional): the checks that prove the guarantees.

### 5.2 Rationale attachments
`guarantee` and `never` may be written as attached forms carrying `because` and
`verify`:

```intent
guarantee duplicate invoices are not created
  because duplicate billing damages customer trust
  verify duplicate prevention test
```

### 5.3 Service
`owns`, `consumes`, `publishes`, `database`, `dependencies`, `owner`,
`guarantees`, `verify`.

### 5.4 API
`method`, `path`, `requires`, `input`, `output`, `errors`.

### 5.5 Event
`publishedBy`, `consumedBy`, `payload`, `guarantees`, `never`, `verify`.

### 5.6 Test
`given`, `when`, `then`.

### 5.7 Field (security)
A `field` declares a typed field with security modifiers:

```intent
field paymentToken: Secret
  never log
  never return to client
  store encrypted
```

## 6. Semantic types

Prefer semantic types over primitives. Planned built-ins:

`Email`, `Money`, `Currency`, `Url`, `UserId`, `AccountId`, `Secret`, `Token`,
`Jwt`, `Date`, `DateTime`, `Duration`, `Percentage`, `FilePath`, `Repository`,
`ServiceName`, `ApiEndpoint`, `EventName`, `DatabaseTable`, `TraceId`,
`CorrelationId`, `IdempotencyKey`, `Version`, `EnvironmentName`.

Container types use angle brackets, for example `List<Order>`.

## 7. Security modifiers

`Sensitive`, `Secret`, `Encrypted`, `Internal`, `Public`, `PII`,
`AuditRequired`, `RequiresPermission`, `NeverLog`, `NeverReturn`, `Redacted`.

These are intended to trigger compiler and OpenThunder expectations (for example,
a `Secret` field is expected to carry `never log` / `never return` behavior).

## 8. Error model

The compiler reports diagnostics with a severity and a source span. Draft
severities: `error` (invalid program), `warning` (likely intent gap, for example
a duplicate-prevention guarantee with no idempotency clue), and `info`.

## 9. Versioning

The language and the proof schema are versioned independently and start at
`0.1.0`. Breaking changes bump the minor version while below `1.0.0`. Proof
artifacts carry a `schemaVersion` field so consumers can adapt.
