import { PageHero, Section, Card, DraftNote, CTAButtons } from "@/components/ui";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Vision",
  description:
    "The vision behind IntentLang, the first Intent-Oriented Programming language for the AI era, built by SkillsTech to help engineers describe, verify, and own software.",
  path: "/vision",
});

const beliefs = [
  {
    title: "Intent is the most valuable artifact",
    body: "The scarcest thing in software is a clear, durable record of what the system is supposed to do and why. Code captures the how; intent is usually lost. Intent-Oriented Programming makes that record the primary source.",
  },
  {
    title: "AI changes the economics of code, not of understanding",
    body: "Generating code is becoming cheap. Understanding, trusting, and owning it is not. When machines write more, humans need better ways to state and verify what should be true.",
  },
  {
    title: "Verification belongs in the language",
    body: "Guarantees should live next to intent, not scattered across tests and tickets. When contracts are first-class, tools can check that implementation and intent actually agree.",
  },
  {
    title: "Engineers stay the owners",
    body: "IntentLang is not about handing control to a model. It is about giving engineers a clearer, more defensible way to express, review, and own the software they are responsible for.",
  },
];

export default function VisionPage() {
  return (
    <>
      <PageHero
        eyebrow="The Vision"
        title="A language where you write what software should do, and prove that it does."
        intro="IntentLang is the first Intent-Oriented Programming language for the AI era. It is built on a simple bet: as AI writes more code, the leverage moves to whoever can state intent clearly and verify it faithfully."
      >
        <CTAButtons
          primary={{ href: "/waitlist", label: "Join the Waitlist" }}
          secondary={{ href: "/examples", label: "View Examples" }}
        />
      </PageHero>

      <Section>
        <div className="mx-auto max-w-prose space-y-6 text-lg leading-relaxed text-haze-200">
          <p>
            For decades, programming has meant committing to{" "}
            <em className="text-white not-italic">how</em> before we have fully
            agreed on <em className="text-white not-italic">what</em>. The intent
            behind a system (its goals, constraints, and guarantees) ends up
            scattered across code, comments, tickets, and the memory of whoever
            was in the room.
          </p>
          <p>
            AI has changed the pace but not the problem. Models can now generate
            code faster than any team can read and review it. Speed without a
            clear, verifiable statement of intent is how software quietly drifts
            away from what it was meant to do.
          </p>
          <p>
            IntentLang flips the order. You describe what the software should do, why
            it exists, which constraints matter, and how it should be verified.
            AI and the compiler help determine how to build it, while the
            contracts you wrote keep everyone, human and machine, honest.
          </p>
        </div>
      </Section>

      <Section className="border-y border-white/8 bg-ink-900/40">
        <div className="grid gap-5 md:grid-cols-2">
          {beliefs.map((b) => (
            <Card key={b.title}>
              <h3 className="text-lg font-semibold text-white">{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-haze-300">
                {b.body}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      <Section>
        <div className="mx-auto max-w-prose">
          <h2 className="text-2xl font-semibold text-white">
            What we are not claiming
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-haze-300">
            IntentLang is early. It is not production-ready, it is not magic, and it
            does not claim to outperform Rust, Go, Python, Java, TypeScript, or
            .NET today. It targets those languages and aims to make the intent
            behind your software explicit, reviewable, and verifiable.
          </p>
          <div className="mt-6">
            <DraftNote>
              Everything on this site is forward-looking and subject to change.
              Treat syntax and features as a shared draft, not a promise.
            </DraftNote>
          </div>
        </div>
      </Section>
    </>
  );
}
