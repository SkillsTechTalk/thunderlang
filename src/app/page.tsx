import Link from "next/link";
import { IntentCode } from "@/components/IntentCode";
import {
  Section,
  SectionHeading,
  Card,
  Eyebrow,
  Pill,
  CTAButtons,
  DraftNote,
} from "@/components/ui";
import { StarMark } from "@/components/StarMark";
import {
  heroExample,
  principles,
  ecosystem,
  whatIntentIsNot,
} from "@/lib/content";
import { siteConfig } from "@/lib/site";

const philosophy = [
  { step: "Intent", body: "What the software should do, and why it exists." },
  { step: "Contract", body: "The guarantees and constraints that must hold." },
  { step: "Plan", body: "A deterministic implementation plan, before any code." },
  { step: "Implementation", body: "Code in your target language, human or AI authored." },
  { step: "Verification", body: "Types, tests, and checks that the contract holds." },
  { step: "Proof", body: "Durable evidence that intent and reality agree." },
];

const whyPoints = [
  {
    title: "AI writes faster than we can review",
    body: "AI can generate code faster than humans can read, review, and trust it. Reviewing output line by line does not scale.",
  },
  {
    title: "Traditional languages start with the how",
    body: "Most languages ask you to commit to implementation first. The original intent is scattered across code, tickets, and memory.",
  },
  {
    title: "Intent starts with the what and why",
    body: "Intent focuses on what the software should do, why it exists, which constraints matter, and how it should be verified.",
  },
  {
    title: "Engineers stay in control",
    body: "The goal is not to replace engineers. It is to help them express, verify, and own software far more clearly.",
  },
];

const targets = ["TypeScript", "Python", ".NET", "Java", "Go", "Rust"];

export default function HomePage() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                               */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-grid-faint bg-[size:44px_44px] opacity-30" />
        <div className="pointer-events-none absolute left-1/2 top-[-10%] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-gold-400/10 blur-[120px]" />

        <div className="container-x relative grid gap-14 py-16 sm:py-24 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div className="animate-fade-up">
            <div className="flex items-center gap-3">
              <StarMark className="h-6 w-6 animate-twinkle" />
              <Pill>The first Intent-Oriented language for the AI era</Pill>
            </div>

            <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
              Intent-Oriented Programming{" "}
              <span className="text-gradient-gold">for the AI era.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-haze-300">
              {siteConfig.wordmark} is a programming language by{" "}
              {siteConfig.builtBy} that lets engineers describe software in
              clear, structured intent while AI, compilers, and verification
              tools help produce reliable implementations.
            </p>

            <div className="mt-8">
              <CTAButtons
                primary={{ href: "/waitlist", label: "Join the Waitlist" }}
                secondary={{ href: "/vision", label: "Read the Vision" }}
              />
              <div className="mt-3">
                <Link
                  href="/examples"
                  className="text-sm font-medium text-gold-300 hover:text-gold-200"
                >
                  View Examples →
                </Link>
              </div>
            </div>

            <p className="mt-8 max-w-lg text-sm leading-relaxed text-haze-400">
              <span className="text-haze-200">The core promise:</span>{" "}
              {siteConfig.promise}
            </p>
          </div>

          <div className="animate-fade-up [animation-delay:120ms]">
            <IntentCode code={heroExample} filename="CreateInvoice.intent" />
            <p className="mt-3 text-center text-xs text-haze-500">
              Draft syntax, illustrative only.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Why Intent                                                         */}
      {/* ------------------------------------------------------------------ */}
      <Section id="why">
        <SectionHeading
          eyebrow="Why Intent"
          title="Software is being written faster than it can be understood."
          intro="Intent-Oriented Programming puts the meaning of software first, so engineers and AI can move quickly without losing the thread of what the code is supposed to do."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {whyPoints.map((p) => (
            <Card key={p.title}>
              <h3 className="text-lg font-semibold text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-haze-300">
                {p.body}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Core philosophy                                                    */}
      {/* ------------------------------------------------------------------ */}
      <Section id="philosophy" className="border-y border-white/8 bg-ink-900/40">
        <SectionHeading
          eyebrow="Core philosophy"
          title="Intent → Contract → Plan → Implementation → Verification → Proof"
          intro="A single, honest path from what you meant to evidence that it holds. Every stage is inspectable, and nothing is hidden from the engineer who owns it."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {philosophy.map((item, i) => (
            <div key={item.step} className="relative">
              <div className="panel h-full p-5">
                <span className="font-mono text-xs text-gold-300">
                  0{i + 1}
                </span>
                <h3 className="mt-2 text-base font-semibold text-white">
                  {item.step}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-haze-300">
                  {item.body}
                </p>
              </div>
              {i < philosophy.length - 1 && (
                <div className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-gold-300/60 md:block">
                  →
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Example syntax                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Section id="example">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <SectionHeading
              eyebrow="Example syntax"
              title="Describe the mission. Let tooling handle the rest."
              intro="A Mission states a goal, what it requires, the guarantees that must hold, and the languages it should target. It reads top-to-bottom like structured pseudocode."
            />
            <div className="mt-6 flex flex-wrap gap-2">
              {targets.map((t) => (
                <Pill key={t}>{t}</Pill>
              ))}
            </div>
            <div className="mt-6">
              <DraftNote>
                This is <strong>draft syntax</strong>. Names, keywords, and
                structure will change as the language and compiler take shape.
              </DraftNote>
            </div>
            <div className="mt-6">
              <CTAButtons
                primary={{ href: "/examples", label: "View Examples" }}
                secondary={{ href: "/docs", label: "Read the Docs" }}
              />
            </div>
          </div>
          <IntentCode code={heroExample} filename="CreateInvoice.intent" />
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Language principles                                                */}
      {/* ------------------------------------------------------------------ */}
      <Section id="principles" className="border-y border-white/8 bg-ink-900/40">
        <SectionHeading
          eyebrow="Language principles"
          title="Ten commitments that shape the language."
          intro="These principles are the north star for every design decision in Intent."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {principles.map((p) => (
            <div key={p.title} className="panel p-5">
              <h3 className="text-base font-semibold text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-haze-300">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* What Intent is NOT                                                 */}
      {/* ------------------------------------------------------------------ */}
      <Section id="not">
        <SectionHeading
          eyebrow="What Intent is not"
          title="Clear about what we are not claiming."
          intro="Being honest about the boundaries is part of being a serious language project."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {whatIntentIsNot.map((n) => (
            <div
              key={n.label}
              className="rounded-2xl border border-white/8 bg-ink-850/40 p-5"
            >
              <div className="flex items-center gap-2">
                <span className="text-haze-500">✕</span>
                <h3 className="text-base font-semibold text-white">
                  {n.label}
                </h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-haze-300">
                {n.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* SkillsTech ecosystem                                               */}
      {/* ------------------------------------------------------------------ */}
      <Section id="ecosystem" className="border-y border-white/8 bg-ink-900/40">
        <SectionHeading
          eyebrow="SkillsTech ecosystem"
          title="Intent is the center of a larger system."
          intro="Intent defines what software should do. The rest of the SkillsTech ecosystem helps you build it, understand it, master it, and prove it."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ecosystem.map((item) => (
            <Card key={item.name}>
              <div className="flex items-center gap-2.5">
                {item.name === "Intent" && <StarMark className="h-5 w-5" />}
                <h3 className="text-base font-semibold text-white">
                  {item.name}
                </h3>
              </div>
              <p className="mt-2 text-sm font-medium text-gold-300">
                {item.role}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-haze-300">
                {item.detail}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Waitlist CTA                                                       */}
      {/* ------------------------------------------------------------------ */}
      <Section>
        <div className="panel relative overflow-hidden px-6 py-14 text-center sm:px-12">
          <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-[560px] -translate-x-1/2 rounded-full bg-gold-400/10 blur-[100px]" />
          <div className="relative mx-auto max-w-2xl">
            <Eyebrow>Early access</Eyebrow>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Help shape the first Intent-Oriented language.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-haze-300">
              Join the waitlist to follow the language as it takes shape and get
              early access to docs, examples, and the playground.
            </p>
            <div className="mt-8 flex justify-center">
              <CTAButtons
                primary={{ href: "/waitlist", label: "Join the Waitlist" }}
                secondary={{ href: "/roadmap", label: "See the Roadmap" }}
              />
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
