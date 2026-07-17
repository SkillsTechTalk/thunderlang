# ThunderLang, thunderlang.dev

**ThunderLang is the intent language for AI-era software.** It lets engineers
define what software should do, why it matters, what must never happen, and how
the result must be verified before code is generated, changed, or shipped. Built
by **SkillsTech**. Category: **Intent-Oriented Programming**.

> Prompt → Intent → Contract → Plan → Implementation → Verification → Proof
>
> Prompt is how the conversation starts. Intent is what the team commits to.
> Code is how the system fulfills it. Proof is how trust is earned.

ThunderLang sits above programming paradigms. It can target object-oriented,
functional, service-oriented, event-driven, API-first, infrastructure, and
documentation artifacts depending on the adapter. It does not replace TypeScript,
Python, Java, .NET, Rust, or Go, and it is not magic AI code generation.

## Try it

There is a real, deterministic compiler and CLI, published as
[`@skillstech/thunderlang`](https://www.npmjs.com/package/@skillstech/thunderlang). No AI.

```bash
npm install -g @skillstech/thunderlang
intent init Eligibility                              # scaffold a runnable starter
intent run Eligibility.thunder --inputs '{"age":20}'  # a decision decides, with a trace
intent test Eligibility.thunder                       # in-file tests prove it (2/2 passed)
intent check .                                       # gate every .thunder in the repo
```

That is the point of ThunderLang: some intent does not need code generated, it **runs**.
A decision evaluates against inputs, a lifecycle simulates against events, an outcome
contract is judged against a result, all deterministically. See
[Getting started](./docs/getting-started.md).

### This repository (a monorepo)

- `compiler/` , the deterministic compiler, CLI, and Language Server (published as
  `@skillstech/thunderlang`). Executable runtime, first-class tests, outcome contracts,
  five-profile language, style intent, security/type checks, nine export adapters
  (DMN/BPMN/NuSMV/JSON-Schema/OpenAPI/Design-Tokens/CSS/Mermaid/Playwright), schema
  migrations, a canonical proof envelope, and SARIF code scanning. 340+ tests.
- `editors/vscode/` , a VS Code extension (grammar + language client).
- `src/`, `docs/`, `examples/` , the website (thunderlang.dev), the concept docs, and
  worked example missions.
- Roadmap: [`TODO.md`](./TODO.md) · Manifesto: [`docs/manifesto.md`](./docs/manifesto.md)
  · Spec: [`docs/spec.md`](./docs/spec.md) · Editor support:
  [`docs/editor-support.md`](./docs/editor-support.md)

The compiler is deterministic and works without AI; AI is optional, traced, and
human-approved.

## Tech stack

- [Next.js 14](https://nextjs.org) (App Router)
- TypeScript
- Tailwind CSS
- Deployed on [Vercel](https://vercel.com) → `thunderlang.dev`

## Website development

The website (this repo's `src/`) is a Next.js app. The compiler is a zero-dependency
sibling in `compiler/` (no install needed to run `node compiler/src/cli.mjs ...`).

```bash
npm install
cp .env.example .env.local   # optional, see Environment variables
npm run dev                  # http://localhost:5187
```

### Scripts

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Start the local dev server           |
| `npm run build`     | Production build                     |
| `npm run start`     | Serve the production build           |
| `npm run lint`      | ESLint (next/core-web-vitals)        |
| `npm run typecheck` | TypeScript type check (`tsc --noEmit`) |

## Routes

| Route          | Purpose                                          |
| -------------- | ------------------------------------------------ |
| `/`            | Home, hero, why, philosophy, principles, ecosystem |
| `/vision`      | The vision and beliefs behind Intent             |
| `/docs`        | Early docs: concepts, Mission block, contracts   |
| `/examples`    | Draft Intent examples                            |
| `/playground`  | Run decisions + simulate lifecycles in-browser, and compile a mission |
| `/roadmap`     | Directional roadmap                              |
| `/blog`        | Blog index + posts (`/blog/[slug]`)              |
| `/community`   | How to get involved                              |
| `/waitlist`    | Waitlist signup                                  |
| `/api/waitlist`| Waitlist intake endpoint                         |

SEO extras: `/sitemap.xml`, `/robots.txt`, dynamic `/opengraph-image`,
`/manifest.webmanifest`, and an SVG favicon (`/icon.svg`).

## Environment variables

See [`.env.example`](./.env.example).

| Variable                | Required | Description                                                                 |
| ----------------------- | -------- | --------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`  | No       | Public base URL. Defaults to `https://thunderlang.dev`.                  |
| `WAITLIST_WEBHOOK_URL`  | No       | Endpoint that receives `POST { email, source }` for waitlist signups.       |

## Waitlist behavior

The waitlist captures real signups, in priority order:

1. **Vercel Blob (default).** A private Blob store named `waitlist` is linked to
   the project, so `BLOB_READ_WRITE_TOKEN` is set automatically. Each signup is
   written to `waitlist/<sha256(email)>.json` (idempotent - re-submitting the
   same address overwrites its record, no duplicates). List signups with
   `vercel blob list`. Emails are stored privately and never publicly readable.
2. **Webhook fallback.** If no Blob token is present but `WAITLIST_WEBHOOK_URL`
   is set, signups are POSTed there instead.
3. **Honest no-op.** If neither is configured, the API returns
   `status: "unconfigured"` and the form asks the visitor to email us directly.
   It never fakes a signup.

Analytics: `@vercel/analytics` and `@vercel/speed-insights` are wired in the root
layout. Enable Web Analytics / Speed Insights in the Vercel dashboard to collect
data.

## Deployment

Deployed to Vercel and served at `thunderlang.dev`.

1. Import the repo into Vercel (framework auto-detected as Next.js).
2. Set env vars in Project Settings → Environment Variables.
3. Add the domain `thunderlang.dev` (and `www`) under Project → Domains.

DNS (registrar: GoDaddy):

- `A  @  216.198.79.1` (Vercel apex) **or** an `ALIAS/ANAME` to
  `cname.vercel-dns.com` if the registrar supports it.
- `CNAME  www  cname.vercel-dns.com` (already present).

Vercel provisions TLS automatically once DNS resolves. Confirm the exact records
Vercel asks for in Project → Domains, as they can change.

## Brand

Brand assets live in [`public/brand`](./public/brand). The gold four-point star
is reproduced as inline SVG in `src/components/StarMark.tsx` for crisp scaling.

## Status

Pre-1.0 and honest. The compiler is real, deterministic, and tested (340+ tests, fuzz +
property + composition, with CI guards for checks, docs, schema sync, and formatting).
The language and its `intent-graph-v1` schema version independently and can still change
before 1.0. ThunderLang sits above paradigms; it does not replace Rust, Go, Python, Java,
TypeScript, or .NET.
