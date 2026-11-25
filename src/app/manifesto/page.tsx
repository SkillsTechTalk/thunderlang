import Link from "next/link";
import { PageHero, Section, CTAButtons } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { pageMeta } from "@/lib/seo";
import { OPENTHUNDER_URL } from "@/lib/site";
import { CAPABILITY_ROWS } from "@/lib/positioning";

export const metadata = pageMeta({
  title: "The Thunder Manifesto",
  description:
    "Humans should not have to learn a new programming language every time they want to use a different technology. Thunder is a human-native programming language designed for the AI era.",
  path: "/manifesto",
});

// The founder-approved manifesto, word for word. The longer version with the same opening lives at /docs/manifesto.
export default function ManifestoPage() {
  return (
    <>
      <PageHero
        eyebrow="Manifesto"
        title={<>Programming, <span className="text-gradient-gold">made human.</span></>}
        intro="Why Thunder exists, and what it is for."
      />

      <Section>
        <div className="mx-auto max-w-prose space-y-6 text-lg leading-relaxed text-haze-200">
          <p>
            For decades, humans have learned to speak the languages of computers. We learned their syntax, their rules,
            their abstractions and their limitations.
          </p>
          <p>Then AI changed the way software is written. Machines can now generate code in almost any programming language.</p>
          <p>
            But humans still need to understand what that code does, decide what it should do and take responsibility for
            the software they create.
          </p>
          <p>We believe programming should evolve accordingly.</p>
          <p className="border-l-2 border-gold-300/60 pl-5 text-xl font-semibold text-white">
            Humans should not have to learn a new programming language every time they want to use a different technology.
          </p>
          <p>
            Thunder is a human-native programming language designed for the AI era. Write software in clear, structured
            language. Understand it through words and visuals. Verify its behavior. Compile it to the ecosystem that best
            serves your application.
          </p>
          <p>
            Python for artificial intelligence. TypeScript for the web. Java and C# for enterprise software. Go for
            distributed systems. Rust for systems programming. One language for the humans building them.
          </p>
          <p>
            Thunder is designed to work in both directions. Read existing software in Thunder, or create new software
            directly in Thunder.
          </p>
          <p>AI helps us build. Compilers preserve precision. Humans retain understanding and control.</p>
          <p>No unnecessary syntax. No hidden behavior. No proprietary execution ecosystem.</p>
          <p>
            Our ambition is simple:{" "}
            <strong className="font-semibold text-white">Make software understandable to everyone and make programming accessible to anyone.</strong>
          </p>
          <p className="pt-2 text-2xl font-semibold tracking-tight text-white">
            Thunder. <span className="text-gradient-gold">Programming, made human.</span>
          </p>
        </div>
      </Section>

      <Section id="today" className="border-t border-white/8 bg-ink-900/40">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-white">Where Thunder is today</h2>
          <p className="mt-3 text-lg leading-relaxed text-haze-300">
            We advertise each compilation capability only once it works. Reading comes first, and it works today.
          </p>
          <ul className="mt-6 divide-y divide-white/8 rounded-2xl border border-white/10">
            {CAPABILITY_ROWS.map((r) => (
              <li key={r.what} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="min-w-0">
                  <p className="font-semibold text-white">{r.what}</p>
                  <p className="mt-1 text-sm text-haze-300">{r.detail}</p>
                  {r.caveat && (<p className="mt-1 text-xs text-amber-200/90">{r.caveat.text} <Link href={r.caveat.href} className="font-medium text-gold-300 underline decoration-gold-300/40 underline-offset-2 hover:text-gold-200">{r.caveat.label}</Link></p>)}
                </div>
                <StatusBadge status={r.status} className="shrink-0 self-start sm:self-center" />
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <CTAButtons primary={{ href: "/read", label: "Read code in Thunder" }} secondary={{ href: "/roadmap", label: "See the roadmap" }} />
          </div>
        </div>
      </Section>

      <Section id="openthunder" className="border-t border-white/8">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-white">Thunder and OpenThunder</h2>
          <p className="mt-3 text-lg leading-relaxed text-haze-300">
            Thunder is the language: open source under Apache 2.0, and useful on its own in your browser, your terminal,
            VS Code, and any AI agent that speaks MCP. OpenThunder is the IDE for AI-written code, where Thunder is most at
            home. Think Python and PyCharm.
          </p>
          <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/language" className="font-medium text-gold-300 hover:text-gold-200">The Thunder language →</Link>
            <a href={OPENTHUNDER_URL} className="font-medium text-gold-300 hover:text-gold-200">Open OpenThunder ↗</a>
            <Link href="/docs/manifesto" className="font-medium text-gold-300 hover:text-gold-200">Read the longer manifesto →</Link>
          </p>
        </div>
      </Section>
    </>
  );
}
