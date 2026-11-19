import Link from "next/link";
import { Section, SectionHeading, Eyebrow, Pill, CTAButtons } from "@/components/ui";
import { StarMark } from "@/components/StarMark";
import { HighlightedLine, HighlightedSource } from "@/lib/highlight";
import { HeroTranslate } from "@/components/HeroTranslate";
import { whatIntentIsNot } from "@/lib/content";
import { CAPABILITIES } from "@/lib/capabilities";
import { StatusBadge } from "@/components/StatusBadge";
import { PROJECT_FACTS, NPM_PACKAGE } from "@/lib/facts";

// The home page tells one story, in order: why ThunderLang exists, what the world looks like if it
// works, how it works, and where to write it. Deeper material lives on /vision, /docs, and /learn.

const shift = [
  {
    when: "Before AI",
    body: "People wrote the code, so the rules lived in their heads and in code they had read.",
  },
  {
    when: "Now",
    body: "AI writes code faster than anyone can review it. The rules get scattered across prompts, tickets, chats, and thousands of generated lines.",
  },
  {
    when: "The result",
    body: "Nobody can say for sure what the software must do, or whether the last AI change quietly broke it.",
  },
];

const imagine = [
  {
    title: "Every important rule has one home",
    body: "Refund limits, access rules, and pricing live in short files a product manager can read and an engineer can trust.",
  },
  {
    title: "AI reads the rules before it writes",
    body: "Coding agents get the rules as their brief, and every change they make is checked against those rules before it merges.",
  },
  {
    title: "Rules outlive the code",
    body: "Move from Python to Go, or rewrite a service, and no rule is lost. The rules were never buried in the old code.",
  },
  {
    title: "Review means reading the rules",
    body: "Instead of reading 4,000 generated lines, a reviewer asks one question: did any rule change, and do all the examples still pass?",
  },
];

const steps = [
  {
    n: "1",
    title: "Write",
    body: "Say the rule in plain words: a decision, its inputs, and what happens when.",
    code: "when total >= 50 -> Free",
  },
  {
    n: "2",
    title: "Prove",
    body: "Add examples with the answer you expect. Every one runs, so a wrong rule shows up immediately.",
    code: 'case "exactly $50": (total: 50) -> Free',
  },
  {
    n: "3",
    title: "Generate and guard",
    body: "Get the rule in TypeScript, Python, Go, Rust, C#, or Java, and block AI changes that break a rule you wrote.",
    code: "thunder verify-diff Rules.thunder",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero: the promise, and the proof you can touch. */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-grid-faint bg-[size:44px_44px] opacity-30" />
        <div className="pointer-events-none absolute left-1/2 top-[-10%] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-gold-400/10 blur-[120px]" />
        <div className="container-x relative grid gap-12 py-16 sm:py-20 lg:grid-cols-[1fr_1.05fr] lg:items-center">
          <div className="animate-fade-up">
            <div className="flex items-center gap-3">
              <StarMark className="h-6 w-6 animate-twinkle" />
              <Pill>A language for the rules AI must follow</Pill>
            </div>
            <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
              AI writes the code.{" "}
              <span className="text-gradient-gold">You write the rules.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-haze-300">
              ThunderLang is a small, readable language for the rules your software must never get wrong. Write a rule once
              in plain words, prove it with examples, and generate it in the language you ship. When AI changes your code,
              ThunderLang checks that every rule still holds.
            </p>
            <div className="mt-8">
              <CTAButtons
                primary={{ href: "/learn", label: "Start the 10-minute tutorial" }}
                secondary={{ href: "#why", label: "Why ThunderLang exists" }}
              />
            </div>
            <p className="mt-6 max-w-lg text-sm leading-relaxed text-haze-400">
              Open source. Runs in your browser, your terminal, and OpenThunder. The compiler is deterministic: no AI and no
              key needed.
            </p>
          </div>
          <div className="animate-fade-up min-w-0 [animation-delay:120ms]">
            <HeroTranslate />
          </div>
        </div>
      </section>

      {/* Why it exists. */}
      <Section id="why" className="border-y border-white/8 bg-ink-900/40">
        <SectionHeading
          eyebrow="Why ThunderLang exists"
          title="Code got cheap. Knowing what it must do did not."
          intro="Programming languages were built for people telling computers how to do something. With AI writing more of the how, the scarce thing is a clear, checkable statement of what must stay true."
        />
        <ol className="mt-12 grid gap-4 lg:grid-cols-3">
          {shift.map((s, i) => (
            <li key={s.when} className="relative rounded-2xl border border-white/10 bg-ink-850/50 p-6">
              <p className={`text-xs font-semibold uppercase tracking-wide ${i === 2 ? "text-red-300" : "text-haze-400"}`}>{s.when}</p>
              <p className="mt-3 text-lg leading-relaxed text-haze-100">{s.body}</p>
              {i < 2 && (
                <span aria-hidden="true" className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-2xl text-haze-500 lg:block">→</span>
              )}
            </li>
          ))}
        </ol>
        <div className="mt-8 rounded-2xl border border-gold-300/30 bg-gold-400/[0.07] p-6 sm:p-8">
          <p className="text-xl font-semibold leading-relaxed text-white sm:text-2xl">
            ThunderLang gives the rules a home: one readable file that people agree on, AI reads, and machines check.
          </p>
        </div>
      </Section>

      {/* The world it points to. */}
      <Section id="imagine">
        <SectionHeading
          eyebrow="Imagine if this became the way"
          title="Software where the rules are the source of truth."
          intro="This is the future ThunderLang is built for. Parts of it work today; the rest is the direction."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {imagine.map((m) => (
            <div key={m.title} className="rounded-2xl border border-white/10 bg-ink-850/40 p-6">
              <h3 className="text-lg font-semibold text-white">{m.title}</h3>
              <p className="mt-2 leading-relaxed text-haze-300">{m.body}</p>
            </div>
          ))}
        </div>
        <figure className="mx-auto mt-14 max-w-3xl text-center">
          <blockquote className="text-balance text-2xl font-semibold leading-snug text-white sm:text-3xl">
            The most important language of the AI era will not be the one AI writes. It will be the one people use to tell AI
            what must stay true.
          </blockquote>
          <figcaption className="mt-4 text-haze-400">
            That is what ThunderLang is built to be. It is pre-1.0 today, and{" "}
            <a href="#today" className="font-medium text-gold-300 hover:text-gold-200">here is exactly what works</a>.
          </figcaption>
        </figure>
      </Section>

      {/* How it works. */}
      <Section id="how" className="border-y border-white/8 bg-ink-900/40">
        <SectionHeading eyebrow="How it works" title="Write it. Prove it. Ship it in any language." />
        <ol className="mt-12 grid gap-4 lg:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="flex flex-col rounded-2xl border border-white/10 bg-ink-850/50 p-6">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gold-300 text-sm font-semibold text-ink-950">{s.n}</span>
              <h3 className="mt-4 text-xl font-semibold text-white">{s.title}</h3>
              <p className="mt-2 flex-1 leading-relaxed text-haze-300">{s.body}</p>
              <code className="mt-5 block overflow-x-auto rounded-lg bg-black/40 px-3 py-2 font-mono text-xs text-haze-200">
                <HowCode text={s.code} />
              </code>
            </li>
          ))}
        </ol>
        <p className="mt-8">
          <Link href="/learn" className="font-medium text-gold-300 hover:text-gold-200">
            Learn all three in the tutorial →
          </Link>
        </p>
      </Section>

      {/* The AI-change gate. */}
      <Section id="gate">
        <SectionHeading
          eyebrow="The gate"
          title="Catch the AI's mistake before it merges."
          intro="You declare what must never happen. An AI writes the code. ThunderLang proves, deterministically, whether the change upholds your intent, and blocks it if it does not. No model runs in the check."
        />
        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-ink-850/40 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-gold-300">Your rule</div>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs leading-relaxed text-haze-200">
<HighlightedSource source={"never log the new password\n  because a plaintext password in\n  logs is a credential leak"} />
            </pre>
            <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-sky-300">The AI&apos;s change</div>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs leading-relaxed text-haze-200">
{`+ console.log("resetting password",
+   { email, newPassword });`}
            </pre>
          </div>
          <div className="rounded-2xl border border-white/8 bg-ink-850/40 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-300">thunder verify-diff: the deterministic gate</div>
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

      {/* Where to write it. */}
      <Section id="where">
        <SectionHeading
          eyebrow="Write it wherever you work"
          title="The browser, your terminal, or OpenThunder."
          intro="One .thunder file works in all three. Start in the browser, then carry the same file into your repository."
        />
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          <div className="flex flex-col rounded-2xl border border-white/10 bg-ink-850/40 p-6">
            <Eyebrow>In the browser</Eyebrow>
            <h3 className="mt-2 text-lg font-semibold text-white">Nothing to install</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-haze-300">
              Learn the language in ten minutes, then write larger contracts with completions, diagrams, and proofs.
            </p>
            <div className="mt-5 flex flex-col gap-2 text-sm">
              <Link href="/learn" className="font-medium text-gold-300 hover:text-gold-200">Start the tutorial →</Link>
              <Link href="/playground" className="font-medium text-gold-300 hover:text-gold-200">Open the Playground →</Link>
            </div>
          </div>
          <div className="flex min-w-0 flex-col rounded-2xl border border-white/10 bg-ink-850/40 p-6">
            <Eyebrow>In your terminal</Eyebrow>
            <h3 className="mt-2 text-lg font-semibold text-white">The thunder CLI</h3>
            <p className="mt-2 text-sm leading-relaxed text-haze-300">Run the examples, generate code, and gate AI changes in CI.</p>
            <pre className="mt-4 flex-1 overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-6 text-haze-200">
              npm install -g {NPM_PACKAGE}{"\n"}
              thunder test Rules.thunder{"\n"}
              thunder gen Rules.thunder --target python{"\n"}
              thunder verify-diff Rules.thunder \{"\n"}
              {"  "}--before old.ts --after new.ts
            </pre>
          </div>
          <div className="flex flex-col rounded-2xl border border-white/10 bg-ink-850/40 p-6">
            <Eyebrow>In OpenThunder</Eyebrow>
            <h3 className="mt-2 text-lg font-semibold text-white">Write and verify in one place</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-haze-300">
              The OpenThunder editor understands .thunder files, with highlighting, completions, and hover help. From your
              repository, <code className="font-mono text-haze-100">openthunder intent prove</code> checks every contract and{" "}
              <code className="font-mono text-haze-100">openthunder intent conform</code> compares the generated languages.
            </p>
            <a href="https://openthunder.dev" className="mt-5 text-sm font-medium text-gold-300 hover:text-gold-200">
              Get OpenThunder →
            </a>
          </div>
        </div>
      </Section>

      {/* What works today: one manifest drives every status label. */}
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

        {/* Inspectable evidence, not hype. */}
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

      {/* Next step. */}
      <Section>
        <div className="panel relative overflow-hidden px-6 py-14 text-center sm:px-12">
          <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-[560px] -translate-x-1/2 rounded-full bg-gold-400/10 blur-[100px]" />
          <div className="relative mx-auto max-w-2xl">
            <Eyebrow>Open source and on npm</Eyebrow>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Write your first rule in ten minutes.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-haze-300">
              Five short lessons in your browser. By the end you will have a rule, its proof, and the same rule in six languages.
            </p>
            <div className="mt-8 flex justify-center">
              <CTAButtons
                primary={{ href: "/learn", label: "Start the tutorial" }}
                secondary={{ href: "/docs/getting-started", label: "Read the docs" }}
              />
            </div>
            <p className="mt-6 text-sm text-haze-400">
              Go deeper:{" "}
              <Link href="/vision" className="font-medium text-gold-300 hover:text-gold-200">the vision</Link>,{" "}
              <Link href="/architecture" className="font-medium text-gold-300 hover:text-gold-200">architecture</Link>,{" "}
              <Link href="/examples" className="font-medium text-gold-300 hover:text-gold-200">39 examples</Link>, or{" "}
              <Link href="/waitlist" className="font-medium text-gold-300 hover:text-gold-200">run a team pilot</Link>.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}

function HowCode({ text }: { text: string }) {
  return text.startsWith("thunder ") ? <>{text}</> : <HighlightedLine line={text} />;
}
