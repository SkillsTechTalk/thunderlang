import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { Section, SectionHeading, CTAButtons } from "@/components/ui";
import { StarMark } from "@/components/StarMark";
import { HeroThunder } from "@/components/HeroThunder";
import { StatusBadge } from "@/components/StatusBadge";
import { ThunderArchitecture } from "@/components/thunder/ThunderArchitecture";
import { CAPABILITY_ROWS, CORE_STATUS, ECOSYSTEMS, READ_PROGRAMMING, TARGETS } from "@/lib/positioning";
import { ServiceGlyph } from "@/app/try/Glyphs";
import { readCode } from "../../compiler/src/read.mjs";
import { compileCore } from "../../compiler/src/core/index.mjs";
import { plainFromReading } from "../../compiler/src/plain-contract.mjs";
import type { PlainModel } from "../../compiler/src/plain-contract.d.mts";
import { PROJECT_FACTS } from "@/lib/facts";
import { OPENTHUNDER_URL, LEARN_COURSE_URL } from "@/lib/site";
import { THUNDERED_SAMPLES } from "@/lib/thundered-samples";
import { ThunderedTabs, type ThunderedSample } from "@/components/ThunderedTabs";
import { FiveLevels } from "@/components/thunder/FiveLevels";

const PLAIN = fs.readFileSync(path.join(process.cwd(), "examples/human/RefundApproval.thunder-plain"), "utf8");

// The home page follows one story: Thunder is the human programming language (hero), shown working today on a real
// rule, then how it fits together with the honest status of every part, the ecosystems it opens, and the language
// and its IDE. The proof, problem, plan, and call to action follow. Every status label comes from src/lib/positioning.ts.

const PROBLEM = [
  { kind: "What you see", text: "AI writes code faster than anyone can read it. The rules that run your business end up buried in thousands of lines." },
  { kind: "How it feels", text: "You approve changes you can't fully read, and hope nothing important moved." },
  { kind: "Why it's wrong", text: "The people responsible for software should be able to understand what it does." },
];

const PLAN = [
  { n: "1", title: "Read it", body: "Open a rule, or your own code, and see it as a picture: the question, the facts it reads, what it decides.", href: "/read", cta: "Read your code in Thunder" },
  { n: "2", title: "Understand it", body: "Ask it about a real case and get the answer with the reason. See the whole app and where to look first.", href: "/map", cta: "See a whole app" },
  { n: "3", title: "Change it", body: "Click a word to change the rule. See which cases change before you apply, and let the compiler check every change.", href: "/try", cta: "Change a rule" },
];

const WITHOUT = [
  "A $100 refund limit lives in two services, and nobody notices they disagree.",
  "An AI change moves a limit by one character, and review misses it.",
  "Only the person who wrote the code can say what it decides.",
];
const WITH = [
  "Every important rule is a picture a product manager can read.",
  "Thunder points out where services disagree and asks which one the business wants.",
  "Every change, by a person or an AI, is checked against the rules before it merges.",
];

// Ways to see your software in Thunder (naming agreed with OpenThunder). Status is honest.
const VIEWS = [
  { name: "Thunder Code", what: "every function in a file or folder, read in Thunder", href: "/read", status: "Preview here" },
  { name: "Thunder Map", what: "how the code is built: services, packages, integrations", href: "/map", status: "Prototype here" },
  { name: "Thunder Atlas", what: "zoom from the whole product to one rule, then the code", href: "/map", status: "Prototype here" },
  { name: "Thunder Brief", what: "the big picture on a page", href: "/map", status: "Prototype here" },
  { name: "Thunder Focus", what: "where to look first, and why", href: "/map", status: "Prototype here" },
  { name: "Thunder Trace", what: "one user action, from start to data", href: "https://openthunder.dev", status: "In OpenThunder" },
  { name: "Thunder Learn", what: "walk and memorize your app", href: "https://openthunder.dev", status: "In OpenThunder" },
  { name: "Thunder Review", what: "a pull request as before-and-after pictures", href: "https://openthunder.dev", status: "Later" },
];

const AUTHORITY = [PROJECT_FACTS[0], { value: String(READ_PROGRAMMING.length), label: "languages read in Thunder", href: "/read" }, PROJECT_FACTS[3]];

// The same refund rule in every language the reader supports, Thundered at build time by the real reader.
const SAMPLES: ThunderedSample[] = THUNDERED_SAMPLES.map((x) => {
  const item = readCode(x.source, { language: x.key }).items.find((i) => i.kind === "decision");
  const model = item ? (plainFromReading(item) as (PlainModel & { needsReview: string[] }) | null) : null;
  return { ...x, model, inferred: !!model?.needsReview.some((n) => n.includes("inferred")) };
});

// The hello-world program in the hero, compiled by the real Thunder Core compiler at build time: the Python shown is
// exactly what `thunder build` writes for it (its marked lines), so the panel can never drift from the compiler.
const HELLO = 'Say "Hello, world!"';
const CORE_LIVE = CORE_STATUS === "available" || CORE_STATUS === "experimental";
const HELLO_PYTHON = (compileCore(`${HELLO}\n`).python ?? "")
  .split("\n").filter((l) => /# thunder:\d+$/.test(l)).map((l) => l.replace(/\s*# thunder:\d+$/, "").trim()).join("\n");

export default function HomePage() {
  return (
    <>
      {/* 1. The character and what they want: write and understand software in a language made for people. */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-grid-faint bg-[size:44px_44px] opacity-30" />
        <div className="pointer-events-none absolute left-1/2 top-[-10%] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-gold-400/10 blur-[120px]" />
        <div className="container-x relative py-16 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14">
            <div className="animate-fade-up">
              <div className="flex items-center gap-3">
                <StarMark className="h-8 w-8 animate-twinkle" />
                <h1 className="text-base font-semibold tracking-tight text-haze-100 sm:text-lg">
                  <span className="text-gradient-gold text-xl font-bold sm:text-2xl">Thunder<sup className="ml-0.5 align-super text-[0.5em] font-semibold">™</sup></span>, the Human-Native Programming Language
                </h1>
              </div>
              <p className="mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
                The <span className="text-gradient-gold">Human</span> Programming Language.
              </p>
              <p className="mt-4 text-xl font-medium text-white sm:text-2xl">One language. Every ecosystem.</p>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-haze-300">
                Write software in a language you understand. Build with AI. Compile to the ecosystem you choose.
              </p>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-haze-300">
                <span className="font-medium text-white">Today</span> Thunder reads code in {READ_PROGRAMMING.length} languages, changes
                TypeScript, JavaScript, Python, and Go code from Thunder, and compiles rules to six languages.{" "}
                {CORE_LIVE
                  ? (<><span className="font-medium text-white">New:</span> write whole programs in Thunder and run them as Python.{" "}</>)
                  : (<><span className="font-medium text-white">Coming:</span> writing whole programs in Thunder, compiled to Python first.{" "}</>)}
                <a href="#status" className="text-gold-300 underline decoration-gold-300/40 underline-offset-4 hover:text-gold-200">See what works today</a>
              </p>
              <div className="mt-8">
                <CTAButtons
                  primary={{ href: "/read", label: "Read code in Thunder" }}
                  secondary={{ href: `${OPENTHUNDER_URL}/#download`, label: "Read a whole app in OpenThunder ↗" }}
                />
                <p className="mt-3 text-sm text-haze-400">
                  Thunder reads one file in your browser, free and with nothing to install. OpenThunder, the IDE for AI-written code, reads
                  a whole repository on your machine. Or <Link href="/try" className="text-gold-300 hover:text-gold-200">change a refund rule</Link> first.
                </p>
              </div>
              <ul className="mt-7 flex flex-wrap gap-2 text-xs text-haze-300">
                {["Also called ThunderLang™", "Open source, Apache 2.0", "Deterministic: no AI, no key"].map(t => (
                  <li key={t} className="rounded-full border border-white/12 bg-white/[0.03] px-3 py-1">{t}</li>
                ))}
                <li><Link href="/manifesto" className="inline-block rounded-full px-3 py-1 font-medium text-gold-300 hover:text-gold-200">Read the manifesto →</Link></li>
              </ul>
            </div>

            {/* The language as it is being built: clearly a preview, with today's working paths beside it. */}
            <div className="animate-fade-up min-w-0 [animation-delay:120ms]">
              <div className="rounded-[1.35rem] bg-gradient-to-b from-gold-300/50 via-white/10 to-white/5 p-px shadow-[0_30px_120px_-40px_rgba(167,139,250,0.55)]">
                <div className="rounded-[1.3rem] bg-ink-900/95 p-7">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gold-300">{CORE_LIVE ? "Thunder Core" : "Preview of Thunder Core"}</p>
                    <StatusBadge status={CORE_STATUS} />
                  </div>
                  <p className="mt-2 text-sm text-haze-400">
                    {CORE_LIVE ? "Whole programs written in Thunder. This one runs today." : "Whole programs written in Thunder. Not live yet: this example does not run today."}
                  </p>
                  <pre className="mt-5 overflow-x-auto rounded-xl border border-white/10 bg-ink-950/80 px-5 py-4 font-mono text-lg"><code><span className="tok-key">Say</span> <span className="tok-str">&quot;Hello, world!&quot;</span></code></pre>
                  {CORE_LIVE && HELLO_PYTHON && (
                    <div className="mt-3">
                      <p className="text-xs text-haze-400">The Thunder compiler writes this Python, and it prints <span className="font-mono text-haze-200">Hello, world!</span></p>
                      <pre className="mt-1.5 overflow-x-auto rounded-lg border border-white/8 bg-ink-950/50 px-4 py-2 font-mono text-sm text-haze-300"><code>{HELLO_PYTHON}</code></pre>
                    </div>
                  )}
                  <p className="mt-5 text-sm font-medium text-haze-100">One program, compiled to the ecosystem you choose:</p>
                  <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {TARGETS.map((t) => (
                      <li key={t.key} className="flex flex-col gap-1.5 rounded-xl border border-white/10 px-3 py-2">
                        <span className="text-sm font-semibold text-white">{t.name}</span>
                        <StatusBadge status={t.program} className="self-start" />
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 border-t border-white/10 pt-4 text-sm">
                    <p className="text-haze-300">Works today:</p>
                    <p className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                      {CORE_LIVE && <Link href="/docs/core" className="font-medium text-gold-300 hover:text-gold-200">Write your first program →</Link>}
                      <Link href="/read" className="font-medium text-gold-300 hover:text-gold-200">Read your code in Thunder →</Link>
                      <Link href="/try" className="font-medium text-gold-300 hover:text-gold-200">Change a rule →</Link>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. What works today: a real rule, read, asked, changed, and compiled by the real compiler. */}
      <section id="today" className="border-t border-white/8">
        <div className="container-x py-16 sm:py-20">
          <HeroThunder source={PLAIN}>
            <div>
              <p className="eyebrow">Works today</p>
              <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">Read a rule. Ask it. Change it. Compile it.</h2>
              <p className="mt-4 text-lg leading-relaxed text-haze-300">
                This refund rule is written in Thunder. Ask it about a case and it answers with the reason. Click a
                highlighted word to change it, and every example is checked again. Below, the Thunder compiler writes the
                same rule in six languages. Nothing here is drawn by hand.
              </p>
              <p className="mt-5 text-sm">
                <Link href="/try" className="font-medium text-gold-300 hover:text-gold-200">Try the full rule editor →</Link>
              </p>
            </div>
          </HeroThunder>
        </div>
      </section>

      {/* 3. How it fits together, with the honest status of every part. */}
      <Section id="how" className="border-t border-white/8 bg-ink-900/40">
        <SectionHeading
          eyebrow="How it works"
          title="Read anything. Write once. Run anywhere."
          intro="That is where Thunder is going. People and AI work in Thunder; the Thunder compiler keeps it precise and compiles it to the ecosystem that best serves your application. Each part below says exactly what works today."
        />
        <ThunderArchitecture />
        <div id="status" className="mt-14 scroll-mt-24">
          <h3 className="text-2xl font-semibold tracking-tight text-white">What works today, and what is coming</h3>
          <p className="mt-2 max-w-2xl text-haze-300">A capability is labeled Available only once it ships in the compiler and is tested. These labels come from the compiler&apos;s own data.</p>
          <ul className="mt-6 divide-y divide-white/8 rounded-2xl border border-white/10">
            {CAPABILITY_ROWS.map((r) => (
              <li key={r.what} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                <div className="min-w-0">
                  <p className="font-semibold text-white">{r.what}</p>
                  <p className="mt-1 text-sm text-haze-300">{r.detail}</p>
                  {r.caveat && (<p className="mt-1 text-xs text-amber-200/90">{r.caveat.text} <Link href={r.caveat.href} className="font-medium text-gold-300 underline decoration-gold-300/40 underline-offset-2 hover:text-gold-200">{r.caveat.label}</Link></p>)}
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  {r.href && <Link href={r.href} className="text-sm font-medium text-gold-300 hover:text-gold-200">{r.cta} →</Link>}
                  <StatusBadge status={r.status} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-haze-400">
            <Link href="/roadmap" className="font-medium text-gold-300 hover:text-gold-200">See the full roadmap →</Link>
          </p>
        </div>
      </Section>

      {/* 4. Ecosystems: Thunder opens each one rather than recreating it. */}
      <Section id="ecosystems" className="border-t border-white/8">
        <SectionHeading
          eyebrow="Every ecosystem"
          title="Thunder gives you access to each ecosystem rather than recreating it."
          intro="Python for artificial intelligence. TypeScript for the web. Java and C# for enterprise software. Go for distributed systems. Rust for systems programming. One language for the humans building them."
        />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {ECOSYSTEMS.map((e) => (
            <li key={e.name} className="rounded-2xl border border-white/10 bg-ink-850/40 p-5">
              <h3 className="text-lg font-semibold text-white">{e.name}</h3>
              <ul className="mt-3 space-y-1.5 text-sm text-haze-300">
                {e.libraries.map((l) => <li key={l}>{l}</li>)}
              </ul>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-haze-300">
          <span className="font-medium text-white">Today:</span> Thunder reads code that uses these libraries.{" "}
          <span className="font-medium text-white">With Thunder Core:</span> programs you write in Thunder can already use Python libraries (<code className="font-mono text-haze-200">Use csv as csv</code>). The other ecosystems come with their targets.
        </p>
      </Section>

      {/* 5. The language and the IDE, like Python and PyCharm. */}
      <Section id="thunder-and-openthunder" className="border-t border-white/8 bg-ink-900/40">
        <SectionHeading
          eyebrow="Thunder and OpenThunder"
          title="A language that stands on its own, and an IDE built for it."
          intro="Like Python and PyCharm: you can use Thunder anywhere, and OpenThunder is the IDE made for it."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-ink-850/40 p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-gold-300">The language</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Thunder</h3>
            <p className="mt-2 leading-relaxed text-haze-300">
              The human programming language. Open source under Apache 2.0, with its compiler and CLI on npm. Use it in your
              browser, your terminal, VS Code, or any AI agent that speaks MCP.
            </p>
            <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <Link href="/language" className="font-medium text-gold-300 hover:text-gold-200">The language →</Link>
              <Link href="/install" className="font-medium text-gold-300 hover:text-gold-200">Install Thunder →</Link>
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-ink-850/40 p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-gold-300">The IDE</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">OpenThunder</h3>
            <p className="mt-2 leading-relaxed text-haze-300">
              The IDE for AI-written code. Open your repository, read it in Thunder, find your way around it, learn it,
              change it, and verify every change. The Thunder compiler is built in.
            </p>
            <p className="mt-4 text-sm">
              <a href={OPENTHUNDER_URL} className="font-medium text-gold-300 hover:text-gold-200">Open OpenThunder ↗</a>
            </p>
          </div>
        </div>
      </Section>

      {/* The heart of the language: one program, read at five levels. */}
      <FiveLevels />

      {/* Thunder Code: the proof. Any language you already have, read in Thunder. */}
      <Section id="thundered" className="border-t border-white/8">
        <SectionHeading
          eyebrow="Thunder Code"
          title="Already have code? Read it in Thunder."
          intro="Thunder works in both directions, and reading comes first: open the code you already have, including code AI wrote, and see what it does. Pick a language: the same refund rule becomes the same Thunder picture."
        />
        <div className="mt-8"><ThunderedTabs samples={SAMPLES} /></div>
        <p className="mt-6 text-sm text-haze-300">
          <span className="font-medium text-white">Thunder reads today:</span> {THUNDERED_SAMPLES.map((x) => x.label).join(", ")}.{" "}
          <Link href="/read" className="font-medium text-gold-300 hover:text-gold-200">Read your own code in Thunder →</Link>{" "}
          <Link href="/gallery" className="font-medium text-gold-300 hover:text-gold-200">See it on famous code →</Link>
        </p>
      </Section>

      {/* 2. The problem. */}
      <Section id="problem" className="border-t border-white/8">
        <SectionHeading eyebrow="The problem" title="Software got easy to write and hard to understand." />
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {PROBLEM.map((p) => (
            <li key={p.kind} className="rounded-2xl border border-white/10 bg-ink-850/40 p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-haze-400">{p.kind}</p>
              <p className="mt-3 text-lg leading-relaxed text-haze-100">{p.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* 3. The guide: empathy and authority. */}
      <Section id="guide" className="border-y border-white/8 bg-ink-900/40">
        <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <SectionHeading
              eyebrow="Your guide"
              title="Thunder is built for the person who has to understand."
              intro="Not only the person, or the model, that writes the code. Every rule is shown as a picture first, every answer comes with its reason, and every change shows what it affects. A real compiler stands behind each picture: open source, deterministic, no AI and no key."
            />
          </div>
          <dl className="grid grid-cols-3 gap-4">
            {AUTHORITY.map((f) => (
              <div key={f.label} className="rounded-2xl border border-white/10 bg-ink-850/50 p-5 text-center">
                <dt className="sr-only">{f.label}</dt>
                <dd className="text-3xl font-semibold tracking-tight text-white">{f.value}</dd>
                <dd className="mt-1 text-xs leading-snug text-haze-400">{f.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      {/* 4. The plan. */}
      <Section id="plan">
        <SectionHeading eyebrow="The plan" title="Read it. Understand it. Change it." />
        <ol className="mt-10 grid gap-4 lg:grid-cols-3">
          {PLAN.map((s) => (
            <li key={s.n} className="flex flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-6">
              <span className="grid h-8 w-8 place-items-center rounded-full border border-gold-300/50 text-sm font-semibold text-gold-200">{s.n}</span>
              <h3 className="mt-4 text-xl font-semibold tracking-tight text-white">{s.title}</h3>
              <p className="mt-2 flex-1 leading-relaxed text-haze-300">{s.body}</p>
              <Link href={s.href} className="mt-5 text-sm font-medium text-gold-300 hover:text-gold-200">{s.cta} →</Link>
            </li>
          ))}
        </ol>
      </Section>

      {/* 5. Stakes and success. */}
      <Section id="stakes" className="border-y border-white/8 bg-ink-900/40">
        <SectionHeading eyebrow="What changes" title="From hoping to knowing." />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 p-6">
            <p className="font-semibold text-haze-200">Without Thunder</p>
            <ul className="mt-4 space-y-3">{WITHOUT.map((w) => <li key={w} className="flex gap-3 text-haze-300"><span aria-hidden="true" className="text-haze-500">–</span>{w}</li>)}</ul>
          </div>
          <div className="rounded-2xl border border-gold-300/40 bg-gradient-to-b from-gold-400/[0.06] to-transparent p-6">
            <p className="font-semibold text-white">With Thunder</p>
            <ul className="mt-4 space-y-3">{WITH.map((w) => <li key={w} className="flex gap-3 text-haze-100"><span aria-hidden="true" className="text-gold-300">✦</span>{w}</li>)}</ul>
          </div>
        </div>
      </Section>

      {/* 6. Call to action: try it now, then take it to your own app in OpenThunder. */}
      <Section>
        <div className="panel relative overflow-hidden px-6 py-14 text-center sm:px-12">
          <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-[560px] -translate-x-1/2 rounded-full bg-gold-400/10 blur-[100px]" />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">Read your first rule in Thunder.</h2>
            <p className="mt-4 text-lg leading-relaxed text-haze-300">
              Ask a refund rule a question and change one word. It takes a minute and runs in your browser.
            </p>
            <div className="mt-8 flex justify-center">
              <CTAButtons primary={{ href: "/try", label: "Try it on a refund rule" }} secondary={{ href: "/learn", label: "Take the 10-minute tutorial" }} />
            </div>
            <p className="mt-5 text-sm text-haze-400">
              Want to learn Thunder in depth?{" "}
              <a href={LEARN_COURSE_URL} className="font-medium text-gold-300 hover:text-gold-200">Take the full course on Skills Tech Talk ↗</a>
            </p>
          </div>
          <div className="relative mx-auto mt-12 max-w-3xl border-t border-white/10 pt-8">
            <p className="flex items-center justify-center gap-2 font-semibold text-white"><ServiceGlyph className="text-gold-300" />See your own app in Thunder with OpenThunder, the IDE for AI-written code</p>
            <ul className="mt-6 grid gap-2 text-left text-sm sm:grid-cols-2">
              {VIEWS.map((v) => (
                <li key={v.name}>
                  <a href={v.href} className="flex items-baseline justify-between gap-3 rounded-xl border border-white/10 px-4 py-2.5 transition hover:border-gold-300/40 hover:bg-white/[0.03]">
                    <span><span className="font-semibold text-white">{v.name}</span> <span className="text-haze-400">· {v.what}</span></span>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${v.status === "Later" ? "border-dashed border-white/20 text-haze-400" : "border-white/20 text-haze-300"}`}>{v.status}</span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
              <a href="https://openthunder.dev" className="font-medium text-gold-300 hover:text-gold-200">Open OpenThunder ↗</a>
              <Link href="/roadmap" className="font-medium text-gold-300 hover:text-gold-200">See exactly what works today →</Link>
              <Link href="/install" className="font-medium text-gold-300 hover:text-gold-200">Install Thunder →</Link>
            </p>
          </div>
        </div>
        <p className="mt-14 text-center text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Thunder. <span className="text-gradient-gold">Programming, made human.</span>
        </p>
      </Section>
    </>
  );
}
