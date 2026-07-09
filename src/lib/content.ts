/** Shared, illustrative content. All Intent code here is DRAFT syntax. */

/** The canonical CreateInvoice mission, the reference example. */
export const heroExample = `Mission CreateInvoice

Goal
  Generate an invoice from approved orders

Requires
  Customer
  ApprovedOrders

Input
  customer: Customer
  orders: List<Order>

Output
  invoice: Invoice

Guarantees
  invoice.total is never negative
  duplicate invoices are not created
  every invoice is auditable

Never
  create invoice for unapproved order
  expose payment token in logs

Target
  TypeScript
  Python
  DotNet

Verify
  unit tests
  duplicate prevention test
  audit trail test
  security scan
`;

/** A compact mission for tighter spaces. */
export const heroExampleShort = `Mission CreateInvoice

Goal
  Generate an invoice from approved orders

Guarantees
  invoice.total is never negative
  duplicate invoices are not created
  every invoice is auditable

Never
  create invoice for unapproved order
  expose payment token in logs

Target
  TypeScript
  Python
  DotNet
`;

/* --------------------------------------------------------------------------
 * Three syntax layers, shown on the ResetPassword mission.
 * -------------------------------------------------------------------------- */

export const layerHuman = `Mission ResetPassword

Goal
  Let a user securely reset their password

Requires
  verified email
  reset token

Guarantees
  token expires after 15 minutes
  token can only be used once
  password is never logged
`;

export const layerTyped = `Mission ResetPassword

Input
  email: Email
  token: ResetToken
  newPassword: Secret

Output
  result: PasswordResetResult

Constraints
  token.ttl <= 15 minutes
  password.minLength >= 12

Never
  log(newPassword)
  return token
`;

export const layerExecutable = `Mission ResetPassword

Target DotNet

Implementation
  use ASP.NET Core
  use EntityFramework
  use BCrypt

Verify
  test token expiration
  test one time use
  test password hash stored
  test raw password not logged
`;

/* --------------------------------------------------------------------------
 * Architecture-, API-, and event-level intent.
 * -------------------------------------------------------------------------- */

export const architectureExample = `Service Billing

Owns
  Invoice
  PaymentAttempt

Consumes
  OrderApproved

Publishes
  InvoiceCreated

Database
  Postgres

Owner
  Finance Platform Team
`;

export const apiExample = `API CreateInvoice

Method
  POST

Path
  /invoices

Requires
  authenticated user
  permission invoice:create

Input
  CreateInvoiceRequest

Output
  InvoiceResponse

Errors
  400 InvalidOrder
  401 Unauthorized
  409 DuplicateInvoice
`;

export const eventExample = `Event InvoiceCreated

PublishedBy
  BillingService

ConsumedBy
  NotificationService
  ReportingService

Payload
  invoiceId: InvoiceId
  customerId: CustomerId
  total: Money

Guarantees
  event is idempotent
  event contains no payment secrets
`;

export const testExample = `Test DuplicateInvoicePrevention

Given
  approved order already invoiced

When
  CreateInvoice runs again

Then
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
    body: "Intent understands services, APIs, events, databases, dependencies, ownership, and boundaries.",
  },
  {
    title: "Repository-aware",
    body: "Intent maps missions to real repo files, services, tests, docs, and ownership.",
  },
  {
    title: "Human + AI collaboration",
    body: "Intent gives humans a clear way to express judgment and gives AI a structured way to help.",
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
    name: "Intent",
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
    name: "SkillsTech IDE",
    role: "Build it",
    detail:
      "The editor where you write, preview, compile, and verify intent, and connect it to real repo files.",
  },
];

export type NotItem = { label: string; body: string };

export const whatIntentIsNot: NotItem[] = [
  {
    label: "Not an AI wrapper",
    body: "Intent is a language with its own model of intent, contracts, and verification, not a thin shell over a chat API.",
  },
  {
    label: "Not a prompt format only",
    body: "Prompts are one way to draft intent, but Intent is structured, reviewable source, not a paragraph of instructions.",
  },
  {
    label: "Not a no-code tool",
    body: "Intent is for engineers. It makes engineering intent explicit; it does not hide the system from the people who own it.",
  },
  {
    label: "Not a replacement for every language",
    body: "Intent sits above Python, TypeScript, .NET, Java, Go, and Rust as an intent and verification layer. It targets them; it does not erase them.",
  },
  {
    label: "Not magic",
    body: "There is no hidden trick. Intent makes goals and guarantees explicit so tools can help you keep them.",
  },
  {
    label: "Not production-ready yet",
    body: "Not until the compiler, runtime, tests, and verification engine prove it. And it makes no claim to outperform the languages it targets today.",
  },
];
