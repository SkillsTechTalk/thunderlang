import { IntentCode } from "@/components/IntentCode";
import { Section, SectionHeading } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { heroExample } from "@/lib/content";

// The deeper model behind ThunderLang. Moved from the home page (which now leads with why the
// language exists) so the ideas stay on the site for readers who want them.
const philosophy = [
  { step: "Prompt", body: "How the conversation starts. Useful, but temporary." },
  { step: "Intent", body: "What the team commits to. Durable and reviewable." },
  { step: "Contract", body: "The guarantees and constraints that must hold." },
  { step: "Plan", body: "A deterministic implementation plan, before any code." },
  { step: "Implementation", body: "Code in your target language, human or AI authored." },
  { step: "Verification", body: "Types, tests, and checks that the contract holds." },
  { step: "Proof", body: "Durable evidence that intent and reality agree." },
];

export function DeeperSections() {
  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Intent Truth: Intended / Implemented / Observed / Outcome          */}
      {/* ------------------------------------------------------------------ */}
      <Section id="truth">
        <SectionHeading
          eyebrow="Intent Truth"
          title="Four truths about the same software, and where they disagree is where risk lives."
          intro="A feature can pass every test and still fail its purpose. ThunderLang keeps these four truths separate so you can compare them honestly, rather than assuming technical success means success."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { name: "Intended", status: "available" as const, body: "What humans approved: goals, guarantees, prohibitions, and how each must be verified. This is the intent you write." },
            { name: "Implemented", status: "experimental" as const, body: "What the code actually does, recovered from source with intent lift and surfaced by the Intent Scanner." },
            { name: "Observed", status: "planned" as const, body: "What actually happens at runtime: traces, metrics, errors. Connected through OpenThunder and runtime evidence." },
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
          the scanner, runtime evidence, and the wider ecosystem connect, honestly labeled, never
          assumed.
        </p>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Prompt is temporary. Intent is durable.                            */}
      {/* ------------------------------------------------------------------ */}
      <Section id="durable">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
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

    </>
  );
}
