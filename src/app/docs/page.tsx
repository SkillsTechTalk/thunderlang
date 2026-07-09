import Link from "next/link";
import { PageHero, Section, DraftNote, Pill, Card } from "@/components/ui";
import { IntentCode } from "@/components/IntentCode";
import { pageMeta } from "@/lib/seo";
import { heroExample } from "@/lib/content";
import { getDocList } from "@/lib/docs";

export const metadata = pageMeta({
  title: "Documentation",
  description:
    "Early documentation for IntentLang, an Intent-Oriented Programming language by SkillsTech. Concepts, the Mission structure, contracts, and verification.",
  path: "/docs",
});

const toc = [
  { id: "concepts", label: "Core concepts" },
  { id: "mission", label: "The Mission block" },
  { id: "layers", label: "Three layers" },
  { id: "contracts", label: "Contracts & guarantees" },
  { id: "types", label: "Semantic types" },
  { id: "security", label: "Security model" },
  { id: "targets", label: "Targets" },
  { id: "cli", label: "The intent CLI" },
  { id: "status", label: "Status & stability" },
];

const semanticTypes = [
  "Email",
  "Money",
  "Currency",
  "Url",
  "UserId",
  "AccountId",
  "Secret",
  "Token",
  "Jwt",
  "Date",
  "DateTime",
  "Duration",
  "Percentage",
  "FilePath",
  "Repository",
  "ServiceName",
  "ApiEndpoint",
  "EventName",
  "DatabaseTable",
];

const securityMarkers = [
  ["Sensitive", "Handle with care; may appear in audits."],
  ["Secret", "Never logged, never returned to a client."],
  ["Encrypted", "Stored and transmitted encrypted."],
  ["PII", "Personal data with handling obligations."],
  ["Internal", "Not exposed outside the service boundary."],
  ["Public", "Safe to expose."],
  ["AuditRequired", "Access must be recorded."],
  ["RequiresPermission", "Gated behind an explicit permission."],
];

const cliCommands = [
  ["intent check", "Parse and validate a .intent file."],
  ["intent plan", "Produce a deterministic implementation plan."],
  ["intent generate", "Generate code for a target language."],
  ["intent verify", "Run the checks that prove the guarantees."],
  ["intent docs", "Generate Markdown documentation."],
  ["intent graph", "Render the architecture as a diagram."],
  ["intent proof", "Emit an .intent-proof.json artifact."],
];

const secureFieldExample = `field paymentToken: Secret
  never log
  never return to client
  store encrypted
`;

const concepts = [
  ["Mission", "A unit of intent: a goal, its inputs and outputs, and its guarantees."],
  ["Goal", "The outcome a mission is meant to achieve, in plain language."],
  ["Requires", "What must be true or available before the mission runs."],
  ["Input / Output", "The typed values a mission consumes and produces."],
  ["Guarantees", "Properties that must always hold when the mission completes."],
  ["Never", "Forbidden behavior the implementation must never exhibit."],
  ["Constraints", "Bounds and limits, such as a token time-to-live."],
  ["Target", "A language the mission should compile toward, e.g. TypeScript."],
  ["Verify", "The checks (types, tests, scans) that prove the guarantees hold."],
  ["Architecture", "Services, APIs, events, data, dependencies, and ownership."],
];

export default function DocsPage() {
  const guides = getDocList();
  return (
    <>
      <PageHero
        eyebrow="Documentation"
        title="Learn IntentLang, from the idea to the draft syntax."
        intro="This is an early documentation stub. It captures the mental model and the current draft syntax while the language and compiler are still taking shape."
      />

      <Section>
        <div className="mb-4">
          <p className="eyebrow">Full guides</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
            Read the language docs.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guides.map((g) => (
            <Link key={g.slug} href={`/docs/${g.slug}`}>
              <Card className="h-full">
                <h3 className="text-base font-semibold text-white">
                  {g.label}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-haze-300">
                  {g.blurb}
                </p>
                <span className="mt-3 inline-block text-sm text-gold-300">
                  Read →
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[220px_1fr]">
          {/* Sidebar */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-haze-400">
              On this page
            </p>
            <nav className="mt-4 space-y-2">
              {toc.map((t) => (
                <a
                  key={t.id}
                  href={`#${t.id}`}
                  className="block text-sm link-muted"
                >
                  {t.label}
                </a>
              ))}
            </nav>
            <div className="mt-8">
              <Pill>Draft · v0</Pill>
            </div>
          </aside>

          {/* Content */}
          <div className="max-w-prose space-y-16">
            <div className="scroll-mt-24" id="concepts">
              <h2 className="text-2xl font-semibold text-white">
                Core concepts
              </h2>
              <p className="mt-3 text-haze-300">
                IntentLang has a small vocabulary. These are the terms you will see
                throughout the docs and examples.
              </p>
              <dl className="mt-6 divide-y divide-white/8 rounded-2xl border border-white/8">
                {concepts.map(([term, def]) => (
                  <div
                    key={term}
                    className="grid gap-1 px-5 py-4 sm:grid-cols-[160px_1fr]"
                  >
                    <dt className="font-mono text-sm text-gold-300">{term}</dt>
                    <dd className="text-sm text-haze-300">{def}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="scroll-mt-24" id="mission">
              <h2 className="text-2xl font-semibold text-white">
                The Mission block
              </h2>
              <p className="mt-3 text-haze-300">
                A <code className="font-mono text-gold-300">Mission</code> is the
                core unit of intent. It names a goal, declares what it requires,
                lists the guarantees that must hold, and names the targets it
                should compile toward.
              </p>
              <div className="mt-6">
                <IntentCode
                  code={heroExample}
                  filename="CreateInvoice.intent"
                />
              </div>
            </div>

            <div className="scroll-mt-24" id="layers">
              <h2 className="text-2xl font-semibold text-white">Three layers</h2>
              <p className="mt-3 text-haze-300">
                The same mission can be written at three levels of precision:
                readable <strong>Human Intent</strong>, a more exact{" "}
                <strong>Typed Intent</strong> with semantic types and
                constraints, and compiler-ready{" "}
                <strong>Executable Intent</strong> that names a target and its
                checks. See all three side by side on the{" "}
                <Link
                  href="/examples#layer-human"
                  className="text-gold-300 hover:text-gold-200"
                >
                  examples page
                </Link>
                .
              </p>
            </div>

            <div className="scroll-mt-24" id="contracts">
              <h2 className="text-2xl font-semibold text-white">
                Contracts &amp; guarantees
              </h2>
              <p className="mt-3 text-haze-300">
                Guarantees are not tests bolted on afterward. They are part of
                the program. Each guarantee is a property the implementation must
                never violate, and the one IntentLang aims to verify for you across
                every target.
              </p>
              <ul className="mt-5 space-y-2 text-sm text-haze-300">
                <li>• Guarantees read as plain, checkable statements.</li>
                <li>• They travel with the Mission, not in a separate suite.</li>
                <li>
                  • Verification can be satisfied by types, tests, runtime
                  checks, or proofs.
                </li>
              </ul>
            </div>

            <div className="scroll-mt-24" id="types">
              <h2 className="text-2xl font-semibold text-white">
                Semantic types
              </h2>
              <p className="mt-3 text-haze-300">
                IntentLang favors semantic types over primitives. Writing{" "}
                <code className="font-mono text-gold-300">email: Email</code>{" "}
                instead of{" "}
                <code className="font-mono text-haze-200">email: string</code>{" "}
                lets the compiler and verification tools reason about meaning,
                not just shape. Planned built-in types include:
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {semanticTypes.map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-xs text-gold-200"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            <div className="scroll-mt-24" id="security">
              <h2 className="text-2xl font-semibold text-white">
                Security model
              </h2>
              <p className="mt-3 text-haze-300">
                Security is first-class. Fields can be marked so the compiler and
                verifier can enforce how they are handled.
              </p>
              <div className="mt-6">
                <IntentCode code={secureFieldExample} filename="Payment.intent" />
              </div>
              <dl className="mt-6 divide-y divide-white/8 rounded-2xl border border-white/8">
                {securityMarkers.map(([marker, def]) => (
                  <div
                    key={marker}
                    className="grid gap-1 px-5 py-4 sm:grid-cols-[190px_1fr]"
                  >
                    <dt className="font-mono text-sm text-gold-300">{marker}</dt>
                    <dd className="text-sm text-haze-300">{def}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="scroll-mt-24" id="targets">
              <h2 className="text-2xl font-semibold text-white">Targets</h2>
              <p className="mt-3 text-haze-300">
                A single Mission can target multiple languages. The meaning stays
                the same; the generated implementation adapts to each target&apos;s
                idioms. Planned early targets include TypeScript, Python, .NET,
                Java, Go, and Rust, plus artifacts like OpenAPI, Markdown, and
                Mermaid diagrams.
              </p>
            </div>

            <div className="scroll-mt-24" id="cli">
              <h2 className="text-2xl font-semibold text-white">
                The intent CLI
              </h2>
              <p className="mt-3 text-haze-300">
                A planned command-line interface drives the pipeline from source
                to proof. AI assistance is optional and traceable; every
                generated artifact records how it was produced.
              </p>
              <dl className="mt-6 divide-y divide-white/8 rounded-2xl border border-white/8">
                {cliCommands.map(([cmd, def]) => (
                  <div
                    key={cmd}
                    className="grid gap-1 px-5 py-4 sm:grid-cols-[190px_1fr]"
                  >
                    <dt className="font-mono text-sm text-gold-300">{cmd}</dt>
                    <dd className="text-sm text-haze-300">{def}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-sm text-haze-400">
                These commands are proposed, not shipped. Track them on the{" "}
                <Link
                  href="/roadmap"
                  className="text-gold-300 hover:text-gold-200"
                >
                  roadmap
                </Link>
                .
              </p>
            </div>

            <div className="scroll-mt-24" id="status">
              <h2 className="text-2xl font-semibold text-white">
                Status &amp; stability
              </h2>
              <DraftNote>
                IntentLang has no released compiler or CLI yet. This documentation
                describes the intended model and draft syntax. Nothing here is
                stable, and everything is subject to change before v1.
              </DraftNote>
              <p className="mt-5 text-sm text-haze-400">
                Want to follow along?{" "}
                <Link
                  href="/waitlist"
                  className="text-gold-300 hover:text-gold-200"
                >
                  Join the waitlist
                </Link>{" "}
                or check the{" "}
                <Link
                  href="/roadmap"
                  className="text-gold-300 hover:text-gold-200"
                >
                  roadmap
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
