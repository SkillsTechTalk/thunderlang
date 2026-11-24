import Link from "next/link";
import { PageHero, Section, SectionHeading, Card, CTAButtons } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { OPENTHUNDER_URL } from "@/lib/site";
import { StepsView, type Step } from "@/app/try/StepsView";
import { PlainRuleCard } from "@/app/try/PlainRuleCard";
import { readCode } from "../../../compiler/src/read.mjs";
import { thunderText, visualFor, THUNDER_VISUAL } from "../../../compiler/src/visual.mjs";
import { JsonLd, LANGUAGE_LD } from "@/components/JsonLd";

export const metadata = pageMeta({
  title: "The Thunder Programming Language",
  description:
    "Thunder is a human-native programming language: people work with the meaning of software while machines handle most of the implementation. Thunder is the language; OpenThunder is the IDE.",
  path: "/language",
});

// A small refund feature, read by the real Thunder compiler when the site is built. Nothing below is drawn by hand.
const PYTHON = `@router.post("/refunds")
def request_refund(order, amount):
    """A customer asks for their money back."""
    if order.refunded:
        raise AlreadyRefunded("This order was already refunded")
    decision = refund_decision(amount, order.days_since_purchase <= 30)
    if decision == "Approve":
        payments.refund(order, amount)
    return decision


def refund_decision(amount: float, within_window: bool) -> str:
    """Small refunds inside the 30-day window are approved; the rest go to a person."""
    if within_window and amount <= 100:
        return "Approve"
    return "Review"
`;

// Code holds no examples. A person adds them to check the rule; the card then answers each one.
const PERSON_EXAMPLES = `
Examples
  99, within window       gives Approve   (inside the limit)
  100, within window      gives Approve   (exactly at the limit)
  101, within window      gives Review    (over the limit)
  50, not within window   gives Review    (too late)
`;

const reading = readCode(PYTHON, { language: "python" });
const endpoint = reading.items.find((i) => i.name === "request_refund")!;
const decision = reading.items.find((i) => i.name === "refund_decision")!;
const endpointText = thunderText(endpoint);
const endpointVisual = visualFor(endpoint);
const decisionText = thunderText(decision).trimEnd() + "\n" + PERSON_EXAMPLES;

const LADDER = [
  { level: "Thunder", what: "Pictures of what software does: cards, steps, maps", reader: "Anyone who needs to understand the software", human: true },
  { level: "Thunder Text", what: "The same meaning in plain, precise words", reader: "Anyone who wants the detail", human: true },
  { level: "The meaning", what: "The one reading both views are made from", reader: "The Thunder compiler and OpenThunder", human: false },
  { level: "High-level languages", what: "Java, Python, TypeScript, C#, SQL", reader: "Developers", human: false },
  { level: "Machine code", what: "Instructions for one kind of processor", reader: "Compilers and specialists", human: false },
  { level: "Bits", what: "0 and 1", reader: "Hardware", human: false },
];

const PARADIGMS = [
  { name: "Object-oriented programming", question: "How are objects and their behavior organized?" },
  { name: "Functional programming", question: "How is a computation built from functions?" },
  { name: "Intent-oriented programming", question: "What should the software do, and how do we check that it does?" },
  { name: "Human-native programming", question: "How can a person understand, direct, and change software, whatever language it is written in?" },
];

const PRINCIPLES = [
  { title: "Meaning before syntax", body: "You see what the software does (who can get a refund, what happens next), not brackets, types, and keywords." },
  { title: "Read before write", body: "Thunder works on the code you already have, in ten languages. You do not rewrite anything to start understanding it." },
  { title: "One meaning, two views", body: "The picture and Thunder Text are two views of the same reading, made from the same data. Switch between them and nothing is lost." },
  { title: "Truth before simplicity", body: "What Thunder cannot read is shown as Not read yet, with the original code. It never draws a guess to make a picture look complete." },
  { title: "People stay in charge", body: "AI can write most of the code. People read what it does, decide what it should do, and every change is checked before it ships." },
];

const STATUS_LABEL = { available: "Works today", partial: "Some languages", planned: "Planned" } as const;

export default function LanguagePage() {
  const languages = Object.values(THUNDER_VISUAL.languages);
  return (
    <>
      <JsonLd data={LANGUAGE_LD} />
      <PageHero
        eyebrow="Human-Native Programming"
        title="The Thunder Programming Language"
        intro="Thunder is a human-native programming language. People work with the meaning of software, and machines handle most of the implementation. You read and change software in pictures and plain words, whatever language it is written in."
      >
        <CTAButtons
          primary={{ href: "/read", label: "Read your code in Thunder" }}
          secondary={{ href: "/docs/spec", label: "Read the specification" }}
        />
      </PageHero>

      {/* The most important distinction on the site: the language and the IDE. */}
      <Section className="!pt-0">
        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wider text-gold-300">The language</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Thunder</h2>
            <p className="mt-2 text-sm leading-relaxed text-haze-300">
              What software means, as pictures (Thunder) and plain words (Thunder Text). The open-source Thunder compiler
              reads code into Thunder in your browser, your terminal, and VS Code. Also called ThunderLang.
            </p>
            <p className="mt-4 text-sm"><Link href="/read" className="font-medium text-gold-300 hover:text-gold-200">Read a file in Thunder →</Link></p>
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wider text-gold-300">The IDE</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">OpenThunder</h2>
            <p className="mt-2 text-sm leading-relaxed text-haze-300">
              Where you use Thunder on your whole application: open a repository, read it in Thunder, find your way from
              the big picture to one rule, change it, and check every change before it ships.
            </p>
            <p className="mt-4 text-sm"><a href={OPENTHUNDER_URL} className="font-medium text-gold-300 hover:text-gold-200">Open your app in OpenThunder ↗</a></p>
          </Card>
        </div>
      </Section>

      {/* The whole stack at a glance (founder's wording, 2026-11-23). */}
      <Section className="!pt-0">
        <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 p-6">
          <p className="text-center text-2xl font-semibold text-white">Thunder</p>
          <p className="text-center text-haze-300">Programming, made human.</p>
          <dl className="mt-5 divide-y divide-white/8 text-sm">
            {[
              ["Paradigm", "Human-Native Programming", "/language"],
              ["Visual interface", "Thunder", "/read"],
              ["Text representation", "Thunder Text", "/docs/spec"],
              ["Underlying method", "Intent-Oriented Programming", "/docs/intent-oriented-programming"],
              ["Development platform", "OpenThunder, the IDE", OPENTHUNDER_URL],
            ].map(([term, value, href]) => (
              <div key={term} className="grid grid-cols-[11rem_1fr] gap-4 py-2.5">
                <dt className="text-haze-400">{term}</dt>
                <dd>{href.startsWith("http") ? <a href={href} className="font-medium text-white hover:text-gold-200">{value} ↗</a> : <Link href={href} className="font-medium text-white hover:text-gold-200">{value}</Link>}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <Section className="border-t border-white/8">
        <SectionHeading
          eyebrow="Why a new paradigm"
          title="Programming languages were written for computers. Thunder is written for people."
          intro="Every step up this ladder let people say more and handle less detail. High-level languages were a huge step, but they are still instructions for a computer that people have to learn to read. Now that AI writes most new code, the bottleneck is no longer writing it. It is understanding it."
        />
        <ol className="mx-auto mt-10 max-w-3xl space-y-2" aria-label="From bits to Thunder">
          {LADDER.map((r) => (
            <li key={r.level} className={`grid gap-1 rounded-xl border px-4 py-3 sm:grid-cols-[11rem_1fr_13rem] sm:items-center sm:gap-4 ${r.human ? "border-gold-300/40 bg-gold-400/[0.06]" : "border-white/10"}`}>
              <span className={`font-semibold ${r.human ? "text-gold-200" : "text-white"}`}>{r.level}</span>
              <span className="text-sm text-haze-200">{r.what}</span>
              <span className="text-xs text-haze-400">Read by: {r.reader}</span>
            </li>
          ))}
        </ol>
        <p className="mx-auto mt-4 max-w-3xl text-sm text-haze-400">
          The two highlighted rows are human-native, and both are views of the same meaning. Everything below still exists
          and still runs; AI writes much of it, and Thunder lets people see what it does.
        </p>
      </Section>

      <Section className="border-t border-white/8 bg-ink-900/40">
        <SectionHeading
          eyebrow="Why “human-native”"
          title="Each paradigm answers a different question."
          intro="A paradigm is a way of thinking about programs. Human-native programming starts from the person who has to understand the software, not from the machine that runs it."
        />
        <div className="mx-auto mt-8 max-w-3xl overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-haze-400"><tr><th className="py-2 pr-4 font-medium">Paradigm</th><th className="py-2 font-medium">The question it answers</th></tr></thead>
            <tbody>
              {PARADIGMS.map((p) => (
                <tr key={p.name} className="border-t border-white/8">
                  <td className={`py-3 pr-4 font-medium ${p.name.startsWith("Human") ? "text-gold-200" : "text-white"}`}>{p.name}</td>
                  <td className="py-3 text-haze-200">{p.question}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
          <Card>
            <h3 className="font-semibold text-white">Not prompting in English</h3>
            <p className="mt-2 text-sm leading-relaxed text-haze-300">
              Natural-language programming turns English into code, and English is ambiguous. Thunder goes the other way:
              it reads real code exactly, with no AI, and shows what it does. The same code always gives the same Thunder.
            </p>
          </Card>
          <Card>
            <h3 className="font-semibold text-white">Not no-code</h3>
            <p className="mt-2 text-sm leading-relaxed text-haze-300">
              Your software stays real code in a real language, and that code stays the source of truth. Thunder is how
              people read it, question it, and change it safely.
            </p>
          </Card>
        </div>
        <p className="mx-auto mt-6 max-w-3xl text-sm text-haze-400">
          Intent-oriented programming, ThunderLang&apos;s earlier focus, is the method underneath: state what software should
          do and check that it does. <Link href="/docs/intent-oriented-programming" className="text-gold-300 hover:text-gold-200">How it fits</Link>.
        </p>
      </Section>

      <Section className="border-t border-white/8">
        <SectionHeading
          eyebrow="One meaning, two views"
          title="The same refund feature: the code, the picture, and Thunder Text."
          intro="Read by the Thunder compiler from the Python below when this page was built. Nothing is drawn by hand. The picture is what most people read; Thunder Text says exactly the same thing in words."
        />
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-haze-300">The original code (Python)</p>
            <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-[13px] leading-relaxed text-haze-100"><code>{PYTHON}</code></pre>
          </div>
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-ink-850/40 p-5">
              {endpointVisual.badge && <p className="text-xs font-semibold uppercase tracking-wider text-[#FCD34D]">{endpointVisual.badge.text}</p>}
              <p className="mt-1 text-base font-semibold text-white">{endpointVisual.title}</p>
              {endpoint.doc && <p className="mt-2 text-sm text-haze-300"><span className="text-haze-400">Author&apos;s note:</span> “{endpoint.doc}”</p>}
              <div className="mt-4"><StepsView steps={(endpoint.steps ?? []) as Step[]} /></div>
            </div>
            <div>
              <PlainRuleCard ask="What happens to this refund?" initialSource={decisionText} breadcrumb={["Refunds", "refund_decision"]} />
              <p className="mt-2 text-xs text-haze-400">The examples were added by a person to check the rule. Code has no examples; the rule itself was read from the code.</p>
            </div>
          </div>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-haze-300">Thunder Text: the endpoint</p>
            <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-4 font-mono text-[13px] leading-relaxed text-haze-100"><code>{endpointText}</code></pre>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-haze-300">Thunder Text: the rule</p>
            <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-4 font-mono text-[13px] leading-relaxed text-haze-100"><code>{decisionText}</code></pre>
          </div>
        </div>
      </Section>

      <Section className="border-t border-white/8 bg-ink-900/40">
        <SectionHeading eyebrow="Principles" title="Five rules every Thunder view follows." />
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {PRINCIPLES.map((p, i) => (
            <Card key={p.title}>
              <p className="text-xs font-semibold text-gold-300">{i + 1}</p>
              <h3 className="mt-1 text-lg font-semibold text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-haze-300">{p.body}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section className="border-t border-white/8">
        <SectionHeading
          eyebrow="The bar we hold ourselves to"
          title="A 12-year-old can explain what a simple program does. An architect can check whether it is right."
          intro="Both, in the same language, without hiding complexity or presenting a guess as a fact. This is our design goal. We have not yet measured it with a study; when we do, the results will be published here."
        />
      </Section>

      <Section className="border-t border-white/8 bg-ink-900/40">
        <SectionHeading
          eyebrow="What works today"
          title="Thunder V1 reads ten languages. SQL is next."
          intro="Thunder is written down in the Thunder V1 specification. The status below comes from the same data the compiler and OpenThunder use, so it cannot drift from what actually works."
        />
        <ul className="mx-auto mt-8 grid max-w-3xl gap-2 sm:grid-cols-2">
          {languages.map((l) => (
            <li key={l.name} className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-2.5 text-sm">
              <span className="font-medium text-white">{l.name}</span>
              <span className={l.status === "available" ? "text-haze-200" : "rounded-full border border-dashed border-white/25 px-2 py-0.5 text-xs text-haze-400"}>{STATUS_LABEL[l.status as keyof typeof STATUS_LABEL]}</span>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex justify-center">
          <CTAButtons
            primary={{ href: "/docs/spec", label: "Read the Thunder V1 specification" }}
            secondary={{ href: "/learn", label: "Take the tutorial" }}
          />
        </div>
      </Section>
    </>
  );
}
