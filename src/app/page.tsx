import Link from "next/link";
import { Section, SectionHeading, Eyebrow, Pill, CTAButtons } from "@/components/ui";
import { StarMark } from "@/components/StarMark";
import fs from "node:fs";
import path from "node:path";
import { HighlightedCode, HighlightedPlainPhrase, HighlightedSource } from "@/lib/highlight";
import { HeroThunder } from "@/components/HeroThunder";
import { RulePictureStatic } from "@/app/try/RuleVisual";
import { readCode } from "../../compiler/src/read.mjs";
import { plainFromReading } from "../../compiler/src/plain-contract.mjs";
import type { PlainModel } from "../../compiler/src/plain-contract.d.mts";
import { whatIntentIsNot } from "@/lib/content";
import { CAPABILITIES } from "@/lib/capabilities";
import { StatusBadge } from "@/components/StatusBadge";
import { PROJECT_FACTS, NPM_PACKAGE } from "@/lib/facts";

const PLAIN = fs.readFileSync(path.join(process.cwd(), "examples/human/RefundApproval.thunder-plain"), "utf8");
const PYTHON = `def Refund(amount: float, withinWindow: bool) -> str:
    if (((amount >= 0) and (amount <= 100)) and withinWindow):
        return "Approve"
    return "Review"`;

// The home page tells one story, in order: read a rule in Thunder, why Thunder exists, what the world looks like if it
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
    body: "Refund limits, access rules, and pricing live in Thunder, where a product manager can read them and an engineer can trust them.",
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

// What the Thunder compiler does with a rule. Shown right under the hero so nobody mistakes Thunder for a
// picture without a compiler.
const compilerSteps = [
  {
    verb: "Check",
    title: "Problems as you type",
    body: "The compiler reads every rule and points at what is missing or unclear, with the reason and the line.",
  },
  {
    verb: "Prove",
    title: "Every example runs",
    body: "The examples you write are tests. Run them and see which pass, and for a failure, what you expected and what came back.",
  },
  {
    verb: "Generate",
    title: "Code in the language you ship",
    body: "The same rule comes out as real code, so the rule you read is the rule that runs.",
  },
];

const steps = [
  {
    n: "1",
    title: "Read it",
    body: "See the rule as a picture: the question it answers, the facts it reads, and what happens when.",
    code: "the amount is at most $100",
  },
  {
    n: "2",
    title: "Understand it",
    body: "Ask it what happens to a real case and see why. Examples with the answer you expect run every time, so a wrong rule shows up immediately.",
    code: "$100, on time   gives Approve   (exactly at the limit)",
  },
  {
    n: "3",
    title: "Change it",
    body: "Click a word to change the rule and see which cases are affected. The compiler writes it in TypeScript, Python, Go, Rust, C#, or Java, and blocks AI changes that break it.",
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
              <Pill>Introducing Thunder</Pill>
            </div>
            <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
              Programming,{" "}
              <span className="text-gradient-gold">made human.</span>
            </h1>
            <p className="mt-5 text-xl font-medium text-white sm:text-2xl">AI can write the code. Humans should understand it.</p>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-haze-300">
              For decades, people learned to speak to computers. Now that AI writes software, programming should speak our
              language. Thunder makes software&apos;s rules visual and readable, so you can see what it does, question its
              decisions, and change its rules. The Thunder compiler turns them into the code you ship and checks every AI
              change against them.
            </p>
            <p className="mt-3 max-w-xl text-sm text-haze-400">
              Today Thunder covers decisions and business rules: refunds, access, pricing, eligibility. It is not yet a
              general-purpose programming language.
            </p>
            <div className="mt-8">
              <CTAButtons
                primary={{ href: "/try", label: "Try it on a refund rule" }}
                secondary={{ href: "/read", label: "Read your code in Thunder" }}
              />
            </div>
            <p className="mt-6 max-w-lg text-sm leading-relaxed text-haze-400">
              Not just a picture: Thunder has a{" "}
              <a href="https://github.com/SkillsTechTalk/thunderlang" className="font-medium text-gold-300 hover:text-gold-200">real, open-source compiler</a>{" "}
              (ThunderLang). It runs in your browser, your terminal, and{" "}
              <a href="#compiler" className="font-medium text-gold-300 hover:text-gold-200">OpenThunder, the IDE for Thunder</a>.
              Deterministic: no AI and no key needed. New here?{" "}
              <Link href="/learn" className="font-medium text-gold-300 hover:text-gold-200">Take the 10-minute tutorial</Link>.
            </p>
          </div>
          <div className="animate-fade-up min-w-0 [animation-delay:120ms]">
            <HeroThunder source={PLAIN} />
          </div>
        </div>
      </section>

      {/* The compiler: ThunderLang is compiled, and OpenThunder ships the compiler. */}
      <Section id="compiler" className="border-t border-white/8">
        <SectionHeading
          eyebrow="The Thunder compiler"
          title="A language with a compiler. OpenThunder is where you work with it."
          intro="Thunder is not a drawing you hope someone implements later. Every rule is compiled: checked, proven with its own examples, and turned into code. The open-source Thunder compiler runs in your browser and terminal, and it is built into OpenThunder, the IDE for Thunder."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {compilerSteps.map((c) => (
            <div key={c.title} className="flex flex-col rounded-2xl border border-white/10 bg-ink-850/40 p-6">
              <Eyebrow>{c.verb}</Eyebrow>
              <h3 className="mt-2 text-lg font-semibold text-white">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-haze-300">{c.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:gap-6">
          <a href="https://openthunder.dev" className="font-medium text-gold-300 hover:text-gold-200">
            Work in Thunder with OpenThunder →
          </a>
          <Link href="/playground" className="font-medium text-gold-300 hover:text-gold-200">
            Or try the compiler in your browser →
          </Link>
        </div>
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-haze-400">
          AI will write most of the code. Someone still has to say what the code must do, and that is what you read and
          write in Thunder. You can let AI draft the rules too: the compiler checks them the same way, so nothing is trusted just
          because a model wrote it.
        </p>
      </Section>

      {/* Thundered code: existing code, read in Thunder. */}
      <Section id="thundered">
        <SectionHeading
          eyebrow="Thundered code"
          title="Already have code? Read it in Thunder."
          intro="Python helps people write instructions for computers. Thunder helps people understand and control software, including software AI wrote. It reads existing TypeScript, Python, Go, Rust, C#, Java, Kotlin, PHP, and Ruby and draws the rules it finds. Your code stays the source of truth; Thunder shows what it does today, so a person can say whether that is what the team wants."
        />
        <ThunderedPreview />
        <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/read" className="font-medium text-gold-300 hover:text-gold-200">Read your code in Thunder →</Link>
          <Link href="/docs/thunder-vocabulary" className="font-medium text-gold-300 hover:text-gold-200">Thunder, ThunderLang, and Thundered code →</Link>
        </p>
      </Section>

      {/* Why it exists. */}
      <Section id="why" className="border-y border-white/8 bg-ink-900/40">
        <SectionHeading
          eyebrow="Why Thunder exists"
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
            AI writes the code. Humans understand the logic.
          </p>
          <p className="mt-2 text-lg leading-relaxed text-haze-200">
            Thunder gives the rules a home: one picture people agree on, AI reads, and machines check.
          </p>
        </div>
      </Section>

      {/* The world it points to. */}
      <Section id="imagine">
        <SectionHeading
          eyebrow="Imagine if this became the way"
          title="Software where the rules are the source of truth."
          intro="This is the future Thunder is built for. Parts of it work today; the rest is the direction."
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
            AI should handle the complexity of writing software. Humans should keep the clarity and control to understand it.
          </blockquote>
          <figcaption className="mt-4 text-haze-400">
            That is the principle Thunder is designed around. It is pre-1.0 today, and{" "}
            <a href="#today" className="font-medium text-gold-300 hover:text-gold-200">here is exactly what works</a>.
          </figcaption>
        </figure>
      </Section>

      {/* How it works. */}
      <Section id="how" className="border-y border-white/8 bg-ink-900/40">
        <SectionHeading eyebrow="How it works" title="Read it. Understand it. Change it." intro="Then ship it in the language you use, and let the compiler guard it." />
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
          intro="You declare what must never happen. An AI writes the code. Thunder proves, deterministically, whether the change upholds your intent, and blocks it if it does not. No model runs in the check."
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
          eyebrow="Work in Thunder wherever you are"
          title="The browser, your terminal, or OpenThunder."
          intro="One Thunder file works in all three. Start in the browser, then carry the same file into your repository."
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
            <Eyebrow>In OpenThunder, the IDE for Thunder</Eyebrow>
            <h3 className="mt-2 text-lg font-semibold text-white">The compiler, built in</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-haze-300">
              Open a .thunder file and the compiler sits beside it: problems as you type, Run tests for your examples, and
              generated TypeScript, Python, C#, or Java. Start a new file from a working rule. Across your repository,{" "}
              <code className="font-mono text-haze-100">openthunder intent prove</code> checks every contract and{" "}
              <code className="font-mono text-haze-100">openthunder intent conform</code> compares the generated languages.
            </p>
            <a href="https://openthunder.dev" className="mt-5 text-sm font-medium text-gold-300 hover:text-gold-200">
              Work in Thunder with OpenThunder →
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
          eyebrow="What Thunder is not"
          title="Clear about what we are not claiming."
          intro="Being honest about the boundaries is part of being a serious language project. Thunder sits above your languages and reads and targets them; it does not replace them."
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
            <Eyebrow>Read it. Understand it. Change it.</Eyebrow>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Read your first rule in Thunder.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-haze-300">
              Ask a refund rule a question, change one condition, and see what breaks. Then take five short lessons and leave
              with a rule, its proof, and the same rule in six languages.
            </p>
            <div className="mt-8 flex justify-center">
              <CTAButtons
                primary={{ href: "/try", label: "Try it on a refund rule" }}
                secondary={{ href: "/learn", label: "Start the tutorial" }}
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
  return text.startsWith("thunder ") ? <>{text}</> : <HighlightedPlainPhrase context={PLAIN} phrase={text} />;
}

/** Original Python next to the same Python, Thundered by the real code reader. */
function ThunderedPreview() {
  const lifted = plainFromReading(readCode(PYTHON, { language: "python" }).items[0]) as PlainModel | null;
  return (
    <div className="mt-10 grid gap-4 lg:grid-cols-2">
      <figure className="min-w-0 rounded-2xl border border-white/10 bg-ink-850/40 p-5">
        <figcaption className="text-sm font-semibold text-white">Original Python</figcaption>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-4 font-mono text-[12px] leading-6 text-haze-200"><code><HighlightedCode source={PYTHON} lang="python" /></code></pre>
      </figure>
      <figure className="min-w-0 rounded-2xl border border-gold-300/30 bg-ink-850/40 p-5">
        <figcaption className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-white">Thundered Python
          <span className="flex flex-wrap gap-2 text-xs font-normal">
            <span className="rounded-full border border-white/20 px-2 py-0.5 text-haze-200">Read in Thunder: yes</span>
            <span className="rounded-full border border-dashed border-white/25 px-2 py-0.5 text-haze-300">Update the Python from here: not yet</span>
          </span>
        </figcaption>
        <div className="mt-3">{lifted ? <RulePictureStatic model={lifted} /> : <p className="text-sm text-haze-300">This code could not be read.</p>}</div>
      </figure>
    </div>
  );
}
