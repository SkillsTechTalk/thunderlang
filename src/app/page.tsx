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
import { CAPABILITIES } from "@/lib/capabilities";
import { StatusBadge } from "@/components/StatusBadge";
import { PROJECT_FACTS, NPM_PACKAGE } from "@/lib/facts";

const philosophy = [
  { step: "Prompt", body: "How the conversation starts. Useful, but temporary." },
  { step: "Intent", body: "What the team commits to. Durable and reviewable." },
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
    title: "ThunderLang starts with the what and why",
    body: "ThunderLang focuses on what the software should do, why it exists, which constraints matter, and how it should be verified.",
  },
  {
    title: "Engineers stay in control",
    body: "The goal is not to replace engineers. It is to help them express, verify, and own software far more clearly.",
  },
];

const targets = ["TypeScript", "Python", ".NET", "Java", "Go", "Rust"];

const runnable = `decision CanEnroll
  inputs
    age
    score
  rule adult
    when age >= 18 and score >= 70
    return Eligible
  default
    return NotEligible

test CanEnroll
  case adult
    given age 20, score 90
    expect Eligible
  case minor
    given age 10
    expect NotEligible`;

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
              <Pill>The human control layer for AI-written software</Pill>
            </div>
            <p className="mt-4 text-xs text-haze-500">
              ThunderLang was previously introduced as IntentLang.
            </p>

            <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-[3.2rem]">
              Understand what your software is supposed to do,{" "}
              <span className="text-gradient-gold">
                what it actually does, and whether you can trust it.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-haze-300">
              {siteConfig.wordmark} turns human goals into durable software
              contracts, scans existing code to recover meaning, maps the system,
              and connects implementation to verification and proof , so humans
              stay in control as AI writes more of the code. Built by{" "}
              {siteConfig.builtBy}.
            </p>

            <div className="mt-8">
              <CTAButtons
                primary={{ href: "/playground", label: "Try the Playground" }}
                secondary={{ href: "/docs/getting-started", label: "Read the Docs" }}
              />
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <Link href="/atlas" className="font-medium text-gold-300 hover:text-gold-200">
                  Explore Intent Atlas →
                </Link>
                <Link href="/examples" className="font-medium text-gold-300 hover:text-gold-200">
                  View Examples →
                </Link>
              </div>
            </div>

            <p className="mt-8 max-w-lg text-sm leading-relaxed text-haze-400">
              <span className="text-haze-200">Deterministic core.</span>{" "}
              AI-assisted only when you enable it. No model required for the
              supported local analysis , the compiler, scanner, and proof run
              offline with no key.
            </p>
          </div>

          <div className="animate-fade-up [animation-delay:120ms]">
            <IntentCode code={heroExample} filename="CreateInvoice.thunder" />
            <p className="mt-3 text-center text-xs text-haze-500">
              Pre-1.0 syntax , and it compiles with the thunder CLI today.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* The wedge: gate an AI change before it merges (deterministic)      */}
      {/* ------------------------------------------------------------------ */}
      <Section id="gate">
        <SectionHeading
          eyebrow="The gate"
          title="Catch the AI's mistake before it merges."
          intro="You declare what must never happen. An AI writes the code. ThunderLang proves, deterministically, whether the change upholds your intent, and blocks it if it does not. No model runs in the check."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-ink-850/40 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-gold-300">Intent , the contract</div>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs leading-relaxed text-haze-200">
{`never log the new password
  because a plaintext password in
  logs is a credential leak`}
            </pre>
            <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-sky-300">The AI's change</div>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs leading-relaxed text-haze-200">
{`+ console.log("resetting password",
+   { email, newPassword });`}
            </pre>
          </div>
          <div className="rounded-2xl border border-white/8 bg-ink-850/40 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">thunder verify-diff , the deterministic gate</div>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs leading-relaxed text-haze-200">
{`$ thunder verify-diff ResetPassword.thunder \\
    --before before.ts --after ai-change.ts

BLOCK (1 blocking, 1 regression)
  [VIOLATION] Added code may violate
  never-rule "log the new password":
  console.log("resetting password", ...)
  (line 2)

$ echo $?
1`}
            </pre>
            <p className="mt-3 text-xs text-haze-400">Exit code 1. Drop it into CI or an agent loop and the change cannot merge. No AI ran; the verdict is deterministic.</p>
          </div>
        </div>
        <p className="mt-6 text-sm text-haze-400">
          <Link href="/docs/getting-started" className="font-medium text-gold-300 hover:text-gold-200">
            Gate your first AI change →
          </Link>
          <Link href="/docs/mcp" className="ml-5 font-medium text-gold-300 hover:text-gold-200">
            Wire it into your agent (MCP) →
          </Link>
        </p>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* What works today (single source of truth: the capability manifest) */}
      {/* ------------------------------------------------------------------ */}
      <Section id="today">
        <SectionHeading
          eyebrow="Honest status"
          title="What works today, and what is still being built."
          intro="One manifest drives every status label on this site, so it can never claim more than the compiler actually does. Available means it ships in the compiler and is tested."
        />
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <div
              key={c.key}
              className="flex flex-col gap-2 rounded-2xl border border-white/8 bg-ink-850/40 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">{c.name}</h3>
                <StatusBadge status={c.status} />
              </div>
              <p className="text-xs leading-relaxed text-haze-400">{c.blurb}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-haze-400">
          <Link href="/roadmap" className="font-medium text-gold-300 hover:text-gold-200">
            See the full roadmap →
          </Link>
        </p>

        {/* Inspectable evidence, not hype , the ThunderLang way. */}
        <div className="mt-10 grid grid-cols-2 gap-4 rounded-2xl border border-white/8 bg-ink-850/40 p-6 sm:grid-cols-3 lg:grid-cols-6">
          {PROJECT_FACTS.map((f) => (
            <div key={f.label} className="text-center">
              <div className="text-2xl font-semibold text-white">{f.value}</div>
              <div className="mt-1 text-[11px] leading-tight text-haze-400">{f.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-haze-500">
          Install today:{" "}
          <span className="font-mono text-haze-300">npm i {NPM_PACKAGE}</span>
          {" "}, or run it in the{" "}
          <Link href="/playground" className="font-medium text-gold-300 hover:text-gold-200">
            Playground
          </Link>
          .
        </p>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Live proof: Define -> Scan -> Prove                                */}
      {/* ------------------------------------------------------------------ */}
      <Section id="proof">
        <SectionHeading
          eyebrow="Define. Scan. Prove."
          title="One statement of intent, checked and proven , not just generated."
          intro="Write what must be true, let the scanner find the risk, and get proof of what holds and what does not. Deterministic, no AI required."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/8 bg-ink-850/40 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-gold-300">1 , Define</div>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs leading-relaxed text-haze-200">
{`guarantee duplicate invoices
  are never created

never expose payment token`}
            </pre>
            <p className="mt-3 text-xs text-haze-400">State the guarantees and the prohibitions in durable, reviewable intent.</p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-ink-850/40 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-300">2 , Scan</div>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs leading-relaxed text-haze-200">
{`Risk: the retry path has no
idempotency verification

Risk: guarantee has nothing
proving it (drift hides here)`}
            </pre>
            <p className="mt-3 text-xs text-haze-400">The Intent Scanner surfaces explainable risks, grouped by theme. No AI, no key.</p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-ink-850/40 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">3 , Prove</div>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs leading-relaxed text-haze-200">
{`PASS   duplicate prevention
PASS   audit trail
BLOCK  payment token found
       in event payload`}
            </pre>
            <p className="mt-3 text-xs text-haze-400">A proof artifact records the status of every claim , earned trust, not assumed.</p>
          </div>
        </div>
        <p className="mt-6 text-sm text-haze-400">
          <Link href="/playground" className="font-medium text-gold-300 hover:text-gold-200">
            Run it in the Playground →
          </Link>
        </p>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Intent Truth: Intended / Implemented / Observed / Outcome          */}
      {/* ------------------------------------------------------------------ */}
      <Section id="truth">
        <SectionHeading
          eyebrow="Intent Truth"
          title="Four truths about the same software , and where they disagree is where risk lives."
          intro="A feature can pass every test and still fail its purpose. ThunderLang keeps these four truths separate so you can compare them honestly, rather than assuming technical success means success."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { name: "Intended", status: "available" as const, body: "What humans approved: goals, guarantees, prohibitions, and how each must be verified. This is the intent you write." },
            { name: "Implemented", status: "experimental" as const, body: "What the code actually does, recovered from source with intent lift and surfaced by the Intent Scanner." },
            { name: "Observed", status: "planned" as const, body: "What actually happens at runtime , traces, metrics, errors. Connected through OpenThunder and runtime evidence." },
            { name: "Outcome", status: "experimental" as const, body: "Whether it achieved its purpose. Outcome contracts bind a target and guardrails; real measurement needs product analytics." },
          ].map((t) => (
            <div key={t.name} className="rounded-2xl border border-white/8 bg-ink-850/40 p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-white">{t.name} Truth</h3>
                <StatusBadge status={t.status} />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-haze-300">{t.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-haze-400">
          Intended Truth is available today. Implemented, Observed, and Outcome Truth arrive as
          the scanner, runtime evidence, and the wider ecosystem connect , honestly labeled, never
          assumed.
        </p>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Why Intent                                                         */}
      {/* ------------------------------------------------------------------ */}
      <Section id="why">
        <SectionHeading
          eyebrow="Why ThunderLang"
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
      {/* Prompt is temporary. Intent is durable.                            */}
      {/* ------------------------------------------------------------------ */}
      <Section id="durable">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <SectionHeading
              eyebrow="Prompt is temporary. Intent is durable."
              title="A prompt is a conversation. Intent is a commitment."
              intro="A prompt is useful, but it is not a contract, it is not cleanly versioned, and it is not automatically verifiable. ThunderLang turns it into a reviewable, versionable, testable .thunder file."
            />
            <figure className="mt-6 rounded-2xl border border-white/10 bg-ink-850/50 p-5">
              <figcaption className="text-xs font-medium uppercase tracking-[0.18em] text-haze-400">
                The prompt
              </figcaption>
              <blockquote className="mt-3 text-sm leading-relaxed text-haze-200">
                &ldquo;Build a secure invoice creation flow that prevents
                duplicates, audits every invoice, and never logs payment
                tokens.&rdquo;
              </blockquote>
              <p className="mt-4 text-xs text-haze-500">
                Useful, but temporary. It becomes intent on the right.
              </p>
            </figure>
          </div>
          <div>
            <div className="mb-2 text-center text-xs font-medium uppercase tracking-[0.18em] text-gold-300">
              The intent
            </div>
            <IntentCode code={heroExample} filename="CreateInvoice.thunder" />
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Core philosophy                                                    */}
      {/* ------------------------------------------------------------------ */}
      <Section id="philosophy" className="border-y border-white/8 bg-ink-900/40">
        <SectionHeading
          eyebrow="Core philosophy"
          title="Prompt → Intent → Contract → Plan → Implementation → Verification → Proof"
          intro="Prompt is how the conversation starts. Intent is what the team commits to. Code is how the system fulfills it. Proof is how trust is earned. Every stage is inspectable, and nothing is hidden from the engineer who owns it."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {philosophy.map((item, i) => (
            <div key={item.step} className="panel h-full p-5">
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
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Executable intent                                                  */}
      {/* ------------------------------------------------------------------ */}
      <Section id="executable">
        <SectionHeading
          eyebrow="Beyond prompt engineering"
          title="Intent you can run. No code. No AI."
          intro="A decision is not a description of behavior, it is the behavior. Give it inputs and it decides, first matching rule wins, deterministically, before any implementation exists. Tests live in the same file and prove it."
        />
        <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:items-start">
          <IntentCode code={runnable} filename="eligibility.thunder" />
          <div className="rounded-2xl border border-white/10 bg-ink-950/70 p-5 font-mono text-[12.5px] leading-relaxed text-haze-200">
            <div className="text-haze-500">
              {"$ thunder run eligibility.thunder --inputs '{\"age\":20,\"score\":90}'"}
            </div>
            <div className="mt-1">
              <span className="text-emerald-300">decision CanEnroll: Eligible</span>{" "}
              <span className="text-haze-500">[rule: adult]</span>
            </div>
            <div className="mt-5 text-haze-500">$ thunder test eligibility.thunder</div>
            <div className="mt-1">
              <span className="text-emerald-300">PASS</span>&nbsp;&nbsp;CanEnroll / adult
            </div>
            <div>
              <span className="text-emerald-300">PASS</span>&nbsp;&nbsp;CanEnroll / minor
            </div>
            <div className="mt-1 text-haze-300">2/2 passed</div>
          </div>
        </div>
        <p className="mt-5 text-sm leading-relaxed text-haze-400">
          Deterministic: the same intent and inputs always decide the same way, with a full
          trace, no model in the loop. Run it yourself in the{" "}
          <Link href="/playground" className="text-gold-300 hover:text-gold-200">
            playground
          </Link>
          .
        </p>
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
                This is <strong>pre-1.0 syntax</strong>. It compiles today, but
                names, keywords, and structure can still change before 1.0.
              </DraftNote>
            </div>
            <div className="mt-6">
              <CTAButtons
                primary={{ href: "/examples", label: "View Examples" }}
                secondary={{ href: "/docs", label: "Read the Docs" }}
              />
            </div>
          </div>
          <IntentCode code={heroExample} filename="CreateInvoice.thunder" />
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
          eyebrow="What ThunderLang is not"
          title="Clear about what we are not claiming."
          intro="Being honest about the boundaries is part of being a serious language project. ThunderLang sits above paradigms and targets your languages; it does not replace them."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {whatIntentIsNot.map((n) => (
            <div
              key={n.label}
              className="rounded-2xl border border-white/8 bg-ink-850/40 p-5"
            >
              <div className="flex items-center gap-2">
                <svg
                  className="h-3.5 w-3.5 shrink-0 text-haze-500"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
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
          title="ThunderLang is the center of a larger system."
          intro="Proof is the through-line. ThunderLang defines what software should do, and each product proves a different thing about the same mission."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ecosystem.map((item) => (
            <Card key={item.name}>
              <div className="flex items-center gap-2.5">
                {item.name === "ThunderLang" && <StarMark className="h-5 w-5" />}
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
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-haze-400">
          The artifact exists, the implementation still matches it, the engineer
          who owns it understands it, and the practitioner has proven the method.
          That is how trust is earned in AI-era software: not by trusting the
          code, but by proving the intent behind it.
        </p>
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
