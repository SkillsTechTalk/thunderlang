# Intent Language, intentlanguage.dev

The official website for **Intent**, the first Intent-Oriented Programming
language for the AI era, built by **SkillsTech**.

> Write what your software should do. Let AI and the compiler help determine how
> to build it, verify it, and keep it understandable.

This repository currently contains the **marketing / documentation site**. The
language, compiler, and CLI do not exist yet, everything here is deliberately
labeled as draft and forward-looking.

## Tech stack

- [Next.js 14](https://nextjs.org) (App Router)
- TypeScript
- Tailwind CSS
- Deployed on [Vercel](https://vercel.com) → `intentlanguage.dev`

## Getting started

```bash
npm install
cp .env.example .env.local   # optional, see Environment variables
npm run dev                  # http://localhost:3000
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
| `/playground`  | In-browser syntax preview (no execution yet)     |
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
| `NEXT_PUBLIC_SITE_URL`  | No       | Public base URL. Defaults to `https://intentlanguage.dev`.                  |
| `WAITLIST_WEBHOOK_URL`  | No       | Endpoint that receives `POST { email, source }` for waitlist signups.       |

## Waitlist behavior

The waitlist captures real signups, in priority order:

1. **Vercel Blob (default).** A private Blob store named `waitlist` is linked to
   the project, so `BLOB_READ_WRITE_TOKEN` is set automatically. Each signup is
   written to `waitlist/<sha256(email)>.json` (idempotent — re-submitting the
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

Deployed to Vercel and served at `intentlanguage.dev`.

1. Import the repo into Vercel (framework auto-detected as Next.js).
2. Set env vars in Project Settings → Environment Variables.
3. Add the domain `intentlanguage.dev` (and `www`) under Project → Domains.

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

Early and honest. Draft syntax throughout. Not production-ready. Does not claim
to outperform Rust, Go, Python, Java, TypeScript, or .NET today.
