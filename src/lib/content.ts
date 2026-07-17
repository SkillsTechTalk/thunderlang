/** Shared, illustrative content. All ThunderLang code here is DRAFT syntax. */

/** The canonical CreateInvoice mission, the shared reference example. */
export const heroExample = `mission CreateInvoice

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
  idempotencyKey: IdempotencyKey

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
  Markdown
  Mermaid

verify
  unit tests
  duplicate prevention test
  audit trail test
  security scan
`;

/** A compact mission for tighter spaces. */
export const heroExampleShort = `mission CreateInvoice

goal
  Generate an invoice from approved orders

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
  Tests
`;

/** CreateInvoice with ThunderLens notes, for the playground default. */
export const createInvoiceWithNotes = `mission CreateInvoice

note pm:
  One placed order should become one invoice, even if checkout retries.

note beginner:
  This mission is about safe invoice creation, not charging the card.

goal
  Generate an invoice from approved orders

why
  Customers need accurate invoices that are auditable and never duplicated.

input
  customer: Customer
  orders: List<Order>
  idempotencyKey: IdempotencyKey
    note beginner:
      A retry key. The same key returns the same invoice instead of creating another.
    note qa:
      Send the same order twice with the same idempotency key and expect one invoice.

output
  invoice: Invoice

guarantees
  invoice.total is never negative
  duplicate invoices are not created
  every invoice is auditable

guarantee duplicate invoices are not created
  because duplicate billing damages customer trust
  note risk:
    Duplicate billing creates refunds, support tickets, finance cleanup, and lost trust.
  verify duplicate prevention test

never
  create invoice for unapproved order
  expose payment token in logs

never expose payment token in logs
  note security:
    Payment tokens must not appear in logs, events, debug output, proof, or AI context.
  verify security scan

target
  TypeScript
  DotNet
  Tests

verify
  unit tests
  duplicate prevention test
  audit trail test
  security scan
`;

/** A complete ResetPassword mission (all layers combined) for the playground. */
export const resetPasswordFull = `mission ResetPassword

goal
  Let a user securely reset their password

why
  A weak reset flow is a common path to account takeover.

input
  email: Email
  token: ResetToken
  newPassword: Secret

output
  result: PasswordResetResult

guarantees
  token expires after 15 minutes
  token can only be used once
  password is never logged

never
  log newPassword
  return token to client

target
  DotNet
  Tests

verify
  test token expiration
  test one time use
  test password hash stored
`;

/* --------------------------------------------------------------------------
 * Three syntax layers, shown on the ResetPassword mission.
 * -------------------------------------------------------------------------- */

export const layerHuman = `mission ResetPassword

goal
  Let a user securely reset their password

requires
  verified email
  reset token

guarantees
  token expires after 15 minutes
  token can only be used once
  password is never logged
`;

export const layerTyped = `mission ResetPassword

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
`;

export const layerExecutable = `mission ResetPassword

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
`;

/* --------------------------------------------------------------------------
 * Architecture-, API-, and event-level intent.
 * -------------------------------------------------------------------------- */

export const architectureExample = `service BillingService

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
`;

export const apiExample = `api CreateInvoice

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
`;

export const eventExample = `event InvoiceCreated

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
`;

export const testExample = `test DuplicateInvoicePrevention

given
  approved order already invoiced

when
  CreateInvoice runs again

then
  no duplicate invoice is created
  existing invoice is returned
`;

/* -------------------------------------------------------------------------- */

export type Principle = { title: string; body: string };

export const principles: Principle[] = [
  {
    title: "Intent-first",
    body: "Code begins with what the software should accomplish, not with the implementation.",
  },
  {
    title: "Reads like structured pseudocode",
    body: "A senior engineer, architect, product manager, or AI agent should understand the file on first read.",
  },
  {
    title: "Contracts by default",
    body: "Every mission can declare its requirements, guarantees, constraints, and forbidden behavior.",
  },
  {
    title: "AI-assisted but deterministic",
    body: "AI may help generate implementation, tests, docs, and explanations, but the build stays reproducible.",
  },
  {
    title: "Multi-target",
    body: "One mission can target TypeScript, Python, .NET, Java, Go, or Rust through adapters.",
  },
  {
    title: "Verification-first",
    body: "A mission is not complete because code exists. It is complete when its guarantees are verified.",
  },
  {
    title: "Architecture-aware",
    body: "ThunderLang understands services, APIs, events, databases, dependencies, ownership, and boundaries.",
  },
  {
    title: "Repository-aware",
    body: "ThunderLang maps missions to real repo files, services, tests, docs, and ownership.",
  },
  {
    title: "Human + AI collaboration",
    body: "ThunderLang gives humans a clear way to express judgment and gives AI a structured way to help.",
  },
  {
    title: "Proof-producing",
    body: "Every completed mission can produce proof: tests, reports, docs, an implementation trace, and a verification summary.",
  },
];

export type EcosystemItem = {
  name: string;
  role: string;
  detail: string;
};

export const ecosystem: EcosystemItem[] = [
  {
    name: "ThunderLang",
    role: "Define what software should do",
    detail:
      "The intent-oriented language at the center: a clear, structured statement of goals, constraints, and guarantees.",
  },
  {
    name: "OpenThunder",
    role: "Proves the repo matches the intent",
    detail:
      "Reads intent, compares it to the real repo, and detects drift: unverified guarantees, violated rules, and ownership gaps.",
  },
  {
    name: "Repo Mastery",
    role: "Proves the human understands the mission",
    detail:
      "Turns missions into learning paths, quizzes, and reality checks so engineers truly understand the code they own.",
  },
  {
    name: "SkillsTech Talk",
    role: "Explain and defend it",
    detail:
      "Turns missions into drills for articulating and defending the design decisions behind the software you own.",
  },
  {
    name: "SkillsTech Certified",
    role: "Proves the learner understands the method",
    detail:
      "A path to demonstrate real, verifiable command of Intent-Oriented Programming and the intent behind a codebase.",
  },
  {
    name: "Skills Tech Studio",
    role: "Build it",
    detail:
      "The desktop environment where every role writes, previews, compiles, verifies, and traces intent, connected to real repo files.",
  },
];

export type NotItem = { label: string; body: string };

export const whatIntentIsNot: NotItem[] = [
  {
    label: "Not an AI wrapper",
    body: "ThunderLang is a language with its own model of intent, contracts, and verification, not a thin shell over a chat API.",
  },
  {
    label: "Not a prompt format only",
    body: "Prompts are one way to draft intent, but ThunderLang is structured, reviewable source, not a paragraph of instructions.",
  },
  {
    label: "Not a no-code tool",
    body: "ThunderLang is for engineers. It makes engineering intent explicit; it does not hide the system from the people who own it.",
  },
  {
    label: "Not a replacement for every language",
    body: "ThunderLang sits above Python, TypeScript, .NET, Java, Go, and Rust as an intent and verification layer. It targets them; it does not erase them.",
  },
  {
    label: "Not magic",
    body: "There is no hidden trick. ThunderLang makes goals and guarantees explicit so tools can help you keep them.",
  },
  {
    label: "Not production-ready yet",
    body: "Not until the compiler, runtime, tests, and verification engine prove it. And it makes no claim to outperform the languages it targets today.",
  },
];
